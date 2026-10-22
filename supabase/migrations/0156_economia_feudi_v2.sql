-- =====================================================================
-- 0156 - Economia dei feudi, seconda versione del documento
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- Regole nuove:
-- - Esercito: mantenimento ogni 1000 soldati uguale per tutte le truppe
--   (Alimenti 8, Oro 10, Ferro 2, Cavalli 1; Gestione -> Economia).
--   Soldati in riserva: pagano un quarto, si richiamano quando si vuole.
--   Esercito congedato per intero: paga un quarto (come prima).
-- - Guerra (la decide lo staff): truppe in campo x3, piu' 1 Alimento ogni
--   100 soldati; la riserva torna a costo pieno; la Manodopera prodotta dai
--   feudi cala del 15%.
-- - Intendenza: -12% al mantenimento dei soldati (campo nuovo delle
--   strutture, "riduzione del mantenimento dei soldati").
-- - Draghi: pagati dalla casata del cavaliere (senza cavaliere: dalla casata
--   del drago). Se il Bestiame dei draghi non basta, i draghi della casata
--   diventano Affamati e il loro mantenimento raddoppia finche' un mese non
--   viene pagato per intero.
-- - Mercato PNG di emergenza: si compra a 2 Oro l'unita', si vende a 0,5,
--   al massimo 80 unita' per risorsa al mese per casata.
-- - Ordine del 1 del mese: introiti, mantenimento (feudi, strutture,
--   esercito, draghi), tasse; poi le tratte; poi l'umore del popolo.
--
-- Dati: tipi di feudo, 29 strutture, tipi e strutture iniziali dei feudi,
-- scorte iniziali, tasse dimezzate, minimi da granaio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Impostazioni nuove
-- ---------------------------------------------------------------------
alter table public.economy_settings
  add column if not exists reserve_factor       numeric(4,2) not null default 0.25 check (reserve_factor between 0 and 1),
  add column if not exists war_factor           numeric(4,2) not null default 3    check (war_factor between 0 and 20),
  add column if not exists war_forage_per_100   numeric(6,2) not null default 1    check (war_forage_per_100 between 0 and 1000),
  add column if not exists war_labor_cut        numeric(4,2) not null default 0.15 check (war_labor_cut between 0 and 1),
  add column if not exists dragon_hunger_factor numeric(4,2) not null default 2    check (dragon_hunger_factor between 1 and 10),
  add column if not exists npc_buy_price        numeric(6,2) not null default 2    check (npc_buy_price between 0 and 1000),
  add column if not exists npc_sell_price       numeric(6,2) not null default 0.5  check (npc_sell_price between 0 and 1000),
  add column if not exists npc_monthly_limit    int          not null default 80   check (npc_monthly_limit between 0 and 1000000);

alter table public.houses
  add column if not exists reserve_soldiers int not null default 0 check (reserve_soldiers >= 0),
  add column if not exists at_war           boolean not null default false,
  add column if not exists dragons_hungry   boolean not null default false;

alter table public.structure_types
  add column if not exists soldier_upkeep_cut numeric(5,2) not null default 0 check (soldier_upkeep_cut between 0 and 100);

-- Mantenimento dell'esercito ogni 1000 soldati (tutte le truppe)
create table if not exists public.army_upkeep (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  per_1000    numeric(10,2) not null check (per_1000 > 0 and per_1000 <= 1000000)
);
alter table public.army_upkeep enable row level security;
drop policy if exists "visibili" on public.army_upkeep;
create policy "visibili" on public.army_upkeep for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.army_upkeep;
create policy "economia con permesso" on public.army_upkeep for all to authenticated
  using (public.house_staff()) with check (public.house_staff());
grant select, insert, update, delete on public.army_upkeep to authenticated;
grant select, insert, update, delete on public.army_upkeep to service_role;

-- Mercato PNG: quanto ha comprato e venduto ogni casata nel mese
create table if not exists public.npc_market_usage (
  house_id    uuid not null references public.houses(id) on delete cascade,
  month       date not null,
  resource_id uuid not null references public.resources(id) on delete cascade,
  bought      int not null default 0,
  sold        int not null default 0,
  primary key (house_id, month, resource_id)
);
alter table public.npc_market_usage enable row level security;
drop policy if exists "della casata" on public.npc_market_usage;
create policy "della casata" on public.npc_market_usage for select to authenticated
  using (public.is_house_member(house_id) or public.house_staff());
grant select on public.npc_market_usage to authenticated;
grant select, insert, update, delete on public.npc_market_usage to service_role;

-- ---------------------------------------------------------------------
-- Produzione dei feudi: in guerra la Manodopera cala
-- ---------------------------------------------------------------------
create or replace function public.fief_production()
returns table (fief_id uuid, house_id uuid, resource_id uuid, income bigint, upkeep bigint)
language sql stable
security definer set search_path = ''
as $$
  with f as (
    select fi.*, public.fief_size_factor(fi.size) as sf,
           (select secondary_factor from public.economy_settings) as sec
    from public.fiefs fi
  ), u as (
    -- tipo principale
    select f.id as fief_id, f.house_id, x.resource_id, round(x.amount * f.sf)::bigint as income, 0::bigint as upkeep
    from f join public.fief_type_incomes x on x.fief_type_id = f.fief_type_id
    union all
    select f.id, f.house_id, x.resource_id, 0, round(x.amount * f.sf)::bigint
    from f join public.fief_type_upkeep x on x.fief_type_id = f.fief_type_id
    -- secondo tipo, in parte
    union all
    select f.id, f.house_id, x.resource_id, round(x.amount * f.sf * f.sec)::bigint, 0
    from f join public.fief_type_incomes x on x.fief_type_id = f.fief_type2_id
    union all
    select f.id, f.house_id, x.resource_id, 0, round(x.amount * f.sf * f.sec)::bigint
    from f join public.fief_type_upkeep x on x.fief_type_id = f.fief_type2_id
    -- strutture
    union all
    select f.id, f.house_id, si.resource_id, si.amount, 0
    from public.fief_structures fs join f on f.id = fs.fief_id
    join public.structure_incomes si on si.structure_type_id = fs.structure_type_id
    union all
    select f.id, f.house_id, su.resource_id, 0, su.amount
    from public.fief_structures fs join f on f.id = fs.fief_id
    join public.structure_upkeep su on su.structure_type_id = fs.structure_type_id
  )
  select u.fief_id, u.house_id, u.resource_id,
         case when h.at_war and lower(r.name) = 'manodopera'
              then round(u.income * (1 - (select war_labor_cut from public.economy_settings)))::bigint
              else u.income end,
         u.upkeep
    from u
    join public.houses h on h.id = u.house_id
    join public.resources r on r.id = u.resource_id;
$$;
revoke execute on function public.fief_production() from public, anon;

-- ---------------------------------------------------------------------
-- Mantenimento mensile di esercito e draghi di una casata
-- ---------------------------------------------------------------------
create or replace function public.house_upkeep(p_house uuid)
returns table (resource_id uuid, army int, dragons int)
language sql stable
security definer set search_path = ''
as $$
  with s as (
    select * from public.economy_settings limit 1
  ), k as (
    select h.army_called, h.at_war, h.dragons_hungry,
           t.n,
           least(h.reserve_soldiers, t.n) as reserve,
           t.n - least(h.reserve_soldiers, t.n) as field,
           -- Intendenza (o altre strutture con una riduzione): vale la piu' alta
           1 - coalesce((select max(st.soldier_upkeep_cut)
                           from public.fief_structures fs
                           join public.fiefs f on f.id = fs.fief_id
                           join public.structure_types st on st.id = fs.structure_type_id
                          where f.house_id = p_house), 0) / 100 as steward
      from public.houses h
      cross join lateral (select coalesce(sum(q.quantity), 0)::numeric as n from public.house_troops q where q.house_id = h.id) t
     where h.id = p_house
  ), eq as (
    -- soldati "a costo pieno": congedati 1/4; in pace la riserva 1/4;
    -- in guerra le truppe in campo x3 e la riserva a costo pieno
    select k.*, s.war_forage_per_100,
           case when not k.army_called then k.n * s.reserve_factor
                when k.at_war then k.field * s.war_factor + k.reserve
                else k.field + k.reserve * s.reserve_factor end as full_eq
      from k, s
  ), a as (
    -- regola generale ogni 1000 soldati
    select au.resource_id, eq.full_eq * au.per_1000 / 1000 * eq.steward as amount
      from public.army_upkeep au, eq
    union all
    -- foraggio della campagna
    select r.id, eq.field / 100 * eq.war_forage_per_100 * eq.steward
      from eq join public.resources r on lower(r.name) = 'alimenti agricoli'
     where eq.army_called and eq.at_war
    union all
    -- eventuale mantenimento proprio di un tipo di truppa (Gestione -> Eserciti)
    select u.resource_id,
           t.quantity::numeric * u.amount / case when coalesce(cat.single_units, false) then 1 else 100 end
           * case when eq.n > 0 then eq.full_eq / eq.n else 0 end * eq.steward
      from public.house_troops t
      join public.troop_upkeep u on u.troop_type_id = t.troop_type_id
      join public.troop_types tt on tt.id = t.troop_type_id
      left join public.troop_categories cat on cat.id = tt.category_id
      cross join eq
     where t.house_id = p_house
  ), asum as (
    select a.resource_id, ceil(sum(a.amount))::int as amount from a group by a.resource_id having ceil(sum(a.amount)) > 0
  ), d as (
    -- draghi: li paga la casata del cavaliere, o quella del drago se non ha cavaliere
    select r.id as resource_id,
           sum(round(st.monthly_upkeep
                     * case when 'poco affamato' = any(dr.pregi) then 0.75 else 1 end
                     * case when 'molto affamato' = any(dr.difetti) then 1.5 else 1 end
                     * case when k.dragons_hungry then s.dragon_hunger_factor else 1 end))::int as amount
      from public.dragons dr
      left join public.characters c on c.id = dr.rider_id
      join public.dragon_stages st on st.stage = dr.stage
      join public.resources r on lower(r.name) = 'bestiame'
      cross join k
      cross join s
     where coalesce(c.house_id, dr.house_id) = p_house and dr.status = 'drago'
     group by r.id
  )
  select coalesce(asum.resource_id, d.resource_id), coalesce(asum.amount, 0), coalesce(d.amount, 0)
    from asum full join d on d.resource_id = asum.resource_id
   where auth.uid() is null or public.is_house_member(p_house) or public.house_staff();
$$;
grant execute on function public.house_upkeep(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Il 1 del mese: introiti, mantenimento, tasse
-- ---------------------------------------------------------------------
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
  h record;
  v_have bigint;
  v_pay bigint;
  v_hungry boolean;
  n int := 0;
begin
  if auth.uid() is not null and not public.has_permission('economia.gestire') then raise exception 'Permesso negato'; end if;
  if not p_force then
    if exists (select 1 from public.economy_months where month = v_month) then return 0; end if;
    insert into public.economy_months (month) values (v_month);
  end if;

  -- 1. introiti di feudi e strutture
  for r in
    select p.house_id, p.resource_id, sum(p.income)::bigint as income
    from public.fief_production() p
    group by p.house_id, p.resource_id
    having sum(p.income) > 0
  loop
    perform public.economy_add(r.house_id, r.resource_id, r.income,
      case when p_force then 'Introiti (distribuiti dallo staff)' else 'Introiti del mese' end);
    n := n + 1;
  end loop;

  -- 2a. mantenimento di feudi, strutture ed esercito (mai sotto zero)
  for r in
    select x.house_id, x.resource_id, sum(x.upkeep)::bigint as upkeep
    from (
      select p.house_id, p.resource_id, p.upkeep from public.fief_production() p
      union all
      select hh.id, u.resource_id, u.army::bigint
        from public.houses hh cross join lateral public.house_upkeep(hh.id) u
       where hh.playable
    ) x
    group by x.house_id, x.resource_id
    having sum(x.upkeep) > 0
  loop
    select coalesce(amount, 0) into v_have from public.house_resources where house_id = r.house_id and resource_id = r.resource_id;
    v_pay := least(r.upkeep, coalesce(v_have, 0));
    if v_pay > 0 then
      perform public.economy_add(r.house_id, r.resource_id, -v_pay,
        'Mantenimento di feudi, strutture ed esercito' ||
        case when v_pay < r.upkeep then ' (non pagato per intero: mancano ' || (r.upkeep - v_pay) || ')' else '' end);
    else
      insert into public.economy_log (house_id, resource_id, delta, reason)
      values (r.house_id, r.resource_id, 0, 'Mantenimento di feudi, strutture ed esercito non pagato: mancano ' || r.upkeep);
    end if;
  end loop;

  -- 2b. draghi: se non si pagano per intero diventano Affamati (il mese dopo costano il doppio)
  for h in select id from public.houses where playable loop
    v_hungry := false;
    for r in select u.resource_id, u.dragons from public.house_upkeep(h.id) u where u.dragons > 0 loop
      select coalesce(amount, 0) into v_have from public.house_resources where house_id = h.id and resource_id = r.resource_id;
      v_pay := least(r.dragons::bigint, coalesce(v_have, 0));
      if v_pay > 0 then
        perform public.economy_add(h.id, r.resource_id, -v_pay,
          'Mantenimento dei draghi' ||
          case when v_pay < r.dragons then ' (non pagato per intero: mancano ' || (r.dragons - v_pay) || ')' else '' end);
      end if;
      if v_pay < r.dragons then
        v_hungry := true;
        if v_pay = 0 then
          insert into public.economy_log (house_id, resource_id, delta, reason)
          values (h.id, r.resource_id, 0, 'Mantenimento dei draghi non pagato: mancano ' || r.dragons);
        end if;
      end if;
    end loop;
    update public.houses set dragons_hungry = v_hungry where id = h.id and dragons_hungry is distinct from v_hungry;
    if v_hungry then
      insert into public.economy_log (house_id, resource_id, delta, reason)
      values (h.id, null, 0, 'I draghi sono Affamati: il mese prossimo il loro mantenimento raddoppia');
    end if;
  end loop;

  -- 3. tasse alla casata regnante (con quello che resta)
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

-- L'umore del popolo resta alla fine del giro (dopo le tratte): il
-- mantenimento ora si paga insieme agli introiti, qui solo gli avvisi
create or replace function public.run_house_upkeep(p_force boolean default false)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
  h record;
  v_worst record;
  v_detail text;
  s record;
  n int := 0;
begin
  if auth.uid() is not null and not public.house_staff() then raise exception 'Permesso negato'; end if;
  if not p_force then
    if exists (select 1 from public.upkeep_months where month = v_month) then return 0; end if;
    insert into public.upkeep_months (month) values (v_month);
  end if;

  for h in select id, name from public.houses where playable loop
    select m.score, m.label, m.alert into v_worst from public.house_mood(h.id) m order by m.score limit 1;
    select string_agg(r.name || ' ' || m.have || ' su ' || m.need, ', ' order by r.sort_order, r.name)
      into v_detail
      from public.house_mood(h.id) m join public.resources r on r.id = m.resource_id;
    if v_worst.alert then
      n := n + 1;
      for s in
        select distinct on (c.owner_id) c.id
          from public.characters c
          join public.profiles p on p.id = c.owner_id
          left join public.staff_roles sr on sr.id = p.staff_role_id
         where not c.is_npc
           and (p.role = 'admin' or 'economia.gestire' = any(coalesce(sr.permissions, '{}')))
         order by c.owner_id, c.created_at
      loop
        perform public.send_system_message(s.id,
          'Casa ' || h.name || ': umore del popolo ' || v_worst.label || ' (' || v_worst.score || ' su 100). Scorte rispetto al minimo: ' ||
          coalesce(v_detail, '') || '. Decidete voi in gioco che cosa succede.');
      end loop;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.run_house_upkeep(boolean) from public, anon;
grant execute on function public.run_house_upkeep(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Riserva e guerra
-- ---------------------------------------------------------------------
-- Soldati in riserva: li decide chi comanda la casata (o lo staff)
create or replace function public.set_army_reserve(p_house uuid, p_count int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_total int;
  v_by text;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi comandare l''esercito di questa casata.' using errcode = '42501';
  end if;
  select coalesce(sum(quantity), 0) into v_total from public.house_troops where house_id = p_house;
  if p_count is null or p_count < 0 or p_count > v_total then
    raise exception 'La riserva va da 0 a % soldati.', v_total using errcode = 'P0001';
  end if;
  update public.houses set reserve_soldiers = p_count where id = p_house;
  v_by := coalesce((select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1), 'Staff');
  insert into public.economy_log (house_id, resource_id, delta, reason)
    values (p_house, null, 0, 'Soldati in riserva: ' || p_count || ' (deciso da ' || v_by || ')');
end;
$$;
revoke execute on function public.set_army_reserve(uuid, int) from public, anon;
grant execute on function public.set_army_reserve(uuid, int) to authenticated;

-- In guerra / in pace: solo lo staff
create or replace function public.set_house_at_war(p_house uuid, p_war boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.house_staff() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.houses set at_war = p_war where id = p_house;
  if not found then raise exception 'Casata non trovata.' using errcode = 'P0001'; end if;
  insert into public.economy_log (house_id, resource_id, delta, reason)
    values (p_house, null, 0, case when p_war then 'La casata entra in guerra' else 'La casata torna in pace' end);
end;
$$;
revoke execute on function public.set_house_at_war(uuid, boolean) from public, anon;
grant execute on function public.set_house_at_war(uuid, boolean) to authenticated;

-- Lo staff puo' togliere a mano lo stato Affamato
create or replace function public.set_dragons_hungry(p_house uuid, p_hungry boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.house_staff() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.houses set dragons_hungry = p_hungry where id = p_house;
end;
$$;
revoke execute on function public.set_dragons_hungry(uuid, boolean) from public, anon;
grant execute on function public.set_dragons_hungry(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Mercato PNG di emergenza
-- ---------------------------------------------------------------------
create or replace function public.npc_market_trade(p_house uuid, p_resource uuid, p_qty int, p_buy boolean)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  s public.economy_settings;
  v_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
  v_gold uuid := (select id from public.resources where lower(name) = 'oro');
  v_res public.resources;
  v_used int;
  v_have bigint;
  v_gold_n bigint;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi gestire le risorse di questa casata.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.houses where id = p_house and playable) then
    raise exception 'Le casate PNG non usano il mercato.' using errcode = 'P0001';
  end if;
  select * into s from public.economy_settings limit 1;
  select * into v_res from public.resources where id = p_resource;
  if v_res.id is null or not v_res.tradable or v_res.id = v_gold then
    raise exception 'Questa risorsa non si scambia al mercato.' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantità non valida.' using errcode = 'P0001'; end if;

  insert into public.npc_market_usage (house_id, month, resource_id) values (p_house, v_month, p_resource)
  on conflict do nothing;
  select case when p_buy then bought else sold end into v_used
    from public.npc_market_usage where house_id = p_house and month = v_month and resource_id = p_resource
    for update;
  if v_used + p_qty > s.npc_monthly_limit then
    raise exception 'Questo mese puoi % ancora % % al mercato.', case when p_buy then 'comprare' else 'vendere' end,
      greatest(s.npc_monthly_limit - v_used, 0), v_res.name using errcode = 'P0001';
  end if;

  if p_buy then
    v_gold_n := ceil(p_qty * s.npc_buy_price);
    select coalesce(amount, 0) into v_have from public.house_resources where house_id = p_house and resource_id = v_gold;
    if coalesce(v_have, 0) < v_gold_n then
      raise exception 'Servono % Oro: il tesoro non basta.', v_gold_n using errcode = 'P0001';
    end if;
    perform public.economy_add(p_house, v_gold, -v_gold_n, 'Mercato PNG: comprati ' || p_qty || ' ' || v_res.name);
    perform public.economy_add(p_house, p_resource, p_qty, 'Mercato PNG: comprati per ' || v_gold_n || ' Oro');
    update public.npc_market_usage set bought = bought + p_qty where house_id = p_house and month = v_month and resource_id = p_resource;
    return 'Comprati ' || p_qty || ' ' || v_res.name || ' per ' || v_gold_n || ' Oro.';
  else
    select coalesce(amount, 0) into v_have from public.house_resources where house_id = p_house and resource_id = p_resource;
    if coalesce(v_have, 0) < p_qty then
      raise exception 'La casata non ha % %.', p_qty, v_res.name using errcode = 'P0001';
    end if;
    v_gold_n := floor(p_qty * s.npc_sell_price);
    perform public.economy_add(p_house, p_resource, -p_qty, 'Mercato PNG: venduti per ' || v_gold_n || ' Oro');
    if v_gold_n > 0 then
      perform public.economy_add(p_house, v_gold, v_gold_n, 'Mercato PNG: venduti ' || p_qty || ' ' || v_res.name);
    end if;
    update public.npc_market_usage set sold = sold + p_qty where house_id = p_house and month = v_month and resource_id = p_resource;
    return 'Venduti ' || p_qty || ' ' || v_res.name || ' per ' || v_gold_n || ' Oro.';
  end if;
end;
$$;
revoke execute on function public.npc_market_trade(uuid, uuid, int, boolean) from public, anon;
grant execute on function public.npc_market_trade(uuid, uuid, int, boolean) to authenticated;

-- =====================================================================
-- DATI
-- =====================================================================

-- Mantenimento dell'esercito ogni 1000 soldati
insert into public.army_upkeep (resource_id, per_1000)
select r.id, v.a
from (values ('alimenti agricoli', 8), ('oro', 10), ('ferro', 2), ('cavalli', 1)) as v(n, a)
join public.resources r on lower(r.name) = v.n
on conflict (resource_id) do nothing;

-- Tipi di feudo (valori del feudo piccolo)
update public.fief_types t set description = v.d
from (values
  ('agricolo', 'Alimenti, Bestiame e Cavalli. Unico tipo che produce Bestiame.'),
  ('militare', 'Manodopera, Legname, Pietra e Cavalli. Ha un mantenimento proprio.'),
  ('commerciale', 'Molto Oro e Beni di lusso.'),
  ('minerario', 'Ferro, Pietra e Oro.'),
  ('costiero', 'Oro e Alimenti dal mare. Può costruire Porto, Peschiera e Cantiere navale.')
) as v(n, d)
where lower(t.name) = v.n;

delete from public.fief_type_incomes
 where fief_type_id in (select id from public.fief_types
                         where lower(name) in ('agricolo', 'militare', 'commerciale', 'minerario', 'costiero'));
insert into public.fief_type_incomes (fief_type_id, resource_id, amount)
select t.id, r.id, v.a
from (values
  ('agricolo', 'alimenti agricoli', 24), ('agricolo', 'bestiame', 14), ('agricolo', 'cavalli', 6),
  ('agricolo', 'manodopera', 16), ('agricolo', 'oro', 6),
  ('commerciale', 'oro', 30), ('commerciale', 'beni di lusso', 10), ('commerciale', 'manodopera', 14),
  ('commerciale', 'alimenti agricoli', 6),
  ('costiero', 'oro', 22), ('costiero', 'alimenti agricoli', 20), ('costiero', 'manodopera', 14),
  ('costiero', 'beni di lusso', 4),
  ('militare', 'manodopera', 30), ('militare', 'pietra', 16), ('militare', 'cavalli', 12),
  ('militare', 'legname', 18), ('militare', 'oro', 6),
  ('minerario', 'ferro', 16), ('minerario', 'pietra', 18), ('minerario', 'manodopera', 12), ('minerario', 'oro', 14)
) as v(t, r, a)
join public.fief_types t on lower(t.name) = v.t
join public.resources r on lower(r.name) = v.r;

delete from public.fief_type_upkeep
 where fief_type_id in (select id from public.fief_types
                         where lower(name) in ('agricolo', 'militare', 'commerciale', 'minerario', 'costiero'));
insert into public.fief_type_upkeep (fief_type_id, resource_id, amount)
select t.id, r.id, v.a
from (values ('militare', 'alimenti agricoli', 10), ('militare', 'oro', 6)) as v(t, r, a)
join public.fief_types t on lower(t.name) = v.t
join public.resources r on lower(r.name) = v.r;

-- Strutture (29): le 12 nuove si creano, poi si riscrivono tutte
insert into public.structure_types (name) values
  ('Pascoli dei draghi'), ('Haras'), ('Peschiera'), ('Conceria'), ('Borgo'), ('Orti e granai'),
  ('Locanda'), ('Emporio dei lussi'), ('Accampamento d''addestramento'), ('Arsenale'), ('Mura e fossato'), ('Intendenza')
on conflict do nothing;

drop table if exists tmp_strutture;
create temporary table tmp_strutture (n text, c text, o int, att int, def int, cut numeric, d text);
insert into tmp_strutture values
  ('mulino', 'Produzione', 0, 0, 0, 0, ''),
  ('allevamento', 'Produzione', 1, 0, 0, 0, ''),
  ('pascoli dei draghi', 'Produzione', 2, 0, 0, 0, 'Grandi pascoli: serve soprattutto a nutrire i draghi.'),
  ('segheria', 'Produzione', 3, 0, 0, 0, ''),
  ('cava', 'Produzione', 4, 0, 0, 0, ''),
  ('miniera', 'Produzione', 5, 0, 0, 0, ''),
  ('scuderie', 'Produzione', 6, 0, 0, 0, ''),
  ('haras', 'Produzione', 7, 10, 0, 0, 'Allevamento di destrieri da guerra (cavalleria).'),
  ('vigneti e telai', 'Produzione', 8, 0, 0, 0, ''),
  ('peschiera', 'Produzione', 9, 0, 0, 0, 'Pesca e saline: cibo per i feudi sul mare.'),
  ('conceria', 'Produzione', 10, 0, 0, 0, 'Trasforma bestiame in pelli, lana e cibo.'),
  ('borgo', 'Produzione', 11, 0, 0, 0, 'Villaggio: più uomini da addestrare.'),
  ('orti e granai', 'Produzione', 12, 0, 0, 0, 'Cibo extra per le casate non agricole.'),
  ('mercato', 'Commercio e prestigio', 13, 0, 0, 0, ''),
  ('porto', 'Commercio e prestigio', 14, 0, 0, 0, 'Solo feudi sul mare.'),
  ('magazzino', 'Commercio e prestigio', 15, 0, 0, 0, ''),
  ('locanda', 'Commercio e prestigio', 16, 0, 0, 0, 'Taverna e locanda: oro dai viandanti.'),
  ('tempio', 'Commercio e prestigio', 17, 0, 0, 0, 'Incensi e paramenti: consuma beni di lusso.'),
  ('emporio dei lussi', 'Commercio e prestigio', 18, 0, 0, 0, 'Commercio di merci pregiate.'),
  ('torre di guardia', 'Militari', 19, 0, 5, 0, ''),
  ('caserma', 'Militari', 20, 10, 0, 0, ''),
  ('accampamento d''addestramento', 'Militari', 21, 15, 0, 0, 'Addestra truppe fresche.'),
  ('fucina d''armi', 'Militari', 22, 10, 0, 0, ''),
  ('arsenale', 'Militari', 23, 20, 0, 0, 'Armi e macchine da guerra in serie.'),
  ('cantiere navale', 'Militari', 24, 10, 0, 0, 'Attacco navale. Solo feudi sul mare.'),
  ('mura e fossato', 'Militari', 25, 0, 15, 0, 'Cinta muraria: riparazioni continue.'),
  ('fortezza', 'Militari', 26, 0, 20, 0, ''),
  ('fossa dei draghi', 'Militari', 27, 0, 20, 0, 'Solo prestigio e difesa. Il consumo dei draghi è calcolato a parte.'),
  ('intendenza', 'Militari', 28, 0, 0, 12, 'Riduce del 12% il mantenimento dei soldati (tutte le risorse). Una per feudo.');

update public.structure_types s
   set category = v.c, sort_order = v.o, attack = v.att, defense = v.def, soldier_upkeep_cut = v.cut,
       description = case when v.d = '' then s.description else v.d end
  from tmp_strutture v
 where lower(s.name) = v.n;

delete from public.structure_costs where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);
delete from public.structure_incomes where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);
delete from public.structure_upkeep where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);
delete from public.structure_fief_types where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);

insert into public.structure_costs (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'legname', 100), ('mulino', 'pietra', 100),
  ('allevamento', 'legname', 100), ('allevamento', 'manodopera', 100), ('allevamento', 'bestiame', 50),
  ('pascoli dei draghi', 'legname', 100), ('pascoli dei draghi', 'manodopera', 100), ('pascoli dei draghi', 'cavalli', 50), ('pascoli dei draghi', 'bestiame', 50),
  ('segheria', 'legname', 100), ('segheria', 'ferro', 100),
  ('cava', 'legname', 100), ('cava', 'ferro', 100),
  ('miniera', 'legname', 100), ('miniera', 'oro', 100),
  ('scuderie', 'legname', 100), ('scuderie', 'pietra', 100),
  ('haras', 'legname', 100), ('haras', 'pietra', 100), ('haras', 'cavalli', 100),
  ('vigneti e telai', 'legname', 100), ('vigneti e telai', 'oro', 100),
  ('peschiera', 'legname', 100), ('peschiera', 'oro', 50),
  ('conceria', 'legname', 100), ('conceria', 'pietra', 100),
  ('borgo', 'legname', 100), ('borgo', 'pietra', 50), ('borgo', 'alimenti agricoli', 50),
  ('orti e granai', 'legname', 100), ('orti e granai', 'pietra', 50), ('orti e granai', 'oro', 50),
  ('mercato', 'legname', 100), ('mercato', 'pietra', 100),
  ('porto', 'legname', 100), ('porto', 'pietra', 100), ('porto', 'ferro', 100),
  ('magazzino', 'legname', 100), ('magazzino', 'pietra', 100),
  ('locanda', 'legname', 100), ('locanda', 'pietra', 50), ('locanda', 'oro', 50), ('locanda', 'alimenti agricoli', 50),
  ('tempio', 'pietra', 100), ('tempio', 'oro', 100), ('tempio', 'beni di lusso', 50),
  ('emporio dei lussi', 'pietra', 100), ('emporio dei lussi', 'oro', 100), ('emporio dei lussi', 'beni di lusso', 100),
  ('torre di guardia', 'pietra', 100), ('torre di guardia', 'legname', 100),
  ('caserma', 'legname', 100), ('caserma', 'pietra', 100), ('caserma', 'alimenti agricoli', 50),
  ('accampamento d''addestramento', 'legname', 100), ('accampamento d''addestramento', 'pietra', 100),
  ('accampamento d''addestramento', 'manodopera', 100), ('accampamento d''addestramento', 'alimenti agricoli', 100),
  ('fucina d''armi', 'pietra', 100), ('fucina d''armi', 'ferro', 100),
  ('arsenale', 'pietra', 200), ('arsenale', 'ferro', 200), ('arsenale', 'legname', 100),
  ('cantiere navale', 'legname', 100), ('cantiere navale', 'ferro', 100), ('cantiere navale', 'oro', 100),
  ('mura e fossato', 'pietra', 300), ('mura e fossato', 'legname', 100),
  ('fortezza', 'pietra', 200), ('fortezza', 'ferro', 100), ('fortezza', 'oro', 100),
  ('fossa dei draghi', 'pietra', 200), ('fossa dei draghi', 'ferro', 100), ('fossa dei draghi', 'oro', 100),
  ('intendenza', 'legname', 100), ('intendenza', 'pietra', 100), ('intendenza', 'oro', 50)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

insert into public.structure_incomes (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'alimenti agricoli', 20),
  ('allevamento', 'bestiame', 18),
  ('pascoli dei draghi', 'bestiame', 25),
  ('segheria', 'legname', 20),
  ('cava', 'pietra', 20),
  ('miniera', 'ferro', 16),
  ('scuderie', 'cavalli', 12),
  ('haras', 'cavalli', 20),
  ('vigneti e telai', 'beni di lusso', 10),
  ('peschiera', 'alimenti agricoli', 15),
  ('conceria', 'beni di lusso', 8), ('conceria', 'alimenti agricoli', 6),
  ('borgo', 'manodopera', 12),
  ('orti e granai', 'alimenti agricoli', 12),
  ('mercato', 'oro', 20),
  ('porto', 'oro', 30), ('porto', 'legname', 5),
  ('magazzino', 'alimenti agricoli', 8), ('magazzino', 'bestiame', 5), ('magazzino', 'legname', 5),
  ('locanda', 'oro', 15),
  ('tempio', 'oro', 15),
  ('emporio dei lussi', 'oro', 25)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

insert into public.structure_upkeep (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'manodopera', 3),
  ('allevamento', 'alimenti agricoli', 5),
  ('pascoli dei draghi', 'manodopera', 3), ('pascoli dei draghi', 'alimenti agricoli', 3),
  ('segheria', 'manodopera', 3),
  ('cava', 'manodopera', 3),
  ('miniera', 'manodopera', 3), ('miniera', 'legname', 5),
  ('scuderie', 'alimenti agricoli', 5), ('scuderie', 'bestiame', 3),
  ('haras', 'alimenti agricoli', 6), ('haras', 'bestiame', 4), ('haras', 'manodopera', 4),
  ('vigneti e telai', 'manodopera', 4),
  ('peschiera', 'manodopera', 4), ('peschiera', 'legname', 2),
  ('conceria', 'bestiame', 8), ('conceria', 'manodopera', 3),
  ('borgo', 'alimenti agricoli', 6),
  ('orti e granai', 'manodopera', 3),
  ('mercato', 'manodopera', 3),
  ('porto', 'manodopera', 3), ('porto', 'oro', 5),
  ('magazzino', 'manodopera', 3),
  ('locanda', 'alimenti agricoli', 5), ('locanda', 'beni di lusso', 2),
  ('tempio', 'beni di lusso', 4),
  ('emporio dei lussi', 'beni di lusso', 8), ('emporio dei lussi', 'manodopera', 4),
  ('torre di guardia', 'manodopera', 3),
  ('caserma', 'alimenti agricoli', 5), ('caserma', 'oro', 5),
  ('accampamento d''addestramento', 'alimenti agricoli', 8), ('accampamento d''addestramento', 'oro', 5),
  ('accampamento d''addestramento', 'cavalli', 3),
  ('fucina d''armi', 'ferro', 5), ('fucina d''armi', 'oro', 2),
  ('arsenale', 'ferro', 8), ('arsenale', 'legname', 5), ('arsenale', 'oro', 5),
  ('cantiere navale', 'legname', 5), ('cantiere navale', 'oro', 5),
  ('mura e fossato', 'manodopera', 8), ('mura e fossato', 'pietra', 5),
  ('fortezza', 'alimenti agricoli', 5), ('fortezza', 'manodopera', 3), ('fortezza', 'oro', 10),
  ('fossa dei draghi', 'bestiame', 5),
  ('intendenza', 'oro', 3), ('intendenza', 'manodopera', 3)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

drop table tmp_strutture;

-- Tipi di feudo in cui si costruiscono (le strutture non elencate: ovunque)
insert into public.structure_fief_types (structure_type_id, fief_type_id)
select s.id, t.id
from (values
  ('mulino', 'agricolo'),
  ('allevamento', 'agricolo'),
  ('pascoli dei draghi', 'agricolo'), ('pascoli dei draghi', 'militare'),
  ('segheria', 'agricolo'), ('segheria', 'commerciale'), ('segheria', 'militare'),
  ('cava', 'minerario'), ('cava', 'militare'),
  ('miniera', 'minerario'),
  ('scuderie', 'agricolo'), ('scuderie', 'militare'),
  ('haras', 'agricolo'), ('haras', 'militare'),
  ('vigneti e telai', 'agricolo'), ('vigneti e telai', 'commerciale'), ('vigneti e telai', 'costiero'),
  ('peschiera', 'costiero'), ('peschiera', 'commerciale'), ('peschiera', 'minerario'),
  ('conceria', 'agricolo'), ('conceria', 'commerciale'), ('conceria', 'militare'),
  ('porto', 'commerciale'), ('porto', 'costiero'), ('porto', 'minerario'),
  ('emporio dei lussi', 'commerciale'), ('emporio dei lussi', 'costiero'),
  ('accampamento d''addestramento', 'militare'), ('accampamento d''addestramento', 'agricolo'),
  ('accampamento d''addestramento', 'commerciale'),
  ('cantiere navale', 'commerciale'), ('cantiere navale', 'costiero'), ('cantiere navale', 'minerario')
) as v(s, t)
join public.structure_types s on lower(s.name) = v.s
join public.fief_types t on lower(t.name) = v.t
on conflict do nothing;

-- Tipi e grandezze dei feudi iniziali
update public.fiefs f set size = v.sz, fief_type_id = t.id
from (values
  ('approdo del re', 'grande', 'commerciale'),
  ('driftmark', 'medio', 'costiero'),
  ('duskendale', 'medio', 'agricolo'),
  ('harrenhal', 'grande', 'militare'),
  ('isola della chela', 'piccolo', 'minerario'),
  ('maidenpool', 'medio', 'minerario'),
  ('riposo del corvo', 'piccolo', 'militare'),
  ('tumbleton', 'medio', 'agricolo')
) as v(n, sz, tp)
join public.fief_types t on lower(t.name) = v.tp
where lower(f.name) = v.n;

-- Strutture iniziali di BG (gratuite): si aggiungono solo quelle che mancano
insert into public.fief_structures (fief_id, structure_type_id, built_by, is_background)
select f.id, s.id, 'Background', true
from (values
  ('approdo del re', 'mercato'), ('approdo del re', 'porto'), ('approdo del re', 'magazzino'), ('approdo del re', 'locanda'),
  ('driftmark', 'porto'), ('driftmark', 'peschiera'), ('driftmark', 'magazzino'),
  ('duskendale', 'mulino'), ('duskendale', 'allevamento'), ('duskendale', 'magazzino'),
  ('harrenhal', 'cava'), ('harrenhal', 'segheria'), ('harrenhal', 'scuderie'), ('harrenhal', 'caserma'),
  ('isola della chela', 'miniera'), ('isola della chela', 'cava'),
  ('maidenpool', 'miniera'), ('maidenpool', 'cava'), ('maidenpool', 'mercato'),
  ('riposo del corvo', 'segheria'), ('riposo del corvo', 'torre di guardia'),
  ('tumbleton', 'mulino'), ('tumbleton', 'allevamento'), ('tumbleton', 'pascoli dei draghi')
) as v(fn, sn)
join public.fiefs f on lower(f.name) = v.fn
join public.structure_types s on lower(s.name) = v.sn
on conflict (fief_id, structure_type_id) do nothing;

-- Tasse (dimezzate rispetto a prima, come nelle simulazioni)
update public.tax_settings
   set small_pct = 2.5, medium_pct = 5, large_pct = 7.5, per_structure_pct = 0.5, max_pct = 20
 where id;

-- Minimi da granaio per l'umore del popolo (Oro, Alimenti, Legname)
insert into public.fief_minimums (size, resource_id, amount)
select v.sz, r.id, v.a
from (values ('piccolo', 100), ('medio', 150), ('grande', 250)) as v(sz, a)
cross join (values ('oro'), ('alimenti agricoli'), ('legname')) as x(n)
join public.resources r on lower(r.name) = x.n
on conflict (size, resource_id) do nothing;

-- Scorte iniziali ed esercito alle armi: una volta sola per casata
do $$
declare
  v record;
  v_have bigint;
begin
  for v in
    select h.id as house_id, r.id as resource_id, x.a
    from (values
      ('blackfyre',  800, 450, 350, 150, 300, 100, 200, 400, 600),
      ('velaryon',   600, 500, 350, 150, 400, 100,   0, 550, 450),
      ('darklyn',    200, 500, 200, 300, 100,   0, 150, 100, 200),
      ('vhassar',    300, 450, 550, 200, 500, 150, 500, 200, 450),
      ('celtigar',   400, 400, 350, 100, 550, 500,   0, 350, 350),
      ('thaerion',   500, 300, 350, 200, 500, 400, 100, 600, 150),
      ('staunton',   200, 200, 300, 100, 300, 250, 300,   0, 250),
      ('brightfyre', 200, 750, 300, 550, 100,   0, 650, 150, 400)
    ) as t(h, oro, alimenti, legname, bestiame, pietra, ferro, cavalli, lusso, manodopera)
    cross join lateral (values
      ('oro', t.oro), ('alimenti agricoli', t.alimenti), ('legname', t.legname), ('bestiame', t.bestiame),
      ('pietra', t.pietra), ('ferro', t.ferro), ('cavalli', t.cavalli), ('beni di lusso', t.lusso), ('manodopera', t.manodopera)
    ) as x(n, a)
    join public.houses h on lower(h.name) = t.h
    join public.resources r on lower(r.name) = x.n
    where not exists (select 1 from public.economy_log l where l.house_id = h.id and l.reason = 'Scorte iniziali')
  loop
    select coalesce(amount, 0) into v_have from public.house_resources where house_id = v.house_id and resource_id = v.resource_id;
    if v.a - coalesce(v_have, 0) <> 0 then
      perform public.economy_add(v.house_id, v.resource_id, v.a - coalesce(v_have, 0), 'Scorte iniziali');
    end if;
  end loop;

  -- l'esercito parte alle armi (paga per intero; la riserva la decide il signore)
  update public.houses h set army_called = true
   where h.playable
     and not exists (select 1 from public.economy_log l where l.house_id = h.id and l.reason = 'Esercito alle armi (inizio partita)');
  insert into public.economy_log (house_id, resource_id, delta, reason)
  select h.id, null, 0, 'Esercito alle armi (inizio partita)'
    from public.houses h
   where h.playable
     and not exists (select 1 from public.economy_log l where l.house_id = h.id and l.reason = 'Esercito alle armi (inizio partita)');
end $$;

-- Controllo finale: valori attesi 29 strutture con categoria, 77 costi,
-- 23 introiti, 50 mantenimenti, 34 limiti di tipo, 22 introiti dei tipi,
-- 8 feudi con tipo, 4 righe di mantenimento dell'esercito
select
  (select count(*) from public.structure_types where category <> '') as strutture,
  (select count(*) from public.structure_costs) as costi,
  (select count(*) from public.structure_incomes) as introiti_strutture,
  (select count(*) from public.structure_upkeep) as mantenimenti_strutture,
  (select count(*) from public.structure_fief_types) as limiti_tipo,
  (select count(*) from public.fief_type_incomes) as introiti_tipi,
  (select count(*) from public.fiefs where fief_type_id is not null) as feudi_con_tipo,
  (select count(*) from public.army_upkeep) as mantenimento_esercito;
