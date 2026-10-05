-- =====================================================================
-- 0075 - Fabbro e qualita' degli oggetti
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Qualita' (Scarso -> Buono -> Eccellente): ogni livello ha il costo per
--   arrivarci dal fabbro e la probabilita' di riuscita. Modificabili dallo
--   staff (Gestione -> Oggetti -> Qualita').
-- - Ogni oggetto dei PG ha la sua qualita'; i nuovi partono dal livello piu' basso.
-- - Fabbro (Mercato): migliora di un livello gli oggetti che si indossano,
--   subito, pagando in monete del conto. Se fallisce si perde il 50% del
--   costo e l'oggetto resta com'era.
-- (I valori degli oggetti per qualita', es. i dadi, si aggiungeranno dopo.)
-- =====================================================================

create table if not exists public.item_qualities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 40),
  level         int not null default 1,                                  -- 1 = il piu' basso
  upgrade_cost  int not null default 0 check (upgrade_cost >= 0),        -- costo per arrivarci dal livello prima
  success_pct   int not null default 100 check (success_pct between 1 and 100),
  unique (level)
);
alter table public.item_qualities enable row level security;

insert into public.item_qualities (name, level, upgrade_cost, success_pct)
select v.name, v.lvl, v.cost, v.pct from (values
  ('Scarso', 1, 0, 100), ('Buono', 2, 50, 80), ('Eccellente', 3, 150, 60)
) as v(name, lvl, cost, pct)
where not exists (select 1 from public.item_qualities);

drop policy if exists "qualita visibili" on public.item_qualities;
create policy "qualita visibili" on public.item_qualities for select to authenticated using (true);
drop policy if exists "qualita dello staff" on public.item_qualities;
create policy "qualita dello staff" on public.item_qualities for all to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));

grant select, insert, update, delete on public.item_qualities to authenticated;
grant select, insert, update, delete on public.item_qualities to service_role;

-- Qualita' degli oggetti dei PG (vuota = il livello piu' basso)
alter table public.character_items add column if not exists quality_id uuid references public.item_qualities(id) on delete set null;
update public.character_items
  set quality_id = (select id from public.item_qualities order by level limit 1)
  where quality_id is null;

-- Ogni oggetto nuovo nasce del livello piu' basso
create or replace function public.character_item_base_quality()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.quality_id is null then
    select id into new.quality_id from public.item_qualities order by level limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists character_items_base_quality on public.character_items;
create trigger character_items_base_quality before insert on public.character_items
  for each row execute function public.character_item_base_quality();

-- Movimenti del conto: anche il fabbro
alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'affitto', 'staff', 'prelievo', 'deposito', 'bonifico', 'acquisto', 'fabbro'));

-- ---------------------------------------------------------------------
-- Fabbro: prova a portare l'oggetto al livello dopo
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
  if it.slot_id is null then
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
