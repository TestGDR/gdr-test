-- =====================================================================
-- 0175 - Timeline: racconto degli eventi con l'editor (HTML), fino a 20.000 caratteri
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

alter table public.timeline_events drop constraint if exists timeline_events_summary_check;
alter table public.timeline_events add constraint timeline_events_summary_check
  check (char_length(summary) <= 20000);
