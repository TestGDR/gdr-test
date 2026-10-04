-- =====================================================================
-- 0060 - Economia: risorse, tipi di feudo, feudi, strutture, tesoro
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Casate PG o PNG: la casella "giocabile dai PG" che le casate hanno gia'.
-- - Risorse, tipi di feudo (con introiti mensili) e strutture (costo in
--   risorse e introiti extra) si creano dal pannello Gestione -> Economia
--   (permesso "economia.gestire").
-- - Feudo: casata, tipo, grandezza (piccolo 5 strutture, medio 7, grande 10).
-- - Tesoro di ogni casata; ogni 1 del mese arrivano gli introiti dei feudi
--   e delle strutture.
-- - I membri vedono feudi e tesoro della loro casata; chi ha un ruolo di
--   casata abilitato puo' costruire strutture con le risorse della casata.
-- =====================================================================

alter table public.house_roles add column can_build boolean not null default false;

-- ---------------------------------------------------------------------
-- Cataloghi
-- ---------------------------------------------------------------------
create table public.resources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 1000),
  sort_order  int not null default 0
);
create unique index resources_name_key on public.resources (lower(name));

create table public.fief_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  sort_order  int not null default 0
);
create unique index fief_types_name_key on public.fief_types (lower(name));

create table public.fief_type_incomes (
  fief_type_id uuid not null references public.fief_types(id) on delete cascade,
  resource_id  uuid not null references public.resources(id) on delete cascade,
  amount       int not null check (amount between 1 and 1000000),
  primary key (fief_type_id, resource_id)
);

create table public.structure_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  sort_order  int not null default 0
);
create unique index structure_types_name_key on public.structure_types (lower(name));

create table public.structure_costs (
  structure_type_id uuid not null references public.structure_types(id) on delete cascade,
  resource_id       uuid not null references public.resources(id) on delete cascade,
  amount            int not null check (amount between 1 and 1000000),
  primary key (structure_type_id, resource_id)
);

create table public.structure_incomes (
  structure_type_id uuid not null references public.structure_types(id) on delete cascade,
  resource_id       uuid not null references public.resources(id) on delete cascade,
  amount            int not null check (amount between 1 and 1000000),
  primary key (structure_type_id, resource_id)
);

-- ---------------------------------------------------------------------
-- Feudi e strutture costruite
-- ---------------------------------------------------------------------
create table public.fiefs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  house_id     uuid not null references public.houses(id) on delete cascade,
  fief_type_id uuid references public.fief_types(id) on delete set null,
  size         text not null check (size in ('piccolo', 'medio', 'grande')),
  location_id  uuid references public.locations(id) on delete set null,
  description  text not null default '' check (char_length(description) <= 4000),
  created_at   timestamptz not null default now()
);
create index fiefs_house_idx on public.fiefs(house_id);

create table public.fief_structures (
  id                uuid primary key default gen_random_uuid(),
  fief_id           uuid not null references public.fiefs(id) on delete cascade,
  structure_type_id uuid not null references public.structure_types(id) on delete cascade,
  built_by          text not null default '',
  built_at          timestamptz not null default now()
);
create index fief_structures_fief_idx on public.fief_structures(fief_id);

-- Quante strutture puo' contenere un feudo
create or replace function public.fief_capacity(p_size text)
returns int
language sql immutable
as $$
  select case p_size when 'grande' then 10 when 'medio' then 7 else 5 end;
$$;

-- ---------------------------------------------------------------------
-- Tesoro delle casate e storico dei movimenti
-- ---------------------------------------------------------------------
create table public.house_resources (
  house_id    uuid not null references public.houses(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  amount      bigint not null default 0 check (amount >= 0),
  primary key (house_id, resource_id)
);

create table public.economy_log (
  id          bigint generated always as identity primary key,
  house_id    uuid not null references public.houses(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete set null,
  delta       bigint not null,
  reason      text not null default '',
  created_at  timestamptz not null default now()
);
create index economy_log_house_idx on public.economy_log(house_id, created_at desc);

-- mesi gia' pagati (un pagamento al mese)
create table public.economy_months (month date primary key, paid_at timestamptz not null default now());

-- ---------------------------------------------------------------------
-- Chi vede cosa
-- ---------------------------------------------------------------------
-- Sono membro della casata (con il mio personaggio principale)?
create or replace function public.is_house_member(p_house uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.characters c where c.owner_id = auth.uid() and c.house_id = p_house);
$$;

alter table public.resources enable row level security;
alter table public.fief_types enable row level security;
alter table public.fief_type_incomes enable row level security;
alter table public.structure_types enable row level security;
alter table public.structure_costs enable row level security;
alter table public.structure_incomes enable row level security;
alter table public.fiefs enable row level security;
alter table public.fief_structures enable row level security;
alter table public.house_resources enable row level security;
alter table public.economy_log enable row level security;
alter table public.economy_months enable row level security;

do $$
declare t text;
begin
  -- cataloghi, feudi e strutture: li vedono tutti, li modifica chi ha il permesso
  foreach t in array array['resources', 'fief_types', 'fief_type_incomes', 'structure_types', 'structure_costs',
                           'structure_incomes', 'fiefs', 'fief_structures']
  loop
    execute format('create policy "visibili" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "economia con permesso" on public.%I for all to authenticated
                      using (public.has_permission(''economia.gestire'')) with check (public.has_permission(''economia.gestire''))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- tesoro e movimenti: i membri della casata e lo staff dell'economia
create policy "tesoro della casata" on public.house_resources for select to authenticated
  using (public.is_house_member(house_id) or public.has_permission('economia.gestire'));
create policy "movimenti della casata" on public.economy_log for select to authenticated
  using (public.is_house_member(house_id) or public.has_permission('economia.gestire'));
grant select on public.house_resources, public.economy_log to authenticated;
grant select, insert, update, delete on public.house_resources, public.economy_log, public.economy_months to service_role;

-- ---------------------------------------------------------------------
-- Movimenti del tesoro (mai sotto zero)
-- ---------------------------------------------------------------------
create or replace function public.economy_add(p_house uuid, p_resource uuid, p_delta bigint, p_reason text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_delta = 0 then return; end if;
  insert into public.house_resources (house_id, resource_id, amount)
  values (p_house, p_resource, greatest(0, p_delta))
  on conflict (house_id, resource_id) do update set amount = public.house_resources.amount + p_delta;
  insert into public.economy_log (house_id, resource_id, delta, reason) values (p_house, p_resource, p_delta, coalesce(p_reason, ''));
end;
$$;
revoke execute on function public.economy_add(uuid, uuid, bigint, text) from public, anon, authenticated;

-- Correzione dello staff (aggiunge o toglie)
create or replace function public.staff_adjust_resource(p_house uuid, p_resource uuid, p_delta bigint, p_reason text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare v_have bigint;
begin
  if not public.has_permission('economia.gestire') then raise exception 'Permesso negato'; end if;
  select amount into v_have from public.house_resources where house_id = p_house and resource_id = p_resource;
  if coalesce(v_have, 0) + p_delta < 0 then raise exception 'Risorse insufficienti'; end if;
  perform public.economy_add(p_house, p_resource, p_delta, 'Staff: ' || coalesce(nullif(trim(p_reason), ''), 'correzione'));
end;
$$;

-- ---------------------------------------------------------------------
-- Costruire una struttura: staff, oppure un PG della casata con un ruolo abilitato
-- ---------------------------------------------------------------------
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

  -- risorse sufficienti?
  for c in select sc.resource_id, sc.amount, r.name from public.structure_costs sc join public.resources r on r.id = sc.resource_id
           where sc.structure_type_id = p_structure_type loop
    if coalesce((select amount from public.house_resources where house_id = f.house_id and resource_id = c.resource_id), 0) < c.amount then
      raise exception 'Risorse insufficienti: %', c.name;
    end if;
  end loop;

  insert into public.fief_structures (fief_id, structure_type_id, built_by) values (p_fief, p_structure_type, coalesce(v_by, ''))
  returning id into v_id;
  for c in select sc.resource_id, sc.amount from public.structure_costs sc where sc.structure_type_id = p_structure_type loop
    perform public.economy_add(f.house_id, c.resource_id, -c.amount,
      'Costruzione: ' || (select name from public.structure_types where id = p_structure_type) || ' a ' || f.name);
  end loop;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Introiti del mese: feudi (dal tipo) + strutture
-- ---------------------------------------------------------------------
create or replace function public.pay_monthly_income(p_force boolean default false)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
  r record;
  n int := 0;
begin
  -- il controllo automatico non ha un utente; dal sito serve il permesso
  if auth.uid() is not null and not public.has_permission('economia.gestire') then raise exception 'Permesso negato'; end if;
  if not p_force then
    if exists (select 1 from public.economy_months where month = v_month) then return 0; end if;
    insert into public.economy_months (month) values (v_month);
  end if;

  for r in
    select f.house_id, i.resource_id, sum(i.amount)::bigint as amount
    from (
      select f.id as fief_id, fti.resource_id, fti.amount
      from public.fiefs f join public.fief_type_incomes fti on fti.fief_type_id = f.fief_type_id
      union all
      select fs.fief_id, si.resource_id, si.amount
      from public.fief_structures fs join public.structure_incomes si on si.structure_type_id = fs.structure_type_id
    ) i
    join public.fiefs f on f.id = i.fief_id
    group by f.house_id, i.resource_id
  loop
    perform public.economy_add(r.house_id, r.resource_id, r.amount,
      case when p_force then 'Introiti (distribuiti dallo staff)' else 'Introiti del mese' end);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ogni 1 del mese, poco dopo mezzanotte (ora italiana: il controllo evita doppi pagamenti)
select cron.schedule('introiti-mensili', '15 * 1 * *', 'select public.pay_monthly_income(false)');

revoke execute on function public.staff_adjust_resource(uuid, uuid, bigint, text) from public, anon;
revoke execute on function public.build_structure(uuid, uuid, uuid) from public, anon;
revoke execute on function public.pay_monthly_income(boolean) from public, anon;
grant execute on function public.staff_adjust_resource(uuid, uuid, bigint, text) to authenticated;
grant execute on function public.build_structure(uuid, uuid, uuid) to authenticated;
grant execute on function public.pay_monthly_income(boolean) to authenticated;
