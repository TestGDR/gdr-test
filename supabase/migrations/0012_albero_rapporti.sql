-- =====================================================================
-- 0012 - Albero genealogico: secondo genitore e rapporti tra membri
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

-- Ogni membro puo' avere due genitori (figlio di una coppia)
alter table public.house_family_members
  add column parent2_id uuid references public.house_family_members(id) on delete set null,
  add constraint house_family_two_parents check (parent2_id is null or parent2_id <> parent_id);

-- Rapporti tra due membri dello stesso albero
create table public.house_family_relations (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid not null references public.houses(id) on delete cascade,
  member_a    uuid not null references public.house_family_members(id) on delete cascade,
  member_b    uuid not null references public.house_family_members(id) on delete cascade,
  kind        text not null check (kind in ('matrimonio', 'promessi', 'amanti', 'separati')),
  note        text not null default '' check (char_length(note) <= 120),
  created_at  timestamptz not null default now(),
  check (member_a <> member_b)
);
-- Lo stesso rapporto tra le stesse due persone una volta sola (in qualunque ordine)
create unique index house_family_relations_pair_key
  on public.house_family_relations (least(member_a, member_b), greatest(member_a, member_b), kind);
create index house_family_relations_house_idx on public.house_family_relations(house_id);

alter table public.house_family_relations enable row level security;
create policy "rapporti visibili" on public.house_family_relations
  for select to authenticated using (true);
create policy "rapporti con permesso" on public.house_family_relations for all to authenticated
  using (public.has_permission('casate.gestire')) with check (public.has_permission('casate.gestire'));
grant select, insert, update, delete on public.house_family_relations to authenticated;
