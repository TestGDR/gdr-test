-- =====================================================================
-- 0126 - L avviso di entrata resta visibile anche entrando in una chat vuota
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- La 0125 non bastava: l ora dei messaggi la fissa sempre il database
-- (non si puo scegliere), quindi l avviso aveva ancora la stessa ora della
-- pulizia. Ora e la pulizia a essere segnata un millesimo di secondo prima.
-- =====================================================================

create or replace function public.join_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_other text;
  v_npc boolean;
  v_new boolean;
begin
  select is_npc into v_npc from public.characters where id = p_character and status = 'attivo';
  if v_npc is null or not public.controls_character(p_character) then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi entrare in questa chat.' using errcode = '42501';
  end if;
  -- da invisibili non si entra con il proprio PG (i PNG si' : sono loro a giocare)
  if not v_npc and public.i_am_invisible() then
    raise exception 'Sei invisibile: non serve entrare in giocata.' using errcode = 'P0001';
  end if;
  select r.name into v_other
    from public.chat_presence p join public.rooms r on r.id = p.room_id
    where p.character_id = p_character and p.room_id <> p_room
      and p.last_active_at > now() - interval '1 hour'
    order by p.last_active_at desc limit 1;
  if v_other is not null then
    raise exception 'Giocata in corso in "%": prima va chiusa quella.', v_other using errcode = 'P0001';
  end if;
  delete from public.chat_presence where room_id = p_room and last_active_at <= now() - interval '1 hour';
  delete from public.chat_presence where character_id = p_character and room_id <> p_room;
  if not exists (select 1 from public.chat_presence where room_id = p_room) then
    -- chat vuota: si pulisce e la modalita' master si spegne
    -- la pulizia porta l ora di un attimo prima: l avviso di entrata, scritto subito
    -- dopo con l ora di adesso, risulta successivo e resta visibile
    update public.rooms set cleared_at = now() - interval '1 millisecond', master_min = null, master_max = null, master_by = null where id = p_room;
  end if;
  v_new := not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character);
  insert into public.chat_presence (room_id, character_id) values (p_room, p_character)
    on conflict (room_id, character_id) do update set last_active_at = now();
  if v_new then
    insert into public.messages (room_id, character_id, kind, content)
      values (p_room, p_character, 'sistema', 'è entrato in chat.');
  end if;
end;
$$;
revoke execute on function public.join_chat(uuid, uuid) from public, anon;
grant execute on function public.join_chat(uuid, uuid) to authenticated;
