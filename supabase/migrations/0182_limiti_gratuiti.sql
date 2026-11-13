-- =====================================================================
-- 0182 - Restare nei limiti gratuiti di Supabase
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- 1. I lavori automatici che giravano ogni minuto (arrivi dei viaggi, corvi
--    per i castellani) girano ogni 5 minuti: meno righe nello storico e meno log.
--    Chi arriva da un viaggio non aspetta: il pannello Viaggio chiude subito i
--    suoi viaggi arrivati (finish_my_travels).
-- 2. Lo storico dei lavori automatici (cron.job_run_details) non cresceva mai:
--    ogni giorno si tolgono le righe piu' vecchie di 7 giorni.
-- 3. Le azioni delle chat piu' vecchie di 6 mesi si cancellano ogni notte.
--    In chat se ne vede comunque solo l'ultima ora; le giocate salvate
--    nell'archivio dei giocatori sono a parte e restano.
-- =====================================================================

-- I propri viaggi gia' arrivati si chiudono subito (senza aspettare il lavoro
-- automatico): lo chiama il pannello Viaggio all'ora di arrivo
create or replace function public.finish_my_travels()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  t record;
begin
  if auth.uid() is null then return; end if;
  for t in
    select tr.*, l.name as to_name
      from public.travels tr
      join public.locations l on l.id = tr.to_location
      join public.characters c on c.id = tr.character_id
     where tr.status = 'in_viaggio' and tr.arrive_at <= now()
       and c.owner_id = auth.uid()
     for update of tr skip locked -- il lavoro automatico potrebbe chiuderlo nello stesso momento
  loop
    update public.characters set location_id = t.to_location where id = t.character_id;
    update public.travels set status = 'arrivato' where id = t.id;
    perform public.send_system_message(t.character_id, 'Sei arrivato a ' || t.to_name || '. Da ora ti trovi qui: corvi, staffette e paggi ti cercheranno in questo luogo.');
  end loop;
end;
$$;
revoke execute on function public.finish_my_travels() from public, anon;
grant execute on function public.finish_my_travels() to authenticated;

-- Il lavoro automatico non deve chiudere due volte un viaggio che il giocatore
-- sta chiudendo in quello stesso istante
create or replace function public.finish_travels()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  t record;
begin
  for t in
    select tr.*, l.name as to_name from public.travels tr join public.locations l on l.id = tr.to_location
    where tr.status = 'in_viaggio' and tr.arrive_at <= now()
    for update of tr skip locked
  loop
    update public.characters set location_id = t.to_location where id = t.character_id;
    update public.travels set status = 'arrivato' where id = t.id;
    perform public.send_system_message(t.character_id, 'Sei arrivato a ' || t.to_name || '. Da ora ti trovi qui: corvi, staffette e paggi ti cercheranno in questo luogo.');
  end loop;
end;
$$;
revoke execute on function public.finish_travels() from public, anon, authenticated;

-- Pulizia notturna delle azioni delle chat piu' vecchie di 6 mesi
create or replace function public.purge_old_chat_messages()
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.messages where created_at < now() - interval '6 months';
$$;
revoke execute on function public.purge_old_chat_messages() from public, anon, authenticated;

-- Lavori automatici: stesso nome = si aggiorna quello che c'era
select cron.schedule('arrivi-viaggi', '*/5 * * * *', 'select public.finish_travels()');
select cron.schedule('corvi-castellani', '*/5 * * * *', 'select public.notify_castle_ravens()');
select cron.schedule('pulizia-messaggi-chat', '40 3 * * *', 'select public.purge_old_chat_messages()');
select cron.schedule('pulizia-storico-lavori', '50 3 * * *',
  $c$delete from cron.job_run_details where end_time < now() - interval '7 days'$c$);
