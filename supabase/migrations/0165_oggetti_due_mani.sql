-- =====================================================================
-- 0165 - Oggetti a due mani
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un oggetto "a due mani" (items.hands = '2') indossato in una nicchia di
-- un gruppo (es. Mano dx / Mano sx) occupa tutte le nicchie del gruppo:
-- - indossandolo, gli oggetti nelle altre mani tornano in borsa;
-- - indossando poi un oggetto in una mano, quello a due mani torna in borsa.
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

create or replace function public.equip_item(p_character_item uuid, p_on boolean, p_slot uuid default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  ci public.character_items;
  it public.items;
  v_slot uuid;
  v_group text;
  v_cap int;
  v_used int;
begin
  select * into ci from public.character_items where id = p_character_item;
  if ci.id is null then raise exception 'Oggetto non trovato'; end if;
  -- l'admin sistema anche l'equipaggiamento degli altri
  if not public.is_admin() then perform public.assert_own_character(ci.character_id); end if;
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

  select capacity, slot_group into v_cap, v_group from public.equipment_slots where id = v_slot;

  if v_group is not null then
    if it.hands = '2' then
      -- a due mani: libera tutte le altre nicchie del gruppo
      update public.character_items c set equipped = false, equipped_slot_id = null
        from public.equipment_slots s
        where c.equipped_slot_id = s.id and s.slot_group = v_group
          and c.character_id = ci.character_id and c.equipped and c.id <> ci.id;
    else
      -- nella nicchia di un gruppo: un oggetto a due mani del gruppo torna in borsa
      update public.character_items c set equipped = false, equipped_slot_id = null
        from public.equipment_slots s, public.items i
        where c.equipped_slot_id = s.id and s.slot_group = v_group and i.id = c.item_id and i.hands = '2'
          and c.character_id = ci.character_id and c.equipped and c.id <> ci.id;
    end if;
  end if;

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

-- Chi ha gia' indossato un oggetto a due mani insieme ad altro nella stessa
-- mano/gruppo: gli altri oggetti del gruppo tornano in borsa
update public.character_items c set equipped = false, equipped_slot_id = null
  from public.equipment_slots s
  where c.equipped and c.equipped_slot_id = s.id and s.slot_group is not null
    and not exists (select 1 from public.items i where i.id = c.item_id and i.hands = '2')
    and exists (
      select 1 from public.character_items c2
        join public.items i2 on i2.id = c2.item_id and i2.hands = '2'
        join public.equipment_slots s2 on s2.id = c2.equipped_slot_id and s2.slot_group = s.slot_group
      where c2.character_id = c.character_id and c2.equipped and c2.id <> c.id);
