-- =====================================================================
-- 0015 - Anno di nascita e di morte (D.C.) per PNG e membri dell'albero
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Gli anni sono numeri da 0 a 999 (Dopo la Conquista). Per i membri
-- dell'albero collegati a un PNG valgono le date della scheda del PNG.
-- =====================================================================

alter table public.house_family_members
  add column birth_year int check (birth_year between 0 and 999),
  add column death_year int check (death_year between 0 and 999),
  add constraint house_family_life check (birth_year is null or death_year is null or death_year >= birth_year);

alter table public.house_npcs
  add column deceased   boolean not null default false,
  add column birth_year int check (birth_year between 0 and 999),
  add column death_year int check (death_year between 0 and 999),
  add constraint house_npcs_life check (birth_year is null or death_year is null or death_year >= birth_year);
