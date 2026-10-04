-- =====================================================================
-- 0049 - Ticket: tiro di dadi (d10, d20, d100)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il risultato lo decide il database (nessuno puo' truccarlo dal browser)
-- e diventa un messaggio del ticket, visibile a tutti i partecipanti.
-- =====================================================================

alter table public.ticket_messages
  add column roll_sides  int check (roll_sides in (10, 20, 100)),
  add column roll_result int;

create or replace function public.roll_ticket_dice(p_ticket uuid, p_sides int)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_participant boolean := public.is_ticket_participant(p_ticket);
  v_staff boolean := public.has_permission('ticket.gestire');
  v_ticket public.tickets;
  v_name text;
  v_result int;
begin
  if p_sides not in (10, 20, 100) then raise exception 'Dado non valido'; end if;
  select * into v_ticket from public.tickets where id = p_ticket;
  if v_ticket.id is null or not (v_participant or v_staff) then raise exception 'Ticket non trovato'; end if;
  if v_ticket.status = 'chiuso' and not v_staff then raise exception 'Il ticket e'' chiuso'; end if;

  if v_participant then
    select c.name into v_name from public.ticket_participants tp
      join public.characters c on c.id = tp.character_id
      where tp.ticket_id = p_ticket and c.owner_id = auth.uid() limit 1;
  else
    v_name := public.staff_display_name();
  end if;

  v_result := 1 + floor(random() * p_sides)::int;

  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body, roll_sides, roll_result)
  values (p_ticket, auth.uid(), v_name, not v_participant,
          v_name || ' ha tirato un d' || p_sides || ': ' || v_result, p_sides, v_result);

  update public.tickets set last_message_at = now(), last_author_name = v_name where id = p_ticket;

  -- chi tira ha letto
  if v_participant then
    update public.ticket_participants tp set last_read_at = now()
    from public.characters c where c.id = tp.character_id and tp.ticket_id = p_ticket and c.owner_id = auth.uid();
  else
    insert into public.ticket_staff_reads (ticket_id, user_id, last_read_at) values (p_ticket, auth.uid(), now())
    on conflict (ticket_id, user_id) do update set last_read_at = now();
  end if;
  return v_result;
end;
$$;

revoke execute on function public.roll_ticket_dice(uuid, int) from public, anon;
grant execute on function public.roll_ticket_dice(uuid, int) to authenticated;
