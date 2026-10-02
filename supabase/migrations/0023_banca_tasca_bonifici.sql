-- =====================================================================
-- 0023 - Banca: soldi in tasca, prelievi, depositi e bonifici
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni PG ha il suo conto in banca (characters.coins) e i soldi in tasca
-- (characters.pocket). Dal conto si preleva (va in tasca), si deposita
-- (torna sul conto) e si mandano soldi ad altri PG o ai PNG.
-- Tutto passa dalle funzioni qui sotto: il giocatore non puo' scrivere
-- direttamente i saldi.
-- =====================================================================

alter table public.characters add column pocket int not null default 0 check (pocket >= 0);

alter table public.bank_transactions drop constraint bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'affitto', 'staff', 'prelievo', 'deposito', 'bonifico'));

-- Il personaggio deve essere dell'utente
create or replace function public.assert_own_character(p_character uuid)
returns void
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) then
    raise exception 'Questo personaggio non è tuo.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Prelievo: dal conto alla tasca
-- ---------------------------------------------------------------------
create or replace function public.bank_withdraw(p_character uuid, p_amount int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  balance int;
begin
  perform public.assert_own_character(p_character);
  if p_amount is null or p_amount < 1 then
    raise exception 'Indica quante monete prelevare.' using errcode = 'P0001';
  end if;
  update public.characters set coins = coins - p_amount, pocket = pocket + p_amount
  where id = p_character and coins >= p_amount
  returning coins into balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza monete.' using errcode = 'P0001';
  end if;
  insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
  values (p_character, -p_amount, 'prelievo', 'Prelievo (in tasca)', balance);
end;
$$;

-- ---------------------------------------------------------------------
-- Deposito: dalla tasca al conto
-- ---------------------------------------------------------------------
create or replace function public.bank_deposit(p_character uuid, p_amount int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  balance int;
begin
  perform public.assert_own_character(p_character);
  if p_amount is null or p_amount < 1 then
    raise exception 'Indica quante monete depositare.' using errcode = 'P0001';
  end if;
  update public.characters set coins = coins + p_amount, pocket = pocket - p_amount
  where id = p_character and pocket >= p_amount
  returning coins into balance;
  if not found then
    raise exception 'In tasca non hai abbastanza monete.' using errcode = 'P0001';
  end if;
  insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
  values (p_character, p_amount, 'deposito', 'Deposito (dalla tasca)', balance);
end;
$$;

-- ---------------------------------------------------------------------
-- Bonifico dal conto a un PG (sul suo conto) o a un PNG (i soldi escono
-- dal gioco: i PNG non hanno un conto)
-- ---------------------------------------------------------------------
create or replace function public.bank_transfer(
  p_from uuid,
  p_to_character uuid,
  p_to_npc uuid,
  p_amount int,
  p_reason text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  from_name text;
  to_name text;
  reason text := left(trim(coalesce(p_reason, '')), 200);
  suffix text;
  from_balance int;
  to_balance int;
begin
  perform public.assert_own_character(p_from);
  if p_amount is null or p_amount < 1 then
    raise exception 'Indica quante monete mandare.' using errcode = 'P0001';
  end if;
  if (p_to_character is null) = (p_to_npc is null) then
    raise exception 'Scegli a chi mandare le monete.' using errcode = 'P0001';
  end if;
  if p_to_character = p_from then
    raise exception 'Non puoi mandare monete a te stesso.' using errcode = 'P0001';
  end if;
  suffix := case when reason = '' then '' else ' · ' || reason end;

  -- Blocca i conti sempre nello stesso ordine: due bonifici incrociati non si incastrano
  perform 1 from public.characters
  where id in (p_from, p_to_character) order by id for update;

  select name into from_name from public.characters where id = p_from;
  if p_to_character is not null then
    select name into to_name from public.characters where id = p_to_character and status = 'attivo';
    if to_name is null then
      raise exception 'Il personaggio destinatario non esiste o non è attivo.' using errcode = 'P0001';
    end if;
  else
    select name into to_name from public.house_npcs where id = p_to_npc and not deceased;
    if to_name is null then
      raise exception 'Il PNG destinatario non esiste o è morto.' using errcode = 'P0001';
    end if;
  end if;

  update public.characters set coins = coins - p_amount
  where id = p_from and coins >= p_amount
  returning coins into from_balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza monete.' using errcode = 'P0001';
  end if;
  insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
  values (p_from, -p_amount, 'bonifico',
          'Bonifico a ' || to_name || case when p_to_npc is not null then ' (PNG)' else '' end || suffix,
          from_balance);

  if p_to_character is not null then
    update public.characters set coins = coins + p_amount
    where id = p_to_character
    returning coins into to_balance;
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
    values (p_to_character, p_amount, 'bonifico', 'Bonifico da ' || from_name || suffix, to_balance);
  end if;
end;
$$;

revoke execute on function public.assert_own_character(uuid) from public, anon, authenticated;
revoke execute on function public.bank_withdraw(uuid, int) from public, anon;
revoke execute on function public.bank_deposit(uuid, int) from public, anon;
revoke execute on function public.bank_transfer(uuid, uuid, uuid, int, text) from public, anon;
grant execute on function public.bank_withdraw(uuid, int) to authenticated;
grant execute on function public.bank_deposit(uuid, int) to authenticated;
grant execute on function public.bank_transfer(uuid, uuid, uuid, int, text) to authenticated;
