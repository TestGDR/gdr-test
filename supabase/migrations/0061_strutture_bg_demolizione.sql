-- =====================================================================
-- 0061 - Strutture di BG e demolizione con recupero di meta' del costo
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Strutture di BG (background): lo staff le assegna a un feudo senza
--   spendere risorse. Occupano uno spazio e rendono come le altre.
-- - Ogni struttura ricorda quanto e' costata. Demolendola la casata
--   recupera meta' del costo (arrotondata per eccesso); quelle di BG non
--   sono costate nulla e non restituiscono nulla.
-- - Demoliscono lo staff dell'economia e i ruoli di casata abilitati.
-- =====================================================================

alter table public.fief_structures
  add column is_background boolean not null default false,
  add column paid jsonb not null default '{}'; -- risorsa -> quantita' spesa

-- Costruzione: come prima, ma registra quanto e' stato pagato
create or replace function public.build_structure(p_fief uuid, p_structure_type uuid, p_character uuid default null)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  f public.fiefs;
  v_staff boolean := public.has_permission('economia.gestire');
  v_by text;
  c record;
  v_id uuid;
  v_paid jsonb := '{}';
begin
  select * into f from public.fiefs where id = p_fief;
  if f.id is null then raise exception 'Feudo non trovato'; end if;
  if not exists (select 1 from public.structure_types where id = p_structure_type) then raise exception 'Struttura non valida'; end if;

  if p_character is not null and not v_staff then
    if not exists (
      select 1 from public.characters ch join public.house_roles hr on hr.id = ch.house_role_id
      where ch.id = p_character and ch.owner_id = auth.uid() and ch.house_id = f.house_id and hr.can_build
    ) then raise exception 'Non puoi costruire in questo feudo'; end if;
    select name into v_by from public.characters where id = p_character;
  elsif v_staff then
    v_by := 'Staff';
  else
    raise exception 'Non puoi costruire in questo feudo';
  end if;

  if (select count(*) from public.fief_structures where fief_id = p_fief) >= public.fief_capacity(f.size) then
    raise exception 'Il feudo non ha piu'' spazio per altre strutture';
  end if;

  for c in select sc.resource_id, sc.amount, r.name from public.structure_costs sc join public.resources r on r.id = sc.resource_id
           where sc.structure_type_id = p_structure_type loop
    if coalesce((select amount from public.house_resources where house_id = f.house_id and resource_id = c.resource_id), 0) < c.amount then
      raise exception 'Risorse insufficienti: %', c.name;
    end if;
  end loop;

  for c in select sc.resource_id, sc.amount from public.structure_costs sc where sc.structure_type_id = p_structure_type loop
    perform public.economy_add(f.house_id, c.resource_id, -c.amount,
      'Costruzione: ' || (select name from public.structure_types where id = p_structure_type) || ' a ' || f.name);
    v_paid := v_paid || jsonb_build_object(c.resource_id::text, c.amount);
  end loop;
  insert into public.fief_structures (fief_id, structure_type_id, built_by, paid)
  values (p_fief, p_structure_type, coalesce(v_by, ''), v_paid)
  returning id into v_id;
  return v_id;
end;
$$;

-- Struttura di BG: solo staff, nessun costo
create or replace function public.assign_background_structure(p_fief uuid, p_structure_type uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  f public.fiefs;
  v_id uuid;
begin
  if not public.has_permission('economia.gestire') then raise exception 'Permesso negato'; end if;
  select * into f from public.fiefs where id = p_fief;
  if f.id is null then raise exception 'Feudo non trovato'; end if;
  if not exists (select 1 from public.structure_types where id = p_structure_type) then raise exception 'Struttura non valida'; end if;
  if (select count(*) from public.fief_structures where fief_id = p_fief) >= public.fief_capacity(f.size) then
    raise exception 'Il feudo non ha piu'' spazio per altre strutture';
  end if;
  insert into public.fief_structures (fief_id, structure_type_id, built_by, is_background)
  values (p_fief, p_structure_type, 'Background', true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Demolizione: recupera meta' di quanto speso (per eccesso). Restituisce quanto recuperato.
create or replace function public.demolish_structure(p_structure uuid, p_character uuid default null)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  s public.fief_structures;
  f public.fiefs;
  v_name text;
  e record;
  v_back jsonb := '{}';
  v_amount bigint;
begin
  select * into s from public.fief_structures where id = p_structure;
  if s.id is null then raise exception 'Struttura non trovata'; end if;
  select * into f from public.fiefs where id = s.fief_id;
  if not public.has_permission('economia.gestire') and not exists (
    select 1 from public.characters ch join public.house_roles hr on hr.id = ch.house_role_id
    where ch.id = p_character and ch.owner_id = auth.uid() and ch.house_id = f.house_id and hr.can_build
  ) then raise exception 'Non puoi demolire in questo feudo'; end if;

  select name into v_name from public.structure_types where id = s.structure_type_id;
  delete from public.fief_structures where id = p_structure;

  for e in select key, value from jsonb_each_text(s.paid) loop
    v_amount := ceil(e.value::numeric / 2);
    if v_amount > 0 and exists (select 1 from public.resources where id = e.key::uuid) then
      perform public.economy_add(f.house_id, e.key::uuid, v_amount, 'Demolizione: ' || coalesce(v_name, '?') || ' a ' || f.name || ' (recuperata meta'' del costo)');
      v_back := v_back || jsonb_build_object(e.key, v_amount);
    end if;
  end loop;
  return v_back;
end;
$$;

revoke execute on function public.assign_background_structure(uuid, uuid) from public, anon;
revoke execute on function public.demolish_structure(uuid, uuid) from public, anon;
grant execute on function public.assign_background_structure(uuid, uuid) to authenticated;
grant execute on function public.demolish_structure(uuid, uuid) to authenticated;
