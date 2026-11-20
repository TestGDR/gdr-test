-- =====================================================================
-- 0184 - Spie solo per chi ha il tratto delle spie
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Chi non ha il tratto indicato in Gestione -> Spie (oggi "Rete di spie")
-- non puo' reclutare spie ne' mandarle in missione: il suo limite e' 0 e il
-- pannello Spie non gli compare. Chi ha il tratto resta com'era.
-- =====================================================================

-- Il limite per chi non ha il tratto puo' essere 0 (prima minimo 1)
alter table public.spy_settings drop constraint if exists spy_settings_max_spies_check;
alter table public.spy_settings add constraint spy_settings_max_spies_check check (max_spies between 0 and 100);
update public.spy_settings set max_spies = 0;

-- Reclutare: con limite 0 un messaggio chiaro
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
  v_trait text;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid() and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  v_limit := public.spy_limit(p_character);
  if v_limit <= 0 then
    select trait_name into v_trait from public.spy_settings;
    raise exception 'Le spie sono riservate ai personaggi con il tratto "%".', v_trait using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Dai un nome alla spia (massimo 40 lettere).' using errcode = 'P0001';
  end if;
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

-- Missioni: solo chi ha il tratto (anche se aveva gia' delle spie da prima)
create or replace function public.spy_mission_needs_trait()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trait text;
begin
  if public.spy_limit(new.character_id) <= 0 then
    select trait_name into v_trait from public.spy_settings;
    raise exception 'Le spie sono riservate ai personaggi con il tratto "%".', v_trait using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists spy_missions_need_trait on public.spy_missions;
create trigger spy_missions_need_trait before insert on public.spy_missions
  for each row execute function public.spy_mission_needs_trait();
