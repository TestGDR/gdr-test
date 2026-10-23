-- =====================================================================
-- 0159 - Raggira: gli admin vedono ogni tentativo
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- Per i giocatori non cambia nulla: se il bersaglio scopre l'inganno riceve
-- il messaggio (intuizione), altrimenti nessuno vede niente.
-- In piu' ogni raggiro, riuscito o scoperto, lascia il messaggio con l'esito
-- e i tiri: gli admin li vedono tutti. Non finisce nelle giocate salvate.
-- =====================================================================

-- Lettura: l'intuizione la vede il bersaglio solo se ha scoperto l'inganno
-- (i messaggi vecchi, senza esito, erano tutti scoperti); gli admin sempre
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
    and (
      kind <> 'intuizione'
      or public.is_admin()
      or (public.controls_character(recipient_id) and coalesce((roll_data ->> 'discovered')::boolean, true))
    )
  );

-- Il tentativo di raggiro (lo chiama solo il server, dopo aver tirato i dadi):
-- scrive sempre il messaggio, con l'esito e i tiri in roll_data
drop function if exists public.post_secret_insight(uuid, uuid, uuid, uuid, text, boolean);
create or replace function public.post_secret_insight(
  p_user uuid, p_room uuid, p_character uuid, p_recipient uuid, p_content text, p_discovered boolean,
  p_data jsonb default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_target text;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if not public.controls_character(p_character)
     or not exists (select 1 from public.characters where id = p_character and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi scrivere in questa chat.' using errcode = '42501';
  end if;
  if not public.i_am_invisible()
     and not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = '42501';
  end if;
  select c.name into v_target
    from public.characters c
    join public.chat_presence p on p.character_id = c.id and p.room_id = p_room
   where c.id = p_recipient and c.id <> p_character and c.status = 'attivo';
  if v_target is null then
    raise exception 'Il bersaglio non è in questa chat.' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_content, '')) = '' then
    raise exception 'Scrivi che cosa scopre il bersaglio.' using errcode = 'P0001';
  end if;
  insert into public.messages (room_id, character_id, kind, content, recipient, recipient_id, roll_data)
    values (p_room, p_character, 'intuizione', left(btrim(p_content), 1000), v_target, p_recipient,
            coalesce(p_data, '{}'::jsonb) || jsonb_build_object('discovered', p_discovered));
end;
$$;
revoke execute on function public.post_secret_insight(uuid, uuid, uuid, uuid, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.post_secret_insight(uuid, uuid, uuid, uuid, text, boolean, jsonb) to service_role;
