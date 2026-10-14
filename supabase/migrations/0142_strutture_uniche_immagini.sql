-- =====================================================================
-- 0142 - Strutture: una sola per tipo in ogni feudo, e immagine facoltativa
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - In un feudo non si possono avere due strutture uguali (costruite o di BG).
-- - Ogni tipo di struttura puo' avere un'immagine (indirizzo https), che si
--   vede nelle caselle del feudo (Gestione -> Economia -> Strutture).
-- =====================================================================

alter table public.structure_types
  add column if not exists image_url text check (image_url is null or image_url ~ '^https://');

-- il vincolo vero: due strutture uguali nello stesso feudo non possono esistere
create unique index if not exists fief_structures_unica_per_feudo
  on public.fief_structures (fief_id, structure_type_id);

-- Costruire: come prima, ma con un messaggio chiaro se la struttura c'e' gia'
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

  if exists (select 1 from public.fief_structures where fief_id = p_fief and structure_type_id = p_structure_type) then
    raise exception 'Questa struttura c''è già nel feudo';
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

-- Struttura di BG (staff): stesso controllo
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
  if exists (select 1 from public.fief_structures where fief_id = p_fief and structure_type_id = p_structure_type) then
    raise exception 'Questa struttura c''è già nel feudo';
  end if;
  if (select count(*) from public.fief_structures where fief_id = p_fief) >= public.fief_capacity(f.size) then
    raise exception 'Il feudo non ha piu'' spazio per altre strutture';
  end if;
  insert into public.fief_structures (fief_id, structure_type_id, built_by, is_background)
  values (p_fief, p_structure_type, 'Background', true)
  returning id into v_id;
  return v_id;
end;
$$;
