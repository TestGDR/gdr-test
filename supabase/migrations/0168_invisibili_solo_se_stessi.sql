-- =====================================================================
-- 0168 - Invisibili: nessuno li vede, nemmeno lo staff
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Chi e' in modalita' invisibile non compare tra i presenti per nessuno
-- (come se fosse scollegato): si vede solo lui, in grigio.
-- Prima lo vedevano anche gli admin e chi ha il permesso "staff.invisibile".
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

drop policy if exists "segnali visibili" on public.online_status;
create policy "segnali visibili" on public.online_status for select to authenticated
  using (
    user_id = auth.uid()
    or not exists (select 1 from public.profiles p where p.id = user_id and p.invisible)
  );

create or replace function public.recent_online()
returns table (user_id uuid, info jsonb, last_seen timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select o.user_id,
         o.info || jsonb_build_object('invisible', coalesce(p.invisible, false)),
         o.last_seen
    from public.online_status o
    left join public.profiles p on p.id = o.user_id
   where o.last_action > now() - interval '60 minutes'
     and (not coalesce(p.invisible, false) or o.user_id = auth.uid());
$$;
grant execute on function public.recent_online() to authenticated;
