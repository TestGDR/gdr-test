-- =====================================================================
-- 0025 - Draghi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni casata ha draghi e uova. Un drago cresce per fasi (neonato,
-- cucciolo, adolescente, sub adulto, adulto) spendendo i PX del suo
-- cavaliere; a ogni nuova fase riceve 5 punti da distribuire.
-- Alla nascita (o alla generazione) vengono estratti a caso: punti di
-- caratteristiche e abilita', 2 pregi e 1 difetto (mai opposti tra loro),
-- colore (uno o due), sesso e carattere.
-- Un drago ha al massimo un cavaliere e un cavaliere un solo drago.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PX dei personaggi (li assegna lo staff; li spende il cavaliere)
-- ---------------------------------------------------------------------
alter table public.characters add column px int not null default 0 check (px >= 0);

create table public.px_log (
  id            bigint generated always as identity primary key,
  character_id  uuid not null references public.characters(id) on delete cascade,
  amount        int  not null,
  reason        text not null default '',
  by_user       uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index px_log_character_idx on public.px_log(character_id, created_at desc);

-- ---------------------------------------------------------------------
-- Fasi di crescita: PX per passare alla fase dopo e mantenimento mensile
-- ---------------------------------------------------------------------
create table public.dragon_stages (
  stage           text primary key,
  label           text not null,
  sort_order      int  not null unique,
  px_to_next      int  check (px_to_next is null or px_to_next >= 0), -- null = ultima fase
  monthly_upkeep  int  not null default 0 check (monthly_upkeep >= 0)
);
insert into public.dragon_stages (stage, label, sort_order, px_to_next, monthly_upkeep) values
  ('neonato',     'Neonato',      0,  50,  1),
  ('cucciolo',    'Cucciolo',     1, 100,  2),
  ('adolescente', 'Adolescente',  2, 200,  4),
  ('subadulto',   'Sub adulto',   3, 400,  7),
  ('adulto',      'Adulto',       4, null, 10);

-- ---------------------------------------------------------------------
-- Pregi e difetti: ogni pregio ha il suo opposto
-- ---------------------------------------------------------------------
create table public.dragon_trait_pairs (
  pregio   text primary key,
  difetto  text not null unique
);
insert into public.dragon_trait_pairs (pregio, difetto) values
  ('adattabilità climatica', 'poco adattabile'),
  ('combattivo',             'pacifista'),
  ('coriaceo',               'fragile'),
  ('docile',                 'aggressivo'),
  ('istinto di guardia',     'pigro'),
  ('maestoso',               'striminzito'),
  ('nomade',                 'territoriale'),
  ('poco affamato',          'molto affamato'),
  ('predatore silenzioso',   'predatore rumoroso'),
  ('rigenerazione rapida',   'rigenerazione lenta'),
  ('soffio modulabile',      'soffio incontrollato'),
  ('vista acuta',            'miope'),
  ('volontà di ferro',       'volontà labile');

-- ---------------------------------------------------------------------
-- Caratteri (uno a caso per ogni drago, diverso dagli altri finche' possibile)
-- ---------------------------------------------------------------------
create table public.dragon_temperaments (
  id    int generated always as identity primary key,
  text  text not null unique
);
insert into public.dragon_temperaments (text) values
  ('Orgoglioso e permaloso: non dimentica un torto e pretende rispetto prima di concedere fiducia.'),
  ('Curioso come un gatto: infila il muso ovunque e si distrae con tutto ciò che luccica.'),
  ('Protettivo fino all''ossessione: considera il suo cavaliere un cucciolo da difendere.'),
  ('Solitario e taciturno: ama le alture e tollera a fatica la compagnia di altri draghi.'),
  ('Giocherellone e chiassoso: trasforma ogni volo in una gara e ogni pasto in uno spettacolo.'),
  ('Paziente e calcolatore: osserva a lungo prima di agire, e quando colpisce non sbaglia.'),
  ('Vanitoso: ama essere ammirato, si mette in posa e soffre se viene ignorato.'),
  ('Collerico: le sue ire sono improvvise e violente, ma si spengono in fretta.'),
  ('Timoroso dei luoghi chiusi: diventa nervoso nelle grotte e nei cortili stretti.'),
  ('Affettuoso e appiccicoso: cerca continuamente il contatto e il calore del suo cavaliere.'),
  ('Diffidente verso gli estranei: ringhia a chiunque si avvicini senza essere presentato.'),
  ('Avido: accumula ossa, monete e oggetti brillanti in un nascondiglio segreto.'),
  ('Malinconico: passa ore a fissare il mare o il cielo, come in attesa di qualcosa.'),
  ('Testardo come un mulo: obbedisce solo quando l''ordine coincide con ciò che voleva già fare.'),
  ('Coraggioso fino all''imprudenza: si lancia contro qualsiasi minaccia senza valutarla.'),
  ('Astuto e dispettoso: ama fare scherzi a stallieri e guardiani.'),
  ('Regale e distaccato: si comporta come se tutti, uomini e draghi, gli dovessero obbedienza.'),
  ('Ansioso: si agita per i tuoni, le campane e le folle rumorose.'),
  ('Leale come un segugio: segue il suo cavaliere ovunque, anche quando non dovrebbe.'),
  ('Competitivo: non sopporta che un altro drago voli più alto o più veloce di lui.'),
  ('Pigro e sornione: dorme al sole appena può e va convinto con la promessa di cibo.'),
  ('Selvatico: non si è mai del tutto abituato alle catene e alle stalle dei draghi.'),
  ('Gentile con i bambini e con i deboli, spietato con chi li minaccia.'),
  ('Rancoroso con gli altri draghi della casata: c''è una vecchia rivalità mai risolta.'),
  ('Superstizioso: evita certi luoghi e reagisce in modo strano alle canzoni dei septon.'),
  ('Instancabile esploratore: vola lontano da solo e torna con prede di terre sconosciute.'),
  ('Teatrale: ruggisce e sbuffa fumo per impressionare, anche quando non serve.'),
  ('Silenzioso e misterioso: comunica con lo sguardo, e sembra capire più di quanto dovrebbe.'),
  ('Goloso: ha un debole per la carne di montone e farebbe qualsiasi cosa per averne.'),
  ('Fiero della sua stirpe: si irrigidisce davanti ai draghi selvatici o di altre casate.');

-- ---------------------------------------------------------------------
-- Draghi e uova
-- ---------------------------------------------------------------------
create table public.dragons (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid references public.houses(id) on delete set null,
  status          text not null default 'uovo' check (status in ('uovo', 'drago')),
  name            text not null default '' check (char_length(name) <= 60),
  stage           text references public.dragon_stages(stage),
  sex             text check (sex in ('maschio', 'femmina')),
  color1          text,
  color2          text,
  pregi           text[] not null default '{}',
  difetti         text[] not null default '{}',
  temperament     text not null default '',
  stats           jsonb not null default '{}', -- vigore, destrezza, intelletto, percezione
  skills          jsonb not null default '{}', -- volare, attacco_fisico, attacco_infuocato, schivare, fermezza, sensi
  unspent_points  int not null default 0 check (unspent_points >= 0),
  image_url       text,
  rider_id        uuid unique references public.characters(id) on delete set null,
  hatched_at      timestamptz,
  created_at      timestamptz not null default now(),
  check (status = 'uovo' or stage is not null)
);
create index dragons_house_idx on public.dragons(house_id);

alter table public.px_log              enable row level security;
alter table public.dragon_stages       enable row level security;
alter table public.dragon_trait_pairs  enable row level security;
alter table public.dragon_temperaments enable row level security;
alter table public.dragons             enable row level security;

create policy "px visibili al proprietario e allo staff" on public.px_log for select to authenticated
  using (
    exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    or public.has_permission('draghi.gestire')
  );
create policy "fasi visibili"     on public.dragon_stages       for select to authenticated using (true);
create policy "fasi con permesso" on public.dragon_stages       for update to authenticated
  using (public.has_permission('draghi.gestire')) with check (public.has_permission('draghi.gestire'));
create policy "tratti visibili"   on public.dragon_trait_pairs  for select to authenticated using (true);
create policy "caratteri visibili" on public.dragon_temperaments for select to authenticated using (true);

create policy "draghi visibili" on public.dragons for select to authenticated using (true);
create policy "draghi: staff modifica" on public.dragons for update to authenticated
  using (public.has_permission('draghi.gestire')) with check (public.has_permission('draghi.gestire'));
-- il cavaliere cambia nome e immagine (il controllo sulle colonne lo fa il trigger)
create policy "draghi: il cavaliere modifica" on public.dragons for update to authenticated
  using (exists (select 1 from public.characters c where c.id = rider_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.characters c where c.id = rider_id and c.owner_id = auth.uid()));
create policy "draghi: staff elimina" on public.dragons for delete to authenticated
  using (public.has_permission('draghi.gestire'));

grant select on public.px_log, public.dragon_stages, public.dragon_trait_pairs, public.dragon_temperaments, public.dragons to authenticated;
grant update (px_to_next, monthly_upkeep) on public.dragon_stages to authenticated;
grant update (name, image_url, house_id, stage, sex, color1, color2, pregi, difetti, temperament, stats, skills, unspent_points, rider_id)
  on public.dragons to authenticated;
grant delete on public.dragons to authenticated;
grant select, insert, update, delete on public.px_log, public.dragon_stages, public.dragon_trait_pairs, public.dragon_temperaments, public.dragons to service_role;

-- ---------------------------------------------------------------------
-- Controlli su ogni modifica di un drago
-- ---------------------------------------------------------------------
create or replace function public.dragons_check()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  k text;
begin
  -- Chi non e' staff (e non passa dalle funzioni qui sotto) cambia solo nome e immagine
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.dragon_internal', true), '') <> '1'
     and not public.has_permission('draghi.gestire')
     and (new.house_id, new.status, new.stage, new.sex, new.color1, new.color2, new.pregi, new.difetti,
          new.temperament, new.stats, new.skills, new.unspent_points, new.rider_id)
         is distinct from
         (old.house_id, old.status, old.stage, old.sex, old.color1, old.color2, old.pregi, old.difetti,
          old.temperament, old.stats, old.skills, old.unspent_points, old.rider_id) then
    raise exception 'Puoi cambiare solo il nome e l''immagine del drago.' using errcode = '42501';
  end if;

  -- Pregi e difetti validi e mai opposti
  foreach k in array new.pregi loop
    if not exists (select 1 from public.dragon_trait_pairs where pregio = k) then
      raise exception 'Pregio sconosciuto: %', k using errcode = 'P0001';
    end if;
    if exists (select 1 from public.dragon_trait_pairs where pregio = k and difetto = any (new.difetti)) then
      raise exception 'Il pregio "%" e il suo opposto non possono convivere.', k using errcode = 'P0001';
    end if;
  end loop;
  foreach k in array new.difetti loop
    if not exists (select 1 from public.dragon_trait_pairs where difetto = k) then
      raise exception 'Difetto sconosciuto: %', k using errcode = 'P0001';
    end if;
  end loop;

  -- Il cavaliere non puo' gia' cavalcare un altro drago (lo garantisce anche l'indice unico)
  return new;
end;
$$;

create trigger dragons_check before insert or update on public.dragons
  for each row execute function public.dragons_check();

-- ---------------------------------------------------------------------
-- Generazione casuale (uso interno)
-- ---------------------------------------------------------------------
create or replace function public.dragon_random_temperament()
returns text
language sql
volatile
security definer set search_path = ''
as $$
  select coalesce(
    (select t.text from public.dragon_temperaments t
     where not exists (select 1 from public.dragons d where d.temperament = t.text)
     order by random() limit 1),
    (select t.text from public.dragon_temperaments t order by random() limit 1)
  );
$$;

create or replace function public.dragon_fill_random(p_id uuid, p_stage text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  palette text[] := array['Oro', 'Bianco', 'Blu', 'Nero', 'Rosso', 'Bronzo', 'Verde', 'Arancio'];
  st int[] := array[1, 1, 1, 1];       -- vigore, destrezza, intelletto, percezione
  sk int[] := array[0, 0, 0, 0, 0, 0]; -- volare, attacco fisico, attacco infuocato, schivare, fermezza, sensi
  idx int;
  k int;
  i int;
  c1 text;
  c2 text;
  pr text[] := '{}';
  df text[] := '{}';
  rec record;
begin
  select sort_order into idx from public.dragon_stages where stage = p_stage;
  if idx is null then
    raise exception 'Fase sconosciuta: %', p_stage using errcode = 'P0001';
  end if;

  -- punti di base: 6 sulle caratteristiche e 6 sulle abilita'
  for i in 1..6 loop
    k := 1 + floor(random() * 4)::int;
    if st[k] < 10 then st[k] := st[k] + 1; end if;
    k := 1 + floor(random() * 6)::int;
    if sk[k] < 10 then sk[k] := sk[k] + 1; end if;
  end loop;
  -- un drago generato gia' cresciuto ha anche i 5 punti di ogni fase superata
  for i in 1..(5 * idx) loop
    k := floor(random() * 10)::int;
    if k < 4 then
      if st[k + 1] < 10 then st[k + 1] := st[k + 1] + 1; end if;
    else
      if sk[k - 3] < 10 then sk[k - 3] := sk[k - 3] + 1; end if;
    end if;
  end loop;

  -- 2 pregi e 1 difetto da tre coppie diverse: mai un pregio col suo opposto
  i := 0;
  for rec in select * from public.dragon_trait_pairs order by random() limit 3 loop
    i := i + 1;
    if i <= 2 then pr := pr || rec.pregio; else df := df || rec.difetto; end if;
  end loop;

  -- colore: uno solo o due diversi
  c1 := palette[1 + floor(random() * 8)::int];
  if random() < 0.5 then
    loop
      c2 := palette[1 + floor(random() * 8)::int];
      exit when c2 <> c1;
    end loop;
  end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set
    status = 'drago',
    stage = p_stage,
    sex = case when random() < 0.5 then 'maschio' else 'femmina' end,
    color1 = c1,
    color2 = c2,
    pregi = pr,
    difetti = df,
    temperament = public.dragon_random_temperament(),
    stats = jsonb_build_object('vigore', st[1], 'destrezza', st[2], 'intelletto', st[3], 'percezione', st[4]),
    skills = jsonb_build_object('volare', sk[1], 'attacco_fisico', sk[2], 'attacco_infuocato', sk[3],
                                'schivare', sk[4], 'fermezza', sk[5], 'sensi', sk[6]),
    unspent_points = 0,
    hatched_at = coalesce(hatched_at, now())
  where id = p_id;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Staff: nuovi draghi e uova, dotazione iniziale, PX
-- ---------------------------------------------------------------------
create or replace function public.staff_add_dragon(p_house uuid, p_stage text default null)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.has_permission('draghi.gestire') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  insert into public.dragons (house_id, status) values (p_house, 'uovo') returning id into new_id;
  if p_stage is not null then
    perform public.dragon_fill_random(new_id, p_stage);
  end if;
  return new_id;
end;
$$;

create or replace function public.staff_give_starter(p_house uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('draghi.gestire') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  perform public.staff_add_dragon(p_house, 'adolescente');
  perform public.staff_add_dragon(p_house, null);
  perform public.staff_add_dragon(p_house, null);
end;
$$;

create or replace function public.staff_grant_px(p_character uuid, p_amount int, p_reason text)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  balance int;
begin
  if not public.has_permission('draghi.gestire') then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'Indica quanti PX dare (o togliere).' using errcode = 'P0001';
  end if;
  update public.characters set px = px + p_amount where id = p_character and px + p_amount >= 0
  returning px into balance;
  if not found then
    raise exception 'Il personaggio non ha abbastanza PX da togliere.' using errcode = 'P0001';
  end if;
  insert into public.px_log (character_id, amount, reason) values (p_character, p_amount, left(coalesce(p_reason, ''), 200));
  return balance;
end;
$$;

-- ---------------------------------------------------------------------
-- Giocatori: schiudere un uovo, far crescere il drago, distribuire i punti
-- ---------------------------------------------------------------------
-- Un membro (attivo) della casata schiude un uovo, gratis, quando vuole
create or replace function public.hatch_egg(p_dragon uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'uovo' then
    raise exception 'Questo non è un uovo.' using errcode = 'P0001';
  end if;
  if not public.has_permission('draghi.gestire') and not exists (
    select 1 from public.characters c
    where c.owner_id = auth.uid() and c.status = 'attivo' and c.house_id = d.house_id
  ) then
    raise exception 'Solo un membro della casata può schiudere le sue uova.' using errcode = '42501';
  end if;
  perform public.dragon_fill_random(p_dragon, 'neonato');
end;
$$;

-- Il cavaliere spende i suoi PX: il drago passa alla fase dopo e riceve 5 punti
create or replace function public.dragon_grow(p_dragon uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
  cur public.dragon_stages;
  nxt public.dragon_stages;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'drago' then
    raise exception 'Drago non trovato.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.characters c where c.id = d.rider_id and c.owner_id = auth.uid()) then
    raise exception 'Solo il cavaliere può far crescere il suo drago.' using errcode = '42501';
  end if;
  select * into cur from public.dragon_stages where stage = d.stage;
  select * into nxt from public.dragon_stages where sort_order = cur.sort_order + 1;
  if nxt.stage is null or cur.px_to_next is null then
    raise exception 'Il drago è già adulto.' using errcode = 'P0001';
  end if;

  update public.characters set px = px - cur.px_to_next
  where id = d.rider_id and px >= cur.px_to_next;
  if not found then
    raise exception 'Servono % PX.', cur.px_to_next using errcode = 'P0001';
  end if;
  insert into public.px_log (character_id, amount, reason)
  values (d.rider_id, -cur.px_to_next,
          'Crescita di ' || coalesce(nullif(d.name, ''), 'drago') || ': ' || cur.label || ' → ' || nxt.label);

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set stage = nxt.stage, unspent_points = unspent_points + 5 where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
  return nxt.stage;
end;
$$;

-- Distribuisce i punti liberi: p_alloc = {"vigore": 2, "volare": 3, ...}
create or replace function public.dragon_assign_points(p_dragon uuid, p_alloc jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.dragons;
  stat_keys text[] := array['vigore', 'destrezza', 'intelletto', 'percezione'];
  skill_keys text[] := array['volare', 'attacco_fisico', 'attacco_infuocato', 'schivare', 'fermezza', 'sensi'];
  k text;
  v int;
  total int := 0;
  st jsonb;
  sk jsonb;
begin
  select * into d from public.dragons where id = p_dragon for update;
  if not found or d.status <> 'drago' then
    raise exception 'Drago non trovato.' using errcode = 'P0001';
  end if;
  if not public.has_permission('draghi.gestire')
     and not exists (select 1 from public.characters c where c.id = d.rider_id and c.owner_id = auth.uid()) then
    raise exception 'Solo il cavaliere può distribuire i punti del suo drago.' using errcode = '42501';
  end if;

  st := d.stats;
  sk := d.skills;
  for k, v in select key, value::int from jsonb_each_text(p_alloc) loop
    if v < 0 then
      raise exception 'Valore non valido.' using errcode = 'P0001';
    end if;
    total := total + v;
    if k = any (stat_keys) then
      if coalesce((st ->> k)::int, 0) + v > 10 then
        raise exception 'Una caratteristica non può superare 10.' using errcode = 'P0001';
      end if;
      st := jsonb_set(st, array[k], to_jsonb(coalesce((st ->> k)::int, 0) + v));
    elsif k = any (skill_keys) then
      if coalesce((sk ->> k)::int, 0) + v > 10 then
        raise exception 'Un''abilità non può superare 10.' using errcode = 'P0001';
      end if;
      sk := jsonb_set(sk, array[k], to_jsonb(coalesce((sk ->> k)::int, 0) + v));
    else
      raise exception 'Voce sconosciuta: %', k using errcode = 'P0001';
    end if;
  end loop;
  if total = 0 then
    return;
  end if;
  if total > d.unspent_points then
    raise exception 'Hai solo % punti da distribuire.', d.unspent_points using errcode = 'P0001';
  end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set stats = st, skills = sk, unspent_points = unspent_points - total where id = p_dragon;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

revoke execute on function public.dragon_fill_random(uuid, text) from public, anon, authenticated;
revoke execute on function public.dragon_random_temperament() from public, anon;
revoke execute on function public.staff_add_dragon(uuid, text) from public, anon;
revoke execute on function public.staff_give_starter(uuid) from public, anon;
revoke execute on function public.staff_grant_px(uuid, int, text) from public, anon;
revoke execute on function public.hatch_egg(uuid) from public, anon;
revoke execute on function public.dragon_grow(uuid) from public, anon;
revoke execute on function public.dragon_assign_points(uuid, jsonb) from public, anon;
grant execute on function public.dragon_random_temperament() to authenticated;
grant execute on function public.staff_add_dragon(uuid, text) to authenticated;
grant execute on function public.staff_give_starter(uuid) to authenticated;
grant execute on function public.staff_grant_px(uuid, int, text) to authenticated;
grant execute on function public.hatch_egg(uuid) to authenticated;
grant execute on function public.dragon_grow(uuid) to authenticated;
grant execute on function public.dragon_assign_points(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Immagini dei draghi (caricamenti solo dal server)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('draghi', 'draghi', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
