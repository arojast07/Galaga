/**
 * onlineSync.js
 * Sincronizacion host-authoritative via Supabase Realtime Broadcast.
 *
 * GUEST usa snapshot buffer + interpolacion temporal:
 *   - Guarda los ultimos N snapshots con timestamp
 *   - Renderiza con RENDER_DELAY ms de retraso
 *   - Interpola entre snapshot A y B segun tiempo de render
 *   - Resultado: movimiento continuo sin saltos aunque lleguen 20 paquetes/s
 *
 * HOST envia 20 snapshots/s con velocidades (vx/vy) para mejor extrapolacion.
 */

var OnlineSync = (function() {
  var _db         = supabaseClient;
  var _roomId     = null;
  var _slot       = null;
  var _channel    = null;
  var _snapshotCb = null;
  var _inputCb    = null;

  // ── Snapshot buffer (solo guest) ───────────────────────────────────────
  var RENDER_DELAY    = 100;   // ms — equilibrio fluidez/latencia percibida
  var BUFFER_MAX      = 24;    // buffer mas grande para 25/s
  var _snapshotBuffer = [];

  // ── Throttle ───────────────────────────────────────────────────────────
  var SNAPSHOT_INTERVAL = 40;  // 25/s — mas puntos de interpolacion
  var INPUT_INTERVAL    = 50;  // 20/s maximo para inputs
  var _lastSnapshot     = 0;
  var _lastInput        = 0;
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
    console.log('[ONLINE] snapshot rate host: 25/s');

    _channel = _db
      .channel('game_' + roomId, {
        config: { broadcast: { self: false, ack: false } },
      })
      .on('broadcast', { event: 'snapshot' }, function(msg) {
        if (!msg.payload) return;
        // Usar timestamp del host si existe, sino timestamp de llegada
        // El timestamp del host es mas preciso para interpolacion temporal
        var t = (msg.payload.t && typeof msg.payload.t === 'number')
          ? msg.payload.t
          : Date.now();
        var entry = { t: t, state: msg.payload };
        _snapshotBuffer.push(entry);
        // Mantener buffer ordenado por tiempo (por si llegan desordenados)
        if (_snapshotBuffer.length > 1 && _snapshotBuffer[_snapshotBuffer.length - 1].t < _snapshotBuffer[_snapshotBuffer.length - 2].t) {
          _snapshotBuffer.sort(function(a, b) { return a.t - b.t; });
        }
        if (_snapshotBuffer.length > BUFFER_MAX) {
          _snapshotBuffer.shift();
        }
        if (_snapshotCb) _snapshotCb(msg.payload);
      })
      .on('broadcast', { event: 'input' }, function(msg) {
        if (_inputCb && msg.payload) _inputCb(msg.payload);
      })
      .subscribe(function(status) {
        console.log('[ONLINE] channel subscribed:', status);
        if (status === 'CHANNEL_ERROR') {
          console.warn('[ONLINE] fallback detected');
        }
      });
  }

  // ── Snapshot buffer: obtener estado interpolado para el tiempo de render ──

  /**
   * Devuelve el estado interpolado para el tiempo (ahora - RENDER_DELAY).
   * Busca dos snapshots A y B tal que A.t <= renderTime <= B.t
   * y devuelve la interpolacion lineal entre ellos.
   * Si no hay suficientes snapshots, devuelve el mas reciente disponible.
   *
   * @returns {object|null}  estado interpolado o null si no hay datos
   */
  function getInterpolatedState() {
    if (_snapshotBuffer.length === 0) return null;

    var renderTime = Date.now() - RENDER_DELAY;
    var last = _snapshotBuffer[_snapshotBuffer.length - 1];

    // Si solo hay un snapshot, devolverlo directamente
    if (_snapshotBuffer.length === 1) return last.state;

    // Buscar par A, B que rodee renderTime
    var a = null, b = null;
    for (var i = 0; i < _snapshotBuffer.length - 1; i++) {
      if (_snapshotBuffer[i].t <= renderTime && _snapshotBuffer[i + 1].t >= renderTime) {
        a = _snapshotBuffer[i];
        b = _snapshotBuffer[i + 1];
        break;
      }
    }

    // renderTime antes del primer snapshot: usar el primero
    if (!a && _snapshotBuffer[0].t > renderTime) {
      return _snapshotBuffer[0].state;
    }

    // renderTime despues del ultimo snapshot: extrapolacion corta (max 80ms)
    if (!a) {
      var prev = _snapshotBuffer[_snapshotBuffer.length - 2];
      var span = last.t - prev.t;
      if (span > 0 && span < 200) {
        var overrun = renderTime - last.t;
        // Solo extrapolar si el overrun es razonable (< 80ms)
        if (overrun > 0 && overrun < 80) {
          var extraAlpha = overrun / span;
          return _interpolateStates(prev.state, last.state, 1 + extraAlpha);
        }
      }
      return last.state;
    }

    // Interpolacion normal entre A y B
    var spanAB = b.t - a.t;
    var alpha  = spanAB > 0 ? (renderTime - a.t) / spanAB : 1;
    alpha = Math.max(0, Math.min(1, alpha));
    return _interpolateStates(a.state, b.state, alpha);
  }

  function _interpolateStates(sa, sb, alpha) {
    var result = {
      wave:     sb.wave,
      score:    sb.score,
      gameOver: sb.gameOver,
      players:  [],
      enemies:  [],
    };

    // Interpolar jugadores
    var maxP = Math.max(sa.players ? sa.players.length : 0, sb.players ? sb.players.length : 0);
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

    // Interpolar enemigos
    var maxE = Math.max(sa.enemies ? sa.enemies.length : 0, sb.enemies ? sb.enemies.length : 0);
    for (var j = 0; j < maxE; j++) {
      var ea = sa.enemies && sa.enemies[j];
      var eb = sb.enemies && sb.enemies[j];
      if (!ea && !eb) continue;
      if (!ea) { result.enemies.push(eb); continue; }
      if (!eb) { result.enemies.push(ea); continue; }
      result.enemies.push({
        x:    _lerp(ea.x, eb.x, alpha),
        y:    _lerp(ea.y, eb.y, alpha),
        hp:   eb.hp,
        type: eb.type,
      });
    }

    return result;
  }

  function _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // ── Publicar snapshot (HOST) ───────────────────────────────────────────

  function publishSnapshot(state) {
    if (!_channel || !_roomId) return;
    var now = Date.now();
    if (now - _lastSnapshot < SNAPSHOT_INTERVAL) return;
    _lastSnapshot = now;
    state.t = now;  // timestamp para interpolacion
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
    init:                  init,
    publishSnapshot:       publishSnapshot,
    sendInput:             sendInput,
    onSnapshot:            onSnapshot,
    onInput:               onInput,
    getInterpolatedState:  getInterpolatedState,
    destroy:               destroy,
  };
})();
