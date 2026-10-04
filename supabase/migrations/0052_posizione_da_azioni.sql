-- =====================================================================
-- 0052 - Posizione del PG: cambia solo scrivendo un'azione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Entrare in una chat non sposta piu' il PG: si sposta quando scrive
-- un'azione (non fuori gioco, non narrazione da master) in una chat di un
-- luogo di gioco. Lo staff (admin o ruolo staff) puo' scegliere da dove
-- parte un cartiglio ("Parti da").
-- =====================================================================

-- Entrare in una chat non sposta piu' nessuno
drop function if exists public.set_position_from_room(uuid);

create or replace function public.position_from_action()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.kind = 'azione' then
    update public.characters c set location_id = l.id
    from public.rooms r join public.locations l on l.id = r.location_id
    where r.id = new.room_id and l.in_game and c.id = new.character_id;
  end if;
  return new;
end;
$$;
create trigger messages_position_from_action after insert on public.messages
  for each row execute function public.position_from_action();

-- ---------------------------------------------------------------------
-- Percorso, anteprima e invio con il luogo di partenza scelto (solo staff)
-- ---------------------------------------------------------------------
drop function if exists public.scroll_preview(uuid, uuid);
drop function if exists public.send_scroll(uuid, uuid, text, boolean);
drop function if exists public.scroll_route(uuid, uuid);

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
  v_full numeric;
  v_dist numeric;
begin
  select * into s from public.missive_settings;
  select * into a from public.locations where id = coalesce(p_from_location, public.character_location(p_from));
  select * into b from public.locations where id = public.character_location(p_to);
  select * into ma from public.maps where id = a.map_id;
  select * into mb from public.maps where id = b.map_id;

  if a.id is not null and a.id = b.id then
    return query select 'paggio'::text, 0, false, a.name, b.name;
    return;
  end if;

  method := case when coalesce(a.has_ravens, false) and coalesce(b.has_ravens, false) then 'corvo' else 'staffetta' end;
  v_full := case when method = 'corvo' then s.raven_full_hours else s.rider_full_hours end;
  if a.id is not null and b.id is not null and a.map_id = b.map_id then
    v_dist := least(sqrt(power(a.x - b.x, 2) + power(a.y - b.y, 2)) / 100, 1.5);
  else
    v_dist := 1;
  end if;
  minutes := greatest(5, round(v_full * 60 * v_dist))::int;
  risky := not (coalesce(ma.safe, false) and coalesce(mb.safe, false));
  return query select method, minutes, risky, a.name, b.name;
end;
$$;

-- Il luogo di partenza scelto vale solo per lo staff; per gli altri e' la propria posizione
create or replace function public.scroll_origin(p_from_location uuid)
returns uuid
language sql stable
security definer set search_path = ''
as $$
  select case when public.is_staff() and exists (select 1 from public.locations where id = p_from_location and in_game)
              then p_from_location end;
$$;

create or replace function public.scroll_preview(p_from uuid, p_to uuid, p_from_location uuid default null)
returns table (method text, minutes int, risky boolean, from_name text)
language sql stable
security definer set search_path = ''
as $$
  select r.method, r.minutes, r.risky, r.from_name
  from public.scroll_route(p_from, p_to, public.scroll_origin(p_from_location)) r
  where public.is_my_character(p_from);
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

revoke execute on function public.scroll_route(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.scroll_origin(uuid) from public, anon, authenticated;
revoke execute on function public.scroll_preview(uuid, uuid, uuid) from public, anon;
revoke execute on function public.send_scroll(uuid, uuid, text, boolean, uuid) from public, anon;
grant execute on function public.scroll_preview(uuid, uuid, uuid) to authenticated;
grant execute on function public.send_scroll(uuid, uuid, text, boolean, uuid) to authenticated;
