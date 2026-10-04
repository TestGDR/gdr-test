-- =====================================================================
-- 0046 - Ticket (Help Desk)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un ticket e' una conversazione privata tra uno o piu' PG e lo staff.
-- Stati: attesa -> in_carico -> sospeso / chiuso (sospesi e chiusi
-- finiscono nell'archivio). Lo staff ha il permesso "ticket.gestire".
-- Quando lo staff risponde arriva un messaggio di SISTEMA ai PG del ticket.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sezioni (con le istruzioni mostrate quando si apre un ticket)
-- ---------------------------------------------------------------------
create table public.ticket_sections (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (char_length(name) between 1 and 60),
  instructions  text not null default '',
  sort_order    int not null default 0,
  active        boolean not null default true
);
alter table public.ticket_sections enable row level security;
create policy "sezioni visibili" on public.ticket_sections for select to authenticated using (true);
create policy "sezioni gestite dallo staff" on public.ticket_sections for all to authenticated
  using (public.has_permission('ticket.gestire')) with check (public.has_permission('ticket.gestire'));
grant select, insert, update, delete on public.ticket_sections to authenticated;

insert into public.ticket_sections (name, sort_order, instructions) values
  ('Approvazione PG', 1, $t$Usa questa sezione quando la scheda del tuo personaggio è completa e vuoi chiederne l'approvazione.

Nel testo indica:
- il nome del personaggio;
- la casata scelta e il ruolo che vorresti avere;
- eventuali dubbi sul background.

Lo staff controllerà la scheda e ti risponderà qui.$t$),
  ('Proposta di gioco', 2, $t$Hai un'idea per una giocata, una quest o una trama con PNG?

Descrivi:
- l'idea in poche righe;
- i personaggi coinvolti (puoi includerli nel ticket);
- quando vorreste giocare.$t$),
  ('Segnalazione', 3, $t$Per segnalare comportamenti scorretti, violazioni del regolamento o problemi tra giocatori.

Indica chi è coinvolto, dove e quando è successo (chat, data e ora). Se puoi, riporta il testo dei messaggi.
Le segnalazioni restano riservate tra te e lo staff.$t$),
  ('Domande sul regolamento', 4, $t$Dubbi sul regolamento, sul sistema di gioco o sull'ambientazione.

Prima di scrivere dai un'occhiata al Manuale di Gioco e all'Ambientazione: molte risposte sono già lì.$t$),
  ('Problemi tecnici', 5, $t$Qualcosa nel sito non funziona?

Descrivi cosa stavi facendo, cosa ti aspettavi e cosa è successo invece. Indica anche se usi computer o cellulare e quale browser.$t$),
  ('Altro', 6, $t$Per tutto ciò che non rientra nelle altre sezioni.$t$);

-- ---------------------------------------------------------------------
-- Ticket, partecipanti, messaggi
-- ---------------------------------------------------------------------
create table public.tickets (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(title) between 1 and 120),
  section_id         uuid references public.ticket_sections(id) on delete set null,
  opener_character   uuid references public.characters(id) on delete set null,
  opener_name        text not null,
  status             text not null default 'attesa' check (status in ('attesa', 'in_carico', 'sospeso', 'chiuso')),
  assigned_to        uuid references public.profiles(id) on delete set null,
  assigned_name      text,
  created_at         timestamptz not null default now(),
  last_message_at    timestamptz not null default now(),
  last_author_name   text not null default ''
);
create index tickets_last_idx on public.tickets(last_message_at desc);

create table public.ticket_participants (
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  character_id  uuid not null references public.characters(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (ticket_id, character_id)
);
create index ticket_participants_character_idx on public.ticket_participants(character_id);

create table public.ticket_messages (
  id           bigint generated always as identity primary key,
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  author_name  text not null,
  from_staff   boolean not null default false,
  body         text not null check (char_length(body) between 1 and 20000), -- HTML dell'editor
  created_at   timestamptz not null default now()
);
create index ticket_messages_ticket_idx on public.ticket_messages(ticket_id, created_at);

-- lettura dello staff (per i ticket in cui non e' partecipante)
create table public.ticket_staff_reads (
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

-- Sono partecipante (con uno dei miei PG)?
create or replace function public.is_ticket_participant(p_ticket uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ticket_participants tp
    join public.characters c on c.id = tp.character_id
    where tp.ticket_id = p_ticket and c.owner_id = auth.uid()
  );
$$;

create or replace function public.can_see_ticket(p_ticket uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.is_ticket_participant(p_ticket) or public.has_permission('ticket.gestire');
$$;

alter table public.tickets enable row level security;
alter table public.ticket_participants enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_staff_reads enable row level security;

create policy "vedi i tuoi ticket" on public.tickets for select to authenticated using (public.can_see_ticket(id));
create policy "vedi i partecipanti" on public.ticket_participants for select to authenticated using (public.can_see_ticket(ticket_id));
create policy "vedi i messaggi" on public.ticket_messages for select to authenticated using (public.can_see_ticket(ticket_id));
create policy "la mia lettura" on public.ticket_staff_reads for select to authenticated using (user_id = auth.uid());

-- si scrive solo con le funzioni qui sotto
grant select on public.tickets, public.ticket_participants, public.ticket_messages, public.ticket_staff_reads to authenticated;
grant select, insert, update, delete on public.ticket_sections, public.tickets, public.ticket_participants, public.ticket_messages, public.ticket_staff_reads to service_role;

-- Nome con cui firma lo staff: il suo personaggio principale, altrimenti il nome utente
create or replace function public.staff_display_name()
returns text
language sql stable
security definer set search_path = ''
as $$
  select coalesce(
    (select c.name from public.characters c where c.owner_id = auth.uid() order by c.created_at limit 1),
    (select p.username from public.profiles p where p.id = auth.uid()),
    'Staff');
$$;

-- ---------------------------------------------------------------------
-- Aprire un ticket
-- ---------------------------------------------------------------------
create or replace function public.open_ticket(p_character uuid, p_title text, p_section uuid, p_body text, p_others uuid[])
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.is_my_character(p_character) then raise exception 'Personaggio non valido'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Titolo non valido'; end if;
  if char_length(coalesce(p_body, '')) not between 1 and 20000 then raise exception 'Testo non valido'; end if;
  if not exists (select 1 from public.ticket_sections where id = p_section and active) then raise exception 'Sezione non valida'; end if;
  select name into v_name from public.characters where id = p_character;

  insert into public.tickets (title, section_id, opener_character, opener_name, last_author_name)
  values (trim(p_title), p_section, p_character, v_name, v_name)
  returning id into v_id;

  insert into public.ticket_participants (ticket_id, character_id)
  select v_id, c.id from public.characters c
  where c.id = p_character or c.id = any(coalesce(p_others, '{}'))
  on conflict do nothing;

  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
  values (v_id, auth.uid(), v_name, false, p_body);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Rispondere: i partecipanti (se il ticket non e' chiuso) e lo staff
-- ---------------------------------------------------------------------
create or replace function public.reply_ticket(p_ticket uuid, p_body text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_participant boolean := public.is_ticket_participant(p_ticket);
  v_staff boolean := public.has_permission('ticket.gestire');
  v_ticket public.tickets;
  v_name text;
  v_pg uuid;
begin
  select * into v_ticket from public.tickets where id = p_ticket;
  if v_ticket.id is null or not (v_participant or v_staff) then raise exception 'Ticket non trovato'; end if;
  if char_length(coalesce(p_body, '')) not between 1 and 20000 then raise exception 'Testo non valido'; end if;
  if v_ticket.status = 'chiuso' and not v_staff then raise exception 'Il ticket e'' chiuso'; end if;

  if v_participant then
    select c.name into v_name from public.ticket_participants tp
      join public.characters c on c.id = tp.character_id
      where tp.ticket_id = p_ticket and c.owner_id = auth.uid() limit 1;
  else
    v_name := public.staff_display_name();
  end if;

  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
  values (p_ticket, auth.uid(), v_name, not v_participant, p_body);

  update public.tickets set
    last_message_at = now(),
    last_author_name = v_name,
    -- la prima risposta dello staff prende in carico il ticket
    status = case when not v_participant and status = 'attesa' then 'in_carico' else status end,
    assigned_to = case when not v_participant and assigned_to is null then auth.uid() else assigned_to end,
    assigned_name = case when not v_participant and assigned_to is null then v_name else assigned_name end
  where id = p_ticket;

  -- risposta dello staff: avviso di SISTEMA a ogni PG del ticket
  if not v_participant then
    for v_pg in select character_id from public.ticket_participants where ticket_id = p_ticket loop
      perform public.send_system_message(v_pg, 'Lo staff ha risposto al tuo ticket «' || v_ticket.title || '». Lo trovi nell''Help Desk (icona dei ticket).');
    end loop;
    -- chi risponde ha letto
    insert into public.ticket_staff_reads (ticket_id, user_id, last_read_at) values (p_ticket, auth.uid(), now())
    on conflict (ticket_id, user_id) do update set last_read_at = now();
  else
    update public.ticket_participants tp set last_read_at = now()
    from public.characters c where c.id = tp.character_id and tp.ticket_id = p_ticket and c.owner_id = auth.uid();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Stato (solo staff): in carico, sospeso, chiuso, riaperto
-- ---------------------------------------------------------------------
create or replace function public.set_ticket_status(p_ticket uuid, p_status text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('ticket.gestire') then raise exception 'Permesso negato'; end if;
  if p_status not in ('attesa', 'in_carico', 'sospeso', 'chiuso') then raise exception 'Stato non valido'; end if;
  update public.tickets set
    status = p_status,
    assigned_to = case when p_status = 'in_carico' then auth.uid() else assigned_to end,
    assigned_name = case when p_status = 'in_carico' then public.staff_display_name() else assigned_name end
  where id = p_ticket;
end;
$$;

-- ---------------------------------------------------------------------
-- Letto (apertura del ticket)
-- ---------------------------------------------------------------------
create or replace function public.mark_ticket_read(p_ticket uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.is_ticket_participant(p_ticket) then
    update public.ticket_participants tp set last_read_at = now()
    from public.characters c where c.id = tp.character_id and tp.ticket_id = p_ticket and c.owner_id = auth.uid();
  elsif public.has_permission('ticket.gestire') then
    insert into public.ticket_staff_reads (ticket_id, user_id, last_read_at) values (p_ticket, auth.uid(), now())
    on conflict (ticket_id, user_id) do update set last_read_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Da leggere (per far lampeggiare l'icona) e quali ticket
-- utente: risposte dello staff non lette; staff: messaggi degli utenti non letti
-- ---------------------------------------------------------------------
create or replace function public.ticket_unread_ids()
returns setof uuid
language sql stable
security definer set search_path = ''
as $$
  select tp.ticket_id from public.ticket_participants tp
  join public.characters c on c.id = tp.character_id and c.owner_id = auth.uid()
  where exists (select 1 from public.ticket_messages m where m.ticket_id = tp.ticket_id and m.from_staff and m.created_at > tp.last_read_at)
  union
  select t.id from public.tickets t
  where public.has_permission('ticket.gestire')
    and t.status <> 'chiuso'
    and not public.is_ticket_participant(t.id)
    and exists (
      select 1 from public.ticket_messages m
      where m.ticket_id = t.id and not m.from_staff
        and m.created_at > coalesce((select r.last_read_at from public.ticket_staff_reads r where r.ticket_id = t.id and r.user_id = auth.uid()), '-infinity'::timestamptz)
    );
$$;

revoke execute on function public.open_ticket(uuid, text, uuid, text, uuid[]) from public, anon;
revoke execute on function public.reply_ticket(uuid, text) from public, anon;
revoke execute on function public.set_ticket_status(uuid, text) from public, anon;
revoke execute on function public.mark_ticket_read(uuid) from public, anon;
revoke execute on function public.ticket_unread_ids() from public, anon;
grant execute on function public.open_ticket(uuid, text, uuid, text, uuid[]) to authenticated;
grant execute on function public.reply_ticket(uuid, text) to authenticated;
grant execute on function public.set_ticket_status(uuid, text) to authenticated;
grant execute on function public.mark_ticket_read(uuid) to authenticated;
grant execute on function public.ticket_unread_ids() to authenticated;

-- Il Moderatore gestisce i ticket (l'admin ha gia' tutti i permessi)
update public.staff_roles set permissions = array_append(permissions, 'ticket.gestire')
where name = 'Moderatore' and not ('ticket.gestire' = any(permissions));

-- Tempo reale
alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_messages;
