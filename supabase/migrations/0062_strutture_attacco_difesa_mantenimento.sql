-- =====================================================================
-- 0062 - Strutture: attacco, difesa e mantenimento mensile
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Ogni tipo di struttura ha un valore di attacco e uno di difesa.
-- - Mantenimento mensile (facoltativo) in risorse: il 1 del mese la
--   casata riceve gli introiti e paga il mantenimento. Se una risorsa non
--   basta paga quello che ha (il tesoro non va mai sotto zero) e nello
--   storico resta scritto quanto non e' stato pagato.
-- =====================================================================

alter table public.structure_types
  add column attack  int not null default 0 check (attack between 0 and 1000000),
  add column defense int not null default 0 check (defense between 0 and 1000000);

create table public.structure_upkeep (
  structure_type_id uuid not null references public.structure_types(id) on delete cascade,
  resource_id       uuid not null references public.resources(id) on delete cascade,
  amount            int not null check (amount between 1 and 1000000),
  primary key (structure_type_id, resource_id)
);
alter table public.structure_upkeep enable row level security;
create policy "visibili" on public.structure_upkeep for select to authenticated using (true);
create policy "economia con permesso" on public.structure_upkeep for all to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, insert, update, delete on public.structure_upkeep to authenticated;
grant select, insert, update, delete on public.structure_upkeep to service_role;

-- Introiti e mantenimento del mese
create or replace function public.pay_monthly_income(p_force boolean default false)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
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

  for r in
    select x.house_id, x.resource_id, sum(x.income)::bigint as income, sum(x.upkeep)::bigint as upkeep
    from (
      -- introiti dei feudi (dal tipo)
      select f.house_id, fti.resource_id, fti.amount as income, 0 as upkeep
      from public.fiefs f join public.fief_type_incomes fti on fti.fief_type_id = f.fief_type_id
      union all
      -- introiti delle strutture
      select f.house_id, si.resource_id, si.amount, 0
      from public.fief_structures fs join public.fiefs f on f.id = fs.fief_id
      join public.structure_incomes si on si.structure_type_id = fs.structure_type_id
      union all
      -- mantenimento delle strutture
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
        -- niente da pagare con: resta comunque scritto nello storico
        insert into public.economy_log (house_id, resource_id, delta, reason)
        values (r.house_id, r.resource_id, 0, 'Mantenimento delle strutture non pagato: mancano ' || r.upkeep);
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
