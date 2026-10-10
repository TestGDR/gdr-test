-- =====================================================================
-- 0110 - Chat: entrare in giocata
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Chi arriva in una chat non legge le azioni finche' non preme
--   "Entra in giocata" (lo staff con chat.moderare legge sempre)
-- - Per scrivere (azioni, OFF, dadi) bisogna essere in giocata
-- - "Esci dalla chat": quando esce l'ultimo la chat si pulisce
--   (le azioni restano nel database: Gestione -> Log)
-- - Chi non scrive per un'ora esce da solo dalla giocata
-- =====================================================================

create table if not exists public.chat_presence (
  room_id         uuid not null references public.rooms(id) on delete cascade,
  character_id    uuid not null references public.characters(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  primary key (room_id, character_id)
);
create index if not exists chat_presence_character_idx on public.chat_presence (character_id);
alter table public.chat_presence enable row level security;
grant select on public.chat_presence to authenticated;
grant select, insert, update, delete on public.chat_presence to service_role;

-- quando la chat e' stata pulita l'ultima volta
alter table public.rooms add column if not exists cleared_at timestamptz;

-- Il personaggio (o uno dei personaggi) dell'utente e' in giocata in questa chat
create or replace function public.in_chat(r uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.chat_presence p
    join public.characters c on c.id = p.character_id
    where p.room_id = r and c.owner_id = auth.uid()
      and p.last_active_at > now() - interval '1 hour'
  );
$$;
grant execute on function public.in_chat(uuid) to authenticated;

drop policy if exists "presenti visibili" on public.chat_presence;
create policy "presenti visibili" on public.chat_presence for select to authenticated
  using (public.can_enter_room(room_id));

-- Messaggi: li legge chi e' in giocata (o lo staff)
drop policy if exists "messaggi visibili" on public.messages;
create policy "messaggi visibili" on public.messages for select to authenticated
  using (
    public.can_enter_room(room_id)
    and (public.in_chat(room_id) or public.has_permission('chat.moderare'))
  );

-- Messaggi: scrive solo chi e' in giocata
drop policy if exists "scrivi con il proprio personaggio attivo" on public.messages;
create policy "scrivi con il proprio personaggio attivo" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.owner_id = auth.uid() and c.status = 'attivo'
    )
    and kind in ('azione', 'fuori_gioco', 'master')
    and (kind <> 'master' or public.has_permission('chat.narrazione'))
    and public.can_enter_room(room_id)
    and exists (
      select 1 from public.chat_presence p
      where p.room_id = messages.room_id and p.character_id = messages.character_id
    )
  );

-- Dadi e combattimento: stesso controllo
create or replace function public.post_dice_roll(p_user uuid, p_room uuid, p_character uuid, p_content text, p_data jsonb)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.characters where id = p_character and owner_id = p_user and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi scrivere in questa chat.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = '42501';
  end if;
  insert into public.messages (room_id, character_id, kind, content, roll_data)
    values (p_room, p_character, 'dado', left(p_content, 4000), p_data)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.post_dice_roll(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.post_dice_roll(uuid, uuid, uuid, text, jsonb) to service_role;

-- Ogni messaggio tiene viva la presenza in giocata
create or replace function public.chat_presence_touch()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.chat_presence set last_active_at = now()
    where room_id = new.room_id and character_id = new.character_id;
  return new;
end;
$$;
drop trigger if exists messages_presence_touch on public.messages;
create trigger messages_presence_touch after insert on public.messages
  for each row execute function public.chat_presence_touch();

-- Entra in giocata
create or replace function public.join_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi entrare in questa chat.' using errcode = '42501';
  end if;
  -- chi non scrive da un'ora e' uscito da solo; se la chat era rimasta vuota si pulisce
  delete from public.chat_presence where room_id = p_room and last_active_at <= now() - interval '1 hour';
  if not exists (select 1 from public.chat_presence where room_id = p_room) then
    update public.rooms set cleared_at = now() where id = p_room;
  end if;
  insert into public.chat_presence (room_id, character_id) values (p_room, p_character)
    on conflict (room_id, character_id) do update set last_active_at = now();
end;
$$;
revoke execute on function public.join_chat(uuid, uuid) from public, anon;
grant execute on function public.join_chat(uuid, uuid) to authenticated;

-- Esci dalla chat: l'ultimo che esce la pulisce
create or replace function public.leave_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  delete from public.chat_presence where room_id = p_room and character_id = p_character;
  delete from public.chat_presence where room_id = p_room and last_active_at <= now() - interval '1 hour';
  if not exists (select 1 from public.chat_presence where room_id = p_room) then
    update public.rooms set cleared_at = now() where id = p_room;
  end if;
end;
$$;
revoke execute on function public.leave_chat(uuid, uuid) from public, anon;
grant execute on function public.leave_chat(uuid, uuid) to authenticated;

-- Per chi non e' ancora entrato: quante azioni ci sono (si vedono sfocate, senza testo)
create or replace function public.chat_hidden_count(p_room uuid)
returns int
language sql
stable
security definer set search_path = ''
as $$
  select case when not public.can_enter_room(p_room) then 0 else (
    select count(*)::int from public.messages m
    where m.room_id = p_room
      and m.created_at > now() - interval '1 hour'
      and m.created_at > coalesce((select cleared_at from public.rooms where id = p_room), '-infinity'::timestamptz)
  ) end;
$$;
grant execute on function public.chat_hidden_count(uuid) to authenticated;

-- Aggiornamenti in tempo reale della lista dei presenti
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_presence'
  ) then
    alter publication supabase_realtime add table public.chat_presence;
  end if;
end $$;
