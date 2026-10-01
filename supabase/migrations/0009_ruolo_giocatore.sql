-- =====================================================================
-- 0009 - Ruolo "Giocatore" modificabile (permessi di base per tutti)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Giocatore diventa un ruolo vero nella tabella dei ruoli: i suoi permessi
-- valgono per TUTTI gli utenti. Si puo' modificare ma non eliminare
-- (e' il ruolo che ognuno riceve all'iscrizione). Chi ha "Giocatore" ha
-- staff_role_id vuoto: non e' staff.
-- =====================================================================

alter table public.staff_roles
  add column system_key text unique check (system_key in ('giocatore'));

insert into public.staff_roles (name, description, color, sort_order, permissions, system_key)
values ('Giocatore', 'Il ruolo di tutti gli iscritti. I suoi permessi valgono per ogni utente.',
        '#968d89', 0, '{}', 'giocatore');

-- Permesso = admin, oppure nel ruolo staff dell'utente, oppure nel ruolo Giocatore
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.staff_roles r on r.id = p.staff_role_id
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or perm = any(r.permissions)
        or perm = any((select g.permissions from public.staff_roles g where g.system_key = 'giocatore'))
      )
  );
$$;

-- Il ruolo Giocatore non si assegna come ruolo staff: "Giocatore" = nessun ruolo staff
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
  if exists (select 1 from public.staff_roles where id = role_id and system_key is not null) then
    role_id := null;
  end if;
  update public.profiles set staff_role_id = role_id where id = target;
end;
$$;

-- I ruoli di sistema non si eliminano: regole separate per crea/modifica/elimina
drop policy "ruoli gestiti con permesso" on public.staff_roles;
create policy "crea ruoli con permesso" on public.staff_roles
  for insert to authenticated
  with check (public.has_permission('gestione.ruoli') and system_key is null);
create policy "modifica ruoli con permesso" on public.staff_roles
  for update to authenticated
  using (public.has_permission('gestione.ruoli'))
  with check (public.has_permission('gestione.ruoli'));
create policy "elimina ruoli con permesso" on public.staff_roles
  for delete to authenticated
  using (public.has_permission('gestione.ruoli') and system_key is null);

-- Nessuno puo' trasformare un ruolo normale in ruolo di sistema (o viceversa)
revoke update on public.staff_roles from authenticated;
grant update (name, description, color, sort_order, permissions) on public.staff_roles to authenticated;
