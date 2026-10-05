-- =====================================================================
-- 0068 - Scheda del PG: ritratto separato dall'immagine di chat
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- avatar_url resta l'immagine di chat (100 x 100): quella a sinistra
-- vicino ai messaggi, negli OFF e negli elenchi. Il ritratto della
-- scheda (pagina Dati) e' un'immagine a parte; se manca si usa quella di chat.
-- =====================================================================

alter table public.characters add column if not exists portrait_url text;

alter table public.characters drop constraint if exists characters_portrait_url_https;
alter table public.characters add constraint characters_portrait_url_https
  check (portrait_url is null or (portrait_url like 'https://%' and char_length(portrait_url) <= 1000));

grant update (portrait_url) on public.characters to authenticated;
