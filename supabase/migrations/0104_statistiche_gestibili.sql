-- =====================================================================
-- 0104 - Statistiche gestibili (Gestione -> Abilita' e tratti -> Statistiche)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - stats: le statistiche del personaggio (sigla, nome, descrizione,
--   ordine). Le 6 di base (INT, REF, BODY, EMP, PRE, WILL) servono alle
--   statistiche derivate (HP, Corsa...): si rinominano ma non si eliminano.
--   Le nuove si aggiungono e si eliminano (se nessuna abilita' le usa).
-- - Le abilita' sono collegate a una statistica della tabella.
-- - Gestisci (admin): le statistiche da 1 a 10 sono quelle attive.
-- Permesso: "regole.gestire".
-- =====================================================================

create table if not exists public.stats (
  id          text primary key check (id ~ '^[a-z][a-z0-9_]{0,19}$'),
  code        text not null unique check (code ~ '^[A-Z][A-Z0-9]{1,5}$'),
  label       text not null check (char_length(label) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  sort_order  int not null default 0,
  core        boolean not null default false, -- di base: non si elimina
  active      boolean not null default true
);

insert into public.stats (id, code, label, description, sort_order, core) values
  ('int',  'INT',  'Intelligenza', 'Ragionamento, memoria, percezione', 1, true),
  ('ref',  'REF',  'Riflessi',     'Riflessi, coordinazione, mira', 2, true),
  ('body', 'BODY', 'Corpo',        'Forza e costituzione', 3, true),
  ('emp',  'EMP',  'Empatia',      'Empatia e intuito', 4, true),
  ('pre',  'PRE',  'Presenza',     'Presenza, carisma, autorità', 5, true),
  ('will', 'WILL', 'Volontà',      'Volontà, coraggio, autocontrollo', 6, true)
on conflict (id) do nothing;

alter table public.stats enable row level security;
drop policy if exists "statistiche visibili" on public.stats;
create policy "statistiche visibili" on public.stats for select to authenticated using (true);
drop policy if exists "statistiche gestite" on public.stats;
create policy "statistiche gestite" on public.stats for all to authenticated
  using (public.has_permission('regole.gestire')) with check (public.has_permission('regole.gestire'));
grant select, insert, update, delete on public.stats to authenticated;
grant all on public.stats to service_role;

-- Le statistiche di base non si eliminano e non cambiano codice interno
create or replace function public.stats_protect()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.core then
    raise exception 'Le statistiche di base non si eliminano (servono a HP, Corsa e alle altre derivate).' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.id <> old.id or new.core <> old.core) then
    raise exception 'Il codice interno di una statistica non si cambia.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists stats_protect on public.stats;
create trigger stats_protect before update or delete on public.stats
  for each row execute function public.stats_protect();

-- Abilita' collegate alla tabella delle statistiche
alter table public.skills drop constraint if exists skills_stat_check;
alter table public.skills drop constraint if exists skills_stat_fkey;
alter table public.skills add constraint skills_stat_fkey foreign key (stat) references public.stats (id);

-- Gestisci: le statistiche sono quelle attive della tabella, da 1 a 10
create or replace function public.sheet_manage_update(
  p_character uuid, p_name text, p_sex text, p_age int, p_attributes jsonb, p_face_claim text, p_story text,
  p_height text, p_eye_color text, p_hair_color text, p_visible_marks text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  c public.characters;
  v_name text := trim(coalesce(p_name, ''));
  v_claim text := nullif(regexp_replace(trim(coalesce(p_face_claim, '')), '\s+', ' ', 'g'), '');
  v_attrs jsonb := '{}'::jsonb;
  k text;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then raise exception 'Personaggio non trovato'; end if;
  if not (public.is_admin() or (c.owner_id = auth.uid() and 'scheda' = any(c.sheet_unlocks))) then
    raise exception 'La scheda non è sbloccata.' using errcode = '42501';
  end if;

  if char_length(v_name) not between 2 and 40 then raise exception 'Il nome deve avere tra 2 e 40 lettere.' using errcode = 'P0001'; end if;
  if p_sex not in ('uomo', 'donna') then raise exception 'Sesso non valido.' using errcode = 'P0001'; end if;
  if p_age is null or p_age not between 16 and 80 then raise exception 'L''età deve essere tra 16 e 80 anni.' using errcode = 'P0001'; end if;
  if p_attributes is null or jsonb_typeof(p_attributes) <> 'object' then raise exception 'Statistiche non valide.' using errcode = 'P0001'; end if;
  for k in select id from public.stats where active loop
    if jsonb_typeof(p_attributes -> k) is distinct from 'number' or (p_attributes ->> k)::int not between 1 and 10 then
      raise exception 'Ogni statistica deve essere un numero tra 1 e 10.' using errcode = 'P0001';
    end if;
    v_attrs := v_attrs || jsonb_build_object(k, (p_attributes ->> k)::int);
  end loop;
  if char_length(coalesce(v_claim, '')) > 80 then raise exception 'Prestavolto troppo lungo.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_height, ''))) > 30
    or char_length(trim(coalesce(p_eye_color, ''))) > 40
    or char_length(trim(coalesce(p_hair_color, ''))) > 40 then
    raise exception 'Altezza, occhi o capelli troppo lunghi.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_visible_marks, ''))) > 300 then raise exception 'I segni visibili superano i 300 caratteri.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_story, ''))) > 4000 then raise exception 'La storia supera i 4000 caratteri.' using errcode = 'P0001'; end if;

  perform set_config('app.sheet_manage', '1', true); -- Gestisci puo' cambiare il prestavolto
  begin
    update public.characters
      set name = v_name, sex = p_sex, age = p_age,
          attributes = coalesce(c.attributes, '{}'::jsonb) || v_attrs, -- le statistiche disattivate restano salvate
          face_claim = v_claim,
          height = nullif(trim(coalesce(p_height, '')), ''),
          eye_color = nullif(trim(coalesce(p_eye_color, '')), ''),
          hair_color = nullif(trim(coalesce(p_hair_color, '')), ''),
          visible_marks = nullif(trim(coalesce(p_visible_marks, '')), '')
      where id = p_character;
  exception
    when unique_violation then raise exception 'Nome o prestavolto già usati da un altro personaggio.' using errcode = 'P0001';
    when check_violation then raise exception 'Il nome può contenere solo lettere, spazi, apostrofi e trattini.' using errcode = 'P0001';
  end;

  if trim(coalesce(p_story, '')) <> '' then
    insert into public.character_backgrounds (character_id, body) values (p_character, trim(p_story))
      on conflict (character_id) do update set body = excluded.body;
  end if;
end;
$$;
