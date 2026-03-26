/**
 * onlineSync.js
 * Sincronizacion host-authoritative entre dos jugadores online.
 *
 * Arquitectura:
 *   HOST  -> corre el juego completo (GameScene normal)
 *         -> publica snapshots de estado cada ~100ms en game_state
 *         -> recibe inputs del guest via game_inputs
 *
 *   GUEST -> recibe snapshots y refleja el estado en pantalla
 *         -> envia sus inputs al host via game_inputs
 *         -> NO corre fisica propia de enemigos
 *
 * Uso desde GameScene:
 *   OnlineSync.init(roomId, slot, scene)
 *   OnlineSync.publishSnapshot(stateObj)   // solo host
 *   OnlineSync.sendInput(inputObj)         // solo guest
 *   OnlineSync.onSnapshot(callback)        // solo guest
 *   OnlineSync.onInput(callback)           // solo host
 *   OnlineSync.destroy()
 */

var OnlineSync = (function() {
  var _db       = supabaseClient;
  var _roomId   = null;
  var _slot     = null;
  var _scene    = null;
  var _channels = [];

  // Throttle de publicacion de snapshots (ms)
  var SNAPSHOT_INTERVAL = 100;
  var _lastSnapshot     = 0;

  function init(roomId, slot, scene) {
    _roomId = roomId;
    _slot   = slot;
    _scene  = scene;
  }

  /**
   * HOST: publica un snapshot del estado del juego.
   * Se throttlea a SNAPSHOT_INTERVAL ms para no saturar Supabase.
   * @param {object} state  { players, enemies, wave, score }
   */
  async function publishSnapshot(state) {
    var now = Date.now();
    if (now - _lastSnapshot < SNAPSHOT_INTERVAL) return;
    _lastSnapshot = now;

    await _db.from('game_state').upsert({
      room_id:    _roomId,
      state_json: JSON.stringify(state),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'room_id' });
  }

  /**
   * GUEST: envia sus inputs al host.
   * @param {object} input  { left, right, fire, slot }
   */
  async function sendInput(input) {
    input.slot      = _slot;
    input.timestamp = Date.now();
    await _db.from('game_inputs').upsert({
      room_id:    _roomId,
      slot:       _slot,
      input_json: JSON.stringify(input),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'room_id,slot' });
  }

  /**
   * GUEST: suscribe a snapshots del host.
   */
  function onSnapshot(callback) {
    var ch = _db
      .channel('snap_' + _roomId)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'game_state',
        filter: 'room_id=eq.' + _roomId,
      }, function(payload) {
        if (payload.new && payload.new.state_json) {
          try {
            callback(JSON.parse(payload.new.state_json));
          } catch (e) {}
        }
      })
      .subscribe();
    _channels.push(ch);
  }

  /**
   * HOST: suscribe a inputs del guest.
   */
  function onInput(callback) {
    var ch = _db
      .channel('input_' + _roomId)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'game_inputs',
        filter: 'room_id=eq.' + _roomId,
      }, function(payload) {
        if (payload.new && payload.new.input_json) {
          try {
            callback(JSON.parse(payload.new.input_json));
          } catch (e) {}
        }
      })
      .subscribe();
    _channels.push(ch);
  }

  /**
   * Limpia todos los canales al salir.
   */
  function destroy() {
    _channels.forEach(function(ch) {
      _db.removeChannel(ch);
    });
    _channels = [];
    _roomId   = null;
    _slot     = null;
    _scene    = null;
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
