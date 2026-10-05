-- =====================================================================
-- 0071 - Scheda del PG: Affetti con i PG + permessi delle tabelle della 0070
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Affetti: il giocatore aggiunge dei PG (si vede la loro immagine di chat)
--   e per ognuno scrive qualcosa. Li leggono tutti, li cambia il proprietario.
-- - Le tabelle della 0070 (storia e bozze) non avevano i permessi di accesso:
--   senza, la creazione del PG e la lettura della Storia non funzionano.
-- =====================================================================

-- Permessi delle tabelle della 0070 (le regole RLS restano quelle della 0070)
grant select on public.character_backgrounds to authenticated;
grant select, insert, update, delete on public.character_backgrounds to service_role;
grant select, insert, update, delete on public.character_drafts to authenticated;
grant select, insert, update, delete on public.character_drafts to service_role;

-- ---------------------------------------------------------------------
-- Affetti
-- ---------------------------------------------------------------------
create table if not exists public.character_affections (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade, -- di chi e' la scheda
  target_id     uuid not null references public.characters(id) on delete cascade, -- il PG caro
  body          text not null default '' check (char_length(body) <= 1000),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (character_id, target_id),
  check (character_id <> target_id)
);
create index if not exists character_affections_character_idx on public.character_affections (character_id, sort_order);
alter table public.character_affections enable row level security;

drop policy if exists "affetti visibili" on public.character_affections;
create policy "affetti visibili" on public.character_affections for select to authenticated using (true);
drop policy if exists "i miei affetti" on public.character_affections;
create policy "i miei affetti" on public.character_affections for all to authenticated
  using (public.is_my_character(character_id))
  with check (public.is_my_character(character_id));

grant select, insert, update, delete on public.character_affections to authenticated;
grant select, insert, update, delete on public.character_affections to service_role;
