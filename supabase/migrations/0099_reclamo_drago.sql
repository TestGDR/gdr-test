-- =====================================================================
-- 0099 - Creazione: reclamo del drago della casata
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Alla conferma della creazione il server assegna il drago (o l'uovo)
-- scelto al nuovo PG, se e' ancora libero e della casata scelta.
-- La usa solo il server (service_role).
-- =====================================================================

create or replace function public.claim_signup_dragon(p_character uuid, p_dragon uuid, p_house uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('app.dragon_internal', '1', true); -- passa il controllo delle modifiche ai draghi
  update public.dragons
    set rider_id = p_character
    where id = p_dragon and house_id = p_house and rider_id is null and npc_rider_id is null;
  return found;
end;
$$;
revoke execute on function public.claim_signup_dragon(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_signup_dragon(uuid, uuid, uuid) to service_role;
