-- =====================================================================
-- 0087 - Stato civile reciproco tra PG
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Basta modificare una scheda: se Rhaenyra diventa fidanzata (o sposata)
-- con Daemon, sulla scheda di Daemon compare "Fidanzato con Rhaenyra".
-- - Chi aveva gia' un legame con uno dei due lo perde (torna celibe/nubile).
-- - Se il legame tra due PG finisce: con "Divorziato" diventano divorziati
--   entrambi; con qualsiasi altro stato l'altro PG torna celibe/nubile.
-- =====================================================================

create or replace function public.set_marital_status(p_character uuid, p_status text, p_partner uuid, p_partner_npc text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_npc text := nullif(trim(coalesce(p_partner_npc, '')), '');
  v_with boolean := p_status in ('sposato', 'fidanzato');
  v_partner uuid := case when v_with then p_partner end;
  v_old uuid;
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono cambiare lo stato civile.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('libero', 'sposato', 'fidanzato', 'divorziato', 'vedovo') then
    raise exception 'Stato civile non valido.' using errcode = 'P0001';
  end if;
  if p_partner = p_character then raise exception 'Un personaggio non può sposare se stesso.' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_npc, '')) > 60 then raise exception 'Nome del PNG troppo lungo.' using errcode = 'P0001'; end if;

  select partner_character_id into v_old from public.characters where id = p_character;

  -- il vecchio partner (PG) perde il legame, se non e' lo stesso di prima
  if v_old is not null and v_old is distinct from v_partner then
    update public.characters
      set marital_status = case when p_status = 'divorziato' then 'divorziato' else 'libero' end,
          partner_character_id = null, partner_npc = null
      where id = v_old and partner_character_id = p_character;
  end if;

  if v_partner is not null then
    -- chi era legato al nuovo partner (diverso da questo PG) torna libero
    update public.characters
      set marital_status = 'libero', partner_character_id = null, partner_npc = null
      where partner_character_id = v_partner and id <> p_character;
    -- il nuovo partner riceve lo stesso stato, legato a questo PG
    update public.characters
      set marital_status = p_status, partner_character_id = p_character, partner_npc = null
      where id = v_partner;
  end if;

  update public.characters
    set marital_status = p_status,
        partner_character_id = v_partner,
        partner_npc = case when v_with and v_partner is null then v_npc end
    where id = p_character;
end;
$$;
revoke execute on function public.set_marital_status(uuid, text, uuid, text) from public, anon;
grant execute on function public.set_marital_status(uuid, text, uuid, text) to authenticated;

-- Legami gia' impostati prima di questa modifica: completa la scheda opposta
update public.characters p
  set marital_status = c.marital_status, partner_character_id = c.id, partner_npc = null
  from public.characters c
  where c.partner_character_id = p.id
    and c.marital_status in ('sposato', 'fidanzato')
    and p.partner_character_id is null;
