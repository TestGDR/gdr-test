-- =====================================================================
-- 0021 - Mondo di gioco: mappe attivabili, macroaree, chat private
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
--   maps       = mappe principali (si accendono e spengono)
--   locations  = macroaree (puntini sulla mappa)
--   rooms      = chat di gioco: pubbliche, della casata o in affitto
--
-- I giocatori vedono solo mappe attive (con le loro macroaree e chat).
-- Nelle chat private leggono e scrivono solo:
--   casata  -> i membri della casata e i loro invitati
--   affitto -> chi ha affittato la stanza (finche' dura) e i suoi invitati
-- Chi ha "chat.moderare" entra ovunque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mappe attive / spente
-- ---------------------------------------------------------------------
alter table public.maps add column active boolean not null default false;

-- ---------------------------------------------------------------------
-- Chat: immagine, tipo di accesso, casata, prezzo d'affitto
-- ---------------------------------------------------------------------
alter table public.rooms
  add column image_url      text,
  add column access         text not null default 'pubblica' check (access in ('pubblica', 'casata', 'affitto')),
  add column house_id       uuid references public.houses(id) on delete set null,
  add column price_per_hour int  not null default 0  check (price_per_hour between 0 and 1000000),
  add column max_hours      int  not null default 24 check (max_hours between 1 and 168);

-- ---------------------------------------------------------------------
-- Monete del personaggio (le modifica solo il server, mai il giocatore)
-- ---------------------------------------------------------------------
alter table public.characters add column coins int not null default 0 check (coins >= 0);

-- ---------------------------------------------------------------------
-- Affitti e invitati
-- ---------------------------------------------------------------------
create table public.room_rentals (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  character_id  uuid not null references public.characters(id) on delete cascade,
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  cost          int not null default 0,
  created_at    timestamptz not null default now()
);
create index room_rentals_room_idx on public.room_rentals(room_id, ends_at desc);

create table public.room_guests (
  room_id       uuid not null references public.rooms(id) on delete cascade,
  character_id  uuid not null references public.characters(id) on delete cascade,
  invited_by    uuid references public.characters(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (room_id, character_id)
);

alter table public.room_rentals enable row level security;
alter table public.room_guests  enable row level security;
create policy "affitti visibili"  on public.room_rentals for select to authenticated using (true);
create policy "invitati visibili" on public.room_guests  for select to authenticated using (true);
-- Si scrivono solo con le funzioni qui sotto
grant select on public.room_rentals to authenticated;
grant select on public.room_guests  to authenticated;

-- ---------------------------------------------------------------------
-- Visibilita': i giocatori vedono solo il mondo delle mappe attive
-- ---------------------------------------------------------------------
create or replace function public.room_on_active_map(r uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rooms ro
    join public.locations l on l.id = ro.location_id
    join public.maps m on m.id = l.map_id
    where ro.id = r and m.active
  );
$$;

drop policy "mappe visibili" on public.maps;
create policy "mappe visibili" on public.maps for select to authenticated
  using (active or public.has_permission('mondo.gestire'));

drop policy "luoghi visibili" on public.locations;
create policy "luoghi visibili" on public.locations for select to authenticated
  using (
    exists (select 1 from public.maps m where m.id = map_id and m.active)
    or public.has_permission('mondo.gestire')
  );

drop policy "liste visibili" on public.rooms;
create policy "liste visibili" on public.rooms for select to authenticated
  using (public.room_on_active_map(id) or public.has_permission('mondo.gestire'));

-- ---------------------------------------------------------------------
-- Chi puo' entrare in una chat
-- ---------------------------------------------------------------------
-- Un personaggio dell'utente e' tra gli invitati
create or replace function public.is_room_guest(r uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_guests g
    join public.characters c on c.id = g.character_id
    where g.room_id = r and c.owner_id = auth.uid()
  );
$$;

-- Affitto in corso (se c'e')
create or replace function public.active_rental(r uuid)
returns public.room_rentals
language sql
stable
security definer set search_path = ''
as $$
  select * from public.room_rentals
  where room_id = r and ends_at > now()
  order by ends_at desc
  limit 1;
$$;

-- Personaggio dell'utente che "comanda" la stanza (invita e caccia):
-- un membro della casata o chi la sta affittando. Null se nessuno.
create or replace function public.room_controller(r uuid)
returns uuid
language sql
stable
security definer set search_path = ''
as $$
  select case ro.access
    when 'casata' then (
      select c.id from public.characters c
      where c.owner_id = auth.uid() and c.house_id = ro.house_id and c.status = 'attivo'
      order by c.created_at limit 1)
    when 'affitto' then (
      select c.id from public.characters c
      where c.id = (public.active_rental(r)).character_id and c.owner_id = auth.uid())
  end
  from public.rooms ro where ro.id = r;
$$;

create or replace function public.can_enter_room(r uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select case
    when public.has_permission('chat.moderare') then exists (select 1 from public.rooms where id = r)
    when not public.room_on_active_map(r) then false
    else coalesce((
      select case ro.access
        when 'pubblica' then true
        when 'casata' then
          exists (select 1 from public.characters c where c.owner_id = auth.uid() and c.house_id = ro.house_id)
          or public.is_room_guest(r)
        when 'affitto' then
          (public.active_rental(r)).id is not null
          and (public.room_controller(r) is not null or public.is_room_guest(r))
        else false
      end
      from public.rooms ro where ro.id = r), false)
  end;
$$;

-- I messaggi delle chat private li legge e scrive solo chi puo' entrare
drop policy "messaggi visibili" on public.messages;
create policy "messaggi visibili" on public.messages for select to authenticated
  using (public.can_enter_room(room_id));

drop policy "scrivi con il proprio personaggio attivo" on public.messages;
create policy "scrivi con il proprio personaggio attivo" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.owner_id = auth.uid() and c.status = 'attivo'
    )
    and (kind <> 'master' or public.has_permission('chat.narrazione'))
    and public.can_enter_room(room_id)
  );

-- ---------------------------------------------------------------------
-- Affittare una stanza (spende le monete del personaggio)
--  - se la stanza e' di un altro e l'affitto e' in corso: occupata
--  - stesso personaggio, affitto in corso: prolunga
--  - stesso personaggio, affitto scaduto: la chat e gli invitati restano
--  - personaggio diverso dall'ultimo: chat e invitati si azzerano
-- ---------------------------------------------------------------------
create or replace function public.rent_room(p_room uuid, p_character uuid, p_hours int)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  ro public.rooms;
  last_rental public.room_rentals;
  total int;
  new_end timestamptz;
begin
  if not exists (
    select 1 from public.characters
    where id = p_character and owner_id = auth.uid() and status = 'attivo'
  ) then
    raise exception 'Serve un personaggio attivo per affittare una stanza.' using errcode = '42501';
  end if;

  -- Blocca la stanza: due affitti contemporanei non possono passare entrambi
  select * into ro from public.rooms where id = p_room for update;
  if not found or ro.access <> 'affitto' or not public.room_on_active_map(p_room) then
    raise exception 'Questa stanza non si può affittare.' using errcode = 'P0001';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > ro.max_hours then
    raise exception 'Puoi affittarla da 1 a % ore.', ro.max_hours using errcode = 'P0001';
  end if;

  select * into last_rental from public.room_rentals
  where room_id = p_room order by ends_at desc limit 1;

  if last_rental.id is not null and last_rental.ends_at > now() and last_rental.character_id <> p_character then
    raise exception 'La stanza è già occupata.' using errcode = 'P0001';
  end if;

  total := ro.price_per_hour * p_hours;
  update public.characters set coins = coins - total where id = p_character and coins >= total;
  if not found then
    raise exception 'Non hai abbastanza monete (servono %).', total using errcode = 'P0001';
  end if;

  -- Nuovo inquilino: la stanza riparte pulita
  if last_rental.id is not null and last_rental.character_id <> p_character then
    delete from public.messages where room_id = p_room;
    delete from public.room_guests where room_id = p_room;
  end if;

  if last_rental.id is not null and last_rental.character_id = p_character and last_rental.ends_at > now() then
    new_end := last_rental.ends_at + make_interval(hours => p_hours);
  else
    new_end := now() + make_interval(hours => p_hours);
  end if;

  insert into public.room_rentals (room_id, character_id, starts_at, ends_at, cost)
  values (p_room, p_character, now(), new_end, total);
  return new_end;
end;
$$;

-- ---------------------------------------------------------------------
-- Invitare e cacciare (membri della casata / inquilino / moderatori)
-- ---------------------------------------------------------------------
create or replace function public.invite_to_room(p_room uuid, p_name text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := public.room_controller(p_room);
  target uuid;
begin
  if me is null and not public.has_permission('chat.moderare') then
    raise exception 'Non puoi invitare in questa stanza.' using errcode = '42501';
  end if;
  select id into target from public.characters
  where lower(name) = lower(trim(p_name)) and status = 'attivo';
  if target is null then
    raise exception 'Nessun personaggio attivo con questo nome.' using errcode = 'P0001';
  end if;
  insert into public.room_guests (room_id, character_id, invited_by)
  values (p_room, target, me)
  on conflict do nothing;
end;
$$;

create or replace function public.expel_from_room(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.room_controller(p_room) is null and not public.has_permission('chat.moderare') then
    raise exception 'Non puoi cacciare nessuno da questa stanza.' using errcode = '42501';
  end if;
  delete from public.room_guests where room_id = p_room and character_id = p_character;
end;
$$;

revoke execute on function public.rent_room(uuid, uuid, int)   from public, anon;
revoke execute on function public.invite_to_room(uuid, text)   from public, anon;
revoke execute on function public.expel_from_room(uuid, uuid)  from public, anon;
grant execute on function public.rent_room(uuid, uuid, int)    to authenticated;
grant execute on function public.invite_to_room(uuid, text)    to authenticated;
grant execute on function public.expel_from_room(uuid, uuid)   to authenticated;

-- ---------------------------------------------------------------------
-- Archivio immagini di mappe e chat (caricamenti solo dal server)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mondo', 'mondo', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- La mappa di Westeros diventa quella attiva; quella di prova si spegne
-- ---------------------------------------------------------------------
insert into public.maps (name, description, image_url, sort_order, active)
values (
  'Westeros',
  'Le Terre della Corona e i regni che le circondano, affacciati sulla Baia delle Acque Nere e sul Mare Stretto.',
  'https://bhcrltoxlgwvckwvstmd.supabase.co/storage/v1/object/public/mondo/mappe/westeros.jpg',
  0,
  true
);
