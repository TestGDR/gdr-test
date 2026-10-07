-- =====================================================================
-- 0090 - Regolamento "Interlock per nobili": base del personaggio
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Statistiche INT, REF, BODY, EMP, PRE, WILL (1-10) in characters.attributes
--   (le vecchie caratteristiche restano salvate in attributes_old).
-- - Abilita' (catalogo gestito dallo staff) e livelli dei PG (0-10).
-- - Tratti: vantaggi e svantaggi (catalogo gestito dallo staff) dei PG.
-- - PX, Risorse, Onore, HP e Stamina attuali.
-- - spend_px: il giocatore sale di livello in un'abilita' (10 x livello PX).
-- - admin_set_progress: l'admin cambia PX, Risorse e Onore.
-- Permesso nuovo: "regole.gestire" (pannello Gestione -> Abilita' e tratti).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Personaggio
-- ---------------------------------------------------------------------
alter table public.characters add column if not exists attributes_old jsonb;
alter table public.characters add column if not exists px int not null default 0;
alter table public.characters add column if not exists resources int not null default 0;
alter table public.characters add column if not exists honor int not null default 5;
alter table public.characters add column if not exists hp_current int;
alter table public.characters add column if not exists stamina_current int;
alter table public.characters drop constraint if exists characters_px_check;
alter table public.characters add constraint characters_px_check check (px >= 0);
alter table public.characters drop constraint if exists characters_resources_check;
alter table public.characters add constraint characters_resources_check check (resources >= 0);
alter table public.characters drop constraint if exists characters_honor_check;
alter table public.characters add constraint characters_honor_check check (honor between 0 and 10);

-- Vecchie caratteristiche -> nuove statistiche (solo la prima volta), da
-- ritoccare poi dall'admin con Gestisci
update public.characters
  set attributes_old = attributes,
      attributes = jsonb_build_object(
        'int',  least(10, greatest(1, coalesce((attributes->>'intelligenza')::int, 4))),
        'ref',  least(10, greatest(1, coalesce((attributes->>'destrezza')::int, 4))),
        'body', least(10, greatest(1, ceil((coalesce((attributes->>'forza')::numeric, 4) + coalesce((attributes->>'costituzione')::numeric, 4)) / 2)::int)),
        'emp',  least(10, greatest(1, coalesce((attributes->>'percezione')::int, 4))),
        'pre',  least(10, greatest(1, coalesce((attributes->>'carisma')::int, 4))),
        'will', 4)
  where attributes is not null and attributes_old is null and not (attributes ? 'int');

-- ---------------------------------------------------------------------
-- Abilita'
-- ---------------------------------------------------------------------
create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 60),
  stat        text not null check (stat in ('int', 'ref', 'body', 'emp', 'pre', 'will')),
  description text not null default '' check (char_length(description) <= 1000),
  sort_order  int not null default 0,
  active      boolean not null default true
);

create table if not exists public.character_skills (
  character_id uuid not null references public.characters (id) on delete cascade,
  skill_id     uuid not null references public.skills (id) on delete cascade,
  level        int not null check (level between 0 and 10),
  primary key (character_id, skill_id)
);

insert into public.skills (name, stat, sort_order)
select n, s, o from (values
  ('Conoscenze', 'int', 1), ('Medicina', 'int', 2), ('Osservazione', 'int', 3), ('Edilizia', 'int', 4),
  ('Armi da taglio leggere', 'ref', 1), ('Armi da taglio pesanti', 'ref', 2), ('Armi da impatto', 'ref', 3),
  ('Armi da tiro', 'ref', 4), ('Parare', 'ref', 5), ('Schivare', 'ref', 6), ('Equitazione', 'ref', 7),
  ('Cavalcare un Drago', 'ref', 8),
  ('Atletica', 'body', 1), ('Lotta', 'body', 2), ('Prese', 'body', 3), ('Resistenza', 'body', 4),
  ('Resistenza a veleni e droghe', 'body', 5), ('Resistenza a condizioni avverse', 'body', 6),
  ('Percepire Intenzioni', 'emp', 1), ('Dissimulare', 'emp', 2), ('Sesto Senso', 'emp', 3),
  ('Addestrare un animale', 'emp', 4), ('Addestrare un drago', 'emp', 5),
  ('Persuadere', 'pre', 1), ('Intimidire', 'pre', 2), ('Commercio', 'pre', 3), ('Contatti', 'pre', 4),
  ('Comandare un animale', 'pre', 5), ('Comandare un drago', 'pre', 6),
  ('Tempra', 'will', 1), ('Resistenza al Dolore', 'will', 2)
) as v(n, s, o)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Tratti (vantaggi e svantaggi)
-- modifiers: elenco di effetti sui tiri, es.
--   [{"target":"skill","skill":"Persuadere","value":1}]
--   target: skill | stat | initiative | hp | choice_skill | choice_stat | other
-- ---------------------------------------------------------------------
create table if not exists public.traits (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique check (char_length(name) between 2 and 60),
  kind            text not null check (kind in ('vantaggio', 'svantaggio')),
  cost            int not null check (cost between 1 and 10),
  effect          text not null default '' check (char_length(effect) <= 1000),
  choice          text not null default 'nessuna' check (choice in ('nessuna', 'abilita', 'statistica')),
  unique_group    text check (char_length(unique_group) <= 40),
  requires_master boolean not null default false,
  modifiers       jsonb not null default '[]'::jsonb check (jsonb_typeof(modifiers) = 'array'),
  sort_order      int not null default 0,
  active          boolean not null default true
);

create table if not exists public.character_traits (
  character_id uuid not null references public.characters (id) on delete cascade,
  trait_id     uuid not null references public.traits (id) on delete cascade,
  choice       text check (char_length(choice) <= 60), -- abilita' o statistica scelta
  primary key (character_id, trait_id)
);

insert into public.traits (name, kind, cost, effect, choice, unique_group, requires_master, modifiers, sort_order)
select n, k, c, e, ch, g, m, md::jsonb, o from (values
  ('Talento', 'vantaggio', 1, '+1 a tutti i tiri di una abilità a scelta', 'abilita', null, false, '[{"target":"choice_skill","value":1}]', 1),
  ('Specialista', 'vantaggio', 2, '+2 a una abilità a scelta, ma solo in una situazione precisa (per esempio Armi da tiro da cavallo)', 'abilita', null, false, '[{"target":"choice_skill","value":2,"condition":"situazione precisa"}]', 2),
  ('Talento di statistica', 'vantaggio', 3, '+1 a tutti i tiri con una statistica a scelta (se ne può avere uno solo)', 'statistica', 'talento_statistica', false, '[{"target":"choice_stat","value":1}]', 3),
  ('Riflessi pronti', 'vantaggio', 2, '+2 all''iniziativa', 'nessuna', null, false, '[{"target":"initiative","value":2}]', 4),
  ('Salute di ferro', 'vantaggio', 2, '+2 a Resistenza a veleni e droghe, +1 ai tiri contro infezione e febbre', 'nessuna', null, false, '[{"target":"skill","skill":"Resistenza a veleni e droghe","value":2},{"target":"other","value":1,"condition":"tiri contro infezione e febbre"}]', 5),
  ('Soglia del dolore alta', 'vantaggio', 1, '+2 a Resistenza al Dolore', 'nessuna', null, false, '[{"target":"skill","skill":"Resistenza al Dolore","value":2}]', 6),
  ('Lingua d''oro', 'vantaggio', 2, '+1 a Persuadere e Commercio', 'nessuna', null, false, '[{"target":"skill","skill":"Persuadere","value":1},{"target":"skill","skill":"Commercio","value":1}]', 7),
  ('Sguardo che gela', 'vantaggio', 2, '+2 a Intimidire', 'nessuna', null, false, '[{"target":"skill","skill":"Intimidire","value":2}]', 8),
  ('Occhio per le menzogne', 'vantaggio', 2, '+2 a Percepire Intenzioni', 'nessuna', null, false, '[{"target":"skill","skill":"Percepire Intenzioni","value":2}]', 9),
  ('Rete di contatti', 'vantaggio', 1, '+2 a Contatti', 'nessuna', null, false, '[{"target":"skill","skill":"Contatti","value":2}]', 10),
  ('Istinto del pericolo', 'vantaggio', 2, '+2 a Sesto Senso', 'nessuna', null, false, '[{"target":"skill","skill":"Sesto Senso","value":2}]', 11),
  ('Cavaliere nato', 'vantaggio', 1, '+2 a Equitazione', 'nessuna', null, false, '[{"target":"skill","skill":"Equitazione","value":2}]', 12),
  ('Studioso', 'vantaggio', 1, '+2 a Conoscenze', 'nessuna', null, false, '[{"target":"skill","skill":"Conoscenze","value":2}]', 13),
  ('Mani da guaritore', 'vantaggio', 1, '+2 a Medicina', 'nessuna', null, false, '[{"target":"skill","skill":"Medicina","value":2}]', 14),
  ('Sangue del drago', 'vantaggio', 3, '+2 a Comandare un drago e Cavalcare un Drago (solo con il permesso del Master)', 'nessuna', null, true, '[{"target":"skill","skill":"Comandare un drago","value":2},{"target":"skill","skill":"Cavalcare un Drago","value":2}]', 15),
  ('Debolezza di statistica', 'svantaggio', 3, '−1 a tutti i tiri con una statistica a scelta (se ne può avere uno solo)', 'statistica', 'debolezza_statistica', false, '[{"target":"choice_stat","value":-1}]', 1),
  ('Zoppia', 'svantaggio', 2, '−2 a Atletica e Schivare, Corsa −3 metri', 'nessuna', null, false, '[{"target":"skill","skill":"Atletica","value":-2},{"target":"skill","skill":"Schivare","value":-2},{"target":"run","value":-3}]', 2),
  ('Vista debole', 'svantaggio', 2, '−2 a Osservazione e Armi da tiro', 'nessuna', null, false, '[{"target":"skill","skill":"Osservazione","value":-2},{"target":"skill","skill":"Armi da tiro","value":-2}]', 3),
  ('Salute fragile', 'svantaggio', 2, '−2 a Resistenza a condizioni avverse, −1 ai tiri contro infezione e febbre, −5 HP', 'nessuna', null, false, '[{"target":"skill","skill":"Resistenza a condizioni avverse","value":-2},{"target":"other","value":-1,"condition":"tiri contro infezione e febbre"},{"target":"hp","value":-5}]', 4),
  ('Codardo', 'svantaggio', 2, '−2 a Tempra e Resistenza al Dolore quando la vita è in pericolo', 'nessuna', null, false, '[{"target":"skill","skill":"Tempra","value":-2,"condition":"vita in pericolo"},{"target":"skill","skill":"Resistenza al Dolore","value":-2,"condition":"vita in pericolo"}]', 5),
  ('Cattiva fama', 'svantaggio', 2, '−2 a Persuadere e Contatti con chi conosce la tua reputazione', 'nessuna', null, false, '[{"target":"skill","skill":"Persuadere","value":-2,"condition":"con chi conosce la tua reputazione"},{"target":"skill","skill":"Contatti","value":-2,"condition":"con chi conosce la tua reputazione"}]', 6),
  ('Terrore del fuoco', 'svantaggio', 2, '−3 ai tiri con WILL e Tempra davanti a un drago o a un grande incendio', 'nessuna', null, false, '[{"target":"stat","stat":"will","value":-3,"condition":"davanti a un drago o a un grande incendio"},{"target":"skill","skill":"Tempra","value":-3,"condition":"davanti a un drago o a un grande incendio"}]', 7),
  ('Dipendenza dal vino', 'svantaggio', 2, '−2 a tutti i tiri se passa un giorno senza bere', 'nessuna', null, false, '[{"target":"other","value":-2,"condition":"un giorno senza bere"}]', 8),
  ('Collerico', 'svantaggio', 1, '−2 a Persuadere e Dissimulare quando sei provocato o insultato', 'nessuna', null, false, '[{"target":"skill","skill":"Persuadere","value":-2,"condition":"provocato o insultato"},{"target":"skill","skill":"Dissimulare","value":-2,"condition":"provocato o insultato"}]', 9),
  ('Parlata impacciata', 'svantaggio', 1, '−2 a Persuadere e Commercio', 'nessuna', null, false, '[{"target":"skill","skill":"Persuadere","value":-2},{"target":"skill","skill":"Commercio","value":-2}]', 10),
  ('Maldestro in sella', 'svantaggio', 1, '−2 a Equitazione', 'nessuna', null, false, '[{"target":"skill","skill":"Equitazione","value":-2}]', 11)
) as v(n, k, c, e, ch, g, m, md, o)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Sicurezza: tutti leggono; il catalogo lo cambia chi ha "regole.gestire";
-- abilita' e tratti dei PG li cambia l'admin (i giocatori solo con spend_px
-- e alla creazione, che passa dal server)
-- ---------------------------------------------------------------------
alter table public.skills enable row level security;
alter table public.traits enable row level security;
alter table public.character_skills enable row level security;
alter table public.character_traits enable row level security;

drop policy if exists "abilita visibili" on public.skills;
create policy "abilita visibili" on public.skills for select to authenticated using (true);
drop policy if exists "abilita gestite" on public.skills;
create policy "abilita gestite" on public.skills for all to authenticated
  using (public.has_permission('regole.gestire')) with check (public.has_permission('regole.gestire'));

drop policy if exists "tratti visibili" on public.traits;
create policy "tratti visibili" on public.traits for select to authenticated using (true);
drop policy if exists "tratti gestiti" on public.traits;
create policy "tratti gestiti" on public.traits for all to authenticated
  using (public.has_permission('regole.gestire')) with check (public.has_permission('regole.gestire'));

drop policy if exists "abilita dei pg visibili" on public.character_skills;
create policy "abilita dei pg visibili" on public.character_skills for select to authenticated using (true);
drop policy if exists "abilita dei pg admin" on public.character_skills;
create policy "abilita dei pg admin" on public.character_skills for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tratti dei pg visibili" on public.character_traits;
create policy "tratti dei pg visibili" on public.character_traits for select to authenticated using (true);
drop policy if exists "tratti dei pg admin" on public.character_traits;
create policy "tratti dei pg admin" on public.character_traits for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.skills, public.traits, public.character_skills, public.character_traits to authenticated;
grant all on public.skills, public.traits, public.character_skills, public.character_traits to service_role;

-- ---------------------------------------------------------------------
-- Il giocatore sale di un livello in un'abilita' spendendo PX
-- ---------------------------------------------------------------------
create or replace function public.spend_px(p_character uuid, p_skill uuid)
returns table (level int, px int)
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_level int;
  v_px int;
  v_cost int;
begin
  perform public.assert_own_character(p_character);
  if not exists (select 1 from public.skills where id = p_skill and active) then
    raise exception 'Abilità non trovata.' using errcode = 'P0001';
  end if;
  select c.px into v_px from public.characters c where c.id = p_character for update;
  select cs.level into v_level from public.character_skills cs where cs.character_id = p_character and cs.skill_id = p_skill;
  v_level := coalesce(v_level, 0);
  if v_level >= 10 then raise exception 'L''abilità è già al livello massimo (10).' using errcode = 'P0001'; end if;
  v_cost := 10 * (v_level + 1);
  if v_px < v_cost then raise exception 'Servono % PX, ne hai %.', v_cost, v_px using errcode = 'P0001'; end if;

  update public.characters c set px = c.px - v_cost where c.id = p_character;
  insert into public.character_skills (character_id, skill_id, level) values (p_character, p_skill, v_level + 1)
    on conflict (character_id, skill_id) do update set level = excluded.level;
  return query select v_level + 1, v_px - v_cost;
end;
$$;
revoke execute on function public.spend_px(uuid, uuid) from public, anon;
grant execute on function public.spend_px(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- L'admin cambia PX, Risorse e Onore
-- ---------------------------------------------------------------------
create or replace function public.admin_set_progress(p_character uuid, p_px int, p_resources int, p_honor int)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono farlo.' using errcode = '42501'; end if;
  if p_px < 0 or p_resources < 0 or p_honor not between 0 and 10 then
    raise exception 'Valori non validi (PX e Risorse da 0 in su, Onore da 0 a 10).' using errcode = 'P0001';
  end if;
  update public.characters set px = p_px, resources = p_resources, honor = p_honor where id = p_character;
end;
$$;
revoke execute on function public.admin_set_progress(uuid, int, int, int) from public, anon;
grant execute on function public.admin_set_progress(uuid, int, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- Gestisci: le caratteristiche ora sono le 6 statistiche, da 1 a 10
-- ---------------------------------------------------------------------
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
  if p_attributes is null or jsonb_typeof(p_attributes) <> 'object' then raise exception 'Statistiche non valide.' using errcode = 'P0001'; end if;
  foreach k in array array['int', 'ref', 'body', 'emp', 'pre', 'will'] loop
    if jsonb_typeof(p_attributes -> k) is distinct from 'number' or (p_attributes ->> k)::int not between 1 and 10 then
      raise exception 'Ogni statistica deve essere un numero tra 1 e 10.' using errcode = 'P0001';
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
      set name = v_name, sex = p_sex, age = p_age,
          attributes = jsonb_build_object(
            'int', (p_attributes->>'int')::int, 'ref', (p_attributes->>'ref')::int, 'body', (p_attributes->>'body')::int,
            'emp', (p_attributes->>'emp')::int, 'pre', (p_attributes->>'pre')::int, 'will', (p_attributes->>'will')::int),
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
