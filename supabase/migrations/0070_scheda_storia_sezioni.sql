-- =====================================================================
-- 0070 - Scheda del PG: Storia riservata, "Si sa che" e "Affetti"
-- Eseguire in Supabase DOPO la 0069: SQL Editor -> New query -> incolla -> Run
--
-- - Storia (background): la leggono solo master, moderatori e admin
--   (permesso "schede.storia", dato subito a tutti i ruoli staff).
--   Si scrive alla creazione del PG e poi non si modifica piu'.
--   Sta in una tabella a parte, cosi' i giocatori non possono leggerla
--   nemmeno interrogando il database.
-- - Bozze della creazione: in una tabella a parte che vede solo il proprietario
--   (prima la bozza, storia compresa, era leggibile da tutti)
-- - "Si sa che" e "Affetti": testi liberi del giocatore (editor di testo)
-- - Aspetto: il giocatore puo' aggiornarlo dalla scheda
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storia
-- ---------------------------------------------------------------------
create table if not exists public.character_backgrounds (
  character_id uuid primary key references public.characters(id) on delete cascade,
  body         text not null default '' check (char_length(body) <= 4000),
  created_at   timestamptz not null default now()
);
alter table public.character_backgrounds enable row level security;

drop policy if exists "storia allo staff" on public.character_backgrounds;
create policy "storia allo staff" on public.character_backgrounds for select to authenticated
  using (public.has_permission('schede.storia'));
-- (nessuna policy di scrittura: la scrive solo il server alla creazione del PG)

-- Permesso nuovo a tutti i ruoli staff (non al ruolo "Giocatore"; l'admin li ha tutti)
update public.staff_roles set permissions = array_append(permissions, 'schede.storia')
  where system_key is null and not ('schede.storia' = any(permissions));

-- Le storie dei PG gia' creati passano nella tabella riservata
insert into public.character_backgrounds (character_id, body, created_at)
  select id, description, coalesce(activated_at, created_at)
  from public.characters
  where status = 'attivo' and description <> ''
on conflict (character_id) do nothing;
update public.characters set description = '' where status = 'attivo' and description <> '';

-- La storia non si modifica piu' dalla scheda
revoke update (description) on public.characters from authenticated;

-- ---------------------------------------------------------------------
-- Bozze della creazione
-- ---------------------------------------------------------------------
create table if not exists public.character_drafts (
  character_id uuid primary key references public.characters(id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);
alter table public.character_drafts enable row level security;

drop policy if exists "la mia bozza" on public.character_drafts;
create policy "la mia bozza" on public.character_drafts for all to authenticated
  using (public.is_my_character(character_id))
  with check (public.is_my_character(character_id));

insert into public.character_drafts (character_id, data)
  select id, creation_data from public.characters
  where status = 'bozza' and creation_data is not null and creation_data <> '{}'::jsonb
on conflict (character_id) do nothing;
update public.characters set creation_data = '{}'::jsonb
  where creation_data is not null and creation_data <> '{}'::jsonb;
revoke update (creation_data) on public.characters from authenticated;

-- ---------------------------------------------------------------------
-- "Si sa che", "Affetti" e Aspetto: li scrive il proprietario
-- ---------------------------------------------------------------------
alter table public.characters add column if not exists known_html text;
alter table public.characters add column if not exists affections_html text;
alter table public.characters drop constraint if exists characters_known_html_len;
alter table public.characters add constraint characters_known_html_len
  check (known_html is null or char_length(known_html) <= 20000);
alter table public.characters drop constraint if exists characters_affections_html_len;
alter table public.characters add constraint characters_affections_html_len
  check (affections_html is null or char_length(affections_html) <= 20000);
alter table public.characters drop constraint if exists characters_appearance_len;
alter table public.characters add constraint characters_appearance_len
  check (appearance is null or char_length(appearance) <= 4000);
grant update (known_html, affections_html, appearance) on public.characters to authenticated;

-- ---------------------------------------------------------------------
-- Pagina Dati: anche se chi guarda puo' leggere la Storia
-- ---------------------------------------------------------------------
drop function if exists public.character_sheet_info(uuid);
create function public.character_sheet_info(p_character uuid)
returns table (last_entry timestamptz, last_chat_action timestamptz, can_write_fate boolean, can_read_story boolean)
language sql stable
security definer set search_path = ''
as $$
  select o.last_entry, a.last_chat_action,
         public.has_permission('schede.note_fato'), public.has_permission('schede.storia')
  from public.characters c
  left join public.online_status o on o.user_id = c.owner_id
  left join public.character_activity a on a.character_id = c.id
  where c.id = p_character;
$$;
revoke execute on function public.character_sheet_info(uuid) from public, anon;
grant execute on function public.character_sheet_info(uuid) to authenticated;
