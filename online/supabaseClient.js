/**
 * supabaseClient.js
 * Conexion a Supabase usando credenciales reales del proyecto.
 * Usa la publishable/anon key — nunca la service_role key.
 */

console.log('[SUPABASE] inicializando cliente...');

var SUPABASE_URL      = 'https://awuyevhawydxhmsebqgx.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_qGsugeBOb4pVxve2eI1UVQ_6O5zy0ZlN';

if (!window.supabase) {
  console.error('[SUPABASE] ERROR: supabase-js no esta cargado. Verifica el CDN en index.html.');
} else {
  console.log('[SUPABASE] supabase-js detectado, creando cliente...');
}

var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Sin autenticacion — modo anonimo puro
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

console.log('[SUPABASE] cliente creado correctamente.');
