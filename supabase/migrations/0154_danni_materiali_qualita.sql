-- =====================================================================
-- 0154 - Tipo di danno contro il materiale delle armature; Fabbro che
--        migliora ogni oggetto "per quello che e'"
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - Danno contro armatura: per ogni tipo di danno (taglio, perforante,
--   contundente) e materiale (imbottito ... piastre) un moltiplicatore del
--   danno, prima di togliere l'SP. Gestione -> Oggetti -> Danni e armature.
-- - Secondo tipo di danno delle armi (es. spade: taglio o affondo): chi
--   attacca sceglie come colpire.
-- - Bonus della qualita' per tipo di oggetto: armi da taglio, perforanti,
--   contundenti, scudi, armature di ogni materiale. Ognuno ha solo i bonus
--   che hanno senso (lo scudo la parata, l'armatura SP e ingombro...).
--   Gestione -> Oggetti -> Qualita' (fabbro).
-- - Il fabbro migliora solo armi, scudi e armature.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Secondo tipo di danno
-- ---------------------------------------------------------------------
alter table public.items add column if not exists damage_type_alt text;
alter table public.items drop constraint if exists items_damage_type_alt_check;
alter table public.items add constraint items_damage_type_alt_check
  check (damage_type_alt is null or damage_type_alt in ('taglio', 'perforante', 'contundente'));

-- Le spade colpiscono di taglio o in affondo
update public.items set damage_type_alt = 'perforante'
 where kind = 'arma' and name in ('Spada lunga', 'Spadone', 'Spada corta') and damage_type = 'taglio'
   and damage_type_alt is null;

-- Doppione delle prime prove, senza valori di combattimento (solo se nessuno lo possiede)
delete from public.items i
 where i.name = 'Spada a una mano' and i.kind = 'altro'
   and not exists (select 1 from public.character_items ci where ci.item_id = i.id);

-- ---------------------------------------------------------------------
-- Danno contro il materiale dell'armatura
-- ---------------------------------------------------------------------
create table if not exists public.damage_material_mods (
  damage_type text not null check (damage_type in ('taglio', 'perforante', 'contundente')),
  material text not null check (material in ('imbottito', 'cuoio-bollito', 'brigantina', 'maglia', 'piastre')),
  factor numeric(4,2) not null default 1 check (factor >= 0 and factor <= 3),
  primary key (damage_type, material)
);
alter table public.damage_material_mods enable row level security;
drop policy if exists "danni armature visibili" on public.damage_material_mods;
create policy "danni armature visibili" on public.damage_material_mods for select to authenticated using (true);
drop policy if exists "danni armature dello staff" on public.damage_material_mods;
create policy "danni armature dello staff" on public.damage_material_mods for all to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));
grant select, insert, update, delete on public.damage_material_mods to authenticated;
grant select on public.damage_material_mods to service_role;

insert into public.damage_material_mods (damage_type, material, factor) values
  ('taglio', 'imbottito', 1), ('taglio', 'cuoio-bollito', 1), ('taglio', 'brigantina', 0.75),
  ('taglio', 'maglia', 0.5), ('taglio', 'piastre', 0.5),
  ('perforante', 'imbottito', 1), ('perforante', 'cuoio-bollito', 1), ('perforante', 'brigantina', 1),
  ('perforante', 'maglia', 1), ('perforante', 'piastre', 0.5),
  ('contundente', 'imbottito', 0.75), ('contundente', 'cuoio-bollito', 1), ('contundente', 'brigantina', 1),
  ('contundente', 'maglia', 1), ('contundente', 'piastre', 1)
on conflict (damage_type, material) do nothing;

-- ---------------------------------------------------------------------
-- Bonus della qualita' per tipo di oggetto
-- ---------------------------------------------------------------------
create table if not exists public.quality_bonuses (
  quality_id uuid not null references public.item_qualities(id) on delete cascade,
  item_class text not null check (item_class in (
    'taglio', 'perforante', 'contundente', 'scudo',
    'imbottito', 'cuoio-bollito', 'brigantina', 'maglia', 'piastre')),
  hit int not null default 0 check (hit between 0 and 10),
  damage int not null default 0 check (damage between 0 and 10),
  pierce int not null default 0 check (pierce between 0 and 10),
  aff int not null default 0 check (aff between 0 and 50),
  sp int not null default 0 check (sp between 0 and 20),
  parry int not null default 0 check (parry between 0 and 10),
  encumbrance int not null default 0 check (encumbrance between 0 and 10), -- ingombro tolto
  primary key (quality_id, item_class)
);
alter table public.quality_bonuses enable row level security;
drop policy if exists "bonus qualita visibili" on public.quality_bonuses;
create policy "bonus qualita visibili" on public.quality_bonuses for select to authenticated using (true);
drop policy if exists "bonus qualita dello staff" on public.quality_bonuses;
create policy "bonus qualita dello staff" on public.quality_bonuses for all to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));
grant select, insert, update, delete on public.quality_bonuses to authenticated;
grant select on public.quality_bonuses to service_role;

-- Valori di partenza per il 2°, 3° e 4° livello (Buono, Ottimo, Perfetto);
-- il primo livello (Scarso) non da' bonus
with q as (
  select id, row_number() over (order by level) as n from public.item_qualities
), v (item_class, n, hit, damage, pierce, aff, sp, parry, encumbrance) as (values
  ('taglio', 2, 1, 0, 0, 2, 0, 0, 0), ('taglio', 3, 1, 1, 0, 4, 0, 0, 0), ('taglio', 4, 2, 2, 0, 6, 0, 0, 0),
  ('perforante', 2, 1, 0, 0, 2, 0, 0, 0), ('perforante', 3, 1, 0, 1, 4, 0, 0, 0), ('perforante', 4, 2, 1, 2, 6, 0, 0, 0),
  ('contundente', 2, 0, 1, 0, 2, 0, 0, 0), ('contundente', 3, 1, 1, 0, 4, 0, 0, 0), ('contundente', 4, 1, 2, 0, 6, 0, 0, 0),
  ('scudo', 2, 0, 0, 0, 3, 0, 1, 0), ('scudo', 3, 0, 0, 0, 6, 0, 1, 0), ('scudo', 4, 0, 0, 0, 9, 0, 2, 0),
  ('imbottito', 2, 0, 0, 0, 0, 1, 0, 0), ('imbottito', 3, 0, 0, 0, 0, 1, 0, 0), ('imbottito', 4, 0, 0, 0, 0, 2, 0, 0),
  ('cuoio-bollito', 2, 0, 0, 0, 0, 1, 0, 0), ('cuoio-bollito', 3, 0, 0, 0, 0, 2, 0, 0), ('cuoio-bollito', 4, 0, 0, 0, 0, 2, 0, 0),
  ('brigantina', 2, 0, 0, 0, 0, 1, 0, 0), ('brigantina', 3, 0, 0, 0, 0, 2, 0, 0), ('brigantina', 4, 0, 0, 0, 0, 3, 0, 1),
  ('maglia', 2, 0, 0, 0, 0, 1, 0, 0), ('maglia', 3, 0, 0, 0, 0, 2, 0, 0), ('maglia', 4, 0, 0, 0, 0, 3, 0, 1),
  ('piastre', 2, 0, 0, 0, 0, 1, 0, 0), ('piastre', 3, 0, 0, 0, 0, 2, 0, 1), ('piastre', 4, 0, 0, 0, 0, 3, 0, 1)
)
insert into public.quality_bonuses (quality_id, item_class, hit, damage, pierce, aff, sp, parry, encumbrance)
select q.id, v.item_class, v.hit, v.damage, v.pierce, v.aff, v.sp, v.parry, v.encumbrance
  from v join q on q.n = v.n
on conflict (quality_id, item_class) do nothing;

-- Classe di un oggetto per i bonus: tipo di danno (armi), scudo, materiale (armature)
create or replace function public.item_class(it public.items)
returns text
language sql immutable
set search_path = ''
as $$
  select case it.kind
    when 'arma' then it.damage_type
    when 'scudo' then 'scudo'
    when 'armatura' then it.material
  end;
$$;

-- AFF (armi, scudi) o SP (armature) in piu' che una qualita' da' a un oggetto
create or replace function public.quality_durability_bonus(it public.items, p_quality uuid)
returns int
language sql stable
security definer set search_path = ''
as $$
  select coalesce((
    select case when it.kind = 'armatura' then b.sp else b.aff end
      from public.quality_bonuses b
     where b.quality_id = p_quality and b.item_class = public.item_class(it)
  ), 0);
$$;
revoke execute on function public.quality_durability_bonus(public.items, uuid) from public, anon;

-- ---------------------------------------------------------------------
-- Fabbro: migliora solo armi, scudi e armature
-- ---------------------------------------------------------------------
create or replace function public.smith_upgrade(p_character_item uuid)
returns table (success boolean, quality text, paid int)
language plpgsql
security definer set search_path = ''
as $$
declare
  ci public.character_items;
  it public.items;
  cur public.item_qualities;
  nxt public.item_qualities;
  v_paid int;
  v_ok boolean;
  v_delta int;
  balance int;
begin
  select * into ci from public.character_items where id = p_character_item;
  if ci.id is null then raise exception 'Oggetto non trovato'; end if;
  perform public.assert_own_character(ci.character_id);
  if not exists (select 1 from public.characters where id = ci.character_id and status = 'attivo') then
    raise exception 'Il personaggio non è ancora attivo.' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = ci.item_id;
  if it.kind not in ('arma', 'scudo', 'armatura') then
    raise exception 'Il fabbro migliora solo armi, scudi e armature.' using errcode = 'P0001';
  end if;

  select * into cur from public.item_qualities
    where id = ci.quality_id or (ci.quality_id is null and level = (select min(level) from public.item_qualities))
    order by level limit 1;
  select * into nxt from public.item_qualities where level > cur.level order by level limit 1;
  if nxt.id is null then
    raise exception 'Questo oggetto ha già la qualità più alta.' using errcode = 'P0001';
  end if;

  v_ok := random() * 100 < nxt.success_pct;
  v_paid := case when v_ok then nxt.upgrade_cost else ceil(nxt.upgrade_cost * 0.5)::int end;

  update public.characters set coins = coins - v_paid
    where id = ci.character_id and coins >= nxt.upgrade_cost
    returning coins into balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza monete.' using errcode = 'P0001';
  end if;
  if v_paid > 0 then
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (ci.character_id, -v_paid, 'fabbro',
              case when v_ok then 'Fabbro: ' || it.name || ' migliorato a ' || nxt.name
                   else 'Fabbro: miglioramento di ' || it.name || ' fallito' end,
              balance);
  end if;
  if v_ok then
    -- l'usura resta la stessa: cresce il massimo
    v_delta := public.quality_durability_bonus(it, nxt.id) - public.quality_durability_bonus(it, cur.id);
    update public.character_items
       set quality_id = nxt.id,
           aff_current = case when aff_current is null or it.kind = 'armatura' then aff_current else aff_current + v_delta end,
           sp_current = case when sp_current is null or it.kind <> 'armatura' then sp_current else sp_current + v_delta end
     where id = ci.id;
  end if;
  return query select v_ok, nxt.name, v_paid;
end;
$$;
revoke execute on function public.smith_upgrade(uuid) from public, anon;
grant execute on function public.smith_upgrade(uuid) to authenticated;

create or replace function public.smith_repair(p_character_item uuid)
returns table (restored int, paid int)
language plpgsql
security definer set search_path = ''
as $$
declare
  ci public.character_items;
  it public.items;
  v_quality uuid;
  v_max int;
  v_cur int;
  v_missing int;
  v_cost int;
  balance int;
begin
  select * into ci from public.character_items where id = p_character_item;
  if ci.id is null then raise exception 'Oggetto non trovato'; end if;
  perform public.assert_own_character(ci.character_id);
  select * into it from public.items where id = ci.item_id;
  v_quality := coalesce(ci.quality_id, (select id from public.item_qualities order by level limit 1));
  if it.kind = 'armatura' then
    v_max := coalesce(it.sp_max, 0) + public.quality_durability_bonus(it, v_quality);
    v_cur := coalesce(ci.sp_current, v_max);
  elsif it.kind in ('arma', 'scudo') then
    v_max := coalesce(it.aff_max, 0) + public.quality_durability_bonus(it, v_quality);
    v_cur := coalesce(ci.aff_current, v_max);
  else
    raise exception 'Il fabbro ripara solo armi, scudi e armature.' using errcode = 'P0001';
  end if;
  v_missing := greatest(0, v_max - v_cur);
  if v_missing = 0 then raise exception 'L''oggetto non è danneggiato.' using errcode = 'P0001'; end if;
  v_cost := v_missing * (select repair_cost from public.item_settings limit 1);

  update public.characters set coins = coins - v_cost
    where id = ci.character_id and coins >= v_cost
    returning coins into balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza monete.' using errcode = 'P0001';
  end if;
  if v_cost > 0 then
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (ci.character_id, -v_cost, 'fabbro', 'Fabbro: riparazione di ' || it.name, balance);
  end if;
  update public.character_items set aff_current = null, sp_current = null where id = ci.id;
  return query select v_missing, v_cost;
end;
$$;
revoke execute on function public.smith_repair(uuid) from public, anon;
grant execute on function public.smith_repair(uuid) to authenticated;
