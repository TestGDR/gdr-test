-- =====================================================================
-- 0003 - Registrazione dei consensi (disclaimer, termini, privacy, 18+)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

alter table public.profiles
  add column terms_version     text,
  add column terms_accepted_at timestamptz,
  add column adult_declared    boolean not null default false;

-- L'iscrizione salva anche quale versione dei documenti e' stata accettata.
-- La data la mette il database (non il client), cosi' fa fede.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name    text := nullif(trim(new.raw_user_meta_data ->> 'character_name'), '');
  v_version text := nullif(new.raw_user_meta_data ->> 'terms_version', '');
begin
  insert into public.profiles (id, username, terms_version, terms_accepted_at, adult_declared)
  values (
    new.id,
    v_name,
    v_version,
    case when v_version is not null then now() end,
    coalesce(new.raw_user_meta_data ->> 'adult_declared', '') = 'true'
  );
  if v_name is not null then
    insert into public.characters (owner_id, name) values (new.id, v_name);
  end if;
  return new;
end;
$$;
