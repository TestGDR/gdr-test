-- =====================================================================
-- 0018 - Presenze stabili: "ultimo segnale" nel database
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Chi ha il sito aperto lascia un segnale ogni minuto. Online = connesso
-- adesso (tempo reale) OPPURE segnale negli ultimi 5 minuti: un breve calo
-- di connessione (standby, telefono in tasca) non fa sparire nessuno.
-- Chi chiude il sito avvisa e sparisce subito.
-- L'ora la decide sempre il database, non l'orologio del browser.
-- =====================================================================

create table public.online_status (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  info       jsonb not null default '{}'::jsonb, -- cosa mostrare nell'elenco (posto, frase...)
  last_seen  timestamptz not null default now()
);
create index online_status_last_seen_idx on public.online_status(last_seen desc);

alter table public.online_status enable row level security;
create policy "segnali visibili" on public.online_status
  for select to authenticated using (true);
grant select on public.online_status to authenticated;

-- Il mio segnale ("sono qui, e questo e' cio' che mostro")
create or replace function public.touch_online(p_info jsonb)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.online_status (user_id, info, last_seen)
  values (auth.uid(), coalesce(p_info, '{}'::jsonb), now())
  on conflict (user_id) do update set info = excluded.info, last_seen = now();
$$;

-- Esco dal sito: il segnale viene "spento" subito
create or replace function public.leave_online()
returns void
language sql
security definer set search_path = ''
as $$
  update public.online_status set last_seen = now() - interval '1 hour' where user_id = auth.uid();
$$;

-- Chi ha dato segnale negli ultimi 5 minuti (con l'ora del database)
create or replace function public.recent_online()
returns table (user_id uuid, info jsonb, last_seen timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select user_id, info, last_seen from public.online_status
  where last_seen > now() - interval '5 minutes';
$$;

revoke execute on function public.touch_online(jsonb), public.leave_online(), public.recent_online() from public, anon;
grant execute on function public.touch_online(jsonb), public.leave_online(), public.recent_online() to authenticated;
