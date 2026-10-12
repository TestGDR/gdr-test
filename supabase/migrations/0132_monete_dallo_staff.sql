-- =====================================================================
-- 0132 - L'admin da' o toglie monete a un personaggio
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Scheda -> Gestisci: accanto a PX, Risorse e Onore si possono aggiungere
-- o togliere monete dal conto del personaggio. Il movimento compare nel
-- suo estratto conto in banca, con la causale.
-- =====================================================================

create or replace function public.admin_adjust_coins(p_character uuid, p_amount int, p_reason text)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_balance int;
begin
  if not public.is_admin() then
    raise exception 'Solo gli admin possono farlo.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000000 then
    raise exception 'Indica quante monete dare (o togliere, con il meno davanti).' using errcode = 'P0001';
  end if;
  update public.characters set coins = coins + p_amount
   where id = p_character and coins + p_amount >= 0
   returning coins into v_balance;
  if not found then
    raise exception 'Il personaggio non ha abbastanza monete sul conto da togliere.' using errcode = 'P0001';
  end if;
  insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
    values (p_character, p_amount, 'staff',
            coalesce(nullif(btrim(left(coalesce(p_reason, ''), 120)), ''),
                     case when p_amount > 0 then 'Monete dallo staff' else 'Monete tolte dallo staff' end),
            v_balance);
  return v_balance;
end;
$$;
revoke execute on function public.admin_adjust_coins(uuid, int, text) from public, anon;
grant execute on function public.admin_adjust_coins(uuid, int, text) to authenticated;
