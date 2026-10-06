-- =====================================================================
-- 0084 - Preferenze: volume dei suoni e suoni nuovi di partenza
-- Eseguire in Supabase DOPO la 0083: SQL Editor -> New query -> incolla -> Run
--
-- - Volume dei suoni della land (0-100), dalla scheda -> Opzioni.
-- - Suoni di partenza: corvo registrato (missive), bip registrato (OFF), chat1 registrato (chat).
-- =====================================================================

alter table public.user_prefs add column if not exists volume int not null default 80;
alter table public.user_prefs drop constraint if exists user_prefs_volume_check;
alter table public.user_prefs add constraint user_prefs_volume_check check (volume between 0 and 100);

alter table public.user_prefs alter column sound_missiva set default 'file-corvo';
alter table public.user_prefs alter column sound_off set default 'file-bip1';
alter table public.user_prefs alter column sound_chat set default 'file-chat1';
