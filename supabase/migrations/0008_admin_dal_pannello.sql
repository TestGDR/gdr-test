-- =====================================================================
-- 0008 - Admin e Giocatore gestibili dal pannello Ruoli & Permessi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

-- Assegnare un ruolo staff: serve il permesso "gestione.ruoli" e, se la
-- persona e' un admin, solo un altro admin puo' cambiarle il ruolo.
create or replace function public.assign_staff_role(target uuid, role_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('gestione.ruoli') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = target and role = 'admin')
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Solo un admin può modificare un altro admin' using errcode = '42501';
  end if;
  update public.profiles set staff_role_id = role_id where id = target;
end;
$$;

-- Nominare o togliere un admin: solo un admin, e ne deve restare almeno uno
create or replace function public.set_admin(target uuid, value boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Solo un admin può nominare o togliere un admin' using errcode = '42501';
  end if;
  if not value
     and exists (select 1 from public.profiles where id = target and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Deve restare almeno un admin' using errcode = 'P0001';
  end if;
  update public.profiles
  set role = case when value then 'admin' else 'player' end,
      -- un admin ha gia' tutti i permessi: il ruolo staff non serve
      staff_role_id = case when value then null else staff_role_id end
  where id = target;
end;
$$;

revoke execute on function public.set_admin(uuid, boolean) from public, anon;
grant execute on function public.set_admin(uuid, boolean) to authenticated;
