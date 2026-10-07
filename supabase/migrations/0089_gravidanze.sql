-- =====================================================================
-- 0089 - Sistema gravidanze (solo PG femminili)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - "Tenta la gravidanza": D100, 01-50 riuscita (un tentativo al giorno).
-- - Se riuscita: D100, 01-70 singola, 71-100 gemellare.
-- - Durata: 4 mesi ON, ogni mese ON = 1 mese reale.
-- - Ogni giorno: 50% di avere un sintomo, scelto tra quelli del mese ON;
--   arriva un messaggio di SISTEMA alla PG (al primo accesso del giorno).
-- - Alla fine dei 4 mesi: D100, 01-50 parto facile, 51-100 parto difficile.
-- - Tutti vedono nella scheda Gravidanza Si'/No, la fase e i sintomi.
-- - L'admin puo' interrompere una gravidanza (Scheda -> Gestisci).
-- =====================================================================

-- Sintomi possibili per ogni mese ON
create table if not exists public.pregnancy_symptoms (
  id    bigint generated always as identity primary key,
  month int not null check (month between 1 and 4),
  label text not null,
  sort_order int not null default 0
);
alter table public.pregnancy_symptoms enable row level security;
drop policy if exists "sintomi visibili" on public.pregnancy_symptoms;
create policy "sintomi visibili" on public.pregnancy_symptoms for select to authenticated using (true);
grant select on public.pregnancy_symptoms to authenticated;
grant all on public.pregnancy_symptoms to service_role;

delete from public.pregnancy_symptoms;
insert into public.pregnancy_symptoms (month, label, sort_order)
select m, l, o from (values
  (1, 'nausea, soprattutto mattutina', 1), (1, 'vomito', 2), (1, 'stanchezza e sonnolenza', 3),
  (1, 'assenza del ciclo', 4), (1, 'maggiore sensibilità agli odori', 5), (1, 'cambiamenti dell''appetito', 6),
  (1, 'capogiri', 7), (1, 'lieve malessere generale', 8), (1, 'sensibilità o dolore al seno', 9),
  (2, 'nausea più frequente', 1), (2, 'vomito', 2), (2, 'forte stanchezza', 3), (2, 'sonnolenza', 4),
  (2, 'maggiore sensibilità agli odori', 5), (2, 'cambiamenti dell''appetito', 6),
  (2, 'voglie o avversioni verso determinati alimenti', 7), (2, 'sbalzi d''umore', 8),
  (2, 'mal di testa', 9), (2, 'maggiore necessità di urinare', 10),
  (3, 'nausea e vomito', 1), (3, 'stanchezza', 2), (3, 'mal di testa', 3), (3, 'capogiri', 4),
  (3, 'cambiamenti dell''appetito', 5), (3, 'sensibilità al seno', 6), (3, 'maggiore necessità di urinare', 7),
  (3, 'sbalzi d''umore', 8), (3, 'lieve dolore o tensione addominale', 9),
  (4, 'stanchezza', 1), (4, 'mal di schiena', 2), (4, 'maggiore necessità di urinare', 3),
  (4, 'aumento dell''appetito', 4), (4, 'cambiamenti dell''umore', 5), (4, 'crampi o tensione addominale', 6),
  (4, 'sensazione di pesantezza', 7), (4, 'difficoltà a dormire', 8),
  (4, 'eventuali primi movimenti percepibili, soprattutto nelle gravidanze successive', 9)
) as v(m, l, o);

-- Tentativi (anche quelli non riusciti): uno al giorno
create table if not exists public.pregnancy_attempts (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  roll         int not null check (roll between 1 and 100),
  success      boolean not null,
  created_at   timestamptz not null default now()
);
create index if not exists pregnancy_attempts_char on public.pregnancy_attempts (character_id, created_at desc);

-- Gravidanze
create table if not exists public.pregnancies (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  started_at   timestamptz not null default now(),
  attempt_roll int not null,
  twins_roll   int not null check (twins_roll between 1 and 100),
  twins        boolean not null,
  status       text not null default 'in_corso' check (status in ('in_corso', 'conclusa', 'interrotta')),
  birth_roll   int check (birth_roll between 1 and 100),
  birth_easy   boolean,
  ended_at     timestamptz
);
create unique index if not exists pregnancies_one_active on public.pregnancies (character_id) where status = 'in_corso';

-- Controllo giornaliero dei sintomi
create table if not exists public.pregnancy_days (
  pregnancy_id uuid not null references public.pregnancies (id) on delete cascade,
  day          date not null,
  month        int not null check (month between 1 and 4),
  roll         int not null check (roll between 1 and 100),
  symptom      text,
  primary key (pregnancy_id, day)
);

alter table public.pregnancy_attempts enable row level security;
alter table public.pregnancies enable row level security;
alter table public.pregnancy_days enable row level security;
drop policy if exists "tentativi visibili" on public.pregnancy_attempts;
create policy "tentativi visibili" on public.pregnancy_attempts for select to authenticated using (true);
drop policy if exists "gravidanze visibili" on public.pregnancies;
create policy "gravidanze visibili" on public.pregnancies for select to authenticated using (true);
drop policy if exists "giorni visibili" on public.pregnancy_days;
create policy "giorni visibili" on public.pregnancy_days for select to authenticated using (true);
grant select on public.pregnancy_attempts, public.pregnancies, public.pregnancy_days to authenticated;
grant all on public.pregnancy_attempts, public.pregnancies, public.pregnancy_days to service_role;

-- Mese ON (1-4) di una gravidanza: ogni mese ON dura un mese reale
create or replace function public.pregnancy_month(p_started timestamptz)
returns int
language sql stable
set search_path = ''
as $$
  select least(4, greatest(1,
    (extract(year from age(now(), p_started)) * 12 + extract(month from age(now(), p_started)))::int + 1));
$$;

-- ---------------------------------------------------------------------
-- Tenta la gravidanza
-- ---------------------------------------------------------------------
create or replace function public.pregnancy_attempt(p_character uuid)
returns table (roll int, success boolean, twins_roll int, twins boolean)
language plpgsql
security definer set search_path = ''
as $$
declare
  c public.characters;
  v_roll int := floor(random() * 100)::int + 1;
  v_twins_roll int;
  v_today date := (now() at time zone 'Europe/Rome')::date;
begin
  perform public.assert_own_character(p_character);
  select * into c from public.characters where id = p_character;
  if c.status <> 'attivo' then raise exception 'Il personaggio non è ancora attivo.' using errcode = 'P0001'; end if;
  if c.sex is distinct from 'donna' then raise exception 'Solo le PG femminili possono tentare una gravidanza.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.pregnancies where character_id = p_character and status = 'in_corso') then
    raise exception 'Sei già in gravidanza.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pregnancy_attempts a where a.character_id = p_character
             and (a.created_at at time zone 'Europe/Rome')::date = v_today) then
    raise exception 'Hai già tentato oggi: potrai riprovare domani.' using errcode = 'P0001';
  end if;

  insert into public.pregnancy_attempts (character_id, roll, success) values (p_character, v_roll, v_roll <= 50);

  if v_roll > 50 then
    return query select v_roll, false, null::int, null::boolean;
    return;
  end if;

  v_twins_roll := floor(random() * 100)::int + 1;
  insert into public.pregnancies (character_id, attempt_roll, twins_roll, twins)
    values (p_character, v_roll, v_twins_roll, v_twins_roll > 70);
  perform public.send_system_message(p_character,
    'Gravidanza riuscita (D100: ' || v_roll || '). ' ||
    case when v_twins_roll > 70 then 'Gravidanza gemellare' else 'Gravidanza singola' end ||
    ' (D100: ' || v_twins_roll || '). Ogni giorno riceverai qui i sintomi della giornata; ' ||
    'il parto arriverà alla fine del 4° mese ON (un mese ON dura un mese reale).');
  return query select v_roll, true, v_twins_roll, v_twins_roll > 70;
end;
$$;
revoke execute on function public.pregnancy_attempt(uuid) from public, anon;
grant execute on function public.pregnancy_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Controllo giornaliero (lo chiama il gioco al primo accesso del giorno):
-- sintomo del giorno e, finiti i 4 mesi ON, il parto
-- ---------------------------------------------------------------------
create or replace function public.pregnancy_tick(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  p public.pregnancies;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_month int;
  v_roll int;
  v_symptom text;
begin
  perform public.assert_own_character(p_character);
  select * into p from public.pregnancies where character_id = p_character and status = 'in_corso' for update;
  if p.id is null then return; end if;

  -- Parto: finiti i 4 mesi ON
  if now() >= p.started_at + interval '4 months' then
    v_roll := floor(random() * 100)::int + 1;
    update public.pregnancies
      set status = 'conclusa', birth_roll = v_roll, birth_easy = v_roll <= 50, ended_at = now()
      where id = p.id;
    perform public.send_system_message(p_character,
      'È arrivato il momento del parto' || case when p.twins then ' (gemellare)' else '' end ||
      '. D100: ' || v_roll || ' — Esito: ' ||
      case when v_roll <= 50 then 'parto facile.' else 'parto difficile.' end);
    return;
  end if;

  if exists (select 1 from public.pregnancy_days where pregnancy_id = p.id and day = v_today) then return; end if;

  v_month := public.pregnancy_month(p.started_at);
  v_roll := floor(random() * 100)::int + 1;
  if v_roll <= 50 then
    select label into v_symptom from public.pregnancy_symptoms where month = v_month order by random() limit 1;
  end if;
  insert into public.pregnancy_days (pregnancy_id, day, month, roll, symptom)
    values (p.id, v_today, v_month, v_roll, v_symptom)
    on conflict do nothing;

  perform public.send_system_message(p_character,
    'Gravidanza' || case when p.twins then ' gemellare' else '' end || ' — ' || v_month || '° mese ON. ' ||
    case when v_symptom is null
      then 'Controllo giornaliero: nessun sintomo. Oggi non manifesti particolari malesseri.'
      else 'Controllo giornaliero: sintomo presente. Sintomo di oggi: ' || v_symptom || '.' end);
end;
$$;
revoke execute on function public.pregnancy_tick(uuid) from public, anon;
grant execute on function public.pregnancy_tick(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- L'admin interrompe una gravidanza in corso
-- ---------------------------------------------------------------------
create or replace function public.pregnancy_admin_end(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono interrompere una gravidanza.' using errcode = '42501'; end if;
  update public.pregnancies set status = 'interrotta', ended_at = now()
    where character_id = p_character and status = 'in_corso';
end;
$$;
revoke execute on function public.pregnancy_admin_end(uuid) from public, anon;
grant execute on function public.pregnancy_admin_end(uuid) to authenticated;
