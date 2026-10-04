-- =====================================================================
-- 0045 - Messaggi OFF: cancellare le conversazioni, uscire dai gruppi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Cancellare una conversazione (a due o "Messaggi a tutti") la toglie
-- solo dal proprio elenco: l'altro la conserva. Se arriva un messaggio
-- nuovo la conversazione ricompare, con i soli messaggi nuovi.
-- SISTEMA: i messaggi si eliminano davvero (sono solo tuoi).
-- Gruppi: si esce; chi ha creato il gruppo puo' eliminarlo per tutti.
-- =====================================================================

create table public.off_hidden (
  character_id  uuid not null references public.characters(id) on delete cascade,
  conv_key      text not null check (conv_key ~ '^(dm:[0-9a-f-]{36}|global)$'),
  hidden_at     timestamptz not null default now(),
  primary key (character_id, conv_key)
);
alter table public.off_hidden enable row level security;
create policy "le mie conversazioni cancellate" on public.off_hidden for all to authenticated
  using (public.is_my_character(character_id)) with check (public.is_my_character(character_id));
grant select, insert, update on public.off_hidden to authenticated;

-- SISTEMA: si possono eliminare i propri messaggi
create policy "elimina i tuoi messaggi di sistema" on public.system_messages for delete to authenticated
  using (public.is_my_character(character_id));
grant delete on public.system_messages to authenticated;

-- Elimina un gruppo per tutti (solo chi l'ha creato)
create or replace function public.delete_off_group(p_group uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_off_group_owner(p_group) then raise exception 'Solo chi ha creato il gruppo puo'' eliminarlo'; end if;
  delete from public.off_groups where id = p_group;
end;
$$;
revoke execute on function public.delete_off_group(uuid) from public, anon;
grant execute on function public.delete_off_group(uuid) to authenticated;
