-- =====================================================================
-- 0017 - Albero genealogico: posizione delle carte spostate a mano
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Se una carta viene trascinata, la sua posizione viene salvata; se e'
-- vuota, la carta segue la disposizione automatica.
-- =====================================================================

alter table public.house_family_members
  add column pos_x int check (pos_x between 0 and 20000),
  add column pos_y int check (pos_y between 0 and 20000);
