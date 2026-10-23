-- =====================================================================
-- 0161 - Missive ricevute: elenco con luogo e casata, archivio
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - L'elenco dei cartigli ricevuti mostra anche il luogo di partenza e la
--   casata del mittente: come il mittente, si scoprono solo aprendolo (e la
--   casata solo se il cartiglio e' firmato).
-- - Chi riceve puo' archiviare i cartigli: escono dall'elenco principale e
--   restano consultabili nell'archivio (si possono rimettere tra i ricevuti).
-- =====================================================================

alter table public.scrolls add column if not exists recipient_archived boolean not null default false;

drop function if exists public.scrolls_inbox(uuid);
create function public.scrolls_inbox(p_character uuid)
returns table (id bigint, method text, delivered_at timestamptz, opened boolean, signed boolean, sender_name text,
               sender_id uuid, body text, from_name text, sender_house text, archived boolean)
language sql stable
security definer set search_path = ''
as $$
  select s.id, s.method, s.deliver_at, s.read_at is not null,
         case when s.read_at is not null then s.signed end,
         case when s.read_at is not null and s.signed then s.sender_name end,
         case when s.read_at is not null and s.signed then s.sender_id end,
         case when s.read_at is not null then s.body end,
         case when s.read_at is not null then l.name end,
         case when s.read_at is not null and s.signed then h.name end,
         s.recipient_archived
  from public.scrolls s
  left join public.locations l on l.id = s.from_location
  left join public.characters c on c.id = s.sender_id
  left join public.houses h on h.id = c.house_id
  where public.is_my_character(p_character)
    and s.recipient_id = p_character and not s.intercepted and s.deliver_at <= now() and not s.recipient_deleted
  order by s.deliver_at desc
  limit 300;
$$;
revoke execute on function public.scrolls_inbox(uuid) from public, anon;
grant execute on function public.scrolls_inbox(uuid) to authenticated;

-- Archiviare (o rimettere tra i ricevuti) i propri cartigli
create or replace function public.archive_scrolls(p_ids bigint[], p_archived boolean)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  n int;
begin
  update public.scrolls s set recipient_archived = coalesce(p_archived, true)
   where s.id = any(p_ids) and public.is_my_character(s.recipient_id) and s.deliver_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.archive_scrolls(bigint[], boolean) from public, anon;
grant execute on function public.archive_scrolls(bigint[], boolean) to authenticated;
