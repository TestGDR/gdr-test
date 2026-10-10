-- =====================================================================
-- 0111 - Chat: una giocata alla volta
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un personaggio in giocata in una chat deve prima uscirne ("Esci dalla
-- chat") per entrare in un'altra. Lo controlla il database.
-- =====================================================================

-- Le proprie presenze si vedono sempre (serve per il link alla giocata in corso)
drop policy if exists "presenti visibili" on public.chat_presence;
create policy "presenti visibili" on public.chat_presence for select to authenticated
  using (
    public.can_enter_room(room_id)
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  );

create or replace function public.join_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_other text;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi entrare in questa chat.' using errcode = '42501';
  end if;
  -- una giocata alla volta: prima si esce dall'altra chat
  select r.name into v_other
    from public.chat_presence p join public.rooms r on r.id = p.room_id
    where p.character_id = p_character and p.room_id <> p_room
      and p.last_active_at > now() - interval '1 hour'
    order by p.last_active_at desc limit 1;
  if v_other is not null then
    raise exception 'Hai una giocata in corso in "%": prima esci da quella chat.', v_other using errcode = 'P0001';
  end if;
  -- chi non scrive da un'ora e' uscito da solo; se la chat era rimasta vuota si pulisce
  delete from public.chat_presence where room_id = p_room and last_active_at <= now() - interval '1 hour';
  delete from public.chat_presence where character_id = p_character and room_id <> p_room;
  if not exists (select 1 from public.chat_presence where room_id = p_room) then
    update public.rooms set cleared_at = now() where id = p_room;
  end if;
  insert into public.chat_presence (room_id, character_id) values (p_room, p_character)
    on conflict (room_id, character_id) do update set last_active_at = now();
end;
$$;
revoke execute on function public.join_chat(uuid, uuid) from public, anon;
grant execute on function public.join_chat(uuid, uuid) to authenticated;
