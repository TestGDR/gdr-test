-- =====================================================================
-- 0054 - Gestione dei viaggi: percorsi, tempi tra mappe, andature
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- (dopo la 0053)
--
-- I tempi dei viaggi li decide lo staff:
-- - Percorsi: tra due macroaree (in entrambi i sensi), un tempo per ogni
--   mezzo. Vuoto = con quel mezzo non si puo' (es. a piedi sul mare).
-- - Tempi tra mappe: per una coppia di mappe (anche una mappa con se
--   stessa = dentro quella mappa); valgono tra una qualsiasi macroarea
--   dell'una e una dell'altra, se non c'e' un percorso piu' preciso.
-- - Andature: con calma / di fretta moltiplicano il tempo.
-- Si viaggia solo verso luoghi di gioco di mappe attive, raggiungibili.
-- =====================================================================

alter table public.missive_settings
  add column pace_slow_factor numeric not null default 1.5 check (pace_slow_factor between 0.1 and 10),
  add column pace_fast_factor numeric not null default 0.75 check (pace_fast_factor between 0.1 and 10);

-- Percorsi tra due macroaree (minuti; vuoto = non percorribile con quel mezzo)
create table public.travel_routes (
  location_a      uuid not null references public.locations(id) on delete cascade,
  location_b      uuid not null references public.locations(id) on delete cascade,
  walk_minutes    int check (walk_minutes between 1 and 1000000),
  horse_minutes   int check (horse_minutes between 1 and 1000000),
  dragon_minutes  int check (dragon_minutes between 1 and 1000000),
  primary key (location_a, location_b),
  check (location_a < location_b),
  check (coalesce(walk_minutes, horse_minutes, dragon_minutes) is not null)
);

-- Tempi tra due mappe (map_a = map_b: dentro la stessa mappa)
create table public.map_travel_times (
  map_a           uuid not null references public.maps(id) on delete cascade,
  map_b           uuid not null references public.maps(id) on delete cascade,
  walk_minutes    int check (walk_minutes between 1 and 1000000),
  horse_minutes   int check (horse_minutes between 1 and 1000000),
  dragon_minutes  int check (dragon_minutes between 1 and 1000000),
  primary key (map_a, map_b),
  check (map_a <= map_b),
  check (coalesce(walk_minutes, horse_minutes, dragon_minutes) is not null)
);

alter table public.travel_routes enable row level security;
alter table public.map_travel_times enable row level security;
create policy "percorsi dello staff" on public.travel_routes for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
create policy "tempi tra mappe dello staff" on public.map_travel_times for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
grant select, insert, update, delete on public.travel_routes, public.map_travel_times to authenticated;
grant select, insert, update, delete on public.travel_routes, public.map_travel_times to service_role;

-- Tempo (andatura normale) tra due luoghi con un mezzo:
-- percorso, altrimenti tempo tra le due mappe, altrimenti nessuna strada (null)
create or replace function public.travel_base_minutes(p_from uuid, p_to uuid, p_mode text)
returns int
language plpgsql stable
security definer set search_path = ''
as $$
declare
  r public.travel_routes;
  m public.map_travel_times;
  a uuid;
  b uuid;
begin
  select * into r from public.travel_routes where location_a = least(p_from, p_to) and location_b = greatest(p_from, p_to);
  if found then
    return case p_mode when 'drago' then r.dragon_minutes when 'cavallo' then r.horse_minutes else r.walk_minutes end;
  end if;
  select map_id into a from public.locations where id = p_from;
  select map_id into b from public.locations where id = p_to;
  select * into m from public.map_travel_times where map_a = least(a, b) and map_b = greatest(a, b);
  if found then
    return case p_mode when 'drago' then m.dragon_minutes when 'cavallo' then m.horse_minutes else m.walk_minutes end;
  end if;
  return null;
end;
$$;
revoke execute on function public.travel_base_minutes(uuid, uuid, text) from public, anon, authenticated;

-- Dove puo' andare il PG da dove si trova, e con quali mezzi (minuti ad andatura normale)
create or replace function public.travel_options(p_character uuid)
returns table (location_id uuid, name text, map_name text, walk int, horse int, dragon int)
language sql stable
security definer set search_path = ''
as $$
  select * from (
    select l.id, l.name, m.name,
           public.travel_base_minutes(public.character_location(p_character), l.id, 'piedi'),
           public.travel_base_minutes(public.character_location(p_character), l.id, 'cavallo'),
           public.travel_base_minutes(public.character_location(p_character), l.id, 'drago')
    from public.locations l join public.maps m on m.id = l.map_id
    where public.is_my_character(p_character)
      and l.in_game and m.active
      and l.id is distinct from public.character_location(p_character)
  ) t(location_id, name, map_name, walk, horse, dragon)
  where coalesce(walk, horse, dragon) is not null
  order by map_name, name;
$$;

drop function if exists public.travel_preview(uuid, uuid, text, text);
create or replace function public.travel_preview(p_character uuid, p_to uuid, p_mode text, p_pace text)
returns table (minutes int, from_name text, to_name text, can_fly boolean)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  s public.missive_settings;
  v_from uuid := public.character_location(p_character);
  v_base int;
begin
  if not public.is_my_character(p_character) then return; end if;
  select * into s from public.missive_settings;
  v_base := public.travel_base_minutes(v_from, p_to, p_mode);
  return query
    select case when v_base is null then null
                else greatest(1, round(v_base * case p_pace when 'fretta' then s.pace_fast_factor when 'calma' then s.pace_slow_factor else 1 end))::int end,
           (select name from public.locations where id = v_from),
           (select name from public.locations where id = p_to),
           public.can_fly(p_character);
end;
$$;

create or replace function public.start_travel(p_character uuid, p_to uuid, p_mode text, p_pace text)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  v_from uuid := public.character_location(p_character);
  v_minutes int;
  v_arrive timestamptz;
begin
  if not public.is_my_character(p_character) then raise exception 'Personaggio non valido'; end if;
  if p_mode not in ('piedi', 'cavallo', 'drago') or p_pace not in ('calma', 'normale', 'fretta') then raise exception 'Viaggio non valido'; end if;
  if not exists (
    select 1 from public.locations l join public.maps m on m.id = l.map_id
    where l.id = p_to and l.in_game and m.active
  ) then raise exception 'Destinazione non valida'; end if;
  if p_to = v_from then raise exception 'Sei gia'' in questo luogo'; end if;
  if p_mode = 'drago' and not public.can_fly(p_character) then raise exception 'Non hai un drago da cavalcare'; end if;
  if exists (select 1 from public.travels where character_id = p_character and status = 'in_viaggio') then
    raise exception 'Sei gia'' in viaggio';
  end if;

  select minutes into v_minutes from public.travel_preview(p_character, p_to, p_mode, p_pace);
  if v_minutes is null then raise exception 'Non c''e'' una strada per questo luogo con questo mezzo'; end if;
  v_arrive := now() + make_interval(mins => v_minutes);
  insert into public.travels (character_id, from_location, to_location, mode, pace, arrive_at)
  values (p_character, v_from, p_to, p_mode, p_pace, v_arrive);
  return v_arrive;
end;
$$;

revoke execute on function public.travel_options(uuid) from public, anon;
revoke execute on function public.travel_preview(uuid, uuid, text, text) from public, anon;
grant execute on function public.travel_options(uuid) to authenticated;
grant execute on function public.travel_preview(uuid, uuid, text, text) to authenticated;

-- Punto di partenza: per ogni mappa un tempo standard al suo interno
-- (a piedi 24 ore, a cavallo 8, in drago 1). Si cambia in Gestione -> Viaggi.
insert into public.map_travel_times (map_a, map_b, walk_minutes, horse_minutes, dragon_minutes)
select id, id, 1440, 480, 60 from public.maps
on conflict do nothing;
