-- =====================================================================
-- 0020 - Utility giocatore: prestavolti, motto e storia delle casate
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

-- Casate: motto, storia (HTML dall'editor) e "giocabile dai PG"
alter table public.houses
  add column motto    text not null default '' check (char_length(motto) <= 200),
  add column history  text not null default '' check (char_length(history) <= 100000),
  add column playable boolean not null default true;

-- Prestavolto del personaggio: lo sceglie il giocatore nella propria scheda.
-- Unico in tutto il gioco (senza distinguere maiuscole/minuscole).
alter table public.characters
  add column face_claim text check (char_length(face_claim) <= 80);
create unique index characters_face_claim_lower_key
  on public.characters (lower(face_claim))
  where face_claim is not null and face_claim <> '';

-- Il giocatore puo' modificare prestavolto e immagine del proprio personaggio
grant update (face_claim) on public.characters to authenticated;
