-- =====================================================================
-- 0029 - Draghi: abilita', pregi e difetti, caratteri gestibili dallo staff
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Le abilita' non sono piu' fisse: stanno in una tabella che lo staff
-- puo' modificare (nome, ordine), ampliare ed accorciare.
--   - nuova abilita': per i draghi gia' esistenti vale 0
--   - abilita' eliminata: sparisce dai valori di tutti i draghi
-- Pregi/difetti e caratteri si creano, modificano ed eliminano:
--   - un tratto rinominato si aggiorna anche sui draghi che ce l'hanno
--   - un tratto eliminato viene tolto dai draghi
-- =====================================================================

-- ---------------------------------------------------------------------
-- Abilita'
-- ---------------------------------------------------------------------
create table public.dragon_skills (
  key         text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  label       text not null check (char_length(label) between 1 and 60),
  sort_order  int  not null default 0
);
insert into public.dragon_skills (key, label, sort_order) values
  ('volare',            'Volare',            0),
  ('attacco_fisico',    'Attacco fisico',    1),
  ('attacco_infuocato', 'Attacco infuocato', 2),
  ('schivare',          'Schivare',          3),
  ('fermezza',          'Fermezza',          4),
  ('sensi',             'Sensi',             5);

alter table public.dragon_skills enable row level security;
create policy "abilita visibili"      on public.dragon_skills for select to authenticated using (true);
create policy "abilita con permesso"  on public.dragon_skills for all to authenticated
  using (public.has_permission('draghi.gestire')) with check (public.has_permission('draghi.gestire'));
grant select, insert, delete on public.dragon_skills to authenticated;
grant update (label, sort_order) on public.dragon_skills to authenticated; -- la chiave non cambia
grant select, insert, update, delete on public.dragon_skills to service_role;

-- abilita' eliminata: tolta dai valori dei draghi
create or replace function public.dragon_skills_after_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set skills = skills - old.key where skills ? old.key;
  perform set_config('app.dragon_internal', '', true);
  return old;
end;
$$;
create trigger dragon_skills_after_delete after delete on public.dragon_skills
  for each row execute function public.dragon_skills_after_delete();

-- ---------------------------------------------------------------------
-- Pregi e difetti: lo staff li gestisce (sempre a coppie di opposti)
-- ---------------------------------------------------------------------
create policy "tratti con permesso" on public.dragon_trait_pairs for all to authenticated
  using (public.has_permission('draghi.gestire')) with check (public.has_permission('draghi.gestire'));
grant insert, update, delete on public.dragon_trait_pairs to authenticated;

-- rinomina: il nuovo nome va anche sui draghi; eliminazione: tolto dai draghi
create or replace function public.dragon_trait_pairs_sync()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('app.dragon_internal', '1', true);
  if tg_op = 'UPDATE' then
    if new.pregio <> old.pregio then
      update public.dragons set pregi = array_replace(pregi, old.pregio, new.pregio) where old.pregio = any (pregi);
    end if;
    if new.difetto <> old.difetto then
      update public.dragons set difetti = array_replace(difetti, old.difetto, new.difetto) where old.difetto = any (difetti);
    end if;
  elsif tg_op = 'DELETE' then
    update public.dragons set
      pregi = array_remove(pregi, old.pregio),
      difetti = array_remove(difetti, old.difetto)
    where old.pregio = any (pregi) or old.difetto = any (difetti);
  end if;
  perform set_config('app.dragon_internal', '', true);
  return coalesce(new, old);
end;
$$;
create trigger dragon_trait_pairs_sync after update or delete on public.dragon_trait_pairs
  for each row execute function public.dragon_trait_pairs_sync();

-- ---------------------------------------------------------------------
-- Caratteri di base: lo staff li gestisce (i draghi tengono il loro testo)
-- ---------------------------------------------------------------------
create policy "caratteri con permesso" on public.dragon_temperaments for all to authenticated
  using (public.has_permission('draghi.gestire')) with check (public.has_permission('draghi.gestire'));
grant insert, update, delete on public.dragon_temperaments to authenticated;

-- ---------------------------------------------------------------------
-- Generazione casuale: abilita' lette dalla tabella
-- ---------------------------------------------------------------------
create or replace function public.dragon_fill_random(p_id uuid, p_stage text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  palette text[] := array['Oro', 'Bianco', 'Blu', 'Nero', 'Rosso', 'Bronzo', 'Verde', 'Arancio'];
  cfg public.dragon_stages;
  st int[] := array[0, 0, 0, 0]; -- vigore, destrezza, intelletto, percezione
  skill_keys text[];
  n int;
  sk int[];
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
  skills_json jsonb := '{}';
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

  -- abilita' (quelle definite dallo staff)
  select coalesce(array_agg(key order by sort_order, label), '{}') into skill_keys from public.dragon_skills;
  n := coalesce(array_length(skill_keys, 1), 0);
  if n > 0 then
    sk := array_fill(0, array[n]);
    remaining := least(cfg.skill_points, n * 10);
    if cfg.sort_order >= 2 then
      -- da adolescente in su: omogenee, stessa base per tutte e il resto a caso su abilita' diverse
      base := least(remaining / n, 10);
      for i in 1..n loop sk[i] := base; end loop;
      remaining := remaining - base * n;
      select array_agg(g order by random()) into picks from generate_series(1, n) g;
      for i in 1..least(remaining, n) loop
        sk[picks[i]] := least(sk[picks[i]] + 1, 10);
      end loop;
    else
      -- neonato e cucciolo: del tutto a caso (qualche abilita' puo' restare a 0)
      while remaining > 0 loop
        k := 1 + floor(random() * n)::int;
        if sk[k] < 10 then
          sk[k] := sk[k] + 1;
          remaining := remaining - 1;
        end if;
      end loop;
    end if;
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
    hatched_at = coalesce(hatched_at, now())
  where id = p_id;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

revoke execute on function public.dragon_fill_random(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Punti del cavaliere: abilita' lette dalla tabella
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
  skill_keys text[];
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
  select coalesce(array_agg(key), '{}') into skill_keys from public.dragon_skills;

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
