-- =====================================================================
-- 0080 - Voci e pettegolezzi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Fine giocata (da regolamento): un PG partecipante tira il dado nel
-- pannello "Voci e pettegolezzi". Il risultato lo decide il database.
--  - Non notati (sotto la soglia): finisce li', nessun ticket.
--  - Notati: il giocatore scrive un breve riassunto, la zona e i PG presenti;
--    si apre un ticket verso la gestione (sezione "Pettegolezzi").
-- I master (permesso "pettegolezzi.gestire") controllano, modificano il
-- testo e approvano o rifiutano. Le voci approvate le leggono tutti.
-- Ogni tiro resta registrato (anche quelli "non notati").
-- =====================================================================

-- Permesso: lo ricevono subito i ruoli che narrano come master
update public.staff_roles set permissions = array_append(permissions, 'pettegolezzi.gestire')
  where 'chat.narrazione' = any(permissions) and not ('pettegolezzi.gestire' = any(permissions));

-- Dado e soglia (notati con un risultato >= seen_from)
create table if not exists public.gossip_settings (
  id         boolean primary key default true check (id),
  die_sides  int not null default 20 check (die_sides between 2 and 100),
  seen_from  int not null default 11 check (seen_from between 1 and 100)
);
insert into public.gossip_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.gossip_rolls (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  roll          int not null,
  sides         int not null,
  seen          boolean not null,
  created_at    timestamptz not null default now()
);
create index if not exists gossip_rolls_character_idx on public.gossip_rolls (character_id, created_at desc);

create table if not exists public.gossip_reports (
  id               uuid primary key default gen_random_uuid(),
  roll_id          uuid not null unique references public.gossip_rolls(id) on delete cascade,
  character_id     uuid not null references public.characters(id) on delete cascade,
  author_name      text not null default '',
  participants     uuid[] not null default '{}',
  participant_names text not null default '',
  location_id      uuid references public.locations(id) on delete set null,
  room_id          uuid references public.rooms(id) on delete set null,
  zone_name        text not null default '',
  summary          text not null check (char_length(summary) between 1 and 2000),
  status           text not null default 'attesa' check (status in ('attesa', 'approvato', 'rifiutato')),
  published_text   text,                 -- il testo approvato (modificabile dal master)
  reviewed_by_name text,
  reviewed_at      timestamptz,
  ticket_id        uuid references public.tickets(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists gossip_reports_status_idx on public.gossip_reports (status, created_at desc);

alter table public.gossip_settings enable row level security;
alter table public.gossip_rolls enable row level security;
alter table public.gossip_reports enable row level security;

drop policy if exists "impostazioni voci visibili" on public.gossip_settings;
create policy "impostazioni voci visibili" on public.gossip_settings for select to authenticated using (true);
drop policy if exists "impostazioni voci dei master" on public.gossip_settings;
create policy "impostazioni voci dei master" on public.gossip_settings for update to authenticated
  using (public.has_permission('pettegolezzi.gestire')) with check (public.has_permission('pettegolezzi.gestire'));

drop policy if exists "i miei tiri" on public.gossip_rolls;
create policy "i miei tiri" on public.gossip_rolls for select to authenticated
  using (public.is_my_character(character_id) or public.has_permission('pettegolezzi.gestire'));

drop policy if exists "voci visibili" on public.gossip_reports;
create policy "voci visibili" on public.gossip_reports for select to authenticated
  using (
    status = 'approvato'
    or public.is_my_character(character_id)
    or exists (select 1 from public.characters c where c.owner_id = auth.uid() and c.id = any(participants))
    or public.has_permission('pettegolezzi.gestire')
  );
-- (tiri, segnalazioni e approvazioni passano dalle funzioni qui sotto)

grant select, update on public.gossip_settings to authenticated;
grant select on public.gossip_rolls, public.gossip_reports to authenticated;
grant select, insert, update, delete on public.gossip_settings, public.gossip_rolls, public.gossip_reports to service_role;

-- Sezione dei ticket per i pettegolezzi
insert into public.ticket_sections (name, instructions, sort_order)
select 'Pettegolezzi', 'Ticket aperti in automatico quando, a fine giocata, i personaggi vengono notati.', 99
where not exists (select 1 from public.ticket_sections where name = 'Pettegolezzi');

-- ---------------------------------------------------------------------
-- Tiro di fine giocata
-- ---------------------------------------------------------------------
create or replace function public.gossip_roll(p_character uuid)
returns table (id uuid, roll int, sides int, seen boolean)
language plpgsql
security definer set search_path = ''
as $$
declare
  s public.gossip_settings;
  v_roll int;
  v_id uuid;
begin
  if not exists (select 1 from public.characters where characters.id = p_character and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Serve un personaggio attivo.' using errcode = 'P0001';
  end if;
  select * into s from public.gossip_settings;
  v_roll := 1 + floor(random() * s.die_sides)::int;
  insert into public.gossip_rolls (character_id, user_id, roll, sides, seen)
    values (p_character, auth.uid(), v_roll, s.die_sides, v_roll >= s.seen_from)
    returning gossip_rolls.id into v_id;
  return query select v_id, v_roll, s.die_sides, v_roll >= s.seen_from;
end;
$$;

-- ---------------------------------------------------------------------
-- Notati: riassunto, zona e PG presenti -> ticket verso la gestione
-- ---------------------------------------------------------------------
create or replace function public.gossip_report(p_roll uuid, p_summary text, p_location uuid, p_room uuid, p_participants uuid[])
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.gossip_rolls;
  v_author text;
  v_zone text;
  v_names text;
  v_section uuid;
  v_ticket uuid;
  v_report uuid;
  v_others uuid[];
begin
  select * into r from public.gossip_rolls where id = p_roll;
  if r.id is null or not public.is_my_character(r.character_id) then raise exception 'Tiro non trovato.'; end if;
  if not r.seen then raise exception 'I personaggi non sono stati notati: niente pettegolezzo.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.gossip_reports where roll_id = p_roll) then
    raise exception 'Per questo tiro il pettegolezzo è già stato mandato.' using errcode = 'P0001';
  end if;
  if r.created_at < now() - interval '2 days' then
    raise exception 'Il tiro è troppo vecchio: tirane uno nuovo a fine giocata.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) not between 10 and 2000 then
    raise exception 'Scrivi un riassunto tra 10 e 2000 caratteri.' using errcode = 'P0001';
  end if;
  if p_location is null then raise exception 'Indica la zona della giocata.' using errcode = 'P0001'; end if;

  select name into v_author from public.characters where id = r.character_id;
  select l.name || coalesce(' · ' || (select name from public.rooms where id = p_room and location_id = l.id), '')
    into v_zone from public.locations l where l.id = p_location;
  if v_zone is null then raise exception 'Zona non valida.' using errcode = 'P0001'; end if;
  v_others := array(select c.id from public.characters c
                    where c.id = any(coalesce(p_participants, '{}')) and c.id <> r.character_id);
  select coalesce(string_agg(c.name, ', ' order by c.name), '') into v_names
    from public.characters c where c.id = any(v_others);

  select id into v_section from public.ticket_sections where name = 'Pettegolezzi' limit 1;
  v_ticket := public.open_ticket(
    r.character_id,
    'Pettegolezzo: ' || left(v_zone, 100),
    v_section,
    '<p><strong>Pettegolezzo di fine giocata</strong> — dado ' || r.roll || ' su d' || r.sides || ': i personaggi sono stati notati.</p>'
      || '<p><strong>Zona:</strong> ' || replace(replace(v_zone, '<', '&lt;'), '>', '&gt;') || '</p>'
      || '<p><strong>Presenti:</strong> ' || replace(replace(v_author || case when v_names <> '' then ', ' || v_names else '' end, '<', '&lt;'), '>', '&gt;') || '</p>'
      || '<p><strong>Riassunto:</strong><br>' || replace(replace(replace(trim(p_summary), '&', '&amp;'), '<', '&lt;'), E'\n', '<br>') || '</p>'
      || '<p>Il master lo controlla e lo approva (anche modificandolo) o lo rifiuta dal pannello Voci e pettegolezzi.</p>',
    v_others
  );

  insert into public.gossip_reports (roll_id, character_id, author_name, participants, participant_names,
                                     location_id, room_id, zone_name, summary, ticket_id)
    values (p_roll, r.character_id, v_author, v_others, v_names, p_location, p_room, v_zone, trim(p_summary), v_ticket)
    returning id into v_report;
  return v_report;
end;
$$;

-- ---------------------------------------------------------------------
-- Master: approva (anche modificando il testo) o rifiuta
-- ---------------------------------------------------------------------
create or replace function public.gossip_review(p_report uuid, p_approve boolean, p_text text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  g public.gossip_reports;
  v_master text;
  v_pg uuid;
  v_msg text;
begin
  if not public.has_permission('pettegolezzi.gestire') then raise exception 'Permesso negato'; end if;
  select * into g from public.gossip_reports where id = p_report;
  if g.id is null then raise exception 'Pettegolezzo non trovato'; end if;
  if p_approve and char_length(trim(coalesce(p_text, ''))) not between 1 and 2000 then
    raise exception 'Il testo della voce non è valido.' using errcode = 'P0001';
  end if;
  select coalesce((select c.name from public.characters c where c.owner_id = auth.uid() order by c.created_at limit 1),
                  (select username from public.profiles where id = auth.uid()), 'Master') into v_master;

  update public.gossip_reports
    set status = case when p_approve then 'approvato' else 'rifiutato' end,
        published_text = case when p_approve then trim(p_text) else published_text end,
        reviewed_by_name = v_master, reviewed_at = now()
    where id = p_report;

  v_msg := case when p_approve
    then 'Il pettegolezzo sulla vostra giocata (' || g.zone_name || ') è stato approvato: ora è tra le voci che girano.'
    else 'Il pettegolezzo sulla vostra giocata (' || g.zone_name || ') non è stato approvato.' end;

  -- risposta nel ticket e chiusura
  if g.ticket_id is not null then
    insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
      values (g.ticket_id, auth.uid(), v_master, true,
              '<p>' || replace(replace(v_msg, '<', '&lt;'), '>', '&gt;') || '</p>'
              || case when p_approve then '<p><em>' || replace(replace(replace(trim(p_text), '&', '&amp;'), '<', '&lt;'), E'\n', '<br>') || '</em></p>' else '' end);
    update public.tickets set status = 'chiuso', last_message_at = now(), last_author_name = v_master where id = g.ticket_id;
  end if;

  -- avviso di SISTEMA a chi ha giocato
  foreach v_pg in array (g.participants || g.character_id) loop
    perform public.send_system_message(v_pg, v_msg);
  end loop;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['gossip_roll(uuid)', 'gossip_report(uuid, text, uuid, uuid, uuid[])', 'gossip_review(uuid, boolean, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
