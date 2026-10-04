-- =====================================================================
-- 0048 - Ticket: le categorie (sezioni) le gestisce solo l'admin
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Eliminando una categoria i suoi ticket restano, "senza sezione".
-- =====================================================================

drop policy if exists "sezioni gestite dallo staff" on public.ticket_sections;
create policy "categorie gestite dall'admin" on public.ticket_sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
