-- =====================================================================
-- 0116 - PNG visibili ai giocatori (Utility -> Anagrafe PNG)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Di base un PNG e' visibile: i giocatori lo trovano nell'anagrafe e ne
-- aprono la scheda. Togliendo la spunta in Gestione -> PNG resta nascosto
-- (lo vede solo chi gestisce i PNG).
-- =====================================================================

alter table public.characters add column if not exists npc_public boolean not null default true;

drop policy if exists "personaggi visibili" on public.characters;
create policy "personaggi visibili" on public.characters for select to authenticated
  using (not is_npc or npc_public or public.has_permission('png.gestire'));
