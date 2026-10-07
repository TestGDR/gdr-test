-- =====================================================================
-- 0100 - Data di gioco che scorre e compleanni dei PG
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Data di gioco: 1 giorno reale = 1 giorno ON, giorni e lune come il
--   calendario reale (gennaio = Prima Luna...). Anno di gioco = anno reale
--   + year_offset (oggi 2026 -> 363 D.C.); day_shift sposta la data di
--   qualche giorno. Si correggono da Gestione -> Data di gioco (permesso
--   "mondo.gestire").
-- - Ogni PG ha giorno, luna e anno di nascita; l'eta' cresce di 1 al
--   compleanno (si aggiorna da sola quando qualcuno entra in gioco).
-- - I PG gia' attivi senza data di nascita: la proprietaria la puo'
--   indicare una volta (giorno e luna) dalla pagina Dati; l'admin sempre.
-- =====================================================================

create table if not exists public.game_clock (
  id          int primary key default 1 check (id = 1),
  year_offset int not null default -1663,
  day_shift   int not null default 0
);
insert into public.game_clock (id) values (1) on conflict do nothing;
alter table public.game_clock enable row level security;
drop policy if exists "data di gioco visibile" on public.game_clock;
create policy "data di gioco visibile" on public.game_clock for select to authenticated using (true);
drop policy if exists "data di gioco admin" on public.game_clock;
create policy "data di gioco admin" on public.game_clock for update to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
grant select, update on public.game_clock to authenticated;
grant all on public.game_clock to service_role;

-- Oggi nel gioco: giorno, luna (1-12), anno D.C.
create or replace function public.game_today()
returns table (day int, month int, year int)
language sql stable
security definer set search_path = ''
as $$
  select extract(day from d)::int, extract(month from d)::int, extract(year from d)::int + g.year_offset
  from public.game_clock g,
       lateral (select ((now() at time zone 'Europe/Rome')::date + g.day_shift) as d) x
  where g.id = 1;
$$;
grant execute on function public.game_today() to anon, authenticated;

-- Eta' ON da una data di nascita
create or replace function public.game_age(p_day int, p_month int, p_year int)
returns int
language sql stable
security definer set search_path = ''
as $$
  select t.year - p_year - case when (t.month, t.day) < (p_month, p_day) then 1 else 0 end
  from public.game_today() t;
$$;
grant execute on function public.game_age(int, int, int) to authenticated;

-- Anno di nascita da eta' e compleanno (se il compleanno non e' ancora
-- arrivato quest'anno, e' nato un anno prima)
create or replace function public.birth_year_for(p_age int, p_day int, p_month int)
returns int
language sql stable
security definer set search_path = ''
as $$
  select t.year - p_age - case when (t.month, t.day) < (p_month, p_day) then 1 else 0 end
  from public.game_today() t;
$$;
grant execute on function public.birth_year_for(int, int, int) to authenticated;

alter table public.characters add column if not exists birth_day smallint;
alter table public.characters add column if not exists birth_month smallint;
alter table public.characters add column if not exists birth_year int;
alter table public.characters drop constraint if exists characters_birth_check;
alter table public.characters add constraint characters_birth_check check (
  (birth_day is null and birth_month is null and birth_year is null)
  or (birth_month between 1 and 12 and birth_day between 1 and 31 and birth_year is not null)
);

-- Aggiorna le eta' (la chiama il gioco a ogni ingresso: costa poco)
create or replace function public.refresh_ages()
returns void
language sql
security definer set search_path = ''
as $$
  update public.characters
    set age = public.game_age(birth_day, birth_month, birth_year)
    where birth_year is not null
      and age is distinct from public.game_age(birth_day, birth_month, birth_year);
$$;
grant execute on function public.refresh_ages() to authenticated;

-- Data di nascita: la proprietaria la indica una volta sola (se manca),
-- l'admin sempre. L'anno si ricava dall'eta' attuale
create or replace function public.set_birthday(p_character uuid, p_day int, p_month int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  c public.characters;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then raise exception 'Personaggio non trovato.' using errcode = 'P0001'; end if;
  if not public.is_admin() then
    if c.owner_id is distinct from auth.uid() then raise exception 'Non puoi farlo.' using errcode = '42501'; end if;
    if c.birth_year is not null then
      raise exception 'La data di nascita è già impostata: può cambiarla solo l''admin.' using errcode = 'P0001';
    end if;
  end if;
  if c.age is null then raise exception 'Il personaggio non ha un''età.' using errcode = 'P0001'; end if;
  if p_month not between 1 and 12 or p_day < 1
     or p_day > extract(day from (make_date(2024, p_month, 1) + interval '1 month - 1 day'))::int then
    raise exception 'Data non valida.' using errcode = 'P0001';
  end if;
  update public.characters
    set birth_day = p_day, birth_month = p_month, birth_year = public.birth_year_for(c.age, p_day, p_month)
    where id = p_character;
end;
$$;
revoke execute on function public.set_birthday(uuid, int, int) from public, anon;
grant execute on function public.set_birthday(uuid, int, int) to authenticated;
