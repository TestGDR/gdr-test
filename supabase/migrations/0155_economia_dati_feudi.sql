-- =====================================================================
-- 0155 - Economia: risorse commerciabili, introiti per grandezza, doppio
--        tipo di feudo, mantenimento dei tipi di feudo, categorie e limiti
--        delle strutture; dati del documento "Economia dei feudi"
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - Risorse: "commerciabile" (la Manodopera no: non entra nelle tratte).
-- - Tipi di feudo: gli introiti (e il mantenimento) scritti sono quelli del
--   feudo piccolo; medio x1,5 e grande x2 (Gestione -> Economia -> Tipi di
--   feudo, modificabili). Arrotondati all'intero piu' vicino.
-- - Un feudo puo' avere un secondo tipo: conta a meta' (modificabile) per
--   introiti e mantenimento, e permette di costruire le sue strutture.
-- - Strutture: categoria (solo per raggrupparle) e tipi di feudo in cui si
--   possono costruire (vuoto = ovunque). Le strutture di BG assegnate dallo
--   staff non hanno limiti.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Risorse commerciabili
-- ---------------------------------------------------------------------
alter table public.resources add column if not exists tradable boolean not null default true;

-- Le tratte commerciali usano solo risorse commerciabili
create or replace function public.trade_resources_check()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.resources where id in (new.give_resource, new.want_resource) and not tradable) then
    raise exception 'Questa risorsa non si può commerciare.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trade_resources_check on public.trade_routes;
create trigger trade_resources_check
  before insert or update of give_resource, want_resource on public.trade_routes
  for each row execute function public.trade_resources_check();

-- ---------------------------------------------------------------------
-- Grandezza, secondo tipo e mantenimento dei feudi
-- ---------------------------------------------------------------------
create table if not exists public.economy_settings (
  id               boolean primary key default true check (id),
  medium_factor    numeric(4,2) not null default 1.5 check (medium_factor between 0 and 10),
  large_factor     numeric(4,2) not null default 2   check (large_factor between 0 and 10),
  secondary_factor numeric(4,2) not null default 0.5 check (secondary_factor between 0 and 1)
);
insert into public.economy_settings (id) values (true) on conflict (id) do nothing;
alter table public.economy_settings enable row level security;
drop policy if exists "visibili" on public.economy_settings;
create policy "visibili" on public.economy_settings for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.economy_settings;
create policy "economia con permesso" on public.economy_settings for update to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, update on public.economy_settings to authenticated;
grant select on public.economy_settings to service_role;

alter table public.fiefs add column if not exists fief_type2_id uuid references public.fief_types(id) on delete set null;
alter table public.fiefs drop constraint if exists fiefs_two_types_check;
alter table public.fiefs add constraint fiefs_two_types_check
  check (fief_type2_id is null or fief_type2_id is distinct from fief_type_id);

create table if not exists public.fief_type_upkeep (
  fief_type_id uuid not null references public.fief_types(id) on delete cascade,
  resource_id  uuid not null references public.resources(id) on delete cascade,
  amount       int not null check (amount between 1 and 1000000),
  primary key (fief_type_id, resource_id)
);
alter table public.fief_type_upkeep enable row level security;
drop policy if exists "visibili" on public.fief_type_upkeep;
create policy "visibili" on public.fief_type_upkeep for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.fief_type_upkeep;
create policy "economia con permesso" on public.fief_type_upkeep for all to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, insert, update, delete on public.fief_type_upkeep to authenticated;
grant select on public.fief_type_upkeep to service_role;

-- Quanto conta la grandezza (piccolo 1)
create or replace function public.fief_size_factor(p_size text)
returns numeric
language sql stable
security definer set search_path = ''
as $$
  select case p_size when 'grande' then s.large_factor when 'medio' then s.medium_factor else 1 end
  from public.economy_settings s;
$$;

-- Tutto quello che i feudi producono e consumano ogni mese, riga per riga
create or replace function public.fief_production()
returns table (fief_id uuid, house_id uuid, resource_id uuid, income bigint, upkeep bigint)
language sql stable
security definer set search_path = ''
as $$
  with f as (
    select fi.*, public.fief_size_factor(fi.size) as sf,
           (select secondary_factor from public.economy_settings) as sec
    from public.fiefs fi
  )
  -- tipo principale
  select f.id, f.house_id, x.resource_id, round(x.amount * f.sf)::bigint, 0::bigint
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
  join public.structure_upkeep su on su.structure_type_id = fs.structure_type_id;
$$;
revoke execute on function public.fief_production() from public, anon;

-- Tasse: una percentuale di cio' che i feudi producono (riga per riga, per difetto)
create or replace function public.monthly_taxes()
returns table (house_id uuid, resource_id uuid, amount bigint)
language sql stable
security definer set search_path = ''
as $$
  select p.house_id, p.resource_id, sum(floor(p.income * public.fief_tax_pct(p.fief_id) / 100))::bigint
  from public.fief_production() p
  where p.income > 0
    and p.house_id is distinct from (select ruling_house_id from public.tax_settings)
    and (select ruling_house_id from public.tax_settings) is not null
  group by p.house_id, p.resource_id
  having sum(floor(p.income * public.fief_tax_pct(p.fief_id) / 100)) > 0;
$$;
revoke execute on function public.monthly_taxes() from public, anon;
grant execute on function public.monthly_taxes() to authenticated;

-- Introiti, mantenimento e tasse del mese (come prima, con grandezza, secondo tipo e mantenimento dei feudi)
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

  -- 1. introiti e mantenimento di feudi e strutture
  for r in
    select p.house_id, p.resource_id, sum(p.income)::bigint as income, sum(p.upkeep)::bigint as upkeep
    from public.fief_production() p
    group by p.house_id, p.resource_id
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
          'Mantenimento di feudi e strutture' ||
          case when v_pay < r.upkeep then ' (non pagato per intero: mancano ' || (r.upkeep - v_pay) || ')' else '' end);
      else
        insert into public.economy_log (house_id, resource_id, delta, reason)
        values (r.house_id, r.resource_id, 0, 'Mantenimento di feudi e strutture non pagato: mancano ' || r.upkeep);
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

-- ---------------------------------------------------------------------
-- Strutture: categoria e tipi di feudo in cui si costruiscono
-- ---------------------------------------------------------------------
alter table public.structure_types add column if not exists category text not null default '';
alter table public.structure_types drop constraint if exists structure_types_category_check;
alter table public.structure_types add constraint structure_types_category_check check (char_length(category) <= 40);

create table if not exists public.structure_fief_types (
  structure_type_id uuid not null references public.structure_types(id) on delete cascade,
  fief_type_id      uuid not null references public.fief_types(id) on delete cascade,
  primary key (structure_type_id, fief_type_id)
);
alter table public.structure_fief_types enable row level security;
drop policy if exists "visibili" on public.structure_fief_types;
create policy "visibili" on public.structure_fief_types for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.structure_fief_types;
create policy "economia con permesso" on public.structure_fief_types for all to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, insert, update, delete on public.structure_fief_types to authenticated;
grant select on public.structure_fief_types to service_role;

-- Costruire: se la struttura ha dei tipi di feudo, il feudo deve averne uno
-- (principale o secondo). Le strutture di BG dello staff non hanno limiti.
create or replace function public.structure_fief_type_check()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  f public.fiefs;
begin
  if new.is_background then return new; end if;
  if not exists (select 1 from public.structure_fief_types where structure_type_id = new.structure_type_id) then
    return new;
  end if;
  select * into f from public.fiefs where id = new.fief_id;
  if not exists (
    select 1 from public.structure_fief_types
     where structure_type_id = new.structure_type_id and fief_type_id in (f.fief_type_id, f.fief_type2_id)
  ) then
    raise exception 'Questa struttura si costruisce solo nei feudi di tipo %',
      (select string_agg(t.name, ', ' order by t.name) from public.structure_fief_types x
         join public.fief_types t on t.id = x.fief_type_id where x.structure_type_id = new.structure_type_id)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists structure_fief_type_check on public.fief_structures;
create trigger structure_fief_type_check
  before insert on public.fief_structures
  for each row execute function public.structure_fief_type_check();

-- =====================================================================
-- DATI (documento "Economia dei feudi", valori iniziali provvisori)
-- =====================================================================

-- Risorse: Metalli da Costruzione diventa Ferro; nuove Pietra, Cavalli, Beni di lusso
update public.resources set name = 'Ferro'
 where lower(name) = 'metalli da costruzione'
   and not exists (select 1 from public.resources where lower(name) = 'ferro');
insert into public.resources (name) values ('Pietra'), ('Cavalli'), ('Beni di lusso')
on conflict do nothing;

update public.resources r set description = v.d, sort_order = v.o, tradable = v.t
from (values
  ('oro', 'Moneta. Costruzione, paga delle truppe, mantenimento di molte strutture.', 0, true),
  ('legname', 'Costruzione, navi e macchine da guerra, riscaldamento e riparazioni del popolo.', 1, true),
  ('alimenti agricoli', 'Razioni delle truppe e sostentamento del popolo.', 2, true),
  ('bestiame', 'Viveri, mantenimento dei draghi, lavoro nei campi.', 3, true),
  ('ferro', 'Armi, armature e strutture militari.', 4, true),
  ('pietra', 'Castelli, mura e fortificazioni.', 5, true),
  ('cavalli', 'Cavalleria. Merce di scambio.', 6, true),
  ('beni di lusso', 'Vino, seta, spezie. Servono al commercio e al prestigio.', 7, true),
  ('manodopera', 'Prodotta dai feudi ogni mese. Si spende per costruire, addestrare soldati e mantenere strutture. Non commerciabile.', 8, false)
) as v(n, d, o, t)
where lower(r.name) = v.n;

-- Tipi di feudo (introiti e mantenimento del feudo piccolo)
insert into public.fief_types (name) values ('Agricolo'), ('Militare'), ('Commerciale'), ('Minerario'), ('Costiero')
on conflict do nothing;
update public.fief_types t set description = v.d, sort_order = v.o
from (values
  ('agricolo', 'Molti Alimenti e Bestiame, poco Oro.', 0),
  ('militare', 'Poco Oro, più Manodopera e Ferro. Mantenimento alto.', 1),
  ('commerciale', 'Molto Oro e Beni di lusso, poca Manodopera.', 2),
  ('minerario', 'Ferro e Pietra.', 3),
  ('costiero', 'Oro e Legname. Può costruire Porto e Cantiere navale.', 4)
) as v(n, d, o)
where lower(t.name) = v.n;

delete from public.fief_type_incomes
 where fief_type_id in (select id from public.fief_types
                         where lower(name) in ('agricolo', 'militare', 'commerciale', 'minerario', 'costiero'));
insert into public.fief_type_incomes (fief_type_id, resource_id, amount)
select t.id, r.id, v.a
from (values
  ('agricolo', 'alimenti agricoli', 30), ('agricolo', 'bestiame', 14), ('agricolo', 'legname', 6),
  ('agricolo', 'oro', 4), ('agricolo', 'manodopera', 14),
  ('militare', 'manodopera', 20), ('militare', 'ferro', 10), ('militare', 'oro', 4), ('militare', 'alimenti agricoli', 4),
  ('commerciale', 'oro', 30), ('commerciale', 'beni di lusso', 10), ('commerciale', 'manodopera', 4),
  ('commerciale', 'alimenti agricoli', 4),
  ('minerario', 'ferro', 20), ('minerario', 'pietra', 20), ('minerario', 'manodopera', 10),
  ('minerario', 'alimenti agricoli', 4),
  ('costiero', 'oro', 16), ('costiero', 'legname', 14), ('costiero', 'alimenti agricoli', 10),
  ('costiero', 'manodopera', 10)
) as v(t, r, a)
join public.fief_types t on lower(t.name) = v.t
join public.resources r on lower(r.name) = v.r;

delete from public.fief_type_upkeep
 where fief_type_id in (select id from public.fief_types
                         where lower(name) in ('agricolo', 'militare', 'commerciale', 'minerario', 'costiero'));
insert into public.fief_type_upkeep (fief_type_id, resource_id, amount)
select t.id, r.id, v.a
from (values ('militare', 'alimenti agricoli', 10), ('militare', 'oro', 10)) as v(t, r, a)
join public.fief_types t on lower(t.name) = v.t
join public.resources r on lower(r.name) = v.r;

-- Strutture (17)
insert into public.structure_types (name) values
  ('Mulino'), ('Allevamento'), ('Segheria'), ('Cava'), ('Miniera'), ('Scuderie'), ('Vigneti e telai'),
  ('Mercato'), ('Porto'), ('Magazzino'), ('Tempio'),
  ('Torre di guardia'), ('Caserma'), ('Fucina d''armi'), ('Cantiere navale'), ('Fortezza'), ('Fossa dei draghi')
on conflict do nothing;

update public.structure_types s set category = v.c, sort_order = v.o, attack = v.att, defense = v.def,
  description = case when v.d = '' then s.description else v.d end
from (values
  ('mulino', 'Produzione', 0, 0, 0, ''),
  ('allevamento', 'Produzione', 1, 0, 0, ''),
  ('segheria', 'Produzione', 2, 0, 0, ''),
  ('cava', 'Produzione', 3, 0, 0, ''),
  ('miniera', 'Produzione', 4, 0, 0, ''),
  ('scuderie', 'Produzione', 5, 0, 0, ''),
  ('vigneti e telai', 'Produzione', 6, 0, 0, ''),
  ('mercato', 'Commercio e prestigio', 7, 0, 0, ''),
  ('porto', 'Commercio e prestigio', 8, 0, 0, 'Solo nei feudi costieri.'),
  ('magazzino', 'Commercio e prestigio', 9, 0, 0, ''),
  ('tempio', 'Commercio e prestigio', 10, 0, 0, ''),
  ('torre di guardia', 'Militari', 11, 0, 5, ''),
  ('caserma', 'Militari', 12, 10, 0, ''),
  ('fucina d''armi', 'Militari', 13, 10, 0, ''),
  ('cantiere navale', 'Militari', 14, 10, 0, 'Attacco navale. Solo nei feudi costieri.'),
  ('fortezza', 'Militari', 15, 0, 20, ''),
  ('fossa dei draghi', 'Militari', 16, 0, 20, 'Prestigio e difesa. Non riduce il mantenimento dei draghi.')
) as v(n, c, o, att, def, d)
where lower(s.name) = v.n;

-- costi, introiti e mantenimento delle 17 strutture: si riscrivono da capo
delete from public.structure_costs where structure_type_id in (select id from public.structure_types where lower(name) in ('mulino', 'allevamento', 'segheria', 'cava', 'miniera', 'scuderie', 'vigneti e telai', 'mercato', 'porto', 'magazzino', 'tempio', 'torre di guardia', 'caserma', 'fucina d''armi', 'cantiere navale', 'fortezza', 'fossa dei draghi'));
delete from public.structure_incomes where structure_type_id in (select id from public.structure_types where lower(name) in ('mulino', 'allevamento', 'segheria', 'cava', 'miniera', 'scuderie', 'vigneti e telai', 'mercato', 'porto', 'magazzino', 'tempio', 'torre di guardia', 'caserma', 'fucina d''armi', 'cantiere navale', 'fortezza', 'fossa dei draghi'));
delete from public.structure_upkeep where structure_type_id in (select id from public.structure_types where lower(name) in ('mulino', 'allevamento', 'segheria', 'cava', 'miniera', 'scuderie', 'vigneti e telai', 'mercato', 'porto', 'magazzino', 'tempio', 'torre di guardia', 'caserma', 'fucina d''armi', 'cantiere navale', 'fortezza', 'fossa dei draghi'));

insert into public.structure_costs (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'legname', 100), ('mulino', 'pietra', 100),
  ('allevamento', 'legname', 100), ('allevamento', 'manodopera', 100),
  ('segheria', 'legname', 100), ('segheria', 'ferro', 100),
  ('cava', 'legname', 100), ('cava', 'ferro', 100),
  ('miniera', 'legname', 100), ('miniera', 'oro', 100),
  ('scuderie', 'legname', 100), ('scuderie', 'pietra', 100),
  ('vigneti e telai', 'legname', 100), ('vigneti e telai', 'oro', 100),
  ('mercato', 'legname', 100), ('mercato', 'pietra', 100),
  ('porto', 'legname', 100), ('porto', 'pietra', 100), ('porto', 'ferro', 100),
  ('magazzino', 'legname', 100), ('magazzino', 'pietra', 100),
  ('tempio', 'pietra', 100), ('tempio', 'oro', 100),
  ('torre di guardia', 'pietra', 100), ('torre di guardia', 'legname', 100),
  ('caserma', 'legname', 100), ('caserma', 'pietra', 100),
  ('fucina d''armi', 'pietra', 100), ('fucina d''armi', 'ferro', 100),
  ('cantiere navale', 'legname', 100), ('cantiere navale', 'ferro', 100), ('cantiere navale', 'oro', 100),
  ('fortezza', 'pietra', 200), ('fortezza', 'ferro', 100), ('fortezza', 'oro', 100),
  ('fossa dei draghi', 'pietra', 200), ('fossa dei draghi', 'ferro', 100), ('fossa dei draghi', 'oro', 100)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

insert into public.structure_incomes (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'alimenti agricoli', 10),
  ('allevamento', 'bestiame', 10),
  ('segheria', 'legname', 10),
  ('cava', 'pietra', 10),
  ('miniera', 'ferro', 10),
  ('scuderie', 'cavalli', 8),
  ('vigneti e telai', 'beni di lusso', 5),
  ('mercato', 'oro', 10),
  ('porto', 'oro', 20), ('porto', 'legname', 5),
  ('magazzino', 'alimenti agricoli', 5), ('magazzino', 'bestiame', 5), ('magazzino', 'legname', 5),
  ('tempio', 'oro', 10)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

insert into public.structure_upkeep (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'manodopera', 5),
  ('allevamento', 'alimenti agricoli', 5),
  ('segheria', 'manodopera', 5),
  ('cava', 'manodopera', 5),
  ('miniera', 'manodopera', 5), ('miniera', 'legname', 5),
  ('scuderie', 'alimenti agricoli', 5), ('scuderie', 'bestiame', 5),
  ('vigneti e telai', 'manodopera', 5),
  ('mercato', 'manodopera', 5),
  ('porto', 'manodopera', 5), ('porto', 'oro', 5),
  ('magazzino', 'manodopera', 5),
  ('tempio', 'oro', 5),
  ('torre di guardia', 'manodopera', 5),
  ('caserma', 'alimenti agricoli', 5), ('caserma', 'oro', 5),
  ('fucina d''armi', 'ferro', 5),
  ('cantiere navale', 'legname', 5), ('cantiere navale', 'oro', 5),
  ('fortezza', 'alimenti agricoli', 5), ('fortezza', 'manodopera', 5), ('fortezza', 'oro', 10),
  ('fossa dei draghi', 'bestiame', 10)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

-- Porto e Cantiere navale: solo nei feudi Costiero
insert into public.structure_fief_types (structure_type_id, fief_type_id)
select s.id, t.id
from public.structure_types s, public.fief_types t
where lower(s.name) in ('porto', 'cantiere navale') and lower(t.name) = 'costiero'
on conflict do nothing;

-- Controllo finale: valori attesi 9 risorse, 21 introiti e 2 mantenimenti dei tipi,
-- 38 costi, 14 entrate e 24 mantenimenti delle strutture, 2 limiti (Porto, Cantiere)
select
  (select count(*) from public.resources) as risorse,
  (select count(*) from public.fief_type_incomes x join public.fief_types t on t.id = x.fief_type_id
    where lower(t.name) in ('agricolo', 'militare', 'commerciale', 'minerario', 'costiero')) as introiti_tipi,
  (select count(*) from public.fief_type_upkeep) as mantenimento_tipi,
  (select count(*) from public.structure_costs x join public.structure_types s on s.id = x.structure_type_id where s.category <> '') as costi_strutture,
  (select count(*) from public.structure_incomes x join public.structure_types s on s.id = x.structure_type_id where s.category <> '') as entrate_strutture,
  (select count(*) from public.structure_upkeep x join public.structure_types s on s.id = x.structure_type_id where s.category <> '') as mantenimento_strutture,
  (select count(*) from public.structure_fief_types) as limiti;
