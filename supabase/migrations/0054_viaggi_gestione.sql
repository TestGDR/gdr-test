-- =====================================================================
-- 0054 - Gestione dei viaggi: velocita', andature, tempi di percorrenza
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- (dopo la 0053)
--
-- - Andature modificabili: con calma / di fretta (moltiplicano il tempo).
-- - Tempi di percorrenza scritti a mano per un percorso (tra due luoghi,
--   in entrambi i sensi): sostituiscono quelli calcolati dalla distanza.
-- - Si viaggia solo verso luoghi di gioco di mappe attive.
-- =====================================================================

alter table public.missive_settings
  add column pace_slow_factor numeric not null default 1.5 check (pace_slow_factor between 0.1 and 10),
  add column pace_fast_factor numeric not null default 0.75 check (pace_fast_factor between 0.1 and 10);

-- Percorsi con tempi scritti a mano (minuti; vuoto = calcolato dalla distanza)
create table public.travel_routes (
  location_a      uuid not null references public.locations(id) on delete cascade,
  location_b      uuid not null references public.locations(id) on delete cascade,
  walk_minutes    int check (walk_minutes between 1 and 1000000),
  horse_minutes   int check (horse_minutes between 1 and 1000000),
  dragon_minutes  int check (dragon_minutes between 1 and 1000000),
  primary key (location_a, location_b),
  check (location_a < location_b)
);
alter table public.travel_routes enable row level security;
create policy "percorsi dello staff" on public.travel_routes for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
grant select, insert, update, delete on public.travel_routes to authenticated;
grant select, insert, update, delete on public.travel_routes to service_role;

-- Tempo base (andatura normale) tra due luoghi con un mezzo: scritto a mano o dalla distanza
create or replace function public.travel_base_minutes(p_from uuid, p_to uuid, p_mode text)
returns int
language sql stable
security definer set search_path = ''
as $$
  select coalesce(
    (select case p_mode when 'drago' then r.dragon_minutes when 'cavallo' then r.horse_minutes else r.walk_minutes end
       from public.travel_routes r
      where r.location_a = least(p_from, p_to) and r.location_b = greatest(p_from, p_to)),
    greatest(1, round(
      (select case p_mode when 'drago' then s.dragon_full_hours when 'cavallo' then s.horse_full_hours else s.walk_full_hours end
         from public.missive_settings s) * 60 * coalesce(public.location_distance(p_from, p_to), 1)))::int);
$$;
revoke execute on function public.travel_base_minutes(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.travel_preview(p_character uuid, p_to uuid, p_mode text, p_pace text)
returns table (minutes int, from_name text, to_name text, can_fly boolean)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  s public.missive_settings;
  v_from uuid := public.character_location(p_character);
begin
  if not public.is_my_character(p_character) then return; end if;
  select * into s from public.missive_settings;
  return query
    select greatest(1, round(public.travel_base_minutes(v_from, p_to, p_mode)
                       * case p_pace when 'fretta' then s.pace_fast_factor when 'calma' then s.pace_slow_factor else 1 end))::int,
           (select name from public.locations where id = v_from),
           (select name from public.locations where id = p_to),
           public.can_fly(p_character);
end;
$$;

-- Partenza: solo verso luoghi di gioco di mappe attive
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
  v_arrive := now() + make_interval(mins => v_minutes);
  insert into public.travels (character_id, from_location, to_location, mode, pace, arrive_at)
  values (p_character, v_from, p_to, p_mode, p_pace, v_arrive);
  return v_arrive;
end;
$$;

-- Tabella per la Gestione: ogni coppia di luoghi di gioco, con i tempi
-- calcolati e quelli scritti a mano (solo staff del mondo)
create or replace function public.travel_matrix()
returns table (location_a uuid, location_b uuid, name_a text, name_b text, map_a text, map_b text,
               auto_walk int, auto_horse int, auto_dragon int,
               walk_minutes int, horse_minutes int, dragon_minutes int)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  s public.missive_settings;
begin
  if not public.has_permission('mondo.gestire') then raise exception 'Permesso negato'; end if;
  select * into s from public.missive_settings;
  return query
    select a.id, b.id, a.name, b.name, ma.name, mb.name,
           greatest(1, round(s.walk_full_hours * 60 * public.location_distance(a.id, b.id)))::int,
           greatest(1, round(s.horse_full_hours * 60 * public.location_distance(a.id, b.id)))::int,
           greatest(1, round(s.dragon_full_hours * 60 * public.location_distance(a.id, b.id)))::int,
           r.walk_minutes, r.horse_minutes, r.dragon_minutes
    from public.locations a
    join public.locations b on a.id < b.id
    join public.maps ma on ma.id = a.map_id
    join public.maps mb on mb.id = b.map_id
    left join public.travel_routes r on r.location_a = a.id and r.location_b = b.id
    where a.in_game and b.in_game
    order by a.name, b.name;
end;
$$;
revoke execute on function public.travel_matrix() from public, anon;
grant execute on function public.travel_matrix() to authenticated;
