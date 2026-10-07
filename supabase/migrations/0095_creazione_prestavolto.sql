-- =====================================================================
-- 0095 - Creazione: blocco "Prestavolto"
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Nel pannello Gestione -> Creazione personaggio si puo' aggiungere il
-- blocco Prestavolto (nome e cognome, controllo dei doppioni). Alla
-- conferma diventa il prestavolto della scheda, che poi non si cambia piu'.
-- =====================================================================

alter table public.creation_blocks drop constraint if exists creation_blocks_kind_check;
alter table public.creation_blocks add constraint creation_blocks_kind_check
  check (kind in ('sesso', 'eta', 'statistiche', 'abilita', 'tratti', 'aspetto', 'storia',
                  'dati_fisici', 'equipaggiamento', 'prestavolto', 'testo', 'campo'));
