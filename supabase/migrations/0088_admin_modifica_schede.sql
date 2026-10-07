-- =====================================================================
-- 0088 - L'admin modifica la scheda degli altri come se fosse sua
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- In caso di problemi l'admin sistema direttamente: pagina principale,
-- dati (anche il prestavolto), Si sa che, Affetti, Aspetto, Equipaggiamento.
-- =====================================================================

-- Scheda: stesse colonne che modifica il proprietario
drop policy if exists "admin modifica personaggi" on public.characters;
create policy "admin modifica personaggi" on public.characters
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Affetti
drop policy if exists "affetti gestiti dall'admin" on public.character_affections;
create policy "affetti gestiti dall'admin" on public.character_affections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Equipaggiamento: indossare e togliere
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
