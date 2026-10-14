-- =====================================================================
-- 0145 - Gruppi di truppe (terrestri, navali, macchine da guerra...)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - Lo staff crea i gruppi in Gestione -> Eserciti -> Gruppi e assegna ogni
--   tipo di truppa a un gruppo.
-- - Per ogni coppia di gruppi si sceglie se "si affrontano" (un gruppo
--   affronta sempre se stesso). Forza e debolezza si impostano solo contro
--   le truppe dei gruppi che si affrontano: le altre si azzerano da sole.
-- =====================================================================

create table if not exists public.troop_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  sort_order int  not null default 0
);
create unique index if not exists troop_categories_name_key on public.troop_categories (lower(name));

-- coppie di gruppi diversi che si affrontano (salvate una volta sola: a < b)
create table if not exists public.troop_category_faces (
  category_a uuid not null references public.troop_categories(id) on delete cascade,
  category_b uuid not null references public.troop_categories(id) on delete cascade,
  primary key (category_a, category_b),
  check (category_a < category_b)
);

alter table public.troop_types add column if not exists category_id uuid references public.troop_categories(id) on delete set null;

alter table public.troop_categories enable row level security;
alter table public.troop_category_faces enable row level security;
drop policy if exists "visibili" on public.troop_categories;
create policy "visibili" on public.troop_categories for select to authenticated using (true);
drop policy if exists "eserciti con permesso" on public.troop_categories;
create policy "eserciti con permesso" on public.troop_categories for all to authenticated
  using (public.has_permission('eserciti.gestire')) with check (public.has_permission('eserciti.gestire'));
drop policy if exists "visibili" on public.troop_category_faces;
create policy "visibili" on public.troop_category_faces for select to authenticated using (true);
drop policy if exists "eserciti con permesso" on public.troop_category_faces;
create policy "eserciti con permesso" on public.troop_category_faces for all to authenticated
  using (public.has_permission('eserciti.gestire')) with check (public.has_permission('eserciti.gestire'));
grant select, insert, update, delete on public.troop_categories, public.troop_category_faces to authenticated;
grant select, insert, update, delete on public.troop_categories, public.troop_category_faces to service_role;
