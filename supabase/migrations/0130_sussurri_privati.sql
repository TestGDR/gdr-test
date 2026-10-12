-- =====================================================================
-- 0130 - Sussurri privati in chat
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un personaggio puo' sussurrare a un altro presente in chat: il sussurro
-- lo leggono solo chi lo scrive, chi lo riceve e gli admin. Non compare
-- agli altri presenti, ne' ai moderatori, ne' nelle giocate salvate.
-- =====================================================================

alter table public.messages
  add column if not exists recipient_id uuid references public.characters(id) on delete set null;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('azione', 'fuori_gioco', 'master', 'dado', 'sistema', 'sussurro'));

-- Lettura: come prima, ma un sussurro lo vedono solo i due personaggi e gli admin
drop policy if exists "messaggi visibili" on public.messages;
create policy "messaggi visibili" on public.messages for select to authenticated
  using (
    public.can_enter_room(room_id)
    and (public.in_chat(room_id) or public.has_permission('chat.moderare') or public.i_am_invisible())
    and (
      kind <> 'sussurro'
      or author_id = auth.uid()
      or public.controls_character(recipient_id)
      or public.is_admin()
    )
  );

-- Scrittura: il sussurro va a un altro personaggio presente in questa chat
drop policy if exists "scrivi con il proprio personaggio attivo" on public.messages;
create policy "scrivi con il proprio personaggio attivo" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.status = 'attivo'
    )
    and public.controls_character(character_id)
    and kind in ('azione', 'fuori_gioco', 'master', 'sussurro')
    and (kind <> 'master' or public.has_permission('chat.narrazione'))
    and (
      kind <> 'sussurro'
      or (
        recipient_id is not null
        and recipient_id <> character_id
        and exists (
          select 1 from public.chat_presence p
          where p.room_id = messages.room_id and p.character_id = messages.recipient_id
        )
      )
    )
    and public.can_enter_room(room_id)
    and (
      public.i_am_invisible()
      or exists (
        select 1 from public.chat_presence p
        where p.room_id = messages.room_id and p.character_id = messages.character_id
      )
    )
  );

-- Per chi non e' ancora entrato: i sussurri non contano tra le azioni sfocate
create or replace function public.chat_hidden_count(p_room uuid)
returns int
language sql
stable
security definer set search_path = ''
as $$
  select case when not public.can_enter_room(p_room) then 0 else (
    select count(*)::int from public.messages m
    where m.room_id = p_room
      and m.kind <> 'sussurro'
      and m.created_at > now() - interval '1 hour'
      and m.created_at > coalesce((select cleared_at from public.rooms where id = p_room), '-infinity'::timestamptz)
  ) end;
$$;
grant execute on function public.chat_hidden_count(uuid) to authenticated;
