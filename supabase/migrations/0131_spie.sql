-- =====================================================================
-- 0131 - Spie
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Ogni personaggio ha le sue spie: parte con 1 se ha il tratto "Spie",
--   altrimenti con 0. Si reclutano e si addestrano (salgono di livello)
--   pagando con le monete del conto personale o con l'Oro della casata.
-- - Missione: la spia parte per un luogo con una richiesta; ci mette il
--   tempo di una staffetta piu' le ore della ricerca (superficiale,
--   normale, approfondita). Piu' la ricerca e' profonda, piu' e' facile
--   che fallisca; piu' la spia e' di livello alto, meno fallisce.
-- - Alla partenza si tira il dado (d100) e si apre un ticket per lo staff
--   con la richiesta e l'esito. Il giocatore scopre l'esito solo quando la
--   missione finisce: se riesce legge il rapporto scritto dallo staff, se
--   fallisce la spia e' catturata o uccisa.
-- - Tutti i numeri si cambiano in Gestione -> Spie.
-- =====================================================================

create table if not exists public.spy_settings (
  id            boolean primary key default true check (id),
  trait_name    text not null default 'Spie',          -- tratto che da' la prima spia
  recruit_cost  int  not null default 100 check (recruit_cost between 0 and 1000000),
  train_cost    int  not null default 50  check (train_cost between 0 and 1000000), -- x il nuovo livello
  max_level     int  not null default 5   check (max_level between 1 and 20),
  max_spies     int  not null default 5   check (max_spies between 1 and 100),
  hours_light   int  not null default 2   check (hours_light between 0 and 1000),
  hours_normal  int  not null default 6   check (hours_normal between 0 and 1000),
  hours_deep    int  not null default 12  check (hours_deep between 0 and 1000),
  fail_light    int  not null default 15  check (fail_light between 0 and 100),
  fail_normal   int  not null default 30  check (fail_normal between 0 and 100),
  fail_deep     int  not null default 45  check (fail_deep between 0 and 100),
  level_bonus   int  not null default 5   check (level_bonus between 0 and 100),  -- punti in meno per livello oltre il primo
  min_fail      int  not null default 5   check (min_fail between 0 and 100),
  killed_pct    int  not null default 40  check (killed_pct between 0 and 100)   -- tra i fallimenti: uccisa (il resto catturata)
);
insert into public.spy_settings (id) values (true) on conflict do nothing;

alter table public.characters add column if not exists spies_started boolean not null default false;

create table if not exists public.spies (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  level        int  not null default 1 check (level between 1 and 20),
  status       text not null default 'libera' check (status in ('libera', 'missione', 'catturata', 'morta')),
  created_at   timestamptz not null default now()
);
create index if not exists spies_character_idx on public.spies (character_id);

create table if not exists public.spy_missions (
  id             uuid primary key default gen_random_uuid(),
  spy_id         uuid references public.spies(id) on delete set null,
  character_id   uuid not null references public.characters(id) on delete cascade,
  spy_name       text not null,
  spy_level      int  not null,
  target         text not null check (char_length(target) between 1 and 200),
  location_id    uuid references public.locations(id) on delete set null,
  place_name     text not null default '',
  depth          text not null check (depth in ('superficiale', 'normale', 'approfondita')),
  request        text not null check (char_length(request) between 1 and 4000),
  started_at     timestamptz not null default now(),
  ends_at        timestamptz not null,
  travel_minutes int  not null default 0,
  research_hours int  not null default 0,
  fail_chance    int  not null,
  roll           int  not null,
  outcome        text not null check (outcome in ('riuscita', 'catturata', 'uccisa')),
  report         text not null default '' check (char_length(report) <= 8000),
  report_at      timestamptz,
  ticket_id      uuid references public.tickets(id) on delete set null,
  applied        boolean not null default false -- l'esito e' gia' stato applicato alla spia
);
create index if not exists spy_missions_character_idx on public.spy_missions (character_id, started_at desc);

alter table public.spy_settings enable row level security;
alter table public.spies        enable row level security;
alter table public.spy_missions enable row level security;

drop policy if exists "regole spie visibili" on public.spy_settings;
create policy "regole spie visibili" on public.spy_settings for select to authenticated using (true);
drop policy if exists "regole spie: staff" on public.spy_settings;
create policy "regole spie: staff" on public.spy_settings for update to authenticated
  using (public.has_permission('regole.gestire')) with check (public.has_permission('regole.gestire'));
grant select, update on public.spy_settings to authenticated;

drop policy if exists "le mie spie" on public.spies;
create policy "le mie spie" on public.spies for select to authenticated
  using (public.is_my_character(character_id) or public.can_master_mode());
grant select on public.spies to authenticated;

-- le missioni le legge direttamente solo lo staff: il giocatore passa da una
-- funzione che non rivela dado ed esito finche' la missione non e' finita
drop policy if exists "missioni: staff" on public.spy_missions;
create policy "missioni: staff" on public.spy_missions for select to authenticated using (public.can_master_mode());
grant select on public.spy_missions to authenticated;
grant select, insert, update, delete on public.spy_settings, public.spies, public.spy_missions to service_role;

-- sezione dei ticket per le missioni
insert into public.ticket_sections (name, sort_order, instructions)
select 'Spie', 90, 'Missioni delle spie: i ticket si aprono da soli quando un giocatore manda una spia. Il rapporto per il giocatore si scrive in Gestione → Spie.'
where not exists (select 1 from public.ticket_sections where name = 'Spie');

-- il tratto che da' la prima spia (se non c'e' gia')
insert into public.traits (name, kind, cost, effect, choice, modifiers, sort_order, active)
select 'Spie', 'vantaggio', 1, 'Il personaggio ha una spia al suo servizio fin dall''inizio (pannello Spie).', 'nessuna', '[]'::jsonb, 60, true
where not exists (select 1 from public.traits where lower(name) = 'spie');

-- ---------------------------------------------------------------------
-- Pagamento: conto personale oppure Oro della casata
-- ---------------------------------------------------------------------
create or replace function public.spy_pay(p_character uuid, p_amount int, p_pay text, p_reason text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_balance int;
  v_house uuid;
  v_gold uuid;
  v_rate int;
  v_units int;
  v_have bigint;
begin
  if p_amount <= 0 then return; end if;
  if p_pay = 'casata' then
    select c.house_id into v_house
      from public.characters c join public.house_roles r on r.id = c.house_role_id
     where c.id = p_character and r.can_build;
    if v_house is null then
      raise exception 'Per pagare con la casata serve un ruolo che ne gestisce le risorse.' using errcode = 'P0001';
    end if;
    select id into v_gold from public.resources where lower(name) = 'oro' limit 1;
    if v_gold is null then
      raise exception 'Tra le risorse non c''è l''Oro: paga con il conto personale.' using errcode = 'P0001';
    end if;
    select greatest(1, coins_per_r) into v_rate from public.item_settings;
    v_units := ceil(p_amount::numeric / coalesce(v_rate, 100))::int;
    select amount into v_have from public.house_resources where house_id = v_house and resource_id = v_gold;
    if coalesce(v_have, 0) < v_units then
      raise exception 'La casata non ha abbastanza Oro (servono % unità).', v_units using errcode = 'P0001';
    end if;
    perform public.economy_add(v_house, v_gold, -v_units, p_reason);
  else
    update public.characters set coins = coins - p_amount where id = p_character and coins >= p_amount
      returning coins into v_balance;
    if not found then
      raise exception 'Sul conto non ci sono abbastanza monete (servono %).', p_amount using errcode = 'P0001';
    end if;
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (p_character, -p_amount, 'acquisto', p_reason, v_balance);
  end if;
end;
$$;
revoke execute on function public.spy_pay(uuid, int, text, text) from public, anon, authenticated;

-- Probabilita' di fallire (in percentuale) per livello e profondita'
create or replace function public.spy_fail_chance(p_level int, p_depth text)
returns int
language sql stable
security definer set search_path = ''
as $$
  select greatest(s.min_fail,
           (case p_depth when 'superficiale' then s.fail_light when 'normale' then s.fail_normal else s.fail_deep end)
           - s.level_bonus * greatest(0, p_level - 1))
    from public.spy_settings s;
$$;
grant execute on function public.spy_fail_chance(int, text) to authenticated;

-- Minuti di viaggio (staffetta) dal luogo del personaggio alla destinazione; null = irraggiungibile
create or replace function public.spy_travel_minutes(p_character uuid, p_location uuid)
returns int
language plpgsql stable
security definer set search_path = ''
as $$
declare
  v_from uuid := public.character_location(p_character);
  v_base int;
  v_factor numeric;
begin
  if v_from is null or p_location is null then return null; end if;
  if v_from = p_location then return 0; end if;
  v_base := public.travel_base_minutes(v_from, p_location, 'staffetta');
  if v_base is null then return null; end if;
  select pace_fast_factor into v_factor from public.missive_settings;
  return greatest(1, round(v_base * coalesce(v_factor, 1))::int);
end;
$$;

-- Anteprima per il giocatore: tempo totale e rischio
create or replace function public.spy_preview(p_spy uuid, p_location uuid, p_depth text)
returns table (travel_minutes int, research_hours int, fail_chance int)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  sp public.spies;
  s public.spy_settings;
begin
  select * into sp from public.spies where id = p_spy;
  if not found or not public.is_my_character(sp.character_id) then return; end if;
  select * into s from public.spy_settings;
  return query select public.spy_travel_minutes(sp.character_id, p_location),
    (case p_depth when 'superficiale' then s.hours_light when 'normale' then s.hours_normal else s.hours_deep end),
    public.spy_fail_chance(sp.level, p_depth);
end;
$$;
revoke execute on function public.spy_preview(uuid, uuid, text) from public, anon;
grant execute on function public.spy_preview(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Il giocatore: prima spia, reclutare, addestrare
-- ---------------------------------------------------------------------
create or replace function public.spy_init(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trait text;
begin
  if not public.is_my_character(p_character) then return; end if;
  if (select spies_started from public.characters where id = p_character) then return; end if;
  select trait_name into v_trait from public.spy_settings;
  if exists (select 1 from public.character_traits ct join public.traits t on t.id = ct.trait_id
              where ct.character_id = p_character and lower(t.name) = lower(v_trait)) then
    insert into public.spies (character_id, name) values (p_character, 'La prima spia');
  end if;
  update public.characters set spies_started = true where id = p_character;
end;
$$;
revoke execute on function public.spy_init(uuid) from public, anon;
grant execute on function public.spy_init(uuid) to authenticated;

create or replace function public.spy_recruit(p_character uuid, p_name text, p_pay text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  s public.spy_settings;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Dai un nome alla spia (massimo 40 lettere).' using errcode = 'P0001';
  end if;
  select * into s from public.spy_settings;
  if (select count(*) from public.spies where character_id = p_character and status <> 'morta') >= s.max_spies then
    raise exception 'Puoi avere al massimo % spie.', s.max_spies using errcode = 'P0001';
  end if;
  perform public.spy_pay(p_character, s.recruit_cost, p_pay, 'Spie: reclutata ' || v_name);
  insert into public.spies (character_id, name) values (p_character, v_name) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.spy_recruit(uuid, text, text) from public, anon;
grant execute on function public.spy_recruit(uuid, text, text) to authenticated;

create or replace function public.spy_train(p_spy uuid, p_pay text)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  sp public.spies;
  s public.spy_settings;
begin
  select * into sp from public.spies where id = p_spy for update;
  if not found or not exists (select 1 from public.characters where id = sp.character_id and owner_id = auth.uid()) then
    raise exception 'Spia non valida.' using errcode = '42501';
  end if;
  if sp.status <> 'libera' then
    raise exception 'Si addestra solo una spia che non è in missione.' using errcode = 'P0001';
  end if;
  select * into s from public.spy_settings;
  if sp.level >= s.max_level then
    raise exception 'La spia è già al livello massimo.' using errcode = 'P0001';
  end if;
  perform public.spy_pay(sp.character_id, s.train_cost * (sp.level + 1), p_pay, 'Spie: ' || sp.name || ' al livello ' || (sp.level + 1));
  update public.spies set level = level + 1 where id = p_spy;
  return sp.level + 1;
end;
$$;
revoke execute on function public.spy_train(uuid, text) from public, anon;
grant execute on function public.spy_train(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Missione: tempo, dado, ticket per lo staff
-- ---------------------------------------------------------------------
create or replace function public.spy_send(p_spy uuid, p_location uuid, p_target text, p_depth text, p_request text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  sp public.spies;
  s public.spy_settings;
  v_owner text;
  v_place text;
  v_travel int;
  v_hours int;
  v_fail int;
  v_roll int;
  v_outcome text;
  v_ends timestamptz;
  v_section uuid;
  v_ticket uuid;
  v_mission uuid;
  v_target text := btrim(coalesce(p_target, ''));
  v_request text := btrim(coalesce(p_request, ''));
begin
  select * into sp from public.spies where id = p_spy for update;
  if not found or not exists (select 1 from public.characters where id = sp.character_id and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Spia non valida.' using errcode = '42501';
  end if;
  if sp.status <> 'libera' then
    raise exception 'Questa spia non è disponibile.' using errcode = 'P0001';
  end if;
  if p_depth not in ('superficiale', 'normale', 'approfondita') then
    raise exception 'Scegli il tipo di ricerca.' using errcode = 'P0001';
  end if;
  if char_length(v_target) not between 1 and 200 then
    raise exception 'Indica il bersaglio della missione.' using errcode = 'P0001';
  end if;
  if char_length(v_request) not between 1 and 4000 then
    raise exception 'Scrivi che cosa deve scoprire la spia.' using errcode = 'P0001';
  end if;
  select name into v_place from public.locations where id = p_location and kind = 'luogo' and in_game;
  if v_place is null then
    raise exception 'Scegli il luogo in cui mandare la spia.' using errcode = 'P0001';
  end if;
  v_travel := public.spy_travel_minutes(sp.character_id, p_location);
  if v_travel is null then
    raise exception 'Da dove ti trovi non c''è una strada per quel luogo.' using errcode = 'P0001';
  end if;

  select * into s from public.spy_settings;
  v_hours := case p_depth when 'superficiale' then s.hours_light when 'normale' then s.hours_normal else s.hours_deep end;
  v_fail := public.spy_fail_chance(sp.level, p_depth);
  v_roll := 1 + floor(random() * 100)::int;
  -- fallisce se il dado e' entro la probabilita' di fallire; tra i fallimenti, uccisa o catturata
  v_outcome := case
    when v_roll > v_fail then 'riuscita'
    when random() * 100 < s.killed_pct then 'uccisa'
    else 'catturata' end;
  v_ends := now() + make_interval(mins => v_travel, hours => v_hours);
  select name into v_owner from public.characters where id = sp.character_id;

  select id into v_section from public.ticket_sections where name = 'Spie';
  insert into public.tickets (title, section_id, opener_character, opener_name, last_author_name)
    values (left('Spia di ' || v_owner || ': ' || v_target, 120), v_section, sp.character_id, v_owner, v_owner)
    returning id into v_ticket;
  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
    values (v_ticket, auth.uid(), v_owner, false,
      '<p><strong>Missione di una spia</strong> (il giocatore non vede questo ticket)</p>' ||
      '<p>Spia: ' || sp.name || ' (livello ' || sp.level || ')<br>' ||
      'Luogo: ' || v_place || '<br>' ||
      'Bersaglio: ' || replace(replace(v_target, '&', '&amp;'), '<', '&lt;') || '<br>' ||
      'Ricerca: ' || p_depth || '<br>' ||
      'Rientro: ' || to_char(v_ends at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI') || '</p>' ||
      '<p><strong>Richiesta del giocatore</strong><br>' ||
      replace(replace(replace(v_request, '&', '&amp;'), '<', '&lt;'), E'\n', '<br>') || '</p>' ||
      '<p><strong>Dado</strong>: ' || v_roll || ' su 100 (fallisce fino a ' || v_fail || ') → <strong>' ||
      case v_outcome when 'riuscita' then 'missione riuscita' when 'uccisa' then 'fallita: spia uccisa' else 'fallita: spia catturata' end ||
      '</strong></p>' ||
      case when v_outcome = 'riuscita' then '<p>Scrivi il rapporto per il giocatore in Gestione → Spie: lo leggerà al rientro della spia.</p>' else '' end);

  insert into public.spy_missions (spy_id, character_id, spy_name, spy_level, target, location_id, place_name, depth, request,
                                   ends_at, travel_minutes, research_hours, fail_chance, roll, outcome, ticket_id)
    values (p_spy, sp.character_id, sp.name, sp.level, v_target, p_location, v_place, p_depth, v_request,
            v_ends, v_travel, v_hours, v_fail, v_roll, v_outcome, v_ticket)
    returning id into v_mission;
  update public.spies set status = 'missione' where id = p_spy;
  return v_mission;
end;
$$;
revoke execute on function public.spy_send(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.spy_send(uuid, uuid, text, text, text) to authenticated;

-- Le mie missioni: dado, esito e rapporto compaiono solo a missione finita.
-- Alla prima lettura dopo la fine, l'esito si applica alla spia.
create or replace function public.spy_my_missions(p_character uuid)
returns table (id uuid, spy_id uuid, spy_name text, spy_level int, target text, place_name text, depth text, request text,
               started_at timestamptz, ends_at timestamptz, finished boolean, fail_chance int, roll int, outcome text, report text)
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_my_character(p_character) then return; end if;
  update public.spies sp
     set status = case m.outcome when 'riuscita' then 'libera' when 'uccisa' then 'morta' else 'catturata' end
    from public.spy_missions m
   where m.spy_id = sp.id and m.character_id = p_character and not m.applied and m.ends_at <= now() and sp.status = 'missione';
  update public.spy_missions m set applied = true where m.character_id = p_character and not m.applied and m.ends_at <= now();
  return query
    select m.id, m.spy_id, m.spy_name, m.spy_level, m.target, m.place_name, m.depth, m.request, m.started_at, m.ends_at,
           m.ends_at <= now(),
           m.fail_chance,
           case when m.ends_at <= now() then m.roll end,
           case when m.ends_at <= now() then m.outcome end,
           case when m.ends_at <= now() and m.outcome = 'riuscita' then m.report else '' end
      from public.spy_missions m
     where m.character_id = p_character
     order by m.started_at desc
     limit 100;
end;
$$;
revoke execute on function public.spy_my_missions(uuid) from public, anon;
grant execute on function public.spy_my_missions(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Lo staff: rapporto della missione, sorte delle spie catturate
-- ---------------------------------------------------------------------
create or replace function public.spy_report(p_mission uuid, p_report text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_character uuid;
begin
  if not public.can_master_mode() then
    raise exception 'Solo master, moderatori e admin scrivono i rapporti.' using errcode = '42501';
  end if;
  update public.spy_missions set report = left(coalesce(p_report, ''), 8000), report_at = now()
   where id = p_mission returning character_id into v_character;
  if not found then raise exception 'Missione non trovata.' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.spy_report(uuid, text) from public, anon;
grant execute on function public.spy_report(uuid, text) to authenticated;

-- una spia catturata puo' essere liberata (torna disponibile) oppure morire
create or replace function public.spy_set_status(p_spy uuid, p_status text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.can_master_mode() then
    raise exception 'Solo master, moderatori e admin possono farlo.' using errcode = '42501';
  end if;
  if p_status not in ('libera', 'catturata', 'morta') then
    raise exception 'Stato non valido.' using errcode = 'P0001';
  end if;
  update public.spies set status = p_status where id = p_spy and status <> 'missione';
  if not found then raise exception 'Spia non trovata o ancora in missione.' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.spy_set_status(uuid, text) from public, anon;
grant execute on function public.spy_set_status(uuid, text) to authenticated;
