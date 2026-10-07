-- =====================================================================
-- 0098 - Creazione: blocchi "Casata e ruolo" e "Drago"
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Casata e ruolo: il PG sceglie tra i ruoli aperti all'iscrizione.
-- - Drago: se la casata ha draghi o uova liberi, il PG ne reclama uno.
-- - Equipaggiamento: si compra con le monete della creazione.
-- =====================================================================

alter table public.creation_blocks drop constraint if exists creation_blocks_kind_check;
alter table public.creation_blocks add constraint creation_blocks_kind_check
  check (kind in ('sesso', 'eta', 'statistiche', 'abilita', 'tratti', 'aspetto', 'storia',
                  'dati_fisici', 'equipaggiamento', 'prestavolto', 'casata', 'drago', 'testo', 'campo'));
