-- =====================================================================
-- 0073 - Oggetti, equipaggiamento, negozio e sblocchi della scheda
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Parti del corpo (testa, torso, mani...): modificabili dallo staff, con
--   la posizione intorno alla figura e quanti oggetti ci stanno (cintura: 3)
-- - Categorie degli oggetti (Armi, Consumabili, Munizioni...): dello staff
-- - Oggetti: li crea lo staff (Gestione -> Oggetti), con la parte del corpo
--   dove si indossano e, se si vendono, il prezzo nel negozio
-- - Oggetti dei PG: li assegna lo staff (arriva un messaggio di SISTEMA)
--   oppure il PG li compra nel negozio con le monete del conto
-- - Equipaggiamento: il PG sceglie cosa indossa (uno per parte del corpo)
-- - Sblocchi: l'admin sblocca al giocatore parti della scheda che di solito
--   non si modificano (Storia, Anagrafica) e le riblocca quando vuole
-- Permesso nuovo "oggetti.gestire" (lo ricevono i ruoli con "economia.gestire")
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parti del corpo
-- ---------------------------------------------------------------------
create table if not exists public.equipment_slots (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  side        text not null default 'sinistra' check (side in ('sinistra', 'destra', 'sotto')), -- intorno alla figura
  capacity    int not null default 1 check (capacity between 1 and 10), -- quanti oggetti ci stanno
  sort_order  int not null default 0
);
alter table public.equipment_slots enable row level security;

insert into public.equipment_slots (name, side, capacity, sort_order)
select v.name, v.side, v.cap, v.n from (values
  ('Testa', 'sinistra', 1, 1), ('Busto', 'sinistra', 1, 2), ('Gambe', 'sinistra', 1, 3),
  ('Braccio', 'destra', 1, 4), ('Mano dx', 'destra', 1, 5), ('Mano sx', 'destra', 1, 6)
) as v(name, side, cap, n)
where not exists (select 1 from public.equipment_slots);

-- ---------------------------------------------------------------------
-- Categorie degli oggetti (le schede dell'inventario)
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

-- ---------------------------------------------------------------------
-- Oggetti
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 2000),
  image_url    text check (image_url is null or (image_url like 'https://%' and char_length(image_url) <= 1000)),
  slot_id      uuid references public.equipment_slots(id) on delete set null, -- vuoto = non si indossa
  category_id  uuid references public.item_categories(id) on delete set null,
  price        int check (price is null or price >= 0),   -- prezzo nel negozio
  in_shop      boolean not null default false,             -- in vendita nel negozio
  created_at   timestamptz not null default now()
);
alter table public.items enable row level security;

create table if not exists public.character_items (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete cascade,
  equipped      boolean not null default false,
  source        text not null default 'staff' check (source in ('staff', 'negozio')),
  acquired_at   timestamptz not null default now()
);
create index if not exists character_items_character_idx on public.character_items (character_id);
alter table public.character_items enable row level security;

-- Lettura per tutti (l'equipaggiamento si vede nella scheda), scrittura allo staff
update public.staff_roles set permissions = array_append(permissions, 'oggetti.gestire')
  where 'economia.gestire' = any(permissions) and not ('oggetti.gestire' = any(permissions));

drop policy if exists "parti del corpo visibili" on public.equipment_slots;
create policy "parti del corpo visibili" on public.equipment_slots for select to authenticated using (true);
drop policy if exists "parti del corpo dello staff" on public.equipment_slots;
create policy "parti del corpo dello staff" on public.equipment_slots for all to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));

drop policy if exists "categorie visibili" on public.item_categories;
create policy "categorie visibili" on public.item_categories for select to authenticated using (true);
drop policy if exists "categorie dello staff" on public.item_categories;
create policy "categorie dello staff" on public.item_categories for all to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));

drop policy if exists "oggetti visibili" on public.items;
create policy "oggetti visibili" on public.items for select to authenticated using (true);
drop policy if exists "oggetti dello staff" on public.items;
create policy "oggetti dello staff" on public.items for all to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));

drop policy if exists "oggetti dei pg visibili" on public.character_items;
create policy "oggetti dei pg visibili" on public.character_items for select to authenticated using (true);
drop policy if exists "oggetti dei pg dello staff" on public.character_items;
create policy "oggetti dei pg dello staff" on public.character_items for delete to authenticated
  using (public.has_permission('oggetti.gestire'));
-- (assegnare, comprare e indossare passano dalle funzioni qui sotto)

grant select on public.equipment_slots, public.item_categories, public.items, public.character_items to authenticated;
grant insert, update, delete on public.equipment_slots, public.item_categories, public.items to authenticated;
grant delete on public.character_items to authenticated;
grant select, insert, update, delete on public.equipment_slots, public.item_categories, public.items, public.character_items to service_role;

-- Lo staff assegna un oggetto a un PG: arriva un messaggio di SISTEMA
create or replace function public.give_item(p_character uuid, p_item uuid, p_qty int default 1)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text;
  n int := greatest(1, least(coalesce(p_qty, 1), 50));
begin
  if not public.has_permission('oggetti.gestire') then raise exception 'Permesso negato'; end if;
  select name into v_name from public.items where id = p_item;
  if v_name is null then raise exception 'Oggetto non trovato'; end if;
  if not exists (select 1 from public.characters where id = p_character) then raise exception 'Personaggio non trovato'; end if;
  insert into public.character_items (character_id, item_id, source)
    select p_character, p_item, 'staff' from generate_series(1, n);
  perform public.send_system_message(p_character,
    'Hai ricevuto ' || case when n > 1 then n || ' × ' else '' end || v_name
    || '. Lo trovi nella scheda, alla voce Equipaggiamento.');
end;
$$;
revoke execute on function public.give_item(uuid, uuid, int) from public, anon;
grant execute on function public.give_item(uuid, uuid, int) to authenticated;

-- Negozio: il PG compra con le monete del conto
alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'affitto', 'staff', 'prelievo', 'deposito', 'bonifico', 'acquisto'));

create or replace function public.buy_item(p_character uuid, p_item uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  it public.items;
  balance int;
begin
  perform public.assert_own_character(p_character);
  if not exists (select 1 from public.characters where id = p_character and status = 'attivo') then
    raise exception 'Il personaggio non è ancora attivo.' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = p_item;
  if it.id is null or not it.in_shop or it.price is null then
    raise exception 'Questo oggetto non è in vendita.' using errcode = 'P0001';
  end if;
  update public.characters set coins = coins - it.price
    where id = p_character and coins >= it.price
    returning coins into balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza monete.' using errcode = 'P0001';
  end if;
  insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
    values (p_character, -it.price, 'acquisto', 'Negozio: ' || it.name, balance);
  insert into public.character_items (character_id, item_id, source) values (p_character, p_item, 'negozio');
end;
$$;
revoke execute on function public.buy_item(uuid, uuid) from public, anon;
grant execute on function public.buy_item(uuid, uuid) to authenticated;

-- Indossare / togliere. In una parte da 1 il nuovo oggetto prende il posto del
-- vecchio; in una parte da piu' oggetti (es. cintura da 3) deve esserci posto
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

-- ---------------------------------------------------------------------
-- Sblocchi della scheda (solo admin)
-- ---------------------------------------------------------------------
alter table public.characters add column if not exists sheet_unlocks text[] not null default '{}';

create or replace function public.set_sheet_unlock(p_character uuid, p_section text, p_on boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono sbloccare la scheda'; end if;
  if p_section not in ('storia', 'anagrafica') then raise exception 'Sezione non valida'; end if;
  update public.characters
    set sheet_unlocks = case
      when p_on then array(select distinct unnest(sheet_unlocks || p_section))
      else array_remove(sheet_unlocks, p_section) end
    where id = p_character;
end;
$$;
revoke execute on function public.set_sheet_unlock(uuid, text, boolean) from public, anon;
grant execute on function public.set_sheet_unlock(uuid, text, boolean) to authenticated;

-- Storia sbloccata: il proprietario la legge e la riscrive
drop policy if exists "storia sbloccata al proprietario" on public.character_backgrounds;
create policy "storia sbloccata al proprietario" on public.character_backgrounds for select to authenticated
  using (exists (select 1 from public.characters c
                 where c.id = character_id and c.owner_id = auth.uid() and 'storia' = any(c.sheet_unlocks)));

create or replace function public.update_my_background(p_character uuid, p_body text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters
                 where id = p_character and owner_id = auth.uid() and 'storia' = any(sheet_unlocks)) then
    raise exception 'La Storia non è sbloccata.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 100 and 4000 then
    raise exception 'La storia deve avere tra 100 e 4000 caratteri.' using errcode = 'P0001';
  end if;
  insert into public.character_backgrounds (character_id, body) values (p_character, trim(p_body))
    on conflict (character_id) do update set body = excluded.body;
end;
$$;
revoke execute on function public.update_my_background(uuid, text) from public, anon;
grant execute on function public.update_my_background(uuid, text) to authenticated;

-- Anagrafica sbloccata: il proprietario cambia sesso ed eta'
create or replace function public.update_my_identity(p_character uuid, p_sex text, p_age int)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters
                 where id = p_character and owner_id = auth.uid() and 'anagrafica' = any(sheet_unlocks)) then
    raise exception 'L''anagrafica non è sbloccata.' using errcode = '42501';
  end if;
  if p_sex not in ('uomo', 'donna') then raise exception 'Sesso non valido.' using errcode = 'P0001'; end if;
  if p_age is null or p_age not between 16 and 80 then
    raise exception 'L''età deve essere tra 16 e 80 anni.' using errcode = 'P0001';
  end if;
  update public.characters set sex = p_sex, age = p_age where id = p_character;
end;
$$;
revoke execute on function public.update_my_identity(uuid, text, int) from public, anon;
grant execute on function public.update_my_identity(uuid, text, int) to authenticated;

-- Pagina Dati: anche se chi guarda e' admin (vede "Sblocca")
drop function if exists public.character_sheet_info(uuid);
create function public.character_sheet_info(p_character uuid)
returns table (last_entry timestamptz, last_chat_action timestamptz, can_write_fate boolean,
               can_read_story boolean, is_admin boolean)
language sql stable
security definer set search_path = ''
as $$
  select o.last_entry, a.last_chat_action,
         public.has_permission('schede.note_fato'), public.has_permission('schede.storia'), public.is_admin()
  from public.characters c
  left join public.online_status o on o.user_id = c.owner_id
  left join public.character_activity a on a.character_id = c.id
  where c.id = p_character;
$$;
revoke execute on function public.character_sheet_info(uuid) from public, anon;
grant execute on function public.character_sheet_info(uuid) to authenticated;
