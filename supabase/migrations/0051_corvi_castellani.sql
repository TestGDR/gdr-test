-- =====================================================================
-- 0051 - Corvi: i castellani leggono le missive
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Quando un corvo arriva a un castello, i castellani leggono il cartiglio
-- per sapere a chi e' indirizzato: gli admin ricevono un messaggio di
-- SISTEMA con mittente, destinatario, luoghi e testo. Nelle missive gli
-- admin hanno anche l'"Archivio messaggi castello" con tutti i corvi.
-- Un controllo automatico ogni minuto manda gli avvisi dei corvi arrivati.
-- =====================================================================

alter table public.scrolls add column castle_notified boolean not null default false;
create index scrolls_ravens_idx on public.scrolls(deliver_at) where method = 'corvo' and not castle_notified;

-- Corvi arrivati: avviso di SISTEMA a ogni admin (al suo personaggio principale)
create or replace function public.notify_castle_ravens()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  sc record;
  adm uuid;
begin
  for sc in
    select s.*, lf.name as from_name, lt.name as to_name
    from public.scrolls s
    left join public.locations lf on lf.id = s.from_location
    left join public.locations lt on lt.id = s.to_location
    where s.method = 'corvo' and not s.castle_notified and not s.intercepted and s.deliver_at <= now()
    order by s.deliver_at
    limit 200
  loop
    for adm in
      select (select c.id from public.characters c where c.owner_id = p.id order by c.created_at limit 1)
      from public.profiles p where p.role = 'admin'
    loop
      if adm is not null then
        perform public.send_system_message(adm,
          'I castellani di ' || coalesce(sc.to_name, '?') || ' hanno letto un cartiglio giunto con un corvo da ' || coalesce(sc.from_name, '?') || '.' || chr(10) ||
          'Da: ' || sc.sender_name || case when sc.signed then '' else ' (non firmato)' end || chr(10) ||
          'Per: ' || sc.recipient_name || chr(10) || chr(10) ||
          sc.body || chr(10) || chr(10) ||
          'Lo trovi anche nelle missive, in "Archivio messaggi castello".');
      end if;
    end loop;
    update public.scrolls set castle_notified = true where id = sc.id;
  end loop;
end;
$$;
revoke execute on function public.notify_castle_ravens() from public, anon, authenticated;

select cron.schedule('corvi-castellani', '* * * * *', 'select public.notify_castle_ravens()');

-- Archivio messaggi castello (solo admin): tutti i corvi arrivati
create or replace function public.castle_archive()
returns table (id bigint, sender_name text, recipient_name text, signed boolean, from_name text, to_name text,
               created_at timestamptz, deliver_at timestamptz, body text)
language plpgsql stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin'; end if;
  return query
    select s.id, s.sender_name, s.recipient_name, s.signed, lf.name, lt.name, s.created_at, s.deliver_at, s.body
    from public.scrolls s
    left join public.locations lf on lf.id = s.from_location
    left join public.locations lt on lt.id = s.to_location
    where s.method = 'corvo' and not s.intercepted and s.deliver_at <= now()
    order by s.deliver_at desc
    limit 1000;
end;
$$;
revoke execute on function public.castle_archive() from public, anon;
grant execute on function public.castle_archive() to authenticated;
