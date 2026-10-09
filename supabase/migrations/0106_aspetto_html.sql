-- =====================================================================
-- 0106 - Scheda: Aspetto in HTML
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- L'Aspetto puo' contenere HTML (ripulito ogni volta che si mostra):
-- il limite passa da 4.000 a 20.000 caratteri, come "Si sa che" e "Affetti".
-- =====================================================================

alter table public.characters drop constraint if exists characters_appearance_len;
alter table public.characters add constraint characters_appearance_len
  check (appearance is null or char_length(appearance) <= 20000);
