-- =====================================================================
-- 0010 - Casate: ruoli e stipendi, albero genealogico, PNG, PG membri
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Tutti possono vedere le casate; le gestisce solo chi ha il permesso
-- "casate.gestire" (nel pannello Ruoli & Permessi).
-- =====================================================================

create table public.houses (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 40), -- = cognome dei membri
  description  text not null default '' check (char_length(description) <= 8000),
  sigil_url    text,   -- stemma (immagine nell'archivio "casate")
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create unique index houses_name_lower_key on public.houses (lower(name));

-- Ruoli disponibili nella casata, con lo stipendio giornaliero
create table public.house_roles (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references public.houses(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 40),
  daily_salary  int  not null default 0 check (daily_salary between 0 and 1000000),
  sort_order    int  not null default 0,
  unique (house_id, name)
);

-- Albero genealogico: ogni membro puo' avere un genitore (linea di discendenza)
create table public.house_family_members (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid not null references public.houses(id) on delete cascade,
  parent_id   uuid references public.house_family_members(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 80),
  spouse      text not null default '' check (char_length(spouse) <= 80),
  note        text not null default '' check (char_length(note) <= 200),
  deceased    boolean not null default false,
  sort_order  int not null default 0
);
create index house_family_house_idx on public.house_family_members(house_id);

-- Personaggi non giocanti della casata
create table public.house_npcs (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references public.houses(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  title        text not null default '' check (char_length(title) <= 80),
  description  text not null default '' check (char_length(description) <= 4000),
  image_url    text,
  sort_order   int not null default 0
);
create index house_npcs_house_idx on public.house_npcs(house_id);

-- Appartenenza dei PG: casata e ruolo (li assegna lo staff)
alter table public.characters
  add column house_id      uuid references public.houses(id) on delete set null,
  add column house_role_id uuid references public.house_roles(id) on delete set null;
create index characters_house_idx on public.characters(house_id);

-- ---------------------------------------------------------------------
-- Sicurezza
-- ---------------------------------------------------------------------
alter table public.houses               enable row level security;
alter table public.house_roles          enable row level security;
alter table public.house_family_members enable row level security;
alter table public.house_npcs           enable row level security;

create policy "casate visibili"      on public.houses               for select to authenticated using (true);
create policy "ruoli casata visibili" on public.house_roles         for select to authenticated using (true);
create policy "alberi visibili"      on public.house_family_members for select to authenticated using (true);
create policy "png visibili"         on public.house_npcs           for select to authenticated using (true);

create policy "casate con permesso" on public.houses for all to authenticated
  using (public.has_permission('casate.gestire')) with check (public.has_permission('casate.gestire'));
create policy "ruoli casata con permesso" on public.house_roles for all to authenticated
  using (public.has_permission('casate.gestire')) with check (public.has_permission('casate.gestire'));
create policy "alberi con permesso" on public.house_family_members for all to authenticated
  using (public.has_permission('casate.gestire')) with check (public.has_permission('casate.gestire'));
create policy "png con permesso" on public.house_npcs for all to authenticated
  using (public.has_permission('casate.gestire')) with check (public.has_permission('casate.gestire'));

grant select, insert, update, delete on public.houses, public.house_roles,
  public.house_family_members, public.house_npcs to authenticated;
grant select on public.houses, public.house_roles to service_role;

-- ---------------------------------------------------------------------
-- Archivio immagini (stemmi e ritratti dei PNG): leggibile da tutti,
-- i caricamenti li fa solo il server dopo aver controllato il permesso
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('casate', 'casate', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
