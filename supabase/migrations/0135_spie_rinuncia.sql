-- =====================================================================
-- 0135 - Spie: il giocatore puo' rinunciare a una spia catturata
-- Eseguire in Supabase DOPO la 0134: SQL Editor -> New query -> incolla -> Run
--
-- Una spia catturata occupava il suo posto finche' lo staff non decideva.
-- Ora il proprietario puo' "abbandonarla al suo destino": la perde per
-- sempre e il posto si libera, cosi' puo' reclutarne un'altra.
-- =====================================================================

alter table public.spies drop constraint if exists spies_status_check;
alter table public.spies add constraint spies_status_check
  check (status in ('libera', 'missione', 'catturata', 'morta', 'abbandonata'));

create or replace function public.spy_abandon(p_spy uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  sp public.spies;
begin
  select * into sp from public.spies where id = p_spy for update;
  if not found or not exists (select 1 from public.characters where id = sp.character_id and owner_id = auth.uid()) then
    raise exception 'Spia non valida.' using errcode = '42501';
  end if;
  if sp.status <> 'catturata' then
    raise exception 'Si può rinunciare solo a una spia catturata.' using errcode = 'P0001';
  end if;
  update public.spies set status = 'abbandonata' where id = p_spy;
end;
$$;
revoke execute on function public.spy_abandon(uuid) from public, anon;
grant execute on function public.spy_abandon(uuid) to authenticated;

-- Reclutare: le spie morte e quelle abbandonate non occupano un posto
create or replace function public.spy_recruit(p_character uuid, p_name text, p_pay text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_limit int;
  v_cost int;
  v_id uuid;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Dai un nome alla spia (massimo 40 lettere).' using errcode = 'P0001';
  end if;
  v_limit := public.spy_limit(p_character);
  if (select count(*) from public.spies where character_id = p_character and status not in ('morta', 'abbandonata')) >= v_limit then
    raise exception 'Puoi avere al massimo % %.', v_limit, case when v_limit = 1 then 'spia' else 'spie' end using errcode = 'P0001';
  end if;
  select cost into v_cost from public.spy_levels where level = 1;
  if v_cost is null then
    raise exception 'Le regole delle spie non sono ancora pronte (manca il livello 1).' using errcode = 'P0001';
  end if;
  perform public.spy_pay(p_character, v_cost, p_pay, 'Spie: reclutata ' || v_name);
  insert into public.spies (character_id, name) values (p_character, v_name) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.spy_recruit(uuid, text, text) from public, anon;
grant execute on function public.spy_recruit(uuid, text, text) to authenticated;

-- Lo staff puo' far tornare anche una spia a cui il giocatore aveva rinunciato
create or replace function public.spy_set_status(p_spy uuid, p_status text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.can_master_mode() then
    raise exception 'Solo master, moderatori e admin possono farlo.' using errcode = '42501';
  end if;
  if p_status not in ('libera', 'catturata', 'morta', 'abbandonata') then
    raise exception 'Stato non valido.' using errcode = 'P0001';
  end if;
  update public.spies set status = p_status where id = p_spy and status <> 'missione';
  if not found then raise exception 'Spia non trovata o ancora in missione.' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.spy_set_status(uuid, text) from public, anon;
grant execute on function public.spy_set_status(uuid, text) to authenticated;
