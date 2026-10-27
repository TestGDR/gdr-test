-- =====================================================================
-- 0170 - Assenze: messaggio di SISTEMA a tutti e simbolo che lampeggia
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Quando qualcuno segna un'assenza, a tutti i PG attivi (tranne i suoi)
--   arriva un messaggio di SISTEMA.
-- - Ognuno ricorda fin dove ha visto le assenze: il simbolo "Assenze"
--   lampeggia per quelle nuove.
-- - Le assenze arrivano in tempo reale.
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

create table if not exists public.absences_seen (
  user_id  uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  seen_at  timestamptz not null default now()
);
alter table public.absences_seen enable row level security;
drop policy if exists "il mio segno delle assenze" on public.absences_seen;
create policy "il mio segno delle assenze" on public.absences_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.absences_seen to authenticated;

-- in tempo reale (nuove e tolte)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'absences') then
    alter publication supabase_realtime add table public.absences;
  end if;
end $$;

-- Nuova assenza: messaggio di SISTEMA a tutti i PG attivi degli altri giocatori
create or replace function public.absence_notify()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text;
  v_when text;
begin
  select name into v_name from public.characters where id = new.character_id;
  v_when := case when new.from_date = new.to_date
                 then 'il ' || to_char(new.from_date, 'DD/MM/YYYY')
                 else 'dal ' || to_char(new.from_date, 'DD/MM/YYYY') || ' al ' || to_char(new.to_date, 'DD/MM/YYYY') end;
  insert into public.system_messages (character_id, body)
  select c.id,
         'Nuova assenza: ' || coalesce(v_name, 'un personaggio') || ' sarà assente ' || v_when || '.'
         || case when trim(new.note) <> '' then ' Nota: ' || trim(new.note) else '' end
    from public.characters c
   where c.status = 'attivo' and not c.is_npc
     and c.owner_id is distinct from new.author_id;
  return new;
end;
$$;

drop trigger if exists absences_notify on public.absences;
create trigger absences_notify after insert on public.absences
  for each row execute function public.absence_notify();
