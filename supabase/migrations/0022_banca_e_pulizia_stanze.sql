-- =====================================================================
-- 0022 - Banca (stipendio giornaliero) e pulizia delle stanze in affitto
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Banca: il primo accesso del giorno (ora italiana) accredita a ogni PG
-- attivo lo stipendio del suo ruolo nella casata. Ogni entrata e uscita
-- finisce nei movimenti del conto.
--
-- Stanze in affitto: scaduto l'affitto, dopo 30 minuti senza utilizzo
-- (nessun messaggio e nessun nuovo affitto) chat e invitati si cancellano.
-- Se la stanza la affitta un altro personaggio si cancellano subito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Movimenti del conto
-- ---------------------------------------------------------------------
alter table public.characters add column last_salary_on date;

create table public.bank_transactions (
  id             bigint generated always as identity primary key,
  character_id   uuid not null references public.characters(id) on delete cascade,
  amount         int  not null, -- positivo = entrata, negativo = uscita
  kind           text not null check (kind in ('stipendio', 'affitto', 'staff')),
  description    text not null default '',
  balance_after  int  not null,
  created_at     timestamptz not null default now()
);
create index bank_transactions_character_idx on public.bank_transactions(character_id, created_at desc);

alter table public.bank_transactions enable row level security;
create policy "movimenti del proprio conto" on public.bank_transactions for select to authenticated
  using (
    exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    or public.has_permission('utenti.gestire')
  );
-- Si scrivono solo dalle funzioni qui sotto
grant select on public.bank_transactions to authenticated;

-- ---------------------------------------------------------------------
-- Ritiro automatico dello stipendio (una volta al giorno per personaggio)
-- ---------------------------------------------------------------------
create or replace function public.collect_daily_salary()
returns table (pg_name text, collected int)
language plpgsql
security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Rome')::date;
  pg record;
  balance int;
begin
  for pg in
    select ch.id, ch.name, hr.daily_salary, hr.name as role_name
    from public.characters ch
    join public.house_roles hr on hr.id = ch.house_role_id
    where ch.owner_id = auth.uid()
      and ch.status = 'attivo'
      and hr.daily_salary > 0
      and (ch.last_salary_on is null or ch.last_salary_on < today)
    for update of ch -- due accessi contemporanei non pagano due volte
  loop
    update public.characters
    set coins = coins + pg.daily_salary, last_salary_on = today
    where id = pg.id
    returning coins into balance;

    insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
    values (pg.id, pg.daily_salary, 'stipendio', 'Stipendio giornaliero · ' || pg.role_name, balance);

    pg_name := pg.name;
    collected := pg.daily_salary;
    return next;
  end loop;
end;
$$;

revoke execute on function public.collect_daily_salary() from public, anon;
grant execute on function public.collect_daily_salary() to authenticated;

-- ---------------------------------------------------------------------
-- Pulizia delle stanze in affitto inutilizzate da 30 minuti
-- (p_room vuoto = tutte le stanze)
-- ---------------------------------------------------------------------
create or replace function public.purge_idle_rented_rooms(p_room uuid default null)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  rid uuid;
  n int := 0;
begin
  for rid in
    select ro.id from public.rooms ro
    where ro.access = 'affitto'
      and (p_room is null or ro.id = p_room)
      and (public.active_rental(ro.id)).id is null
      and (exists (select 1 from public.messages m where m.room_id = ro.id)
           or exists (select 1 from public.room_guests g where g.room_id = ro.id))
      and greatest(
            coalesce((select max(rr.ends_at) from public.room_rentals rr where rr.room_id = ro.id), '-infinity'),
            coalesce((select max(m.created_at) from public.messages m where m.room_id = ro.id), '-infinity')
          ) < now() - interval '30 minutes'
  loop
    delete from public.messages where room_id = rid;
    delete from public.room_guests where room_id = rid;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.purge_idle_rented_rooms(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Affitto: prima pulisce la stanza se inutilizzata, poi registra l'uscita
-- ---------------------------------------------------------------------
create or replace function public.rent_room(p_room uuid, p_character uuid, p_hours int)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  ro public.rooms;
  last_rental public.room_rentals;
  total int;
  balance int;
  new_end timestamptz;
begin
  if not exists (
    select 1 from public.characters
    where id = p_character and owner_id = auth.uid() and status = 'attivo'
  ) then
    raise exception 'Serve un personaggio attivo per affittare una stanza.' using errcode = '42501';
  end if;

  -- Blocca la stanza: due affitti contemporanei non possono passare entrambi
  select * into ro from public.rooms where id = p_room for update;
  if not found or ro.access <> 'affitto' or not public.room_on_active_map(p_room) then
    raise exception 'Questa stanza non si può affittare.' using errcode = 'P0001';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > ro.max_hours then
    raise exception 'Puoi affittarla da 1 a % ore.', ro.max_hours using errcode = 'P0001';
  end if;

  select * into last_rental from public.room_rentals
  where room_id = p_room order by ends_at desc limit 1;

  if last_rental.id is not null and last_rental.ends_at > now() and last_rental.character_id <> p_character then
    raise exception 'La stanza è già occupata.' using errcode = 'P0001';
  end if;

  total := ro.price_per_hour * p_hours;
  update public.characters set coins = coins - total
  where id = p_character and coins >= total
  returning coins into balance;
  if not found then
    raise exception 'Non hai abbastanza monete (servono %).', total using errcode = 'P0001';
  end if;

  if last_rental.id is not null and last_rental.character_id <> p_character then
    -- Nuovo inquilino: la stanza riparte pulita, subito
    delete from public.messages where room_id = p_room;
    delete from public.room_guests where room_id = p_room;
  else
    -- Stesso inquilino: la chat resta solo se non e' rimasta inutilizzata 30 minuti
    perform public.purge_idle_rented_rooms(p_room);
  end if;

  if last_rental.id is not null and last_rental.character_id = p_character and last_rental.ends_at > now() then
    new_end := last_rental.ends_at + make_interval(hours => p_hours);
  else
    new_end := now() + make_interval(hours => p_hours);
  end if;

  insert into public.room_rentals (room_id, character_id, starts_at, ends_at, cost)
  values (p_room, p_character, now(), new_end, total);

  insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
  values (p_character, -total, 'affitto',
          'Affitto · ' || ro.name || ' (' || p_hours || (case when p_hours = 1 then ' ora)' else ' ore)' end),
          balance);
  return new_end;
end;
$$;

-- ---------------------------------------------------------------------
-- Pulizia automatica ogni 5 minuti (estensione pg_cron di Supabase)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('pulizia-stanze-affitto', '*/5 * * * *', 'select public.purge_idle_rented_rooms()');
