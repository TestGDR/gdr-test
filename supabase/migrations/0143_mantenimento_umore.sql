-- =====================================================================
-- 0143 - Mantenimento di esercito e draghi, umore del popolo
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Ogni tipo di truppa ha un mantenimento al mese ogni 100 soldati
--   (Gestione -> Eserciti). Esercito richiamato: paga tutto; congedato:
--   paga un quarto e conta comunque nella potenza.
-- - Richiamano e congedano il signore della casata (ruolo che gestisce le
--   risorse) e lo staff.
-- - I draghi consumano ogni mese il Bestiame della casata del cavaliere
--   (mantenimento della fase, -25% "poco affamato", +50% "molto affamato").
-- - Umore del popolo: per ogni risorsa un minimo "da granaio" per grandezza
--   del feudo (Gestione -> Economia). Il tesoro della casata, confrontato con
--   la somma dei minimi dei suoi feudi, da' un punteggio da 0 a 100 (50 =
--   stabile). Nomi, colori e soglie dei livelli si decidono in Gestione.
-- - Il 1 del mese si paga il mantenimento (mai sotto zero: quel che manca
--   resta scritto) e lo staff riceve un avviso per le casate a un livello
--   con l'avviso acceso (di base: malcontento e rivolta).
--   Si puo' eseguire piu' volte senza danni.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mantenimento delle truppe (ogni 100 soldati, al mese, da richiamate)
-- ---------------------------------------------------------------------
create table if not exists public.troop_upkeep (
  troop_type_id uuid not null references public.troop_types(id) on delete cascade,
  resource_id   uuid not null references public.resources(id) on delete cascade,
  amount        int  not null check (amount between 1 and 1000000),
  primary key (troop_type_id, resource_id)
);
alter table public.troop_upkeep enable row level security;
drop policy if exists "visibili" on public.troop_upkeep;
create policy "visibili" on public.troop_upkeep for select to authenticated using (true);
drop policy if exists "eserciti con permesso" on public.troop_upkeep;
create policy "eserciti con permesso" on public.troop_upkeep for all to authenticated
  using (public.has_permission('eserciti.gestire')) with check (public.has_permission('eserciti.gestire'));
grant select, insert, update, delete on public.troop_upkeep to authenticated;
grant select, insert, update, delete on public.troop_upkeep to service_role;

alter table public.houses add column if not exists army_called boolean not null default false;

-- ---------------------------------------------------------------------
-- Minimi "da granaio" per grandezza del feudo
-- ---------------------------------------------------------------------
create table if not exists public.fief_minimums (
  size        text not null check (size in ('piccolo', 'medio', 'grande')),
  resource_id uuid not null references public.resources(id) on delete cascade,
  amount      int  not null check (amount between 1 and 100000000),
  primary key (size, resource_id)
);
alter table public.fief_minimums enable row level security;
drop policy if exists "visibili" on public.fief_minimums;
create policy "visibili" on public.fief_minimums for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.fief_minimums;
create policy "economia con permesso" on public.fief_minimums for all to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, insert, update, delete on public.fief_minimums to authenticated;
grant select, insert, update, delete on public.fief_minimums to service_role;

-- mesi in cui il mantenimento e' gia' stato pagato
create table if not exists public.upkeep_months (month date primary key, run_at timestamptz not null default now());
alter table public.upkeep_months enable row level security;
grant select, insert, update, delete on public.upkeep_months to service_role;

-- ---------------------------------------------------------------------
-- Chi puo' vedere i conti di una casata e chi la comanda
-- ---------------------------------------------------------------------
create or replace function public.house_staff()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.has_permission('economia.gestire') or public.has_permission('eserciti.gestire');
$$;
grant execute on function public.house_staff() to authenticated;

create or replace function public.house_can_command(p_house uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.house_staff() or exists (
    select 1
      from public.characters ch
      join public.house_roles hr on hr.id = ch.house_role_id
      join public.houses h on h.id = ch.house_id
     where ch.owner_id = auth.uid() and ch.house_id = p_house and hr.can_build and h.playable
  );
$$;
grant execute on function public.house_can_command(uuid) to authenticated;

-- Richiamare o congedare l'esercito
create or replace function public.set_army_called(p_house uuid, p_called boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_by text;
begin
  if not public.house_can_command(p_house) then
    raise exception 'Non puoi comandare l''esercito di questa casata.' using errcode = '42501';
  end if;
  update public.houses set army_called = p_called where id = p_house;
  if not found then raise exception 'Casata non trovata.' using errcode = 'P0001'; end if;
  v_by := coalesce((select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1), 'Staff');
  insert into public.economy_log (house_id, resource_id, delta, reason)
    values (p_house, null, 0, case when p_called then 'Esercito richiamato da ' else 'Esercito congedato da ' end || v_by);
end;
$$;
revoke execute on function public.set_army_called(uuid, boolean) from public, anon;
grant execute on function public.set_army_called(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Mantenimento mensile di una casata, risorsa per risorsa
-- (lo vedono i membri e lo staff; il controllo automatico non ha un utente)
-- ---------------------------------------------------------------------
create or replace function public.house_upkeep(p_house uuid)
returns table (resource_id uuid, army int, dragons int)
language sql stable
security definer set search_path = ''
as $$
  with a as (
    select u.resource_id,
           ceil(sum(t.quantity::numeric * u.amount / 100) * case when h.army_called then 1 else 0.25 end)::int as amount
      from public.house_troops t
      join public.troop_upkeep u on u.troop_type_id = t.troop_type_id
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

-- ---------------------------------------------------------------------
-- Umore del popolo: punteggio da 0 a 100 per ogni risorsa con un minimo.
-- 50 = scorte esattamente al minimo (stabile); sotto cala verso 0 (a zero
-- scorte); sopra sale fino a 100, che si raggiunge con "full_ratio" volte il
-- minimo (di base il doppio). I livelli (nome, colore, da che punteggio,
-- se avvisare lo staff) si decidono in Gestione -> Economia.
-- ---------------------------------------------------------------------
create table if not exists public.mood_settings (
  id         boolean primary key default true check (id),
  full_ratio numeric not null default 2 check (full_ratio > 1 and full_ratio <= 100)
);
insert into public.mood_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.mood_levels (
  id         uuid primary key default gen_random_uuid(),
  from_score int  not null unique check (from_score between 0 and 100),
  label      text not null check (char_length(label) between 1 and 40),
  color      text not null default '#65a30d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  alert      boolean not null default false -- a questo livello lo staff riceve un avviso ogni mese
);
insert into public.mood_levels (from_score, label, color, alert)
select * from (values
  (0,  'In rivolta',  '#b91c1c', true),
  (20, 'Malcontento', '#ea580c', true),
  (35, 'Scontento',   '#ca8a04', false),
  (50, 'Stabile',     '#65a30d', false),
  (65, 'Prospero',    '#16a34a', false),
  (85, 'Florido',     '#0d9488', false)
) v(from_score, label, color, alert)
where not exists (select 1 from public.mood_levels);

alter table public.mood_settings enable row level security;
alter table public.mood_levels enable row level security;
drop policy if exists "visibili" on public.mood_settings;
create policy "visibili" on public.mood_settings for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.mood_settings;
create policy "economia con permesso" on public.mood_settings for update to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
drop policy if exists "visibili" on public.mood_levels;
create policy "visibili" on public.mood_levels for select to authenticated using (true);
drop policy if exists "economia con permesso" on public.mood_levels;
create policy "economia con permesso" on public.mood_levels for all to authenticated
  using (public.has_permission('economia.gestire')) with check (public.has_permission('economia.gestire'));
grant select, update on public.mood_settings to authenticated;
grant select, insert, update, delete on public.mood_levels to authenticated;
grant select, insert, update, delete on public.mood_settings, public.mood_levels to service_role;

-- punteggio da "quanto c'e'" e "quanto serve"
drop function if exists public.mood_level(numeric);
create or replace function public.mood_score(p_have numeric, p_need numeric)
returns int
language sql stable
security definer set search_path = ''
as $$
  select case
    when p_need <= 0 then 100
    when p_have <= p_need then floor(p_have / p_need * 50)::int
    else least(100, 50 + floor((p_have / p_need - 1) / ((select full_ratio from public.mood_settings) - 1) * 50))::int
  end;
$$;
grant execute on function public.mood_score(numeric, numeric) to authenticated;

-- Per ogni risorsa con un minimo: quanto c'e', quanto serve, punteggio e livello
drop function if exists public.house_mood(uuid);
create or replace function public.house_mood(p_house uuid)
returns table (resource_id uuid, have bigint, need bigint, score int, label text, color text, alert boolean)
language sql stable
security definer set search_path = ''
as $$
  with need as (
    select m.resource_id, sum(m.amount)::bigint as need
      from public.fiefs f
      join public.fief_minimums m on m.size = f.size
     where f.house_id = p_house
     group by m.resource_id
  ), scored as (
    select n.resource_id, coalesce(hr.amount, 0)::bigint as have, n.need,
           public.mood_score(coalesce(hr.amount, 0), n.need) as score
      from need n
      left join public.house_resources hr on hr.house_id = p_house and hr.resource_id = n.resource_id
  )
  select s.resource_id, s.have, s.need, s.score, l.label, l.color, l.alert
    from scored s
    left join lateral (
      select ml.label, ml.color, ml.alert from public.mood_levels ml
       where ml.from_score <= s.score order by ml.from_score desc limit 1
    ) l on true
   where auth.uid() is null or public.is_house_member(p_house) or public.house_staff();
$$;
grant execute on function public.house_mood(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Il mese: si paga il mantenimento, poi si avvisa lo staff dei malumori
-- ---------------------------------------------------------------------
create or replace function public.run_house_upkeep(p_force boolean default false)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
  h record;
  u record;
  v_have bigint;
  v_take bigint;
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
    -- mantenimento: mai sotto zero, quel che manca resta scritto
    for u in select * from public.house_upkeep(h.id) loop
      if u.army + u.dragons <= 0 then continue; end if;
      select coalesce(amount, 0) into v_have from public.house_resources where house_id = h.id and resource_id = u.resource_id;
      v_have := coalesce(v_have, 0);
      v_take := least(v_have, (u.army + u.dragons)::bigint);
      if v_take > 0 then
        perform public.economy_add(h.id, u.resource_id, -v_take,
          'Mantenimento del mese' ||
          case when u.army > 0 then ': esercito ' || u.army else '' end ||
          case when u.dragons > 0 then case when u.army > 0 then ', draghi ' else ': draghi ' end || u.dragons else '' end);
      end if;
      if v_take < u.army + u.dragons then
        insert into public.economy_log (house_id, resource_id, delta, reason)
          values (h.id, u.resource_id, 0, 'Mantenimento: mancano ' || (u.army + u.dragons - v_take) || ' (il tesoro non basta)');
      end if;
      n := n + 1;
    end loop;

    -- umore: conta la risorsa che sta peggio; si avvisa se il suo livello lo prevede
    select m.score, m.label, m.alert into v_worst from public.house_mood(h.id) m order by m.score limit 1;
    select string_agg(r.name || ' ' || m.have || ' su ' || m.need, ', ' order by r.sort_order, r.name)
      into v_detail
      from public.house_mood(h.id) m join public.resources r on r.id = m.resource_id;
    if v_worst.alert then
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

-- ogni 1 del mese, dopo introiti e commerci (il controllo evita doppi pagamenti)
select cron.unschedule('mantenimento-mensile') where exists (select 1 from cron.job where jobname = 'mantenimento-mensile');
select cron.schedule('mantenimento-mensile', '45 * 1 * *', 'select public.run_house_upkeep(false)');
