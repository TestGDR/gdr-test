-- =====================================================================
-- 0039 - Ricerca gioco con giorno, ora di inizio e ora di fine
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni richiesta ha inizio e fine previsti della giocata. Finita la
-- giocata (passata l'ora di fine) la richiesta si elimina da sola:
-- un controllo automatico ogni 5 minuti.
-- =====================================================================

-- le richieste di prova fatte col vecchio formato non servono
delete from public.play_requests;

alter table public.play_requests drop constraint if exists play_requests_check;
alter table public.play_requests drop column expires_at;
alter table public.play_requests
  add column starts_at timestamptz not null,
  add column ends_at   timestamptz not null,
  add constraint play_requests_orari check (
    ends_at > starts_at
    and ends_at <= starts_at + interval '24 hours'
    and ends_at > created_at
    and starts_at <= created_at + interval '60 days'
  );
create index play_requests_ends_idx on public.play_requests(ends_at);

-- Pulizia automatica delle giocate finite
create or replace function public.purge_ended_play_requests()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.play_requests where ends_at < now();
$$;
revoke all on function public.purge_ended_play_requests() from public, anon, authenticated;

select cron.schedule('pulizia-ricerca-gioco', '*/5 * * * *', 'select public.purge_ended_play_requests()');
