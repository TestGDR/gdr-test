-- =====================================================================
-- 0081 - Pettegolezzi: 70% di essere notati, risultato del dado nascosto
-- Eseguire in Supabase DOPO la 0080: SQL Editor -> New query -> incolla -> Run
--
-- - d20, notati con 7 o piu' (14 risultati su 20 = 70%).
-- - Il giocatore sa solo se e' stato notato o no: il numero uscito non
--   compare nel pannello, nel ticket, ne' interrogando il database.
--   Lo vedono solo i master (permesso "pettegolezzi.gestire").
-- =====================================================================

update public.gossip_settings set die_sides = 20, seen_from = 7;
alter table public.gossip_settings alter column seen_from set default 7;

-- I tiri (con il numero) li leggono solo i master
drop policy if exists "i miei tiri" on public.gossip_rolls;
drop policy if exists "tiri ai master" on public.gossip_rolls;
create policy "tiri ai master" on public.gossip_rolls for select to authenticated
  using (public.has_permission('pettegolezzi.gestire'));

-- Il tiro restituisce solo se si e' stati notati
drop function if exists public.gossip_roll(uuid);
create function public.gossip_roll(p_character uuid)
returns table (id uuid, seen boolean)
language plpgsql
security definer set search_path = ''
as $$
declare
  s public.gossip_settings;
  v_roll int;
  v_id uuid;
begin
  if not exists (select 1 from public.characters c where c.id = p_character and c.owner_id = auth.uid() and c.status = 'attivo') then
    raise exception 'Serve un personaggio attivo.' using errcode = 'P0001';
  end if;
  select * into s from public.gossip_settings;
  v_roll := 1 + floor(random() * s.die_sides)::int;
  insert into public.gossip_rolls (character_id, user_id, roll, sides, seen)
    values (p_character, auth.uid(), v_roll, s.die_sides, v_roll >= s.seen_from)
    returning gossip_rolls.id into v_id;
  return query select v_id, v_roll >= s.seen_from;
end;
$$;

-- Tiro "notati" ancora senza pettegolezzo (degli ultimi 2 giorni)
create or replace function public.gossip_pending(p_character uuid)
returns uuid
language sql stable
security definer set search_path = ''
as $$
  select r.id from public.gossip_rolls r
  where r.character_id = p_character and public.is_my_character(p_character)
    and r.seen and r.created_at > now() - interval '2 days'
    and not exists (select 1 from public.gossip_reports g where g.roll_id = r.id)
  order by r.created_at desc
  limit 1;
$$;

-- Ticket senza il numero del dado
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
    '<p><strong>Pettegolezzo di fine giocata</strong>: i personaggi sono stati notati.</p>'
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

do $$
declare f text;
begin
  foreach f in array array['gossip_roll(uuid)', 'gossip_pending(uuid)', 'gossip_report(uuid, text, uuid, uuid, uuid[])'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
