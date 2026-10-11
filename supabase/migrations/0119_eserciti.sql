-- =====================================================================
-- 0119 - Eserciti, potenza delle casate e dei regni
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Tipi di truppa (Gestione -> Eserciti): attacco e difesa per ogni unita',
--   piu' i punti di forza o di debolezza contro gli altri tipi di truppa
--   (come carta, forbice e sasso).
-- - Ogni casata, PG o PNG, ha le sue truppe (tipo e quantita').
-- - Regni: gruppi di casate.
-- - Potenza di una casata = punti delle truppe + attacco e difesa delle
--   strutture dei suoi feudi. Potenza di un regno = somma delle sue casate.
-- - L'esercito di una casata lo vedono i suoi membri e chi ha il permesso
--   "eserciti.gestire"; tipi di truppa e regni li vedono tutti.
-- =====================================================================

create table public.troop_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  attack      int not null default 0 check (attack between 0 and 1000000),
  defense     int not null default 0 check (defense between 0 and 1000000),
  sort_order  int not null default 0
);
create unique index troop_types_name_key on public.troop_types (lower(name));

-- Punti in piu' (o in meno) di una truppa quando affronta un altro tipo
create table public.troop_matchups (
  troop_type_id uuid not null references public.troop_types(id) on delete cascade,
  against_id    uuid not null references public.troop_types(id) on delete cascade,
  modifier      int not null check (modifier between -1000000 and 1000000 and modifier <> 0),
  primary key (troop_type_id, against_id),
  check (troop_type_id <> against_id)
);

create table public.house_troops (
  house_id      uuid not null references public.houses(id) on delete cascade,
  troop_type_id uuid not null references public.troop_types(id) on delete cascade,
  quantity      int not null check (quantity between 1 and 100000000),
  primary key (house_id, troop_type_id)
);

create table public.kingdoms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  sort_order  int not null default 0
);
create unique index kingdoms_name_key on public.kingdoms (lower(name));

-- A quale regno appartiene una casata (al massimo uno)
create table public.house_kingdoms (
  house_id   uuid primary key references public.houses(id) on delete cascade,
  kingdom_id uuid not null references public.kingdoms(id) on delete cascade
);
create index house_kingdoms_kingdom_idx on public.house_kingdoms(kingdom_id);

alter table public.troop_types    enable row level security;
alter table public.troop_matchups enable row level security;
alter table public.house_troops   enable row level security;
alter table public.kingdoms       enable row level security;
alter table public.house_kingdoms enable row level security;

do $$
declare t text;
begin
  foreach t in array array['troop_types', 'troop_matchups', 'kingdoms', 'house_kingdoms']
  loop
    execute format('create policy "visibili" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "eserciti con permesso" on public.%I for all to authenticated
                      using (public.has_permission(''eserciti.gestire'')) with check (public.has_permission(''eserciti.gestire''))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

create policy "esercito della casata" on public.house_troops for select to authenticated
  using (public.is_house_member(house_id) or public.has_permission('eserciti.gestire'));
create policy "eserciti con permesso" on public.house_troops for all to authenticated
  using (public.has_permission('eserciti.gestire')) with check (public.has_permission('eserciti.gestire'));
grant select, insert, update, delete on public.house_troops to authenticated;
grant select, insert, update, delete on public.house_troops to service_role;
