-- =====================================================================
-- 0173 - Mappa interattiva
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Utility -> Mappa interattiva (si apre in una nuova scheda): immagine di
-- sfondo con confini, strade e luoghi d'interesse. Tutti la guardano; la
-- modifica chi ha il permesso "mappa.gestire" (admin sempre, e il ruolo
-- Moderatore).
-- Le coordinate sono in pixel dell'immagine di sfondo.
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

-- Sfondo (una riga sola)
create table if not exists public.interactive_map (
  id          int primary key default 1 check (id = 1),
  image_url   text check (image_url is null or image_url like 'https://%'),
  width       int not null default 2000 check (width between 100 and 20000),
  height      int not null default 2000 check (height between 100 and 20000),
  updated_at  timestamptz not null default now()
);
insert into public.interactive_map (id) values (1) on conflict (id) do nothing;

-- Confini (poligoni), strade (linee) e luoghi (punti)
create table if not exists public.map_features (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('confine', 'strada', 'luogo')),
  name         text not null default '' check (char_length(name) <= 80),
  description  text not null default '' check (char_length(description) <= 2000),
  color        text not null default '#c9a45c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  place_type   text check (place_type is null or place_type in ('castello', 'citta', 'villaggio', 'porto', 'tempio', 'rovine', 'altro')),
  house_id     uuid references public.houses(id) on delete set null,
  geometry     jsonb not null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists map_features_kind_idx on public.map_features (kind);

alter table public.interactive_map enable row level security;
alter table public.map_features enable row level security;

drop policy if exists "mappa visibile" on public.interactive_map;
create policy "mappa visibile" on public.interactive_map for select to authenticated using (true);
drop policy if exists "mappa dello staff" on public.interactive_map;
create policy "mappa dello staff" on public.interactive_map for update to authenticated
  using (public.has_permission('mappa.gestire')) with check (public.has_permission('mappa.gestire'));

drop policy if exists "elementi visibili" on public.map_features;
create policy "elementi visibili" on public.map_features for select to authenticated using (true);
drop policy if exists "elementi dello staff" on public.map_features;
create policy "elementi dello staff" on public.map_features for all to authenticated
  using (public.has_permission('mappa.gestire')) with check (public.has_permission('mappa.gestire'));

grant select, update on public.interactive_map to authenticated;
grant select, insert, update, delete on public.map_features to authenticated;
grant select on public.interactive_map, public.map_features to service_role;

-- il permesso al ruolo dei moderatori (gli admin lo hanno sempre)
update public.staff_roles
  set permissions = array_append(coalesce(permissions, '{}'), 'mappa.gestire')
  where name ilike '%moderat%'
    and not ('mappa.gestire' = any(coalesce(permissions, '{}')));
