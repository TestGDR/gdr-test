-- =====================================================================
-- 0140 - Raggira: tiro nascosto
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il confronto Dissimulare contro Percepire Intenzioni non compare piu' in
-- chat. Se il bersaglio si accorge dell'inganno riceve un messaggio segreto
-- ("intuizione") con il testo scritto da chi ha tentato il raggiro: lo
-- leggono solo il bersaglio e gli admin. Non lo vede nessun altro, nemmeno
-- chi lo ha mandato, ne' i moderatori, ne' finisce nelle giocate salvate.
-- =====================================================================

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('azione', 'fuori_gioco', 'master', 'dado', 'sistema', 'sussurro', 'intuizione'));

-- Lettura: come prima; l'intuizione la vedono solo chi la riceve e gli admin
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
      or public.controls_character(recipient_id)
      or public.is_admin()
    )
  );

-- Per chi non e' ancora entrato: sussurri e intuizioni non contano tra le azioni sfocate
create or replace function public.chat_hidden_count(p_room uuid)
returns int
language sql
stable
security definer set search_path = ''
as $$
  select case when not public.can_enter_room(p_room) then 0 else (
    select count(*)::int from public.messages m
    where m.room_id = p_room
      and m.kind not in ('sussurro', 'intuizione')
      and m.created_at > now() - interval '1 hour'
      and m.created_at > coalesce((select cleared_at from public.rooms where id = p_room), '-infinity'::timestamptz)
  ) end;
$$;
grant execute on function public.chat_hidden_count(uuid) to authenticated;

-- Il tentativo di raggiro (lo chiama solo il server, dopo aver tirato i dadi).
-- Controlla sempre che chi raggira e il bersaglio siano in giocata in questa
-- chat; scrive il messaggio segreto solo se il bersaglio ha scoperto l'inganno
-- (p_discovered). Cosi' chi raggira non capisce l'esito da un eventuale errore.
create or replace function public.post_secret_insight(
  p_user uuid, p_room uuid, p_character uuid, p_recipient uuid, p_content text, p_discovered boolean
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
  if p_discovered then
    insert into public.messages (room_id, character_id, kind, content, recipient, recipient_id)
      values (p_room, p_character, 'intuizione', left(btrim(p_content), 1000), v_target, p_recipient);
  end if;
end;
$$;
revoke execute on function public.post_secret_insight(uuid, uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.post_secret_insight(uuid, uuid, uuid, uuid, text, boolean) to service_role;
