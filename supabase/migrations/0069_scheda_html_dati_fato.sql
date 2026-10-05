-- =====================================================================
-- 0069 - Scheda del PG: pagina Principale in HTML, Dati e Note del Fato
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - sheet_html: la pagina Principale scritta dal giocatore in HTML e CSS
--   (il sito la ripulisce e la mostra isolata: niente script ne' moduli)
-- - fate_notes: le Note del Fato, scritte solo da chi ha il permesso
--   "schede.note_fato" (i ruoli con la narrazione master lo ricevono subito)
-- - character_sheet_info: ultimo login e ultima azione di un PG per la scheda
-- - creazione del PG senza il passaggio Origine (regione e ceto)
-- =====================================================================

alter table public.characters add column if not exists sheet_html text;
alter table public.characters drop constraint if exists characters_sheet_html_len;
alter table public.characters add constraint characters_sheet_html_len
  check (sheet_html is null or char_length(sheet_html) <= 30000);
grant update (sheet_html) on public.characters to authenticated;

alter table public.characters add column if not exists fate_notes text;
alter table public.characters add column if not exists fate_notes_at timestamptz;
alter table public.characters drop constraint if exists characters_fate_notes_len;
alter table public.characters add constraint characters_fate_notes_len
  check (fate_notes is null or char_length(fate_notes) <= 4000);
-- (nessun grant update: si scrivono solo con set_fate_notes)

-- Permesso nuovo: chi narra come master scrive anche le Note del Fato
update public.staff_roles set permissions = array_append(permissions, 'schede.note_fato')
  where 'chat.narrazione' = any(permissions) and not ('schede.note_fato' = any(permissions));

create or replace function public.set_fate_notes(p_character uuid, p_text text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('schede.note_fato') then raise exception 'Permesso negato'; end if;
  update public.characters
    set fate_notes = nullif(left(trim(coalesce(p_text, '')), 4000), ''), fate_notes_at = now()
    where id = p_character;
end;
$$;
revoke execute on function public.set_fate_notes(uuid, text) from public, anon;
grant execute on function public.set_fate_notes(uuid, text) to authenticated;

-- Per la pagina Dati: ultimo ingresso nella land, ultima azione in chat e
-- se chi guarda puo' scrivere le Note del Fato
create or replace function public.character_sheet_info(p_character uuid)
returns table (last_entry timestamptz, last_chat_action timestamptz, can_write_fate boolean)
language sql stable
security definer set search_path = ''
as $$
  select o.last_entry, a.last_chat_action, public.has_permission('schede.note_fato')
  from public.characters c
  left join public.online_status o on o.user_id = c.owner_id
  left join public.character_activity a on a.character_id = c.id
  where c.id = p_character;
$$;
revoke execute on function public.character_sheet_info(uuid) from public, anon;
grant execute on function public.character_sheet_info(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Origine e ceto non si usano piu': la creazione del PG passa da 5 a 4
-- passaggi (Identita', Caratteristiche, Aspetto e storia, Riepilogo).
-- Chi sta creando il PG ora resta sul passaggio in cui era.
-- (Le colonne region e social_class restano, vuote e non piu' usate.)
-- ---------------------------------------------------------------------
update public.characters set creation_step = creation_step - 1
  where status = 'bozza' and creation_step >= 2;
