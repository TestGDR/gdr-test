-- =====================================================================
-- 0055 - Viaggi per mare e tra mappe attraverso le macroaree
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Nuovo mezzo: per mare (nave). Solo lungo i percorsi con un tempo per mare.
-- - Ogni mappa ha un tempo standard per muoversi al suo interno.
-- - Tra mappe diverse si passa solo lungo i percorsi tra due macroaree
--   (es. Terre della Tempesta / Approdo <-> Dorne / Stepstones).
-- - Il viaggio segue la strada piu' breve, anche con piu' tappe, con lo
--   stesso mezzo. Un percorso con un mezzo vuoto blocca quel mezzo tra le
--   due macroaree (anche dentro la stessa mappa).
-- =====================================================================

alter table public.travel_routes add column ship_minutes int check (ship_minutes between 1 and 1000000);
alter table public.map_travel_times add column ship_minutes int check (ship_minutes between 1 and 1000000);

-- Controlli rifatti: almeno un mezzo; i tempi delle mappe sono solo "dentro la mappa"
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname from pg_constraint
    where contype = 'c' and conrelid in ('public.travel_routes'::regclass, 'public.map_travel_times'::regclass)
      and pg_get_constraintdef(oid) ilike '%coalesce%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
  for c in
    select conname from pg_constraint
    where contype = 'c' and conrelid = 'public.map_travel_times'::regclass and pg_get_constraintdef(oid) ilike '%<=%'
  loop
    execute format('alter table public.map_travel_times drop constraint %I', c.conname);
  end loop;
  for c in
    select conname from pg_constraint
    where contype = 'c' and conrelid = 'public.travels'::regclass and pg_get_constraintdef(oid) ilike '%piedi%'
  loop
    execute format('alter table public.travels drop constraint %I', c.conname);
  end loop;
end $$;

delete from public.map_travel_times where map_a <> map_b;
alter table public.travel_routes add constraint travel_routes_un_mezzo
  check (coalesce(walk_minutes, horse_minutes, dragon_minutes, ship_minutes) is not null);
alter table public.map_travel_times add constraint map_travel_times_dentro check (map_a = map_b);
alter table public.map_travel_times add constraint map_travel_times_un_mezzo
  check (coalesce(walk_minutes, horse_minutes, dragon_minutes, ship_minutes) is not null);
alter table public.travels add constraint travels_mezzo check (mode in ('piedi', 'cavallo', 'nave', 'drago'));

-- ---------------------------------------------------------------------
-- Strada piu' breve da un luogo verso tutti gli altri, con un mezzo
-- (Dijkstra: i luoghi sono pochi, tutto in memoria)
-- ---------------------------------------------------------------------
create or replace function public.travel_distances(p_from uuid, p_mode text)
returns table (location_id uuid, minutes int)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  nodes uuid[];
  node_map jsonb;
  routes jsonb;
  inmap jsonb;
  dist jsonb;
  done jsonb := '{}';
  cur uuid;
  cur_d int;
  n uuid;
  k text;
  cost int;
begin
  select array_agg(l.id), jsonb_object_agg(l.id::text, l.map_id::text) into nodes, node_map
  from public.locations l join public.maps m on m.id = l.map_id
  where l.in_game and (m.active or l.id = p_from);
  if p_from is null or nodes is null or not (p_from = any(nodes)) then return; end if;

  -- percorsi: chiave "a|b" -> minuti con questo mezzo (null = bloccato)
  select coalesce(jsonb_object_agg(r.location_a::text || '|' || r.location_b::text,
           case p_mode when 'drago' then r.dragon_minutes when 'cavallo' then r.horse_minutes
                       when 'nave' then r.ship_minutes else r.walk_minutes end), '{}')
    into routes from public.travel_routes r;
  -- dentro ogni mappa
  select coalesce(jsonb_object_agg(t.map_a::text,
           case p_mode when 'drago' then t.dragon_minutes when 'cavallo' then t.horse_minutes
                       when 'nave' then t.ship_minutes else t.walk_minutes end), '{}')
    into inmap from public.map_travel_times t where t.map_a = t.map_b;

  dist := jsonb_build_object(p_from::text, 0);
  loop
    select e.key::uuid, e.value::int into cur, cur_d
    from jsonb_each_text(dist) e
    where not (done ? e.key)
    order by e.value::int
    limit 1;
    exit when cur is null;
    done := done || jsonb_build_object(cur::text, true);

    foreach n in array nodes loop
      continue when n = cur or done ? n::text;
      k := least(cur, n)::text || '|' || greatest(cur, n)::text;
      if routes ? k then
        cost := (routes ->> k)::int;                         -- percorso (null = bloccato)
      elsif node_map ->> cur::text = node_map ->> n::text then
        cost := (inmap ->> (node_map ->> cur::text))::int;   -- stessa mappa: tempo standard
      else
        cost := null;                                        -- mappe diverse senza percorso
      end if;
      if cost is not null and (not (dist ? n::text) or (dist ->> n::text)::int > cur_d + cost) then
        dist := jsonb_set(dist, array[n::text], to_jsonb(cur_d + cost));
      end if;
    end loop;
    cur := null;
  end loop;

  return query select e.key::uuid, e.value::int from jsonb_each_text(dist) e where e.key::uuid <> p_from;
end;
$$;
revoke execute on function public.travel_distances(uuid, text) from public, anon, authenticated;

create or replace function public.travel_base_minutes(p_from uuid, p_to uuid, p_mode text)
returns int
language sql stable
security definer set search_path = ''
as $$
  select d.minutes from public.travel_distances(p_from, p_mode) d where d.location_id = p_to;
$$;

drop function if exists public.travel_options(uuid);
create or replace function public.travel_options(p_character uuid)
returns table (location_id uuid, name text, map_name text, walk int, horse int, ship int, dragon int)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  v_here uuid := public.character_location(p_character);
begin
  if not public.is_my_character(p_character) then return; end if;
  return query
    select l.id, l.name, m.name, w.minutes, h.minutes, s.minutes, d.minutes
    from public.locations l
    join public.maps m on m.id = l.map_id
    left join public.travel_distances(v_here, 'piedi') w on w.location_id = l.id
    left join public.travel_distances(v_here, 'cavallo') h on h.location_id = l.id
    left join public.travel_distances(v_here, 'nave') s on s.location_id = l.id
    left join public.travel_distances(v_here, 'drago') d on d.location_id = l.id
    where l.in_game and m.active and l.id is distinct from v_here
      and coalesce(w.minutes, h.minutes, s.minutes, d.minutes) is not null
    order by m.name, l.name;
end;
$$;
revoke execute on function public.travel_options(uuid) from public, anon;
grant execute on function public.travel_options(uuid) to authenticated;

-- Partenza: anche per mare
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
  if p_mode not in ('piedi', 'cavallo', 'nave', 'drago') or p_pace not in ('calma', 'normale', 'fretta') then raise exception 'Viaggio non valido'; end if;
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
