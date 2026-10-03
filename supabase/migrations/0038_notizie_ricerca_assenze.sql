-- =====================================================================
-- 0038 - Notizie ON/OFF, ricerca gioco, assenze
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Notizie: le leggono tutti, le scrive chi ha "annunci.globali".
-- Ricerca gioco: un PG attivo pubblica una richiesta che scade dopo
--   qualche ora; l'icona lampeggia per chi non l'ha ancora vista.
-- Assenze: ognuno segna le proprie; lo staff puo' togliere quelle altrui.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Notizie
-- ---------------------------------------------------------------------
create table public.news (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('on', 'off')),
  title       text not null check (char_length(title) between 1 and 150),
  body        text not null default '' check (char_length(body) <= 100000), -- HTML dell'editor
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index news_kind_idx on public.news(kind, created_at desc);

alter table public.news enable row level security;
create policy "notizie visibili" on public.news for select to authenticated using (true);
create policy "notizie con permesso" on public.news for all to authenticated
  using (public.has_permission('annunci.globali')) with check (public.has_permission('annunci.globali'));
grant select, insert, update, delete on public.news to authenticated;
grant select, insert, update, delete on public.news to service_role;

-- ---------------------------------------------------------------------
-- Ricerca gioco
-- ---------------------------------------------------------------------
create table public.play_requests (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  text          text not null check (char_length(text) between 1 and 500),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '24 hours 1 minute')
);
create index play_requests_created_idx on public.play_requests(created_at desc);

alter table public.play_requests enable row level security;
create policy "richieste visibili" on public.play_requests for select to authenticated using (true);
create policy "pubblica con il proprio PG attivo" on public.play_requests for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid() and c.status = 'attivo')
  );
create policy "togli le tue o modera" on public.play_requests for delete to authenticated
  using (author_id = auth.uid() or public.has_permission('chat.moderare'));
grant select, insert, delete on public.play_requests to authenticated;
grant select, insert, delete on public.play_requests to service_role;

-- quando l'utente ha guardato le richieste l'ultima volta (per far lampeggiare l'icona)
create table public.play_requests_seen (
  user_id  uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  seen_at  timestamptz not null default now()
);
alter table public.play_requests_seen enable row level security;
create policy "il mio segno" on public.play_requests_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.play_requests_seen to authenticated;

alter publication supabase_realtime add table public.play_requests;

-- ---------------------------------------------------------------------
-- Assenze
-- ---------------------------------------------------------------------
create table public.absences (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  from_date     date not null,
  to_date       date not null,
  note          text not null default '' check (char_length(note) <= 300),
  created_at    timestamptz not null default now(),
  check (to_date >= from_date and to_date <= from_date + 365)
);
create index absences_dates_idx on public.absences(to_date);

alter table public.absences enable row level security;
create policy "assenze visibili" on public.absences for select to authenticated using (true);
create policy "segna le tue assenze" on public.absences for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  );
create policy "togli le tue o lo staff" on public.absences for delete to authenticated
  using (author_id = auth.uid() or public.has_permission('utenti.gestire'));
grant select, insert, delete on public.absences to authenticated;
grant select, insert, delete on public.absences to service_role;
