-- =====================================================================
-- 0148 - Addestrare truppe con la manodopera dei feudi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - Nuova risorsa "Manodopera": la producono i feudi ogni mese (si imposta in
--   Gestione -> Economia -> Tipi di feudo / Strutture, come le altre risorse).
-- - Ogni tipo di truppa ha un costo di addestramento ogni 10 soldati
--   (Gestione -> Eserciti -> Tipi di truppa).
-- - Il signore della casata (o lo staff) addestra gruppi da 10, 50 o 100
--   soldati: paga 1 Manodopera per soldato piu' il costo della truppa, e i
--   soldati si aggiungono subito all'esercito.
-- =====================================================================

insert into public.resources (name, description, sort_order)
select 'Manodopera', 'Uomini disponibili per lavorare o essere addestrati come soldati.', 100
where not exists (select 1 from public.resources where lower(name) = 'manodopera');

create table if not exists public.troop_training_costs (
  troop_type_id uuid not null references public.troop_types(id) on delete cascade,
  resource_id   uuid not null references public.resources(id) on delete cascade,
  amount        int  not null check (amount between 1 and 1000000), -- ogni 10 soldati
  primary key (troop_type_id, resource_id)
);
alter table public.troop_training_costs enable row level security;
drop policy if exists "visibili" on public.troop_training_costs;
create policy "visibili" on public.troop_training_costs for select to authenticated using (true);
drop policy if exists "eserciti con permesso" on public.troop_training_costs;
create policy "eserciti con permesso" on public.troop_training_costs for all to authenticated
  using (public.has_permission('eserciti.gestire')) with check (public.has_permission('eserciti.gestire'));
grant select, insert, update, delete on public.troop_training_costs to authenticated;
grant select, insert, update, delete on public.troop_training_costs to service_role;

-- Addestrare: p_count = 10, 50 o 100
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
  v_need bigint;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi addestrare truppe per questa casata.' using errcode = '42501';
  end if;
  if p_count not in (10, 50, 100) then
    raise exception 'Si addestrano gruppi da 10, 50 o 100 soldati.' using errcode = 'P0001';
  end if;
  select name into v_type from public.troop_types where id = p_troop_type;
  if v_type is null then raise exception 'Tipo di truppa non valido.' using errcode = 'P0001'; end if;
  select id into v_labor from public.resources where lower(name) = 'manodopera';
  if v_labor is null then raise exception 'Manca la risorsa Manodopera.' using errcode = 'P0001'; end if;

  -- quanto serve: 1 manodopera per soldato + il costo della truppa (ogni 10)
  for c in
    select r.id, r.name, (case when r.id = v_labor then p_count else 0 end
                          + coalesce((select tc.amount from public.troop_training_costs tc
                                       where tc.troop_type_id = p_troop_type and tc.resource_id = r.id), 0)::bigint * p_count / 10) as need
      from public.resources r
  loop
    if c.need > 0 and coalesce((select amount from public.house_resources where house_id = p_house and resource_id = c.id), 0) < c.need then
      raise exception 'Risorse insufficienti: servono % %.', c.need, c.name using errcode = 'P0001';
    end if;
  end loop;

  v_by := coalesce((select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1), 'Staff');
  for c in
    select r.id, (case when r.id = v_labor then p_count else 0 end
                  + coalesce((select tc.amount from public.troop_training_costs tc
                               where tc.troop_type_id = p_troop_type and tc.resource_id = r.id), 0)::bigint * p_count / 10) as need
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
