-- =====================================================================
-- 0040 - Notizie ON: le scrivono admin, master e moderatori
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Nuovo permesso "notizie.on" (Notizie ON), dato ai ruoli Master e
-- Moderatore; l'admin ha gia' tutti i permessi.
-- Le Notizie OFF restano a chi ha "annunci.globali".
-- La notizia ON piu' recente e' quella in prima pagina, le altre sono
-- l'archivio: non serve altro nel database.
-- =====================================================================

update public.staff_roles
   set permissions = array_append(permissions, 'notizie.on')
 where name in ('Master', 'Moderatore')
   and not ('notizie.on' = any(permissions));

drop policy if exists "notizie con permesso" on public.news;
create policy "notizie con permesso" on public.news for all to authenticated
  using (public.has_permission(case when kind = 'on' then 'notizie.on' else 'annunci.globali' end))
  with check (public.has_permission(case when kind = 'on' then 'notizie.on' else 'annunci.globali' end));
