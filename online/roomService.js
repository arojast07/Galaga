/**
 * roomService.js
 * Gestiona creacion, union y escucha de salas online.
 * Todos los metodos son async y loguean errores reales.
 */

var RoomService = (function() {
  var db = supabaseClient;

  // ── Generacion de codigo ───────────────────────────────────────────────

  /**
   * Genera un codigo de 4 digitos unico (no en uso en salas activas).
   * Intenta hasta 5 veces antes de fallar.
   * @returns {Promise<string>} codigo de 4 digitos
   */
  async function generateRoomCode() {
    for (var i = 0; i < 5; i++) {
      var code = String(Math.floor(1000 + Math.random() * 9000));
      console.log('[ROOM] intentando codigo: ' + code + ' (intento ' + (i + 1) + ')');

      var res = await db
        .from('rooms')
        .select('id')
        .eq('room_code', code)
        .in('status', ['waiting', 'ready', 'playing'])
        .maybeSingle();

      if (res.error) {
        console.warn('[ROOM] error verificando codigo:', res.error.message);
        // Si hay error de red, igual usamos el codigo generado
        return code;
      }

      if (!res.data) {
        // Codigo libre
        console.log('[ROOM] codigo disponible: ' + code);
        return code;
      }

      console.log('[ROOM] codigo ' + code + ' ya en uso, reintentando...');
    }

    throw new Error('No se pudo generar un codigo unico tras 5 intentos.');
  }

  // ── Crear sala ─────────────────────────────────────────────────────────

  /**
   * Crea una sala nueva como host (player1).
   * @param {string} playerName
   * @returns {Promise<{roomCode: string, roomId: string}>}
   */
  async function createRoom(playerName) {
    console.log('[ROOM] creando sala para:', playerName);

    var code = await generateRoomCode();
    console.log('[ROOM] codigo generado:', code);

    var insertRes = await db.from('rooms').insert({
      room_code:  code,
      status:     'waiting',
      host_name:  playerName,
      guest_name: null,
    }).select('id, room_code').single();

    if (insertRes.error) {
      console.error('[ROOM] error al insertar sala:', insertRes.error);
      throw new Error('Error Supabase al crear sala: ' + insertRes.error.message + ' (code: ' + insertRes.error.code + ')');
    }

    var roomId = insertRes.data.id;
    console.log('[ROOM] sala creada, id:', roomId);

    // Registrar player1
    var playerRes = await db.from('room_players').insert({
      room_id:     roomId,
      player_slot: 'player1',
      player_name: playerName,
      connected:   true,
      score:       0,
      lives:       3,
    });

    if (playerRes.error) {
      console.warn('[ROOM] advertencia al registrar player1:', playerRes.error.message);
      // No es fatal, continuar
    }

    console.log('[ROOM] sala creada correctamente. Codigo:', code);
    return { roomCode: code, roomId: roomId };
  }

  // ── Unirse a sala ──────────────────────────────────────────────────────

  /**
   * Une a un jugador como guest (player2).
   * @param {string} roomCode  codigo de 4 digitos
   * @param {string} playerName
   * @returns {Promise<{roomId: string, slot: string} | null>}
   *   null = sala no encontrada o llena
   */
  async function joinRoom(roomCode, playerName) {
    console.log('[ROOM] buscando sala:', roomCode, 'para:', playerName);

    var res = await db
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode)
      .eq('status', 'waiting')
      .maybeSingle();

    if (res.error) {
      console.error('[ROOM] error buscando sala:', res.error.message);
      throw new Error('Error Supabase al buscar sala: ' + res.error.message);
    }

    if (!res.data) {
      console.log('[ROOM] sala no encontrada o no disponible para codigo:', roomCode);
      return null;
    }

    var room = res.data;

    if (room.guest_name) {
      console.log('[ROOM] sala llena, ya tiene guest:', room.guest_name);
      return { full: true };
    }

    // Actualizar sala
    var updateRes = await db.from('rooms').update({
      guest_name: playerName,
      status:     'ready',
    }).eq('id', room.id);

    if (updateRes.error) {
      console.error('[ROOM] error actualizando sala:', updateRes.error.message);
      throw new Error('Error Supabase al actualizar sala: ' + updateRes.error.message);
    }

    // Registrar player2
    var playerRes = await db.from('room_players').insert({
      room_id:     room.id,
      player_slot: 'player2',
      player_name: playerName,
      connected:   true,
      score:       0,
      lives:       3,
    });

    if (playerRes.error) {
      console.warn('[ROOM] advertencia al registrar player2:', playerRes.error.message);
    }

    console.log('[ROOM] unido correctamente a sala:', roomCode, 'como player2');
    return { roomId: room.id, slot: 'player2' };
  }

  // ── Realtime ───────────────────────────────────────────────────────────

  /**
   * Suscribe a cambios en tiempo real de una sala.
   * @param {string} roomId
   * @param {function} callback  recibe el payload de Supabase Realtime
   * @returns {object} canal (para desuscribirse)
   */
  function subscribeToRoom(roomId, callback) {
    console.log('[ROOM] suscribiendo a realtime de sala:', roomId);

    var channel = db
      .channel('room_changes_' + roomId)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'rooms',
        filter: 'id=eq.' + roomId,
      }, function(payload) {
        console.log('[ROOM] cambio recibido en sala:', payload.new && payload.new.status);
        callback(payload);
      })
      .subscribe(function(status) {
        console.log('[ROOM] estado de suscripcion realtime:', status);
      });

    return channel;
  }

  // ── Estado ─────────────────────────────────────────────────────────────

  async function updateRoomStatus(roomId, status) {
    console.log('[ROOM] actualizando status a:', status);
    var res = await db.from('rooms').update({ status: status }).eq('id', roomId);
    if (res.error) console.error('[ROOM] error actualizando status:', res.error.message);
  }

  async function getRoom(roomId) {
    var res = await db.from('rooms').select('*').eq('id', roomId).single();
    if (res.error) console.error('[ROOM] error obteniendo sala:', res.error.message);
    return res.data;
  }

  async function leaveRoom(roomId, slot) {
    console.log('[ROOM] jugador', slot, 'abandona sala:', roomId);
    await db.from('room_players')
      .update({ connected: false })
      .eq('room_id', roomId)
      .eq('player_slot', slot);

    if (slot === 'player1') {
      await db.from('rooms').update({ status: 'finished' }).eq('id', roomId);
    }
  }

  async function updatePlayerState(roomId, slot, score, lives) {
    await db.from('room_players')
      .update({ score: score, lives: lives })
      .eq('room_id', roomId)
      .eq('player_slot', slot);
  }

  return {
    generateRoomCode:    generateRoomCode,
    createRoom:          createRoom,
    joinRoom:            joinRoom,
    subscribeToRoom:     subscribeToRoom,
    updateRoomStatus:    updateRoomStatus,
    getRoom:             getRoom,
    leaveRoom:           leaveRoom,
    updatePlayerState:   updatePlayerState,
  };
})();
