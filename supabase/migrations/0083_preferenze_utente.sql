-- =====================================================================
-- 0083 - Preferenze dell'utente (scheda -> Opzioni)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Suoni (missive ON, messaggi OFF, chat, volume, oppure tutti spenti), grandezza
-- del testo e colori del parlato e delle azioni in chat. Valgono per
-- l'account, su qualsiasi dispositivo. Ognuno vede e cambia solo le sue.
-- =====================================================================

create table if not exists public.user_prefs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  sounds_on      boolean not null default true,
  volume         int not null default 80 check (volume between 0 and 100),
  sound_missiva  text not null default 'corvo' check (char_length(sound_missiva) <= 30),
  sound_off      text not null default 'carillon' check (char_length(sound_off) <= 30),
  sound_chat     text not null default 'tamburo' check (char_length(sound_chat) <= 30),
  chat_sound_on  boolean not null default true,
  text_scale     int not null default 100 check (text_scale between 80 and 160),
  speech_color   text not null default '#fde68a' check (speech_color ~ '^#[0-9a-fA-F]{6}$'),
  action_color   text not null default '#e4dfdb' check (action_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at     timestamptz not null default now()
);
alter table public.user_prefs enable row level security;

drop policy if exists "le mie preferenze" on public.user_prefs;
create policy "le mie preferenze" on public.user_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_prefs to authenticated;
grant select, insert, update, delete on public.user_prefs to service_role;

-- (se la tabella esisteva gia', senza il volume)
alter table public.user_prefs add column if not exists volume int not null default 80 check (volume between 0 and 100);
