-- =====================================================================
-- 0123 - Un uovo lo schiude solo chi l'ha scelto
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Prima qualunque membro della casata poteva schiudere tutte le uova.
-- Ora: l'uovo scelto da un personaggio lo schiude solo lui; le uova senza
-- cavaliere le schiude solo lo staff (Gestione -> Draghi).
-- Schiudendosi, il neonato resta del suo cavaliere.
-- =====================================================================

create or replace function public.hatch_egg(p_dragon uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'uovo' then
    raise exception 'Questo non è un uovo.' using errcode = 'P0001';
  end if;
  if not public.has_permission('draghi.gestire') and not exists (
    select 1 from public.characters c
    where c.id = d.rider_id and c.owner_id = auth.uid() and c.status = 'attivo'
  ) then
    raise exception 'Puoi schiudere solo il tuo uovo.' using errcode = '42501';
  end if;
  perform public.dragon_fill_random(p_dragon, 'neonato');
end;
$$;

revoke execute on function public.hatch_egg(uuid) from public, anon;
grant execute on function public.hatch_egg(uuid) to authenticated;
