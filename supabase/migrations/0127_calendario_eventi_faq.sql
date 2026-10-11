-- =====================================================================
-- 0127 - Calendario degli eventi e FAQ
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Calendario: master, moderatori e admin (chi puo' narrare o moderare la
-- chat) creano gli eventi; tutti li vedono e si iscrivono con il proprio
-- personaggio. Alla creazione arriva a tutti un messaggio di SISTEMA e
-- l'icona del calendario si accende finche' non lo si apre.
-- FAQ: sezioni (i menu a tendina) con dentro domande e risposte; le scrive
-- chi ha il permesso "documentazione.scrivere", come le guide.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Eventi
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 6000),
  place       text not null default '' check (char_length(place) <= 120),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  max_signups int check (max_signups between 1 and 10000),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  author_name text not null default '',
  created_at  timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists events_starts_idx on public.events (starts_at);

create table if not exists public.event_signups (
  event_id     uuid not null references public.events(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (event_id, character_id)
);

-- quando ho aperto il calendario l'ultima volta (per accendere l'icona)
create table if not exists public.events_seen (
  user_id uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  seen_at timestamptz not null default now()
);

alter table public.events        enable row level security;
alter table public.event_signups enable row level security;
alter table public.events_seen   enable row level security;

drop policy if exists "eventi visibili" on public.events;
create policy "eventi visibili" on public.events for select to authenticated using (true);
drop policy if exists "eventi: staff" on public.events;
create policy "eventi: staff" on public.events for all to authenticated
  using (public.can_master_mode()) with check (public.can_master_mode());
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.events to service_role;

drop policy if exists "iscrizioni visibili" on public.event_signups;
create policy "iscrizioni visibili" on public.event_signups for select to authenticated using (true);
drop policy if exists "mi iscrivo" on public.event_signups;
create policy "mi iscrivo" on public.event_signups for insert to authenticated
  with check (public.is_my_character(character_id));
drop policy if exists "tolgo l'iscrizione" on public.event_signups;
create policy "tolgo l'iscrizione" on public.event_signups for delete to authenticated
  using (public.is_my_character(character_id) or public.can_master_mode());
grant select, insert, delete on public.event_signups to authenticated;
grant select, insert, update, delete on public.event_signups to service_role;

drop policy if exists "il mio segno" on public.events_seen;
create policy "il mio segno" on public.events_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.events_seen to authenticated;
grant select, insert, update, delete on public.events_seen to service_role;

-- Posti esauriti: non ci si iscrive oltre il massimo
create or replace function public.event_signup_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_max int;
begin
  select max_signups into v_max from public.events where id = new.event_id for update;
  if v_max is not null and (select count(*) from public.event_signups where event_id = new.event_id) >= v_max then
    raise exception 'I posti per questo evento sono esauriti.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists event_signup_guard on public.event_signups;
create trigger event_signup_guard before insert on public.event_signups
  for each row execute function public.event_signup_guard();

-- Nuovo evento: nome di chi lo crea e messaggio di SISTEMA a tutti i personaggi dei giocatori
create or replace function public.event_announce()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.system_messages (character_id, body)
  select c.id,
         'Nuovo evento in calendario: "' || new.title || '", ' ||
         to_char(new.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI') ||
         case when new.place <> '' then ' — ' || new.place else '' end ||
         '. Apri il Calendario per i dettagli e per iscriverti.'
  from public.characters c
  where not c.is_npc and c.owner_id is not null;
  return new;
end;
$$;
drop trigger if exists event_announce on public.events;
create trigger event_announce after insert on public.events
  for each row execute function public.event_announce();

-- Aggiornamenti in tempo reale (icona che si accende, iscritti)
do $$
declare t text;
begin
  foreach t in array array['events', 'event_signups']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- FAQ: sezioni (menu a tendina) e domande
-- ---------------------------------------------------------------------
create table if not exists public.faq_sections (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.faq_items (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.faq_sections(id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 300),
  answer     text not null default '' check (char_length(answer) <= 20000),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists faq_items_section_idx on public.faq_items (section_id, sort_order);

alter table public.faq_sections enable row level security;
alter table public.faq_items    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['faq_sections', 'faq_items']
  loop
    execute format('drop policy if exists "faq visibili" on public.%I', t);
    execute format('create policy "faq visibili" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "faq: chi scrive la documentazione" on public.%I', t);
    execute format('create policy "faq: chi scrive la documentazione" on public.%I for all to authenticated
                      using (public.has_permission(''documentazione.scrivere''))
                      with check (public.has_permission(''documentazione.scrivere''))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
