-- =====================================================================
-- 0178 - Narrazioni del master senza il limite di caratteri della chat
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Le narrazioni (tipo "Narrazione master") non seguono il limite della
-- chat (Gestione -> Chat) ne' quello della modalita' master: arrivano fino
-- a 10000 caratteri. Azioni, OFF e sussurri restano come prima.
-- =====================================================================

-- tetto del testo di un messaggio: da 4000 a 10000 (serve alle narrazioni;
-- gli altri tipi restano entro il limite della chat, che e' al massimo 4000)
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check
  check (char_length(content) between 1 and 10000);

create or replace function public.chat_message_length_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_max int;
  r public.rooms;
begin
  if new.kind in ('dado', 'sistema') then return new; end if;
  -- narrazione del master: niente limite della chat, solo il tetto del messaggio
  if new.kind = 'master' then return new; end if;
  select max_length into v_max from public.chat_settings limit 1;
  -- in modalita' master le azioni seguono i limiti fissati per la chat
  if new.kind = 'azione' then
    select * into r from public.rooms where id = new.room_id;
    if r.master_max is not null then
      if char_length(new.content) > r.master_max then
        raise exception 'Modalità master: l''azione supera il limite di % caratteri.', r.master_max using errcode = 'P0001';
      end if;
      if char_length(new.content) < coalesce(r.master_min, 0) then
        raise exception 'Modalità master: l''azione deve avere almeno % caratteri.', r.master_min using errcode = 'P0001';
      end if;
      return new;
    end if;
  end if;
  if v_max is not null and char_length(new.content) > v_max then
    raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;
