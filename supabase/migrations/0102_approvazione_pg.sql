-- =====================================================================
-- 0102 - Approvazione dei personaggi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Alla fine della creazione il giocatore "invia in approvazione": il PG
--   passa allo stato "revisione" (bloccato, non gioca) e si apre un ticket
--   nella sezione "Approvazione PG".
-- - Lo staff con il permesso "schede.approvare" (admin sempre) controlla le
--   scelte dalla scheda del PG e preme "Sblocca e conferma" (il PG diventa
--   attivo) oppure "Rimanda" (il PG torna in creazione, con le scelte gia'
--   fatte, e il giocatore puo' correggerle e rimandarle).
-- - L'admin puo' resettare un PG: torna in creazione da capo.
-- =====================================================================

alter table public.characters drop constraint if exists characters_status_check;
alter table public.characters add constraint characters_status_check
  check (status in ('bozza', 'revisione', 'attivo'));
alter table public.characters add column if not exists review_ticket_id uuid references public.tickets (id) on delete set null;

insert into public.ticket_sections (name, sort_order, instructions)
select 'Approvazione PG', 1, 'Le richieste di approvazione dei personaggi arrivano qui da sole alla fine della creazione.'
where not exists (select 1 from public.ticket_sections where name = 'Approvazione PG');

-- Lo staff che approva legge la bozza della creazione
drop policy if exists "bozze lette da chi approva" on public.character_drafts;
create policy "bozze lette da chi approva" on public.character_drafts for select to authenticated
  using (public.has_permission('schede.approvare'));

-- ---------------------------------------------------------------------
-- Il giocatore invia il PG in approvazione (le scelte le ha gia' controllate
-- il server): si apre il ticket e il PG resta bloccato
-- ---------------------------------------------------------------------
create or replace function public.submit_character(p_character uuid, p_body text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  c public.characters;
  v_section uuid;
  v_ticket uuid;
begin
  select * into c from public.characters where id = p_character for update;
  if c.id is null or c.owner_id is distinct from auth.uid() then raise exception 'Personaggio non trovato.' using errcode = '42501'; end if;
  if c.status <> 'bozza' then raise exception 'Il personaggio è già stato inviato in approvazione.' using errcode = 'P0001'; end if;

  select id into v_section from public.ticket_sections where name = 'Approvazione PG' order by sort_order limit 1;
  if v_ticket is null and c.review_ticket_id is not null
     and exists (select 1 from public.tickets where id = c.review_ticket_id) then
    -- rimandato e corretto: si continua nello stesso ticket
    v_ticket := c.review_ticket_id;
    insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
      values (v_ticket, auth.uid(), c.name, false, p_body);
    update public.tickets set status = 'attesa', last_message_at = now(), last_author_name = c.name where id = v_ticket;
  else
    v_ticket := public.open_ticket(p_character, 'Approvazione PG: ' || left(c.name, 90), v_section, p_body, '{}');
  end if;

  update public.characters set status = 'revisione', review_ticket_id = v_ticket where id = p_character;
  return v_ticket;
end;
$$;
revoke execute on function public.submit_character(uuid, text) from public, anon;
grant execute on function public.submit_character(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Lo staff rimanda il PG in creazione (con una nota per il giocatore)
-- ---------------------------------------------------------------------
create or replace function public.review_send_back(p_character uuid, p_note text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  c public.characters;
  v_staff text;
  v_note text := trim(coalesce(p_note, ''));
begin
  if not public.has_permission('schede.approvare') then raise exception 'Permesso negato.' using errcode = '42501'; end if;
  select * into c from public.characters where id = p_character for update;
  if c.id is null or c.status <> 'revisione' then raise exception 'Il personaggio non è in approvazione.' using errcode = 'P0001'; end if;
  select coalesce((select username from public.profiles where id = auth.uid()), 'Staff') into v_staff;

  update public.characters set status = 'bozza' where id = p_character;
  if c.review_ticket_id is not null then
    insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
      values (c.review_ticket_id, auth.uid(), v_staff, true,
              '<p><strong>Personaggio rimandato in creazione.</strong> Correggi le scelte e invialo di nuovo.</p>'
              || case when v_note <> '' then '<p>' || replace(replace(replace(v_note, '&', '&amp;'), '<', '&lt;'), E'\n', '<br>') || '</p>' else '' end);
    update public.tickets set status = 'in_carico', last_message_at = now(), last_author_name = v_staff where id = c.review_ticket_id;
  end if;
  perform public.send_system_message(p_character,
    'Il tuo personaggio è stato rimandato in creazione: correggi le scelte e invialo di nuovo in approvazione.'
    || case when v_note <> '' then ' Nota dello staff: ' || v_note else '' end);
end;
$$;
revoke execute on function public.review_send_back(uuid, text) from public, anon;
grant execute on function public.review_send_back(uuid, text) to authenticated;
