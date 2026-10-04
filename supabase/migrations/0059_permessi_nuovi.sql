-- =====================================================================
-- 0059 - Permessi per le funzioni nuove (Ruoli & Permessi)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Funzioni che prima usavano un permesso "in prestito" o erano solo
-- dell'admin ora hanno il loro permesso, da spuntare nei ruoli:
--   viaggi.gestire      Gestione -> Viaggi (percorsi, rotte dei corvi, missive, posizioni)   prima: mondo.gestire
--   meteo.gestire       Gestione -> Meteo                                                    prima: mondo.gestire
--   ticket.categorie    Categorie dei ticket                                                 prima: solo admin
--   messaggi.tutti      Messaggi OFF a tutti i giocatori                                     prima: annunci.globali
--   missive.castello    Archivio messaggi castello + avvisi dei corvi arrivati               prima: solo admin
--   missive.parti_da    "Parti da" quando si scrive un cartiglio                             prima: qualsiasi ruolo staff
--   ricerca.moderare    Togliere le ricerche gioco degli altri                               prima: chat.moderare
--   assenze.gestire     Togliere le assenze degli altri                                      prima: utenti.gestire
-- Chi faceva gia' queste cose riceve subito il permesso nuovo (l'admin li ha tutti).
-- =====================================================================

-- ---------------------------------------------------------------------
-- I ruoli che le usavano tengono le stesse possibilita'
-- ---------------------------------------------------------------------
create or replace function pg_temp.add_perm(p_new text, p_if text)
returns void language sql as $$
  update public.staff_roles set permissions = array_append(permissions, p_new)
  where (p_if is null or p_if = any(permissions)) and not (p_new = any(permissions))
    and (p_if is not null or system_key is null);
$$;
select pg_temp.add_perm('viaggi.gestire', 'mondo.gestire');
select pg_temp.add_perm('meteo.gestire', 'mondo.gestire');
select pg_temp.add_perm('messaggi.tutti', 'annunci.globali');
select pg_temp.add_perm('ricerca.moderare', 'chat.moderare');
select pg_temp.add_perm('assenze.gestire', 'utenti.gestire');
select pg_temp.add_perm('missive.parti_da', null); -- tutti i ruoli staff (non il ruolo "Giocatore")

-- ---------------------------------------------------------------------
-- Viaggi e missive
-- ---------------------------------------------------------------------
drop policy if exists "percorsi dello staff" on public.travel_routes;
create policy "percorsi dello staff" on public.travel_routes for all to authenticated
  using (public.has_permission('viaggi.gestire')) with check (public.has_permission('viaggi.gestire'));

drop policy if exists "impostazioni dello staff" on public.missive_settings;
create policy "impostazioni dello staff" on public.missive_settings for update to authenticated
  using (public.has_permission('viaggi.gestire') or public.has_permission('mondo.gestire'))
  with check (public.has_permission('viaggi.gestire') or public.has_permission('mondo.gestire'));

drop policy if exists "i miei viaggi" on public.travels;
create policy "i miei viaggi" on public.travels for select to authenticated
  using (public.is_my_character(character_id) or public.has_permission('viaggi.gestire'));

create or replace function public.staff_set_position(p_character uuid, p_location uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('viaggi.gestire') then raise exception 'Permesso negato'; end if;
  update public.characters set location_id = p_location where id = p_character;
end;
$$;

-- "Parti da": chi ha il permesso sceglie il luogo da cui parte il cartiglio
create or replace function public.scroll_origin(p_from_location uuid)
returns uuid
language sql stable
security definer set search_path = ''
as $$
  select case when public.has_permission('missive.parti_da')
                   and exists (select 1 from public.locations where id = p_from_location and in_game and kind = 'luogo')
              then p_from_location end;
$$;

-- Archivio messaggi castello
create or replace function public.castle_archive()
returns table (id bigint, sender_name text, recipient_name text, signed boolean, from_name text, to_name text,
               created_at timestamptz, deliver_at timestamptz, body text)
language plpgsql stable
security definer set search_path = ''
as $$
begin
  if not public.has_permission('missive.castello') then raise exception 'Permesso negato'; end if;
  return query
    select s.id, s.sender_name, s.recipient_name, s.signed, lf.name, lt.name, s.created_at, s.deliver_at, s.body
    from public.scrolls s
    left join public.locations lf on lf.id = s.from_location
    left join public.locations lt on lt.id = s.to_location
    where s.method = 'corvo' and not s.intercepted and s.deliver_at <= now()
    order by s.deliver_at desc
    limit 1000;
end;
$$;

-- Corvi arrivati: avviso di SISTEMA a chi ha "missive.castello" (e agli admin)
create or replace function public.notify_castle_ravens()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  sc record;
  who uuid;
begin
  for sc in
    select s.*, lf.name as from_name, lt.name as to_name
    from public.scrolls s
    left join public.locations lf on lf.id = s.from_location
    left join public.locations lt on lt.id = s.to_location
    where s.method = 'corvo' and not s.castle_notified and not s.intercepted and s.deliver_at <= now()
    order by s.deliver_at
    limit 200
  loop
    for who in
      select (select c.id from public.characters c where c.owner_id = p.id order by c.created_at limit 1)
      from public.profiles p
      left join public.staff_roles r on r.id = p.staff_role_id
      where p.role = 'admin' or 'missive.castello' = any(coalesce(r.permissions, '{}'))
    loop
      if who is not null then
        perform public.send_system_message(who,
          'I castellani di ' || coalesce(sc.to_name, '?') || ' hanno letto un cartiglio giunto con un corvo da ' || coalesce(sc.from_name, '?') || '.' || chr(10) ||
          'Da: ' || sc.sender_name || case when sc.signed then '' else ' (non firmato)' end || chr(10) ||
          'Per: ' || sc.recipient_name || chr(10) || chr(10) ||
          sc.body || chr(10) || chr(10) ||
          'Lo trovi anche nelle missive, in "Archivio messaggi castello".');
      end if;
    end loop;
    update public.scrolls set castle_notified = true where id = sc.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Ticket: categorie
-- ---------------------------------------------------------------------
drop policy if exists "sezioni gestite dallo staff" on public.ticket_sections;
drop policy if exists "categorie gestite dall'admin" on public.ticket_sections;
create policy "categorie con permesso" on public.ticket_sections for all to authenticated
  using (public.has_permission('ticket.categorie')) with check (public.has_permission('ticket.categorie'));

-- ---------------------------------------------------------------------
-- Messaggi OFF a tutti
-- ---------------------------------------------------------------------
drop policy if exists "scrive chi ha il permesso" on public.off_broadcasts;
drop policy if exists "elimina chi ha il permesso" on public.off_broadcasts;
create policy "scrive chi ha il permesso" on public.off_broadcasts for insert to authenticated
  with check (public.has_permission('messaggi.tutti') and public.is_my_character(sender_id));
create policy "elimina chi ha il permesso" on public.off_broadcasts for delete to authenticated
  using (public.has_permission('messaggi.tutti'));

-- ---------------------------------------------------------------------
-- Ricerca gioco e assenze
-- ---------------------------------------------------------------------
drop policy if exists "togli le tue o modera" on public.play_requests;
create policy "togli le tue o modera" on public.play_requests for delete to authenticated
  using (author_id = auth.uid() or public.has_permission('ricerca.moderare'));

drop policy if exists "togli le tue o lo staff" on public.absences;
create policy "togli le tue o lo staff" on public.absences for delete to authenticated
  using (author_id = auth.uid() or public.has_permission('assenze.gestire'));

-- ---------------------------------------------------------------------
-- Meteo
-- ---------------------------------------------------------------------
drop policy if exists "regioni visibili" on public.weather_regions;
drop policy if exists "regioni con permesso" on public.weather_regions;
drop policy if exists "stagione con permesso" on public.weather_settings;
drop policy if exists "semi con permesso" on public.weather_seeds;
create policy "regioni visibili" on public.weather_regions for select to authenticated
  using (active or public.has_permission('meteo.gestire') or public.has_permission('mondo.gestire'));
create policy "regioni con permesso" on public.weather_regions for all to authenticated
  using (public.has_permission('meteo.gestire')) with check (public.has_permission('meteo.gestire'));
create policy "stagione con permesso" on public.weather_settings for update to authenticated
  using (public.has_permission('meteo.gestire')) with check (public.has_permission('meteo.gestire'));
create policy "semi con permesso" on public.weather_seeds for all to authenticated
  using (public.has_permission('meteo.gestire')) with check (public.has_permission('meteo.gestire'));

create or replace function public.weather_regenerate(p_region uuid)
returns public.weather_days
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('meteo.gestire') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  delete from public.weather_days where region_id = p_region and day = (now() at time zone 'Europe/Rome')::date;
  return public.weather_today(p_region);
end;
$$;
