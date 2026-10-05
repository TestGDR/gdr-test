-- =====================================================================
-- 0072 - Affetti: testo scritto con l'editor (formattato)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il testo di ogni affetto ora si scrive con l'editor di testo e si salva
-- come HTML (ripulito quando si mostra): serve piu' spazio di 1.000 caratteri.
-- =====================================================================

alter table public.character_affections drop constraint if exists character_affections_body_check;
alter table public.character_affections drop constraint if exists character_affections_body_len;
alter table public.character_affections add constraint character_affections_body_len
  check (char_length(body) <= 10000);
