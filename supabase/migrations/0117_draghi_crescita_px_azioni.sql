-- =====================================================================
-- 0117 - Draghi: crescita comprando caratteristiche e abilita'; PX dalle azioni
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Draghi
--   - Non si investono piu' PX "nello stadio": il cavaliere spende PX per
--     alzare di 1 una caratteristica o un'abilita' del drago.
--     Costo = (PX per livello, Gestione -> Draghi) x (nuovo valore).
--   - Come per i PG, un'abilita' non supera la sua caratteristica.
--   - Ogni caratteristica non supera il tetto dello stadio.
--   - I PX spesi riempiono la barra dello stadio: quando e' piena il drago
--     passa allo stadio dopo e riceve 5 punti da distribuire.
--   - Da adulto le caratteristiche non si comprano piu' (le abilita' si'
--     possono ancora completare fino alla loro caratteristica).
--   - I draghi esistenti vengono eliminati: vanno ricreati.
-- PX dalle azioni
--   - Ogni azione in chat di piu' di 1000 caratteri vale mezzo PX al
--     personaggio che la scrive (due azioni = 1 PX). Non vale per i PNG.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mezzo PX: il mezzo punto in sospeso sta in una casella a parte
-- ---------------------------------------------------------------------
alter table public.characters add column if not exists px_half boolean not null default false;

create or replace function public.message_px_reward()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.kind = 'azione' and char_length(new.content) > 1000 then
    update public.characters
      set px = px + (case when px_half then 1 else 0 end), px_half = not px_half
      where id = new.character_id and not is_npc;
  end if;
  return new;
end;
$$;

drop trigger if exists message_px_reward on public.messages;
create trigger message_px_reward after insert on public.messages
  for each row execute function public.message_px_reward();

-- ---------------------------------------------------------------------
-- Stadi: PX per riempire la barra, tetti e punti alla generazione
-- ---------------------------------------------------------------------
update public.dragon_stages set px_to_next = 40,   stat_cap = 3,  stat_points = 10, skill_points = 7  where stage = 'neonato';
update public.dragon_stages set px_to_next = 80,   stat_cap = 5,  stat_points = 15, skill_points = 11 where stage = 'cucciolo';
update public.dragon_stages set px_to_next = 130,  stat_cap = 7,  stat_points = 21, skill_points = 18 where stage = 'adolescente';
update public.dragon_stages set px_to_next = 200,  stat_cap = 10, stat_points = 27, skill_points = 27 where stage = 'subadulto';
update public.dragon_stages set px_to_next = null, stat_cap = 10, stat_points = 33, skill_points = 38 where stage = 'adulto';

alter table public.dragon_settings alter column skill_px_factor set default 3;
update public.dragon_settings set skill_px_factor = 3;

-- I draghi esistenti non rispettano le nuove regole: si ricreano (le uova restano)
delete from public.dragons where status = 'drago';

-- ---------------------------------------------------------------------
-- Generazione casuale: ogni caratteristica almeno 1 e mai oltre il tetto;
-- le abilita' mai oltre la loro caratteristica
-- ---------------------------------------------------------------------
create or replace function public.dragon_fill_random(p_id uuid, p_stage text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  palette text[] := array['Oro', 'Bianco', 'Blu', 'Nero', 'Rosso', 'Bronzo', 'Verde', 'Arancio'];
  stat_keys text[] := array['vigore', 'destrezza', 'intelletto', 'percezione'];
  cfg public.dragon_stages;
  st int[] := array[1, 1, 1, 1];
  skill_keys text[];
  skill_stats text[];
  lim int[]; -- tetto di ogni abilita' = valore della sua caratteristica
  n int;
  sk int[];
  remaining int;
  room int := 0;
  k int;
  i int;
  c1 text;
  c2 text;
  pr text[] := '{}';
  df text[] := '{}';
  rec record;
  skills_json jsonb := '{}';
begin
  select * into cfg from public.dragon_stages where stage = p_stage;
  if cfg.stage is null then
    raise exception 'Fase sconosciuta: %', p_stage using errcode = 'P0001';
  end if;

  -- caratteristiche: 1 di base, il resto a caso, mai oltre il tetto della fase
  remaining := greatest(0, least(cfg.stat_points, cfg.stat_cap * 4) - 4);
  while remaining > 0 loop
    k := 1 + floor(random() * 4)::int;
    if st[k] < cfg.stat_cap then
      st[k] := st[k] + 1;
      remaining := remaining - 1;
    end if;
  end loop;

  -- abilita': a caso, ognuna al massimo quanto la sua caratteristica
  select coalesce(array_agg(key order by sort_order, label), '{}'),
         coalesce(array_agg(stat_key order by sort_order, label), '{}')
    into skill_keys, skill_stats from public.dragon_skills;
  n := coalesce(array_length(skill_keys, 1), 0);
  if n > 0 then
    sk := array_fill(0, array[n]);
    lim := array_fill(0, array[n]);
    for i in 1..n loop
      lim[i] := st[array_position(stat_keys, skill_stats[i])];
      room := room + lim[i];
    end loop;
    remaining := least(cfg.skill_points, room);
    while remaining > 0 loop
      k := 1 + floor(random() * n)::int;
      if sk[k] < lim[k] then
        sk[k] := sk[k] + 1;
        remaining := remaining - 1;
      end if;
    end loop;
    for i in 1..n loop
      skills_json := skills_json || jsonb_build_object(skill_keys[i], sk[i]);
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
    temperament = public.dragon_compose_temperament(pr, df),
    stats = jsonb_build_object('vigore', st[1], 'destrezza', st[2], 'intelletto', st[3], 'percezione', st[4]),
    skills = skills_json,
    unspent_points = 0,
    growth_px = 0,
    hatched_at = coalesce(hatched_at, now())
  where id = p_id;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

revoke execute on function public.dragon_fill_random(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Punti gratuiti del passaggio di stadio: stesse regole (tetto dello
-- stadio per le caratteristiche, abilita' mai oltre la caratteristica)
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
  k text;
  v int;
  total int := 0;
  st jsonb;
  sk jsonb;
  rec record;
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
    elsif exists (select 1 from public.dragon_skills s where s.key = k) then
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
  -- le abilita' toccate non superano la loro caratteristica (contando i punti appena messi)
  for rec in select s.key, s.label, s.stat_key from public.dragon_skills s where p_alloc ? s.key loop
    if coalesce((p_alloc ->> rec.key)::int, 0) > 0
       and coalesce((sk ->> rec.key)::int, 0) > coalesce((st ->> rec.stat_key)::int, 0) then
      raise exception '% non può superare la sua caratteristica.', rec.label using errcode = 'P0001';
    end if;
  end loop;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set stats = st, skills = sk, unspent_points = unspent_points - total where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

revoke execute on function public.dragon_assign_points(uuid, jsonb) from public, anon;
grant execute on function public.dragon_assign_points(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Il cavaliere alza di 1 una caratteristica o un'abilita' spendendo PX.
-- I PX spesi riempiono la barra dello stadio.
-- ---------------------------------------------------------------------
drop function if exists public.dragon_invest_px(uuid, int);
drop function if exists public.dragon_buy_skill(uuid, text);
drop function if exists public.dragon_grow(uuid);

create or replace function public.dragon_buy(p_dragon uuid, p_key text)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
  cur public.dragon_stages;
  nxt public.dragon_stages;
  stat_keys text[] := array['vigore', 'destrezza', 'intelletto', 'percezione'];
  is_stat boolean := p_key = any (stat_keys);
  item_label text;
  linked text;
  val int;
  factor int;
  cost int;
  invested int;
  points int := 0;
  stage_now text;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'drago' then
    raise exception 'Drago non trovato.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.characters c where c.id = d.rider_id and c.owner_id = auth.uid()) then
    raise exception 'Solo il cavaliere può far crescere il suo drago.' using errcode = '42501';
  end if;
  select * into cur from public.dragon_stages where stage = d.stage;

  if is_stat then
    item_label := initcap(p_key);
    val := coalesce((d.stats ->> p_key)::int, 0);
    if cur.px_to_next is null then
      raise exception 'Un drago adulto è ormai formato: le caratteristiche non crescono più.' using errcode = 'P0001';
    end if;
    if val >= cur.stat_cap then
      raise exception 'In questa fase una caratteristica non può superare %.', cur.stat_cap using errcode = 'P0001';
    end if;
  else
    select s.label, s.stat_key into item_label, linked from public.dragon_skills s where s.key = p_key;
    if item_label is null then
      raise exception 'Voce sconosciuta.' using errcode = 'P0001';
    end if;
    val := coalesce((d.skills ->> p_key)::int, 0);
    if val >= least(10, coalesce((d.stats ->> linked)::int, 0)) then
      raise exception '% non può superare la sua caratteristica (%).', item_label, initcap(linked) using errcode = 'P0001';
    end if;
  end if;

  select skill_px_factor into factor from public.dragon_settings;
  cost := coalesce(factor, 3) * (val + 1);
  update public.characters set px = px - cost where id = d.rider_id and px >= cost;
  if not found then
    raise exception 'Servono % PX.', cost using errcode = 'P0001';
  end if;
  insert into public.px_log (character_id, amount, reason)
  values (d.rider_id, -cost, coalesce(nullif(d.name, ''), 'Drago') || ': ' || item_label || ' a ' || (val + 1));

  -- la barra dello stadio: i PX in piu' restano nello stadio nuovo
  invested := d.growth_px + cost;
  stage_now := d.stage;
  loop
    select * into cur from public.dragon_stages where stage = stage_now;
    exit when cur.px_to_next is null or invested < cur.px_to_next;
    select * into nxt from public.dragon_stages where sort_order = cur.sort_order + 1;
    exit when nxt.stage is null;
    invested := invested - cur.px_to_next;
    stage_now := nxt.stage;
    points := points + 5;
  end loop;
  if cur.px_to_next is null then invested := 0; end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set
    stats  = case when is_stat then jsonb_set(stats, array[p_key], to_jsonb(val + 1)) else stats end,
    skills = case when is_stat then skills else jsonb_set(skills, array[p_key], to_jsonb(val + 1)) end,
    growth_px = invested,
    stage = stage_now,
    unspent_points = unspent_points + points
  where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
  return stage_now;
end;
$$;

revoke execute on function public.dragon_buy(uuid, text) from public, anon;
grant execute on function public.dragon_buy(uuid, text) to authenticated;
