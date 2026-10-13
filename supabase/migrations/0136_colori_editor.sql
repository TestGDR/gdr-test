-- Tavolozza dei colori personalizzati della gestione: colori salvati una volta
-- e poi sempre disponibili nell'editor della documentazione.
-- La vede e la modifica solo chi ha il permesso "documentazione.scrivere".

create table if not exists public.editor_colors (
  id uuid primary key default gen_random_uuid(),
  color text not null unique check (char_length(color) between 4 and 40),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.editor_colors enable row level security;

drop policy if exists "colori editor con permesso" on public.editor_colors;
create policy "colori editor con permesso" on public.editor_colors for all to authenticated
  using (public.has_permission('documentazione.scrivere'))
  with check (public.has_permission('documentazione.scrivere'));

grant select, insert, delete on public.editor_colors to authenticated;
