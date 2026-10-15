-- =====================================================================
-- 0152 - Dove si trova il PG decide dove gioca; Quest Mode per lo staff
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - Chi NON e' in viaggio entra solo nelle chat del luogo (macroarea) in cui
--   si trova il suo PG. Per giocare altrove deve prima viaggiare.
-- - Chi e' in viaggio entra solo nelle chat di viaggio (per terra o per mare,
--   come prima). Le chat OFF (macroaree non di gioco) restano aperte a tutti.
-- - Vale per tutti, staff compreso. Master, moderatori e admin possono
--   accendere la "Quest Mode" (menu della disponibilita' tra i presenti):
--   entrano in qualsiasi chat senza spostare il loro PG.
-- - La posizione la cambiano i viaggi; admin e moderatori la correggono
--   dalla scheda del PG.
-- =====================================================================

alter table public.profiles add column if not exists quest_mode boolean not null default false;

-- Sono in Quest Mode? (solo chi puo' fare il master: per gli altri vale sempre no)
create or replace function public.i_am_questing()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.can_master_mode()
     and coalesce((select quest_mode from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.i_am_questing() to authenticated;

create or replace function public.set_quest_mode(p_on boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.can_master_mode() then
    raise exception 'La Quest Mode è solo per master, moderatori e admin.' using errcode = '42501';
  end if;
  update public.profiles set quest_mode = p_on where id = auth.uid();
end;
$$;
revoke execute on function public.set_quest_mode(boolean) from public, anon;
grant execute on function public.set_quest_mode(boolean) to authenticated;

-- Dove si trova il personaggio principale dell'utente
create or replace function public.my_location()
returns uuid
language sql stable
security definer set search_path = ''
as $$
  select public.character_location((select id from public.characters where owner_id = auth.uid() order by created_at limit 1));
$$;
grant execute on function public.my_location() to authenticated;

create or replace function public.can_enter_room(r uuid)
returns boolean
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_loc public.locations;
  v_travel public.travels;
  v_here uuid;
  ro public.rooms;
begin
  -- Quest Mode: lo staff entra ovunque, senza spostare il PG
  if public.i_am_questing() then
    return exists (select 1 from public.rooms where id = r);
  end if;
  if not public.room_on_active_map(r) then return false; end if;

  select * into ro from public.rooms where id = r;
  if ro.id is null then return false; end if;
  select * into v_loc from public.locations where id = ro.location_id;
  v_travel := public.my_active_travel();

  if v_loc.kind <> 'luogo' then
    -- chat di viaggio: solo in viaggio, con il mezzo giusto, nella mappa di partenza o di arrivo
    if v_travel.id is null then return false; end if;
    if (v_loc.kind = 'viaggio_mare') <> (v_travel.mode = 'nave') then return false; end if;
    if v_loc.map_id not in (
      select l.map_id from public.locations l where l.id in (v_travel.from_location, v_travel.to_location)
    ) then return false; end if;
  elsif v_loc.in_game then
    -- in viaggio non si gioca nei luoghi
    if v_travel.id is not null then return false; end if;
    -- fuori dal viaggio: solo nel luogo in cui si trova il PG
    v_here := public.my_location();
    if v_here is not null and v_here <> v_loc.id then return false; end if;
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
  v_location uuid;
  v_here uuid;
  v_travel public.travels;
begin
  if public.i_am_questing() then return null; end if;
  select l.kind, l.in_game, l.id into v_kind, v_in_game, v_location
  from public.rooms ro join public.locations l on l.id = ro.location_id where ro.id = r;
  v_travel := public.my_active_travel();
  if v_kind is null then return null; end if;
  if v_kind <> 'luogo' and v_travel.id is null then return 'non_in_viaggio'; end if;
  if v_kind <> 'luogo' then return 'viaggio_diverso'; end if;
  if v_travel.id is not null and v_in_game then return 'in_viaggio'; end if;
  v_here := public.my_location();
  if v_in_game and v_here is not null and v_here <> v_location then return 'altro_luogo'; end if;
  return null;
end;
$$;
revoke execute on function public.room_travel_block(uuid) from public, anon;
grant execute on function public.room_travel_block(uuid) to authenticated;

-- Scrivere un'azione non sposta il PG di chi e' in Quest Mode
create or replace function public.position_from_action()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.kind = 'azione'
     and not coalesce((select quest_mode from public.profiles where id = new.author_id), false)
     and not exists (select 1 from public.travels where character_id = new.character_id and status = 'in_viaggio') then
    update public.characters c set location_id = l.id
    from public.rooms r join public.locations l on l.id = r.location_id
    where r.id = new.room_id and l.in_game and l.kind = 'luogo' and c.id = new.character_id;
  end if;
  return new;
end;
$$;

create or replace function public.set_position_from_room(p_room uuid)
returns void
language sql
security definer set search_path = ''
as $$
  update public.characters c set location_id = l.id
  from public.rooms r join public.locations l on l.id = r.location_id
  where r.id = p_room and l.in_game and not public.i_am_questing()
    and c.id = (select id from public.characters where owner_id = auth.uid() order by created_at limit 1);
$$;

-- Correggere la posizione di un PG: admin, moderatori e chi gestisce il mondo
create or replace function public.staff_set_position(p_character uuid, p_location uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not (public.has_permission('mondo.gestire') or public.has_permission('chat.moderare')) then
    raise exception 'Permesso negato';
  end if;
  if p_location is not null and not exists (
    select 1 from public.locations where id = p_location and in_game and kind = 'luogo'
  ) then raise exception 'Luogo non valido'; end if;
  update public.characters set location_id = p_location where id = p_character;
end;
$$;
