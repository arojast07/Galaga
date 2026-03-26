/**
 * onlineSync.js
 * Sincronizacion host-authoritative via Supabase Realtime Broadcast.
 *
 * GUEST: snapshot buffer + interpolacion temporal para todas las entidades.
 * HOST: 30 snapshots/s con jugadores, enemigos Y balas.
 *
 * Render delay: 100ms — permite interpolar entre 2-3 snapshots consecutivos.
 */

var OnlineSync = (function() {
  var _db         = supabaseClient;
  var _roomId     = null;
  var _slot       = null;
  var _channel    = null;
  var _snapshotCb = null;
  var _inputCb    = null;

  var RENDER_DELAY      = 100;
  var BUFFER_MAX        = 32;
  var SNAPSHOT_INTERVAL = 33;   // ~30/s
  var INPUT_INTERVAL    = 50;   // 20/s max

  var _snapshotBuffer = [];
  var _lastSnapshot   = 0;
  var _lastInput      = 0;
  var _prevLeft  = false;
  var _prevRight = false;
  var _prevFire  = false;

  // ── Init ───────────────────────────────────────────────────────────────

  function init(roomId, slot, scene) {
    _roomId         = roomId;
    _slot           = slot;
    _snapshotCb     = null;
    _inputCb        = null;
    _snapshotBuffer = [];
    _lastSnapshot   = 0;
    _lastInput      = 0;
    _prevLeft = _prevRight = _prevFire = false;

    console.log('[ONLINE] sync initialized. slot:', slot);
    console.log('[ONLINE] render delay ms:', RENDER_DELAY);
    console.log('[ONLINE] snapshot rate host: 30/s');

    _channel = _db
      .channel('game_' + roomId, {
        config: { broadcast: { self: false, ack: false } },
      })
      .on('broadcast', { event: 'snapshot' }, function(msg) {
        if (!msg.payload) return;
        var t = (msg.payload.t && typeof msg.payload.t === 'number')
          ? msg.payload.t : Date.now();
        _snapshotBuffer.push({ t: t, state: msg.payload });
        if (_snapshotBuffer.length > 1) {
          var last = _snapshotBuffer[_snapshotBuffer.length - 1];
          var prev = _snapshotBuffer[_snapshotBuffer.length - 2];
          if (last.t < prev.t) {
            _snapshotBuffer.sort(function(a, b) { return a.t - b.t; });
          }
        }
        if (_snapshotBuffer.length > BUFFER_MAX) _snapshotBuffer.shift();
        if (_snapshotCb) _snapshotCb(msg.payload);
      })
      .on('broadcast', { event: 'input' }, function(msg) {
        if (_inputCb && msg.payload) _inputCb(msg.payload);
      })
      .subscribe(function(status) {
        console.log('[ONLINE] channel subscribed:', status);
        if (status === 'CHANNEL_ERROR') console.warn('[ONLINE] fallback detected');
      });
  }

  // ── Interpolacion temporal ─────────────────────────────────────────────

  function getInterpolatedState() {
    if (_snapshotBuffer.length === 0) return null;

    var renderTime = Date.now() - RENDER_DELAY;
    var last = _snapshotBuffer[_snapshotBuffer.length - 1];

    if (_snapshotBuffer.length === 1) return last.state;

    var a = null, b = null;
    for (var i = 0; i < _snapshotBuffer.length - 1; i++) {
      if (_snapshotBuffer[i].t <= renderTime && _snapshotBuffer[i + 1].t >= renderTime) {
        a = _snapshotBuffer[i];
        b = _snapshotBuffer[i + 1];
        break;
      }
    }

    if (!a && _snapshotBuffer[0].t > renderTime) return _snapshotBuffer[0].state;

    if (!a) {
      // Extrapolacion corta (max 80ms) usando los dos ultimos snapshots
      var prev = _snapshotBuffer[_snapshotBuffer.length - 2];
      var span = last.t - prev.t;
      if (span > 0 && span < 200) {
        var overrun = renderTime - last.t;
        if (overrun > 0 && overrun < 80) {
          return _interpolateStates(prev.state, last.state, 1 + overrun / span);
        }
      }
      return last.state;
    }

    var spanAB = b.t - a.t;
    var alpha  = spanAB > 0 ? (renderTime - a.t) / spanAB : 1;
    alpha = Math.max(0, Math.min(1.2, alpha)); // permitir leve extrapolacion
    return _interpolateStates(a.state, b.state, alpha);
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  function _interpolateStates(sa, sb, alpha) {
    var result = {
      wave:     sb.wave,
      score:    sb.score,
      gameOver: sb.gameOver,
      players:  [],
      enemies:  [],
      bullets:  [],
    };

    // Jugadores
    var maxP = Math.max(
      sa.players ? sa.players.length : 0,
      sb.players ? sb.players.length : 0
    );
    for (var i = 0; i < maxP; i++) {
      var pa = sa.players && sa.players[i];
      var pb = sb.players && sb.players[i];
      if (!pa && !pb) continue;
      if (!pa) { result.players.push(pb); continue; }
      if (!pb) { result.players.push(pa); continue; }
      result.players.push({
        x:            _lerp(pa.x, pb.x, alpha),
        y:            _lerp(pa.y, pb.y, alpha),
        lives:        pb.lives,
        isDead:       pb.isDead,
        isInvincible: pb.isInvincible,
        visible:      pb.visible,
      });
    }

    // Enemigos — interpolados por indice (orden estable en formacion)
    var maxE = Math.max(
      sa.enemies ? sa.enemies.length : 0,
      sb.enemies ? sb.enemies.length : 0
    );
    for (var j = 0; j < maxE; j++) {
      var ea = sa.enemies && sa.enemies[j];
      var eb = sb.enemies && sb.enemies[j];
      if (!ea && !eb) continue;
      if (!ea) { result.enemies.push(eb); continue; }
      if (!eb) { result.enemies.push(ea); continue; }
      result.enemies.push({
        x:      _lerp(ea.x, eb.x, alpha),
        y:      _lerp(ea.y, eb.y, alpha),
        hp:     eb.hp,
        type:   eb.type,
        active: eb.active,
      });
    }

    // Balas — interpoladas por id estable
    // Construir mapa de balas de B para busqueda rapida
    var bBulletMap = {};
    if (sb.bullets) {
      for (var k = 0; k < sb.bullets.length; k++) {
        bBulletMap[sb.bullets[k].id] = sb.bullets[k];
      }
    }
    if (sa.bullets) {
      for (var m = 0; m < sa.bullets.length; m++) {
        var ba = sa.bullets[m];
        var bb = bBulletMap[ba.id];
        if (bb) {
          // Bala presente en ambos snapshots: interpolar
          result.bullets.push({
            id:    ba.id,
            x:     _lerp(ba.x, bb.x, alpha),
            y:     _lerp(ba.y, bb.y, alpha),
            owner: bb.owner,
          });
          delete bBulletMap[ba.id];
        } else {
          // Bala solo en A: extrapolacion corta con velocidad
          if (ba.vx !== undefined && ba.vy !== undefined) {
            var dt = (b ? (b.t - a.t) : 50) * alpha / 1000;
            result.bullets.push({
              id:    ba.id,
              x:     ba.x + ba.vx * dt,
              y:     ba.y + ba.vy * dt,
              owner: ba.owner,
            });
          }
        }
      }
    }
    // Balas nuevas en B que no estaban en A
    for (var id in bBulletMap) {
      result.bullets.push(bBulletMap[id]);
    }

    return result;
  }

  // ── Publicar snapshot (HOST) ───────────────────────────────────────────

  function publishSnapshot(state) {
    if (!_channel || !_roomId) return;
    var now = Date.now();
    if (now - _lastSnapshot < SNAPSHOT_INTERVAL) return;
    _lastSnapshot = now;
    state.t = now;
    try {
      _channel.send({ type: 'broadcast', event: 'snapshot', payload: state });
    } catch (e) {
      console.warn('[ONLINE] error enviando snapshot:', e.message);
    }
  }

  // ── Enviar input (GUEST) ───────────────────────────────────────────────

  function sendInput(left, right, fire) {
    if (!_channel || !_roomId) return;
    var now     = Date.now();
    var changed = (left !== _prevLeft || right !== _prevRight || fire !== _prevFire);
    var elapsed = (now - _lastInput) >= INPUT_INTERVAL;
    if (!changed && !elapsed) return;
    _prevLeft = left; _prevRight = right; _prevFire = fire;
    _lastInput = now;
    try {
      _channel.send({ type: 'broadcast', event: 'input', payload: { left: left, right: right, fire: fire } });
    } catch (e) {
      console.warn('[ONLINE] error enviando input:', e.message);
    }
  }

  function onSnapshot(callback) { _snapshotCb = callback; }
  function onInput(callback)    { _inputCb    = callback; }

  function destroy() {
    console.log('[ONLINE] sync destroyed');
    if (_channel) { _db.removeChannel(_channel); _channel = null; }
    _snapshotBuffer = [];
    _roomId = _slot = _snapshotCb = _inputCb = null;
  }

  return {
    init:                 init,
    publishSnapshot:      publishSnapshot,
    sendInput:            sendInput,
    onSnapshot:           onSnapshot,
    onInput:              onInput,
    getInterpolatedState: getInterpolatedState,
    destroy:              destroy,
  };
})();
