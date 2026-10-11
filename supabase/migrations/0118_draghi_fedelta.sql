-- =====================================================================
-- 0118 - Draghi: fedelta' costruita dal cavaliere ("Rafforza il legame")
-- Eseguire in Supabase DOPO la 0117: SQL Editor -> New query -> incolla -> Run
-- (va bene anche se era gia' stata eseguita la versione precedente della 0118)
--
-- La fedelta' parte da 0 e NON sale piu' con l'allenamento: la alza solo il
-- cavaliere spendendo PX (costo per punto in Gestione -> Draghi).
-- Quando un drago perde o cambia cavaliere, la fedelta' torna a 0.
-- Gli effetti sui tiri (bonus, malus, critici, disobbedienza dei draghi
-- grandi con poca fedelta') li applica il sito.
-- =====================================================================

alter table public.dragons alter column loyalty set default 0;
update public.dragons set loyalty = 0;

alter table public.dragon_settings
  add column if not exists bond_px_per_point int not null default 1 check (bond_px_per_point between 0 and 1000);
grant update (bond_px_per_point) on public.dragon_settings to authenticated;

-- resti della versione precedente
drop trigger if exists dragons_loyalty_init on public.dragons;
drop function if exists public.dragons_loyalty_init();
drop function if exists public.dragon_loyalty_at(text, int);

-- ---------------------------------------------------------------------
-- Nuovo cavaliere, cavaliere perso o uovo appena schiuso: fedelta' a 0
-- ---------------------------------------------------------------------
create or replace function public.dragons_loyalty_reset()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.rider_id is distinct from old.rider_id
     or new.npc_rider_id is distinct from old.npc_rider_id
     or (old.status = 'uovo' and new.status = 'drago') then
    new.loyalty := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists dragons_loyalty_reset on public.dragons;
create trigger dragons_loyalty_reset before update on public.dragons
  for each row execute function public.dragons_loyalty_reset();

-- ---------------------------------------------------------------------
-- Il cavaliere rafforza il legame: PX in cambio di punti di fedelta'
-- ---------------------------------------------------------------------
create or replace function public.dragon_bond(p_dragon uuid, p_points int)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
  per_point int;
  cost int;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'drago' then
    raise exception 'Drago non trovato.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.characters c where c.id = d.rider_id and c.owner_id = auth.uid()) then
    raise exception 'Solo il cavaliere può rafforzare il legame con il suo drago.' using errcode = '42501';
  end if;
  if p_points is null or p_points < 1 then
    raise exception 'Indica di quanti punti rafforzare il legame.' using errcode = 'P0001';
  end if;
  if d.loyalty + p_points > 100 then
    raise exception 'La fedeltà non può superare il 100%%: mancano % punti.', 100 - d.loyalty using errcode = 'P0001';
  end if;
  select bond_px_per_point into per_point from public.dragon_settings;
  cost := coalesce(per_point, 1) * p_points;

  update public.characters set px = px - cost where id = d.rider_id and px >= cost;
  if not found then
    raise exception 'Servono % PX.', cost using errcode = 'P0001';
  end if;
  if cost > 0 then
    insert into public.px_log (character_id, amount, reason)
    values (d.rider_id, -cost, coalesce(nullif(d.name, ''), 'Drago') || ': legame +' || p_points || '%');
  end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set loyalty = loyalty + p_points where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
  return d.loyalty + p_points;
end;
$$;

revoke execute on function public.dragon_bond(uuid, int) from public, anon;
grant execute on function public.dragon_bond(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- Allenamento: alza di 1 una caratteristica o un'abilita' (non tocca la fedelta')
-- ---------------------------------------------------------------------
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
