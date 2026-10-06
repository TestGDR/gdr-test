-- =====================================================================
-- 0076 - Forum ON e OFF
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Categorie (a sinistra) con dentro le sezioni; nelle sezioni le
--   discussioni, nelle discussioni gli interventi (testo con l'editor).
-- - Sezioni per tutti, solo per lo staff, oppure solo per una casata.
-- - Ognuno modifica i propri interventi. Chi ha "forum.moderare" (admin e
--   moderatori) modifica ed elimina quelli di chiunque, chiude le
--   discussioni, le rende importanti e le fissa in alto.
-- - "forum.sezioni": creare, modificare ed eliminare categorie e sezioni.
-- - Letti / non letti per utente, per il "Leggi tutto".
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permessi
-- ---------------------------------------------------------------------
update public.staff_roles set permissions = array_append(permissions, 'forum.moderare')
  where 'chat.moderare' = any(permissions) and not ('forum.moderare' = any(permissions));
update public.staff_roles set permissions = array_append(permissions, 'forum.sezioni')
  where 'mondo.gestire' = any(permissions) and not ('forum.sezioni' = any(permissions));

-- ---------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------
create table if not exists public.forum_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  sort_order  int not null default 0
);

create table if not exists public.forum_sections (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.forum_categories(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 300),
  visibility   text not null default 'tutti' check (visibility in ('tutti', 'staff', 'casata')),
  house_id     uuid references public.houses(id) on delete set null, -- per visibility = 'casata'
  sort_order   int not null default 0
);

create table if not exists public.forum_threads (
  id                   uuid primary key default gen_random_uuid(),
  section_id           uuid not null references public.forum_sections(id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 120),
  author_id            uuid references auth.users(id) on delete set null,
  author_character_id  uuid references public.characters(id) on delete set null,
  author_name          text not null default '',
  pinned               boolean not null default false,  -- fissata in alto
  important            boolean not null default false,  -- evidenziata
  locked               boolean not null default false,  -- chiusa: niente risposte
  created_at           timestamptz not null default now(),
  last_post_at         timestamptz not null default now()
);
create index if not exists forum_threads_section_idx on public.forum_threads (section_id, last_post_at desc);
create index if not exists forum_threads_last_idx on public.forum_threads (last_post_at desc);

create table if not exists public.forum_posts (
  id                   uuid primary key default gen_random_uuid(),
  thread_id            uuid not null references public.forum_threads(id) on delete cascade,
  author_id            uuid references auth.users(id) on delete set null,
  author_character_id  uuid references public.characters(id) on delete set null,
  author_name          text not null default '',
  body                 text not null check (char_length(body) between 1 and 60000),
  created_at           timestamptz not null default now(),
  edited_at            timestamptz,
  edited_by_name       text
);
create index if not exists forum_posts_thread_idx on public.forum_posts (thread_id, created_at);

create table if not exists public.forum_reads (
  user_id       uuid not null references auth.users(id) on delete cascade,
  thread_id     uuid not null references public.forum_threads(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (user_id, thread_id)
);

-- Da quando un utente "legge" il forum: le discussioni piu' vecchie della
-- sua prima visita non risultano nuove
create table if not exists public.forum_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  first_seen  timestamptz not null default now()
);

alter table public.forum_categories enable row level security;
alter table public.forum_sections enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_reads enable row level security;
alter table public.forum_users enable row level security;

-- ---------------------------------------------------------------------
-- Chi vede una sezione
-- ---------------------------------------------------------------------
create or replace function public.forum_can_see(p_section uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.forum_sections s
    where s.id = p_section and (
      s.visibility = 'tutti'
      or public.has_permission('forum.moderare') or public.has_permission('forum.sezioni')
      or (s.visibility = 'staff' and public.is_staff())
      or (s.visibility = 'casata' and exists (
            select 1 from public.characters c where c.owner_id = auth.uid() and c.house_id = s.house_id))
    )
  );
$$;

create or replace function public.forum_thread_section(p_thread uuid)
returns uuid
language sql stable
security definer set search_path = ''
as $$ select section_id from public.forum_threads where id = p_thread; $$;

-- ---------------------------------------------------------------------
-- Regole di accesso
-- ---------------------------------------------------------------------
drop policy if exists "categorie forum visibili" on public.forum_categories;
create policy "categorie forum visibili" on public.forum_categories for select to authenticated using (true);
drop policy if exists "categorie forum gestite" on public.forum_categories;
create policy "categorie forum gestite" on public.forum_categories for all to authenticated
  using (public.has_permission('forum.sezioni')) with check (public.has_permission('forum.sezioni'));

drop policy if exists "sezioni forum visibili" on public.forum_sections;
create policy "sezioni forum visibili" on public.forum_sections for select to authenticated using (public.forum_can_see(id));
drop policy if exists "sezioni forum gestite" on public.forum_sections;
create policy "sezioni forum gestite" on public.forum_sections for all to authenticated
  using (public.has_permission('forum.sezioni')) with check (public.has_permission('forum.sezioni'));

drop policy if exists "discussioni visibili" on public.forum_threads;
create policy "discussioni visibili" on public.forum_threads for select to authenticated using (public.forum_can_see(section_id));
-- (aprire, fissare, chiudere ed eliminare passano dalle funzioni qui sotto)

drop policy if exists "interventi visibili" on public.forum_posts;
create policy "interventi visibili" on public.forum_posts for select to authenticated
  using (public.forum_can_see(public.forum_thread_section(thread_id)));

drop policy if exists "i miei letti" on public.forum_reads;
create policy "i miei letti" on public.forum_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "la mia prima visita" on public.forum_users;
create policy "la mia prima visita" on public.forum_users for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.forum_categories, public.forum_sections, public.forum_threads, public.forum_posts to authenticated;
grant insert, update, delete on public.forum_categories, public.forum_sections to authenticated;
grant select, insert, update, delete on public.forum_reads, public.forum_users to authenticated;
grant select, insert, update, delete on public.forum_categories, public.forum_sections, public.forum_threads,
  public.forum_posts, public.forum_reads, public.forum_users to service_role;

-- ---------------------------------------------------------------------
-- Chi scrive: il personaggio principale dell'account (se non c'e', il nome utente)
-- ---------------------------------------------------------------------
create or replace function public.forum_author(out v_character uuid, out v_name text)
language plpgsql stable
security definer set search_path = ''
as $$
begin
  select c.id, c.name into v_character, v_name
    from public.characters c where c.owner_id = auth.uid() order by c.created_at limit 1;
  if v_name is null then
    select username into v_name from public.profiles where id = auth.uid();
  end if;
end;
$$;

-- Nuova discussione (con il primo intervento)
create or replace function public.forum_new_thread(p_section uuid, p_title text, p_body text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  a record;
  t uuid;
begin
  if auth.uid() is null or not public.forum_can_see(p_section) then raise exception 'Sezione non trovata'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Titolo non valido'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 60000 then raise exception 'Testo non valido'; end if;
  select * into a from public.forum_author();
  insert into public.forum_threads (section_id, title, author_id, author_character_id, author_name)
    values (p_section, trim(p_title), auth.uid(), a.v_character, coalesce(a.v_name, '?'))
    returning id into t;
  insert into public.forum_posts (thread_id, author_id, author_character_id, author_name, body)
    values (t, auth.uid(), a.v_character, coalesce(a.v_name, '?'), trim(p_body));
  insert into public.forum_reads (user_id, thread_id, last_read_at) values (auth.uid(), t, now())
    on conflict (user_id, thread_id) do update set last_read_at = now();
  return t;
end;
$$;

-- Risposta (le discussioni chiuse accettano solo i moderatori)
create or replace function public.forum_reply(p_thread uuid, p_body text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  a record;
  th public.forum_threads;
  p uuid;
begin
  select * into th from public.forum_threads where id = p_thread;
  if th.id is null or auth.uid() is null or not public.forum_can_see(th.section_id) then raise exception 'Discussione non trovata'; end if;
  if th.locked and not public.has_permission('forum.moderare') then raise exception 'La discussione è chiusa'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 60000 then raise exception 'Testo non valido'; end if;
  select * into a from public.forum_author();
  insert into public.forum_posts (thread_id, author_id, author_character_id, author_name, body)
    values (p_thread, auth.uid(), a.v_character, coalesce(a.v_name, '?'), trim(p_body))
    returning id into p;
  update public.forum_threads set last_post_at = now() where id = p_thread;
  insert into public.forum_reads (user_id, thread_id, last_read_at) values (auth.uid(), p_thread, now())
    on conflict (user_id, thread_id) do update set last_read_at = now();
  return p;
end;
$$;

-- Modifica di un intervento: il proprio, oppure di chiunque per i moderatori
create or replace function public.forum_edit_post(p_post uuid, p_body text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  po public.forum_posts;
  a record;
begin
  select * into po from public.forum_posts where id = p_post;
  if po.id is null then raise exception 'Intervento non trovato'; end if;
  if po.author_id is distinct from auth.uid() and not public.has_permission('forum.moderare') then
    raise exception 'Permesso negato';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 60000 then raise exception 'Testo non valido'; end if;
  select * into a from public.forum_author();
  update public.forum_posts set body = trim(p_body), edited_at = now(), edited_by_name = coalesce(a.v_name, '?')
    where id = p_post;
end;
$$;

-- Moderazione: eliminare un intervento (il primo elimina la discussione)
create or replace function public.forum_delete_post(p_post uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  po public.forum_posts;
  first_id uuid;
begin
  if not public.has_permission('forum.moderare') then raise exception 'Permesso negato'; end if;
  select * into po from public.forum_posts where id = p_post;
  if po.id is null then return; end if;
  select id into first_id from public.forum_posts where thread_id = po.thread_id order by created_at limit 1;
  if first_id = po.id then
    delete from public.forum_threads where id = po.thread_id;
  else
    delete from public.forum_posts where id = p_post;
    update public.forum_threads set last_post_at = coalesce(
      (select max(created_at) from public.forum_posts where thread_id = po.thread_id), created_at)
      where id = po.thread_id;
  end if;
end;
$$;

-- Moderazione: titolo, fissata, importante, chiusa, eliminata
create or replace function public.forum_moderate_thread(p_thread uuid, p_action text, p_value text default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('forum.moderare') then raise exception 'Permesso negato'; end if;
  case p_action
    when 'fissa' then update public.forum_threads set pinned = p_value::boolean where id = p_thread;
    when 'importante' then update public.forum_threads set important = p_value::boolean where id = p_thread;
    when 'chiudi' then update public.forum_threads set locked = p_value::boolean where id = p_thread;
    when 'titolo' then
      if char_length(trim(coalesce(p_value, ''))) not between 1 and 120 then raise exception 'Titolo non valido'; end if;
      update public.forum_threads set title = trim(p_value) where id = p_thread;
    when 'sposta' then update public.forum_threads set section_id = p_value::uuid where id = p_thread;
    when 'elimina' then delete from public.forum_threads where id = p_thread;
    else raise exception 'Azione non valida';
  end case;
end;
$$;

-- ---------------------------------------------------------------------
-- Letti e non letti
-- ---------------------------------------------------------------------
-- Discussioni con interventi nuovi per chi guarda (con da quando)
create or replace function public.forum_unread()
returns table (thread_id uuid, section_id uuid, since timestamptz)
language sql stable
security definer set search_path = ''
as $$
  select t.id, t.section_id, coalesce(r.last_read_at, u.first_seen, '-infinity'::timestamptz)
  from public.forum_threads t
  left join public.forum_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  left join public.forum_users u on u.user_id = auth.uid()
  where public.forum_can_see(t.section_id)
    and t.last_post_at > coalesce(r.last_read_at, u.first_seen, '-infinity'::timestamptz)
    and exists (select 1 from public.forum_posts p
                where p.thread_id = t.id and p.author_id is distinct from auth.uid()
                  and p.created_at > coalesce(r.last_read_at, u.first_seen, '-infinity'::timestamptz));
$$;

-- Segna come letta una discussione (o tutte)
create or replace function public.forum_mark_read(p_thread uuid default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  if p_thread is null then
    insert into public.forum_reads (user_id, thread_id, last_read_at)
      select auth.uid(), t.id, now() from public.forum_threads t where public.forum_can_see(t.section_id)
      on conflict (user_id, thread_id) do update set last_read_at = now();
  else
    insert into public.forum_reads (user_id, thread_id, last_read_at) values (auth.uid(), p_thread, now())
      on conflict (user_id, thread_id) do update set last_read_at = now();
  end if;
end;
$$;

-- Prima visita: da qui in poi le discussioni nuove contano come non lette
create or replace function public.forum_touch()
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.forum_users (user_id) values (auth.uid()) on conflict (user_id) do nothing;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'forum_can_see(uuid)', 'forum_thread_section(uuid)', 'forum_author()', 'forum_new_thread(uuid, text, text)',
    'forum_reply(uuid, text)', 'forum_edit_post(uuid, text)', 'forum_delete_post(uuid)',
    'forum_moderate_thread(uuid, text, text)', 'forum_unread()', 'forum_mark_read(uuid)', 'forum_touch()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Categorie e sezioni di partenza (come nell'esempio; si cambiano dal forum)
-- ---------------------------------------------------------------------
do $$
declare c uuid;
begin
  if exists (select 1 from public.forum_categories) then return; end if;
  insert into public.forum_categories (name, sort_order) values ('Voci di Westeros', 1) returning id into c;
  insert into public.forum_sections (category_id, name, description, sort_order) values
    (c, 'Voci e dicerie', 'Quello che si mormora nei porti, nelle taverne e a corte.', 1);
  insert into public.forum_categories (name, sort_order) values ('Resoconti Quest e Trame', 2) returning id into c;
  insert into public.forum_sections (category_id, name, description, sort_order) values
    (c, 'Resoconti Quest', 'Il racconto delle quest giocate.', 1),
    (c, 'Trame e Riassunti', 'Le trame in corso e i loro riassunti.', 2);
  insert into public.forum_categories (name, sort_order) values ('Annunci staff', 3) returning id into c;
  insert into public.forum_sections (category_id, name, description, sort_order) values
    (c, 'Comunicazioni della Gestione', 'Annunci e regole dallo staff.', 1);
  insert into public.forum_categories (name, sort_order) values ('Off game', 4) returning id into c;
  insert into public.forum_sections (category_id, name, description, sort_order) values
    (c, 'Organizzazione Giocate', 'Per mettersi d''accordo sulle giocate.', 1),
    (c, 'Chiacchiere', 'Tutto quello che non riguarda il gioco.', 2);
  insert into public.forum_categories (name, sort_order) values ('Forum casate', 5) returning id into c;
  insert into public.forum_categories (name, sort_order) values ('Area master', 6) returning id into c;
  insert into public.forum_sections (category_id, name, description, visibility, sort_order) values
    (c, 'Sala dei master', 'Organizzazione delle quest e delle trame.', 'staff', 1);
  insert into public.forum_categories (name, sort_order) values ('Gestione', 7) returning id into c;
  insert into public.forum_sections (category_id, name, description, visibility, sort_order) values
    (c, 'Sala dello staff', 'Discussioni interne dello staff.', 'staff', 1);
end $$;

-- Interventi nuovi in tempo reale (l'icona del forum si accende)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'forum_posts') then
    alter publication supabase_realtime add table public.forum_posts;
  end if;
end $$;
