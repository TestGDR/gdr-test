-- =====================================================================
-- 0179 - Ruoli di casata: nome al femminile
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un ruolo puo' avere un secondo nome per i PG donna (es. "Principe" /
-- "Principessa", "Re" / "Regina"), senza creare un ruolo nuovo.
-- Vuoto = lo stesso nome per tutti.
-- =====================================================================

alter table public.house_roles
  add column if not exists name_female text
    check (name_female is null or char_length(name_female) between 2 and 40);

-- Ruoli disponibili all'iscrizione: per una donna, il nome al femminile
create or replace function public.signup_house_roles(p_sex text, p_age int)
returns table (
  house_id     uuid,
  house_name   text,
  sigil_url    text,
  role_id      uuid,
  role_name    text,
  daily_salary int,
  free_slots   int
)
language sql
stable
security definer set search_path = ''
as $$
  select h.id, h.name, h.sigil_url, r.id,
         case when p_sex = 'donna' then coalesce(r.name_female, r.name) else r.name end,
         r.daily_salary,
         r.max_members - occupied.n
  from public.house_roles r
  join public.houses h on h.id = r.house_id
  cross join lateral (
    select (
      (select count(*) from public.characters c where c.house_role_id = r.id)
      + (select count(*) from public.house_npcs n where n.house_role_id = r.id)
    )::int as n
  ) occupied
  where r.signup_available
    and (r.required_sex is null or r.required_sex = p_sex)
    and (r.min_age is null or p_age >= r.min_age)
    and (r.max_age is null or p_age <= r.max_age)
    and occupied.n < r.max_members
  order by h.sort_order, h.name, r.sort_order, r.name;
$$;

-- Stipendio giornaliero: nel movimento della banca il ruolo al femminile per le donne
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
    select ch.id, ch.name, hr.daily_salary,
           case when ch.sex = 'donna' then coalesce(hr.name_female, hr.name) else hr.name end as role_name
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
