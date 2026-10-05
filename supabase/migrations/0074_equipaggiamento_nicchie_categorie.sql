-- =====================================================================
-- 0074 - Equipaggiamento: posizione delle nicchie, posti e categorie
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Completa la 0073 (se era stata eseguita nella prima versione):
-- - nicchie: dove stanno intorno alla figura (sinistra, destra, sotto) e
--   quanti oggetti ci entrano (la cintura 3)
-- - categorie degli oggetti (le schede dell'inventario)
-- - indossare tiene conto dei posti della nicchia
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nicchie
-- ---------------------------------------------------------------------
alter table public.equipment_slots add column if not exists side text not null default 'sinistra';
alter table public.equipment_slots add column if not exists capacity int not null default 1;
alter table public.equipment_slots drop constraint if exists equipment_slots_side_check;
alter table public.equipment_slots add constraint equipment_slots_side_check check (side in ('sinistra', 'destra', 'sotto'));
alter table public.equipment_slots drop constraint if exists equipment_slots_capacity_check;
alter table public.equipment_slots add constraint equipment_slots_capacity_check check (capacity between 1 and 10);

-- Disposizione proposta per le nicchie di partenza (quelle rinominate restano a sinistra)
update public.equipment_slots s set side = v.side, capacity = v.cap, sort_order = v.n
from (values
  ('Testa', 'sinistra', 1, 1), ('Collo', 'sinistra', 1, 2), ('Torso', 'sinistra', 1, 3),
  ('Mantello', 'sinistra', 1, 4), ('Mani', 'sinistra', 1, 5),
  ('Arma', 'destra', 1, 6), ('Seconda mano / Scudo', 'destra', 1, 7), ('Anello', 'destra', 1, 8),
  ('Gambe', 'destra', 1, 9), ('Piedi', 'destra', 1, 10),
  ('Cintura', 'sotto', 3, 11), ('Altro', 'sotto', 1, 12)
) as v(name, side, cap, n)
where s.name = v.name and s.side = 'sinistra' and s.capacity = 1;

-- ---------------------------------------------------------------------
-- Categorie degli oggetti
-- ---------------------------------------------------------------------
create table if not exists public.item_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  sort_order  int not null default 0
);
alter table public.item_categories enable row level security;

insert into public.item_categories (name, sort_order)
select v.name, v.n from (values
  ('Armi', 1), ('Armature', 2), ('Vestiti', 3), ('Gioielli', 4),
  ('Consumabili', 5), ('Munizioni', 6), ('Varie', 7)
) as v(name, n)
where not exists (select 1 from public.item_categories);

alter table public.items add column if not exists category_id uuid references public.item_categories(id) on delete set null;

drop policy if exists "categorie visibili" on public.item_categories;
create policy "categorie visibili" on public.item_categories for select to authenticated using (true);
drop policy if exists "categorie dello staff" on public.item_categories;
create policy "categorie dello staff" on public.item_categories for all to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));

grant select, insert, update, delete on public.item_categories to authenticated;
grant select, insert, update, delete on public.item_categories to service_role;

-- ---------------------------------------------------------------------
-- Indossare / togliere. In una nicchia da 1 il nuovo oggetto prende il posto
-- del vecchio; in una da piu' oggetti (es. cintura da 3) deve esserci posto
-- ---------------------------------------------------------------------
create or replace function public.equip_item(p_character_item uuid, p_on boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  ci public.character_items;
  v_slot uuid;
  v_cap int;
  v_used int;
begin
  select * into ci from public.character_items where id = p_character_item;
  if ci.id is null then raise exception 'Oggetto non trovato'; end if;
  perform public.assert_own_character(ci.character_id);
  select slot_id into v_slot from public.items where id = ci.item_id;
  if p_on then
    if v_slot is null then raise exception 'Questo oggetto non si indossa.' using errcode = 'P0001'; end if;
    select capacity into v_cap from public.equipment_slots where id = v_slot;
    if coalesce(v_cap, 1) <= 1 then
      update public.character_items c set equipped = false
        from public.items i
        where c.item_id = i.id and c.character_id = ci.character_id and i.slot_id = v_slot and c.id <> ci.id;
    else
      select count(*) into v_used from public.character_items c join public.items i on i.id = c.item_id
        where c.character_id = ci.character_id and i.slot_id = v_slot and c.equipped and c.id <> ci.id;
      if v_used >= v_cap then
        raise exception 'Non c''è più posto: togli prima un oggetto.' using errcode = 'P0001';
      end if;
    end if;
  end if;
  update public.character_items set equipped = coalesce(p_on, false) where id = ci.id;
end;
$$;
revoke execute on function public.equip_item(uuid, boolean) from public, anon;
grant execute on function public.equip_item(uuid, boolean) to authenticated;
