-- =====================================================================
-- 0056 - Viaggi solo lungo i percorsi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Niente piu' tempi standard dentro le mappe: si viaggia solo lungo i
-- percorsi tra macroaree (anche di mappe diverse), con piu' tappe se
-- serve, seguendo la strada piu' breve con lo stesso mezzo.
-- =====================================================================

create or replace function public.travel_distances(p_from uuid, p_mode text)
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
  where l.in_game and (m.active or l.id = p_from);
  if p_from is null or nodes is null or not (p_from = any(nodes)) then return; end if;

  -- percorsi: chiave "a|b" -> minuti con questo mezzo (null = con quel mezzo non si puo')
  select coalesce(jsonb_object_agg(r.location_a::text || '|' || r.location_b::text,
           case p_mode when 'drago' then r.dragon_minutes when 'cavallo' then r.horse_minutes
                       when 'nave' then r.ship_minutes else r.walk_minutes end), '{}')
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
      cost := case when routes ? k then (routes ->> k)::int end; -- nessun percorso = nessuna strada
      if cost is not null and (not (dist ? n::text) or (dist ->> n::text)::int > cur_d + cost) then
        dist := jsonb_set(dist, array[n::text], to_jsonb(cur_d + cost));
      end if;
    end loop;
    cur := null;
  end loop;

  return query select e.key::uuid, e.value::int from jsonb_each_text(dist) e where e.key::uuid <> p_from;
end;
$$;

drop table if exists public.map_travel_times;
