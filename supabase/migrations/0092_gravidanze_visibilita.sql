-- =====================================================================
-- 0092 - Gravidanze: chi vede cosa
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - La proprietaria del PG, gli admin e chi ha il permesso
--   "schede.gravidanze" (da spuntare ai moderatori) vedono sempre tutto:
--   tentativi, gravidanza, fase e sintomi del giorno.
-- - Tutti gli altri vedono la gravidanza solo dal 3° mese ON (fase e
--   avanzamento, non i sintomi del giorno); prima vedono solo "—".
-- =====================================================================

-- Proprietaria, admin o permesso "schede.gravidanze"
create or replace function public.pregnancy_full_view(p_character uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.is_my_character(p_character) or public.has_permission('schede.gravidanze');
$$;
revoke execute on function public.pregnancy_full_view(uuid) from public, anon;
grant execute on function public.pregnancy_full_view(uuid) to authenticated;

drop policy if exists "gravidanze visibili" on public.pregnancies;
create policy "gravidanze visibili" on public.pregnancies for select to authenticated
  using (
    public.pregnancy_full_view(character_id)
    or (status = 'in_corso' and public.pregnancy_month(started_at) >= 3)
  );

drop policy if exists "giorni visibili" on public.pregnancy_days;
create policy "giorni visibili" on public.pregnancy_days for select to authenticated
  using (exists (
    select 1 from public.pregnancies p
    where p.id = pregnancy_id and public.pregnancy_full_view(p.character_id)
  ));

drop policy if exists "tentativi visibili" on public.pregnancy_attempts;
create policy "tentativi visibili" on public.pregnancy_attempts for select to authenticated
  using (public.pregnancy_full_view(character_id));
