-- =====================================================================
-- 0149 - Congedare truppe (gruppi da 10, 50 o 100)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- Il signore della casata (o lo staff) congeda soldati: escono dall'esercito,
-- non restituiscono Manodopera e da quel momento non costano piu' mantenimento.
-- =====================================================================

create or replace function public.dismiss_troops(p_house uuid, p_troop_type uuid, p_count int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_have int;
  v_type text;
  v_by text;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi congedare truppe di questa casata.' using errcode = '42501';
  end if;
  if p_count not in (10, 50, 100) then
    raise exception 'Si congedano gruppi da 10, 50 o 100 soldati.' using errcode = 'P0001';
  end if;
  select quantity into v_have from public.house_troops where house_id = p_house and troop_type_id = p_troop_type for update;
  if coalesce(v_have, 0) < p_count then
    raise exception 'La casata non ha abbastanza soldati di questo tipo.' using errcode = 'P0001';
  end if;
  select name into v_type from public.troop_types where id = p_troop_type;
  if v_have = p_count then
    delete from public.house_troops where house_id = p_house and troop_type_id = p_troop_type;
  else
    update public.house_troops set quantity = quantity - p_count where house_id = p_house and troop_type_id = p_troop_type;
  end if;
  v_by := coalesce((select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1), 'Staff');
  insert into public.economy_log (house_id, resource_id, delta, reason)
    values (p_house, null, 0, 'Congedati ' || p_count || ' ' || coalesce(v_type, '?') || ' (' || v_by || ')');
end;
$$;
revoke execute on function public.dismiss_troops(uuid, uuid, int) from public, anon;
grant execute on function public.dismiss_troops(uuid, uuid, int) to authenticated;
