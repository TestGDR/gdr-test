-- =====================================================================
-- 0167 - Assegna PX e storico dei PX
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Gestione -> Assegna PX: chi ha il permesso "px.assegnare" (admin sempre)
--   aggiunge PX a uno o piu' PG, con un motivo; al PG arriva un OFF da SISTEMA.
-- - Storico: ogni PX guadagnato o speso finisce nel registro (px_log):
--   assegnati dallo staff, azioni in chat (una riga al giorno), livelli delle
--   abilita', draghi, modifiche dell'admin.
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

-- tipo di movimento: assegnati, chat, abilita, drago, modifica
alter table public.px_log add column if not exists kind text;

-- il registro lo leggono il proprietario e chi gestisce draghi o PX
drop policy if exists "px visibili al proprietario e allo staff" on public.px_log;
create policy "px visibili al proprietario e allo staff" on public.px_log for select to authenticated
  using (
    exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    or public.has_permission('draghi.gestire')
    or public.has_permission('px.assegnare')
  );

-- ---------------------------------------------------------------------
-- Assegna PX (solo in aggiunta): registro + OFF da SISTEMA
-- ---------------------------------------------------------------------
create or replace function public.staff_grant_px(p_character uuid, p_amount int, p_reason text)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  balance int;
  v_reason text := left(trim(coalesce(p_reason, '')), 200);
begin
  if not public.has_permission('px.assegnare') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000 then
    raise exception 'I PX da assegnare vanno da 1 a 1000.' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'Scrivi il motivo.' using errcode = 'P0001';
  end if;
  update public.characters set px = px + p_amount
    where id = p_character and status = 'attivo' and not is_npc
    returning px into balance;
  if not found then
    raise exception 'Personaggio non trovato o non ancora attivo.' using errcode = 'P0001';
  end if;
  insert into public.px_log (character_id, amount, reason, kind) values (p_character, p_amount, v_reason, 'assegnati');
  insert into public.system_messages (character_id, body)
    values (p_character, 'Hai ricevuto ' || p_amount || ' PX: ' || v_reason || '. Ora hai ' || balance || ' PX.');
  return balance;
end;
$$;
revoke execute on function public.staff_grant_px(uuid, int, text) from public, anon;
grant execute on function public.staff_grant_px(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- Livello di un'abilita' comprato con i PX: ora resta nel registro
-- ---------------------------------------------------------------------
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
  insert into public.px_log (character_id, amount, reason, kind)
    values (p_character, -v_cost, v_name || ': livello ' || (v_level + 1), 'abilita');
  return query select v_level + 1, v_px - v_cost;
end;
$$;
revoke execute on function public.spend_px(uuid, uuid) from public, anon;
grant execute on function public.spend_px(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- L'admin cambia PX, Risorse e Onore: la differenza dei PX resta nel registro
-- ---------------------------------------------------------------------
create or replace function public.admin_set_progress(p_character uuid, p_px int, p_resources int, p_honor int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_old int;
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono farlo.' using errcode = '42501'; end if;
  if p_px < 0 or p_resources < 0 or p_honor not between 0 and 10 then
    raise exception 'Valori non validi (PX e Risorse da 0 in su, Onore da 0 a 10).' using errcode = 'P0001';
  end if;
  select px into v_old from public.characters where id = p_character for update;
  update public.characters set px = p_px, resources = p_resources, honor = p_honor where id = p_character;
  if v_old is not null and v_old <> p_px then
    insert into public.px_log (character_id, amount, reason, kind)
      values (p_character, p_px - v_old, 'Modifica dell''admin: da ' || v_old || ' a ' || p_px || ' PX', 'modifica');
  end if;
end;
$$;
revoke execute on function public.admin_set_progress(uuid, int, int, int) from public, anon;
grant execute on function public.admin_set_progress(uuid, int, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- Azioni in chat oltre 1000 caratteri: mezzo PX l'una. Ogni PX intero
-- finisce nel registro, una riga al giorno per PG ("Azioni in chat")
-- ---------------------------------------------------------------------
create or replace function public.message_px_reward()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_gained boolean;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_row bigint;
begin
  if new.kind = 'azione' and char_length(new.content) > 1000 then
    update public.characters
      set px = px + (case when px_half then 1 else 0 end), px_half = not px_half
      where id = new.character_id and not is_npc
      returning not px_half into v_gained; -- px_half torna falso: e' arrivato un PX intero
    if coalesce(v_gained, false) then
      select id into v_row from public.px_log
        where character_id = new.character_id and kind = 'chat'
          and (created_at at time zone 'Europe/Rome')::date = v_today
        order by id desc limit 1;
      if v_row is null then
        insert into public.px_log (character_id, amount, reason, kind, by_user)
          values (new.character_id, 1, 'Azioni in chat', 'chat', null);
      else
        update public.px_log set amount = amount + 1 where id = v_row;
      end if;
    end if;
  end if;
  return new;
end;
$$;
