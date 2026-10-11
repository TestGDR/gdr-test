-- =====================================================================
-- 0120 - Alleanze tra regni
-- Eseguire in Supabase DOPO la 0119: SQL Editor -> New query -> incolla -> Run
--
-- Un'alleanza e' un gruppo di regni (Gestione -> Eserciti -> Regni): la sua
-- potenza e' la somma dei regni che ne fanno parte. Un regno puo' stare in
-- piu' alleanze. Le alleanze le vedono tutti, le modifica chi ha il
-- permesso "eserciti.gestire".
-- =====================================================================

create table public.alliances (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  created_at  timestamptz not null default now()
);
create unique index alliances_name_key on public.alliances (lower(name));

create table public.alliance_kingdoms (
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  kingdom_id  uuid not null references public.kingdoms(id) on delete cascade,
  primary key (alliance_id, kingdom_id)
);
create index alliance_kingdoms_kingdom_idx on public.alliance_kingdoms(kingdom_id);

alter table public.alliances         enable row level security;
alter table public.alliance_kingdoms enable row level security;

do $$
declare t text;
begin
  foreach t in array array['alliances', 'alliance_kingdoms']
  loop
    execute format('create policy "visibili" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "eserciti con permesso" on public.%I for all to authenticated
                      using (public.has_permission(''eserciti.gestire'')) with check (public.has_permission(''eserciti.gestire''))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
