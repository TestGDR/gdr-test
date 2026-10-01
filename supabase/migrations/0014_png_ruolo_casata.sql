-- =====================================================================
-- 0014 - Ruolo di casata per i PNG
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Un PNG puo' ricoprire uno dei ruoli della propria casata (es. Lord,
-- Maestro). Un ruolo ricoperto da un PNG occupa un posto: conta per il
-- numero massimo di posti disponibili all'iscrizione.
-- =====================================================================

alter table public.house_npcs
  add column house_role_id uuid references public.house_roles(id) on delete set null;

-- Posti occupati = PG + PNG con quel ruolo
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
