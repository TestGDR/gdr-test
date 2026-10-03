-- =====================================================================
-- 0033 - Draghi: maturazione a PX investiti, abilita' comprate con i PX,
-- fedelta' (per ora solo rappresentativa)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Maturazione: il cavaliere investe PX nel drago quando vuole. Quando i PX
-- investiti raggiungono il costo della fase, il drago cresce da solo e
-- riceve 5 punti da distribuire; i PX in piu' restano nella fase nuova.
-- Abilita': il cavaliere alza un'abilita' di 1 spendendo
--   (PX per livello di abilita') x (nuovo valore)   -> es. 10 x 4 = 40 PX
-- Fedelta': 0-100, la imposta lo staff; per ora non ha effetti.
-- =====================================================================

alter table public.dragons
  add column growth_px int not null default 0 check (growth_px >= 0),
  add column loyalty   int not null default 50 check (loyalty between 0 and 100);

grant update (growth_px, loyalty) on public.dragons to authenticated;

-- Impostazioni generali dei draghi (una sola riga)
create table public.dragon_settings (
  id               boolean primary key default true check (id),
  skill_px_factor  int not null default 10 check (skill_px_factor between 0 and 1000)
);
insert into public.dragon_settings (id) values (true);

alter table public.dragon_settings enable row level security;
create policy "impostazioni visibili" on public.dragon_settings for select to authenticated using (true);
create policy "impostazioni con permesso" on public.dragon_settings for update to authenticated
  using (public.has_permission('draghi.gestire')) with check (public.has_permission('draghi.gestire'));
grant select on public.dragon_settings to authenticated;
grant update (skill_px_factor) on public.dragon_settings to authenticated;
grant select, update on public.dragon_settings to service_role;

-- ---------------------------------------------------------------------
-- Controllo sulle modifiche: maturazione e fedelta' le cambia solo lo staff
-- (o le funzioni qui sotto)
-- ---------------------------------------------------------------------
create or replace function public.dragons_check()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  k text;
begin
  -- Chi non e' staff (e non passa dalle funzioni dei draghi) cambia solo nome e immagine
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.dragon_internal', true), '') <> '1'
     and not public.has_permission('draghi.gestire')
     and (new.house_id, new.status, new.stage, new.sex, new.color1, new.color2, new.pregi, new.difetti,
          new.temperament, new.stats, new.skills, new.unspent_points, new.rider_id, new.npc_rider_id,
          new.growth_px, new.loyalty)
         is distinct from
         (old.house_id, old.status, old.stage, old.sex, old.color1, old.color2, old.pregi, old.difetti,
          old.temperament, old.stats, old.skills, old.unspent_points, old.rider_id, old.npc_rider_id,
          old.growth_px, old.loyalty) then
    raise exception 'Puoi cambiare solo il nome e l''immagine del drago.' using errcode = '42501';
  end if;

  -- Pregi e difetti validi e mai opposti
  foreach k in array new.pregi loop
    if not exists (select 1 from public.dragon_trait_pairs where pregio = k) then
      raise exception 'Pregio sconosciuto: %', k using errcode = 'P0001';
    end if;
    if exists (select 1 from public.dragon_trait_pairs where pregio = k and difetto = any (new.difetti)) then
      raise exception 'Il pregio "%" e il suo opposto non possono convivere.', k using errcode = 'P0001';
    end if;
  end loop;
  foreach k in array new.difetti loop
    if not exists (select 1 from public.dragon_trait_pairs where difetto = k) then
      raise exception 'Difetto sconosciuto: %', k using errcode = 'P0001';
    end if;
  end loop;

  -- Un PNG morto non cavalca
  if new.npc_rider_id is not null and new.npc_rider_id is distinct from old.npc_rider_id
     and exists (select 1 from public.house_npcs where id = new.npc_rider_id and deceased) then
    raise exception 'Un PNG morto non può essere cavaliere.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Il cavaliere investe PX nella maturazione del drago
-- ---------------------------------------------------------------------
create or replace function public.dragon_invest_px(p_dragon uuid, p_amount int)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
  cur public.dragon_stages;
  nxt public.dragon_stages;
  invested int;
  points int := 0;
  stage_now text;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'drago' then
    raise exception 'Drago non trovato.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.characters c where c.id = d.rider_id and c.owner_id = auth.uid()) then
    raise exception 'Solo il cavaliere può far maturare il suo drago.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'Indica quanti PX investire.' using errcode = 'P0001';
  end if;
  select * into cur from public.dragon_stages where stage = d.stage;
  if cur.px_to_next is null then
    raise exception 'Il drago è già adulto.' using errcode = 'P0001';
  end if;

  update public.characters set px = px - p_amount where id = d.rider_id and px >= p_amount;
  if not found then
    raise exception 'Non hai abbastanza PX.' using errcode = 'P0001';
  end if;
  insert into public.px_log (character_id, amount, reason)
  values (d.rider_id, -p_amount, 'Maturazione di ' || coalesce(nullif(d.name, ''), 'drago'));

  -- i PX investiti possono far superare piu' fasi; quelli in avanzo restano
  invested := d.growth_px + p_amount;
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
  -- da adulto i PX in avanzo non servono piu'
  if cur.px_to_next is null then invested := 0; end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set
    growth_px = invested,
    stage = stage_now,
    unspent_points = unspent_points + points
  where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
  return stage_now;
end;
$$;

-- ---------------------------------------------------------------------
-- Il cavaliere alza un'abilita' di 1 spendendo PX
-- ---------------------------------------------------------------------
create or replace function public.dragon_buy_skill(p_dragon uuid, p_skill text)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
  factor int;
  cur int;
  cost int;
  skill_label text;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'drago' then
    raise exception 'Drago non trovato.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.characters c where c.id = d.rider_id and c.owner_id = auth.uid()) then
    raise exception 'Solo il cavaliere può migliorare le abilità del suo drago.' using errcode = '42501';
  end if;
  select s.label into skill_label from public.dragon_skills s where s.key = p_skill;
  if skill_label is null then
    raise exception 'Abilità sconosciuta.' using errcode = 'P0001';
  end if;
  cur := coalesce((d.skills ->> p_skill)::int, 0);
  if cur >= 10 then
    raise exception 'L''abilità è già al massimo.' using errcode = 'P0001';
  end if;
  select skill_px_factor into factor from public.dragon_settings;
  cost := coalesce(factor, 10) * (cur + 1);

  update public.characters set px = px - cost where id = d.rider_id and px >= cost;
  if not found then
    raise exception 'Servono % PX.', cost using errcode = 'P0001';
  end if;
  insert into public.px_log (character_id, amount, reason)
  values (d.rider_id, -cost, coalesce(nullif(d.name, ''), 'Drago') || ': ' || skill_label || ' a ' || (cur + 1));

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set skills = jsonb_set(skills, array[p_skill], to_jsonb(cur + 1)) where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
  return cur + 1;
end;
$$;

revoke execute on function public.dragon_invest_px(uuid, int) from public, anon;
revoke execute on function public.dragon_buy_skill(uuid, text) from public, anon;
grant execute on function public.dragon_invest_px(uuid, int) to authenticated;
grant execute on function public.dragon_buy_skill(uuid, text) to authenticated;
