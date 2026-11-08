-- =====================================================================
-- 0180 - Tutti i contatori del gioco in una sola richiesta
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Prima il sito faceva ~20 richieste separate (missive, OFF, ticket, forum,
-- post segnalati, notizie, eventi, assenze, ricerche gioco, pettegolezzi) a
-- ogni controllo. Ora una sola: my_counters.
-- "security invoker": vale chi chiama, quindi le stesse regole di lettura
-- (RLS) delle richieste di prima; le funzioni gia' esistenti si riusano.
-- =====================================================================

create or replace function public.my_counters(p_character uuid, p_gossip boolean default false)
returns jsonb
language plpgsql
stable
security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_missive int := 0;
  v_next timestamptz;
  v_off int := 0;
  v_seen timestamptz;
  v_news_on boolean;
  v_news_off boolean;
  v_events boolean;
  v_abs_new int;
  v_abs_active int;
  v_req_new int;
  v_req_active int;
  v_gossip int := 0;
begin
  if v_uid is null then return null; end if;

  -- Missive (cartigli consegnati e sigillati, prossima consegna) e messaggi OFF
  if p_character is not null then
    select s.unread, s.next_delivery into v_missive, v_next
      from public.scrolls_unread(p_character) s;
    select count(*) into v_off
      from public.private_messages
      where recipient_id = p_character and kind = 'off' and read_at is null;
    v_off := v_off + coalesce(public.off_unread(p_character), 0);
  end if;

  -- Notizie ON e OFF dopo l'ultima apertura (le mie non contano)
  select exists (
    select 1 from public.news n
    where n.kind = 'on' and (n.author_id is null or n.author_id <> v_uid)
      and n.created_at > coalesce((select seen_at from public.news_seen where user_id = v_uid and kind = 'on'), '-infinity')
  ) into v_news_on;
  select exists (
    select 1 from public.news n
    where n.kind = 'off' and (n.author_id is null or n.author_id <> v_uid)
      and n.created_at > coalesce((select seen_at from public.news_seen where user_id = v_uid and kind = 'off'), '-infinity')
  ) into v_news_off;

  -- Eventi del calendario nuovi (non passati da piu' di un giorno)
  select seen_at into v_seen from public.events_seen where user_id = v_uid;
  select exists (
    select 1 from public.events e
    where (e.created_by is null or e.created_by <> v_uid)
      and e.starts_at > now() - interval '1 day'
      and e.created_at > coalesce(v_seen, '-infinity')
  ) into v_events;

  -- Assenze degli altri in corso o future: nuove e in tutto
  select seen_at into v_seen from public.absences_seen where user_id = v_uid;
  select count(*) filter (where a.created_at > coalesce(v_seen, '-infinity')), count(*)
    into v_abs_new, v_abs_active
    from public.absences a
    where a.author_id <> v_uid and a.to_date >= v_today;

  -- Ricerche gioco degli altri non scadute: nuove e in tutto
  select seen_at into v_seen from public.play_requests_seen where user_id = v_uid;
  select count(*) filter (where r.created_at > coalesce(v_seen, '-infinity')), count(*)
    into v_req_new, v_req_active
    from public.play_requests r
    where r.author_id <> v_uid and r.ends_at > now();

  -- Pettegolezzi da approvare (solo per chi li approva)
  if p_gossip then
    select count(*) into v_gossip from public.gossip_reports where status = 'attesa';
  end if;

  return jsonb_build_object(
    'missive', coalesce(v_missive, 0),
    'next_delivery', v_next,
    'off', coalesce(v_off, 0),
    'tickets', (select count(*) from public.ticket_unread_ids()),
    'forum', (select count(*) from public.forum_unread()),
    'highlights', coalesce((select jsonb_agg(to_jsonb(h)) from public.forum_pending_highlights() h), '[]'::jsonb),
    'news_on', v_news_on,
    'news_off', v_news_off,
    'events', v_events,
    'absences_new', v_abs_new,
    'absences_active', v_abs_active,
    'requests_new', v_req_new,
    'requests_active', v_req_active,
    'gossip', v_gossip
  );
end;
$$;

revoke execute on function public.my_counters(uuid, boolean) from public, anon;
grant execute on function public.my_counters(uuid, boolean) to authenticated;
