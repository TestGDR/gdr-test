-- =====================================================================
-- 0047 - Ticket: il messaggio di SISTEMA non parla piu' di "Help Desk"
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

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
      perform public.send_system_message(v_pg, 'Lo staff ha risposto al tuo ticket «' || v_ticket.title || '». Lo trovi tra i ticket (icona dei ticket).');
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
