-- Spie: il giocatore puo' togliere dal proprio archivio il resoconto di una
-- missione conclusa. La missione resta nel database (lo staff la vede ancora
-- in Gestione → Spie e nel ticket): sparisce solo dall'archivio del giocatore.

alter table public.spy_missions add column if not exists hidden boolean not null default false;

create or replace function public.spy_hide_mission(p_mission uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.spy_missions m set hidden = true
   where m.id = p_mission and public.is_my_character(m.character_id) and m.ends_at <= now();
  if not found then raise exception 'Si possono eliminare solo le proprie missioni concluse.' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.spy_hide_mission(uuid) from public, anon;
grant execute on function public.spy_hide_mission(uuid) to authenticated;

-- Le mie missioni: come prima, ma senza quelle tolte dall'archivio
create or replace function public.spy_my_missions(p_character uuid)
returns table (id uuid, spy_id uuid, spy_name text, spy_level int, target text, place_name text, depth text, request text,
               started_at timestamptz, ends_at timestamptz, finished boolean, fail_chance int, roll int, outcome text, report text)
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_my_character(p_character) then return; end if;
  update public.spies sp
     set status = case m.outcome when 'riuscita' then 'libera' when 'uccisa' then 'morta' else 'catturata' end
    from public.spy_missions m
   where m.spy_id = sp.id and m.character_id = p_character and not m.applied and m.ends_at <= now() and sp.status = 'missione';
  update public.spy_missions m set applied = true where m.character_id = p_character and not m.applied and m.ends_at <= now();
  return query
    select m.id, m.spy_id, m.spy_name, m.spy_level, m.target, m.place_name, m.depth, m.request, m.started_at, m.ends_at,
           m.ends_at <= now(),
           m.fail_chance,
           case when m.ends_at <= now() then m.roll end,
           case when m.ends_at <= now() then m.outcome end,
           case when m.ends_at <= now() and m.outcome = 'riuscita' then m.report else '' end
      from public.spy_missions m
     where m.character_id = p_character and not m.hidden
     order by m.started_at desc
     limit 100;
end;
$$;
revoke execute on function public.spy_my_missions(uuid) from public, anon;
grant execute on function public.spy_my_missions(uuid) to authenticated;

-- Le risposte dello staff: idem, senza le missioni tolte dall'archivio
create or replace function public.spy_my_replies(p_character uuid)
returns table (mission_id uuid, author_name text, body text, created_at timestamptz)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_my_character(p_character) then return; end if;
  return query
    select m.id, tm.author_name, tm.body, tm.created_at
      from public.spy_missions m
      join public.ticket_messages tm on tm.ticket_id = m.ticket_id
     where m.character_id = p_character
       and not m.hidden
       and m.ends_at <= now()
       and tm.from_staff
       and tm.roll_sides is null
     order by tm.created_at;
end;
$$;
revoke execute on function public.spy_my_replies(uuid) from public, anon;
grant execute on function public.spy_my_replies(uuid) to authenticated;
