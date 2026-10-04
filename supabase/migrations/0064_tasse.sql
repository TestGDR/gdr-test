-- =====================================================================
-- 0064 - Tasse: le casate feudatarie pagano la casata regnante
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Una sola casata regnante (scelta in Gestione -> Economia -> Tasse).
-- - Tutte le altre casate con feudi pagano, ogni 1 del mese, una
--   percentuale di cio' che i loro feudi producono, risorsa per risorsa.
-- - Percentuale di un feudo: per grandezza (piccolo/medio/grande) + una
--   quota per ogni struttura, fino a un massimo. Tutto modificabile.
-- - Si paga dopo introiti e mantenimento; se il tesoro non basta si paga
--   quello che c'e' e il resto resta scritto come non pagato.
-- =====================================================================

create table public.tax_settings (
  id                 boolean primary key default true check (id),
  ruling_house_id    uuid references public.houses(id) on delete set null,
  small_pct          numeric not null default 5  check (small_pct between 0 and 100),
  medium_pct         numeric not null default 10 check (medium_pct between 0 and 100),
  large_pct          numeric not null default 15 check (large_pct between 0 and 100),
  per_structure_pct  numeric not null default 1  check (per_structure_pct between 0 and 100),
  max_pct            numeric not null default 50 check (max_pct between 0 and 100)
);
insert into public.tax_settings default values;
alter table public.tax_settings enable row level security;
create policy "tasse visibili" on public.tax_settings for select to authenticated using (true);
create policy "tasse con permesso" on public.tax_settings for update to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, update on public.tax_settings to authenticated;
grant select, insert, update on public.tax_settings to service_role;

-- Percentuale di tasse di un feudo
create or replace function public.fief_tax_pct(p_fief uuid)
returns numeric
language sql stable
security definer set search_path = ''
as $$
  select least(s.max_pct,
           case f.size when 'grande' then s.large_pct when 'medio' then s.medium_pct else s.small_pct end
           + s.per_structure_pct * (select count(*) from public.fief_structures fs where fs.fief_id = f.id))
  from public.fiefs f, public.tax_settings s
  where f.id = p_fief;
$$;

-- Tasse del mese: per ogni casata feudataria e risorsa
create or replace function public.monthly_taxes()
returns table (house_id uuid, resource_id uuid, amount bigint)
language sql stable
security definer set search_path = ''
as $$
  select p.house_id, p.resource_id, sum(floor(p.produced * public.fief_tax_pct(p.fief_id) / 100))::bigint
  from (
    select f.id as fief_id, f.house_id, fti.resource_id, fti.amount as produced
    from public.fiefs f join public.fief_type_incomes fti on fti.fief_type_id = f.fief_type_id
    union all
    select f.id, f.house_id, si.resource_id, si.amount
    from public.fief_structures fs join public.fiefs f on f.id = fs.fief_id
    join public.structure_incomes si on si.structure_type_id = fs.structure_type_id
  ) p
  where p.house_id is distinct from (select ruling_house_id from public.tax_settings)
    and (select ruling_house_id from public.tax_settings) is not null
  group by p.house_id, p.resource_id
  having sum(floor(p.produced * public.fief_tax_pct(p.fief_id) / 100)) > 0;
$$;

-- Introiti, mantenimento e tasse del mese
create or replace function public.pay_monthly_income(p_force boolean default false)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
  v_ruler uuid := (select ruling_house_id from public.tax_settings);
  v_ruler_name text := (select name from public.houses where id = (select ruling_house_id from public.tax_settings));
  r record;
  v_have bigint;
  v_pay bigint;
  n int := 0;
begin
  if auth.uid() is not null and not public.has_permission('economia.gestire') then raise exception 'Permesso negato'; end if;
  if not p_force then
    if exists (select 1 from public.economy_months where month = v_month) then return 0; end if;
    insert into public.economy_months (month) values (v_month);
  end if;

  -- 1. introiti e mantenimento
  for r in
    select x.house_id, x.resource_id, sum(x.income)::bigint as income, sum(x.upkeep)::bigint as upkeep
    from (
      select f.house_id, fti.resource_id, fti.amount as income, 0 as upkeep
      from public.fiefs f join public.fief_type_incomes fti on fti.fief_type_id = f.fief_type_id
      union all
      select f.house_id, si.resource_id, si.amount, 0
      from public.fief_structures fs join public.fiefs f on f.id = fs.fief_id
      join public.structure_incomes si on si.structure_type_id = fs.structure_type_id
      union all
      select f.house_id, su.resource_id, 0, su.amount
      from public.fief_structures fs join public.fiefs f on f.id = fs.fief_id
      join public.structure_upkeep su on su.structure_type_id = fs.structure_type_id
    ) x
    group by x.house_id, x.resource_id
  loop
    if r.income > 0 then
      perform public.economy_add(r.house_id, r.resource_id, r.income,
        case when p_force then 'Introiti (distribuiti dallo staff)' else 'Introiti del mese' end);
    end if;
    if r.upkeep > 0 then
      select coalesce(amount, 0) into v_have from public.house_resources where house_id = r.house_id and resource_id = r.resource_id;
      v_pay := least(r.upkeep, coalesce(v_have, 0));
      if v_pay > 0 then
        perform public.economy_add(r.house_id, r.resource_id, -v_pay,
          'Mantenimento delle strutture' ||
          case when v_pay < r.upkeep then ' (non pagato per intero: mancano ' || (r.upkeep - v_pay) || ')' else '' end);
      else
        insert into public.economy_log (house_id, resource_id, delta, reason)
        values (r.house_id, r.resource_id, 0, 'Mantenimento delle strutture non pagato: mancano ' || r.upkeep);
      end if;
    end if;
    n := n + 1;
  end loop;

  -- 2. tasse alla casata regnante
  if v_ruler is not null then
    for r in select * from public.monthly_taxes() loop
      select coalesce(amount, 0) into v_have from public.house_resources where house_id = r.house_id and resource_id = r.resource_id;
      v_pay := least(r.amount, coalesce(v_have, 0));
      if v_pay > 0 then
        perform public.economy_add(r.house_id, r.resource_id, -v_pay,
          'Tasse a casa ' || coalesce(v_ruler_name, '?') ||
          case when v_pay < r.amount then ' (non pagate per intero: mancano ' || (r.amount - v_pay) || ')' else '' end);
        perform public.economy_add(v_ruler, r.resource_id, v_pay,
          'Tasse da casa ' || (select name from public.houses where id = r.house_id));
      else
        insert into public.economy_log (house_id, resource_id, delta, reason)
        values (r.house_id, r.resource_id, 0, 'Tasse a casa ' || coalesce(v_ruler_name, '?') || ' non pagate: mancano ' || r.amount);
      end if;
    end loop;
  end if;
  return n;
end;
$$;

revoke execute on function public.fief_tax_pct(uuid) from public, anon;
revoke execute on function public.monthly_taxes() from public, anon;
grant execute on function public.fief_tax_pct(uuid) to authenticated;
grant execute on function public.monthly_taxes() to authenticated;
