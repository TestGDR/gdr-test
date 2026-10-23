-- =====================================================================
-- 0162 - Missive: inviati e archivio messaggi castello come i ricevuti
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni (dopo la 0161).
--
-- - Inviati: luogo di arrivo e casata del destinatario; chi scrive puo'
--   archiviare le sue copie (e rimetterle tra gli inviati).
-- - Archivio messaggi castello (chi ha il permesso): casate di mittente e
--   destinatario; i corvi si possono archiviare o togliere dall'elenco
--   (il cartiglio resta a chi l'ha scritto e a chi l'ha ricevuto).
-- =====================================================================

alter table public.scrolls
  add column if not exists sender_archived boolean not null default false,
  add column if not exists castle_archived boolean not null default false,
  add column if not exists castle_deleted  boolean not null default false;

-- Inviati
drop function if exists public.scrolls_sent(uuid);
create function public.scrolls_sent(p_character uuid)
returns table (id bigint, recipient_name text, method text, created_at timestamptz, deliver_at timestamptz, signed boolean,
               body text, to_name text, recipient_house text, archived boolean)
language sql stable
security definer set search_path = ''
as $$
  select s.id, s.recipient_name, s.method, s.created_at, s.deliver_at, s.signed, s.body,
         l.name, h.name, s.sender_archived
  from public.scrolls s
  left join public.locations l on l.id = s.to_location
  left join public.characters c on c.id = s.recipient_id
  left join public.houses h on h.id = c.house_id
  where public.is_my_character(p_character) and s.sender_id = p_character and not s.sender_deleted
  order by s.created_at desc
  limit 300;
$$;
revoke execute on function public.scrolls_sent(uuid) from public, anon;
grant execute on function public.scrolls_sent(uuid) to authenticated;

create or replace function public.archive_sent_scrolls(p_ids bigint[], p_archived boolean)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  n int;
begin
  update public.scrolls s set sender_archived = coalesce(p_archived, true)
   where s.id = any(p_ids) and public.is_my_character(s.sender_id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.archive_sent_scrolls(bigint[], boolean) from public, anon;
grant execute on function public.archive_sent_scrolls(bigint[], boolean) to authenticated;

-- Archivio messaggi castello
drop function if exists public.castle_archive();
create function public.castle_archive()
returns table (id bigint, sender_name text, recipient_name text, signed boolean, from_name text, to_name text,
               created_at timestamptz, deliver_at timestamptz, body text, sender_house text, recipient_house text,
               archived boolean)
language plpgsql stable
security definer set search_path = ''
as $$
begin
  if not public.has_permission('missive.castello') then raise exception 'Permesso negato'; end if;
  return query
    select s.id, s.sender_name, s.recipient_name, s.signed, lf.name, lt.name, s.created_at, s.deliver_at, s.body,
           hs.name, hr.name, s.castle_archived
    from public.scrolls s
    left join public.locations lf on lf.id = s.from_location
    left join public.locations lt on lt.id = s.to_location
    left join public.characters cs on cs.id = s.sender_id
    left join public.houses hs on hs.id = cs.house_id
    left join public.characters cr on cr.id = s.recipient_id
    left join public.houses hr on hr.id = cr.house_id
    where s.method = 'corvo' and not s.intercepted and s.deliver_at <= now() and not s.castle_deleted
    order by s.deliver_at desc
    limit 1000;
end;
$$;
revoke execute on function public.castle_archive() from public, anon;
grant execute on function public.castle_archive() to authenticated;

-- archiviare (p_archived) o togliere dall'elenco (p_delete) i corvi del castello
create or replace function public.castle_archive_update(p_ids bigint[], p_archived boolean, p_delete boolean default false)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  n int;
begin
  if not public.has_permission('missive.castello') then raise exception 'Permesso negato'; end if;
  if p_delete then
    update public.scrolls set castle_deleted = true where id = any(p_ids) and method = 'corvo';
  else
    update public.scrolls set castle_archived = coalesce(p_archived, true) where id = any(p_ids) and method = 'corvo';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.castle_archive_update(bigint[], boolean, boolean) from public, anon;
grant execute on function public.castle_archive_update(bigint[], boolean, boolean) to authenticated;
