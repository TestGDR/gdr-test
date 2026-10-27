-- =====================================================================
-- 0174 - Mappa interattiva: piu' tipi di luogo e di percorso
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Luoghi: capitale, castello, fortezza, citta', villaggio, porto, tempio,
-- rovine, luogo d'interesse, altro.
-- Percorsi (le linee): strada, sentiero, rotta marittima.
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

alter table public.map_features drop constraint if exists map_features_place_type_check;
alter table public.map_features add constraint map_features_place_type_check check (
  place_type is null or place_type in (
    'capitale', 'castello', 'fortezza', 'citta', 'villaggio', 'porto', 'tempio', 'rovine', 'interesse', 'altro',
    'strada', 'sentiero', 'rotta'
  )
);

-- le strade gia' disegnate restano "strada"
update public.map_features set place_type = 'strada' where kind = 'strada' and place_type is null;
