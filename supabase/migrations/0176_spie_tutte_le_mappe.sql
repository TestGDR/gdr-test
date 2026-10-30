-- Spie: possono andare in tutte le macroaree (luoghi in gioco) di tutte le
-- mappe, anche quelle non attive. I viaggi dei personaggi restano limitati
-- alle mappe attive.

-- ---------------------------------------------------------------------
-- Distanze: stesso calcolo di prima, con la scelta "tutte le mappe"
-- ---------------------------------------------------------------------
create or replace function public.travel_distances_core(p_from uuid, p_mode text, p_all_maps boolean)
returns table (location_id uuid, minutes int)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  nodes uuid[];
  routes jsonb;
  dist jsonb;
  done jsonb := '{}';
  cur uuid;
  cur_d int;
  n uuid;
  k text;
  cost int;
begin
  select array_agg(l.id) into nodes
  from public.locations l join public.maps m on m.id = l.map_id
  where l.in_game and l.kind = 'luogo' and (p_all_maps or m.active or l.id = p_from);
  if p_from is null or nodes is null or not (p_from = any(nodes)) then return; end if;

  select coalesce(jsonb_object_agg(r.location_a::text || '|' || r.location_b::text,
           case p_mode
             when 'drago' then r.dragon_minutes
             when 'cavallo' then r.horse_minutes
             when 'nave' then r.ship_minutes
             when 'corvo' then r.raven_minutes
             when 'staffetta' then least(r.horse_minutes, r.ship_minutes)
             else r.walk_minutes end), '{}')
    into routes from public.travel_routes r;

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
      cost := case when routes ? k then (routes ->> k)::int end;
      if cost is not null and (not (dist ? n::text) or (dist ->> n::text)::int > cur_d + cost) then
        dist := jsonb_set(dist, array[n::text], to_jsonb(cur_d + cost));
      end if;
    end loop;
    cur := null;
  end loop;

  return query select e.key::uuid, e.value::int from jsonb_each_text(dist) e where e.key::uuid <> p_from;
end;
$$;
revoke execute on function public.travel_distances_core(uuid, text, boolean) from public, anon, authenticated;

-- Viaggi, missive e il resto: come prima, solo mappe attive
create or replace function public.travel_distances(p_from uuid, p_mode text)
returns table (location_id uuid, minutes int)
language sql stable
security definer set search_path = ''
as $$
  select * from public.travel_distances_core(p_from, p_mode, false);
$$;
revoke execute on function public.travel_distances(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tempo della staffetta di una spia: tutte le mappe
-- ---------------------------------------------------------------------
create or replace function public.spy_travel_minutes(p_character uuid, p_location uuid)
returns int
language plpgsql stable
security definer set search_path = ''
as $$
declare
  v_from uuid := public.character_location(p_character);
  v_base int;
  v_factor numeric;
begin
  if v_from is null or p_location is null then return null; end if;
  if v_from = p_location then return 0; end if;
  select d.minutes into v_base from public.travel_distances_core(v_from, 'staffetta', true) d
  where d.location_id = p_location;
  if v_base is null then return null; end if;
  select pace_fast_factor into v_factor from public.missive_settings;
  return greatest(1, round(v_base * coalesce(v_factor, 1))::int);
end;
$$;

-- ---------------------------------------------------------------------
-- Elenco delle destinazioni per le spie, con la mappa a cui appartengono
-- (i giocatori non vedono i luoghi delle mappe spente: li legge questa funzione)
-- ---------------------------------------------------------------------
create or replace function public.spy_places()
returns table (id uuid, name text, map_id uuid, map_name text)
language sql stable
security definer set search_path = ''
as $$
  select l.id, l.name, m.id, m.name
  from public.locations l join public.maps m on m.id = l.map_id
  where l.kind = 'luogo' and l.in_game
  order by m.sort_order, m.name, l.name;
$$;
revoke execute on function public.spy_places() from public, anon;
grant execute on function public.spy_places() to authenticated;
