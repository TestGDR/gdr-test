-- =====================================================================
-- 0053 - Viaggi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il PG viaggia da dove si trova verso un altro luogo: a piedi, a cavallo
-- o in groppa al suo drago (se ne e' il cavaliere e il drago e' almeno
-- adolescente), con calma, normale o di fretta. Il tempo dipende dalla
-- distanza sulla mappa. Durante il viaggio resta nel luogo di partenza;
-- all'arrivo (controllo automatico ogni minuto) si trova a destinazione e
-- riceve un messaggio di SISTEMA. Le azioni scritte in viaggio non lo spostano.
-- =====================================================================

-- Ore reali per attraversare tutta la mappa, per ogni mezzo (le imposta lo staff)
alter table public.missive_settings
  add column walk_full_hours   numeric not null default 48 check (walk_full_hours between 0 and 1000),
  add column horse_full_hours  numeric not null default 16 check (horse_full_hours between 0 and 1000),
  add column dragon_full_hours numeric not null default 2  check (dragon_full_hours between 0 and 1000);

-- Distanza tra due luoghi: 1 = tutta la mappa (mappe diverse: 1)
create or replace function public.location_distance(p_a uuid, p_b uuid)
returns numeric
language sql stable
security definer set search_path = ''
as $$
  select case
    when a.map_id = b.map_id then least(sqrt(power(a.x - b.x, 2) + power(a.y - b.y, 2)) / 100, 1.5)
    else 1 end
  from public.locations a, public.locations b
  where a.id = p_a and b.id = p_b;
$$;

create table public.travels (
  id             bigint generated always as identity primary key,
  character_id   uuid not null references public.characters(id) on delete cascade,
  from_location  uuid references public.locations(id) on delete set null,
  to_location    uuid not null references public.locations(id) on delete cascade,
  mode           text not null check (mode in ('piedi', 'cavallo', 'drago')),
  pace           text not null check (pace in ('calma', 'normale', 'fretta')),
  departed_at    timestamptz not null default now(),
  arrive_at      timestamptz not null,
  status         text not null default 'in_viaggio' check (status in ('in_viaggio', 'arrivato', 'annullato'))
);
create index travels_active_idx on public.travels(arrive_at) where status = 'in_viaggio';
create unique index travels_one_per_character on public.travels(character_id) where status = 'in_viaggio';

alter table public.travels enable row level security;
create policy "i miei viaggi" on public.travels for select to authenticated
  using (public.is_my_character(character_id) or public.has_permission('mondo.gestire'));
grant select on public.travels to authenticated;
grant select, insert, update, delete on public.travels to service_role;

-- Puo' volare? cavaliere di un drago almeno adolescente
create or replace function public.can_fly(p_character uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.dragons d
    where d.rider_id = p_character and d.status = 'drago' and d.stage in ('adolescente', 'subadulto', 'adulto')
  );
$$;

-- Anteprima: quanto dura il viaggio
create or replace function public.travel_preview(p_character uuid, p_to uuid, p_mode text, p_pace text)
returns table (minutes int, from_name text, to_name text, can_fly boolean)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  s public.missive_settings;
  v_from uuid := public.character_location(p_character);
  v_full numeric;
begin
  if not public.is_my_character(p_character) then return; end if;
  select * into s from public.missive_settings;
  v_full := case p_mode when 'drago' then s.dragon_full_hours when 'cavallo' then s.horse_full_hours else s.walk_full_hours end;
  return query
    select greatest(1, round(v_full * 60 * coalesce(public.location_distance(v_from, p_to), 1)
                       * case p_pace when 'fretta' then 0.75 when 'calma' then 1.5 else 1 end))::int,
           (select name from public.locations where id = v_from),
           (select name from public.locations where id = p_to),
           public.can_fly(p_character);
end;
$$;

-- Partenza
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
  if not exists (select 1 from public.locations where id = p_to and in_game) then raise exception 'Destinazione non valida'; end if;
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

-- Annullare: si resta dove si era partiti
create or replace function public.cancel_travel(p_character uuid)
returns void
language sql
security definer set search_path = ''
as $$
  update public.travels set status = 'annullato'
  where character_id = p_character and status = 'in_viaggio' and public.is_my_character(p_character);
$$;

-- Arrivi: ogni minuto
create or replace function public.finish_travels()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  t record;
begin
  for t in
    select tr.*, l.name as to_name from public.travels tr join public.locations l on l.id = tr.to_location
    where tr.status = 'in_viaggio' and tr.arrive_at <= now()
  loop
    update public.characters set location_id = t.to_location where id = t.character_id;
    update public.travels set status = 'arrivato' where id = t.id;
    perform public.send_system_message(t.character_id, 'Sei arrivato a ' || t.to_name || '. Da ora ti trovi qui: corvi, staffette e paggi ti cercheranno in questo luogo.');
  end loop;
end;
$$;
revoke execute on function public.finish_travels() from public, anon, authenticated;
select cron.schedule('arrivi-viaggi', '* * * * *', 'select public.finish_travels()');

-- In viaggio, le azioni scritte in chat non spostano il PG
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
    where r.id = new.room_id and l.in_game and c.id = new.character_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.location_distance(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_fly(uuid) from public, anon;
revoke execute on function public.travel_preview(uuid, uuid, text, text) from public, anon;
revoke execute on function public.start_travel(uuid, uuid, text, text) from public, anon;
revoke execute on function public.cancel_travel(uuid) from public, anon;
grant execute on function public.can_fly(uuid) to authenticated;
grant execute on function public.travel_preview(uuid, uuid, text, text) to authenticated;
grant execute on function public.start_travel(uuid, uuid, text, text) to authenticated;
grant execute on function public.cancel_travel(uuid) to authenticated;
