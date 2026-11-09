-- =====================================================================
-- 0181 - Avvisi di combattimento in chat letti direttamente dal browser
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- "Sei attaccato da..." e "serve il tiro salvezza": prima passavano da una
-- funzione di Vercel a ogni tiro di dado in chat (consumi di Vercel). Ora una
-- funzione del database, solo per i personaggi che l'utente muove.
-- =====================================================================

create or replace function public.my_combat_alert(p_room uuid, p_character uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  c public.characters;
begin
  -- il proprio PG, oppure un PNG che l'utente puo' muovere
  if not public.controls_character(p_character) then
    return jsonb_build_object('attackers', '[]'::jsonb, 'dying', false);
  end if;
  select * into c from public.characters where id = p_character;
  if c.id is null or c.status <> 'attivo' then
    return jsonb_build_object('attackers', '[]'::jsonb, 'dying', false);
  end if;
  return jsonb_build_object(
    'attackers', coalesce((
      select jsonb_agg(distinct a.data ->> 'attackerName')
      from public.combat_attacks a
      where a.room_id = p_room and a.target_id = p_character and a.resolved_at is null
    ), '[]'::jsonb),
    'dying', c.dying_since is not null and c.stabilized_at is null and c.dead_at is null and c.dying_save_due
  );
end;
$$;

revoke execute on function public.my_combat_alert(uuid, uuid) from public, anon;
grant execute on function public.my_combat_alert(uuid, uuid) to authenticated;
