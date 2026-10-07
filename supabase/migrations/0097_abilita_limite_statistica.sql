-- =====================================================================
-- 0097 - Un'abilita' non supera mai il valore della sua statistica
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Spendendo PX un'abilita' sale al massimo fino al valore della statistica
-- collegata (es. PRE 5 -> Persuadere al massimo 5), e comunque fino a 10.
-- =====================================================================

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
begin
  perform public.assert_own_character(p_character);
  select s.stat into v_stat from public.skills s where s.id = p_skill and s.active;
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
  return query select v_level + 1, v_px - v_cost;
end;
$$;
revoke execute on function public.spend_px(uuid, uuid) from public, anon;
grant execute on function public.spend_px(uuid, uuid) to authenticated;
