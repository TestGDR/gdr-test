// Le variabili NEXT_PUBLIC_* vengono incluse nel bundle del browser.
// Supabase ha rinominato la "anon key" in "publishable key": accettiamo entrambe.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
