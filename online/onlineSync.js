/**
 * onlineSync.js
 * Sincronizacion host-authoritative entre dos jugadores online.
 *
 * Esta version NO usa game_state ni game_inputs en Supabase.
 * Usa Supabase Realtime Broadcast (sin tablas) para enviar
 * snapshots e inputs directamente por websocket.
 * Esto elimina los 404 de tablas inexistentes y es mas rapido.
 *
 * HOST  -> publica snapshots via broadcast cada ~150ms
 *       -> recibe inputs del guest via broadcast
 *       -> controla su nave localmente (players[0])
 *
 * GUEST -> recibe snapshots del host
 *       -> envia sus inputs via broadcast
 *       -> controla su nave localmente (players[1])
 */

var OnlineSync = (function() {
  var _db              = supabaseClient;
  var _roomId          = null;
  var _slot            = null;
  var _channel         = null;
  var _snapshotCb      = null;
  var _inputCb         = null;
  var _syncDisabled    = false;

  var SNAPSHOT_INTERVAL = 150;
  var _lastSnapshot     = 0;

  function init(roomId, slot, scene) {
    _roomId       = roomId;
    _slot         = slot;
    _syncDisabled = false;
    _snapshotCb   = null;
    _inputCb      = null;

    console.log('[ONLINE] inicializando sync. slot:', slot, 'roomId:', roomId);

    // Canal broadcast — no requiere tablas, usa websocket puro
    _channel = _db
      .channel('game_' + roomId, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'snapshot' }, function(msg) {
        if (_snapshotCb && msg.payload) {
          _snapshotCb(msg.payload);
        }
      })
      .on('broadcast', { event: 'input' }, function(msg) {
        if (_inputCb && msg.payload) {
          _inputCb(msg.payload);
        }
      })
      .subscribe(function(status) {
        console.log('[ONLINE] broadcast channel status:', status);
      });
  }

  /**
   * HOST: publica snapshot via broadcast (throttleado).
   * No usa ninguna tabla de Supabase.
   */
  function publishSnapshot(state) {
    if (_syncDisabled || !_channel || !_roomId) return;
    var now = Date.now();
    if (now - _lastSnapshot < SNAPSHOT_INTERVAL) return;
    _lastSnapshot = now;

    try {
      _channel.send({
        type:    'broadcast',
        event:   'snapshot',
        payload: state,
      });
    } catch (e) {
      console.warn('[ONLINE] error enviando snapshot:', e.message);
    }
  }

  /**
   * GUEST: envia inputs al host via broadcast.
   */
  function sendInput(input) {
    if (_syncDisabled || !_channel || !_roomId) return;
    try {
      _channel.send({
        type:    'broadcast',
        event:   'input',
        payload: input,
      });
    } catch (e) {
      console.warn('[ONLINE] error enviando input:', e.message);
    }
  }

  /**
   * GUEST: registra callback para recibir snapshots del host.
   */
  function onSnapshot(callback) {
    _snapshotCb = callback;
  }

  /**
   * HOST: registra callback para recibir inputs del guest.
   */
  function onInput(callback) {
    _inputCb = callback;
  }

  function destroy() {
    console.log('[ONLINE] destruyendo sync');
    if (_channel) {
      _db.removeChannel(_channel);
      _channel = null;
    }
    _roomId      = null;
    _slot        = null;
    _snapshotCb  = null;
    _inputCb     = null;
    _syncDisabled = false;
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
