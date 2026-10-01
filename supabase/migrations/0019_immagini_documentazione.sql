-- =====================================================================
-- 0019 - Archivio immagini per Manuale e Ambientazione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Le immagini inserite nell'editor vengono salvate qui. Sono leggibili da
-- tutti; i caricamenti li fa solo il server dopo aver controllato il
-- permesso "documentazione.scrivere".
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentazione', 'documentazione', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
