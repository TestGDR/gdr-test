-- =====================================================================
-- 0030 - Draghi: ogni abilita' ha una caratteristica di riferimento
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

alter table public.dragon_skills
  add column stat_key text not null default 'vigore'
  check (stat_key in ('vigore', 'destrezza', 'intelletto', 'percezione'));

update public.dragon_skills set stat_key = 'destrezza'  where key = 'volare';
update public.dragon_skills set stat_key = 'vigore'     where key = 'attacco_fisico';
update public.dragon_skills set stat_key = 'vigore'     where key = 'attacco_infuocato';
update public.dragon_skills set stat_key = 'destrezza'  where key = 'schivare';
update public.dragon_skills set stat_key = 'intelletto' where key = 'fermezza';
update public.dragon_skills set stat_key = 'percezione' where key = 'sensi';

grant update (stat_key) on public.dragon_skills to authenticated;
