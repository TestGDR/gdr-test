-- =====================================================================
-- 0153 - Iscrizioni aperte / chiuse
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - Gestione -> Iscrizioni (permesso "iscrizioni.gestire", l'admin lo ha
--   sempre): un interruttore apre e chiude le iscrizioni, con un breve
--   messaggio facoltativo (es. "Lavori in corso").
-- - Con le iscrizioni chiuse il pulsante "Registrati" della home e'
--   disattivato e il database rifiuta comunque ogni nuovo account, anche
--   se qualcuno prova a iscriversi senza passare dal sito.
-- =====================================================================

create table if not exists public.signup_settings (
  id boolean primary key default true check (id),
  open boolean not null default true,
  message text not null default '' check (char_length(message) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.signup_settings (id) values (true) on conflict (id) do nothing;

alter table public.signup_settings enable row level security;

-- La legge chiunque, anche chi non e' iscritto (serve alla home)
drop policy if exists "iscrizioni: lettura" on public.signup_settings;
create policy "iscrizioni: lettura" on public.signup_settings
  for select to anon, authenticated using (true);

drop policy if exists "iscrizioni: modifica" on public.signup_settings;
create policy "iscrizioni: modifica" on public.signup_settings
  for update to authenticated
  using (public.has_permission('iscrizioni.gestire'))
  with check (public.has_permission('iscrizioni.gestire'));

grant select on public.signup_settings to anon, authenticated;
grant update (open, message, updated_at) on public.signup_settings to authenticated;

-- Iscrizioni chiuse: il database non crea nuovi account
create or replace function public.block_signups_when_closed()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if not coalesce((select open from public.signup_settings where id), true) then
    raise exception 'Iscrizioni chiuse' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.block_signups_when_closed() from public, anon, authenticated;

drop trigger if exists block_signups_when_closed on auth.users;
create trigger block_signups_when_closed
  before insert on auth.users
  for each row execute function public.block_signups_when_closed();
