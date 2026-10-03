-- =====================================================================
-- 0036 - Gestione utenti: ban
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un utente bannato non puo' piu' accedere: il login lo rifiuta (ban del
-- sistema di accesso) e, se aveva una sessione aperta, il sito lo fa
-- uscire alla prima pagina. banned_until = 'infinity' per un ban permanente.
-- Ban, modifiche ed eliminazioni le fa il server, con il permesso
-- "utenti.gestire" (gli admin li tocca solo un altro admin).
-- =====================================================================

alter table public.profiles
  add column banned_until timestamptz,
  add column ban_reason   text not null default '' check (char_length(ban_reason) <= 300);

grant select, update on public.profiles to service_role;
grant select, update, delete on public.characters to service_role;
