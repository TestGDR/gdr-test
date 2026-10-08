-- =====================================================================
-- 0103 - Dadi configurabili (Gestione -> Dadi) e tiri in chat
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - dice_types: i tiri usabili in chat, con formula (es. "STAT + ABILITA
--   + 1d10", "ARMA") e regole condizionali (es. "se il dado fa 10 aggiungi
--   1d10 e ripeti"). Si gestiscono con il permesso "dadi.gestire".
-- - items.damage: danno degli oggetti (es. "2d5+1"), usato dalla variabile ARMA.
-- - messages: nuovo tipo "dado". Lo scrive solo il server (il risultato lo
--   calcola il server, nessuno lo puo' falsificare).
-- =====================================================================

create table if not exists public.dice_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  formula     text not null check (char_length(formula) between 1 and 200),
  rules       jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  ask_target  boolean not null default false, -- chiedere una DV (difficolta')
  staff_only  boolean not null default false, -- solo chi ha "chat.narrazione"
  sort_order  int not null default 0,
  active      boolean not null default true
);
alter table public.dice_types enable row level security;
drop policy if exists "dadi visibili" on public.dice_types;
create policy "dadi visibili" on public.dice_types for select to authenticated using (true);
drop policy if exists "dadi gestiti" on public.dice_types;
create policy "dadi gestiti" on public.dice_types for all to authenticated
  using (public.has_permission('dadi.gestire')) with check (public.has_permission('dadi.gestire'));
grant select, insert, update, delete on public.dice_types to authenticated;
grant all on public.dice_types to service_role;

insert into public.dice_types (name, description, formula, rules, ask_target, sort_order)
select n, d, f, r::jsonb, t, o from (values
  ('Prova', 'Statistica + abilità + d10 che esplode (10: si ritira e somma; 1: si ritira e sottrae), contro una DV.',
   'STAT + ABILITA + TRATTI + MOD + 1d10',
   '[{"when":"naturale","op":"=","value":10,"action":"aggiungi","formula":"1d10","repeat":true,"label":"esplode +1d10"},
     {"when":"naturale","op":"=","value":1,"action":"sottrai","formula":"1d10","label":"fallimento −1d10"},
     {"when":"margine","op":">=","value":0,"action":"esito","label":"Riuscito"},
     {"when":"margine","op":"<=","value":-1,"action":"esito","label":"Fallito"}]', true, 1),
  ('Danno dell''arma', 'Il danno dell''oggetto scelto (es. 2d5+1).', 'ARMA', '[]', false, 2),
  ('d20', 'Un dado da 20.', '1d20', '[]', false, 3),
  ('d100', 'Un dado da 100.', '1d100', '[]', false, 4)
) as v(n, d, f, r, t, o)
on conflict (name) do nothing;

-- Danno degli oggetti
alter table public.items add column if not exists damage text;
alter table public.items drop constraint if exists items_damage_check;
alter table public.items add constraint items_damage_check
  check (damage is null or damage ~* '^[0-9]*d[0-9]+([+-][0-9]+)*$|^[0-9]+$');

-- Messaggi di tipo "dado"
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('azione', 'fuori_gioco', 'master', 'dado'));
alter table public.messages add column if not exists roll_data jsonb;

-- I giocatori non scrivono messaggi "dado" direttamente
drop policy if exists "scrivi con il proprio personaggio attivo" on public.messages;
create policy "scrivi con il proprio personaggio attivo" on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.owner_id = auth.uid() and c.status = 'attivo'
    )
    and kind in ('azione', 'fuori_gioco', 'master')
    and (kind <> 'master' or public.has_permission('chat.narrazione'))
    and public.can_enter_room(room_id)
  );

-- Il server pubblica il tiro a nome del giocatore, con gli stessi controlli
-- della chat (PG suo e attivo, accesso alla stanza)
create or replace function public.post_dice_roll(p_user uuid, p_room uuid, p_character uuid, p_content text, p_data jsonb)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.characters where id = p_character and owner_id = p_user and status = 'attivo') then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi scrivere in questa chat.' using errcode = '42501';
  end if;
  insert into public.messages (room_id, character_id, kind, content, roll_data)
    values (p_room, p_character, 'dado', left(p_content, 4000), p_data)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.post_dice_roll(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.post_dice_roll(uuid, uuid, uuid, text, jsonb) to service_role;
