/**
 * roomService.js
 * Gestiona creacion, union y escucha de salas online.
 */

var RoomService = (function() {
  var db = supabaseClient;

  // ── Generacion de codigo ───────────────────────────────────────────────

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
        return code;
      }
      if (!res.data) {
        console.log('[ROOM] codigo disponible: ' + code);
        return code;
      }
      console.log('[ROOM] codigo ' + code + ' ya en uso, reintentando...');
    }
    throw new Error('No se pudo generar un codigo unico tras 5 intentos.');
  }

  // ── Crear sala ─────────────────────────────────────────────────────────

  async function createRoom(playerName) {
    console.log('[ROOM] createRoom iniciado');
    console.log('[ROOM] supabase client existe:', !!db);
    console.log('[ROOM] creando sala para:', playerName);

    var code = await generateRoomCode();
    console.log('[ROOM] codigo generado:', code);

    console.log('[ROOM] intentando insert en rooms...');
    var insertRes = await db.from('rooms').insert({
      room_code:  code,
      status:     'waiting',
      host_name:  playerName,
      guest_name: null,
    }).select('id, room_code').single();

    console.log('[ROOM] resultado insert:', insertRes.error ? 'ERROR' : 'OK');
    if (insertRes.error) {
      console.error('[ROOM] error real Supabase:', JSON.stringify(insertRes.error));
      throw new Error('Error Supabase al crear sala: ' + insertRes.error.message + ' (code: ' + insertRes.error.code + ')');
    }

    var roomId = insertRes.data.id;
    console.log('[ROOM] sala creada, id:', roomId);

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
    }

    console.log('[ROOM] sala creada correctamente. Codigo:', code);
    return { roomCode: code, roomId: roomId };
  }

  // ── Unirse a sala ──────────────────────────────────────────────────────

  async function joinRoom(roomCode, playerName) {
    console.log('[JOIN] joinRoom iniciado');
    console.log('[JOIN] nombre recibido:', playerName);
    console.log('[JOIN] codigo recibido:', roomCode);

    var cleanCode = String(roomCode).trim();
    console.log('[JOIN] buscando sala por room_code:', cleanCode);

    // Buscar sala activa con ese codigo (waiting o ready sin guest)
    var res = await db
      .from('rooms')
      .select('*')
      .eq('room_code', cleanCode)
      .in('status', ['waiting'])
      .maybeSingle();

    if (res.error) {
      console.error('[JOIN] error real:', res.error.message);
      throw new Error('Error Supabase al buscar sala: ' + res.error.message);
    }

    if (!res.data) {
      console.log('[JOIN] sala no encontrada para codigo:', cleanCode);
      return null;
    }

    var room = res.data;
    console.log('[JOIN] sala encontrada:', room.id, 'status:', room.status, 'guest:', room.guest_name);

    if (room.guest_name) {
      console.log('[JOIN] sala llena, ya tiene guest:', room.guest_name);
      return { full: true };
    }

    // Insertar player2 PRIMERO
    console.log('[JOIN] insertando player2...');
    var playerRes = await db.from('room_players').insert({
      room_id:     room.id,
      player_slot: 'player2',
      player_name: playerName,
      connected:   true,
      score:       0,
      lives:       3,
    });

    if (playerRes.error) {
      console.error('[JOIN] error insertando player2:', playerRes.error.message);
      // No es fatal si ya existe, continuar
    } else {
      console.log('[JOIN] player2 insertado correctamente');
    }

    // Actualizar rooms a ready DESPUES
    console.log('[JOIN] actualizando room a ready...');
    var updateRes = await db.from('rooms').update({
      guest_name: playerName,
      status:     'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', room.id).select();

    if (updateRes.error) {
      console.error('[JOIN] error real al actualizar room:', updateRes.error.message);
      throw new Error('Error Supabase al actualizar sala: ' + updateRes.error.message);
    }

    console.log('[JOIN] room actualizada correctamente:', updateRes.data);
    console.log('[JOIN] union completada como player2 en sala:', cleanCode);
    return { roomId: room.id, slot: 'player2' };
  }

  // ── Realtime ───────────────────────────────────────────────────────────

  /**
   * Suscribe a cambios en tiempo real de una sala.
   * Escucha la tabla rooms SIN filtro de id para maximizar compatibilidad
   * con proyectos que no tienen replica identity full configurada.
   * Filtra manualmente por roomId en el callback.
   *
   * Tambien inicia un polling de fallback cada 2s por si realtime no dispara.
   *
   * @param {string} roomId
   * @param {function} callback  recibe el payload
   * @returns {object} { channel, stopPolling }
   */
  function subscribeToRoom(roomId, callback) {
    console.log('[ROOM] suscribiendo a realtime de sala:', roomId);

    // Suscripcion realtime SIN filtro (evita problemas de replica identity)
    var channel = db
      .channel('room_watch_' + roomId + '_' + Date.now())
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'rooms',
      }, function(payload) {
        console.log('[ROOM] realtime payload recibido:', JSON.stringify(payload.new));
        // Filtrar manualmente por id
        if (payload.new && payload.new.id === roomId) {
          console.log('[ROOM] nuevo status detectado:', payload.new.status);
          console.log('[ROOM] guest_name detectado:', payload.new.guest_name);
          if (payload.new.status === 'ready') {
            console.log('[ROOM] sala lista para iniciar');
          }
          callback(payload);
        }
      })
      .subscribe(function(status) {
        console.log('[ROOM] estado de suscripcion realtime:', status);
      });

    // Polling fallback: consulta cada 2s por si realtime no dispara
    var pollingActive = true;
    var pollInterval = setInterval(async function() {
      if (!pollingActive) return;
      try {
        var pollRes = await db
          .from('rooms')
          .select('id, status, guest_name, updated_at')
          .eq('id', roomId)
          .single();

        if (pollRes.data && pollRes.data.status === 'ready') {
          console.log('[ROOM] polling detecto sala ready:', pollRes.data);
          pollingActive = false;
          clearInterval(pollInterval);
          callback({ new: pollRes.data });
        }
      } catch (e) {
        // silencioso
      }
    }, 2000);

    function stopPolling() {
      pollingActive = false;
      clearInterval(pollInterval);
    }

    return { channel: channel, stopPolling: stopPolling };
  }

  // ── Estado ─────────────────────────────────────────────────────────────

  async function updateRoomStatus(roomId, status) {
    console.log('[ROOM] actualizando status a:', status);
    var res = await db.from('rooms').update({
      status:     status,
      updated_at: new Date().toISOString(),
    }).eq('id', roomId);
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
      await db.from('rooms').update({
        status:     'finished',
        updated_at: new Date().toISOString(),
      }).eq('id', roomId);
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
