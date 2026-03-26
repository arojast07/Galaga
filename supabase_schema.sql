-- ============================================================
-- STELLAR ASSAULT - Schema de Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Tabla de salas
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'waiting',  -- waiting | ready | playing | finished
  host_name   TEXT NOT NULL,
  guest_name  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de jugadores por sala
CREATE TABLE IF NOT EXISTS room_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_slot TEXT NOT NULL,   -- player1 | player2
  player_name TEXT NOT NULL,
  connected   BOOLEAN DEFAULT TRUE,
  score       INTEGER DEFAULT 0,
  lives       INTEGER DEFAULT 3,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de scores globales
CREATE TABLE IF NOT EXISTS scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0,
  room_code   TEXT DEFAULT 'local',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Estado del juego (snapshots del host)
CREATE TABLE IF NOT EXISTS game_state (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  state_json  TEXT NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Inputs del guest hacia el host
CREATE TABLE IF NOT EXISTS game_inputs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL,   -- player2
  input_json  TEXT NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, slot)
);

-- ============================================================
-- Indices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rooms_code   ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_date  ON scores(created_at DESC);

-- ============================================================
-- Row Level Security (RLS) - acceso publico sin auth
-- ============================================================
ALTER TABLE rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_inputs  ENABLE ROW LEVEL SECURITY;

-- Politicas: acceso total con anon key (sin login)
CREATE POLICY "anon_all_rooms"        ON rooms        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_room_players" ON room_players FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_scores"       ON scores       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_game_state"   ON game_state   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_game_inputs"  ON game_inputs  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Realtime: habilitar para las tablas necesarias
-- ============================================================
-- Ejecutar en Supabase Dashboard > Database > Replication
-- O con estos comandos:
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE game_inputs;

-- ============================================================
-- Limpieza automatica de salas viejas (opcional)
-- Ejecutar manualmente o programar con pg_cron
-- ============================================================
-- DELETE FROM rooms WHERE created_at < NOW() - INTERVAL '2 hours' AND status = 'finished';
