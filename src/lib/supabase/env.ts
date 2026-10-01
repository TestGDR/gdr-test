// Le variabili NEXT_PUBLIC_* vengono incluse nel bundle del browser.
// Supabase ha rinominato la "anon key" in "publishable key": accettiamo entrambe.
// trim(): un "a capo" incollato per sbaglio nelle variabili di Vercel rompe la
// connessione in tempo reale (la chiave finisce nell'indirizzo del WebSocket).
export const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const supabaseKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ""
).trim();
