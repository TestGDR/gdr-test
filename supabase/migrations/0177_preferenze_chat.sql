-- =====================================================================
-- 0177 - Aspetto della chat (pulsante "Aa" negli strumenti della chat)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Valgono SOLO per i messaggi della chat, per il proprio account:
-- grandezza del testo in pt (vuota = automatica), carattere, colore dei
-- nomi. I colori di parlato e azione c'erano gia' (speech_color, action_color).
-- =====================================================================

alter table public.user_prefs
  add column if not exists chat_font_pt int
    check (chat_font_pt between 8 and 30);
alter table public.user_prefs
  add column if not exists chat_font text not null default 'mukta'
    check (chat_font in ('mukta', 'open-sans', 'lora', 'georgia'));
alter table public.user_prefs
  add column if not exists chat_name_color text not null default '#d4b394'
    check (chat_name_color ~ '^#[0-9a-fA-F]{6}$');

-- colore dei tag tra [ ] (non sono parlato)
alter table public.user_prefs
  add column if not exists chat_tag_color text not null default '#9fb8cf'
    check (chat_tag_color ~ '^#[0-9a-fA-F]{6}$');

-- prima versione (grandezza in percentuale): non serve piu'
alter table public.user_prefs drop column if exists chat_text_scale;
