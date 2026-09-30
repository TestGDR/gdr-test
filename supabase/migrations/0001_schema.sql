-- =====================================================================
-- GDR Play By Chat - schema iniziale
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- PROFILI (un profilo per ogni utente registrato)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (char_length(username) between 3 and 30),
  role        text not null default 'player' check (role in ('player', 'master', 'admin')),
  created_at  timestamptz not null default now()
);

-- Crea automaticamente il profilo quando un utente si registra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vero se l'utente corrente e' master o admin
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('master', 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- PERSONAGGI
-- ---------------------------------------------------------------------
create table public.characters (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name         text not null unique check (char_length(name) between 2 and 40),
  description  text not null default '' check (char_length(description) <= 4000),
  avatar_url   text,
  created_at   timestamptz not null default now()
);
create index characters_owner_idx on public.characters(owner_id);

-- ---------------------------------------------------------------------
-- MAPPE, LUOGHI (punti sulla mappa) e LISTE (chat dentro un luogo)
-- ---------------------------------------------------------------------
create table public.maps (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  image_url    text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.locations (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references public.maps(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  image_url    text,
  -- posizione del punto sulla mappa, in percentuale (0-100)
  x            numeric(5,2) not null check (x between 0 and 100),
  y            numeric(5,2) not null check (y between 0 and 100),
  created_at   timestamptz not null default now()
);
create index locations_map_idx on public.locations(map_id);

create table public.rooms (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index rooms_location_idx on public.rooms(location_id);

-- ---------------------------------------------------------------------
-- MESSAGGI delle liste
--   azione      = cosa fa/dice il personaggio
--   fuori_gioco = commento del giocatore (OFF)
--   master      = narrazione del master (solo staff)
-- ---------------------------------------------------------------------
create table public.messages (
  id              bigint generated always as identity primary key,
  room_id         uuid not null references public.rooms(id) on delete cascade,
  character_id    uuid not null references public.characters(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  character_name  text not null default '',
  kind            text not null default 'azione' check (kind in ('azione', 'fuori_gioco', 'master')),
  content         text not null check (char_length(content) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index messages_room_created_idx on public.messages(room_id, created_at desc);

-- Imposta autore e nome del personaggio lato server (non falsificabili dal client)
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  new.created_at := now();
  select c.name into new.character_name
  from public.characters c
  where c.id = new.character_id;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------
-- PERMESSI DATA API
-- Espliciti, cosi' funziona anche con "Automatically expose new tables"
-- disattivato. Solo gli utenti loggati accedono; le RLS sotto decidono
-- quali righe possono leggere/scrivere.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select                  on public.profiles   to authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select, insert, update, delete on public.maps       to authenticated;
grant select, insert, update, delete on public.locations  to authenticated;
grant select, insert, update, delete on public.rooms      to authenticated;
grant select, insert, delete  on public.messages   to authenticated;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.characters enable row level security;
alter table public.maps       enable row level security;
alter table public.locations  enable row level security;
alter table public.rooms      enable row level security;
alter table public.messages   enable row level security;

-- Profili: tutti gli utenti loggati li vedono; ognuno modifica solo il proprio username
create policy "profili visibili" on public.profiles
  for select to authenticated using (true);
create policy "modifica proprio profilo" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (username) on public.profiles to authenticated;

-- Personaggi
create policy "personaggi visibili" on public.characters
  for select to authenticated using (true);
create policy "crea propri personaggi" on public.characters
  for insert to authenticated with check (owner_id = auth.uid());
create policy "modifica propri personaggi" on public.characters
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "elimina propri personaggi" on public.characters
  for delete to authenticated using (owner_id = auth.uid());

-- Mappe / luoghi / liste: lettura per tutti i loggati, scrittura solo staff
create policy "mappe visibili"   on public.maps      for select to authenticated using (true);
create policy "mappe staff"      on public.maps      for all    to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "luoghi visibili"  on public.locations for select to authenticated using (true);
create policy "luoghi staff"     on public.locations for all    to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "liste visibili"   on public.rooms     for select to authenticated using (true);
create policy "liste staff"      on public.rooms     for all    to authenticated using (public.is_staff()) with check (public.is_staff());

-- Messaggi
create policy "messaggi visibili" on public.messages
  for select to authenticated using (true);
create policy "scrivi con il proprio personaggio" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.owner_id = auth.uid()
    )
    and (kind <> 'master' or public.is_staff())
  );
create policy "elimina propri messaggi o staff" on public.messages
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------
-- REALTIME: i nuovi messaggi vengono inviati ai client in tempo reale
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
