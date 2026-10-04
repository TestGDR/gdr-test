-- =====================================================================
-- 0057 - Missive sui percorsi dei viaggi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- (dopo la 0056)
--
-- - Corvo: nuova colonna nei percorsi, con il tempo di volo di quella
--   tratta. Il corvo vola lungo le tratte con un tempo per il corvo (anche
--   con piu' tappe), solo tra castelli o citta'.
-- - Staffetta: lungo i percorsi, per ogni tratta il piu' veloce tra a
--   cavallo e per mare, "di fretta".
-- - Senza strada il cartiglio non parte.
-- =====================================================================

alter table public.travel_routes add column raven_minutes int check (raven_minutes between 1 and 1000000);
alter table public.travel_routes drop constraint if exists travel_routes_un_mezzo;
alter table public.travel_routes add constraint travel_routes_un_mezzo
  check (coalesce(walk_minutes, horse_minutes, dragon_minutes, ship_minutes, raven_minutes) is not null);

-- Strada piu' breve: anche per la staffetta (cavallo o mare, il piu' veloce) e il corvo
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

-- Come e in quanto tempo arriva un cartiglio. method = null: nessuna strada
create or replace function public.scroll_route(p_from uuid, p_to uuid, p_from_location uuid default null)
returns table (method text, minutes int, risky boolean, from_name text, to_name text)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  a public.locations;
  b public.locations;
  ma public.maps;
  mb public.maps;
  s public.missive_settings;
  v_raven int;
  v_rider int;
begin
  select * into s from public.missive_settings;
  select * into a from public.locations where id = coalesce(p_from_location, public.character_location(p_from));
  select * into b from public.locations where id = public.character_location(p_to);
  select * into ma from public.maps where id = a.map_id;
  select * into mb from public.maps where id = b.map_id;
  risky := not (coalesce(ma.safe, false) and coalesce(mb.safe, false));

  if a.id is not null and a.id = b.id then
    return query select 'paggio'::text, 0, false, a.name, b.name;
    return;
  end if;

  -- corvo: tra due castelli o citta', lungo le rotte dei corvi
  if coalesce(a.has_ravens, false) and coalesce(b.has_ravens, false) then
    v_raven := public.travel_base_minutes(a.id, b.id, 'corvo');
    if v_raven is not null then
      return query select 'corvo'::text, greatest(1, v_raven), risky, a.name, b.name;
      return;
    end if;
  end if;

  -- staffetta: a cavallo o per mare, di fretta
  v_rider := public.travel_base_minutes(a.id, b.id, 'staffetta');
  if v_rider is not null then
    return query select 'staffetta'::text, greatest(1, round(v_rider * s.pace_fast_factor)::int), risky, a.name, b.name;
    return;
  end if;

  return query select null::text, null::int, risky, a.name, b.name;
end;
$$;

create or replace function public.send_scroll(p_from uuid, p_to uuid, p_body text, p_signed boolean, p_from_location uuid default null)
returns table (method text, deliver_at timestamptz)
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  s public.missive_settings;
  v_from public.characters;
  v_to public.characters;
  v_origin uuid := public.scroll_origin(p_from_location);
  v_intercepted boolean := false;
  v_deliver timestamptz;
begin
  select * into v_from from public.characters where id = p_from;
  select * into v_to from public.characters where id = p_to;
  if v_from.id is null or v_from.owner_id <> auth.uid() then raise exception 'Personaggio non valido'; end if;
  if v_from.status <> 'attivo' then raise exception 'Il personaggio non e'' ancora attivo'; end if;
  if v_to.id is null or v_to.id = v_from.id then raise exception 'Destinatario non valido'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'Testo non valido'; end if;

  select * into s from public.missive_settings;
  select * into r from public.scroll_route(p_from, p_to, v_origin);
  if r.method is null then raise exception 'Nessuna strada per raggiungere il destinatario'; end if;
  v_deliver := now() + make_interval(mins => r.minutes);
  if r.method <> 'paggio' and r.risky then
    v_intercepted := random() * 100 < (case when r.method = 'corvo' then s.raven_intercept_pct else s.rider_intercept_pct end);
  end if;

  insert into public.scrolls (sender_id, sender_name, recipient_id, recipient_name, body, signed, method,
                              from_location, to_location, deliver_at, intercepted)
  values (v_from.id, v_from.name, v_to.id, v_to.name, trim(p_body), coalesce(p_signed, true), r.method,
          coalesce(v_origin, public.character_location(p_from)), public.character_location(p_to), v_deliver, v_intercepted);

  if not v_intercepted then
    insert into public.scroll_notices (character_id, deliver_at) values (v_to.id, v_deliver);
  end if;
  update public.online_status set last_action = now(), last_seen = now() where user_id = auth.uid();
  return query select r.method, v_deliver;
end;
$$;
