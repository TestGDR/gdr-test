-- =====================================================================
-- 0107 - Combattimento, armi, scudi, armature (documento "Combattimento,
-- armi e danni"). Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- Oggetti: tipo e valori di combattimento
-- ---------------------------------------------------------------------
alter table public.items add column if not exists kind text not null default 'altro';
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('altro', 'arma', 'scudo', 'armatura', 'munizione'));

-- arma
alter table public.items add column if not exists weapon_category text;     -- mischia | distanza
alter table public.items add column if not exists weapon_skill_id uuid references public.skills(id) on delete set null;
alter table public.items add column if not exists damage_type text;         -- taglio | perforante | contundente
alter table public.items add column if not exists hands text;               -- 1 | 2 | 1-2
alter table public.items add column if not exists body_min int not null default 0;
alter table public.items add column if not exists reach_m numeric(4,1);
alter table public.items add column if not exists range_m int;
alter table public.items add column if not exists reload_actions int not null default 0;
alter table public.items add column if not exists pierce int not null default 0;
alter table public.items add column if not exists effects text[] not null default '{}';
alter table public.items add column if not exists ammo_type text;           -- frecce | quadrelli (armi a distanza e munizioni)
-- arma e scudo
alter table public.items add column if not exists aff_max int;
-- scudo
alter table public.items add column if not exists parry_bonus int not null default 0;
alter table public.items add column if not exists bash_dice text;
alter table public.items add column if not exists attack_penalty int not null default 0;
-- armatura
alter table public.items add column if not exists armor_part text;          -- testa | tronco | braccia | gambe
alter table public.items add column if not exists material text;
alter table public.items add column if not exists sp_max int;
alter table public.items add column if not exists encumbrance int not null default 0; -- 0 o negativo, si toglie a RIF
-- tutti
alter table public.items add column if not exists weight_kg numeric(5,1);
alter table public.items add column if not exists ammo_capacity int;        -- munizioni: quante (es. 20)

alter table public.items drop constraint if exists items_combat_check;
alter table public.items add constraint items_combat_check check (
  (weapon_category is null or weapon_category in ('mischia', 'distanza'))
  and (damage_type is null or damage_type in ('taglio', 'perforante', 'contundente'))
  and (hands is null or hands in ('1', '2', '1-2'))
  and (armor_part is null or armor_part in ('testa', 'tronco', 'braccia', 'gambe'))
  and body_min between 0 and 10 and pierce between 0 and 20 and reload_actions between 0 and 5
  and (aff_max is null or aff_max between 1 and 99) and (sp_max is null or sp_max between 0 and 50)
  and parry_bonus between 0 and 10 and attack_penalty between -10 and 0 and encumbrance between -10 and 0
  and (range_m is null or range_m between 1 and 1000) and (ammo_capacity is null or ammo_capacity between 1 and 999)
);

-- Oggetti dei PG: usura e munizioni (vuoto = pieno)
alter table public.character_items add column if not exists aff_current int;
alter table public.character_items add column if not exists sp_current int;
alter table public.character_items add column if not exists charges int;            -- munizioni rimaste
alter table public.character_items add column if not exists loaded boolean not null default true; -- balestre
alter table public.character_items add column if not exists reload_progress int not null default 0;

-- ---------------------------------------------------------------------
-- Qualita': Scarso, Buono, Ottimo, Perfetto, con i bonus di combattimento
-- ---------------------------------------------------------------------
alter table public.item_qualities add column if not exists hit_bonus int not null default 0;
alter table public.item_qualities add column if not exists damage_bonus int not null default 0;
alter table public.item_qualities add column if not exists pierce_bonus int not null default 0;
alter table public.item_qualities add column if not exists aff_bonus int not null default 0;
alter table public.item_qualities add column if not exists sp_bonus int not null default 0;

update public.item_qualities set name = 'Ottimo' where level = 3 and name = 'Eccellente';
insert into public.item_qualities (name, level, upgrade_cost, success_pct)
  select 'Perfetto', 4, 300, 40 where not exists (select 1 from public.item_qualities where level = 4);
update public.item_qualities set hit_bonus = 0, damage_bonus = 0, pierce_bonus = 0, aff_bonus = 0, sp_bonus = 0 where level = 1;
update public.item_qualities set hit_bonus = 1, damage_bonus = 0, pierce_bonus = 0, aff_bonus = 2, sp_bonus = 1 where level = 2;
update public.item_qualities set hit_bonus = 1, damage_bonus = 1, pierce_bonus = 0, aff_bonus = 4, sp_bonus = 2 where level = 3;
update public.item_qualities set hit_bonus = 2, damage_bonus = 2, pierce_bonus = 1, aff_bonus = 6, sp_bonus = 3 where level = 4;

-- Cambio Risorse -> monete (catalogo del regolamento) e costo della riparazione
alter table public.item_settings add column if not exists coins_per_r int not null default 100;
alter table public.item_settings add column if not exists repair_cost int not null default 5; -- monete per punto di AFF/SP

-- ---------------------------------------------------------------------
-- Personaggi: PF, Stamina, morente, morte
-- ---------------------------------------------------------------------
alter table public.characters add column if not exists hp_updated_at timestamptz;      -- da quando conta il recupero
alter table public.characters add column if not exists stamina_updated_at timestamptz; -- ultima azione di combattimento
alter table public.characters add column if not exists dead_at timestamptz;
alter table public.characters add column if not exists dying_since timestamptz;        -- a 0 PF
alter table public.characters add column if not exists dying_round int not null default 0;
alter table public.characters add column if not exists dying_save_due boolean not null default false;
alter table public.characters add column if not exists stabilized_at timestamptz;
alter table public.characters add column if not exists stunned boolean not null default false; -- perde la prossima azione

-- Ferite (critiche e sanguinamenti)
create table if not exists public.character_wounds (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  location      text not null,
  severity      text not null check (severity in ('light', 'medium', 'grave', 'mortal', 'bleeding')),
  bleed         int not null default 0 check (bleed between 0 and 20),
  penalty       int not null default 0 check (penalty between -10 and 0),
  mutilated     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists character_wounds_character_idx on public.character_wounds (character_id);
alter table public.character_wounds enable row level security;
drop policy if exists "ferite visibili" on public.character_wounds;
create policy "ferite visibili" on public.character_wounds for select to authenticated using (true);
drop policy if exists "ferite dello staff" on public.character_wounds;
create policy "ferite dello staff" on public.character_wounds for delete to authenticated
  using (public.is_admin() or public.has_permission('schede.abilita'));
grant select, delete on public.character_wounds to authenticated;
grant select, insert, update, delete on public.character_wounds to service_role;

-- Attacchi in attesa della difesa del bersaglio
create table if not exists public.combat_attacks (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  attacker_id   uuid not null references public.characters(id) on delete cascade,
  target_id     uuid not null references public.characters(id) on delete cascade,
  data          jsonb not null,             -- arma, tipo, tiro per colpire, DV, ...
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  outcome       jsonb
);
create index if not exists combat_attacks_target_idx on public.combat_attacks (target_id, resolved_at);
alter table public.combat_attacks enable row level security;
drop policy if exists "attacchi visibili" on public.combat_attacks;
create policy "attacchi visibili" on public.combat_attacks for select to authenticated using (true);
grant select on public.combat_attacks to authenticated;
grant select, insert, update, delete on public.combat_attacks to service_role;

-- ---------------------------------------------------------------------
-- Morente: non scrive azioni finche' non fa il tiro salvezza; dopo ogni
-- sua azione il tiro torna obbligatorio
-- ---------------------------------------------------------------------
create or replace function public.dying_message_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  c public.characters;
begin
  if new.kind <> 'azione' then return new; end if;
  select * into c from public.characters where id = new.character_id;
  if c.dying_since is null or c.stabilized_at is not null or c.dead_at is not null then return new; end if;
  if c.dying_save_due then
    raise exception 'Il personaggio è morente: fai prima il Tiro salvezza (Comandi).' using errcode = 'P0001';
  end if;
  update public.characters set dying_save_due = true where id = c.id;
  return new;
end;
$$;
drop trigger if exists messages_dying_guard on public.messages;
create trigger messages_dying_guard before insert on public.messages
  for each row execute function public.dying_message_guard();

-- ---------------------------------------------------------------------
-- Gestisci: l'admin imposta PF e Stamina, toglie morente e morte
-- ---------------------------------------------------------------------
create or replace function public.admin_set_hp(p_character uuid, p_hp int, p_dead boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono farlo.' using errcode = '42501'; end if;
  if p_hp is not null and p_hp not between 0 and 999 then
    raise exception 'Punti ferita non validi.' using errcode = 'P0001';
  end if;
  update public.characters
     set hp_current = p_hp,
         hp_updated_at = now(),
         stamina_current = null,
         dead_at = case when p_dead then coalesce(dead_at, now()) else null end,
         dying_since = case when p_dead or coalesce(p_hp, 1) > 0 then null else coalesce(dying_since, now()) end,
         dying_round = case when coalesce(p_hp, 1) > 0 then 0 else dying_round end,
         dying_save_due = case when coalesce(p_hp, 1) > 0 then false else dying_save_due end,
         stabilized_at = case when coalesce(p_hp, 1) > 0 then null else stabilized_at end,
         stunned = false
   where id = p_character;
end;
$$;
revoke execute on function public.admin_set_hp(uuid, int, boolean) from public, anon;
grant execute on function public.admin_set_hp(uuid, int, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Fabbro: migliora anche le armi da impugnare; il livello nuovo aggiunge
-- i suoi bonus di AFF/SP. Ripara AFF e SP a pagamento.
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
  balance int;
begin
  select * into ci from public.character_items where id = p_character_item;
  if ci.id is null then raise exception 'Oggetto non trovato'; end if;
  perform public.assert_own_character(ci.character_id);
  if not exists (select 1 from public.characters where id = ci.character_id and status = 'attivo') then
    raise exception 'Il personaggio non è ancora attivo.' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = ci.item_id;
  if it.slot_id is null and it.slot_group is null then
    raise exception 'Il fabbro migliora solo gli oggetti che si indossano o si impugnano.' using errcode = 'P0001';
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
    update public.character_items
       set quality_id = nxt.id,
           aff_current = case when aff_current is null then null else aff_current + (nxt.aff_bonus - cur.aff_bonus) end,
           sp_current = case when sp_current is null then null else sp_current + (nxt.sp_bonus - cur.sp_bonus) end
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
  q public.item_qualities;
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
  select * into q from public.item_qualities
    where id = ci.quality_id or (ci.quality_id is null and level = (select min(level) from public.item_qualities))
    order by level limit 1;
  if it.kind = 'armatura' then
    v_max := coalesce(it.sp_max, 0) + coalesce(q.sp_bonus, 0);
    v_cur := coalesce(ci.sp_current, v_max);
  elsif it.kind in ('arma', 'scudo') then
    v_max := coalesce(it.aff_max, 0) + coalesce(q.aff_bonus, 0);
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
