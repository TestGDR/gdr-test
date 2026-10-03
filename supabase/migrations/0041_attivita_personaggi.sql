-- =====================================================================
-- 0041 - Registro accessi: attivita' dei personaggi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ultimo login: l'ultima volta che il giocatore e' entrato in land, cioe'
--   e' tornato nel gioco dopo almeno un'ora di assenza (o dopo Esci).
--   Vale anche per chi resta collegato con la sessione salvata.
-- Ultima azione: l'ultima azione scritta in una chat di gioco. Resta
--   salvata anche se i messaggi vengono poi cancellati dalla Manutenzione.
-- Creazione: la data in cui il PG e' stato approvato (characters.activated_at).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ultimo ingresso in land
-- ---------------------------------------------------------------------
alter table public.online_status add column last_entry timestamptz;

-- valore iniziale: l'ultimo accesso registrato o l'ultimo segnale
update public.online_status o
   set last_entry = coalesce(
     (select max(a.created_at) from public.access_logs a where a.user_id = o.user_id and a.event in ('login', 'accesso')),
     o.last_action);

create or replace function public.touch_online(p_info jsonb, p_action boolean default false)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.online_status (user_id, info, last_seen, last_action, last_entry)
  values (auth.uid(), coalesce(p_info, '{}'::jsonb), now(), now(), now())
  on conflict (user_id) do update set
    info = excluded.info,
    last_seen = now(),
    -- chi non faceva nulla da un'ora (o era uscito) e ora fa qualcosa sta
    -- rientrando in land (una scheda lasciata aperta da sola non conta)
    last_entry = case
      when p_action and (public.online_status.last_action < now() - interval '60 minutes' or public.online_status.last_entry is null)
        then now()
      else public.online_status.last_entry
    end,
    last_action = case when p_action then now() else public.online_status.last_action end;
$$;

-- ---------------------------------------------------------------------
-- Ultima azione in chat, per personaggio
-- ---------------------------------------------------------------------
create table public.character_activity (
  character_id      uuid primary key references public.characters(id) on delete cascade,
  last_chat_action  timestamptz not null
);
alter table public.character_activity enable row level security;
-- nessuna policy: si legge solo con la funzione dello staff qui sotto

insert into public.character_activity (character_id, last_chat_action)
select character_id, max(created_at) from public.messages where kind = 'azione' group by character_id;

create or replace function public.mark_chat_action()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.kind = 'azione' then
    insert into public.character_activity (character_id, last_chat_action)
    values (new.character_id, new.created_at)
    on conflict (character_id) do update set last_chat_action = excluded.last_chat_action;
  end if;
  return new;
end;
$$;

create trigger messages_chat_action after insert on public.messages
  for each row execute function public.mark_chat_action();

-- ---------------------------------------------------------------------
-- Elenco per il Registro accessi (solo chi ha il permesso)
-- ---------------------------------------------------------------------
create or replace function public.staff_character_activity()
returns table (
  character_id      uuid,
  name              text,
  status            text,
  activated_at      timestamptz,
  last_entry        timestamptz,
  last_chat_action  timestamptz
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.has_permission('gestione.accessi') then
    raise exception 'Permesso negato';
  end if;
  return query
    select c.id, c.name, c.status::text, c.activated_at, o.last_entry, a.last_chat_action
    from public.characters c
    left join public.online_status o on o.user_id = c.owner_id
    left join public.character_activity a on a.character_id = c.id
    order by o.last_entry desc nulls last, c.name;
end;
$$;

revoke execute on function public.staff_character_activity() from public, anon;
grant execute on function public.staff_character_activity() to authenticated;
