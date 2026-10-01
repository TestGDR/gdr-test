-- =====================================================================
-- 0007 - Ruoli staff e permessi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni ruolo staff ha un elenco di permessi (chiavi di testo, definite
-- nel codice in src/lib/permissions.ts). Un utente puo' avere un ruolo.
-- profiles.role = 'admin' resta il super-utente: ha SEMPRE tutti i
-- permessi, cosi' nessuno puo' chiudersi fuori togliendo un permesso.
-- =====================================================================

create table public.staff_roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (char_length(name) between 2 and 40),
  description  text not null default '' check (char_length(description) <= 200),
  color        text not null default '#e2622d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order   int  not null default 0,
  permissions  text[] not null default '{}',
  created_at   timestamptz not null default now()
);

alter table public.profiles
  add column staff_role_id uuid references public.staff_roles(id) on delete set null;

-- ---------------------------------------------------------------------
-- Controllo dei permessi, usato dalle regole di sicurezza (RLS)
-- ---------------------------------------------------------------------
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
      and (p.role = 'admin' or perm = any(r.permissions))
  );
$$;

-- "Staff" = admin oppure chiunque abbia un ruolo staff
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or staff_role_id is not null)
  );
$$;

-- Assegnare un ruolo a un utente: solo chi ha il permesso di gestire i ruoli.
-- (Gli utenti non possono modificare da soli la colonna staff_role_id.)
create or replace function public.assign_staff_role(target uuid, role_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('gestione.ruoli') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  update public.profiles set staff_role_id = role_id where id = target;
end;
$$;

revoke execute on function public.assign_staff_role(uuid, uuid) from public, anon;
grant execute on function public.assign_staff_role(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Tabella dei ruoli: tutti i loggati vedono i ruoli (es. per i simboli
-- nell'elenco online), solo chi ha il permesso li gestisce
-- ---------------------------------------------------------------------
alter table public.staff_roles enable row level security;

create policy "ruoli visibili" on public.staff_roles
  for select to authenticated using (true);
create policy "ruoli gestiti con permesso" on public.staff_roles
  for all to authenticated
  using (public.has_permission('gestione.ruoli'))
  with check (public.has_permission('gestione.ruoli'));

grant select, insert, update, delete on public.staff_roles to authenticated;
grant select on public.staff_roles to service_role;

-- ---------------------------------------------------------------------
-- Le regole "solo staff" esistenti diventano permessi specifici
-- ---------------------------------------------------------------------
drop policy "mappe staff"  on public.maps;
drop policy "luoghi staff" on public.locations;
drop policy "liste staff"  on public.rooms;
create policy "mappe con permesso"  on public.maps      for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
create policy "luoghi con permesso" on public.locations for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
create policy "liste con permesso"  on public.rooms     for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));

drop policy "guide modificabili dallo staff" on public.guide_pages;
create policy "guide con permesso" on public.guide_pages for all to authenticated
  using (public.has_permission('documentazione.scrivere'))
  with check (public.has_permission('documentazione.scrivere'));

drop policy "scrivi con il proprio personaggio attivo" on public.messages;
create policy "scrivi con il proprio personaggio attivo" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.owner_id = auth.uid() and c.status = 'attivo'
    )
    and (kind <> 'master' or public.has_permission('chat.narrazione'))
  );

drop policy "elimina propri messaggi o staff" on public.messages;
create policy "elimina propri messaggi o moderatori" on public.messages
  for delete to authenticated
  using (author_id = auth.uid() or public.has_permission('chat.moderare'));

drop policy "solo admin vedono gli accessi" on public.access_logs;
create policy "accessi con permesso" on public.access_logs
  for select to authenticated using (public.has_permission('gestione.accessi'));

-- ---------------------------------------------------------------------
-- Chi oggi e' "master" riceve un ruolo Master equivalente
-- ---------------------------------------------------------------------
insert into public.staff_roles (name, description, sort_order, permissions)
values ('Master', 'Narra le giocate e modera le chat.', 1,
        array['chat.narrazione', 'chat.moderare', 'mondo.gestire', 'documentazione.scrivere']);

update public.profiles
set staff_role_id = (select id from public.staff_roles where name = 'Master')
where role = 'master';
