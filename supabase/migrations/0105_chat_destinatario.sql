-- =====================================================================
-- 0105 - Chat: destinatario dell'azione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni messaggio puo' indicare a chi e' rivolto (un PG presente o un testo
-- libero): nel messaggio compare "-> Nome". Lo leggono tutti.
-- =====================================================================

alter table public.messages add column if not exists recipient text;
alter table public.messages drop constraint if exists messages_recipient_len;
alter table public.messages add constraint messages_recipient_len
  check (recipient is null or char_length(recipient) between 1 and 60);
