-- =====================================================================
-- 0066 - Scheda del PG: immagine lunga della prima pagina
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- La prima pagina della scheda e' un'immagine lunga scelta dal giocatore
-- (tab Opzioni). La modifica solo il proprietario, come immagine e prestavolto.
-- =====================================================================

alter table public.characters add column if not exists cover_url text;

alter table public.characters drop constraint if exists characters_cover_url_https;
alter table public.characters add constraint characters_cover_url_https
  check (cover_url is null or (cover_url like 'https://%' and char_length(cover_url) <= 1000));

grant update (cover_url) on public.characters to authenticated;
