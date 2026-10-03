-- =====================================================================
-- 0026 - Draghi: punti alla generazione in base alla fase
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni fase dice quanti punti ricevono caratteristiche e abilita' quando
-- un drago viene generato (schiusa o creazione) e il tetto di ogni
-- caratteristica in quella fase.
--   caratteristiche: si parte da 0, punti distribuiti a caso fino al tetto
--   abilita': neonato e cucciolo a caso (anche 0); da adolescente in su
--             in modo omogeneo (nessuna a 0)
-- =====================================================================

alter table public.dragon_stages
  add column stat_points  int not null default 10 check (stat_points between 0 and 200),
  add column skill_points int not null default 7  check (skill_points between 0 and 200),
  add column stat_cap     int not null default 3  check (stat_cap between 1 and 10);

update public.dragon_stages set stat_points = 10, skill_points = 7,  stat_cap = 3  where stage = 'neonato';
update public.dragon_stages set stat_points = 15, skill_points = 11, stat_cap = 5  where stage = 'cucciolo';
update public.dragon_stages set stat_points = 20, skill_points = 15, stat_cap = 7  where stage = 'adolescente';
update public.dragon_stages set stat_points = 25, skill_points = 19, stat_cap = 9  where stage = 'subadulto';
update public.dragon_stages set stat_points = 30, skill_points = 23, stat_cap = 10 where stage = 'adulto';

grant update (stat_points, skill_points, stat_cap) on public.dragon_stages to authenticated;

-- ---------------------------------------------------------------------
-- Generazione casuale con i punti della fase
-- ---------------------------------------------------------------------
create or replace function public.dragon_fill_random(p_id uuid, p_stage text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  palette text[] := array['Oro', 'Bianco', 'Blu', 'Nero', 'Rosso', 'Bronzo', 'Verde', 'Arancio'];
  cfg public.dragon_stages;
  st int[] := array[0, 0, 0, 0];       -- vigore, destrezza, intelletto, percezione
  sk int[] := array[0, 0, 0, 0, 0, 0]; -- volare, attacco fisico, attacco infuocato, schivare, fermezza, sensi
  remaining int;
  base int;
  k int;
  i int;
  c1 text;
  c2 text;
  pr text[] := '{}';
  df text[] := '{}';
  picks int[];
  rec record;
begin
  select * into cfg from public.dragon_stages where stage = p_stage;
  if cfg.stage is null then
    raise exception 'Fase sconosciuta: %', p_stage using errcode = 'P0001';
  end if;

  -- caratteristiche: punti a caso, mai oltre il tetto della fase
  remaining := least(cfg.stat_points, cfg.stat_cap * 4);
  while remaining > 0 loop
    k := 1 + floor(random() * 4)::int;
    if st[k] < cfg.stat_cap then
      st[k] := st[k] + 1;
      remaining := remaining - 1;
    end if;
  end loop;

  -- abilita'
  remaining := least(cfg.skill_points, 60);
  if cfg.sort_order >= 2 then
    -- da adolescente in su: omogenee, stessa base per tutte e il resto a caso su abilita' diverse
    base := remaining / 6;
    for i in 1..6 loop sk[i] := least(base, 10); end loop;
    remaining := remaining - base * 6;
    select array_agg(n order by random()) into picks from generate_series(1, 6) n;
    for i in 1..remaining loop
      sk[picks[i]] := least(sk[picks[i]] + 1, 10);
    end loop;
  else
    -- neonato e cucciolo: del tutto a caso (qualche abilita' puo' restare a 0)
    while remaining > 0 loop
      k := 1 + floor(random() * 6)::int;
      if sk[k] < 10 then
        sk[k] := sk[k] + 1;
        remaining := remaining - 1;
      end if;
    end loop;
  end if;

  -- 2 pregi e 1 difetto da tre coppie diverse: mai un pregio col suo opposto
  i := 0;
  for rec in select * from public.dragon_trait_pairs order by random() limit 3 loop
    i := i + 1;
    if i <= 2 then pr := pr || rec.pregio; else df := df || rec.difetto; end if;
  end loop;

  -- colore: uno solo o due diversi
  c1 := palette[1 + floor(random() * 8)::int];
  if random() < 0.5 then
    loop
      c2 := palette[1 + floor(random() * 8)::int];
      exit when c2 <> c1;
    end loop;
  end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set
    status = 'drago',
    stage = p_stage,
    sex = case when random() < 0.5 then 'maschio' else 'femmina' end,
    color1 = c1,
    color2 = c2,
    pregi = pr,
    difetti = df,
    temperament = public.dragon_random_temperament(),
    stats = jsonb_build_object('vigore', st[1], 'destrezza', st[2], 'intelletto', st[3], 'percezione', st[4]),
    skills = jsonb_build_object('volare', sk[1], 'attacco_fisico', sk[2], 'attacco_infuocato', sk[3],
                                'schivare', sk[4], 'fermezza', sk[5], 'sensi', sk[6]),
    unspent_points = 0,
    hatched_at = coalesce(hatched_at, now())
  where id = p_id;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

revoke execute on function public.dragon_fill_random(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Punti distribuiti dal cavaliere: le caratteristiche rispettano il tetto
-- della fase attuale, le abilita' arrivano al massimo a 10
-- ---------------------------------------------------------------------
create or replace function public.dragon_assign_points(p_dragon uuid, p_alloc jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
  cap int;
  stat_keys text[] := array['vigore', 'destrezza', 'intelletto', 'percezione'];
  skill_keys text[] := array['volare', 'attacco_fisico', 'attacco_infuocato', 'schivare', 'fermezza', 'sensi'];
  k text;
  v int;
  total int := 0;
  st jsonb;
  sk jsonb;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'drago' then
    raise exception 'Drago non trovato.' using errcode = 'P0001';
  end if;
  if not public.has_permission('draghi.gestire')
     and not exists (select 1 from public.characters c where c.id = d.rider_id and c.owner_id = auth.uid()) then
    raise exception 'Solo il cavaliere può distribuire i punti del suo drago.' using errcode = '42501';
  end if;
  select stat_cap into cap from public.dragon_stages where stage = d.stage;

  st := d.stats;
  sk := d.skills;
  for k, v in select key, value::int from jsonb_each_text(p_alloc) loop
    if v < 0 then
      raise exception 'Valore non valido.' using errcode = 'P0001';
    end if;
    total := total + v;
    if k = any (stat_keys) then
      if coalesce((st ->> k)::int, 0) + v > cap then
        raise exception 'In questa fase una caratteristica non può superare %.', cap using errcode = 'P0001';
      end if;
      st := jsonb_set(st, array[k], to_jsonb(coalesce((st ->> k)::int, 0) + v));
    elsif k = any (skill_keys) then
      if coalesce((sk ->> k)::int, 0) + v > 10 then
        raise exception 'Un''abilità non può superare 10.' using errcode = 'P0001';
      end if;
      sk := jsonb_set(sk, array[k], to_jsonb(coalesce((sk ->> k)::int, 0) + v));
    else
      raise exception 'Voce sconosciuta: %', k using errcode = 'P0001';
    end if;
  end loop;
  if total = 0 then
    return;
  end if;
  if total > d.unspent_points then
    raise exception 'Hai solo % punti da distribuire.', d.unspent_points using errcode = 'P0001';
  end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set stats = st, skills = sk, unspent_points = unspent_points - total where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

revoke execute on function public.dragon_assign_points(uuid, jsonb) from public, anon;
grant execute on function public.dragon_assign_points(uuid, jsonb) to authenticated;
