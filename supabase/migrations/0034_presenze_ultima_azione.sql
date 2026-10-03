-- =====================================================================
-- 0034 - Presenze: online fino a un'ora dall'ultima azione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Si resta nell'elenco dei presenti finche' si fa almeno un'azione nel
-- sito ogni ora: cambiare pagina, aggiornare, scrivere in chat, mandare
-- una missiva o un messaggio OFF. Una scheda in secondo piano o un
-- telefono in standby non fanno sparire nessuno.
-- Si sparisce subito solo premendo Esci.
-- =====================================================================

alter table public.online_status add column last_action timestamptz not null default now();

-- Segnale del browser: p_action = true quando il giocatore ha fatto qualcosa
drop function public.touch_online(jsonb);
create or replace function public.touch_online(p_info jsonb, p_action boolean default false)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.online_status (user_id, info, last_seen, last_action)
  values (auth.uid(), coalesce(p_info, '{}'::jsonb), now(), now())
  on conflict (user_id) do update set
    info = excluded.info,
    last_seen = now(),
    last_action = case when p_action then now() else public.online_status.last_action end;
$$;

-- Esci: si sparisce subito
create or replace function public.leave_online()
returns void
language sql
security definer set search_path = ''
as $$
  update public.online_status
  set last_seen = now() - interval '2 hours', last_action = now() - interval '2 hours'
  where user_id = auth.uid();
$$;

-- Presenti: chi ha fatto un'azione nell'ultima ora
create or replace function public.recent_online()
returns table (user_id uuid, info jsonb, last_seen timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select user_id, info, last_seen from public.online_status
  where last_action > now() - interval '60 minutes';
$$;

revoke execute on function public.touch_online(jsonb, boolean) from public, anon;
grant execute on function public.touch_online(jsonb, boolean) to authenticated;

-- Scrivere in chat, mandare una missiva o un OFF conta come azione
create or replace function public.online_mark_action()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.online_status set last_action = now(), last_seen = now() where user_id = auth.uid();
  return new;
end;
$$;

create trigger messages_online_action after insert on public.messages
  for each row execute function public.online_mark_action();
create trigger private_messages_online_action after insert on public.private_messages
  for each row execute function public.online_mark_action();
