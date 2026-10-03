-- =====================================================================
-- 0032 - Draghi: il cavaliere puo' essere anche un PNG di una casata
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un drago ha un solo cavaliere: un PG (rider_id) oppure un PNG
-- (npc_rider_id), mai entrambi. Un PNG cavalca un solo drago.
-- Lo sceglie lo staff dal pannello Draghi.
-- =====================================================================

alter table public.dragons
  add column npc_rider_id uuid unique references public.house_npcs(id) on delete set null,
  add constraint dragons_un_solo_cavaliere check (rider_id is null or npc_rider_id is null);

grant update (npc_rider_id) on public.dragons to authenticated;

-- Il controllo sulle modifiche ora protegge anche il cavaliere PNG
create or replace function public.dragons_check()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  k text;
begin
  -- Chi non e' staff (e non passa dalle funzioni dei draghi) cambia solo nome e immagine
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.dragon_internal', true), '') <> '1'
     and not public.has_permission('draghi.gestire')
     and (new.house_id, new.status, new.stage, new.sex, new.color1, new.color2, new.pregi, new.difetti,
          new.temperament, new.stats, new.skills, new.unspent_points, new.rider_id, new.npc_rider_id)
         is distinct from
         (old.house_id, old.status, old.stage, old.sex, old.color1, old.color2, old.pregi, old.difetti,
          old.temperament, old.stats, old.skills, old.unspent_points, old.rider_id, old.npc_rider_id) then
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
