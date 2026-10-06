-- =====================================================================
-- 0082 - Pettegolezzi: i master li possono eliminare
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Chi ha il permesso "pettegolezzi.gestire" elimina un pettegolezzo, in
-- attesa o gia' pubblicato tra le voci. Il ticket collegato resta.
-- =====================================================================

drop policy if exists "pettegolezzi eliminati dai master" on public.gossip_reports;
create policy "pettegolezzi eliminati dai master" on public.gossip_reports for delete to authenticated
  using (public.has_permission('pettegolezzi.gestire'));

grant delete on public.gossip_reports to authenticated;
