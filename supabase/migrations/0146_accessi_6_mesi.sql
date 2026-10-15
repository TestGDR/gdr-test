-- =====================================================================
-- 0146 - Dati di accesso conservati 6 mesi (come scritto nella Privacy Policy)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- Ogni notte si cancellano gli accessi (IP, browser) e le verifiche degli IP
-- (VPN/proxy) piu' vecchi di 6 mesi.
-- =====================================================================

create or replace function public.purge_old_access_data()
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.access_logs where created_at < now() - interval '6 months';
  delete from public.ip_checks where checked_at < now() - interval '6 months';
$$;
revoke execute on function public.purge_old_access_data() from public, anon, authenticated;

-- subito una prima pulizia, poi ogni notte alle 3:20
select public.purge_old_access_data();
select cron.unschedule('accessi-6-mesi') where exists (select 1 from cron.job where jobname = 'accessi-6-mesi');
select cron.schedule('accessi-6-mesi', '20 3 * * *', 'select public.purge_old_access_data()');
