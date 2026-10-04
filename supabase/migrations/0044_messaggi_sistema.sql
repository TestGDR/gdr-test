-- =====================================================================
-- 0044 - Messaggi di SISTEMA nei messaggi OFF
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Una conversazione "SISTEMA" in sola lettura: benvenuto alla
-- registrazione del PG e, in futuro, avvisi automatici (oggetto
-- ricevuto, risposta a un ticket...) con public.send_system_message().
-- =====================================================================

create table public.system_messages (
  id            bigint generated always as identity primary key,
  character_id  uuid not null references public.characters(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 8000),
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index system_messages_character_idx on public.system_messages(character_id, created_at desc);

alter table public.system_messages enable row level security;
create policy "i tuoi messaggi di sistema" on public.system_messages for select to authenticated
  using (public.is_my_character(character_id));
create policy "segna letto" on public.system_messages for update to authenticated
  using (public.is_my_character(character_id)) with check (public.is_my_character(character_id));
-- nessuno scrive a nome del SISTEMA: solo le funzioni del database e il server
grant select, update (read_at) on public.system_messages to authenticated;
grant select, insert, update, delete on public.system_messages to service_role;

-- Manda un messaggio di SISTEMA a un personaggio (da usare per oggetti, ticket, ...)
create or replace function public.send_system_message(p_character uuid, p_body text)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.system_messages (character_id, body) values (p_character, p_body);
$$;
revoke execute on function public.send_system_message(uuid, text) from public, anon, authenticated;
grant execute on function public.send_system_message(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- Benvenuto: arriva a ogni nuovo personaggio appena registrato
-- ---------------------------------------------------------------------
create or replace function public.system_welcome()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.send_system_message(new.id, $testo$Valar Dohaeris viandante e benvenuto o benvenuta alla corte di Casa Blackfyre!

Westeros GDR è un gioco PVE basato principalmente sullo scontro dei personaggi con l'ambiente circostante, che è vivo e sempre presente e reagisce ad ogni cosa il tuo pg fa. Sia in positivo che in negativo.
Ricorda sempre che questo è un gioco, quindi rispetta le regole principali della convivenza.

Per muovere i primi passi ti consigliamo di:

- Leggere ambientazione e documentazione, così da avere un quadro chiaro di dove siamo e di cosa andremo a giocare.

- Leggere le descrizioni delle casate: completando la scheda del PG dovrai sceglierne una. Se attualmente non ci sono casate disponibili... non demordere! Anzi, scrivi allo staff.

Per qualunque dubbio o domanda lo staff è sempre a disposizione.

Buona permanenza!
Valar Morghulis$testo$);
  return new;
end;
$$;
create trigger characters_system_welcome after insert on public.characters
  for each row execute function public.system_welcome();

-- ---------------------------------------------------------------------
-- I non letti di SISTEMA contano per l'icona dei messaggi OFF
-- ---------------------------------------------------------------------
create or replace function public.off_unread(p_character uuid)
returns integer
language sql stable
security definer set search_path = ''
as $$
  select case when not public.is_my_character(p_character) then 0 else
    (select count(*)::int from public.off_group_messages gm
       join public.off_group_members m on m.group_id = gm.group_id and m.character_id = p_character
      where gm.sender_id <> p_character and gm.created_at > m.last_read_at)
    +
    (select count(*)::int from public.off_broadcasts b
      where b.sender_id is distinct from p_character
        and b.created_at > coalesce((select r.last_read_at from public.off_broadcast_reads r where r.character_id = p_character), now()))
    +
    (select count(*)::int from public.system_messages s where s.character_id = p_character and s.read_at is null)
  end;
$$;

alter publication supabase_realtime add table public.system_messages;
