-- Spie: a missione finita il giocatore legge, nel pannello Spie (Archivio),
-- le risposte che lo staff ha scritto nel ticket della missione.
-- Vede solo i messaggi dello staff (non i tiri di dado), e solo quando la
-- missione e' rientrata: prima non trapela nulla.

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
       and m.ends_at <= now()
       and tm.from_staff
       and tm.roll_sides is null
     order by tm.created_at;
end;
$$;
revoke execute on function public.spy_my_replies(uuid) from public, anon;
grant execute on function public.spy_my_replies(uuid) to authenticated;

-- Lo staff deve saperlo: si aggiorna l'avviso della sezione e quello scritto
-- in testa ai prossimi ticket di missione
update public.ticket_sections
   set instructions = 'Missioni delle spie: i ticket si aprono da soli quando un giocatore manda una spia. Il giocatore non vede il ticket, ma a missione finita legge nel pannello Spie (Archivio) le risposte che lo staff scrive qui. Il rapporto si può scrivere anche in Gestione → Spie.'
 where name = 'Spie';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.spy_send(uuid, uuid, text, text, text)'::regprocedure) into v_def;
  v_def := replace(v_def,
    '(il giocatore non vede questo ticket)',
    '(il giocatore non vede questo ticket: a missione finita leggerà nel pannello Spie le risposte dello staff scritte qui)');
  execute v_def;
end $$;
