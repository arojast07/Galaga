/**
 * onlineSync.js
 * Sincronizacion host-authoritative via Supabase Realtime Broadcast.
 * Sin tablas. Sin REST fallback por diseño.
 *
 * Optimizaciones:
 *   - Snapshots del host: max 10/s (cada 100ms)
 *   - Inputs del guest: solo cuando cambia el estado, max 20/s (cada 50ms)
 *   - Sin logs de alta frecuencia
 */

var OnlineSync = (function() {
  var _db           = supabaseClient;
  var _roomId       = null;
  var _slot         = null;
  var _channel      = null;
  var _snapshotCb   = null;
  var _inputCb      = null;

  // Throttle snapshots: 100ms = 10 por segundo
  var SNAPSHOT_INTERVAL = 100;
  var _lastSnapshot     = 0;

  // Throttle inputs: 50ms = 20 por segundo maximo
  var INPUT_INTERVAL    = 50;
  var _lastInput        = 0;

  // Estado previo de input para enviar solo cuando cambia
  var _prevLeft  = false;
  var _prevRight = false;
  var _prevFire  = false;

  function init(roomId, slot, scene) {
    _roomId     = roomId;
    _slot       = slot;
    _snapshotCb = null;
    _inputCb    = null;
    _lastSnapshot = 0;
    _lastInput    = 0;
    _prevLeft = _prevRight = _prevFire = false;

    console.log('[ONLINE] sync initialized. slot:', slot);

    _channel = _db
      .channel('game_' + roomId, {
        config: { broadcast: { self: false, ack: false } },
      })
      .on('broadcast', { event: 'snapshot' }, function(msg) {
        if (_snapshotCb && msg.payload) _snapshotCb(msg.payload);
      })
      .on('broadcast', { event: 'input' }, function(msg) {
        if (_inputCb && msg.payload) _inputCb(msg.payload);
      })
      .subscribe(function(status) {
        console.log('[ONLINE] channel subscribed:', status);
        if (status === 'CHANNEL_ERROR') {
          console.warn('[ONLINE] fallback detected — canal con error');
        }
      });
  }

  /**
   * HOST: publica snapshot throttleado a 10/s.
   */
  function publishSnapshot(state) {
    if (!_channel || !_roomId) return;
    var now = Date.now();
    if (now - _lastSnapshot < SNAPSHOT_INTERVAL) return;
    _lastSnapshot = now;

    try {
      _channel.send({ type: 'broadcast', event: 'snapshot', payload: state });
    } catch (e) {
      console.warn('[ONLINE] error enviando snapshot:', e.message);
    }
  }

  /**
   * GUEST: envia input solo si cambio el estado o paso el intervalo minimo.
   * Throttle: 50ms. Solo envia si left/right/fire cambiaron.
   */
  function sendInput(left, right, fire) {
    if (!_channel || !_roomId) return;
    var now = Date.now();

    var changed = (left !== _prevLeft || right !== _prevRight || fire !== _prevFire);
    var elapsed = (now - _lastInput) >= INPUT_INTERVAL;

    if (!changed && !elapsed) return;

    _prevLeft  = left;
    _prevRight = right;
    _prevFire  = fire;
    _lastInput = now;

    try {
      _channel.send({
        type:    'broadcast',
        event:   'input',
        payload: { left: left, right: right, fire: fire },
      });
    } catch (e) {
      console.warn('[ONLINE] error enviando input:', e.message);
    }
  }

  function onSnapshot(callback) { _snapshotCb = callback; }
  function onInput(callback)    { _inputCb    = callback; }

  function destroy() {
    console.log('[ONLINE] sync destroyed');
    if (_channel) { _db.removeChannel(_channel); _channel = null; }
    _roomId = _slot = _snapshotCb = _inputCb = null;
  }

  return {
    init:            init,
    publishSnapshot: publishSnapshot,
    sendInput:       sendInput,
    onSnapshot:      onSnapshot,
    onInput:         onInput,
    destroy:         destroy,
  };
})();
