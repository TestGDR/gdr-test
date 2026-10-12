-- =====================================================================
-- 0129 - Blocco di turno: scatta solo al limite esatto dei caratteri
-- Eseguire in Supabase DOPO la 0128: SQL Editor -> New query -> incolla -> Run
--
-- Prima scattava dal 95% del limite in su; ora solo quando l azione ha
-- raggiunto esattamente il limite di caratteri della chat.
-- =====================================================================

create or replace function public.action_turn_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.rooms;
  v_limit int;
  last_msg record;
  v_left int;
begin
  if new.kind <> 'azione' then return new; end if;
  if exists (select 1 from public.characters where id = new.character_id and is_npc) then return new; end if;

  select * into r from public.rooms where id = new.room_id;
  v_limit := coalesce(r.master_max, (select max_length from public.chat_settings limit 1));
  if v_limit is null then return new; end if;

  -- l'ultima azione scritta in questa chat (dopo l'ultima pulizia)
  select m.character_id, m.created_at, char_length(m.content) as len into last_msg
    from public.messages m
   where m.room_id = new.room_id and m.kind = 'azione'
     and m.created_at > coalesce(r.cleared_at, '-infinity'::timestamptz)
   order by m.created_at desc, m.id desc
   limit 1;

  -- e' la mia, e' recente ed era esattamente al limite: tocca a un altro
  if last_msg.character_id = new.character_id
     and last_msg.created_at > now() - interval '10 minutes'
     and last_msg.len >= v_limit then
    v_left := greatest(1, ceil(extract(epoch from (last_msg.created_at + interval '10 minutes' - now())) / 60)::int);
    raise exception 'Hai appena inviato un''azione al limite dei caratteri: potrai scriverne un''altra quando avrà scritto un altro personaggio, oppure tra % minut%.',
      v_left, case when v_left = 1 then 'o' else 'i' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;
