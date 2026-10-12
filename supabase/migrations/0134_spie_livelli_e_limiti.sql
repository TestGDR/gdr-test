-- =====================================================================
-- 0134 - Spie: livelli con prezzo e probabilita' propri; quante spie si possono avere
-- Eseguire in Supabase DOPO la 0131: SQL Editor -> New query -> incolla -> Run
--
-- - Ogni livello ha il suo prezzo e le sue probabilita' di riuscita per
--   ricerca superficiale, normale e approfondita: si decidono riga per riga
--   in Gestione -> Spie -> Livelli (prima erano calcolate con una formula).
-- - Nessuno parte piu' con una spia: si reclutano tutte. Un personaggio puo'
--   averne 1; con il tratto "Spie" ne puo' avere 3.
-- =====================================================================

create table if not exists public.spy_levels (
  level     int primary key check (level between 1 and 20),
  cost      int not null default 0 check (cost between 0 and 10000000),  -- per arrivarci (livello 1 = reclutare)
  ok_light  int not null default 50 check (ok_light between 0 and 100), -- % di riuscita: ricerca superficiale
  ok_normal int not null default 50 check (ok_normal between 0 and 100),
  ok_deep   int not null default 50 check (ok_deep between 0 and 100)
);

-- livelli di partenza: gli stessi numeri usati finora
insert into public.spy_levels (level, cost, ok_light, ok_normal, ok_deep)
select l,
       case when l = 1 then s.recruit_cost else s.train_cost * l end,
       100 - greatest(s.min_fail, s.fail_light  - s.level_bonus * (l - 1)),
       100 - greatest(s.min_fail, s.fail_normal - s.level_bonus * (l - 1)),
       100 - greatest(s.min_fail, s.fail_deep   - s.level_bonus * (l - 1))
  from public.spy_settings s, generate_series(1, (select max_level from public.spy_settings)) l
on conflict do nothing;

alter table public.spy_levels enable row level security;
drop policy if exists "livelli spie visibili" on public.spy_levels;
create policy "livelli spie visibili" on public.spy_levels for select to authenticated using (true);
drop policy if exists "livelli spie: staff" on public.spy_levels;
create policy "livelli spie: staff" on public.spy_levels for all to authenticated
  using (public.has_permission('regole.gestire')) with check (public.has_permission('regole.gestire'));
grant select, insert, update, delete on public.spy_levels to authenticated;
grant select, insert, update, delete on public.spy_levels to service_role;

-- quante spie: 1 per tutti, 3 con il tratto
alter table public.spy_settings add column if not exists max_spies_trait int not null default 3 check (max_spies_trait between 1 and 100);
update public.spy_settings set max_spies = 1, max_spies_trait = 3;
alter table public.spy_settings alter column max_spies set default 1;

update public.traits
   set effect = 'Il personaggio può avere fino a 3 spie al suo servizio invece di 1 (pannello Spie). Vanno comunque reclutate.'
 where lower(name) = 'spie';

-- Quante spie puo' avere questo personaggio
create or replace function public.spy_limit(p_character uuid)
returns int
language sql stable
security definer set search_path = ''
as $$
  select case when exists (
           select 1 from public.character_traits ct join public.traits t on t.id = ct.trait_id
            where ct.character_id = p_character and lower(t.name) = lower(s.trait_name))
         then s.max_spies_trait else s.max_spies end
    from public.spy_settings s;
$$;
grant execute on function public.spy_limit(uuid) to authenticated;

-- Probabilita' di fallire (%) dal livello: 100 meno la riuscita scritta per quel livello
create or replace function public.spy_fail_chance(p_level int, p_depth text)
returns int
language sql stable
security definer set search_path = ''
as $$
  select 100 - coalesce((
    select case p_depth when 'superficiale' then l.ok_light when 'normale' then l.ok_normal else l.ok_deep end
      from public.spy_levels l where l.level = p_level), 0);
$$;
grant execute on function public.spy_fail_chance(int, text) to authenticated;

-- Nessuna spia in regalo: la funzione resta solo per non rompere le pagine gia' aperte
create or replace function public.spy_init(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  return;
end;
$$;
revoke execute on function public.spy_init(uuid) from public, anon;
grant execute on function public.spy_init(uuid) to authenticated;

-- Reclutare: costa quanto il livello 1; il limite dipende dal tratto
create or replace function public.spy_recruit(p_character uuid, p_name text, p_pay text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_limit int;
  v_cost int;
  v_id uuid;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Dai un nome alla spia (massimo 40 lettere).' using errcode = 'P0001';
  end if;
  v_limit := public.spy_limit(p_character);
  if (select count(*) from public.spies where character_id = p_character and status <> 'morta') >= v_limit then
    raise exception 'Puoi avere al massimo % %.', v_limit, case when v_limit = 1 then 'spia' else 'spie' end using errcode = 'P0001';
  end if;
  select cost into v_cost from public.spy_levels where level = 1;
  if v_cost is null then
    raise exception 'Le regole delle spie non sono ancora pronte (manca il livello 1).' using errcode = 'P0001';
  end if;
  perform public.spy_pay(p_character, v_cost, p_pay, 'Spie: reclutata ' || v_name);
  insert into public.spies (character_id, name) values (p_character, v_name) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.spy_recruit(uuid, text, text) from public, anon;
grant execute on function public.spy_recruit(uuid, text, text) to authenticated;

-- Addestrare: al livello dopo, se esiste, pagando il suo prezzo
create or replace function public.spy_train(p_spy uuid, p_pay text)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  sp public.spies;
  v_cost int;
begin
  select * into sp from public.spies where id = p_spy for update;
  if not found or not exists (select 1 from public.characters where id = sp.character_id and owner_id = auth.uid()) then
    raise exception 'Spia non valida.' using errcode = '42501';
  end if;
  if sp.status <> 'libera' then
    raise exception 'Si addestra solo una spia che non è in missione.' using errcode = 'P0001';
  end if;
  select cost into v_cost from public.spy_levels where level = sp.level + 1;
  if v_cost is null then
    raise exception 'La spia è già al livello massimo.' using errcode = 'P0001';
  end if;
  perform public.spy_pay(sp.character_id, v_cost, p_pay, 'Spie: ' || sp.name || ' al livello ' || (sp.level + 1));
  update public.spies set level = level + 1 where id = p_spy;
  return sp.level + 1;
end;
$$;
revoke execute on function public.spy_train(uuid, text) from public, anon;
grant execute on function public.spy_train(uuid, text) to authenticated;
