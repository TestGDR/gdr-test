-- =====================================================================
-- 0011 - Ruoli di casata disponibili all'iscrizione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un ruolo puo' essere scelto in fase di creazione del PG solo se e'
-- "disponibile all'iscrizione", il sesso e l'eta' del PG rientrano nei
-- requisiti e ci sono ancora posti liberi.
-- =====================================================================

alter table public.house_roles
  add column signup_available boolean not null default false,
  add column max_members  int  check (max_members between 1 and 1000),
  add column required_sex text check (required_sex in ('uomo', 'donna')), -- null = qualsiasi
  add column min_age      int  check (min_age between 0 and 200),
  add column max_age      int  check (max_age between 0 and 200),
  add constraint house_roles_age_range
    check (min_age is null or max_age is null or min_age <= max_age),
  -- un ruolo aperto all'iscrizione deve avere un numero massimo di posti
  add constraint house_roles_signup_limit
    check (not signup_available or max_members is not null);

-- Casate e ruoli che un PG con questo sesso ed eta' puo' scegliere.
-- I posti contano tutti i PG con quel ruolo, anche quelli non ancora attivi.
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
  select h.id, h.name, h.sigil_url, r.id, r.name, r.daily_salary,
         r.max_members - occupied.n
  from public.house_roles r
  join public.houses h on h.id = r.house_id
  cross join lateral (
    select count(*)::int as n from public.characters c where c.house_role_id = r.id
  ) occupied
  where r.signup_available
    and (r.required_sex is null or r.required_sex = p_sex)
    and (r.min_age is null or p_age >= r.min_age)
    and (r.max_age is null or p_age <= r.max_age)
    and occupied.n < r.max_members
  order by h.sort_order, h.name, r.sort_order, r.name;
$$;

revoke execute on function public.signup_house_roles(text, int) from public, anon;
grant execute on function public.signup_house_roles(text, int) to authenticated;
