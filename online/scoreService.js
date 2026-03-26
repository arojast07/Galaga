/**
 * scoreService.js
 * Guarda y recupera scores de Supabase.
 */

var ScoreService = (function() {
  var db = supabaseClient;

  /**
   * Guarda un score al finalizar la partida.
   * @param {string} playerName
   * @param {number} score
   * @param {string} roomCode  'local' si es partida local
   */
  async function saveScore(playerName, score, roomCode) {
    console.log('[SCORE] guardando score:', playerName, score, roomCode);

    var res = await db.from('scores').insert({
      player_name: playerName,
      score:       score,
      room_code:   roomCode || 'local',
    });

    if (res.error) {
      console.error('[SCORE] error guardando score:', res.error.message);
      return false;
    }

    console.log('[SCORE] score guardado correctamente.');
    return true;
  }

  /**
   * Obtiene los ultimos 10 registros (mas recientes primero).
   * @returns {Promise<Array>}
   */
  async function getLast10Scores() {
    console.log('[SCORE] cargando ultimos 10 scores...');

    var res = await db
      .from('scores')
      .select('player_name, score, room_code, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (res.error) {
      console.error('[SCORE] error cargando scores:', res.error.message);
      return [];
    }

    console.log('[SCORE] ultimos 10 cargados:', res.data ? res.data.length : 0, 'registros');
    return res.data || [];
  }

  /**
   * Alias para compatibilidad con codigo anterior.
   */
  async function getRecentScores() {
    return getLast10Scores();
  }

  /**
   * Top 10 por puntuacion mas alta.
   * @returns {Promise<Array>}
   */
  async function getTopScores() {
    var res = await db
      .from('scores')
      .select('player_name, score, room_code, created_at')
      .order('score', { ascending: false })
      .limit(10);

    if (res.error) {
      console.error('[SCORE] error cargando top scores:', res.error.message);
      return [];
    }

    return res.data || [];
  }

  return {
    saveScore:       saveScore,
    getLast10Scores: getLast10Scores,
    getRecentScores: getRecentScores,
    getTopScores:    getTopScores,
  };
})();
