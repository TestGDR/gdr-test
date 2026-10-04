-- =====================================================================
-- 0065 - Cartigli: il giocatore sceglie tra corvo e staffetta
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Quando sono possibili sia il corvo sia la staffetta, chi scrive sceglie
-- (il corvo e' veloce ma i castellani lo leggono; la staffetta e' piu'
-- lenta). Stesso luogo: sempre il paggio. Il database accetta solo un
-- mezzo davvero possibile.
-- =====================================================================

-- Mezzi possibili tra mittente e destinatario, con tempo e rischio
create or replace function public.scroll_options(p_from uuid, p_to uuid, p_from_location uuid default null)
returns table (method text, minutes int, risky boolean, from_name text)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  a public.locations;
  b public.locations;
  ma public.maps;
  mb public.maps;
  s public.missive_settings;
  v_origin uuid;
  v_raven int;
  v_rider int;
  v_risky boolean;
begin
  if not public.is_my_character(p_from) then return; end if;
  v_origin := public.scroll_origin(p_from_location);
  select * into s from public.missive_settings;
  select * into a from public.locations where id = coalesce(v_origin, public.character_location(p_from));
  select * into b from public.locations where id = public.character_location(p_to);
  select * into ma from public.maps where id = a.map_id;
  select * into mb from public.maps where id = b.map_id;
  v_risky := not (coalesce(ma.safe, false) and coalesce(mb.safe, false));

  if a.id is not null and a.id = b.id then
    return query select 'paggio'::text, 0, false, a.name;
    return;
  end if;

  if coalesce(a.has_ravens, false) and coalesce(b.has_ravens, false) then
    v_raven := public.travel_base_minutes(a.id, b.id, 'corvo');
    if v_raven is not null then
      return query select 'corvo'::text, greatest(1, v_raven), v_risky, a.name;
    end if;
  end if;

  v_rider := public.travel_base_minutes(a.id, b.id, 'staffetta');
  if v_rider is not null then
    return query select 'staffetta'::text, greatest(1, round(v_rider * s.pace_fast_factor)::int), v_risky, a.name;
  end if;
end;
$$;
revoke execute on function public.scroll_options(uuid, uuid, uuid) from public, anon;
grant execute on function public.scroll_options(uuid, uuid, uuid) to authenticated;

-- Invio con il mezzo scelto (vuoto = il primo possibile: paggio, corvo, staffetta)
drop function if exists public.send_scroll(uuid, uuid, text, boolean, uuid);
create or replace function public.send_scroll(p_from uuid, p_to uuid, p_body text, p_signed boolean,
                                              p_from_location uuid default null, p_method text default null)
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
  select * into r from public.scroll_options(p_from, p_to, p_from_location) o
    where p_method is null or o.method = p_method
    limit 1;
  if r.method is null then
    if p_method is not null then raise exception 'Questo mezzo non puo'' raggiungere il destinatario'; end if;
    raise exception 'Nessuna strada per raggiungere il destinatario';
  end if;

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
revoke execute on function public.send_scroll(uuid, uuid, text, boolean, uuid, text) from public, anon;
grant execute on function public.send_scroll(uuid, uuid, text, boolean, uuid, text) to authenticated;
