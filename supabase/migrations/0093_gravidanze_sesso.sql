-- =====================================================================
-- 0093 - Gravidanze: sesso dei neonati
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Al parto il sistema tira in automatico, insieme al D100 del parto, un
-- D100 per ogni neonato (due se la gravidanza e' gemellare):
-- 01-50 femmina, 51-100 maschio. Tutto arriva nel messaggio di SISTEMA.
-- =====================================================================

alter table public.pregnancies add column if not exists babies jsonb not null default '[]'::jsonb;

create or replace function public.pregnancy_tick(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  p public.pregnancies;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_month int;
  v_roll int;
  v_symptom text;
  v_babies jsonb := '[]'::jsonb;
  v_text text := '';
  v_sex_roll int;
  i int;
begin
  perform public.assert_own_character(p_character);
  select * into p from public.pregnancies where character_id = p_character and status = 'in_corso' for update;
  if p.id is null then return; end if;

  -- Parto: finiti i 4 mesi ON. D100 del parto e un D100 per ogni neonato
  if now() >= p.started_at + interval '4 months' then
    v_roll := floor(random() * 100)::int + 1;
    for i in 1 .. case when p.twins then 2 else 1 end loop
      v_sex_roll := floor(random() * 100)::int + 1;
      v_babies := v_babies || jsonb_build_object('roll', v_sex_roll, 'sex', case when v_sex_roll <= 50 then 'femmina' else 'maschio' end);
      v_text := v_text || ' ' ||
        case when p.twins then i || '° neonato' else 'Neonato' end ||
        ': D100 ' || v_sex_roll || ' — ' || case when v_sex_roll <= 50 then 'femmina.' else 'maschio.' end;
    end loop;
    update public.pregnancies
      set status = 'conclusa', birth_roll = v_roll, birth_easy = v_roll <= 50, babies = v_babies, ended_at = now()
      where id = p.id;
    perform public.send_system_message(p_character,
      'È arrivato il momento del parto' || case when p.twins then ' (gemellare)' else '' end ||
      '. D100: ' || v_roll || ' — Esito: ' ||
      case when v_roll <= 50 then 'parto facile.' else 'parto difficile.' end || v_text);
    return;
  end if;

  if exists (select 1 from public.pregnancy_days where pregnancy_id = p.id and day = v_today) then return; end if;

  v_month := public.pregnancy_month(p.started_at);
  v_roll := floor(random() * 100)::int + 1;
  if v_roll <= 50 then
    select label into v_symptom from public.pregnancy_symptoms where month = v_month order by random() limit 1;
  end if;
  insert into public.pregnancy_days (pregnancy_id, day, month, roll, symptom)
    values (p.id, v_today, v_month, v_roll, v_symptom)
    on conflict do nothing;

  perform public.send_system_message(p_character,
    'Gravidanza' || case when p.twins then ' gemellare' else '' end || ' — ' || v_month || '° mese ON. ' ||
    case when v_symptom is null
      then 'Controllo giornaliero: nessun sintomo. Oggi non manifesti particolari malesseri.'
      else 'Controllo giornaliero: sintomo presente. Sintomo di oggi: ' || v_symptom || '.' end);
end;
$$;
revoke execute on function public.pregnancy_tick(uuid) from public, anon;
grant execute on function public.pregnancy_tick(uuid) to authenticated;
