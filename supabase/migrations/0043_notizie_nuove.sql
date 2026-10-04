-- =====================================================================
-- 0043 - Notizie nuove: l'icona di Notizie ON / OFF cambia colore
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Per ogni giocatore si ricorda quando ha aperto l'ultima volta le
-- Notizie ON e le Notizie OFF; le notizie pubblicate dopo sono "nuove".
-- =====================================================================

create table public.news_seen (
  user_id  uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind     text not null check (kind in ('on', 'off')),
  seen_at  timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.news_seen enable row level security;
create policy "il mio segno" on public.news_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.news_seen to authenticated;

-- chi c'e' gia' ha visto le notizie pubblicate finora
insert into public.news_seen (user_id, kind)
select p.id, k.kind from public.profiles p cross join (values ('on'), ('off')) as k(kind)
on conflict do nothing;

-- le notizie nuove arrivano in tempo reale
alter publication supabase_realtime add table public.news;
