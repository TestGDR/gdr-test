-- =====================================================================
-- 0005 - Creazione guidata del personaggio (PG)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un personaggio nasce in "bozza" all'iscrizione: puo' vedere mappa,
-- documentazione e schede, ma NON scrivere nelle chat di gioco finche'
-- non completa la creazione e diventa "attivo".
-- =====================================================================

alter table public.characters
  add column status         text not null default 'bozza' check (status in ('bozza', 'attivo')),
  -- avanzamento della procedura guidata: step raggiunto e scelte fatte finora
  add column creation_step  int  not null default 0,
  add column creation_data  jsonb not null default '{}'::jsonb,
  -- scheda definitiva, compilata alla conferma della creazione
  add column sex            text,
  add column age            int,
  add column region         text,
  add column social_class   text,
  add column attributes     jsonb,
  add column appearance     text,
  add column activated_at   timestamptz;

-- ---------------------------------------------------------------------
-- Cosa puo' scrivere il giocatore sul proprio personaggio.
-- Stato e scheda definitiva li scrive SOLO il server dopo aver validato
-- le scelte: nessuno puo' attivarsi il PG da solo chiamando le API.
-- ---------------------------------------------------------------------
revoke insert, update on public.characters from authenticated;
grant insert (owner_id, name, description, avatar_url) on public.characters to authenticated;
grant update (description, avatar_url, creation_step, creation_data) on public.characters to authenticated;

grant insert, update on public.characters to service_role;

-- ---------------------------------------------------------------------
-- Nelle chat di gioco scrivono solo i personaggi attivi
-- ---------------------------------------------------------------------
drop policy "scrivi con il proprio personaggio" on public.messages;
create policy "scrivi con il proprio personaggio attivo" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id
        and c.owner_id = auth.uid()
        and c.status = 'attivo'
    )
    and (kind <> 'master' or public.is_staff())
  );
