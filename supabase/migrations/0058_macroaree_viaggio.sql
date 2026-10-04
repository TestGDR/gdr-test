-- =====================================================================
-- 0058 - Macroaree di viaggio: per terra e per mare
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni macroarea ha un tipo: luogo (citta', castelli...), viaggio per
-- terra, viaggio per mare.
-- - Chi e' in viaggio a piedi, a cavallo o in drago gioca solo nelle chat
--   "viaggio per terra"; per mare solo in quelle "viaggio per mare"; in
--   entrambi i casi della mappa di partenza o di arrivo.
-- - Chi e' in viaggio non entra nelle chat dei luoghi (le chat OFF, cioe'
--   delle macroaree che non sono "luogo di gioco", restano aperte).
-- - Chi non e' in viaggio non entra nelle chat di viaggio.
-- - Lo staff che modera le chat entra ovunque.
-- - Le macroaree di viaggio non sono destinazioni e non spostano il PG.
-- =====================================================================

alter table public.locations add column kind text not null default 'luogo'
  check (kind in ('luogo', 'viaggio_terra', 'viaggio_mare'));

-- Il viaggio in corso del personaggio principale dell'utente (se c'e')
create or replace function public.my_active_travel()
returns public.travels
language sql stable
security definer set search_path = ''
as $$
  select t.* from public.travels t
  where t.status = 'in_viaggio'
    and t.character_id = (select id from public.characters where owner_id = auth.uid() order by created_at limit 1)
  limit 1;
$$;

create or replace function public.can_enter_room(r uuid)
returns boolean
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_loc public.locations;
  v_travel public.travels;
  ro public.rooms;
begin
  if public.has_permission('chat.moderare') then
    return exists (select 1 from public.rooms where id = r);
  end if;
  if not public.room_on_active_map(r) then return false; end if;

  select * into ro from public.rooms where id = r;
  if ro.id is null then return false; end if;
  select * into v_loc from public.locations where id = ro.location_id;
  v_travel := public.my_active_travel();

  -- chat di viaggio: solo in viaggio, con il mezzo giusto, nella mappa di partenza o di arrivo
  if v_loc.kind <> 'luogo' then
    if v_travel.id is null then return false; end if;
    if (v_loc.kind = 'viaggio_mare') <> (v_travel.mode = 'nave') then return false; end if;
    if v_loc.map_id not in (
      select l.map_id from public.locations l where l.id in (v_travel.from_location, v_travel.to_location)
    ) then return false; end if;
  elsif v_travel.id is not null and v_loc.in_game then
    -- in viaggio non si gioca nei luoghi
    return false;
  end if;

  return case ro.access
    when 'pubblica' then true
    when 'casata' then
      exists (select 1 from public.characters c where c.owner_id = auth.uid() and c.house_id = ro.house_id)
      or public.is_room_guest(r)
    when 'affitto' then
      (public.active_rental(r)).id is not null
      and (public.room_controller(r) is not null or public.is_room_guest(r))
    else false
  end;
end;
$$;

-- Perche' non si puo' entrare (per spiegarlo nella pagina della chat)
create or replace function public.room_travel_block(r uuid)
returns text
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_kind text;
  v_in_game boolean;
  v_travel public.travels;
begin
  select l.kind, l.in_game into v_kind, v_in_game
  from public.rooms ro join public.locations l on l.id = ro.location_id where ro.id = r;
  v_travel := public.my_active_travel();
  if v_kind is null then return null; end if;
  if v_kind <> 'luogo' and v_travel.id is null then return 'non_in_viaggio'; end if;
  if v_kind <> 'luogo' then return 'viaggio_diverso'; end if;
  if v_travel.id is not null and v_in_game then return 'in_viaggio'; end if;
  return null;
end;
$$;
revoke execute on function public.room_travel_block(uuid) from public, anon;
grant execute on function public.room_travel_block(uuid) to authenticated;
revoke execute on function public.my_active_travel() from public, anon, authenticated;

-- Le macroaree di viaggio non spostano il PG...
create or replace function public.position_from_action()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.kind = 'azione'
     and not exists (select 1 from public.travels where character_id = new.character_id and status = 'in_viaggio') then
    update public.characters c set location_id = l.id
    from public.rooms r join public.locations l on l.id = r.location_id
    where r.id = new.room_id and l.in_game and l.kind = 'luogo' and c.id = new.character_id;
  end if;
  return new;
end;
$$;

-- ...e non sono tappe ne' destinazioni dei viaggi e delle missive
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
  where l.in_game and l.kind = 'luogo' and (m.active or l.id = p_from);
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
    where l.id = p_to and l.in_game and l.kind = 'luogo' and m.active
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

-- Chat in cui puo' giocare il PG durante il viaggio (per il pannello Viaggio)
create or replace function public.travel_rooms(p_character uuid)
returns table (room_id uuid, room_name text, location_name text)
language sql stable
security definer set search_path = ''
as $$
  select ro.id, ro.name, l.name
  from public.travels t
  join public.locations ends on ends.id in (t.from_location, t.to_location)
  join public.locations l on l.map_id = ends.map_id
    and l.kind = case when t.mode = 'nave' then 'viaggio_mare' else 'viaggio_terra' end
  join public.rooms ro on ro.location_id = l.id
  where t.character_id = p_character and t.status = 'in_viaggio' and public.is_my_character(p_character)
  group by ro.id, ro.name, l.name, ro.sort_order
  order by l.name, ro.sort_order, ro.name;
$$;
revoke execute on function public.travel_rooms(uuid) from public, anon;
grant execute on function public.travel_rooms(uuid) to authenticated;
