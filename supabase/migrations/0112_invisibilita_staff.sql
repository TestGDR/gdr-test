-- =====================================================================
-- 0112 - Staff: invisibilita'
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Permesso "staff.invisibile" (Ruoli & Permessi). Chi lo ha puo' rendersi
-- invisibile: non compare tra i presenti (ne' estesi ne' di chat) per chi
-- non ha lo stesso permesso, e legge e scrive nelle chat senza "Entra in
-- giocata".
-- =====================================================================

alter table public.profiles add column if not exists invisible boolean not null default false;

-- Sono invisibile adesso (ho il permesso e l'ho acceso)
create or replace function public.i_am_invisible()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.has_permission('staff.invisibile')
     and exists (select 1 from public.profiles where id = auth.uid() and invisible);
$$;
grant execute on function public.i_am_invisible() to authenticated;

create or replace function public.set_invisible(p_on boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('staff.invisibile') then
    raise exception 'Non hai il permesso dell''invisibilità.' using errcode = '42501';
  end if;
  update public.profiles set invisible = coalesce(p_on, false) where id = auth.uid();
  -- da invisibili non si sta "in giocata": si esce dalle chat
  if p_on then
    delete from public.chat_presence
      where character_id in (select id from public.characters where owner_id = auth.uid());
  end if;
end;
$$;
revoke execute on function public.set_invisible(boolean) from public, anon;
grant execute on function public.set_invisible(boolean) to authenticated;

-- Presenti online: gli invisibili li vede solo chi ha lo stesso permesso (e loro stessi)
drop policy if exists "segnali visibili" on public.online_status;
create policy "segnali visibili" on public.online_status for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('staff.invisibile')
    or not exists (select 1 from public.profiles p where p.id = user_id and p.invisible)
  );

create or replace function public.recent_online()
returns table (user_id uuid, info jsonb, last_seen timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select o.user_id,
         o.info || jsonb_build_object('invisible', coalesce(p.invisible, false)),
         o.last_seen
    from public.online_status o
    left join public.profiles p on p.id = o.user_id
   where o.last_action > now() - interval '60 minutes'
     and (
       not coalesce(p.invisible, false)
       or o.user_id = auth.uid()
       or public.has_permission('staff.invisibile')
     );
$$;
grant execute on function public.recent_online() to authenticated;

-- Chat: gli invisibili leggono e scrivono senza entrare in giocata
drop policy if exists "messaggi visibili" on public.messages;
create policy "messaggi visibili" on public.messages for select to authenticated
  using (
    public.can_enter_room(room_id)
    and (public.in_chat(room_id) or public.has_permission('chat.moderare') or public.i_am_invisible())
  );

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
  if not exists (select 1 from public.characters where id = p_character and owner_id = p_user and status = 'attivo') then
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

-- Gli invisibili non entrano in giocata (resterebbero nella lista dei presenti in chat)
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
  if public.i_am_invisible() then
    raise exception 'Sei invisibile: non serve entrare in giocata.' using errcode = 'P0001';
  end if;
  select r.name into v_other
    from public.chat_presence p join public.rooms r on r.id = p.room_id
    where p.character_id = p_character and p.room_id <> p_room
      and p.last_active_at > now() - interval '1 hour'
    order by p.last_active_at desc limit 1;
  if v_other is not null then
    raise exception 'Hai una giocata in corso in "%": prima esci da quella chat.', v_other using errcode = 'P0001';
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
