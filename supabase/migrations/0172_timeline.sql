-- =====================================================================
-- 0172 - Timeline degli eventi di gioco
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Menu gioco -> Timeline: gli eventi di gioco in ordine di data ON
-- (anno, luna e giorno; luna e giorno si possono lasciare vuoti), con
-- titolo e riassunto. Tutti la leggono; la scrive chi ha il permesso
-- "timeline.gestire" (admin sempre, e il ruolo Moderatore).
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

create table if not exists public.timeline_events (
  id          uuid primary key default gen_random_uuid(),
  year        int not null check (year between -10000 and 10000),
  month       int check (month between 1 and 12),
  day         int check (day between 1 and 31),
  title       text not null check (char_length(title) between 1 and 120),
  summary     text not null default '' check (char_length(summary) <= 4000),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (day is null or month is not null)
);
create index if not exists timeline_events_date_idx on public.timeline_events (year, month, day);

alter table public.timeline_events enable row level security;
drop policy if exists "timeline visibile" on public.timeline_events;
create policy "timeline visibile" on public.timeline_events for select to authenticated using (true);
drop policy if exists "timeline dello staff" on public.timeline_events;
create policy "timeline dello staff" on public.timeline_events for all to authenticated
  using (public.has_permission('timeline.gestire')) with check (public.has_permission('timeline.gestire'));
grant select, insert, update, delete on public.timeline_events to authenticated;
grant select on public.timeline_events to service_role;

-- il permesso al ruolo dei moderatori (gli admin lo hanno sempre)
update public.staff_roles
  set permissions = array_append(coalesce(permissions, '{}'), 'timeline.gestire')
  where name ilike '%moderat%'
    and not ('timeline.gestire' = any(coalesce(permissions, '{}')));
