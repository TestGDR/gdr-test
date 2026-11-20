-- =====================================================================
-- 0183 - Meteo per luogo: piu' meteo nello stesso momento
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Finora il meteo era legato alla MAPPA: tutti i luoghi di una mappa avevano
-- lo stesso tempo. Ora ogni luogo (macroarea) puo' avere una regione climatica
-- sua, che vale al posto di quella della mappa (es. Approdo del Re e Dorne
-- sulla stessa mappa, con un tempo diverso). Vuoto = come la mappa.
-- =====================================================================

alter table public.locations
  add column if not exists weather_region_id uuid references public.weather_regions(id) on delete set null;

-- Regione climatica di una mappa o di un luogo: basta il permesso del meteo
-- (le regole di mappe e luoghi chiedono "mondo.gestire": chi gestisce solo il
-- meteo non riusciva a salvare)
create or replace function public.set_weather_region(p_map uuid, p_location uuid, p_region uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not (public.has_permission('meteo.gestire') or public.has_permission('mondo.gestire')) then
    raise exception 'Non hai il permesso di gestire il meteo.' using errcode = '42501';
  end if;
  if p_map is not null then
    update public.maps set weather_region_id = p_region where id = p_map;
  end if;
  if p_location is not null then
    update public.locations set weather_region_id = p_region where id = p_location;
  end if;
end;
$$;
revoke execute on function public.set_weather_region(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_weather_region(uuid, uuid, uuid) to authenticated;
