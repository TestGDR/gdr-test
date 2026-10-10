-- =====================================================================
-- 0109 - Chat: limite di caratteri delle azioni impostabile in Gestione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Il limite vale per azioni, OFF e narrazioni (non per i tiri di dado).
-- Lo imposta chi ha il permesso "mondo.gestire" (Gestione -> Chat).
-- =====================================================================

create table if not exists public.chat_settings (
  id          boolean primary key default true check (id),
  max_length  int not null default 1200 check (max_length between 100 and 4000)
);
insert into public.chat_settings (id) values (true) on conflict (id) do nothing;
alter table public.chat_settings enable row level security;
drop policy if exists "impostazioni chat visibili" on public.chat_settings;
create policy "impostazioni chat visibili" on public.chat_settings for select to authenticated using (true);
drop policy if exists "impostazioni chat dei gestori" on public.chat_settings;
create policy "impostazioni chat dei gestori" on public.chat_settings for update to authenticated
  using (public.has_permission('mondo.gestire')) with check (public.has_permission('mondo.gestire'));
grant select, update on public.chat_settings to authenticated;
grant select, insert, update, delete on public.chat_settings to service_role;

-- Il database controlla il limite anche se qualcuno scrive senza passare dalla chat
create or replace function public.chat_message_length_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_max int;
begin
  if new.kind = 'dado' then return new; end if;
  select max_length into v_max from public.chat_settings limit 1;
  if v_max is not null and char_length(new.content) > v_max then
    raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_length_guard on public.messages;
create trigger messages_length_guard before insert on public.messages
  for each row execute function public.chat_message_length_guard();
