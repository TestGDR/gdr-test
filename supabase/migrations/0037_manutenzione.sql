-- =====================================================================
-- 0037 - Manutenzione del sito
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il pannello Manutenzione (permesso "manutenzione.sito") pulisce dal
-- server, con la chiave segreta: messaggi delle chat, missive e OFF piu'
-- vecchi di un periodo scelto, e gli account inattivi da molto tempo.
-- Un drago il cui cavaliere viene eliminato resta, senza cavaliere
-- (lo garantisce gia' il collegamento "on delete set null").
-- =====================================================================

grant select, delete on public.private_messages to service_role;
grant select on public.online_status to service_role;
