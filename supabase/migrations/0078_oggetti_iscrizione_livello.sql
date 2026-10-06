-- =====================================================================
-- 0078 - Oggetti: disponibili all'iscrizione e livello di partenza
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Ogni oggetto puo' essere "disponibile all'iscrizione": compare nel
--   passaggio Equipaggiamento della creazione del PG, dove il giocatore
--   sceglie i suoi oggetti di partenza (al massimo N, impostabile).
-- - Ogni oggetto ha un livello (qualita') di partenza: chi lo compra, lo
--   riceve dallo staff o lo sceglie all'iscrizione lo ha di quel livello.
-- =====================================================================

alter table public.items add column if not exists at_signup boolean not null default false;
alter table public.items add column if not exists quality_id uuid references public.item_qualities(id) on delete set null;

-- Quanti oggetti si scelgono all'iscrizione
create table if not exists public.item_settings (
  id          boolean primary key default true check (id),
  signup_max  int not null default 3 check (signup_max between 0 and 20)
);
insert into public.item_settings (id) values (true) on conflict (id) do nothing;
alter table public.item_settings enable row level security;
drop policy if exists "impostazioni oggetti visibili" on public.item_settings;
create policy "impostazioni oggetti visibili" on public.item_settings for select to authenticated using (true);
drop policy if exists "impostazioni oggetti dello staff" on public.item_settings;
create policy "impostazioni oggetti dello staff" on public.item_settings for update to authenticated
  using (public.has_permission('oggetti.gestire')) with check (public.has_permission('oggetti.gestire'));
grant select, update on public.item_settings to authenticated;
grant select, insert, update, delete on public.item_settings to service_role;

-- Oggetti ricevuti all'iscrizione
alter table public.character_items drop constraint if exists character_items_source_check;
alter table public.character_items add constraint character_items_source_check
  check (source in ('staff', 'negozio', 'iscrizione'));

-- Ogni oggetto nuovo nasce del livello dell'oggetto (se non c'e', il piu' basso)
create or replace function public.character_item_base_quality()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.quality_id is null then
    select quality_id into new.quality_id from public.items where id = new.item_id;
  end if;
  if new.quality_id is null then
    select id into new.quality_id from public.item_qualities order by level limit 1;
  end if;
  return new;
end;
$$;
