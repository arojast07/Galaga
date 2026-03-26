/**
 * supabaseClient.js
 * Inicializacion de Supabase para proyecto estatico (HTML + JS puro).
 * NO usa process.env, import.meta.env ni ninguna variable de entorno.
 * Las credenciales estan definidas directamente aqui.
 */

console.log('[SUPABASE] inicializando cliente...');

var SUPABASE_URL = 'https://awuyevhawydxhmsebqgx.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3dXlldmhhd3lkeGhtc2VicWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDMwMjAsImV4cCI6MjA5MDExOTAyMH0.24rzYtP9d2QmytDWNmxY3mJj9tNIOxv0nbIEmlTeA1A';

console.log('[SUPABASE] url presente:', !!SUPABASE_URL);
console.log('[SUPABASE] key presente:', !!SUPABASE_KEY);
console.log('[SUPABASE] key preview:', SUPABASE_KEY ? SUPABASE_KEY.substring(0, 20) + '...' : 'UNDEFINED');

if (!SUPABASE_URL || typeof SUPABASE_URL !== 'string') {
  throw new Error('[SUPABASE] FATAL: SUPABASE_URL no es valida.');
}
if (!SUPABASE_KEY || typeof SUPABASE_KEY !== 'string' || SUPABASE_KEY.length < 10) {
  throw new Error('[SUPABASE] FATAL: SUPABASE_KEY no es valida.');
}
if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  throw new Error('[SUPABASE] FATAL: supabase-js no esta cargado. Verifica el CDN en index.html.');
}

var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:   false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

console.log('[SUPABASE] cliente creado correctamente.');
