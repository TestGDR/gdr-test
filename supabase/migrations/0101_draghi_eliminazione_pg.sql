-- =====================================================================
-- 0101 - Draghi: si possono eliminare i PG che hanno un drago
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il controllo sulle modifiche ai draghi bloccava anche il server e
-- l'eliminazione di un personaggio con un drago (il drago resta libero).
-- =====================================================================

create or replace function public.dragons_check()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  k text;
begin
  -- Chi non e' staff (e non passa dalle funzioni dei draghi) cambia solo nome e immagine.
  -- Non vale per il server (nessun utente collegato) ne' quando il drago perde il
  -- cavaliere perche' il personaggio e' stato eliminato
  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and coalesce(current_setting('app.dragon_internal', true), '') <> '1'
     and not public.has_permission('draghi.gestire')
     and not (old.rider_id is not null and new.rider_id is null
              and not exists (select 1 from public.characters where id = old.rider_id))
     and (new.house_id, new.status, new.stage, new.sex, new.color1, new.color2, new.pregi, new.difetti,
          new.temperament, new.stats, new.skills, new.unspent_points, new.rider_id, new.npc_rider_id,
          new.growth_px, new.loyalty)
         is distinct from
         (old.house_id, old.status, old.stage, old.sex, old.color1, old.color2, old.pregi, old.difetti,
          old.temperament, old.stats, old.skills, old.unspent_points, old.rider_id, old.npc_rider_id,
          old.growth_px, old.loyalty) then
    raise exception 'Puoi cambiare solo il nome e l''immagine del drago.' using errcode = '42501';
  end if;

  -- Pregi e difetti validi e mai opposti
  foreach k in array new.pregi loop
    if not exists (select 1 from public.dragon_trait_pairs where pregio = k) then
      raise exception 'Pregio sconosciuto: %', k using errcode = 'P0001';
    end if;
    if exists (select 1 from public.dragon_trait_pairs where pregio = k and difetto = any (new.difetti)) then
      raise exception 'Il pregio "%" e il suo opposto non possono convivere.', k using errcode = 'P0001';
    end if;
  end loop;
  foreach k in array new.difetti loop
    if not exists (select 1 from public.dragon_trait_pairs where difetto = k) then
      raise exception 'Difetto sconosciuto: %', k using errcode = 'P0001';
    end if;
  end loop;

  -- Un PNG morto non cavalca
  if new.npc_rider_id is not null and new.npc_rider_id is distinct from old.npc_rider_id
     and exists (select 1 from public.house_npcs where id = new.npc_rider_id and deceased) then
    raise exception 'Un PNG morto non può essere cavaliere.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
