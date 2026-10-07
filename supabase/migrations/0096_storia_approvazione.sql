-- =====================================================================
-- 0096 - Storia: bozza -> inviata in approvazione -> approvata
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - La proprietaria scrive la storia e la corregge finche' e' in bozza.
-- - Quando la manda in approvazione (o conferma la creazione del PG) non
--   la puo' piu' modificare.
-- - Chi ha il permesso "schede.approvare" (admin sempre) la approva oppure
--   la sblocca: sbloccata torna in bozza e la proprietaria la corregge.
-- - All'approvazione e allo sblocco arriva un messaggio di SISTEMA.
-- - Le storie gia' scritte finora risultano approvate (erano gia' bloccate).
-- =====================================================================

alter table public.character_backgrounds add column if not exists submitted_at timestamptz;
alter table public.character_backgrounds add column if not exists approved_at timestamptz;
alter table public.character_backgrounds add column if not exists approved_by uuid references auth.users (id) on delete set null;

update public.character_backgrounds
  set approved_at = coalesce(approved_at, now()), submitted_at = coalesce(submitted_at, approved_at, now())
  where submitted_at is null and trim(body) <> '';

-- Chi guarda la scheda puo' approvare?
create or replace function public.can_approve_story()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.has_permission('schede.approvare');
$$;
revoke execute on function public.can_approve_story() from public, anon;
grant execute on function public.can_approve_story() to authenticated;

-- La proprietaria salva la sua storia (solo finche' e' in bozza)
create or replace function public.save_my_story(p_character uuid, p_body text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
begin
  perform public.assert_own_character(p_character);
  if char_length(v_body) > 4000 then raise exception 'La storia supera i 4000 caratteri.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.character_backgrounds where character_id = p_character and submitted_at is not null) then
    raise exception 'La storia è già stata inviata in approvazione: per correggerla chiedi allo staff di sbloccarla.' using errcode = 'P0001';
  end if;
  insert into public.character_backgrounds (character_id, body) values (p_character, v_body)
    on conflict (character_id) do update set body = excluded.body;
end;
$$;
revoke execute on function public.save_my_story(uuid, text) from public, anon;
grant execute on function public.save_my_story(uuid, text) to authenticated;

-- La proprietaria la manda in approvazione: da qui non la modifica piu'
create or replace function public.submit_my_story(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.assert_own_character(p_character);
  if not exists (select 1 from public.character_backgrounds where character_id = p_character and trim(body) <> '') then
    raise exception 'La storia è vuota.' using errcode = 'P0001';
  end if;
  update public.character_backgrounds set submitted_at = now()
    where character_id = p_character and submitted_at is null;
end;
$$;
revoke execute on function public.submit_my_story(uuid) from public, anon;
grant execute on function public.submit_my_story(uuid) to authenticated;

-- Lo staff approva (p_on = true) o sblocca (p_on = false) la storia di un PG
drop function if exists public.approve_story(uuid, boolean);
create or replace function public.approve_story(p_character uuid, p_on boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('schede.approvare') then
    raise exception 'Non hai il permesso di approvare le storie.' using errcode = '42501';
  end if;
  if p_on and not exists (select 1 from public.character_backgrounds where character_id = p_character and trim(body) <> '') then
    raise exception 'La storia è vuota.' using errcode = 'P0001';
  end if;
  update public.character_backgrounds
    set approved_at = case when p_on then now() end,
        approved_by = case when p_on then auth.uid() end,
        submitted_at = case when p_on then coalesce(submitted_at, now()) end
    where character_id = p_character;
  perform public.send_system_message(p_character,
    case when p_on
      then 'La tua storia è stata approvata.'
      else 'La tua storia è stata sbloccata dallo staff: puoi correggerla dalla pagina Storia della scheda e poi rimandarla in approvazione.' end);
end;
$$;
revoke execute on function public.approve_story(uuid, boolean) from public, anon;
grant execute on function public.approve_story(uuid, boolean) to authenticated;
