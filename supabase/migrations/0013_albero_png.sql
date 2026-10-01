-- =====================================================================
-- 0013 - Albero genealogico collegato ai PNG (anche di altre casate)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un membro dell'albero puo' essere un PNG gia' esistente, di questa o di
-- un'altra casata (es. la figlia di un lord Velaryon sposata nei Blackfyre).
-- Lo stesso PNG puo' stare in alberi diversi, ma una sola volta per albero.
-- Se il PNG viene eliminato il membro resta, con l'ultimo nome conosciuto.
-- =====================================================================

alter table public.house_family_members
  add column npc_id uuid references public.house_npcs(id) on delete set null;

create unique index house_family_members_npc_key
  on public.house_family_members (house_id, npc_id)
  where npc_id is not null;
