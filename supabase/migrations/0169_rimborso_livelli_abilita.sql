-- =====================================================================
-- 0169 - Livelli delle abilita' abbassati dallo staff: rimborso dei PX
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Quando lo staff (permesso "schede.abilita") abbassa un'abilita' dalla
-- pennina della scheda, i livelli tolti che il giocatore aveva comprato con
-- i PX tornano tra i PX da spendere (e non contano piu' tra gli spesi).
-- I livelli dell'iscrizione sono gratuiti: non restituiscono niente.
-- Al giocatore arriva un OFF da SISTEMA con i PX restituiti.
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

-- Ogni livello comprato ricorda abilita', livello e se e' gia' stato rimborsato
alter table public.px_log add column if not exists skill_id uuid references public.skills(id) on delete set null;
alter table public.px_log add column if not exists skill_level int;
alter table public.px_log add column if not exists refunded boolean not null default false;

-- i livelli comprati prima di questa migrazione: abilita' e livello dal testo ("Nome: livello N")
update public.px_log l
  set skill_id = s.id,
      skill_level = substring(l.reason from ': livello (\d+)$')::int
  from public.skills s
  where l.kind = 'abilita' and l.skill_id is null
    and l.reason = s.name || ': livello ' || substring(l.reason from ': livello (\d+)$');

-- Comprare un livello con i PX (come prima, ora con abilita' e livello nel registro)
create or replace function public.spend_px(p_character uuid, p_skill uuid)
returns table (level int, px int)
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_level int;
  v_px int;
  v_cost int;
  v_stat text;
  v_cap int;
  v_name text;
begin
  perform public.assert_own_character(p_character);
  select s.stat, s.name into v_stat, v_name from public.skills s where s.id = p_skill and s.active;
  if v_stat is null then raise exception 'Abilità non trovata.' using errcode = 'P0001'; end if;
  select c.px, least(10, coalesce((c.attributes ->> v_stat)::int, 1))
    into v_px, v_cap
    from public.characters c where c.id = p_character for update;
  select cs.level into v_level from public.character_skills cs where cs.character_id = p_character and cs.skill_id = p_skill;
  v_level := coalesce(v_level, 0);
  if v_level >= v_cap then
    raise exception 'L''abilità è già al massimo (%): non può superare il valore della sua statistica.', v_cap using errcode = 'P0001';
  end if;
  v_cost := 10 * (v_level + 1);
  if v_px < v_cost then raise exception 'Servono % PX, ne hai %.', v_cost, v_px using errcode = 'P0001'; end if;

  update public.characters c set px = c.px - v_cost where c.id = p_character;
  insert into public.character_skills (character_id, skill_id, level) values (p_character, p_skill, v_level + 1)
    on conflict (character_id, skill_id) do update set level = excluded.level;
  insert into public.px_log (character_id, amount, reason, kind, skill_id, skill_level)
    values (p_character, -v_cost, v_name || ': livello ' || (v_level + 1), 'abilita', p_skill, v_level + 1);
  return query select v_level + 1, v_px - v_cost;
end;
$$;
revoke execute on function public.spend_px(uuid, uuid) from public, anon;
grant execute on function public.spend_px(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Lo staff salva i livelli delle abilita' (p_levels: {"<id abilita'>": livello}).
-- Alzare non costa PX al giocatore; abbassare restituisce i livelli comprati.
-- Restituisce i PX rimborsati in tutto.
-- ---------------------------------------------------------------------
create or replace function public.staff_set_skill_levels(p_character uuid, p_levels jsonb)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  k text;
  v_new int;
  v_old int;
  v_name text;
  v_back int;
  v_total int := 0;
  v_lines text[] := '{}';
begin
  if not public.has_permission('schede.abilita') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  if not exists (select 1 from public.characters where id = p_character) then
    raise exception 'Personaggio non trovato.' using errcode = 'P0001';
  end if;

  for k in select jsonb_object_keys(coalesce(p_levels, '{}'::jsonb)) loop
    v_new := greatest(0, least(10, (p_levels ->> k)::int));
    select name into v_name from public.skills where id = k::uuid;
    if v_name is null then continue; end if;
    select level into v_old from public.character_skills where character_id = p_character and skill_id = k::uuid;
    v_old := coalesce(v_old, 0);

    if v_new < v_old then
      -- livelli tolti comprati con i PX e non ancora rimborsati
      select coalesce(sum(-amount), 0) into v_back from public.px_log
        where character_id = p_character and kind = 'abilita' and skill_id = k::uuid
          and skill_level > v_new and skill_level <= v_old and not refunded;
      update public.px_log set refunded = true
        where character_id = p_character and kind = 'abilita' and skill_id = k::uuid
          and skill_level > v_new and skill_level <= v_old and not refunded;
      if v_back > 0 then
        insert into public.px_log (character_id, amount, reason, kind, skill_id, skill_level)
          values (p_character, v_back, 'Rimborso: ' || v_name || ' da ' || v_old || ' a ' || v_new, 'rimborso', k::uuid, v_new);
        v_total := v_total + v_back;
        v_lines := v_lines || (v_name || ' da ' || v_old || ' a ' || v_new || ': ' || v_back || ' PX');
      end if;
    end if;

    if v_new = 0 then
      delete from public.character_skills where character_id = p_character and skill_id = k::uuid;
    elsif v_new <> v_old then
      insert into public.character_skills (character_id, skill_id, level) values (p_character, k::uuid, v_new)
        on conflict (character_id, skill_id) do update set level = excluded.level;
    end if;
  end loop;

  if v_total > 0 then
    update public.characters set px = px + v_total where id = p_character;
    insert into public.system_messages (character_id, body)
      values (p_character, 'Lo staff ha abbassato alcune tue abilità e ti ha restituito ' || v_total || ' PX ('
        || array_to_string(v_lines, '; ') || ').');
  end if;
  return v_total;
end;
$$;
revoke execute on function public.staff_set_skill_levels(uuid, jsonb) from public, anon;
grant execute on function public.staff_set_skill_levels(uuid, jsonb) to authenticated;
