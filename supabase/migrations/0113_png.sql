-- =====================================================================
-- 0113 - PNG: personaggi non giocanti con la stessa scheda dei PG
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Un PNG e' un personaggio senza giocatore (owner_id vuoto, is_npc vero)
-- - Li crea, li modifica e li muove in chat chi ha il permesso "png.gestire"
--   (Gestione -> PNG): scrivono, tirano i dadi, combattono come i PG
-- - I giocatori non vedono le schede dei PNG: solo il nome in chat
-- =====================================================================

alter table public.characters alter column owner_id drop not null;
alter table public.characters add column if not exists is_npc boolean not null default false;
alter table public.characters drop constraint if exists characters_npc_owner;
alter table public.characters add constraint characters_npc_owner check (is_npc = (owner_id is null));
create index if not exists characters_npc_idx on public.characters (is_npc) where is_npc;

-- Il personaggio e' mio, oppure e' un PNG e ho il permesso di muoverli
create or replace function public.controls_character(p_character uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character
      and (c.owner_id = auth.uid() or (c.is_npc and public.has_permission('png.gestire')))
  );
$$;
grant execute on function public.controls_character(uuid) to authenticated;

create or replace function public.is_my_character(p_character uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.controls_character(p_character);
$$;

create or replace function public.assert_own_character(p_character uuid)
returns void
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.controls_character(p_character) then
    raise exception 'Questo personaggio non è tuo.' using errcode = '42501';
  end if;
end;
$$;

-- Le schede dei PNG le vede solo chi li gestisce
drop policy if exists "personaggi visibili" on public.characters;
create policy "personaggi visibili" on public.characters for select to authenticated
  using (not is_npc or public.has_permission('png.gestire'));

-- Il benvenuto di SISTEMA arriva solo ai PG
drop trigger if exists characters_system_welcome on public.characters;
create trigger characters_system_welcome after insert on public.characters
  for each row when (not new.is_npc) execute function public.system_welcome();

-- ---------------------------------------------------------------------
-- Chat: chi controlla il personaggio (PG proprio o PNG) puo' usarlo
-- ---------------------------------------------------------------------
create or replace function public.in_chat(r uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.chat_presence p
    where p.room_id = r
      and p.last_active_at > now() - interval '1 hour'
      and public.controls_character(p.character_id)
  );
$$;

drop policy if exists "presenti visibili" on public.chat_presence;
create policy "presenti visibili" on public.chat_presence for select to authenticated
  using (public.can_enter_room(room_id) or public.controls_character(character_id));

drop policy if exists "scrivi con il proprio personaggio attivo" on public.messages;
create policy "scrivi con il proprio personaggio attivo" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.status = 'attivo'
    )
    and public.controls_character(character_id)
    and kind in ('azione', 'fuori_gioco', 'master')
    and (kind <> 'master' or public.has_permission('chat.narrazione'))
    and public.can_enter_room(room_id)
    and (
      public.i_am_invisible()
      or exists (
        select 1 from public.chat_presence p
        where p.room_id = messages.room_id and p.character_id = messages.character_id
      )
    )
  );

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
  insert into public.messages (room_id, character_id, kind, content, roll_data)
    values (p_room, p_character, 'dado', left(p_content, 4000), p_data)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.post_dice_roll(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.post_dice_roll(uuid, uuid, uuid, text, jsonb) to service_role;

create or replace function public.join_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_other text;
  v_npc boolean;
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
    update public.rooms set cleared_at = now() where id = p_room;
  end if;
  insert into public.chat_presence (room_id, character_id) values (p_room, p_character)
    on conflict (room_id, character_id) do update set last_active_at = now();
end;
$$;
revoke execute on function public.join_chat(uuid, uuid) from public, anon;
grant execute on function public.join_chat(uuid, uuid) to authenticated;

create or replace function public.leave_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.controls_character(p_character) then
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

-- Presenti in chat con i nomi (i giocatori non leggono la tabella dei PNG)
create or replace function public.chat_present(p_room uuid)
returns table (character_id uuid, name text, is_npc boolean)
language sql
stable
security definer set search_path = ''
as $$
  select p.character_id, c.name, c.is_npc
    from public.chat_presence p
    join public.characters c on c.id = p.character_id
   where p.room_id = p_room
     and p.last_active_at > now() - interval '1 hour'
     and public.can_enter_room(p_room)
   order by p.joined_at;
$$;
grant execute on function public.chat_present(uuid) to authenticated;
