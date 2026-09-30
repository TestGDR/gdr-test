-- =====================================================================
-- 0002 - Iscrizione con personaggio + registro accessi (IP / VPN)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- NOMI DEI PERSONAGGI: univoci senza distinguere maiuscole/minuscole
-- ("Aragorn" e "aragorn" non possono coesistere) e solo lettere,
-- spazi, apostrofi e trattini. NOT VALID = vale solo per i nuovi nomi.
-- ---------------------------------------------------------------------
create unique index characters_name_lower_key on public.characters (lower(name));

alter table public.characters
  add constraint characters_name_format
  check (name ~ '^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'' -]*[A-Za-zÀ-ÖØ-öø-ÿ]$')
  not valid;

-- Il nome visualizzato dell'account e' ora il nome del primo personaggio:
-- non serve piu' un username separato e univoco.
alter table public.profiles drop constraint if exists profiles_username_key;
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles alter column username drop not null;

-- ---------------------------------------------------------------------
-- ISCRIZIONE: all'atto della registrazione crea profilo + personaggio.
-- Se il nome e' gia' preso la registrazione intera viene annullata.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(new.raw_user_meta_data ->> 'character_name'), '');
begin
  insert into public.profiles (id, username) values (new.id, v_name);
  if v_name is not null then
    insert into public.characters (owner_id, name) values (new.id, v_name);
  end if;
  return new;
end;
$$;

-- Vero se l'utente corrente e' admin (i dati sugli IP li vedono solo gli admin)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- REGISTRO ACCESSI
--   iscrizione = nuova registrazione
--   login      = accesso con email e password
--   accesso    = utente gia' loggato che si ricollega da un IP diverso
-- Scritto SOLO dal server con la secret key: gli utenti non possono
-- inserire o modificare righe.
-- ---------------------------------------------------------------------
create table public.access_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete cascade,
  event       text not null check (event in ('iscrizione', 'login', 'accesso')),
  ip          inet not null,
  user_agent  text,
  country     text,
  is_vpn      boolean,          -- null = non verificato (es. IP locale o servizio non raggiungibile)
  vpn_type    text,             -- VPN / Proxy / TOR / Hosting
  provider    text,             -- es. "NordVPN", "Telecom Italia"
  risk        int,              -- punteggio di rischio 0-100 di proxycheck.io
  created_at  timestamptz not null default now()
);
create index access_logs_user_idx on public.access_logs(user_id, created_at desc);
create index access_logs_ip_idx on public.access_logs(ip);
create index access_logs_created_idx on public.access_logs(created_at desc);

-- Cache delle verifiche VPN per non interrogare il servizio a ogni accesso
create table public.ip_checks (
  ip          inet primary key,
  country     text,
  is_vpn      boolean not null,
  vpn_type    text,
  provider    text,
  risk        int,
  raw         jsonb,
  checked_at  timestamptz not null default now()
);

alter table public.access_logs enable row level security;
alter table public.ip_checks   enable row level security;

create policy "solo admin vedono gli accessi" on public.access_logs
  for select to authenticated using (public.is_admin());

grant select on public.access_logs to authenticated;
grant select on public.profiles to authenticated;

-- Il server (secret key) scrive nel registro e legge i personaggi
grant select, insert, update, delete on public.access_logs to service_role;
grant select, insert, update, delete on public.ip_checks   to service_role;
grant select on public.characters to service_role;
grant select on public.profiles   to service_role;
