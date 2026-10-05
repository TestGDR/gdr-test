-- =====================================================================
-- 0067 - Scheda del PG: immagine lunga per il cellulare
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Sul cellulare la prima pagina e' verticale (consigliata 450 x 800):
-- il giocatore puo' mettere un'immagine apposta. Senza, si usa quella
-- da computer tagliata al centro.
-- =====================================================================

alter table public.characters add column if not exists cover_mobile_url text;

alter table public.characters drop constraint if exists characters_cover_mobile_url_https;
alter table public.characters add constraint characters_cover_mobile_url_https
  check (cover_mobile_url is null or (cover_mobile_url like 'https://%' and char_length(cover_mobile_url) <= 1000));

grant update (cover_mobile_url) on public.characters to authenticated;
