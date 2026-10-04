-- =====================================================================
-- 0042 - Messaggi OFF come una chat: gruppi e messaggi a tutti
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Gruppi: chi crea il gruppo aggiunge e toglie i membri; tutti i membri
--   scrivono e possono uscire.
-- Messaggi a tutti: li scrive chi ha "annunci.globali", li ricevono tutti
--   i personaggi (anche chi non e' collegato in quel momento).
-- Tutto arriva in tempo reale.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Gruppi
-- ---------------------------------------------------------------------
create table public.off_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  created_by  uuid references public.characters(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.off_group_members (
  group_id      uuid not null references public.off_groups(id) on delete cascade,
  character_id  uuid not null references public.characters(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  joined_at     timestamptz not null default now(),
  primary key (group_id, character_id)
);
create index off_group_members_character_idx on public.off_group_members(character_id);

create table public.off_group_messages (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.off_groups(id) on delete cascade,
  sender_id   uuid not null references public.characters(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index off_group_messages_group_idx on public.off_group_messages(group_id, created_at desc);

-- Il personaggio e' mio?
create or replace function public.is_my_character(p_character uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.characters where id = p_character and owner_id = auth.uid());
$$;

-- Uno dei miei personaggi e' nel gruppo?
create or replace function public.is_off_group_member(p_group uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.off_group_members m
    join public.characters c on c.id = m.character_id
    where m.group_id = p_group and c.owner_id = auth.uid()
  );
$$;

-- Il gruppo e' stato creato da un mio personaggio?
create or replace function public.is_off_group_owner(p_group uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.off_groups g
    join public.characters c on c.id = g.created_by
    where g.id = p_group and c.owner_id = auth.uid()
  );
$$;

alter table public.off_groups enable row level security;
alter table public.off_group_members enable row level security;
alter table public.off_group_messages enable row level security;

create policy "vedi i tuoi gruppi" on public.off_groups for select to authenticated
  using (public.is_off_group_member(id));
create policy "rinomina i tuoi gruppi" on public.off_groups for update to authenticated
  using (public.is_off_group_owner(id)) with check (public.is_off_group_owner(id));

create policy "vedi i membri dei tuoi gruppi" on public.off_group_members for select to authenticated
  using (public.is_off_group_member(group_id));
-- segnare come letto: solo la propria riga
create policy "segna letto" on public.off_group_members for update to authenticated
  using (public.is_my_character(character_id)) with check (public.is_my_character(character_id));

create policy "leggi i messaggi dei tuoi gruppi" on public.off_group_messages for select to authenticated
  using (public.is_off_group_member(group_id));
create policy "scrivi nei tuoi gruppi" on public.off_group_messages for insert to authenticated
  with check (
    public.is_my_character(sender_id)
    and exists (select 1 from public.off_group_members m where m.group_id = off_group_messages.group_id and m.character_id = sender_id)
  );

grant select, update (name) on public.off_groups to authenticated;
grant select, update (last_read_at) on public.off_group_members to authenticated;
grant select, insert (group_id, sender_id, body) on public.off_group_messages to authenticated;
grant select, insert, update, delete on public.off_groups, public.off_group_members, public.off_group_messages to service_role;

-- Crea un gruppo con i membri scelti (chi lo crea e' sempre dentro)
create or replace function public.create_off_group(p_character uuid, p_name text, p_members uuid[])
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_my_character(p_character) then raise exception 'Personaggio non valido'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Nome del gruppo non valido'; end if;
  insert into public.off_groups (name, created_by) values (trim(p_name), p_character) returning id into v_id;
  insert into public.off_group_members (group_id, character_id)
  select v_id, c.id from public.characters c
  where c.id = p_character or c.id = any(coalesce(p_members, '{}'))
  on conflict do nothing;
  return v_id;
end;
$$;

-- Aggiunge un membro (solo chi ha creato il gruppo)
create or replace function public.add_off_group_member(p_group uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_off_group_owner(p_group) then raise exception 'Solo chi ha creato il gruppo puo'' aggiungere membri'; end if;
  insert into public.off_group_members (group_id, character_id) values (p_group, p_character) on conflict do nothing;
end;
$$;

-- Toglie un membro: chi ha creato il gruppo toglie chiunque, gli altri solo se stessi (uscire)
create or replace function public.remove_off_group_member(p_group uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not (public.is_off_group_owner(p_group) or public.is_my_character(p_character)) then
    raise exception 'Operazione non permessa';
  end if;
  delete from public.off_group_members where group_id = p_group and character_id = p_character;
  -- gruppo rimasto vuoto: si elimina
  delete from public.off_groups g where g.id = p_group
    and not exists (select 1 from public.off_group_members m where m.group_id = p_group);
end;
$$;

revoke execute on function public.create_off_group(uuid, text, uuid[]) from public, anon;
revoke execute on function public.add_off_group_member(uuid, uuid) from public, anon;
revoke execute on function public.remove_off_group_member(uuid, uuid) from public, anon;
grant execute on function public.create_off_group(uuid, text, uuid[]) to authenticated;
grant execute on function public.add_off_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_off_group_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Messaggi a tutti
-- ---------------------------------------------------------------------
create table public.off_broadcasts (
  id          bigint generated always as identity primary key,
  sender_id   uuid references public.characters(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index off_broadcasts_created_idx on public.off_broadcasts(created_at desc);

create table public.off_broadcast_reads (
  character_id  uuid primary key references public.characters(id) on delete cascade,
  last_read_at  timestamptz not null default now()
);

alter table public.off_broadcasts enable row level security;
alter table public.off_broadcast_reads enable row level security;

create policy "messaggi a tutti visibili" on public.off_broadcasts for select to authenticated using (true);
create policy "scrive chi ha il permesso" on public.off_broadcasts for insert to authenticated
  with check (public.has_permission('annunci.globali') and public.is_my_character(sender_id));
create policy "elimina chi ha il permesso" on public.off_broadcasts for delete to authenticated
  using (public.has_permission('annunci.globali'));

create policy "il mio segno di lettura" on public.off_broadcast_reads for all to authenticated
  using (public.is_my_character(character_id)) with check (public.is_my_character(character_id));

grant select, insert (sender_id, body), delete on public.off_broadcasts to authenticated;
grant select, insert, update on public.off_broadcast_reads to authenticated;
grant select, insert, update, delete on public.off_broadcasts, public.off_broadcast_reads to service_role;

-- chi c'e' gia' ha letto tutto; i nuovi personaggi partono da quando nascono
insert into public.off_broadcast_reads (character_id) select id from public.characters on conflict do nothing;

create or replace function public.characters_broadcast_read()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.off_broadcast_reads (character_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger characters_broadcast_read after insert on public.characters
  for each row execute function public.characters_broadcast_read();

-- ---------------------------------------------------------------------
-- Data decisa dal database, e scrivere conta come azione (presenze)
-- ---------------------------------------------------------------------
create or replace function public.set_created_now()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
create trigger off_group_messages_now before insert on public.off_group_messages
  for each row execute function public.set_created_now();
create trigger off_broadcasts_now before insert on public.off_broadcasts
  for each row execute function public.set_created_now();

create trigger off_group_messages_online_action after insert on public.off_group_messages
  for each row execute function public.online_mark_action();
create trigger off_broadcasts_online_action after insert on public.off_broadcasts
  for each row execute function public.online_mark_action();

-- ---------------------------------------------------------------------
-- Non letti di gruppi e messaggi a tutti (per l'icona)
-- ---------------------------------------------------------------------
create or replace function public.off_unread(p_character uuid)
returns integer
language sql stable
security definer set search_path = ''
as $$
  select case when not public.is_my_character(p_character) then 0 else
    (select count(*)::int from public.off_group_messages gm
       join public.off_group_members m on m.group_id = gm.group_id and m.character_id = p_character
      where gm.sender_id <> p_character and gm.created_at > m.last_read_at)
    +
    (select count(*)::int from public.off_broadcasts b
      where b.sender_id is distinct from p_character
        and b.created_at > coalesce((select r.last_read_at from public.off_broadcast_reads r where r.character_id = p_character), now()))
  end;
$$;
revoke execute on function public.off_unread(uuid) from public, anon;
grant execute on function public.off_unread(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Tempo reale
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.off_group_messages;
alter publication supabase_realtime add table public.off_group_members;
alter publication supabase_realtime add table public.off_broadcasts;
alter publication supabase_realtime add table public.off_broadcast_reads;
