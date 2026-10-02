-- =====================================================================
-- 0024 - Gruppi di chat dentro una macroarea
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un gruppo e' solo un contenitore con un nome (es. "Fortezza Rossa"):
-- nella modale della macroarea le chat compaiono divise per gruppo.
-- Eliminando un gruppo le sue chat restano, senza gruppo.
-- =====================================================================

create table public.room_groups (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index room_groups_location_idx on public.room_groups(location_id, sort_order);

alter table public.rooms add column group_id uuid references public.room_groups(id) on delete set null;

alter table public.room_groups enable row level security;
-- Visibili come le macroaree: mappe attive, oppure con il permesso di gestire il mondo
create policy "gruppi visibili" on public.room_groups for select to authenticated
  using (
    exists (
      select 1 from public.locations l join public.maps m on m.id = l.map_id
      where l.id = location_id and m.active
    )
    or public.has_permission('mondo.gestire')
  );
create policy "gruppi con permesso" on public.room_groups for all to authenticated
  using (public.has_permission('mondo.gestire'))
  with check (public.has_permission('mondo.gestire'));

grant select, insert, update, delete on public.room_groups to authenticated;
grant select, insert, update, delete on public.room_groups to service_role;
