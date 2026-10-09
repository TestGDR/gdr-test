-- =====================================================================
-- 0108 - Attacchi in attesa: li legge solo il server
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il tiro per colpire resta nascosto finche' il bersaglio non sceglie la
-- difesa (regola: si sceglie prima di vedere il risultato).
-- =====================================================================

drop policy if exists "attacchi visibili" on public.combat_attacks;
revoke select on public.combat_attacks from authenticated;
