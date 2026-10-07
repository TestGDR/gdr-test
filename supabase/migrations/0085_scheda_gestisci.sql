-- =====================================================================
-- 0085 - Scheda: "Gestisci" dell'admin e "Sblocca scheda"
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Gestisci: l'admin modifica in un colpo nome, sesso, eta', punti delle
--   caratteristiche, prestavolto e storia (background) di un PG.
-- - Sblocca scheda: l'admin permette al proprietario di modificare gli
--   stessi campi, finche' non la riblocca.
-- - Storia: la leggono sempre il proprietario e chi ha "schede.storia"
--   (admin, moderatori, master); si modifica solo da Gestisci.
-- =====================================================================

-- Nuovi dati della scheda (pagina Dati)
alter table public.characters add column if not exists height text;
alter table public.characters add column if not exists eye_color text;
alter table public.characters add column if not exists hair_color text;
alter table public.characters add column if not exists visible_marks text;

-- Prestavolto: si sceglie una volta sola. Poi lo cambiano solo l'admin
-- (o il proprietario da Gestisci con la scheda sbloccata)
create or replace function public.lock_face_claim()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if coalesce(old.face_claim, '') <> ''
     and new.face_claim is distinct from old.face_claim
     and auth.uid() is not null
     and not public.is_admin()
     and coalesce(current_setting('app.sheet_manage', true), '') <> '1' then
    raise exception 'Il prestavolto non si può più cambiare.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists lock_face_claim on public.characters;
create trigger lock_face_claim before update of face_claim on public.characters
  for each row execute function public.lock_face_claim();

-- Sblocchi: anche "scheda" (tutta la scheda)
create or replace function public.set_sheet_unlock(p_character uuid, p_section text, p_on boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono sbloccare la scheda'; end if;
  if p_section not in ('scheda', 'storia', 'anagrafica') then raise exception 'Sezione non valida'; end if;
  update public.characters
    set sheet_unlocks = case
      when p_on then array(select distinct unnest(sheet_unlocks || p_section))
      else array_remove(sheet_unlocks, p_section) end
    where id = p_character;
end;
$$;

-- Storia: il proprietario la legge sempre
drop policy if exists "storia sbloccata al proprietario" on public.character_backgrounds;
drop policy if exists "storia al proprietario" on public.character_backgrounds;
create policy "storia al proprietario" on public.character_backgrounds for select to authenticated
  using (public.is_my_character(character_id));

-- Gestisci: modifica dei campi principali (admin, o proprietario con la scheda sbloccata)
drop function if exists public.sheet_manage_update(uuid, text, text, int, jsonb, text, text);
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
  if p_attributes is null or jsonb_typeof(p_attributes) <> 'object' then raise exception 'Caratteristiche non valide.' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p_attributes) loop
    if jsonb_typeof(p_attributes -> k) <> 'number' or (p_attributes ->> k)::int not between 0 and 20 then
      raise exception 'Ogni caratteristica deve essere un numero tra 0 e 20.' using errcode = 'P0001';
    end if;
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
      set name = v_name, sex = p_sex, age = p_age, attributes = p_attributes, face_claim = v_claim,
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
revoke execute on function public.sheet_manage_update(uuid, text, text, int, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.sheet_manage_update(uuid, text, text, int, jsonb, text, text, text, text, text, text) to authenticated;
