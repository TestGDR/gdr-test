-- =====================================================================
-- 0147 - Immagine (facoltativa) dei tipi di truppa
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
-- Si inserisce in Gestione -> Eserciti -> Tipi di truppa (indirizzo https)
-- e si vede nelle carte dell'esercito nel pannello Feudi.
-- =====================================================================

alter table public.troop_types
  add column if not exists image_url text check (image_url is null or image_url ~ '^https://');
