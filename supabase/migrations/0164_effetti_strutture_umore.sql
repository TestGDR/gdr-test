-- =====================================================================
-- 0164 - Strutture militari con effetti: sconti sui mantenimenti e umore
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni (dopo la 0163).
--
-- - Effetti delle strutture (tabella structure_effects, da Gestione ->
--   Economia -> Esercito e mercato): sconto sui soldati (tutte le risorse o
--   una sola), sui draghi, sul foraggio di guerra, sulla Manodopera per
--   addestrare, e punti di umore del feudo. Contano solo le strutture finite.
-- - Gli sconti si sommano su tutti i feudi della casata, con un tetto:
--   soldati 40% (50% su una risorsa con uno sconto apposta), draghi 40%,
--   addestramento 60%. I punti di umore si sommano per feudo, al massimo +20.
-- - Ordine dei conti: tariffa -> riserva/guerra -> sconto -> Affamato.
-- - Umore del feudo = base (scorte rispetto ai minimi, come prima) + punti
--   delle strutture. Gli avvisi dello staff restano spenti finche' l'umore non
--   viene acceso (finche' i minimi di granaio non sono confermati).
-- - Nuovi valori delle 10 strutture militari (rese, costi, mantenimenti).
-- =====================================================================

create table if not exists public.structure_effects (
  id                uuid primary key default gen_random_uuid(),
  structure_type_id uuid not null references public.structure_types(id) on delete cascade,
  kind              text not null check (kind in ('sconto_soldati_tutte', 'sconto_soldati_risorsa', 'sconto_draghi',
                                                  'sconto_foraggio_guerra', 'sconto_addestramento', 'bonus_umore')),
  resource_id       uuid references public.resources(id) on delete cascade,
  value             numeric(6,2) not null check (value between 0 and 100)
);
create index if not exists structure_effects_type_idx on public.structure_effects(structure_type_id);
alter table public.structure_effects enable row level security;
drop policy if exists "visibili" on public.structure_effects;
create policy "visibili" on public.structure_effects for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.structure_effects;
create policy "economia con permesso" on public.structure_effects for all to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, insert, update, delete on public.structure_effects to authenticated;
grant select, insert, update, delete on public.structure_effects to service_role;

-- tetti degli sconti e dell'umore
alter table public.economy_settings
  add column if not exists cap_soldiers          numeric(5,2) not null default 40 check (cap_soldiers between 0 and 100),
  add column if not exists cap_soldiers_resource numeric(5,2) not null default 50 check (cap_soldiers_resource between 0 and 100),
  add column if not exists cap_dragons           numeric(5,2) not null default 40 check (cap_dragons between 0 and 100),
  add column if not exists cap_training          numeric(5,2) not null default 60 check (cap_training between 0 and 100),
  add column if not exists cap_mood_bonus        int          not null default 20 check (cap_mood_bonus between 0 and 100);
alter table public.mood_settings add column if not exists enabled boolean not null default false;

-- ---------------------------------------------------------------------
-- Sconti attivi di una casata (percentuali gia' con i tetti)
-- ---------------------------------------------------------------------
create or replace function public.house_discounts(p_house uuid)
returns jsonb
language sql stable
security definer set search_path = ''
as $$
  with e as (
    select x.kind, x.resource_id, sum(x.value) as v
      from public.structure_effects x
      join public.fief_structures fs on fs.structure_type_id = x.structure_type_id and fs.ready_at <= now()
      join public.fiefs f on f.id = fs.fief_id
     where f.house_id = p_house
     group by x.kind, x.resource_id
  ), s as (select * from public.economy_settings limit 1),
  base as (select coalesce((select v from e where kind = 'sconto_soldati_tutte'), 0) as all_pct)
  select jsonb_build_object(
    'soldiers', least(s.cap_soldiers, base.all_pct),
    'resources', coalesce((select jsonb_object_agg(e.resource_id::text, least(s.cap_soldiers_resource, base.all_pct + e.v))
                             from e where e.kind = 'sconto_soldati_risorsa' and e.resource_id is not null), '{}'::jsonb),
    'dragons', least(s.cap_dragons, coalesce((select v from e where kind = 'sconto_draghi'), 0)),
    'forage', least(100, coalesce((select v from e where kind = 'sconto_foraggio_guerra'), 0)),
    'training', least(s.cap_training, coalesce((select v from e where kind = 'sconto_addestramento'), 0))
  )
  from s, base
  where auth.uid() is null or public.is_house_member(p_house) or public.house_staff();
$$;
revoke execute on function public.house_discounts(uuid) from public, anon;
grant execute on function public.house_discounts(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Mantenimento mensile di esercito e draghi, con gli sconti
-- ---------------------------------------------------------------------
create or replace function public.house_upkeep(p_house uuid)
returns table (resource_id uuid, army int, dragons int)
language sql stable
security definer set search_path = ''
as $$
  with s as (
    select * from public.economy_settings limit 1
  ), disc as (
    select public.house_discounts(p_house) as j
  ), k as (
    select h.army_called, h.at_war, h.dragons_hungry,
           t.n,
           least(h.reserve_soldiers, t.n) as reserve,
           t.n - least(h.reserve_soldiers, t.n) as field
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
    -- regola generale ogni 1000 soldati
    select au.resource_id, eq.full_eq * au.per_1000 / 1000 as amount
      from public.army_upkeep au, eq
    union all
    -- eventuale mantenimento proprio di un tipo di truppa (Gestione -> Eserciti)
    select u.resource_id,
           t.quantity::numeric * u.amount / case when coalesce(cat.single_units, false) then 1 else 100 end
           * case when eq.n > 0 then eq.full_eq / eq.n else 0 end
      from public.house_troops t
      join public.troop_upkeep u on u.troop_type_id = t.troop_type_id
      join public.troop_types tt on tt.id = t.troop_type_id
      left join public.troop_categories cat on cat.id = tt.category_id
      cross join eq
     where t.house_id = p_house
  ), a_disc as (
    -- sconto: quello della risorsa (gia' con il generale) oppure il generale
    select a.resource_id,
           sum(a.amount) * (1 - coalesce((d.j -> 'resources' ->> a.resource_id::text)::numeric,
                                         (d.j ->> 'soldiers')::numeric, 0) / 100) as amount
      from a cross join disc d
     group by a.resource_id, d.j
    union all
    -- foraggio della campagna (solo il suo sconto)
    select r.id, eq.field / 100 * eq.war_forage_per_100 * (1 - coalesce((d.j ->> 'forage')::numeric, 0) / 100)
      from eq cross join disc d join public.resources r on lower(r.name) = 'alimenti agricoli'
     where eq.army_called and eq.at_war
  ), asum as (
    select a_disc.resource_id, ceil(sum(a_disc.amount))::int as amount from a_disc
     group by a_disc.resource_id having ceil(sum(a_disc.amount)) > 0
  ), dr as (
    -- draghi: casata del cavaliere (o del drago); sconto, poi Affamato
    select r.id as resource_id,
           sum(round(st.monthly_upkeep
                     * case when 'poco affamato' = any(x.pregi) then 0.75 else 1 end
                     * case when 'molto affamato' = any(x.difetti) then 1.5 else 1 end
                     * (1 - coalesce((d.j ->> 'dragons')::numeric, 0) / 100)
                     * case when k.dragons_hungry then s.dragon_hunger_factor else 1 end))::int as amount
      from public.dragons x
      left join public.characters c on c.id = x.rider_id
      join public.dragon_stages st on st.stage = x.stage
      join public.resources r on lower(r.name) = 'bestiame'
      cross join k cross join s cross join disc d
     where coalesce(c.house_id, x.house_id) = p_house and x.status = 'drago'
     group by r.id
  )
  select coalesce(asum.resource_id, dr.resource_id), coalesce(asum.amount, 0), coalesce(dr.amount, 0)
    from asum full join dr on dr.resource_id = asum.resource_id
   where auth.uid() is null or public.is_house_member(p_house) or public.house_staff();
$$;
grant execute on function public.house_upkeep(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Addestrare: la Manodopera ha lo sconto delle strutture
-- ---------------------------------------------------------------------
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
  v_cut numeric := coalesce((public.house_discounts(p_house) ->> 'training')::numeric, 0) / 100;
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

  for c in
    select r.id, r.name,
           (case when r.id = v_labor then ceil(p_count::numeric * v_crew * (1 - v_cut)) else 0 end
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
           (case when r.id = v_labor then ceil(p_count::numeric * v_crew * (1 - v_cut)) else 0 end
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

-- ---------------------------------------------------------------------
-- Umore di ogni feudo: base (scorte della casata) + punti delle strutture
-- ---------------------------------------------------------------------
create or replace function public.fief_mood(p_house uuid)
returns table (fief_id uuid, fief_name text, base int, bonus int, total int, label text, color text, alert boolean)
language sql stable
security definer set search_path = ''
as $$
  with b as (
    select coalesce(min(m.score), 50) as base from public.house_mood(p_house) m
  ), f as (
    select fi.id, fi.name,
           least((select cap_mood_bonus from public.economy_settings limit 1),
                 coalesce((select sum(x.value) from public.structure_effects x
                             join public.fief_structures fs on fs.structure_type_id = x.structure_type_id
                            where fs.fief_id = fi.id and fs.ready_at <= now() and x.kind = 'bonus_umore'), 0))::int as bonus
      from public.fiefs fi where fi.house_id = p_house
  )
  select f.id, f.name, b.base, f.bonus, greatest(0, least(100, b.base + f.bonus)), l.label, l.color, l.alert
    from f cross join b
    left join lateral (
      select ml.label, ml.color, ml.alert from public.mood_levels ml
       where ml.from_score <= greatest(0, least(100, b.base + f.bonus)) order by ml.from_score desc limit 1
    ) l on true
   where auth.uid() is null or public.is_house_member(p_house) or public.house_staff()
   order by f.name;
$$;
revoke execute on function public.fief_mood(uuid) from public, anon;
grant execute on function public.fief_mood(uuid) to authenticated;

-- Fine del giro mensile: avvisi allo staff solo se l'umore e' acceso
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
  if not coalesce((select enabled from public.mood_settings limit 1), false) then return 0; end if;

  for h in select id, name from public.houses where playable loop
    select m.fief_name, m.total, m.label, m.alert into v_worst from public.fief_mood(h.id) m order by m.total limit 1;
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
          'Casa ' || h.name || ' (' || v_worst.fief_name || '): umore del popolo ' || v_worst.label || ' (' || v_worst.total ||
          ' su 100). Scorte rispetto al minimo: ' || coalesce(v_detail, '') || '. Decidete voi in gioco che cosa succede.');
      end loop;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.run_house_upkeep(boolean) from public, anon;
grant execute on function public.run_house_upkeep(boolean) to authenticated;

-- =====================================================================
-- DATI
-- =====================================================================

-- Livelli dell'umore del documento
update public.mood_levels set from_score = 40 where label = 'Scontento' and from_score = 35;
update public.mood_levels set from_score = 70 where label = 'Prospero' and from_score = 65;
update public.mood_levels set from_score = 90 where label = 'Florido' and from_score = 85;

-- L'Intendenza ora e' un effetto: la vecchia colonna non si usa piu'
update public.structure_types set soldier_upkeep_cut = 0 where soldier_upkeep_cut <> 0;

-- Le 10 strutture militari: rese, costi e mantenimenti nuovi
create temporary table if not exists tmp_mil (n text);
delete from tmp_mil;
insert into tmp_mil values ('torre di guardia'), ('fucina d''armi'), ('caserma'), ('intendenza'), ('cantiere navale'),
  ('fortezza'), ('mura e fossato'), ('arsenale'), ('accampamento d''addestramento'), ('fossa dei draghi');

delete from public.structure_costs where structure_type_id in (select s.id from public.structure_types s join tmp_mil v on lower(s.name) = v.n);
delete from public.structure_incomes where structure_type_id in (select s.id from public.structure_types s join tmp_mil v on lower(s.name) = v.n);
delete from public.structure_upkeep where structure_type_id in (select s.id from public.structure_types s join tmp_mil v on lower(s.name) = v.n);
delete from public.structure_effects where structure_type_id in (select s.id from public.structure_types s join tmp_mil v on lower(s.name) = v.n);

insert into public.structure_costs (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
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
  ('torre di guardia', 'manodopera', 3),
  ('fucina d''armi', 'ferro', 10),
  ('caserma', 'manodopera', 6),
  ('cantiere navale', 'legname', 12),
  ('fortezza', 'oro', 15),
  ('arsenale', 'ferro', 10), ('arsenale', 'cavalli', 5),
  ('accampamento d''addestramento', 'manodopera', 14)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

insert into public.structure_upkeep (structure_type_id, resource_id, amount)
select s.id, r.id, v.a
from (values
  ('torre di guardia', 'manodopera', 3),
  ('fucina d''armi', 'ferro', 5), ('fucina d''armi', 'oro', 2),
  ('caserma', 'alimenti agricoli', 3), ('caserma', 'oro', 3),
  ('intendenza', 'oro', 2), ('intendenza', 'manodopera', 2),
  ('cantiere navale', 'legname', 5), ('cantiere navale', 'oro', 5),
  ('fortezza', 'alimenti agricoli', 3), ('fortezza', 'manodopera', 3), ('fortezza', 'oro', 5),
  ('mura e fossato', 'manodopera', 4), ('mura e fossato', 'pietra', 3),
  ('arsenale', 'ferro', 5), ('arsenale', 'legname', 3), ('arsenale', 'oro', 3),
  ('accampamento d''addestramento', 'alimenti agricoli', 5), ('accampamento d''addestramento', 'oro', 3),
  ('accampamento d''addestramento', 'cavalli', 2),
  ('fossa dei draghi', 'bestiame', 3)
) as v(s, r, a)
join public.structure_types s on lower(s.name) = v.s
join public.resources r on lower(r.name) = v.r;

-- Effetti speciali
insert into public.structure_effects (structure_type_id, kind, resource_id, value)
select s.id, v.k, r.id, v.a
from (values
  ('torre di guardia', 'bonus_umore', null, 3),
  ('fucina d''armi', 'sconto_soldati_risorsa', 'ferro', 25),
  ('caserma', 'sconto_soldati_tutte', null, 8), ('caserma', 'bonus_umore', null, 2),
  ('intendenza', 'sconto_soldati_tutte', null, 15), ('intendenza', 'sconto_foraggio_guerra', null, 25),
  ('fortezza', 'bonus_umore', null, 5),
  ('mura e fossato', 'bonus_umore', null, 6),
  ('arsenale', 'sconto_addestramento', null, 25),
  ('accampamento d''addestramento', 'sconto_addestramento', null, 50),
  ('fossa dei draghi', 'sconto_draghi', null, 25), ('fossa dei draghi', 'bonus_umore', null, 3)
) as v(s, k, rn, a)
join public.structure_types s on lower(s.name) = v.s
left join public.resources r on lower(r.name) = v.rn;

update public.structure_types s set description = v.d
from (values
  ('torre di guardia', '+3 Manodopera al mese e +3 all''umore del feudo.'),
  ('fucina d''armi', '+10 Ferro al mese; −25% di Ferro nel mantenimento dei soldati.'),
  ('caserma', '+6 Manodopera al mese; −8% sul mantenimento dei soldati; +2 all''umore.'),
  ('intendenza', '−15% sul mantenimento dei soldati e −25% sul foraggio di guerra.'),
  ('cantiere navale', 'Attacco navale; +12 Legname al mese. Solo feudi sul mare.'),
  ('fortezza', '+15 Oro al mese e +5 all''umore del feudo.'),
  ('mura e fossato', 'Difesa e +6 all''umore del feudo: è il costo della sicurezza.'),
  ('arsenale', '+10 Ferro e +5 Cavalli al mese; −25% di Manodopera per addestrare.'),
  ('accampamento d''addestramento', '+14 Manodopera al mese; −50% di Manodopera per addestrare.'),
  ('fossa dei draghi', '−25% di Bestiame per i draghi e +3 all''umore del feudo.')
) as v(n, d)
where lower(s.name) = v.n;

drop table tmp_mil;

-- Controllo finale: attesi 12 effetti, 84 costi, 35 rese (27 + 8 delle militari),
-- 53 mantenimenti, livelli dell'umore 0/20/40/50/70/90
select
  (select count(*) from public.structure_effects) as effetti,
  (select count(*) from public.structure_costs) as costi,
  (select count(*) from public.structure_incomes) as rese,
  (select count(*) from public.structure_upkeep) as mantenimenti,
  (select string_agg(from_score::text, '/' order by from_score) from public.mood_levels) as livelli_umore;
