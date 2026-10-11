-- =====================================================================
-- 0124 - Chat: avvisi di entrata e uscita, modalita' master, archivio giocate
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Quando un personaggio entra in giocata o ne esce, in chat compare un
--   avviso ("X e' entrato in chat" / "X e' uscito dalla chat").
-- - Modalita' master: chi narra o modera (master, moderatori, admin) puo'
--   fissare per quella chat il minimo e il massimo di caratteri di
--   un'azione. Si spegne da sola quando la chat si svuota.
-- - Archivio giocate: uscendo si puo' salvare la giocata; ognuno vede,
--   scarica e cancella solo le proprie (Utility -> Archivio giocate).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Avvisi di sistema in chat
-- ---------------------------------------------------------------------
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('azione', 'fuori_gioco', 'master', 'dado', 'sistema'));

-- ---------------------------------------------------------------------
-- Modalita' master: limiti delle azioni per una chat
-- ---------------------------------------------------------------------
alter table public.rooms
  add column if not exists master_min int check (master_min between 0 and 4000),
  add column if not exists master_max int check (master_max between 1 and 4000),
  add column if not exists master_by  text;

create or replace function public.can_master_mode()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.has_permission('chat.narrazione') or public.has_permission('chat.moderare');
$$;
grant execute on function public.can_master_mode() to authenticated;

-- p_max null = spegne la modalita' master
create or replace function public.set_master_mode(p_room uuid, p_character uuid, p_min int, p_max int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text;
  v_global int;
begin
  if not public.can_master_mode() then
    raise exception 'Solo master, moderatori e admin possono usare la modalità master.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) or not public.controls_character(p_character) then
    raise exception 'Non puoi farlo in questa chat.' using errcode = '42501';
  end if;
  select name into v_name from public.characters where id = p_character;

  if p_max is null then
    update public.rooms set master_min = null, master_max = null, master_by = null where id = p_room;
    insert into public.messages (room_id, character_id, kind, content)
      values (p_room, p_character, 'sistema', 'ha spento la modalità master: tornano i limiti normali.');
    return;
  end if;

  p_min := greatest(0, coalesce(p_min, 0));
  if p_max < 1 or p_max > 4000 or p_min > p_max then
    raise exception 'Limiti non validi: il minimo non può superare il massimo (massimo 4000).' using errcode = 'P0001';
  end if;
  update public.rooms set master_min = p_min, master_max = p_max, master_by = v_name where id = p_room;
  insert into public.messages (room_id, character_id, kind, content)
    values (p_room, p_character, 'sistema',
      'ha attivato la modalità master: azioni ' ||
      case when p_min > 0 then 'da ' || p_min || ' a ' else 'fino a ' end || p_max || ' caratteri.');
end;
$$;
revoke execute on function public.set_master_mode(uuid, uuid, int, int) from public, anon;
grant execute on function public.set_master_mode(uuid, uuid, int, int) to authenticated;

-- Il database controlla i limiti anche se qualcuno scrive senza passare dalla chat
create or replace function public.chat_message_length_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_max int;
  r public.rooms;
begin
  if new.kind in ('dado', 'sistema') then return new; end if;
  select max_length into v_max from public.chat_settings limit 1;
  -- in modalita' master le azioni seguono i limiti fissati per la chat
  if new.kind = 'azione' then
    select * into r from public.rooms where id = new.room_id;
    if r.master_max is not null then
      if char_length(new.content) > r.master_max then
        raise exception 'Modalità master: l''azione supera il limite di % caratteri.', r.master_max using errcode = 'P0001';
      end if;
      if char_length(new.content) < coalesce(r.master_min, 0) then
        raise exception 'Modalità master: l''azione deve avere almeno % caratteri.', r.master_min using errcode = 'P0001';
      end if;
      return new;
    end if;
  end if;
  if v_max is not null and char_length(new.content) > v_max then
    raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Entra in giocata / esci dalla chat: con l'avviso in chat
-- ---------------------------------------------------------------------
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
    update public.rooms set cleared_at = now(), master_min = null, master_max = null, master_by = null where id = p_room;
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

create or replace function public.leave_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.controls_character(p_character) then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    insert into public.messages (room_id, character_id, kind, content)
      values (p_room, p_character, 'sistema', 'è uscito dalla chat.');
  end if;
  delete from public.chat_presence where room_id = p_room and character_id = p_character;
  delete from public.chat_presence where room_id = p_room and last_active_at <= now() - interval '1 hour';
  if not exists (select 1 from public.chat_presence where room_id = p_room) then
    update public.rooms set cleared_at = now(), master_min = null, master_max = null, master_by = null where id = p_room;
  end if;
end;
$$;
revoke execute on function public.leave_chat(uuid, uuid) from public, anon;
grant execute on function public.leave_chat(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Archivio giocate: una copia della giocata, di chi l'ha salvata
-- ---------------------------------------------------------------------
create table if not exists public.saved_games (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  character_id  uuid references public.characters(id) on delete set null,
  room_name     text not null,
  place_name    text not null default '',
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  participants  text[] not null default '{}',
  message_count int not null default 0,
  messages      jsonb not null default '[]',
  avatars       jsonb not null default '{}', -- nome del personaggio -> immagine, com'era quel giorno
  note          text not null default '' check (char_length(note) <= 1000),
  created_at    timestamptz not null default now()
);
create index if not exists saved_games_owner_idx on public.saved_games (owner_id, started_at desc);

alter table public.saved_games enable row level security;
drop policy if exists "le mie giocate" on public.saved_games;
create policy "le mie giocate" on public.saved_games for select to authenticated using (owner_id = auth.uid());
drop policy if exists "nota sulle mie giocate" on public.saved_games;
create policy "nota sulle mie giocate" on public.saved_games for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "cancello le mie giocate" on public.saved_games;
create policy "cancello le mie giocate" on public.saved_games for delete to authenticated using (owner_id = auth.uid());
grant select, delete on public.saved_games to authenticated;
grant update (note) on public.saved_games to authenticated;
grant select, insert, update, delete on public.saved_games to service_role;

-- Salva la giocata in corso: quello che il personaggio ha visto da quando e' entrato
-- (azioni, narrazioni, tiri e avvisi; non i sussurri OFF). Va chiamata prima di uscire.
create or replace function public.save_game(p_room uuid, p_character uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_from timestamptz;
  v_room text;
  v_place text;
  v_id uuid;
  v_msgs jsonb;
  v_n int;
  v_first timestamptz;
  v_last timestamptz;
  v_people text[];
  v_avatars jsonb;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  select joined_at into v_from from public.chat_presence where room_id = p_room and character_id = p_character;
  if v_from is null then
    raise exception 'Non sei in giocata in questa chat.' using errcode = 'P0001';
  end if;
  select r.name, coalesce(l.name, '') into v_room, v_place
    from public.rooms r left join public.locations l on l.id = r.location_id where r.id = p_room;

  with m as (
    select id, created_at, character_id, character_name, kind, content, recipient
    from public.messages
    where room_id = p_room
      and kind in ('azione', 'master', 'dado', 'sistema')
      and created_at >= v_from - interval '1 second'
    order by created_at, id
    limit 3000
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           't', m.created_at, 'name', m.character_name, 'kind', m.kind,
           'content', m.content, 'to', m.recipient) order by m.created_at, m.id), '[]'::jsonb),
         count(*) filter (where m.kind in ('azione', 'master')),
         min(m.created_at), max(m.created_at),
         coalesce(array_agg(distinct m.character_name) filter (where m.kind = 'azione'), '{}'),
         coalesce((select jsonb_object_agg(c.name, c.avatar_url)
                   from public.characters c
                   where c.avatar_url is not null and c.id in (select character_id from m)), '{}'::jsonb)
    into v_msgs, v_n, v_first, v_last, v_people, v_avatars
    from m;

  if v_n = 0 then
    raise exception 'In questa giocata non ci sono ancora azioni da salvare.' using errcode = 'P0001';
  end if;
  insert into public.saved_games (owner_id, character_id, room_name, place_name, started_at, ended_at,
                                  participants, message_count, messages, avatars)
    values (auth.uid(), p_character, v_room, v_place, v_first, v_last, v_people, v_n, v_msgs, v_avatars)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.save_game(uuid, uuid) from public, anon;
grant execute on function public.save_game(uuid, uuid) to authenticated;
