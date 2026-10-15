-- =====================================================================
-- 0151 - Navi e macchine da guerra: costi per singola unita'
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni. (Va eseguito dopo lo 0150.)
--
-- Per i gruppi "reclutabili anche una alla volta":
-- - il costo di addestramento e il mantenimento sono PER UNITA' (non ogni 10
--   o ogni 100 soldati);
-- - ogni tipo di truppa ha la sua "Manodopera per unita'" (es. una galea
--   richiede 30 uomini di equipaggio). Per le truppe normali vale 1 a soldato.
-- =====================================================================

alter table public.troop_types
  add column if not exists labor_per_unit int not null default 1 check (labor_per_unit between 0 and 100000);

-- la truppa appartiene a un gruppo con costi per singola unita'?
create or replace function public.troop_per_unit(p_troop_type uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.troop_types t join public.troop_categories c on c.id = t.category_id
     where t.id = p_troop_type and c.single_units);
$$;
grant execute on function public.troop_per_unit(uuid) to authenticated;

create or replace function public.train_troops(p_house uuid, p_troop_type uuid, p_count int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_labor uuid;
  v_type text;
  v_crew int;
  v_unit boolean;
  v_by text;
  c record;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi addestrare truppe per questa casata.' using errcode = '42501';
  end if;
  if not public.troop_batch_ok(p_troop_type, p_count) then
    raise exception 'Numero di unità non valido per questa truppa.' using errcode = 'P0001';
  end if;
  select name, labor_per_unit into v_type, v_crew from public.troop_types where id = p_troop_type;
  if v_type is null then raise exception 'Tipo di truppa non valido.' using errcode = 'P0001'; end if;
  select id into v_labor from public.resources where lower(name) = 'manodopera';
  if v_labor is null then raise exception 'Manca la risorsa Manodopera.' using errcode = 'P0001'; end if;
  v_unit := public.troop_per_unit(p_troop_type);

  -- quanto serve: manodopera (per unita') + costo della truppa (per unita', oppure ogni 10 arrotondato per eccesso)
  for c in
    select r.id, r.name,
           (case when r.id = v_labor then p_count::bigint * v_crew else 0 end
            + ceil(coalesce((select tc.amount from public.troop_training_costs tc
                              where tc.troop_type_id = p_troop_type and tc.resource_id = r.id), 0)::numeric
                   * p_count / case when v_unit then 1 else 10 end))::bigint as need
      from public.resources r
  loop
    if c.need > 0 and coalesce((select amount from public.house_resources where house_id = p_house and resource_id = c.id), 0) < c.need then
      raise exception 'Risorse insufficienti: servono % %.', c.need, c.name using errcode = 'P0001';
    end if;
  end loop;

  v_by := coalesce((select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1), 'Staff');
  for c in
    select r.id,
           (case when r.id = v_labor then p_count::bigint * v_crew else 0 end
            + ceil(coalesce((select tc.amount from public.troop_training_costs tc
                              where tc.troop_type_id = p_troop_type and tc.resource_id = r.id), 0)::numeric
                   * p_count / case when v_unit then 1 else 10 end))::bigint as need
      from public.resources r
  loop
    if c.need > 0 then
      perform public.economy_add(p_house, c.id, -c.need, 'Addestramento: ' || p_count || ' ' || v_type || ' (' || v_by || ')');
    end if;
  end loop;

  insert into public.house_troops (house_id, troop_type_id, quantity)
    values (p_house, p_troop_type, p_count)
  on conflict (house_id, troop_type_id) do update set quantity = public.house_troops.quantity + p_count;
end;
$$;
revoke execute on function public.train_troops(uuid, uuid, int) from public, anon;
grant execute on function public.train_troops(uuid, uuid, int) to authenticated;

-- Mantenimento: per unita' nei gruppi a unita' singola, ogni 100 soldati negli altri
create or replace function public.house_upkeep(p_house uuid)
returns table (resource_id uuid, army int, dragons int)
language sql stable
security definer set search_path = ''
as $$
  with a as (
    select u.resource_id,
           ceil(sum(t.quantity::numeric * u.amount
                    / case when coalesce(cat.single_units, false) then 1 else 100 end)
                * case when h.army_called then 1 else 0.25 end)::int as amount
      from public.house_troops t
      join public.troop_upkeep u on u.troop_type_id = t.troop_type_id
      join public.troop_types tt on tt.id = t.troop_type_id
      left join public.troop_categories cat on cat.id = tt.category_id
      join public.houses h on h.id = t.house_id
     where t.house_id = p_house
     group by u.resource_id, h.army_called
  ), d as (
    select r.id as resource_id,
           sum(round(s.monthly_upkeep
                     * case when 'poco affamato' = any(dr.pregi) then 0.75 else 1 end
                     * case when 'molto affamato' = any(dr.difetti) then 1.5 else 1 end))::int as amount
      from public.dragons dr
      join public.characters c on c.id = dr.rider_id
      join public.dragon_stages s on s.stage = dr.stage
      join public.resources r on lower(r.name) = 'bestiame'
     where c.house_id = p_house and dr.status = 'drago'
     group by r.id
  )
  select coalesce(a.resource_id, d.resource_id), coalesce(a.amount, 0), coalesce(d.amount, 0)
    from a full join d on d.resource_id = a.resource_id
   where auth.uid() is null or public.is_house_member(p_house) or public.house_staff();
$$;
grant execute on function public.house_upkeep(uuid) to authenticated;
