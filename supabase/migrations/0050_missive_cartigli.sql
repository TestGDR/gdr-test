-- =====================================================================
-- 0050 - Missive (messaggi ON) come cartigli: paggi, corvi, staffette
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni missiva e' un cartiglio sigillato. Chi lo riceve vede solo come e'
-- arrivato; il mittente si scopre aprendolo, e solo se si e' firmato.
-- Consegna:
--   stesso luogo                    -> paggio, subito
--   da castello/citta' a castello   -> corvo
--   altrimenti                      -> staffetta (piu' lenta)
-- Il tempo dipende dalla distanza sulla mappa. Fuori dai territori sicuri
-- un corvo o una staffetta possono essere intercettati: il cartiglio non
-- arriva mai, il mittente non lo sa, lo staff lo vede nei Log.
-- La posizione del PG e' il luogo dell'ultima chat di gioco in cui e' entrato.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mondo: luoghi con i corvi, luoghi di gioco, territori sicuri
-- ---------------------------------------------------------------------
alter table public.locations add column has_ravens boolean not null default false; -- castello o citta'
alter table public.locations add column in_game boolean not null default true;     -- false: es. "Chat OFF"
alter table public.maps add column safe boolean not null default false;            -- nessuna intercettazione

update public.maps set safe = true where name = 'Terre della Corona';
update public.locations set in_game = false where name ilike 'chat off%';
update public.locations set has_ravens = true where name in ('Approdo del Re', 'Harrenhal', 'Roccia del Drago', 'Driftmark');

-- Posizione del PG
alter table public.characters add column location_id uuid references public.locations(id) on delete set null;

-- Impostazioni delle missive (una sola riga)
create table public.missive_settings (
  id                   boolean primary key default true check (id),
  default_location_id  uuid references public.locations(id) on delete set null,
  raven_full_hours     numeric not null default 2 check (raven_full_hours between 0 and 240),   -- ore per attraversare tutta la mappa
  rider_full_hours     numeric not null default 6 check (rider_full_hours between 0 and 240),
  raven_intercept_pct  int not null default 10 check (raven_intercept_pct between 0 and 100),
  rider_intercept_pct  int not null default 20 check (rider_intercept_pct between 0 and 100)
);
insert into public.missive_settings (default_location_id)
select id from public.locations where name = 'Approdo del Re' limit 1;
alter table public.missive_settings enable row level security;
create policy "impostazioni visibili" on public.missive_settings for select to authenticated using (true);
create policy "impostazioni dello staff" on public.missive_settings for update to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
grant select, update on public.missive_settings to authenticated;
grant select, insert, update on public.missive_settings to service_role;

-- Posizione effettiva (se manca: il luogo di partenza)
create or replace function public.character_location(p_character uuid)
returns uuid
language sql stable
security definer set search_path = ''
as $$
  select coalesce(
    (select location_id from public.characters where id = p_character),
    (select default_location_id from public.missive_settings));
$$;

-- Entrando in una chat di gioco il PG si trova in quel luogo
create or replace function public.set_position_from_room(p_room uuid)
returns void
language sql
security definer set search_path = ''
as $$
  update public.characters c set location_id = l.id
  from public.rooms r join public.locations l on l.id = r.location_id
  where r.id = p_room and l.in_game
    and c.id = (select id from public.characters where owner_id = auth.uid() order by created_at limit 1);
$$;

-- Lo staff corregge la posizione di un PG
create or replace function public.staff_set_position(p_character uuid, p_location uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('mondo.gestire') then raise exception 'Permesso negato'; end if;
  update public.characters set location_id = p_location where id = p_character;
end;
$$;

-- ---------------------------------------------------------------------
-- Cartigli
-- ---------------------------------------------------------------------
create table public.scrolls (
  id                 bigint generated always as identity primary key,
  sender_id          uuid references public.characters(id) on delete set null,
  sender_name        text not null,
  recipient_id       uuid not null references public.characters(id) on delete cascade,
  recipient_name     text not null,
  body               text not null check (char_length(body) between 1 and 4000),
  signed             boolean not null default true,
  method             text not null check (method in ('paggio', 'corvo', 'staffetta')),
  from_location      uuid references public.locations(id) on delete set null,
  to_location        uuid references public.locations(id) on delete set null,
  created_at         timestamptz not null default now(),
  deliver_at         timestamptz not null default now(),
  intercepted        boolean not null default false,
  read_at            timestamptz,
  recipient_deleted  boolean not null default false,
  sender_deleted     boolean not null default false
);
create index scrolls_recipient_idx on public.scrolls(recipient_id, deliver_at desc);
create index scrolls_sender_idx on public.scrolls(sender_id, created_at desc);

-- nessun accesso diretto: solo le funzioni qui sotto (e lo staff dal server)
alter table public.scrolls enable row level security;
grant select, insert, update, delete on public.scrolls to service_role;

-- Avviso al destinatario (solo per i cartigli che arriveranno): l'icona si
-- accende all'ora di consegna. Non dice chi scrive ne' cosa.
create table public.scroll_notices (
  id            bigint generated always as identity primary key,
  character_id  uuid not null references public.characters(id) on delete cascade,
  deliver_at    timestamptz not null
);
alter table public.scroll_notices enable row level security;
create policy "i miei avvisi" on public.scroll_notices for select to authenticated using (public.is_my_character(character_id));
grant select on public.scroll_notices to authenticated;
grant select, insert, delete on public.scroll_notices to service_role;
alter publication supabase_realtime add table public.scroll_notices;

-- Come e in quanto tempo arriverebbe un cartiglio (anteprima prima di inviare)
create or replace function public.scroll_route(p_from uuid, p_to uuid)
returns table (method text, minutes int, risky boolean, from_name text, to_name text)
language plpgsql stable
security definer set search_path = ''
as $$
declare
  a public.locations;
  b public.locations;
  ma public.maps;
  mb public.maps;
  s public.missive_settings;
  v_full numeric;
  v_dist numeric;
begin
  select * into s from public.missive_settings;
  select * into a from public.locations where id = public.character_location(p_from);
  select * into b from public.locations where id = public.character_location(p_to);
  select * into ma from public.maps where id = a.map_id;
  select * into mb from public.maps where id = b.map_id;

  if a.id is not null and a.id = b.id then
    return query select 'paggio'::text, 0, false, a.name, b.name;
    return;
  end if;

  method := case when coalesce(a.has_ravens, false) and coalesce(b.has_ravens, false) then 'corvo' else 'staffetta' end;
  v_full := case when method = 'corvo' then s.raven_full_hours else s.rider_full_hours end;
  -- stessa mappa: in proporzione alla distanza (100 = tutta la larghezza); mappe diverse: tutta la mappa
  if a.id is not null and b.id is not null and a.map_id = b.map_id then
    v_dist := least(sqrt(power(a.x - b.x, 2) + power(a.y - b.y, 2)) / 100, 1.5);
  else
    v_dist := 1;
  end if;
  minutes := greatest(5, round(v_full * 60 * v_dist))::int;
  risky := not (coalesce(ma.safe, false) and coalesce(mb.safe, false));
  return query select method, minutes, risky, a.name, b.name;
end;
$$;

-- Anteprima per il giocatore: con il nome del destinatario
create or replace function public.scroll_preview(p_from uuid, p_to uuid)
returns table (method text, minutes int, risky boolean, from_name text)
language sql stable
security definer set search_path = ''
as $$
  select r.method, r.minutes, r.risky, r.from_name
  from public.scroll_route(p_from, p_to) r
  where public.is_my_character(p_from);
$$;

-- Invio
create or replace function public.send_scroll(p_from uuid, p_to uuid, p_body text, p_signed boolean)
returns table (method text, deliver_at timestamptz)
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  s public.missive_settings;
  v_from public.characters;
  v_to public.characters;
  v_intercepted boolean := false;
  v_deliver timestamptz;
begin
  select * into v_from from public.characters where id = p_from;
  select * into v_to from public.characters where id = p_to;
  if v_from.id is null or v_from.owner_id <> auth.uid() then raise exception 'Personaggio non valido'; end if;
  if v_from.status <> 'attivo' then raise exception 'Il personaggio non e'' ancora attivo'; end if;
  if v_to.id is null or v_to.id = v_from.id then raise exception 'Destinatario non valido'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'Testo non valido'; end if;

  select * into s from public.missive_settings;
  select * into r from public.scroll_route(p_from, p_to);
  v_deliver := now() + make_interval(mins => r.minutes);
  if r.method <> 'paggio' and r.risky then
    v_intercepted := random() * 100 < (case when r.method = 'corvo' then s.raven_intercept_pct else s.rider_intercept_pct end);
  end if;

  insert into public.scrolls (sender_id, sender_name, recipient_id, recipient_name, body, signed, method,
                              from_location, to_location, deliver_at, intercepted)
  values (v_from.id, v_from.name, v_to.id, v_to.name, trim(p_body), coalesce(p_signed, true), r.method,
          public.character_location(p_from), public.character_location(p_to), v_deliver, v_intercepted);

  if not v_intercepted then
    insert into public.scroll_notices (character_id, deliver_at) values (v_to.id, v_deliver);
  end if;
  -- scrivere conta come azione (presenze)
  update public.online_status set last_action = now(), last_seen = now() where user_id = auth.uid();
  return query select r.method, v_deliver;
end;
$$;

-- Ricevuti: solo quelli arrivati. Mittente e testo solo dopo l'apertura
-- (il mittente solo se si e' firmato)
create or replace function public.scrolls_inbox(p_character uuid)
returns table (id bigint, method text, delivered_at timestamptz, opened boolean, signed boolean, sender_name text, sender_id uuid, body text)
language sql stable
security definer set search_path = ''
as $$
  select s.id, s.method, s.deliver_at, s.read_at is not null,
         case when s.read_at is not null then s.signed end,
         case when s.read_at is not null and s.signed then s.sender_name end,
         case when s.read_at is not null and s.signed then s.sender_id end,
         case when s.read_at is not null then s.body end
  from public.scrolls s
  where public.is_my_character(p_character)
    and s.recipient_id = p_character and not s.intercepted and s.deliver_at <= now() and not s.recipient_deleted
  order by s.deliver_at desc
  limit 300;
$$;

-- Aprire un cartiglio: lo segna come letto e lo restituisce
create or replace function public.open_scroll(p_scroll bigint)
returns table (id bigint, method text, delivered_at timestamptz, signed boolean, sender_name text, sender_id uuid, body text)
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.scrolls s set read_at = coalesce(s.read_at, now())
  where s.id = p_scroll and public.is_my_character(s.recipient_id) and not s.intercepted and s.deliver_at <= now();
  return query
    select s.id, s.method, s.deliver_at, s.signed,
           case when s.signed then s.sender_name end,
           case when s.signed then s.sender_id end,
           s.body
    from public.scrolls s
    where s.id = p_scroll and public.is_my_character(s.recipient_id) and not s.intercepted and s.deliver_at <= now();
end;
$$;

-- Inviati: il mittente sa solo se e' ancora in viaggio o se dovrebbe essere arrivato
create or replace function public.scrolls_sent(p_character uuid)
returns table (id bigint, recipient_name text, method text, created_at timestamptz, deliver_at timestamptz, signed boolean, body text)
language sql stable
security definer set search_path = ''
as $$
  select s.id, s.recipient_name, s.method, s.created_at, s.deliver_at, s.signed, s.body
  from public.scrolls s
  where public.is_my_character(p_character) and s.sender_id = p_character and not s.sender_deleted
  order by s.created_at desc
  limit 300;
$$;

-- Gettare via un cartiglio (dal proprio elenco)
create or replace function public.discard_scroll(p_scroll bigint)
returns void
language sql
security definer set search_path = ''
as $$
  update public.scrolls s set
    recipient_deleted = case when public.is_my_character(s.recipient_id) then true else s.recipient_deleted end,
    sender_deleted = case when public.is_my_character(s.sender_id) then true else s.sender_deleted end
  where s.id = p_scroll;
$$;

-- Da aprire (per l'icona) e prossima consegna in arrivo
create or replace function public.scrolls_unread(p_character uuid)
returns table (unread int, next_delivery timestamptz)
language sql stable
security definer set search_path = ''
as $$
  select
    (select count(*)::int from public.scrolls s
      where s.recipient_id = p_character and not s.intercepted and s.deliver_at <= now()
        and s.read_at is null and not s.recipient_deleted),
    (select min(s.deliver_at) from public.scrolls s
      where s.recipient_id = p_character and not s.intercepted and s.deliver_at > now())
  where public.is_my_character(p_character);
$$;

revoke execute on function public.character_location(uuid) from public, anon;
revoke execute on function public.scroll_route(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.set_position_from_room(uuid) from public, anon;
revoke execute on function public.staff_set_position(uuid, uuid) from public, anon;
revoke execute on function public.scroll_preview(uuid, uuid) from public, anon;
revoke execute on function public.send_scroll(uuid, uuid, text, boolean) from public, anon;
revoke execute on function public.scrolls_inbox(uuid) from public, anon;
revoke execute on function public.open_scroll(bigint) from public, anon;
revoke execute on function public.scrolls_sent(uuid) from public, anon;
revoke execute on function public.discard_scroll(bigint) from public, anon;
revoke execute on function public.scrolls_unread(uuid) from public, anon;
grant execute on function public.character_location(uuid) to authenticated;
grant execute on function public.set_position_from_room(uuid) to authenticated;
grant execute on function public.staff_set_position(uuid, uuid) to authenticated;
grant execute on function public.scroll_preview(uuid, uuid) to authenticated;
grant execute on function public.send_scroll(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.scrolls_inbox(uuid) to authenticated;
grant execute on function public.open_scroll(bigint) to authenticated;
grant execute on function public.scrolls_sent(uuid) to authenticated;
grant execute on function public.discard_scroll(bigint) to authenticated;
grant execute on function public.scrolls_unread(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Le vecchie missive diventano cartigli gia' consegnati (firmati, a mano)
-- ---------------------------------------------------------------------
insert into public.scrolls (sender_id, sender_name, recipient_id, recipient_name, body, signed, method, created_at, deliver_at, read_at)
select pm.sender_id, coalesce(cs.name, '?'), pm.recipient_id, coalesce(cr.name, '?'), pm.body, true, 'paggio', pm.created_at, pm.created_at, pm.read_at
from public.private_messages pm
left join public.characters cs on cs.id = pm.sender_id
left join public.characters cr on cr.id = pm.recipient_id
where pm.kind = 'missiva';
delete from public.private_messages where kind = 'missiva';
