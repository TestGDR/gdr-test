-- =====================================================================
-- 0122 - Regole di salute, fatica e peso modificabili dallo staff
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Gestione -> Salute, ferite e peso (permesso "regole.gestire"): recupero
-- della Stamina, ferite critiche (margine, danno, malus, sanguinamento,
-- giorni di guarigione), cosa ostacola ogni ferita, soglie del peso.
-- Una sola riga: finche' e' vuota valgono i valori del regolamento.
-- =====================================================================

create table if not exists public.game_settings (
  id   boolean primary key default true check (id),
  data jsonb not null default '{}'
);
insert into public.game_settings (id) values (true) on conflict do nothing;

alter table public.game_settings enable row level security;
drop policy if exists "regole visibili" on public.game_settings;
create policy "regole visibili" on public.game_settings for select to authenticated using (true);
drop policy if exists "regole con permesso" on public.game_settings;
create policy "regole con permesso" on public.game_settings for all to authenticated
  using (public.has_permission('regole.gestire')) with check (public.has_permission('regole.gestire'));
grant select, insert, update on public.game_settings to authenticated;
grant select, insert, update on public.game_settings to service_role;
