-- =====================================================================
-- 0063 - Ticket: ogni risposta avvisa tutti gli altri partecipanti
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Prima avvisavano solo le risposte dello staff. Ora qualunque risposta
-- (di staff o giocatori) e i tiri di dado fanno lampeggiare l'icona dei
-- ticket a tutti gli altri partecipanti, finche' non aprono il ticket; chi
-- risponde scrivendo manda anche un messaggio di SISTEMA agli altri.
-- Chi viene incluso in un ticket appena aperto viene avvisato allo stesso modo.
-- Lo staff che non partecipa al ticket viene avvisato con il lampeggio.
-- =====================================================================

-- Da leggere: qualunque messaggio scritto da altri dopo la mia ultima lettura
create or replace function public.ticket_unread_ids()
returns setof uuid
language sql stable
security definer set search_path = ''
as $$
  select tp.ticket_id from public.ticket_participants tp
  join public.characters c on c.id = tp.character_id and c.owner_id = auth.uid()
  where exists (
    select 1 from public.ticket_messages m
    where m.ticket_id = tp.ticket_id and m.author_id is distinct from auth.uid() and m.created_at > tp.last_read_at
  )
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

-- Avviso di SISTEMA ai PG del ticket che non sono di chi scrive
create or replace function public.ticket_notify_others(p_ticket uuid, p_text text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare v_pg uuid;
begin
  for v_pg in
    select tp.character_id from public.ticket_participants tp
    join public.characters c on c.id = tp.character_id
    where tp.ticket_id = p_ticket and c.owner_id is distinct from auth.uid()
  loop
    perform public.send_system_message(v_pg, p_text);
  end loop;
end;
$$;
revoke execute on function public.ticket_notify_others(uuid, text) from public, anon, authenticated;

-- Aprire un ticket: chi viene incluso lo trova da leggere e riceve l'avviso
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

  -- chi apre ha letto; gli altri PG inclusi no
  insert into public.ticket_participants (ticket_id, character_id, last_read_at)
  select v_id, c.id, case when c.id = p_character then now() else '-infinity'::timestamptz end
  from public.characters c
  where c.id = p_character or c.id = any(coalesce(p_others, '{}'))
  on conflict do nothing;

  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
  values (v_id, auth.uid(), v_name, false, p_body);

  perform public.ticket_notify_others(v_id, v_name || ' ti ha incluso nel ticket «' || trim(p_title) || '». Lo trovi tra i ticket (icona dei ticket).');
  return v_id;
end;
$$;

-- Rispondere: avvisa tutti gli altri partecipanti
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

  -- avviso di SISTEMA a tutti gli altri partecipanti
  perform public.ticket_notify_others(p_ticket,
    case when v_participant then v_name || ' ha risposto al ticket «' else 'Lo staff ha risposto al ticket «' end
    || v_ticket.title || '». Lo trovi tra i ticket (icona dei ticket).');

  -- chi risponde ha letto
  if v_participant then
    update public.ticket_participants tp set last_read_at = now()
    from public.characters c where c.id = tp.character_id and tp.ticket_id = p_ticket and c.owner_id = auth.uid();
  else
    insert into public.ticket_staff_reads (ticket_id, user_id, last_read_at) values (p_ticket, auth.uid(), now())
    on conflict (ticket_id, user_id) do update set last_read_at = now();
  end if;
end;
$$;
