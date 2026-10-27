-- =====================================================================
-- 0171 - Equipaggiamento bloccato mentre il PG e' in giocata
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Da quando il PG entra in giocata a quando ne esce, il giocatore non puo'
-- cambiare il suo equipaggiamento (indossato e in borsa): niente indossa e
-- togli, acquisti al Mercato, miglioramenti o riparazioni del fabbro.
-- Restano possibili: i consumi del combattimento (munizioni, resistenza,
-- ricarica) e le modifiche dello staff (admin e "oggetti.gestire").
-- "In giocata" = presente in una chat con un'azione nell'ultima ora (come
-- l'elenco dei presenti in chat).
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

-- Il PG e' in giocata adesso
create or replace function public.character_in_game(p_character uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.chat_presence p
     where p.character_id = p_character
       and p.last_active_at > now() - interval '1 hour'
  );
$$;
revoke execute on function public.character_in_game(uuid) from public, anon;
grant execute on function public.character_in_game(uuid) to authenticated;

create or replace function public.character_items_game_lock()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_char uuid := coalesce(new.character_id, old.character_id);
begin
  -- server (combattimento, veleni) e staff: sempre
  if auth.uid() is null or public.is_admin() or public.has_permission('oggetti.gestire') then
    return coalesce(new, old);
  end if;
  if not public.character_in_game(v_char)
     and (tg_op <> 'UPDATE' or not public.character_in_game(old.character_id)) then
    return coalesce(new, old);
  end if;
  -- in giocata: passano solo i consumi (resistenza e protezione che calano,
  -- munizioni, ricarica; vuoto = integro); non si indossa, non si toglie, non si migliora, non si ripara
  if tg_op = 'UPDATE'
     and new.character_id = old.character_id
     and new.equipped is not distinct from old.equipped
     and new.equipped_slot_id is not distinct from old.equipped_slot_id
     and new.quality_id is not distinct from old.quality_id
     and coalesce(new.aff_current, 1000000) <= coalesce(old.aff_current, 1000000)
     and coalesce(new.sp_current, 1000000) <= coalesce(old.sp_current, 1000000) then
    return new;
  end if;
  raise exception 'Sei in giocata: l''equipaggiamento è bloccato finché non esci dalla giocata.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists character_items_game_lock on public.character_items;
create trigger character_items_game_lock before insert or update or delete on public.character_items
  for each row execute function public.character_items_game_lock();
