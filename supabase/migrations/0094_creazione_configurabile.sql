-- =====================================================================
-- 0094 - Creazione del personaggio configurabile da pannello
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - creation_steps: i passaggi della creazione, in ordine.
-- - creation_blocks: cosa chiede ogni passaggio (sesso, eta', statistiche,
--   abilita', tratti, aspetto, storia, dati fisici, equipaggiamento,
--   testi informativi e campi personalizzati), con le sue impostazioni.
-- - characters.custom_fields: i valori dei campi personalizzati visibili;
--   character_private_fields: quelli riservati (proprietaria e staff).
-- - Il percorso iniziale e' quello di adesso (6 passaggi + riepilogo).
-- Permesso nuovo: "creazione.gestire" (Gestione -> Creazione personaggio).
-- =====================================================================

create table if not exists public.creation_steps (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  sort_order  int not null default 0
);

create table if not exists public.creation_blocks (
  id         uuid primary key default gen_random_uuid(),
  step_id    uuid not null references public.creation_steps (id) on delete cascade,
  kind       text not null check (kind in ('sesso', 'eta', 'statistiche', 'abilita', 'tratti', 'aspetto', 'storia',
                                           'dati_fisici', 'equipaggiamento', 'testo', 'campo')),
  sort_order int not null default 0,
  config     jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object')
);
-- i blocchi di sistema compaiono al massimo una volta
create unique index if not exists creation_blocks_unique_kind on public.creation_blocks (kind)
  where kind not in ('testo', 'campo');
create unique index if not exists creation_blocks_unique_field on public.creation_blocks ((config->>'key'))
  where kind = 'campo';

alter table public.characters add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create table if not exists public.character_private_fields (
  character_id uuid primary key references public.characters (id) on delete cascade,
  data         jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- Sicurezza
-- ---------------------------------------------------------------------
alter table public.creation_steps enable row level security;
alter table public.creation_blocks enable row level security;
alter table public.character_private_fields enable row level security;

drop policy if exists "passaggi visibili" on public.creation_steps;
create policy "passaggi visibili" on public.creation_steps for select to authenticated using (true);
drop policy if exists "passaggi gestiti" on public.creation_steps;
create policy "passaggi gestiti" on public.creation_steps for all to authenticated
  using (public.has_permission('creazione.gestire')) with check (public.has_permission('creazione.gestire'));

drop policy if exists "blocchi visibili" on public.creation_blocks;
create policy "blocchi visibili" on public.creation_blocks for select to authenticated using (true);
drop policy if exists "blocchi gestiti" on public.creation_blocks;
create policy "blocchi gestiti" on public.creation_blocks for all to authenticated
  using (public.has_permission('creazione.gestire')) with check (public.has_permission('creazione.gestire'));

-- campi riservati: li leggono la proprietaria e lo staff che legge le storie;
-- li scrive il server alla creazione e l'admin
drop policy if exists "campi riservati visibili" on public.character_private_fields;
create policy "campi riservati visibili" on public.character_private_fields for select to authenticated
  using (public.is_my_character(character_id) or public.has_permission('schede.storia'));
drop policy if exists "campi riservati admin" on public.character_private_fields;
create policy "campi riservati admin" on public.character_private_fields for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.creation_steps, public.creation_blocks, public.character_private_fields to authenticated;
grant all on public.creation_steps, public.creation_blocks, public.character_private_fields to service_role;

-- ---------------------------------------------------------------------
-- Percorso iniziale (solo se non c'e' ancora niente)
-- ---------------------------------------------------------------------
do $$
declare
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid;
begin
  if exists (select 1 from public.creation_steps) then return; end if;
  insert into public.creation_steps (title, sort_order) values ('Identità', 1) returning id into s1;
  insert into public.creation_steps (title, sort_order) values ('Statistiche', 2) returning id into s2;
  insert into public.creation_steps (title, sort_order) values ('Abilità', 3) returning id into s3;
  insert into public.creation_steps (title, sort_order) values ('Tratti', 4) returning id into s4;
  insert into public.creation_steps (title, sort_order) values ('Aspetto e storia', 5) returning id into s5;
  insert into public.creation_steps (title, sort_order) values ('Equipaggiamento', 6) returning id into s6;
  insert into public.creation_blocks (step_id, kind, sort_order, config) values
    (s1, 'sesso', 1, '{}'),
    (s1, 'eta', 2, '{"min":16,"max":80}'),
    (s2, 'statistiche', 1, '{"points":28,"min":2,"max":7}'),
    (s3, 'abilita', 1, '{"points":40,"max":4}'),
    (s4, 'tratti', 1, '{"advantage_points":3,"flaws_max":2,"flaw_value_max":4,"advantages_max":4}'),
    (s5, 'aspetto', 1, '{"min_chars":30}'),
    (s5, 'storia', 2, '{"min_chars":100}'),
    (s6, 'equipaggiamento', 1, '{}');
end;
$$;

-- ---------------------------------------------------------------------
-- L'admin corregge i campi personalizzati di un PG (Scheda -> Gestisci)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_custom_fields(p_character uuid, p_public jsonb, p_private jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono farlo.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_public, '{}')) <> 'object' or jsonb_typeof(coalesce(p_private, '{}')) <> 'object' then
    raise exception 'Valori non validi.' using errcode = 'P0001';
  end if;
  update public.characters set custom_fields = coalesce(p_public, '{}') where id = p_character;
  insert into public.character_private_fields (character_id, data) values (p_character, coalesce(p_private, '{}'))
    on conflict (character_id) do update set data = excluded.data;
end;
$$;
revoke execute on function public.admin_set_custom_fields(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_set_custom_fields(uuid, jsonb, jsonb) to authenticated;
