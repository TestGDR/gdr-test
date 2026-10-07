-- =====================================================================
-- 0091 - Abilita' e tratti dei PG: li assegnano admin e moderatori
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- (dopo la 0090)
--
-- Permesso nuovo "schede.abilita": chi lo ha (admin sempre, i moderatori
-- se lo spunti in Ruoli & Permessi) vede la pennina nelle pagine Abilita'
-- e Tratti della scheda: cambia i livelli e aggiunge o toglie tratti.
-- =====================================================================

drop policy if exists "abilita dei pg admin" on public.character_skills;
create policy "abilita dei pg admin" on public.character_skills for all to authenticated
  using (public.has_permission('schede.abilita')) with check (public.has_permission('schede.abilita'));

drop policy if exists "tratti dei pg admin" on public.character_traits;
create policy "tratti dei pg admin" on public.character_traits for all to authenticated
  using (public.has_permission('schede.abilita')) with check (public.has_permission('schede.abilita'));

-- La scheda chiede se mostrare il pannello
create or replace function public.can_manage_rules()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.has_permission('schede.abilita');
$$;
revoke execute on function public.can_manage_rules() from public, anon;
grant execute on function public.can_manage_rules() to authenticated;
