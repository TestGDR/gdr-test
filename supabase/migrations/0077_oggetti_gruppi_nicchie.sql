-- =====================================================================
-- 0077 - Oggetti: nicchie a gruppi (es. Mano: destra o sinistra)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Le nicchie possono avere un gruppo: "Mano dx" e "Mano sx" sono del
--   gruppo "Mano".
-- - Un oggetto si puo' creare per una nicchia precisa oppure per un
--   gruppo: una spada "Mano" si indossa nella mano destra o nella sinistra,
--   la sceglie il giocatore (PG mancini compresi).
-- - Ogni oggetto indossato ricorda in quale nicchia sta.
-- =====================================================================

alter table public.equipment_slots add column if not exists slot_group text
  check (slot_group is null or char_length(slot_group) between 1 and 40);
update public.equipment_slots set slot_group = 'Mano'
  where name in ('Mano dx', 'Mano sx') and slot_group is null;

alter table public.items add column if not exists slot_group text
  check (slot_group is null or char_length(slot_group) between 1 and 40);

alter table public.character_items add column if not exists equipped_slot_id uuid
  references public.equipment_slots(id) on delete set null;
update public.character_items c set equipped_slot_id = i.slot_id
  from public.items i
  where c.item_id = i.id and c.equipped and c.equipped_slot_id is null;
-- nicchia eliminata: l'oggetto torna in borsa
create or replace function public.character_items_unequip_lost()
returns trigger
language plpgsql
as $$
begin
  if new.equipped and new.equipped_slot_id is null then new.equipped := false; end if;
  return new;
end;
$$;
drop trigger if exists character_items_unequip_lost on public.character_items;
create trigger character_items_unequip_lost before update on public.character_items
  for each row execute function public.character_items_unequip_lost();

-- ---------------------------------------------------------------------
-- Indossare / togliere, scegliendo la nicchia per gli oggetti di un gruppo.
-- Nicchia da 1 posto: il nuovo oggetto prende il posto del vecchio;
-- nicchia da piu' posti: deve esserci posto.
-- ---------------------------------------------------------------------
drop function if exists public.equip_item(uuid, boolean);
create or replace function public.equip_item(p_character_item uuid, p_on boolean, p_slot uuid default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  ci public.character_items;
  it public.items;
  v_slot uuid;
  v_cap int;
  v_used int;
begin
  select * into ci from public.character_items where id = p_character_item;
  if ci.id is null then raise exception 'Oggetto non trovato'; end if;
  perform public.assert_own_character(ci.character_id);
  select * into it from public.items where id = ci.item_id;

  if not coalesce(p_on, false) then
    update public.character_items set equipped = false, equipped_slot_id = null where id = ci.id;
    return;
  end if;

  if it.slot_id is not null then
    v_slot := it.slot_id;
  elsif it.slot_group is not null then
    if p_slot is not null then
      select id into v_slot from public.equipment_slots where id = p_slot and slot_group = it.slot_group;
      if v_slot is null then raise exception 'Questa nicchia non va bene per l''oggetto.' using errcode = 'P0001'; end if;
    else
      -- senza scelta: la prima nicchia libera del gruppo, altrimenti la prima
      select s.id into v_slot from public.equipment_slots s
        where s.slot_group = it.slot_group
        order by (select count(*) from public.character_items c
                  where c.character_id = ci.character_id and c.equipped and c.equipped_slot_id = s.id) >= s.capacity,
                 s.sort_order
        limit 1;
    end if;
  end if;
  if v_slot is null then raise exception 'Questo oggetto non si indossa.' using errcode = 'P0001'; end if;

  select capacity into v_cap from public.equipment_slots where id = v_slot;
  if coalesce(v_cap, 1) <= 1 then
    update public.character_items set equipped = false, equipped_slot_id = null
      where character_id = ci.character_id and equipped and equipped_slot_id = v_slot and id <> ci.id;
  else
    select count(*) into v_used from public.character_items
      where character_id = ci.character_id and equipped and equipped_slot_id = v_slot and id <> ci.id;
    if v_used >= v_cap then
      raise exception 'Non c''è più posto: togli prima un oggetto.' using errcode = 'P0001';
    end if;
  end if;
  update public.character_items set equipped = true, equipped_slot_id = v_slot where id = ci.id;
end;
$$;
revoke execute on function public.equip_item(uuid, boolean, uuid) from public, anon;
grant execute on function public.equip_item(uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Fabbro: migliora anche gli oggetti di un gruppo (es. Mano)
-- ---------------------------------------------------------------------
create or replace function public.smith_upgrade(p_character_item uuid)
returns table (success boolean, quality text, paid int)
language plpgsql
security definer set search_path = ''
as $$
declare
  ci public.character_items;
  it public.items;
  cur_level int;
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
    raise exception 'Il fabbro migliora solo gli oggetti che si indossano.' using errcode = 'P0001';
  end if;

  select coalesce((select level from public.item_qualities where id = ci.quality_id),
                  (select min(level) from public.item_qualities)) into cur_level;
  select * into nxt from public.item_qualities where level > cur_level order by level limit 1;
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
    update public.character_items set quality_id = nxt.id where id = ci.id;
  end if;
  return query select v_ok, nxt.name, v_paid;
end;
$$;
revoke execute on function public.smith_upgrade(uuid) from public, anon;
grant execute on function public.smith_upgrade(uuid) to authenticated;
