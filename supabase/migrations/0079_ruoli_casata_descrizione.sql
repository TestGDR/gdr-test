-- =====================================================================
-- 0079 - Ruoli di casata: descrizione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni ruolo di casata puo' avere una descrizione: indicazioni sul BG,
-- note OFF su come giocarlo, dove e' collocato. La leggono tutti nella
-- pagina della casata; la scrive chi gestisce le casate.
-- =====================================================================

alter table public.house_roles add column if not exists description text not null default ''
  check (char_length(description) <= 4000);
