-- =====================================================================
-- 0160 - Tratti narrativi: la riga scritta la cambiano solo gli admin
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- La riga di un tratto narrativo (character_traits.note) si scrive in
-- iscrizione. Dopo, solo un admin puo' modificarla o togliere il tratto che
-- la contiene. Chi gestisce abilita' e tratti (es. moderatori) puo' ancora
-- aggiungere tratti, ma non riscrivere o cancellare quelli gia' scritti.
-- (La spiegazione di vantaggi e svantaggi, nei campi riservati, la puo' gia'
-- cambiare solo un admin.)
-- Non vale per il server (iscrizione) ne' quando si elimina un personaggio.
-- =====================================================================

create or replace function public.character_traits_note_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- server (nessun utente), admin, o cancellazione a cascata del personaggio
  if auth.uid() is null or public.is_admin() or pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.note is distinct from old.note then
    raise exception 'Solo gli admin possono modificare il testo dei tratti.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.note is not null and btrim(old.note) <> '' then
    raise exception 'Solo gli admin possono togliere un tratto con il testo scritto.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists character_traits_note_guard on public.character_traits;
create trigger character_traits_note_guard
  before update or delete on public.character_traits
  for each row execute function public.character_traits_note_guard();
