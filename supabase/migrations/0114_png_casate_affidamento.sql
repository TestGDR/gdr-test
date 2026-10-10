-- =====================================================================
-- 0114 - PNG: collegamento con i PNG delle casate e affidamento
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Un PNG dell'anagrafe puo' essere la scheda di un PNG di casata
--   (quelli dell'albero genealogico): house_npc_id
-- - Un PNG puo' essere affidato a una persona dello staff: lo muove solo
--   lei (e l'admin). Senza affidamento lo muove chiunque abbia "png.gestire"
-- =====================================================================

alter table public.characters add column if not exists house_npc_id uuid unique references public.house_npcs(id) on delete set null;
alter table public.characters add column if not exists npc_manager_id uuid references public.profiles(id) on delete set null;

create or replace function public.controls_character(p_character uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character
      and (
        c.owner_id = auth.uid()
        or (
          c.is_npc
          and public.has_permission('png.gestire')
          and (c.npc_manager_id is null or c.npc_manager_id = auth.uid() or public.is_admin())
        )
      )
  );
$$;
grant execute on function public.controls_character(uuid) to authenticated;
