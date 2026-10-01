-- =====================================================================
-- 0016 - Manuale e Ambientazione: macrosezioni, ordine e testo in HTML
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Le macrosezioni diventano una tabella vera (possono esistere vuote ed
-- essere riordinate); le pagine esistenti vengono collegate alla loro
-- macrosezione. I nuovi testi sono in HTML; quelli vecchi restano in
-- Markdown finche' non vengono modificati.
-- =====================================================================

create table public.guide_sections (
  id          uuid primary key default gen_random_uuid(),
  book        text not null check (book in ('manuale', 'ambientazione')),
  title       text not null check (char_length(title) between 1 and 120),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index guide_sections_book_idx on public.guide_sections(book, sort_order);

-- Le macrosezioni che esistono gia' (come etichetta sulle pagine)
insert into public.guide_sections (book, title, sort_order)
select book, section, min(section_order)
from public.guide_pages
group by book, section;

alter table public.guide_pages
  add column section_id uuid references public.guide_sections(id) on delete cascade,
  add column format text not null default 'markdown' check (format in ('markdown', 'html'));

update public.guide_pages p
set section_id = s.id
from public.guide_sections s
where s.book = p.book and s.title = p.section;

alter table public.guide_pages alter column section_id set not null;
-- le vecchie colonne restano solo per compatibilita'
alter table public.guide_pages alter column section set default '';
create index guide_pages_section_idx on public.guide_pages(section_id, sort_order);

alter table public.guide_sections enable row level security;
create policy "macrosezioni visibili a tutti" on public.guide_sections
  for select to anon, authenticated using (true);
create policy "macrosezioni con permesso" on public.guide_sections for all to authenticated
  using (public.has_permission('documentazione.scrivere'))
  with check (public.has_permission('documentazione.scrivere'));
grant select on public.guide_sections to anon, authenticated;
grant insert, update, delete on public.guide_sections to authenticated;
