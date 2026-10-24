-- =====================================================================
-- 0163 - Economia dei feudi: tempi di costruzione, fasce, 31 strutture
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni (dopo la 0156).
--
-- Regole nuove:
-- - Ogni struttura ha una fascia (piccola / media / grande) e un tempo di
--   costruzione in mesi (1 / 2 / 3). Le risorse si pagano subito, lo spazio
--   e' occupato subito, ma la struttura rende, costa mantenimento e conta per
--   attacco e difesa solo a lavori finiti.
-- - Le strutture grandi non si costruiscono nei feudi piccoli.
-- - In un feudo si avvia una sola costruzione al mese, e non se ne avvia una
--   nuova se ce n'e' una che finisce dopo il mese successivo.
--   (Le strutture di BG dello staff non hanno questi limiti e sono pronte subito.)
-- Dati: tipo Agricolo con Legname +8; 31 strutture con costi, rese,
-- mantenimenti e tipi di feudo del documento (le 2 nuove: Grande tenuta e
-- Gilda dei mercanti).
-- =====================================================================

alter table public.structure_types
  add column if not exists tier        text not null default 'piccola',
  add column if not exists build_months int  not null default 0;
alter table public.structure_types drop constraint if exists structure_types_tier_check;
alter table public.structure_types add constraint structure_types_tier_check check (tier in ('piccola', 'media', 'grande'));
alter table public.structure_types drop constraint if exists structure_types_build_months_check;
alter table public.structure_types add constraint structure_types_build_months_check check (build_months between 0 and 24);

-- quando la struttura e' pronta (quelle gia' costruite: subito)
alter table public.fief_structures add column if not exists ready_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- Regole di costruzione
-- ---------------------------------------------------------------------
create or replace function public.fief_structures_build_rules()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  t public.structure_types;
  v_size text;
  v_month timestamptz := (date_trunc('month', now() at time zone 'Europe/Rome')) at time zone 'Europe/Rome';
begin
  if new.is_background then
    new.ready_at := now();
    return new;
  end if;
  select * into t from public.structure_types where id = new.structure_type_id;
  select size into v_size from public.fiefs where id = new.fief_id;
  if t.tier = 'grande' and v_size = 'piccolo' then
    raise exception 'Le strutture grandi si costruiscono solo nei feudi medi o grandi.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fief_structures s
              where s.fief_id = new.fief_id and not s.is_background and s.built_at >= v_month) then
    raise exception 'In questo feudo è già iniziata una costruzione questo mese: la prossima dal 1° del mese.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fief_structures s
              where s.fief_id = new.fief_id and s.ready_at > v_month + interval '2 months') then
    raise exception 'C''è già una costruzione in corso che finisce dopo il mese prossimo: aspetta che sia quasi pronta.' using errcode = 'P0001';
  end if;
  new.ready_at := now() + make_interval(months => coalesce(t.build_months, 0));
  return new;
end;
$$;
drop trigger if exists fief_structures_build_rules on public.fief_structures;
create trigger fief_structures_build_rules
  before insert on public.fief_structures
  for each row execute function public.fief_structures_build_rules();

-- ---------------------------------------------------------------------
-- Produzione dei feudi: le strutture contano solo a lavori finiti
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
    select f.id as fief_id, f.house_id, x.resource_id, round(x.amount * f.sf)::bigint as income, 0::bigint as upkeep
    from f join public.fief_type_incomes x on x.fief_type_id = f.fief_type_id
    union all
    select f.id, f.house_id, x.resource_id, 0, round(x.amount * f.sf)::bigint
    from f join public.fief_type_upkeep x on x.fief_type_id = f.fief_type_id
    union all
    select f.id, f.house_id, x.resource_id, round(x.amount * f.sf * f.sec)::bigint, 0
    from f join public.fief_type_incomes x on x.fief_type_id = f.fief_type2_id
    union all
    select f.id, f.house_id, x.resource_id, 0, round(x.amount * f.sf * f.sec)::bigint
    from f join public.fief_type_upkeep x on x.fief_type_id = f.fief_type2_id
    union all
    select f.id, f.house_id, si.resource_id, si.amount, 0
    from public.fief_structures fs join f on f.id = fs.fief_id
    join public.structure_incomes si on si.structure_type_id = fs.structure_type_id
    where fs.ready_at <= now()
    union all
    select f.id, f.house_id, su.resource_id, 0, su.amount
    from public.fief_structures fs join f on f.id = fs.fief_id
    join public.structure_upkeep su on su.structure_type_id = fs.structure_type_id
    where fs.ready_at <= now()
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

-- Mantenimento di esercito e draghi: l'Intendenza conta solo se e' pronta
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
           1 - coalesce((select max(st.soldier_upkeep_cut)
                           from public.fief_structures fs
                           join public.fiefs f on f.id = fs.fief_id
                           join public.structure_types st on st.id = fs.structure_type_id
                          where f.house_id = p_house and fs.ready_at <= now()), 0) / 100 as steward
      from public.houses h
      cross join lateral (select coalesce(sum(q.quantity), 0)::numeric as n from public.house_troops q where q.house_id = h.id) t
     where h.id = p_house
  ), eq as (
    select k.*, s.war_forage_per_100,
           case when not k.army_called then k.n * s.reserve_factor
                when k.at_war then k.field * s.war_factor + k.reserve
                else k.field + k.reserve * s.reserve_factor end as full_eq
      from k, s
  ), a as (
    select au.resource_id, eq.full_eq * au.per_1000 / 1000 * eq.steward as amount
      from public.army_upkeep au, eq
    union all
    select r.id, eq.field / 100 * eq.war_forage_per_100 * eq.steward
      from eq join public.resources r on lower(r.name) = 'alimenti agricoli'
     where eq.army_called and eq.at_war
    union all
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

-- =====================================================================
-- DATI
-- =====================================================================

-- Agricolo: anche Legname 8
insert into public.fief_type_incomes (fief_type_id, resource_id, amount)
select t.id, r.id, 8
  from public.fief_types t, public.resources r
 where lower(t.name) = 'agricolo' and lower(r.name) = 'legname'
on conflict (fief_type_id, resource_id) do update set amount = excluded.amount;
update public.fief_types set description = 'Alimenti, Bestiame, Cavalli e un po'' di Legname. Unico tipo che produce Bestiame.'
 where lower(name) = 'agricolo';

-- Strutture (31): le 2 nuove si creano, poi si riscrivono tutte
insert into public.structure_types (name) values ('Grande tenuta'), ('Gilda dei mercanti')
on conflict do nothing;

drop table if exists tmp_strutture;
create temporary table tmp_strutture (n text, c text, o int, tier text, months int, att int, def int, cut numeric, d text);
insert into tmp_strutture values
  ('mulino', 'Produzione', 0, 'piccola', 1, 0, 0, 0, ''),
  ('segheria', 'Produzione', 1, 'piccola', 1, 0, 0, 0, ''),
  ('cava', 'Produzione', 2, 'piccola', 1, 0, 0, 0, ''),
  ('allevamento', 'Produzione', 3, 'piccola', 1, 0, 0, 0, ''),
  ('peschiera', 'Produzione', 4, 'piccola', 1, 0, 0, 0, 'Pesca e saline: cibo per i feudi sul mare.'),
  ('orti e granai', 'Produzione', 5, 'piccola', 1, 0, 0, 0, 'Cibo extra, si costruisce in tutti i feudi.'),
  ('miniera', 'Produzione', 6, 'media', 2, 0, 0, 0, ''),
  ('scuderie', 'Produzione', 7, 'media', 2, 0, 0, 0, ''),
  ('vigneti e telai', 'Produzione', 8, 'media', 2, 0, 0, 0, ''),
  ('borgo', 'Produzione', 9, 'media', 2, 0, 0, 0, 'Villaggio: più uomini da addestrare.'),
  ('conceria', 'Produzione', 10, 'media', 2, 0, 0, 0, 'Trasforma bestiame in pelli, lana e cibo.'),
  ('pascoli dei draghi', 'Produzione', 11, 'media', 2, 0, 0, 0, 'Grandi pascoli: serve soprattutto a nutrire i draghi.'),
  ('haras', 'Produzione', 12, 'grande', 3, 10, 0, 0, 'Allevamento di destrieri da guerra (cavalleria).'),
  ('grande tenuta', 'Produzione', 13, 'grande', 3, 0, 0, 0, 'Grandi campi e stalle: molto cibo e bestiame.'),
  ('mercato', 'Commercio e prestigio', 20, 'piccola', 1, 0, 0, 0, ''),
  ('magazzino', 'Commercio e prestigio', 21, 'piccola', 1, 0, 0, 0, ''),
  ('locanda', 'Commercio e prestigio', 22, 'piccola', 1, 0, 0, 0, 'Taverna e locanda: oro dai viandanti.'),
  ('tempio', 'Commercio e prestigio', 23, 'media', 2, 0, 0, 0, 'Incensi e paramenti: consuma beni di lusso.'),
  ('emporio dei lussi', 'Commercio e prestigio', 24, 'media', 2, 0, 0, 0, 'Commercio di merci pregiate.'),
  ('porto', 'Commercio e prestigio', 25, 'grande', 3, 0, 0, 0, 'Solo feudi sul mare.'),
  ('gilda dei mercanti', 'Commercio e prestigio', 26, 'grande', 3, 0, 0, 0, 'I grandi mercanti del feudo: molto oro.'),
  ('torre di guardia', 'Militari', 30, 'piccola', 1, 0, 5, 0, ''),
  ('fucina d''armi', 'Militari', 31, 'piccola', 1, 10, 0, 0, ''),
  ('caserma', 'Militari', 32, 'media', 2, 10, 0, 0, ''),
  ('intendenza', 'Militari', 33, 'media', 2, 0, 0, 12, 'Riduce del 12% il mantenimento dei soldati (tutte le risorse). Una per feudo.'),
  ('cantiere navale', 'Militari', 34, 'media', 2, 10, 0, 0, 'Attacco navale.'),
  ('fortezza', 'Militari', 35, 'grande', 3, 0, 20, 0, ''),
  ('mura e fossato', 'Militari', 36, 'grande', 3, 0, 15, 0, 'Cinta muraria: riparazioni continue.'),
  ('arsenale', 'Militari', 37, 'grande', 3, 20, 0, 0, 'Armi e macchine da guerra in serie.'),
  ('accampamento d''addestramento', 'Militari', 38, 'grande', 3, 15, 0, 0, 'Addestra truppe fresche.'),
  ('fossa dei draghi', 'Militari', 39, 'grande', 3, 0, 20, 0, 'Solo prestigio e difesa. Il consumo dei draghi è calcolato a parte.');

update public.structure_types s
   set category = v.c, sort_order = v.o, tier = v.tier, build_months = v.months, attack = v.att, defense = v.def,
       soldier_upkeep_cut = v.cut, description = case when v.d = '' then s.description else v.d end
  from tmp_strutture v
 where lower(s.name) = v.n;

delete from public.structure_costs where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);
delete from public.structure_incomes where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);
delete from public.structure_upkeep where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);
delete from public.structure_fief_types where structure_type_id in (select s.id from public.structure_types s join tmp_strutture v on lower(s.name) = v.n);

insert into public.structure_costs (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'legname', 50), ('mulino', 'pietra', 50),
  ('segheria', 'legname', 50), ('segheria', 'pietra', 50),
  ('cava', 'legname', 50), ('cava', 'ferro', 50),
  ('allevamento', 'legname', 75), ('allevamento', 'manodopera', 25),
  ('peschiera', 'legname', 75), ('peschiera', 'oro', 25),
  ('orti e granai', 'legname', 50), ('orti e granai', 'pietra', 25), ('orti e granai', 'oro', 25),
  ('miniera', 'legname', 100), ('miniera', 'oro', 100),
  ('scuderie', 'legname', 100), ('scuderie', 'pietra', 100),
  ('vigneti e telai', 'legname', 100), ('vigneti e telai', 'oro', 100),
  ('borgo', 'legname', 100), ('borgo', 'pietra', 50), ('borgo', 'alimenti agricoli', 50),
  ('conceria', 'legname', 100), ('conceria', 'pietra', 100),
  ('pascoli dei draghi', 'legname', 100), ('pascoli dei draghi', 'manodopera', 50), ('pascoli dei draghi', 'cavalli', 25), ('pascoli dei draghi', 'bestiame', 25),
  ('haras', 'legname', 100), ('haras', 'pietra', 100), ('haras', 'cavalli', 100), ('haras', 'manodopera', 50),
  ('grande tenuta', 'legname', 100), ('grande tenuta', 'pietra', 100), ('grande tenuta', 'manodopera', 100), ('grande tenuta', 'oro', 50),
  ('mercato', 'legname', 50), ('mercato', 'pietra', 50),
  ('magazzino', 'legname', 50), ('magazzino', 'pietra', 50),
  ('locanda', 'legname', 50), ('locanda', 'pietra', 25), ('locanda', 'oro', 25),
  ('tempio', 'pietra', 100), ('tempio', 'oro', 75), ('tempio', 'beni di lusso', 25),
  ('emporio dei lussi', 'pietra', 100), ('emporio dei lussi', 'oro', 50), ('emporio dei lussi', 'beni di lusso', 50),
  ('porto', 'legname', 100), ('porto', 'pietra', 100), ('porto', 'ferro', 100), ('porto', 'oro', 50),
  ('gilda dei mercanti', 'pietra', 100), ('gilda dei mercanti', 'oro', 150), ('gilda dei mercanti', 'beni di lusso', 100),
  ('torre di guardia', 'pietra', 50), ('torre di guardia', 'legname', 50),
  ('fucina d''armi', 'pietra', 50), ('fucina d''armi', 'ferro', 50),
  ('caserma', 'legname', 75), ('caserma', 'pietra', 75), ('caserma', 'alimenti agricoli', 50),
  ('intendenza', 'legname', 75), ('intendenza', 'pietra', 75), ('intendenza', 'oro', 50),
  ('cantiere navale', 'legname', 75), ('cantiere navale', 'ferro', 75), ('cantiere navale', 'oro', 50),
  ('fortezza', 'pietra', 150), ('fortezza', 'ferro', 100), ('fortezza', 'oro', 100),
  ('mura e fossato', 'pietra', 250), ('mura e fossato', 'legname', 100),
  ('arsenale', 'pietra', 150), ('arsenale', 'ferro', 150), ('arsenale', 'legname', 50),
  ('accampamento d''addestramento', 'legname', 100), ('accampamento d''addestramento', 'pietra', 100),
  ('accampamento d''addestramento', 'manodopera', 100), ('accampamento d''addestramento', 'alimenti agricoli', 50),
  ('fossa dei draghi', 'pietra', 150), ('fossa dei draghi', 'ferro', 100), ('fossa dei draghi', 'oro', 100)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

insert into public.structure_incomes (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'alimenti agricoli', 20),
  ('segheria', 'legname', 20),
  ('cava', 'pietra', 20),
  ('allevamento', 'bestiame', 18),
  ('peschiera', 'alimenti agricoli', 15),
  ('orti e granai', 'alimenti agricoli', 12),
  ('miniera', 'ferro', 32),
  ('scuderie', 'cavalli', 28),
  ('vigneti e telai', 'beni di lusso', 26),
  ('borgo', 'manodopera', 30),
  ('conceria', 'beni di lusso', 16), ('conceria', 'alimenti agricoli', 12),
  ('pascoli dei draghi', 'bestiame', 40),
  ('haras', 'cavalli', 50),
  ('grande tenuta', 'alimenti agricoli', 45), ('grande tenuta', 'bestiame', 15),
  ('mercato', 'oro', 20),
  ('magazzino', 'alimenti agricoli', 8), ('magazzino', 'bestiame', 5), ('magazzino', 'legname', 5),
  ('locanda', 'oro', 20),
  ('tempio', 'oro', 32),
  ('emporio dei lussi', 'oro', 40),
  ('porto', 'oro', 60), ('porto', 'legname', 10),
  ('gilda dei mercanti', 'oro', 75), ('gilda dei mercanti', 'beni di lusso', 12)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

insert into public.structure_upkeep (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('mulino', 'manodopera', 3),
  ('segheria', 'manodopera', 3),
  ('cava', 'manodopera', 3),
  ('allevamento', 'alimenti agricoli', 5),
  ('peschiera', 'manodopera', 4), ('peschiera', 'legname', 2),
  ('orti e granai', 'manodopera', 3),
  ('miniera', 'manodopera', 5), ('miniera', 'legname', 5),
  ('scuderie', 'alimenti agricoli', 6), ('scuderie', 'bestiame', 4),
  ('vigneti e telai', 'manodopera', 4),
  ('borgo', 'alimenti agricoli', 8),
  ('conceria', 'bestiame', 8), ('conceria', 'manodopera', 4),
  ('pascoli dei draghi', 'manodopera', 5), ('pascoli dei draghi', 'alimenti agricoli', 4),
  ('haras', 'alimenti agricoli', 8), ('haras', 'bestiame', 5), ('haras', 'manodopera', 5),
  ('grande tenuta', 'manodopera', 6),
  ('mercato', 'manodopera', 3),
  ('magazzino', 'manodopera', 3),
  ('locanda', 'alimenti agricoli', 5), ('locanda', 'beni di lusso', 2),
  ('tempio', 'beni di lusso', 6),
  ('emporio dei lussi', 'beni di lusso', 10), ('emporio dei lussi', 'manodopera', 4),
  ('porto', 'manodopera', 5), ('porto', 'oro', 8),
  ('gilda dei mercanti', 'beni di lusso', 10), ('gilda dei mercanti', 'manodopera', 6),
  ('torre di guardia', 'manodopera', 3),
  ('fucina d''armi', 'ferro', 5), ('fucina d''armi', 'oro', 2),
  ('caserma', 'alimenti agricoli', 5), ('caserma', 'oro', 5),
  ('intendenza', 'oro', 3), ('intendenza', 'manodopera', 3),
  ('cantiere navale', 'legname', 5), ('cantiere navale', 'oro', 5),
  ('fortezza', 'alimenti agricoli', 5), ('fortezza', 'manodopera', 5), ('fortezza', 'oro', 10),
  ('mura e fossato', 'manodopera', 8), ('mura e fossato', 'pietra', 5),
  ('arsenale', 'ferro', 8), ('arsenale', 'legname', 5), ('arsenale', 'oro', 5),
  ('accampamento d''addestramento', 'alimenti agricoli', 8), ('accampamento d''addestramento', 'oro', 5),
  ('accampamento d''addestramento', 'cavalli', 3),
  ('fossa dei draghi', 'bestiame', 5)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

drop table tmp_strutture;

-- Tipi di feudo in cui si costruiscono (le strutture non elencate: ovunque)
insert into public.structure_fief_types (structure_type_id, fief_type_id)
select s.id, t.id
from (values
  ('mulino', 'agricolo'),
  ('segheria', 'agricolo'), ('segheria', 'commerciale'), ('segheria', 'militare'),
  ('cava', 'minerario'), ('cava', 'militare'),
  ('allevamento', 'agricolo'),
  ('peschiera', 'costiero'), ('peschiera', 'commerciale'), ('peschiera', 'minerario'),
  ('miniera', 'minerario'),
  ('scuderie', 'agricolo'), ('scuderie', 'militare'),
  ('vigneti e telai', 'agricolo'), ('vigneti e telai', 'commerciale'), ('vigneti e telai', 'costiero'),
  ('conceria', 'agricolo'), ('conceria', 'commerciale'), ('conceria', 'militare'),
  ('pascoli dei draghi', 'agricolo'), ('pascoli dei draghi', 'militare'),
  ('haras', 'agricolo'), ('haras', 'militare'),
  ('grande tenuta', 'agricolo'), ('grande tenuta', 'costiero'),
  ('emporio dei lussi', 'commerciale'), ('emporio dei lussi', 'costiero'),
  ('porto', 'commerciale'), ('porto', 'costiero'), ('porto', 'minerario'),
  ('gilda dei mercanti', 'commerciale'), ('gilda dei mercanti', 'costiero'),
  ('cantiere navale', 'commerciale'), ('cantiere navale', 'costiero'), ('cantiere navale', 'minerario'),
  ('accampamento d''addestramento', 'agricolo'), ('accampamento d''addestramento', 'commerciale'),
  ('accampamento d''addestramento', 'militare')
) as v(s, t)
join public.structure_types s on lower(s.name) = v.s
join public.fief_types t on lower(t.name) = v.t
on conflict do nothing;

-- Controllo finale: attesi 31 strutture con fascia e tempo, 84 costi, 27 rese,
-- 53 mantenimenti, 38 limiti di tipo, 23 introiti dei tipi di feudo
select
  (select count(*) from public.structure_types where category <> '' and build_months > 0) as strutture,
  (select count(*) from public.structure_costs) as costi,
  (select count(*) from public.structure_incomes) as rese,
  (select count(*) from public.structure_upkeep) as mantenimenti,
  (select count(*) from public.structure_fief_types) as limiti_tipo,
  (select count(*) from public.fief_type_incomes) as introiti_tipi;
