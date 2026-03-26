/**
 * onlineSync.js
 * Sincronizacion host-authoritative via Supabase Realtime Broadcast.
 *
 * GUEST: snapshot buffer + interpolacion temporal para todas las entidades.
 * HOST: ~30 snapshots/s compactos (_v:2): p, e, pb, eb.
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

  var RENDER_DELAY      = 66;   // 2 frames a 30/s — balance fluidez/latencia
  var BUFFER_MAX        = 32;
  var SNAPSHOT_INTERVAL = 33;   // ~30/s
  var INPUT_INTERVAL    = 50;   // 20/s max

  var SNAPSHOT_V2       = 2;

  var _snapshotBuffer = [];
  var _lastSnapshot   = 0;
  var _lastInput      = 0;
  var _prevLeft  = false;
  var _prevRight = false;
  var _prevFire  = false;
  var _clockOffsetMs = 0;

  var _hostLogTick    = 0;
  var _guestV2Noticed = false;

  var TYPE_FROM_CODE = ['basic', 'fast', 'tough', 'miniboss'];

  // ── Normalizacion payload compacto -> forma interna (interpolacion) ───

  function _expandCompactV2(raw) {
    var players = [];
    for (var i = 0; raw.p && i < raw.p.length; i++) {
      var row = raw.p[i];
      var f = (row[3] | 0);
      players.push({
        x: row[0],
        y: row[1],
        lives: row[2],
        isDead: !!(f & 1),
        isInvincible: !!(f & 2),
        visible: !!(f & 4),
      });
    }

    var enemies = [];
    for (var j = 0; raw.e && j < raw.e.length; j++) {
      var er = raw.e[j];
      var typ = (er.length > 4 && er[4] !== undefined && er[4] !== null)
        ? TYPE_FROM_CODE[er[4]] || null
        : null;
      enemies.push({
        id: er[0],
        x: er[1],
        y: er[2],
        hp: er[3],
        type: typ,
        active: true,
      });
    }

    var bullets = [];
    for (var pb = 0; raw.pb && pb < raw.pb.length; pb++) {
      var b = raw.pb[pb];
      var po = (b.length > 3 && b[3] !== undefined) ? b[3] : 0;
      var own = (po === 1) ? 'player2' : 'player1';
      bullets.push({
        id: b[0],
        x: b[1],
        y: b[2],
        owner: own,
        vx: 0,
        vy: -520,
      });
    }
    for (var eb = 0; raw.eb && eb < raw.eb.length; eb++) {
      var be = raw.eb[eb];
      bullets.push({
        id: be[0],
        x: be[1],
        y: be[2],
        owner: 'enemy',
        vx: 0,
        vy: 300,
      });
    }

    return {
      t: raw.t,
      _v: SNAPSHOT_V2,
      wave: raw.w,
      score: raw.s,
      gameOver: !!raw.g,
      players: players,
      enemies: enemies,
      bullets: bullets,
    };
  }

  function _incomingToNormalized(payload) {
    if (!payload) return null;
    if (payload._v === SNAPSHOT_V2 && payload.p) {
      return _expandCompactV2(payload);
    }
    if (!payload.bullets) payload.bullets = [];
    for (var bi = 0; bi < payload.bullets.length; bi++) {
      var bl = payload.bullets[bi];
      if (!bl) continue;
      if (bl.vx === undefined) bl.vx = 0;
      if (bl.vy === undefined) bl.vy = (bl.owner === 'enemy') ? 300 : -520;
    }
    return payload;
  }

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
    _clockOffsetMs  = 0;
    _guestV2Noticed = false;
    _hostLogTick    = 0;

    console.log('[ONLINE] sync initialized. slot:', slot);
    console.log('[ONLINE] render delay ms:', RENDER_DELAY);
    console.log('[ONLINE] snapshot rate host: ~30/s');

    _channel = _db
      .channel('game_' + roomId, {
        config: { broadcast: { self: false, ack: false } },
      })
      .on('broadcast', { event: 'snapshot' }, function(msg) {
        if (!msg.payload) return;
        var raw = msg.payload;
        var t = (raw.t && typeof raw.t === 'number')
          ? raw.t : Date.now();
        var nowLocal = Date.now();
        var sampleOffset = t - nowLocal;
        _clockOffsetMs = (_clockOffsetMs * 0.9) + (sampleOffset * 0.1);

        var normalized = _incomingToNormalized(raw);
        if (normalized) normalized.t = t;

        if (!_guestV2Noticed && raw._v === SNAPSHOT_V2) {
          _guestV2Noticed = true;
          console.log('[ONLINE] payload optimized');
        }

        _snapshotBuffer.push({ t: t, state: normalized });
        if (_snapshotBuffer.length > 1) {
          var last = _snapshotBuffer[_snapshotBuffer.length - 1];
          var prev = _snapshotBuffer[_snapshotBuffer.length - 2];
          if (last.t < prev.t) {
            _snapshotBuffer.sort(function(a, b) { return a.t - b.t; });
          }
        }
        if (_snapshotBuffer.length > BUFFER_MAX) _snapshotBuffer.shift();
        if (_snapshotCb) _snapshotCb(normalized);
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

    var renderTime = (Date.now() + _clockOffsetMs) - RENDER_DELAY;
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
      var prev = _snapshotBuffer[_snapshotBuffer.length - 2];
      var span = last.t - prev.t;
      if (span > 0 && span < 200) {
        var overrun = renderTime - last.t;
        if (overrun > 0 && overrun < 80) {
          return _interpolateStates(prev.state, last.state, 1 + overrun / span, prev.t, last.t, renderTime);
        }
      }
      return last.state;
    }

    var spanAB = b.t - a.t;
    var alpha  = spanAB > 0 ? (renderTime - a.t) / spanAB : 1;
    alpha = Math.max(0, Math.min(1.2, alpha));
    return _interpolateStates(a.state, b.state, alpha, a.t, b.t, renderTime);
  }

  function _lerp(x0, x1, t) { return x0 + (x1 - x0) * t; }

  /** Interpolacion por id para enemigos y balas; jugadores por indice. */
  function _interpolateStates(sa, sb, alpha, tA, tB, renderTime) {
    var result = {
      wave:     sb.wave,
      score:    sb.score,
      gameOver: sb.gameOver,
      players:  [],
      enemies:  [],
      bullets:  [],
    };

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

    var mapEa = {}, mapEb = {};
    if (sa.enemies) {
      for (var je = 0; je < sa.enemies.length; je++) {
        var ea = sa.enemies[je];
        if (ea && ea.id !== undefined && ea.id !== null) mapEa[ea.id] = ea;
      }
    }
    if (sb.enemies) {
      for (var ke = 0; ke < sb.enemies.length; ke++) {
        var eb = sb.enemies[ke];
        if (eb && eb.id !== undefined && eb.id !== null) mapEb[eb.id] = eb;
      }
    }
    var eids = {};
    for (var ida in mapEa) eids[ida] = true;
    for (var idb in mapEb) eids[idb] = true;
    for (var eid in eids) {
      var exa = mapEa[eid], exb = mapEb[eid];
      if (!exa && !exb) continue;
      if (!exa) { result.enemies.push(exb); continue; }
      if (!exb) { result.enemies.push(exa); continue; }
      result.enemies.push({
        id:     eid,
        x:      _lerp(exa.x, exb.x, alpha),
        y:      _lerp(exa.y, exb.y, alpha),
        hp:     exb.hp,
        type:   exb.type,
        active: exb.active !== false,
      });
    }

    var bBulletMap = {};
    if (sb.bullets) {
      for (var kb = 0; kb < sb.bullets.length; kb++) {
        bBulletMap[sb.bullets[kb].id] = sb.bullets[kb];
      }
    }
    if (sa.bullets) {
      for (var mb = 0; mb < sa.bullets.length; mb++) {
        var ba = sa.bullets[mb];
        var bb = bBulletMap[ba.id];
        if (bb) {
          var spanBt = tB - tA;
          var extra = (spanBt > 0 && spanBt < 200 && (ba.vx !== undefined || ba.vy !== undefined))
            ? Math.min(1.05, alpha + 0.04)
            : alpha;
          result.bullets.push({
            id:    ba.id,
            x:     _lerp(ba.x, bb.x, extra),
            y:     _lerp(ba.y, bb.y, extra),
            owner: bb.owner,
            vx:    bb.vx,
            vy:    bb.vy,
          });
          delete bBulletMap[ba.id];
        } else {
          if (ba.vx !== undefined && ba.vy !== undefined) {
            var dt = (tB && tA ? (tB - tA) : 33) * alpha / 1000;
            result.bullets.push({
              id:    ba.id,
              x:     ba.x + ba.vx * dt,
              y:     ba.y + ba.vy * dt,
              owner: ba.owner,
              vx:    ba.vx,
              vy:    ba.vy,
            });
          }
        }
      }
    }
    for (var bid in bBulletMap) {
      result.bullets.push(bBulletMap[bid]);
    }

    return result;
  }

  // ── Publicar snapshot (HOST) — compacto _v:2 ────────────────────────────

  function publishSnapshot(state) {
    if (!_channel || !_roomId) return;
    var now = Date.now();
    if (now - _lastSnapshot < SNAPSHOT_INTERVAL) return;
    _lastSnapshot = now;
    state.t = now;
    try {
      if (state._v === SNAPSHOT_V2) {
        var approx = JSON.stringify(state).length;
        if (_hostLogTick++ % 45 === 0) {
          console.log('[ONLINE] snapshot bytes approx:', approx);
          console.log('[ONLINE] active enemies:', state.e ? state.e.length : 0);
          console.log('[ONLINE] active player bullets:', state.pb ? state.pb.length : 0);
          console.log('[ONLINE] active enemy bullets:', state.eb ? state.eb.length : 0);
        }
      }
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
    SNAPSHOT_V2:          SNAPSHOT_V2,
  };
})();
