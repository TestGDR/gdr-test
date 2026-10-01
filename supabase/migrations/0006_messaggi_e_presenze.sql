-- =====================================================================
-- 0006 - Missive (messaggi ON), messaggi OFF e frase di stato
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- =====================================================================

-- Frase mostrata sotto il nome nell'elenco dei presenti online
alter table public.profiles
  add column status_text text check (char_length(status_text) <= 80);
grant update (status_text) on public.profiles to authenticated;

-- Vero se il personaggio appartiene all'utente corrente
create or replace function public.owns_character(cid uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.characters where id = cid and owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- MESSAGGI PRIVATI tra personaggi
--   missiva = messaggio "in gioco" (ON): solo personaggi attivi
--   off     = messaggio fuori gioco tra giocatori: anche PG non attivi
-- ---------------------------------------------------------------------
create table public.private_messages (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('missiva', 'off')),
  sender_id     uuid not null references public.characters(id) on delete cascade,
  recipient_id  uuid not null references public.characters(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 4000),
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  check (sender_id <> recipient_id)
);
create index private_messages_recipient_idx on public.private_messages(recipient_id, kind, read_at);
create index private_messages_sender_idx on public.private_messages(sender_id, created_at desc);

-- Data e stato "non letto" li decide il database, non il client
create or replace function public.private_messages_before_insert()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

create trigger private_messages_before_insert
  before insert on public.private_messages
  for each row execute function public.private_messages_before_insert();

alter table public.private_messages enable row level security;

-- Ognuno vede solo i messaggi dei propri personaggi (inviati o ricevuti)
create policy "vedi i tuoi messaggi" on public.private_messages
  for select to authenticated
  using (public.owns_character(sender_id) or public.owns_character(recipient_id));

-- Si scrive solo con i propri personaggi; le missive solo da PG attivi
create policy "scrivi con i tuoi personaggi" on public.private_messages
  for insert to authenticated
  with check (
    public.owns_character(sender_id)
    and (
      kind = 'off'
      or exists (select 1 from public.characters c where c.id = sender_id and c.status = 'attivo')
    )
  );

-- Solo il destinatario puo' segnare un messaggio come letto
create policy "segna come letto" on public.private_messages
  for update to authenticated
  using (public.owns_character(recipient_id))
  with check (public.owns_character(recipient_id));

grant select, insert on public.private_messages to authenticated;
grant update (read_at) on public.private_messages to authenticated;

-- Nuovi messaggi in tempo reale (contatori dei non letti e conversazioni aperte)
alter publication supabase_realtime add table public.private_messages;
