-- =====================================================================
-- 0035 - Meteo
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Regioni climatiche (si attivano e spengono come le mappe), ognuna col
-- suo modello climatico. Per ogni regione e stagione ci sono dei "semi":
-- modelli di giornata con un peso (quanto spesso escono) e 4 fasce
-- (notte, mattina, pomeriggio, sera) con condizione e temperatura.
-- Ogni giorno (ora italiana) per ogni regione si estrae un seme secondo i
-- pesi e se ne ricava il meteo ora per ora, uguale per tutti: temperature
-- che salgono e scendono, e stadi intermedi quando il tempo cambia.
-- La stagione attuale e' unica e la imposta lo staff.
-- =====================================================================

create table public.weather_regions (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique,
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '',
  climate      text not null default '', -- modello climatico, descritto
  active       boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.weather_settings (
  id              boolean primary key default true check (id),
  current_season  text not null default 'autunno' check (current_season in ('inverno', 'primavera', 'estate', 'autunno'))
);
insert into public.weather_settings (id) values (true);

create table public.weather_seeds (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid not null references public.weather_regions(id) on delete cascade,
  season      text not null check (season in ('inverno', 'primavera', 'estate', 'autunno')),
  name        text not null check (char_length(name) between 1 and 80),
  weight      int  not null default 10 check (weight between 1 and 1000),
  periods     jsonb not null, -- [{cond, temp}] x 4: notte, mattina, pomeriggio, sera
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  check (jsonb_typeof(periods) = 'array' and jsonb_array_length(periods) = 4)
);
create index weather_seeds_region_idx on public.weather_seeds(region_id, season);

-- Meteo del giorno per regione (ora per ora), estratto una volta sola
create table public.weather_days (
  region_id    uuid not null references public.weather_regions(id) on delete cascade,
  day          date not null,
  season       text not null,
  seed_id      uuid references public.weather_seeds(id) on delete set null,
  seed_name    text not null default '',
  hours        jsonb not null, -- 24 x {cond, temp}
  created_at   timestamptz not null default now(),
  primary key (region_id, day)
);

-- Ogni mappa puo' avere la sua regione climatica
alter table public.maps add column weather_region_id uuid references public.weather_regions(id) on delete set null;

alter table public.weather_regions  enable row level security;
alter table public.weather_settings enable row level security;
alter table public.weather_seeds    enable row level security;
alter table public.weather_days     enable row level security;

create policy "regioni visibili" on public.weather_regions for select to authenticated
  using (active or public.has_permission('mondo.gestire'));
create policy "regioni con permesso" on public.weather_regions for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
create policy "stagione visibile" on public.weather_settings for select to authenticated using (true);
create policy "stagione con permesso" on public.weather_settings for update to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
create policy "semi con permesso" on public.weather_seeds for all to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
create policy "meteo visibile" on public.weather_days for select to authenticated using (true);

grant select, insert, update, delete on public.weather_regions, public.weather_seeds to authenticated;
grant select on public.weather_settings, public.weather_days to authenticated;
grant update (current_season) on public.weather_settings to authenticated;
grant update (weather_region_id) on public.maps to authenticated;
grant select, insert, update, delete on public.weather_regions, public.weather_seeds, public.weather_settings, public.weather_days to service_role;

-- ---------------------------------------------------------------------
-- Stadio intermedio quando il tempo cambia da una fascia all'altra
-- (es. da sereno a pioggia si passa per "nuvoloso")
-- ---------------------------------------------------------------------
create or replace function public.weather_between(a text, b text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when a = b then b
    when b in ('temporale', 'burrasca') then
      case when a in ('pioggerella', 'pioggia') then 'pioggia' else 'nuvoloso' end
    when b in ('pioggerella', 'pioggia') and a not in ('pioggerella', 'pioggia', 'temporale', 'burrasca') then 'nuvoloso'
    when b in ('nevischio', 'neve', 'bufera') and a in ('pioggerella', 'pioggia') then 'nevischio'
    when b in ('neve', 'bufera') and a not in ('nevischio', 'neve', 'bufera') then 'nuvoloso'
    when b in ('sereno', 'poco_nuvoloso') and a in ('pioggerella', 'pioggia', 'temporale', 'burrasca', 'nevischio', 'neve', 'bufera') then 'nuvoloso'
    when b = 'tempesta_sabbia' and a <> 'vento' then 'vento'
    when a = 'tempesta_sabbia' and b <> 'vento' then 'vento'
    else b
  end;
$$;

-- ---------------------------------------------------------------------
-- Meteo di oggi per una regione: se non c'e' ancora, si estrae il seme
-- (in base ai pesi) e si calcolano le 24 ore. Uguale per tutti.
-- ---------------------------------------------------------------------
create or replace function public.weather_today(p_region uuid)
returns public.weather_days
language plpgsql
security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Rome')::date;
  row_out public.weather_days;
  season_now text;
  seed public.weather_seeds;
  offs int;
  t int[];
  c text[];
  anchors int[] := array[-3, 2, 9, 15, 21, 26]; -- ore di riferimento delle fasce (con giro sulla mezzanotte)
  vals int[];
  hrs jsonb := '[]'::jsonb;
  h int;
  i int;
  pi int;
  temp numeric;
  cond text;
begin
  select * into row_out from public.weather_days where region_id = p_region and day = today;
  if found then
    return row_out;
  end if;
  if not exists (select 1 from public.weather_regions where id = p_region and (active or public.has_permission('mondo.gestire'))) then
    return null;
  end if;

  select current_season into season_now from public.weather_settings;
  -- estrazione pesata: ogni seme vince con probabilita' proporzionale al suo peso
  select * into seed from public.weather_seeds
  where region_id = p_region and season = season_now
  order by -ln(1 - random()) / weight
  limit 1;
  if seed.id is null then
    return null;
  end if;

  offs := floor(random() * 5)::int - 2; -- variazione del giorno: da -2 a +2 gradi
  for i in 0..3 loop
    t[i + 1] := coalesce((seed.periods -> i ->> 'temp')::int, 10) + offs;
    c[i + 1] := coalesce(seed.periods -> i ->> 'cond', 'sereno');
  end loop;
  vals := array[t[4], t[1], t[2], t[3], t[4], t[1]];

  for h in 0..23 loop
    -- temperatura: andamento graduale tra le ore di riferimento delle fasce
    i := 1;
    while anchors[i + 1] < h loop i := i + 1; end loop;
    temp := vals[i] + (vals[i + 1] - vals[i]) * (h - anchors[i])::numeric / (anchors[i + 1] - anchors[i]);
    -- condizione: quella della fascia, con lo stadio intermedio alla prima ora di un cambio
    pi := case when h < 6 then 1 when h < 12 then 2 when h < 18 then 3 else 4 end;
    cond := c[pi];
    if h in (6, 12, 18) and c[pi] <> c[pi - 1] then
      cond := public.weather_between(c[pi - 1], c[pi]);
    end if;
    hrs := hrs || jsonb_build_object('cond', cond, 'temp', round(temp)::int);
  end loop;

  insert into public.weather_days (region_id, day, season, seed_id, seed_name, hours)
  values (p_region, today, season_now, seed.id, seed.name, hrs)
  on conflict (region_id, day) do nothing;
  select * into row_out from public.weather_days where region_id = p_region and day = today;
  return row_out;
end;
$$;

-- Lo staff rifa' l'estrazione di oggi (es. dopo aver cambiato stagione o semi)
create or replace function public.weather_regenerate(p_region uuid)
returns public.weather_days
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('mondo.gestire') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  delete from public.weather_days where region_id = p_region and day = (now() at time zone 'Europe/Rome')::date;
  return public.weather_today(p_region);
end;
$$;

revoke execute on function public.weather_today(uuid) from public, anon;
revoke execute on function public.weather_regenerate(uuid) from public, anon;
grant execute on function public.weather_today(uuid) to authenticated;
grant execute on function public.weather_regenerate(uuid) to authenticated;

-- Regioni climatiche (attiva solo quella della mappa in uso)
insert into public.weather_regions (slug, name, description, climate, active, sort_order) values
  ('terre_corona', 'Terre della Corona', 'Le terre attorno ad Approdo del Re e alla Baia delle Acque Nere: colline, boschi e coste riparate.', 'Temperato. Clima temperato marittimo: inverni miti e umidi, nebbie sulla baia, estati calde con qualche temporale.', true, 0),
  ('terre_fiumi', 'Terre dei Fiumi', 'Pianure fertili solcate dal Tridente, paludi e boschi lungo i fiumi.', 'Continentale. Clima continentale umido: inverni freddi con nebbie e neve, estati calde e temporalesche, molta pioggia in autunno.', false, 1),
  ('occidente', 'Occidente', 'Colline e miniere d''oro dei Lannister, affacciate sul Mare del Tramonto.', 'Temperato. Clima temperato atlantico: piogge portate dal mare, inverni miti, estati calde e ventilate.', false, 2),
  ('altopiano', 'Altopiano', 'Le terre più fertili dei Sette Regni: vigneti, frutteti e campi dorati.', 'Mediterraneo. Clima mediterraneo: inverni dolci e piovosi, primavere luminose, estati lunghe, calde e asciutte.', false, 3),
  ('terre_tempesta', 'Terre della Tempesta', 'Coste frastagliate, foreste piovose e la Baia dei Naufragi, flagellate dalle tempeste del Mare Stretto.', 'Oceanico tempestoso. Clima oceanico tempestoso: burrasche frequenti, piogge abbondanti tutto l''anno, inverni miti ma ventosi.', false, 4),
  ('valle_arryn', 'Valle di Arryn', 'Le Montagne della Luna e la valle protetta dal Nido dell''Aquila.', 'Montano. Clima montano: inverni nevosi e gelidi sulle vette, estati fresche con temporali improvvisi, venti in quota.', false, 5),
  ('nord', 'Nord', 'Il regno più vasto: foreste di pini, brughiere e lande gelide fino alla Barriera.', 'Subartico. Clima subartico: inverni lunghissimi di neve e gelo, estati brevi e fresche, nebbie e piogge fredde.', false, 6),
  ('dorne', 'Dorne', 'Deserti di sabbia rossa, montagne aspre e oasi lungo il fiume Sangueverde.', 'Desertico. Clima desertico caldo: sole quasi costante, calura estrema d''estate, notti fresche e tempeste di sabbia.', false, 7),
  ('isole_ferro', 'Isole di Ferro', 'Isole rocciose e brulle battute dal mare, patria degli uomini di ferro.', 'Oceanico tempestoso. Clima oceanico freddo: cielo grigio, vento costante, piogge e burrasche marine per gran parte dell''anno.', false, 8),
  ('oltre_barriera', 'Oltre la Barriera', 'La Foresta Stregata e i ghiacci del Nord Remoto, dove vivono i bruti.', 'Polare. Clima polare: gelo quasi perenne, bufere di neve, estati brevissime appena sopra lo zero.', false, 9);

-- Semi: un modello di giornata per ogni tipo, con il suo peso, per regione e stagione
insert into public.weather_seeds (region_id, season, name, weight, periods, sort_order) values
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Giornata serena', 15, '[{"cond":"sereno","temp":0},{"cond":"sereno","temp":5},{"cond":"sereno","temp":11},{"cond":"sereno","temp":7}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Cielo velato', 15, '[{"cond":"poco_nuvoloso","temp":2},{"cond":"poco_nuvoloso","temp":6},{"cond":"nuvoloso","temp":10},{"cond":"poco_nuvoloso","temp":7}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":2},{"cond":"nebbia","temp":5},{"cond":"poco_nuvoloso","temp":9},{"cond":"poco_nuvoloso","temp":6}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":3},{"cond":"nuvoloso","temp":5},{"cond":"nuvoloso","temp":8},{"cond":"nuvoloso","temp":6}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":3},{"cond":"pioggia","temp":4},{"cond":"pioggerella","temp":6},{"cond":"pioggia","temp":5}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":2},{"cond":"nuvoloso","temp":5},{"cond":"pioggia","temp":8},{"cond":"pioggerella","temp":6}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Giornata ventosa', 5, '[{"cond":"vento","temp":1},{"cond":"vento","temp":4},{"cond":"vento","temp":8},{"cond":"poco_nuvoloso","temp":5}]'::jsonb, 6),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'inverno', 'Neve leggera', 5, '[{"cond":"nuvoloso","temp":2},{"cond":"nevischio","temp":5},{"cond":"neve","temp":9},{"cond":"nuvoloso","temp":6}]'::jsonb, 7),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'primavera', 'Giornata serena', 25, '[{"cond":"sereno","temp":6},{"cond":"sereno","temp":12},{"cond":"sereno","temp":19},{"cond":"sereno","temp":14}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'primavera', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":8},{"cond":"poco_nuvoloso","temp":13},{"cond":"nuvoloso","temp":18},{"cond":"poco_nuvoloso","temp":14}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'primavera', 'Pioggia pomeridiana', 20, '[{"cond":"poco_nuvoloso","temp":8},{"cond":"nuvoloso","temp":12},{"cond":"pioggia","temp":16},{"cond":"pioggerella","temp":13}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'primavera', 'Giornata piovosa', 10, '[{"cond":"pioggia","temp":9},{"cond":"pioggia","temp":11},{"cond":"pioggerella","temp":14},{"cond":"pioggia","temp":12}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'primavera', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":8},{"cond":"nebbia","temp":12},{"cond":"poco_nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'primavera', 'Giornata ventosa', 10, '[{"cond":"vento","temp":7},{"cond":"vento","temp":11},{"cond":"vento","temp":16},{"cond":"poco_nuvoloso","temp":12}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'estate', 'Giornata serena', 40, '[{"cond":"sereno","temp":15},{"cond":"sereno","temp":22},{"cond":"sereno","temp":30},{"cond":"sereno","temp":24}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'estate', 'Cielo velato', 15, '[{"cond":"poco_nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":22},{"cond":"nuvoloso","temp":29},{"cond":"poco_nuvoloso","temp":24}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'estate', 'Temporale estivo', 15, '[{"cond":"poco_nuvoloso","temp":18},{"cond":"sereno","temp":23},{"cond":"temporale","temp":30},{"cond":"nuvoloso","temp":25}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'estate', 'Calura', 20, '[{"cond":"sereno","temp":19},{"cond":"sereno","temp":25},{"cond":"afa","temp":32},{"cond":"sereno","temp":27}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'estate', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":17},{"cond":"nuvoloso","temp":22},{"cond":"pioggia","temp":27},{"cond":"pioggerella","temp":23}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'autunno', 'Giornata serena', 15, '[{"cond":"sereno","temp":7},{"cond":"sereno","temp":12},{"cond":"sereno","temp":19},{"cond":"sereno","temp":14}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'autunno', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":9},{"cond":"poco_nuvoloso","temp":13},{"cond":"nuvoloso","temp":18},{"cond":"poco_nuvoloso","temp":14}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'autunno', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":9},{"cond":"nebbia","temp":13},{"cond":"poco_nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":14}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'autunno', 'Cielo coperto', 15, '[{"cond":"nuvoloso","temp":10},{"cond":"nuvoloso","temp":13},{"cond":"nuvoloso","temp":16},{"cond":"nuvoloso","temp":14}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'autunno', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":10},{"cond":"pioggia","temp":12},{"cond":"pioggerella","temp":14},{"cond":"pioggia","temp":12}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'autunno', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":9},{"cond":"nuvoloso","temp":12},{"cond":"pioggia","temp":16},{"cond":"pioggerella","temp":13}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'terre_corona'), 'autunno', 'Giornata ventosa', 10, '[{"cond":"vento","temp":8},{"cond":"vento","temp":12},{"cond":"vento","temp":16},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 6),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'inverno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":-1},{"cond":"nuvoloso","temp":1},{"cond":"nuvoloso","temp":4},{"cond":"nuvoloso","temp":2}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'inverno', 'Nebbia mattutina', 20, '[{"cond":"nebbia","temp":-2},{"cond":"nebbia","temp":1},{"cond":"poco_nuvoloso","temp":5},{"cond":"poco_nuvoloso","temp":2}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'inverno', 'Neve leggera', 15, '[{"cond":"nuvoloso","temp":-2},{"cond":"nevischio","temp":1},{"cond":"neve","temp":5},{"cond":"nuvoloso","temp":2}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'inverno', 'Nevicata', 10, '[{"cond":"neve","temp":-1},{"cond":"neve","temp":1},{"cond":"neve","temp":4},{"cond":"nevischio","temp":2}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'inverno', 'Gelo sereno', 15, '[{"cond":"sereno","temp":-7},{"cond":"sereno","temp":-2},{"cond":"sereno","temp":4},{"cond":"sereno","temp":0}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'inverno', 'Cielo velato', 10, '[{"cond":"poco_nuvoloso","temp":-2},{"cond":"poco_nuvoloso","temp":2},{"cond":"nuvoloso","temp":6},{"cond":"poco_nuvoloso","temp":3}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'inverno', 'Giornata piovosa', 10, '[{"cond":"pioggia","temp":-1},{"cond":"pioggia","temp":0},{"cond":"pioggerella","temp":2},{"cond":"pioggia","temp":1}]'::jsonb, 6),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'primavera', 'Giornata serena', 20, '[{"cond":"sereno","temp":4},{"cond":"sereno","temp":10},{"cond":"sereno","temp":17},{"cond":"sereno","temp":12}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'primavera', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":6},{"cond":"poco_nuvoloso","temp":11},{"cond":"nuvoloso","temp":16},{"cond":"poco_nuvoloso","temp":12}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'primavera', 'Pioggia pomeridiana', 25, '[{"cond":"poco_nuvoloso","temp":6},{"cond":"nuvoloso","temp":10},{"cond":"pioggia","temp":14},{"cond":"pioggerella","temp":11}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'primavera', 'Giornata piovosa', 20, '[{"cond":"pioggia","temp":7},{"cond":"pioggia","temp":9},{"cond":"pioggerella","temp":12},{"cond":"pioggia","temp":10}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'primavera', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":6},{"cond":"nebbia","temp":10},{"cond":"poco_nuvoloso","temp":15},{"cond":"poco_nuvoloso","temp":11}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'estate', 'Giornata serena', 35, '[{"cond":"sereno","temp":12},{"cond":"sereno","temp":19},{"cond":"sereno","temp":28},{"cond":"sereno","temp":22}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'estate', 'Cielo velato', 15, '[{"cond":"poco_nuvoloso","temp":14},{"cond":"poco_nuvoloso","temp":20},{"cond":"nuvoloso","temp":27},{"cond":"poco_nuvoloso","temp":22}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'estate', 'Temporale estivo', 25, '[{"cond":"poco_nuvoloso","temp":15},{"cond":"sereno","temp":21},{"cond":"temporale","temp":28},{"cond":"nuvoloso","temp":23}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'estate', 'Calura', 15, '[{"cond":"sereno","temp":16},{"cond":"sereno","temp":22},{"cond":"afa","temp":30},{"cond":"sereno","temp":24}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'estate', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":14},{"cond":"nuvoloso","temp":19},{"cond":"pioggia","temp":25},{"cond":"pioggerella","temp":21}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'autunno', 'Nebbia mattutina', 25, '[{"cond":"nebbia","temp":6},{"cond":"nebbia","temp":10},{"cond":"poco_nuvoloso","temp":14},{"cond":"poco_nuvoloso","temp":11}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'autunno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":7},{"cond":"nuvoloso","temp":10},{"cond":"nuvoloso","temp":13},{"cond":"nuvoloso","temp":11}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'autunno', 'Giornata piovosa', 20, '[{"cond":"pioggia","temp":7},{"cond":"pioggia","temp":9},{"cond":"pioggerella","temp":11},{"cond":"pioggia","temp":9}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'autunno', 'Cielo velato', 15, '[{"cond":"poco_nuvoloso","temp":6},{"cond":"poco_nuvoloso","temp":10},{"cond":"nuvoloso","temp":15},{"cond":"poco_nuvoloso","temp":11}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'autunno', 'Giornata serena', 10, '[{"cond":"sereno","temp":4},{"cond":"sereno","temp":9},{"cond":"sereno","temp":16},{"cond":"sereno","temp":11}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_fiumi'), 'autunno', 'Giornata ventosa', 10, '[{"cond":"vento","temp":5},{"cond":"vento","temp":9},{"cond":"vento","temp":13},{"cond":"poco_nuvoloso","temp":10}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Giornata serena', 15, '[{"cond":"sereno","temp":-1},{"cond":"sereno","temp":4},{"cond":"sereno","temp":10},{"cond":"sereno","temp":6}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Cielo velato', 15, '[{"cond":"poco_nuvoloso","temp":1},{"cond":"poco_nuvoloso","temp":5},{"cond":"nuvoloso","temp":9},{"cond":"poco_nuvoloso","temp":6}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":1},{"cond":"nebbia","temp":4},{"cond":"poco_nuvoloso","temp":8},{"cond":"poco_nuvoloso","temp":5}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":2},{"cond":"nuvoloso","temp":4},{"cond":"nuvoloso","temp":7},{"cond":"nuvoloso","temp":5}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":2},{"cond":"pioggia","temp":3},{"cond":"pioggerella","temp":5},{"cond":"pioggia","temp":4}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":1},{"cond":"nuvoloso","temp":4},{"cond":"pioggia","temp":7},{"cond":"pioggerella","temp":5}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Giornata ventosa', 5, '[{"cond":"vento","temp":0},{"cond":"vento","temp":3},{"cond":"vento","temp":7},{"cond":"poco_nuvoloso","temp":4}]'::jsonb, 6),
  ((select id from public.weather_regions where slug = 'occidente'), 'inverno', 'Neve leggera', 5, '[{"cond":"nuvoloso","temp":1},{"cond":"nevischio","temp":4},{"cond":"neve","temp":8},{"cond":"nuvoloso","temp":5}]'::jsonb, 7),
  ((select id from public.weather_regions where slug = 'occidente'), 'primavera', 'Giornata serena', 25, '[{"cond":"sereno","temp":5},{"cond":"sereno","temp":11},{"cond":"sereno","temp":18},{"cond":"sereno","temp":13}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'occidente'), 'primavera', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":7},{"cond":"poco_nuvoloso","temp":12},{"cond":"nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'occidente'), 'primavera', 'Pioggia pomeridiana', 20, '[{"cond":"poco_nuvoloso","temp":7},{"cond":"nuvoloso","temp":11},{"cond":"pioggia","temp":15},{"cond":"pioggerella","temp":12}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'occidente'), 'primavera', 'Giornata piovosa', 10, '[{"cond":"pioggia","temp":8},{"cond":"pioggia","temp":10},{"cond":"pioggerella","temp":13},{"cond":"pioggia","temp":11}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'occidente'), 'primavera', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":7},{"cond":"nebbia","temp":11},{"cond":"poco_nuvoloso","temp":16},{"cond":"poco_nuvoloso","temp":12}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'occidente'), 'primavera', 'Giornata ventosa', 10, '[{"cond":"vento","temp":6},{"cond":"vento","temp":10},{"cond":"vento","temp":15},{"cond":"poco_nuvoloso","temp":11}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'occidente'), 'estate', 'Giornata serena', 40, '[{"cond":"sereno","temp":13},{"cond":"sereno","temp":20},{"cond":"sereno","temp":28},{"cond":"sereno","temp":22}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'occidente'), 'estate', 'Cielo velato', 15, '[{"cond":"poco_nuvoloso","temp":15},{"cond":"poco_nuvoloso","temp":20},{"cond":"nuvoloso","temp":27},{"cond":"poco_nuvoloso","temp":22}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'occidente'), 'estate', 'Temporale estivo', 15, '[{"cond":"poco_nuvoloso","temp":16},{"cond":"sereno","temp":21},{"cond":"temporale","temp":28},{"cond":"nuvoloso","temp":23}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'occidente'), 'estate', 'Calura', 20, '[{"cond":"sereno","temp":17},{"cond":"sereno","temp":23},{"cond":"afa","temp":30},{"cond":"sereno","temp":25}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'occidente'), 'estate', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":15},{"cond":"nuvoloso","temp":20},{"cond":"pioggia","temp":25},{"cond":"pioggerella","temp":21}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'occidente'), 'autunno', 'Giornata serena', 15, '[{"cond":"sereno","temp":6},{"cond":"sereno","temp":11},{"cond":"sereno","temp":17},{"cond":"sereno","temp":13}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'occidente'), 'autunno', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":8},{"cond":"poco_nuvoloso","temp":12},{"cond":"nuvoloso","temp":16},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'occidente'), 'autunno', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":8},{"cond":"nebbia","temp":11},{"cond":"poco_nuvoloso","temp":15},{"cond":"poco_nuvoloso","temp":12}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'occidente'), 'autunno', 'Cielo coperto', 15, '[{"cond":"nuvoloso","temp":9},{"cond":"nuvoloso","temp":11},{"cond":"nuvoloso","temp":14},{"cond":"nuvoloso","temp":12}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'occidente'), 'autunno', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":9},{"cond":"pioggia","temp":10},{"cond":"pioggerella","temp":12},{"cond":"pioggia","temp":11}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'occidente'), 'autunno', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":8},{"cond":"nuvoloso","temp":11},{"cond":"pioggia","temp":14},{"cond":"pioggerella","temp":12}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'occidente'), 'autunno', 'Giornata ventosa', 10, '[{"cond":"vento","temp":7},{"cond":"vento","temp":10},{"cond":"vento","temp":14},{"cond":"poco_nuvoloso","temp":11}]'::jsonb, 6),
  ((select id from public.weather_regions where slug = 'altopiano'), 'inverno', 'Giornata serena', 25, '[{"cond":"sereno","temp":2},{"cond":"sereno","temp":7},{"cond":"sereno","temp":14},{"cond":"sereno","temp":9}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'altopiano'), 'inverno', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":4},{"cond":"poco_nuvoloso","temp":8},{"cond":"nuvoloso","temp":13},{"cond":"poco_nuvoloso","temp":9}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'altopiano'), 'inverno', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":4},{"cond":"nebbia","temp":8},{"cond":"poco_nuvoloso","temp":12},{"cond":"poco_nuvoloso","temp":9}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'altopiano'), 'inverno', 'Cielo coperto', 15, '[{"cond":"nuvoloso","temp":5},{"cond":"nuvoloso","temp":8},{"cond":"nuvoloso","temp":11},{"cond":"nuvoloso","temp":9}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'altopiano'), 'inverno', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":5},{"cond":"pioggia","temp":7},{"cond":"pioggerella","temp":9},{"cond":"pioggia","temp":7}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'altopiano'), 'inverno', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":4},{"cond":"nuvoloso","temp":7},{"cond":"pioggia","temp":11},{"cond":"pioggerella","temp":8}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'altopiano'), 'primavera', 'Giornata serena', 40, '[{"cond":"sereno","temp":8},{"cond":"sereno","temp":14},{"cond":"sereno","temp":22},{"cond":"sereno","temp":16}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'altopiano'), 'primavera', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":10},{"cond":"poco_nuvoloso","temp":15},{"cond":"nuvoloso","temp":21},{"cond":"poco_nuvoloso","temp":17}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'altopiano'), 'primavera', 'Pioggia pomeridiana', 20, '[{"cond":"poco_nuvoloso","temp":10},{"cond":"nuvoloso","temp":14},{"cond":"pioggia","temp":19},{"cond":"pioggerella","temp":15}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'altopiano'), 'primavera', 'Giornata ventosa', 15, '[{"cond":"vento","temp":9},{"cond":"vento","temp":14},{"cond":"vento","temp":19},{"cond":"poco_nuvoloso","temp":15}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'altopiano'), 'estate', 'Giornata serena', 45, '[{"cond":"sereno","temp":16},{"cond":"sereno","temp":24},{"cond":"sereno","temp":33},{"cond":"sereno","temp":26}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'altopiano'), 'estate', 'Calura', 35, '[{"cond":"sereno","temp":20},{"cond":"sereno","temp":27},{"cond":"afa","temp":35},{"cond":"sereno","temp":29}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'altopiano'), 'estate', 'Temporale estivo', 15, '[{"cond":"poco_nuvoloso","temp":19},{"cond":"sereno","temp":25},{"cond":"temporale","temp":33},{"cond":"nuvoloso","temp":27}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'altopiano'), 'estate', 'Cielo velato', 5, '[{"cond":"poco_nuvoloso","temp":18},{"cond":"poco_nuvoloso","temp":24},{"cond":"nuvoloso","temp":32},{"cond":"poco_nuvoloso","temp":26}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'altopiano'), 'autunno', 'Giornata serena', 25, '[{"cond":"sereno","temp":9},{"cond":"sereno","temp":15},{"cond":"sereno","temp":22},{"cond":"sereno","temp":17}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'altopiano'), 'autunno', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":11},{"cond":"poco_nuvoloso","temp":16},{"cond":"nuvoloso","temp":21},{"cond":"poco_nuvoloso","temp":17}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'altopiano'), 'autunno', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":11},{"cond":"nebbia","temp":15},{"cond":"poco_nuvoloso","temp":20},{"cond":"poco_nuvoloso","temp":16}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'altopiano'), 'autunno', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":12},{"cond":"pioggia","temp":14},{"cond":"pioggerella","temp":17},{"cond":"pioggia","temp":15}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'altopiano'), 'autunno', 'Pioggia pomeridiana', 20, '[{"cond":"poco_nuvoloso","temp":11},{"cond":"nuvoloso","temp":15},{"cond":"pioggia","temp":19},{"cond":"pioggerella","temp":16}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'inverno', 'Burrasca', 25, '[{"cond":"vento","temp":3},{"cond":"pioggia","temp":5},{"cond":"burrasca","temp":7},{"cond":"pioggia","temp":5}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'inverno', 'Giornata piovosa', 25, '[{"cond":"pioggia","temp":4},{"cond":"pioggia","temp":5},{"cond":"pioggerella","temp":6},{"cond":"pioggia","temp":5}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'inverno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":4},{"cond":"nuvoloso","temp":6},{"cond":"nuvoloso","temp":8},{"cond":"nuvoloso","temp":6}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'inverno', 'Giornata ventosa', 20, '[{"cond":"vento","temp":2},{"cond":"vento","temp":5},{"cond":"vento","temp":8},{"cond":"poco_nuvoloso","temp":6}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'inverno', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":3},{"cond":"nebbia","temp":6},{"cond":"poco_nuvoloso","temp":9},{"cond":"poco_nuvoloso","temp":7}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'primavera', 'Giornata piovosa', 25, '[{"cond":"pioggia","temp":10},{"cond":"pioggia","temp":11},{"cond":"pioggerella","temp":13},{"cond":"pioggia","temp":12}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'primavera', 'Giornata ventosa', 20, '[{"cond":"vento","temp":8},{"cond":"vento","temp":11},{"cond":"vento","temp":15},{"cond":"poco_nuvoloso","temp":12}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'primavera', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":9},{"cond":"poco_nuvoloso","temp":13},{"cond":"nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":14}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'primavera', 'Burrasca', 15, '[{"cond":"vento","temp":9},{"cond":"pioggia","temp":11},{"cond":"burrasca","temp":14},{"cond":"pioggia","temp":12}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'primavera', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":9},{"cond":"nuvoloso","temp":12},{"cond":"pioggia","temp":15},{"cond":"pioggerella","temp":13}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'primavera', 'Giornata serena', 10, '[{"cond":"sereno","temp":7},{"cond":"sereno","temp":12},{"cond":"sereno","temp":18},{"cond":"sereno","temp":14}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'estate', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":22},{"cond":"nuvoloso","temp":27},{"cond":"poco_nuvoloso","temp":23}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'estate', 'Giornata serena', 20, '[{"cond":"sereno","temp":15},{"cond":"sereno","temp":21},{"cond":"sereno","temp":28},{"cond":"sereno","temp":23}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'estate', 'Temporale estivo', 15, '[{"cond":"poco_nuvoloso","temp":18},{"cond":"sereno","temp":23},{"cond":"temporale","temp":28},{"cond":"nuvoloso","temp":24}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'estate', 'Pioggia pomeridiana', 20, '[{"cond":"poco_nuvoloso","temp":17},{"cond":"nuvoloso","temp":21},{"cond":"pioggia","temp":25},{"cond":"pioggerella","temp":22}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'estate', 'Burrasca', 10, '[{"cond":"vento","temp":17},{"cond":"pioggia","temp":20},{"cond":"burrasca","temp":24},{"cond":"pioggia","temp":21}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'estate', 'Giornata ventosa', 10, '[{"cond":"vento","temp":16},{"cond":"vento","temp":20},{"cond":"vento","temp":25},{"cond":"poco_nuvoloso","temp":21}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'autunno', 'Burrasca', 30, '[{"cond":"vento","temp":10},{"cond":"pioggia","temp":12},{"cond":"burrasca","temp":14},{"cond":"pioggia","temp":12}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'autunno', 'Giornata piovosa', 25, '[{"cond":"pioggia","temp":11},{"cond":"pioggia","temp":12},{"cond":"pioggerella","temp":13},{"cond":"pioggia","temp":12}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'autunno', 'Giornata ventosa', 20, '[{"cond":"vento","temp":9},{"cond":"vento","temp":12},{"cond":"vento","temp":15},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'autunno', 'Cielo coperto', 15, '[{"cond":"nuvoloso","temp":11},{"cond":"nuvoloso","temp":13},{"cond":"nuvoloso","temp":15},{"cond":"nuvoloso","temp":13}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'terre_tempesta'), 'autunno', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":10},{"cond":"nebbia","temp":13},{"cond":"poco_nuvoloso","temp":16},{"cond":"poco_nuvoloso","temp":14}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'inverno', 'Nevicata', 25, '[{"cond":"neve","temp":-5},{"cond":"neve","temp":-2},{"cond":"neve","temp":1},{"cond":"nevischio","temp":-1}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'inverno', 'Neve leggera', 20, '[{"cond":"nuvoloso","temp":-6},{"cond":"nevischio","temp":-2},{"cond":"neve","temp":2},{"cond":"nuvoloso","temp":-1}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'inverno', 'Gelo sereno', 20, '[{"cond":"sereno","temp":-11},{"cond":"sereno","temp":-6},{"cond":"sereno","temp":1},{"cond":"sereno","temp":-4}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'inverno', 'Bufera di neve', 10, '[{"cond":"neve","temp":-8},{"cond":"bufera","temp":-5},{"cond":"bufera","temp":-1},{"cond":"neve","temp":-4}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'inverno', 'Cielo coperto', 15, '[{"cond":"nuvoloso","temp":-5},{"cond":"nuvoloso","temp":-2},{"cond":"nuvoloso","temp":1},{"cond":"nuvoloso","temp":-1}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'inverno', 'Giornata serena', 10, '[{"cond":"sereno","temp":-8},{"cond":"sereno","temp":-3},{"cond":"sereno","temp":4},{"cond":"sereno","temp":-1}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'primavera', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":3},{"cond":"poco_nuvoloso","temp":8},{"cond":"nuvoloso","temp":13},{"cond":"poco_nuvoloso","temp":9}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'primavera', 'Pioggia pomeridiana', 25, '[{"cond":"poco_nuvoloso","temp":3},{"cond":"nuvoloso","temp":7},{"cond":"pioggia","temp":11},{"cond":"pioggerella","temp":8}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'primavera', 'Giornata serena', 20, '[{"cond":"sereno","temp":1},{"cond":"sereno","temp":7},{"cond":"sereno","temp":14},{"cond":"sereno","temp":9}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'primavera', 'Neve leggera', 10, '[{"cond":"nuvoloso","temp":3},{"cond":"nevischio","temp":7},{"cond":"neve","temp":12},{"cond":"nuvoloso","temp":8}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'primavera', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":3},{"cond":"nebbia","temp":7},{"cond":"poco_nuvoloso","temp":12},{"cond":"poco_nuvoloso","temp":8}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'primavera', 'Giornata ventosa', 10, '[{"cond":"vento","temp":2},{"cond":"vento","temp":6},{"cond":"vento","temp":11},{"cond":"poco_nuvoloso","temp":7}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'estate', 'Giornata serena', 35, '[{"cond":"sereno","temp":9},{"cond":"sereno","temp":16},{"cond":"sereno","temp":24},{"cond":"sereno","temp":18}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'estate', 'Temporale estivo', 25, '[{"cond":"poco_nuvoloso","temp":12},{"cond":"sereno","temp":17},{"cond":"temporale","temp":24},{"cond":"nuvoloso","temp":19}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'estate', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":11},{"cond":"poco_nuvoloso","temp":16},{"cond":"nuvoloso","temp":23},{"cond":"poco_nuvoloso","temp":18}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'estate', 'Pioggia pomeridiana', 15, '[{"cond":"poco_nuvoloso","temp":11},{"cond":"nuvoloso","temp":16},{"cond":"pioggia","temp":21},{"cond":"pioggerella","temp":17}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'estate', 'Giornata ventosa', 5, '[{"cond":"vento","temp":10},{"cond":"vento","temp":15},{"cond":"vento","temp":21},{"cond":"poco_nuvoloso","temp":17}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'autunno', 'Nebbia mattutina', 20, '[{"cond":"nebbia","temp":3},{"cond":"nebbia","temp":7},{"cond":"poco_nuvoloso","temp":11},{"cond":"poco_nuvoloso","temp":8}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'autunno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":4},{"cond":"nuvoloso","temp":7},{"cond":"nuvoloso","temp":10},{"cond":"nuvoloso","temp":8}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'autunno', 'Cielo velato', 15, '[{"cond":"poco_nuvoloso","temp":3},{"cond":"poco_nuvoloso","temp":7},{"cond":"nuvoloso","temp":12},{"cond":"poco_nuvoloso","temp":8}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'autunno', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":4},{"cond":"pioggia","temp":6},{"cond":"pioggerella","temp":8},{"cond":"pioggia","temp":6}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'autunno', 'Neve leggera', 15, '[{"cond":"nuvoloso","temp":3},{"cond":"nevischio","temp":7},{"cond":"neve","temp":11},{"cond":"nuvoloso","temp":8}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'valle_arryn'), 'autunno', 'Giornata ventosa', 15, '[{"cond":"vento","temp":2},{"cond":"vento","temp":6},{"cond":"vento","temp":10},{"cond":"poco_nuvoloso","temp":7}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'nord'), 'inverno', 'Nevicata', 25, '[{"cond":"neve","temp":-13},{"cond":"neve","temp":-10},{"cond":"neve","temp":-6},{"cond":"nevischio","temp":-9}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'nord'), 'inverno', 'Bufera di neve', 15, '[{"cond":"neve","temp":-16},{"cond":"bufera","temp":-12},{"cond":"bufera","temp":-8},{"cond":"neve","temp":-11}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'nord'), 'inverno', 'Gelo sereno', 25, '[{"cond":"sereno","temp":-19},{"cond":"sereno","temp":-13},{"cond":"sereno","temp":-6},{"cond":"sereno","temp":-11}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'nord'), 'inverno', 'Neve leggera', 20, '[{"cond":"nuvoloso","temp":-14},{"cond":"nevischio","temp":-10},{"cond":"neve","temp":-5},{"cond":"nuvoloso","temp":-9}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'nord'), 'inverno', 'Cielo coperto', 15, '[{"cond":"nuvoloso","temp":-13},{"cond":"nuvoloso","temp":-10},{"cond":"nuvoloso","temp":-6},{"cond":"nuvoloso","temp":-9}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'nord'), 'primavera', 'Neve leggera', 20, '[{"cond":"nuvoloso","temp":-2},{"cond":"nevischio","temp":3},{"cond":"neve","temp":8},{"cond":"nuvoloso","temp":4}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'nord'), 'primavera', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":-1},{"cond":"nuvoloso","temp":3},{"cond":"nuvoloso","temp":7},{"cond":"nuvoloso","temp":4}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'nord'), 'primavera', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":-1},{"cond":"pioggia","temp":2},{"cond":"pioggerella","temp":5},{"cond":"pioggia","temp":3}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'nord'), 'primavera', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":-2},{"cond":"poco_nuvoloso","temp":3},{"cond":"nuvoloso","temp":9},{"cond":"poco_nuvoloso","temp":5}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'nord'), 'primavera', 'Giornata serena', 15, '[{"cond":"sereno","temp":-4},{"cond":"sereno","temp":2},{"cond":"sereno","temp":10},{"cond":"sereno","temp":4}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'nord'), 'primavera', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":-2},{"cond":"nebbia","temp":3},{"cond":"poco_nuvoloso","temp":8},{"cond":"poco_nuvoloso","temp":4}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'nord'), 'estate', 'Giornata serena', 25, '[{"cond":"sereno","temp":4},{"cond":"sereno","temp":11},{"cond":"sereno","temp":19},{"cond":"sereno","temp":13}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'nord'), 'estate', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":6},{"cond":"poco_nuvoloso","temp":11},{"cond":"nuvoloso","temp":18},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'nord'), 'estate', 'Pioggia pomeridiana', 20, '[{"cond":"poco_nuvoloso","temp":6},{"cond":"nuvoloso","temp":11},{"cond":"pioggia","temp":16},{"cond":"pioggerella","temp":12}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'nord'), 'estate', 'Giornata piovosa', 15, '[{"cond":"pioggia","temp":7},{"cond":"pioggia","temp":10},{"cond":"pioggerella","temp":14},{"cond":"pioggia","temp":11}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'nord'), 'estate', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":6},{"cond":"nebbia","temp":11},{"cond":"poco_nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'nord'), 'autunno', 'Cielo coperto', 25, '[{"cond":"nuvoloso","temp":-2},{"cond":"nuvoloso","temp":1},{"cond":"nuvoloso","temp":5},{"cond":"nuvoloso","temp":2}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'nord'), 'autunno', 'Neve leggera', 20, '[{"cond":"nuvoloso","temp":-3},{"cond":"nevischio","temp":1},{"cond":"neve","temp":6},{"cond":"nuvoloso","temp":2}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'nord'), 'autunno', 'Giornata piovosa', 20, '[{"cond":"pioggia","temp":-2},{"cond":"pioggia","temp":0},{"cond":"pioggerella","temp":3},{"cond":"pioggia","temp":1}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'nord'), 'autunno', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":-3},{"cond":"nebbia","temp":1},{"cond":"poco_nuvoloso","temp":6},{"cond":"poco_nuvoloso","temp":2}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'nord'), 'autunno', 'Gelo sereno', 10, '[{"cond":"sereno","temp":-8},{"cond":"sereno","temp":-2},{"cond":"sereno","temp":5},{"cond":"sereno","temp":0}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'nord'), 'autunno', 'Giornata ventosa', 10, '[{"cond":"vento","temp":-4},{"cond":"vento","temp":0},{"cond":"vento","temp":5},{"cond":"poco_nuvoloso","temp":1}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'dorne'), 'inverno', 'Giornata serena', 50, '[{"cond":"sereno","temp":6},{"cond":"sereno","temp":12},{"cond":"sereno","temp":19},{"cond":"sereno","temp":14}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'dorne'), 'inverno', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":8},{"cond":"poco_nuvoloso","temp":13},{"cond":"nuvoloso","temp":18},{"cond":"poco_nuvoloso","temp":14}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'dorne'), 'inverno', 'Giornata ventosa', 15, '[{"cond":"vento","temp":7},{"cond":"vento","temp":11},{"cond":"vento","temp":16},{"cond":"poco_nuvoloso","temp":12}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'dorne'), 'inverno', 'Tempesta di sabbia', 10, '[{"cond":"vento","temp":8},{"cond":"tempesta_sabbia","temp":13},{"cond":"tempesta_sabbia","temp":18},{"cond":"vento","temp":14}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'dorne'), 'inverno', 'Pioggia pomeridiana', 5, '[{"cond":"poco_nuvoloso","temp":8},{"cond":"nuvoloso","temp":12},{"cond":"pioggia","temp":16},{"cond":"pioggerella","temp":13}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'dorne'), 'primavera', 'Giornata serena', 55, '[{"cond":"sereno","temp":13},{"cond":"sereno","temp":20},{"cond":"sereno","temp":29},{"cond":"sereno","temp":23}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'dorne'), 'primavera', 'Calura', 15, '[{"cond":"sereno","temp":17},{"cond":"sereno","temp":23},{"cond":"afa","temp":31},{"cond":"sereno","temp":25}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'dorne'), 'primavera', 'Giornata ventosa', 15, '[{"cond":"vento","temp":14},{"cond":"vento","temp":19},{"cond":"vento","temp":26},{"cond":"poco_nuvoloso","temp":21}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'dorne'), 'primavera', 'Tempesta di sabbia', 15, '[{"cond":"vento","temp":15},{"cond":"tempesta_sabbia","temp":21},{"cond":"tempesta_sabbia","temp":28},{"cond":"vento","temp":23}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'dorne'), 'estate', 'Calura', 55, '[{"cond":"sereno","temp":26},{"cond":"sereno","temp":34},{"cond":"afa","temp":43},{"cond":"sereno","temp":36}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'dorne'), 'estate', 'Giornata serena', 30, '[{"cond":"sereno","temp":22},{"cond":"sereno","temp":31},{"cond":"sereno","temp":41},{"cond":"sereno","temp":33}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'dorne'), 'estate', 'Tempesta di sabbia', 15, '[{"cond":"vento","temp":24},{"cond":"tempesta_sabbia","temp":31},{"cond":"tempesta_sabbia","temp":40},{"cond":"vento","temp":34}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'dorne'), 'autunno', 'Giornata serena', 50, '[{"cond":"sereno","temp":14},{"cond":"sereno","temp":21},{"cond":"sereno","temp":30},{"cond":"sereno","temp":24}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'dorne'), 'autunno', 'Calura', 15, '[{"cond":"sereno","temp":18},{"cond":"sereno","temp":24},{"cond":"afa","temp":32},{"cond":"sereno","temp":26}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'dorne'), 'autunno', 'Giornata ventosa', 15, '[{"cond":"vento","temp":15},{"cond":"vento","temp":20},{"cond":"vento","temp":27},{"cond":"poco_nuvoloso","temp":22}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'dorne'), 'autunno', 'Tempesta di sabbia', 15, '[{"cond":"vento","temp":16},{"cond":"tempesta_sabbia","temp":22},{"cond":"tempesta_sabbia","temp":29},{"cond":"vento","temp":24}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'dorne'), 'autunno', 'Cielo velato', 5, '[{"cond":"poco_nuvoloso","temp":16},{"cond":"poco_nuvoloso","temp":22},{"cond":"nuvoloso","temp":29},{"cond":"poco_nuvoloso","temp":24}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'inverno', 'Burrasca', 25, '[{"cond":"vento","temp":0},{"cond":"pioggia","temp":1},{"cond":"burrasca","temp":3},{"cond":"pioggia","temp":2}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'inverno', 'Giornata piovosa', 25, '[{"cond":"pioggia","temp":1},{"cond":"pioggia","temp":1},{"cond":"pioggerella","temp":2},{"cond":"pioggia","temp":2}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'inverno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":1},{"cond":"nuvoloso","temp":2},{"cond":"nuvoloso","temp":4},{"cond":"nuvoloso","temp":3}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'inverno', 'Giornata ventosa', 20, '[{"cond":"vento","temp":-1},{"cond":"vento","temp":1},{"cond":"vento","temp":4},{"cond":"poco_nuvoloso","temp":2}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'inverno', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":0},{"cond":"nebbia","temp":2},{"cond":"poco_nuvoloso","temp":5},{"cond":"poco_nuvoloso","temp":3}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'primavera', 'Giornata piovosa', 25, '[{"cond":"pioggia","temp":5},{"cond":"pioggia","temp":6},{"cond":"pioggerella","temp":7},{"cond":"pioggia","temp":6}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'primavera', 'Giornata ventosa', 20, '[{"cond":"vento","temp":3},{"cond":"vento","temp":6},{"cond":"vento","temp":9},{"cond":"poco_nuvoloso","temp":7}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'primavera', 'Cielo velato', 20, '[{"cond":"poco_nuvoloso","temp":4},{"cond":"poco_nuvoloso","temp":7},{"cond":"nuvoloso","temp":11},{"cond":"poco_nuvoloso","temp":8}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'primavera', 'Burrasca', 15, '[{"cond":"vento","temp":4},{"cond":"pioggia","temp":6},{"cond":"burrasca","temp":8},{"cond":"pioggia","temp":6}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'primavera', 'Pioggia pomeridiana', 10, '[{"cond":"poco_nuvoloso","temp":4},{"cond":"nuvoloso","temp":6},{"cond":"pioggia","temp":9},{"cond":"pioggerella","temp":7}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'primavera', 'Giornata serena', 10, '[{"cond":"sereno","temp":2},{"cond":"sereno","temp":7},{"cond":"sereno","temp":12},{"cond":"sereno","temp":8}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'estate', 'Cielo velato', 25, '[{"cond":"poco_nuvoloso","temp":10},{"cond":"poco_nuvoloso","temp":13},{"cond":"nuvoloso","temp":17},{"cond":"poco_nuvoloso","temp":14}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'estate', 'Giornata serena', 20, '[{"cond":"sereno","temp":8},{"cond":"sereno","temp":13},{"cond":"sereno","temp":18},{"cond":"sereno","temp":14}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'estate', 'Temporale estivo', 15, '[{"cond":"poco_nuvoloso","temp":11},{"cond":"sereno","temp":14},{"cond":"temporale","temp":18},{"cond":"nuvoloso","temp":15}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'estate', 'Pioggia pomeridiana', 20, '[{"cond":"poco_nuvoloso","temp":10},{"cond":"nuvoloso","temp":12},{"cond":"pioggia","temp":15},{"cond":"pioggerella","temp":13}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'estate', 'Burrasca', 10, '[{"cond":"vento","temp":10},{"cond":"pioggia","temp":12},{"cond":"burrasca","temp":14},{"cond":"pioggia","temp":12}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'estate', 'Giornata ventosa', 10, '[{"cond":"vento","temp":9},{"cond":"vento","temp":12},{"cond":"vento","temp":15},{"cond":"poco_nuvoloso","temp":13}]'::jsonb, 5),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'autunno', 'Burrasca', 30, '[{"cond":"vento","temp":5},{"cond":"pioggia","temp":6},{"cond":"burrasca","temp":8},{"cond":"pioggia","temp":7}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'autunno', 'Giornata piovosa', 25, '[{"cond":"pioggia","temp":6},{"cond":"pioggia","temp":6},{"cond":"pioggerella","temp":7},{"cond":"pioggia","temp":7}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'autunno', 'Giornata ventosa', 20, '[{"cond":"vento","temp":4},{"cond":"vento","temp":6},{"cond":"vento","temp":9},{"cond":"poco_nuvoloso","temp":7}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'autunno', 'Cielo coperto', 15, '[{"cond":"nuvoloso","temp":6},{"cond":"nuvoloso","temp":7},{"cond":"nuvoloso","temp":9},{"cond":"nuvoloso","temp":8}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'isole_ferro'), 'autunno', 'Nebbia mattutina', 10, '[{"cond":"nebbia","temp":5},{"cond":"nebbia","temp":7},{"cond":"poco_nuvoloso","temp":10},{"cond":"poco_nuvoloso","temp":8}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'inverno', 'Bufera di neve', 35, '[{"cond":"neve","temp":-27},{"cond":"bufera","temp":-22},{"cond":"bufera","temp":-16},{"cond":"neve","temp":-20}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'inverno', 'Nevicata', 30, '[{"cond":"neve","temp":-24},{"cond":"neve","temp":-19},{"cond":"neve","temp":-14},{"cond":"nevischio","temp":-18}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'inverno', 'Gelo sereno', 25, '[{"cond":"sereno","temp":-30},{"cond":"sereno","temp":-23},{"cond":"sereno","temp":-14},{"cond":"sereno","temp":-20}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'inverno', 'Cielo coperto', 10, '[{"cond":"nuvoloso","temp":-24},{"cond":"nuvoloso","temp":-19},{"cond":"nuvoloso","temp":-14},{"cond":"nuvoloso","temp":-18}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'primavera', 'Nevicata', 25, '[{"cond":"neve","temp":-9},{"cond":"neve","temp":-6},{"cond":"neve","temp":-2},{"cond":"nevischio","temp":-5}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'primavera', 'Gelo sereno', 25, '[{"cond":"sereno","temp":-15},{"cond":"sereno","temp":-9},{"cond":"sereno","temp":-2},{"cond":"sereno","temp":-7}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'primavera', 'Neve leggera', 25, '[{"cond":"nuvoloso","temp":-10},{"cond":"nevischio","temp":-6},{"cond":"neve","temp":-1},{"cond":"nuvoloso","temp":-5}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'primavera', 'Bufera di neve', 15, '[{"cond":"neve","temp":-12},{"cond":"bufera","temp":-8},{"cond":"bufera","temp":-4},{"cond":"neve","temp":-7}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'primavera', 'Giornata serena', 10, '[{"cond":"sereno","temp":-12},{"cond":"sereno","temp":-6},{"cond":"sereno","temp":1},{"cond":"sereno","temp":-4}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'estate', 'Neve leggera', 25, '[{"cond":"nuvoloso","temp":-2},{"cond":"nevischio","temp":3},{"cond":"neve","temp":9},{"cond":"nuvoloso","temp":5}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'estate', 'Cielo coperto', 25, '[{"cond":"nuvoloso","temp":-1},{"cond":"nuvoloso","temp":3},{"cond":"nuvoloso","temp":8},{"cond":"nuvoloso","temp":4}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'estate', 'Gelo sereno', 15, '[{"cond":"sereno","temp":-7},{"cond":"sereno","temp":0},{"cond":"sereno","temp":8},{"cond":"sereno","temp":2}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'estate', 'Giornata serena', 20, '[{"cond":"sereno","temp":-4},{"cond":"sereno","temp":3},{"cond":"sereno","temp":11},{"cond":"sereno","temp":5}]'::jsonb, 3),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'estate', 'Nebbia mattutina', 15, '[{"cond":"nebbia","temp":-2},{"cond":"nebbia","temp":3},{"cond":"poco_nuvoloso","temp":9},{"cond":"poco_nuvoloso","temp":5}]'::jsonb, 4),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'autunno', 'Nevicata', 30, '[{"cond":"neve","temp":-11},{"cond":"neve","temp":-8},{"cond":"neve","temp":-4},{"cond":"nevischio","temp":-7}]'::jsonb, 0),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'autunno', 'Bufera di neve', 25, '[{"cond":"neve","temp":-14},{"cond":"bufera","temp":-10},{"cond":"bufera","temp":-6},{"cond":"neve","temp":-9}]'::jsonb, 1),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'autunno', 'Gelo sereno', 25, '[{"cond":"sereno","temp":-17},{"cond":"sereno","temp":-11},{"cond":"sereno","temp":-4},{"cond":"sereno","temp":-9}]'::jsonb, 2),
  ((select id from public.weather_regions where slug = 'oltre_barriera'), 'autunno', 'Cielo coperto', 20, '[{"cond":"nuvoloso","temp":-11},{"cond":"nuvoloso","temp":-8},{"cond":"nuvoloso","temp":-4},{"cond":"nuvoloso","temp":-7}]'::jsonb, 3);

-- La mappa attiva usa la regione delle Terre della Corona
update public.maps set weather_region_id = (select id from public.weather_regions where slug = 'terre_corona')
where active;
