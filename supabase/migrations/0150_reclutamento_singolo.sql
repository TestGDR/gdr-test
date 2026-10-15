-- =====================================================================
-- 0150 - Gruppi di truppe reclutabili anche una unita' alla volta
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- In Gestione -> Eserciti -> Gruppi di truppe si sceglie se le unita' di un
-- gruppo (es. navi, macchine da guerra) si addestrano e si congedano anche
-- una alla volta, oltre che a gruppi da 10, 50 o 100. Il costo resta "ogni
-- 10": per numeri piu' piccoli si arrotonda per eccesso.
-- =====================================================================

alter table public.troop_categories add column if not exists single_units boolean not null default false;

-- quanti se ne possono addestrare o congedare in una volta
create or replace function public.troop_batch_ok(p_troop_type uuid, p_count int)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select p_count in (10, 50, 100)
      or (p_count = 1 and exists (
            select 1 from public.troop_types t join public.troop_categories c on c.id = t.category_id
             where t.id = p_troop_type and c.single_units));
$$;
grant execute on function public.troop_batch_ok(uuid, int) to authenticated;

create or replace function public.train_troops(p_house uuid, p_troop_type uuid, p_count int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_labor uuid;
  v_type text;
  v_by text;
  c record;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi addestrare truppe per questa casata.' using errcode = '42501';
  end if;
  if not public.troop_batch_ok(p_troop_type, p_count) then
    raise exception 'Numero di soldati non valido per questa truppa.' using errcode = 'P0001';
  end if;
  select name into v_type from public.troop_types where id = p_troop_type;
  if v_type is null then raise exception 'Tipo di truppa non valido.' using errcode = 'P0001'; end if;
  select id into v_labor from public.resources where lower(name) = 'manodopera';
  if v_labor is null then raise exception 'Manca la risorsa Manodopera.' using errcode = 'P0001'; end if;

  -- quanto serve: 1 manodopera per unita' + il costo della truppa (ogni 10, arrotondato per eccesso)
  for c in
    select r.id, r.name, (case when r.id = v_labor then p_count else 0 end
                          + ceil(coalesce((select tc.amount from public.troop_training_costs tc
                                            where tc.troop_type_id = p_troop_type and tc.resource_id = r.id), 0)::numeric * p_count / 10))::bigint as need
      from public.resources r
  loop
    if c.need > 0 and coalesce((select amount from public.house_resources where house_id = p_house and resource_id = c.id), 0) < c.need then
      raise exception 'Risorse insufficienti: servono % %.', c.need, c.name using errcode = 'P0001';
    end if;
  end loop;

  v_by := coalesce((select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1), 'Staff');
  for c in
    select r.id, (case when r.id = v_labor then p_count else 0 end
                  + ceil(coalesce((select tc.amount from public.troop_training_costs tc
                                    where tc.troop_type_id = p_troop_type and tc.resource_id = r.id), 0)::numeric * p_count / 10))::bigint as need
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

create or replace function public.dismiss_troops(p_house uuid, p_troop_type uuid, p_count int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_have int;
  v_type text;
  v_by text;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi congedare truppe di questa casata.' using errcode = '42501';
  end if;
  if not public.troop_batch_ok(p_troop_type, p_count) then
    raise exception 'Numero di soldati non valido per questa truppa.' using errcode = 'P0001';
  end if;
  select quantity into v_have from public.house_troops where house_id = p_house and troop_type_id = p_troop_type for update;
  if coalesce(v_have, 0) < p_count then
    raise exception 'La casata non ha abbastanza unità di questo tipo.' using errcode = 'P0001';
  end if;
  select name into v_type from public.troop_types where id = p_troop_type;
  if v_have = p_count then
    delete from public.house_troops where house_id = p_house and troop_type_id = p_troop_type;
  else
    update public.house_troops set quantity = quantity - p_count where house_id = p_house and troop_type_id = p_troop_type;
  end if;
  v_by := coalesce((select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1), 'Staff');
  insert into public.economy_log (house_id, resource_id, delta, reason)
    values (p_house, null, 0, 'Congedati ' || p_count || ' ' || coalesce(v_type, '?') || ' (' || v_by || ')');
end;
$$;
revoke execute on function public.dismiss_troops(uuid, uuid, int) from public, anon;
grant execute on function public.dismiss_troops(uuid, uuid, int) to authenticated;
