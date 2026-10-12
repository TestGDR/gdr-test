-- =====================================================================
-- 0128 - Chat: blocco dopo un'azione al limite, modifica entro 5 minuti,
--        cancellazione delle azioni da parte di chi modera
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Blocco di turno (10 minuti): chi manda un'azione che arriva al limite
--   dei caratteri non puo' mandarne subito un'altra (per non spezzare
--   un'azione in due). Il blocco finisce appena scrive un altro
--   personaggio, oppure dopo 10 minuti. Non vale per i PNG.
-- - Modifica: l'autore puo' correggere la propria azione una sola volta,
--   nei primi 5 minuti.
-- - Cancellazione: chi ha il permesso di moderare la chat (moderatori e
--   admin) puo' sempre cancellare le singole azioni. Gli altri no.
-- =====================================================================

alter table public.messages add column if not exists edited_at timestamptz;

-- ---------------------------------------------------------------------
-- Blocco di turno dopo un'azione al limite dei caratteri
-- ---------------------------------------------------------------------
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

  -- e' la mia, e' recente ed era al limite (dal 95% in su): tocca a un altro
  if last_msg.character_id = new.character_id
     and last_msg.created_at > now() - interval '10 minutes'
     and last_msg.len >= ceil(v_limit * 0.95) then
    v_left := greatest(1, ceil(extract(epoch from (last_msg.created_at + interval '10 minutes' - now())) / 60)::int);
    raise exception 'Hai appena inviato un''azione al limite dei caratteri: potrai scriverne un''altra quando avrà scritto un altro personaggio, oppure tra % minut%.',
      v_left, case when v_left = 1 then 'o' else 'i' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_turn_guard on public.messages;
create trigger messages_turn_guard before insert on public.messages
  for each row execute function public.action_turn_guard();

-- ---------------------------------------------------------------------
-- Modifica della propria azione: una volta sola, entro 5 minuti
-- ---------------------------------------------------------------------
create or replace function public.edit_chat_message(p_id bigint, p_content text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  m public.messages;
  r public.rooms;
  v_max int;
  v_text text := btrim(coalesce(p_content, ''));
begin
  select * into m from public.messages where id = p_id for update;
  if not found or m.author_id is distinct from auth.uid() or m.kind <> 'azione' then
    raise exception 'Puoi modificare solo le tue azioni.' using errcode = '42501';
  end if;
  if m.edited_at is not null then
    raise exception 'Questa azione è già stata modificata una volta.' using errcode = 'P0001';
  end if;
  if m.created_at <= now() - interval '5 minutes' then
    raise exception 'Sono passati più di 5 minuti: l''azione non si può più modificare.' using errcode = 'P0001';
  end if;
  if v_text = '' then
    raise exception 'L''azione non può essere vuota.' using errcode = 'P0001';
  end if;
  -- stessi limiti di lunghezza di quando si scrive
  select * into r from public.rooms where id = m.room_id;
  if r.master_max is not null then
    if char_length(v_text) > r.master_max then
      raise exception 'Modalità master: l''azione supera il limite di % caratteri.', r.master_max using errcode = 'P0001';
    end if;
    if char_length(v_text) < coalesce(r.master_min, 0) then
      raise exception 'Modalità master: l''azione deve avere almeno % caratteri.', r.master_min using errcode = 'P0001';
    end if;
  else
    select max_length into v_max from public.chat_settings limit 1;
    if v_max is not null and char_length(v_text) > v_max then
      raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
    end if;
  end if;
  update public.messages set content = v_text, edited_at = now() where id = p_id;
end;
$$;
revoke execute on function public.edit_chat_message(bigint, text) from public, anon;
grant execute on function public.edit_chat_message(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- Cancellazione: solo chi modera la chat (moderatori e admin)
-- ---------------------------------------------------------------------
create or replace function public.delete_chat_message(p_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('chat.moderare') then
    raise exception 'Solo moderatori e admin possono cancellare le azioni.' using errcode = '42501';
  end if;
  delete from public.messages where id = p_id;
end;
$$;
revoke execute on function public.delete_chat_message(bigint) from public, anon;
grant execute on function public.delete_chat_message(bigint) to authenticated;

-- prima chiunque poteva cancellare i propri messaggi: ora solo chi modera
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'messages' and cmd = 'DELETE'
  loop
    execute format('drop policy %I on public.messages', p.policyname);
  end loop;
end $$;
create policy "cancella chi modera" on public.messages for delete to authenticated
  using (public.has_permission('chat.moderare'));
