-- =====================================================================
-- 0166 - Forum: post segnalati a tutta l'utenza
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Chi ha il permesso "forum.segnalare" (admin sempre) segnala un post:
--   a tutti appare una finestra "Post segnalato" con il pulsante Leggi.
-- - Ognuno la vede una volta: chiusa o letta, non torna piu'.
-- - Si vedono solo i post delle sezioni che uno puo' leggere, segnalati
--   negli ultimi 30 giorni.
-- Si puo' eseguire anche piu' volte.
-- =====================================================================

alter table public.forum_posts add column if not exists highlighted_at timestamptz;
alter table public.forum_posts add column if not exists highlighted_by text;
create index if not exists forum_posts_highlighted_idx on public.forum_posts (highlighted_at)
  where highlighted_at is not null;

-- chi ha gia' visto (letto o chiuso) la segnalazione
create table if not exists public.forum_highlight_seen (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  post_id  uuid not null references public.forum_posts(id) on delete cascade,
  seen_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.forum_highlight_seen enable row level security;
drop policy if exists "le mie segnalazioni viste" on public.forum_highlight_seen;
create policy "le mie segnalazioni viste" on public.forum_highlight_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.forum_highlight_seen to authenticated;

-- Segnala / togli la segnalazione
create or replace function public.forum_highlight_post(p_post uuid, p_on boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.has_permission('forum.segnalare') then raise exception 'Permesso negato'; end if;
  update public.forum_posts
    set highlighted_at = case when p_on then now() else null end,
        highlighted_by = case when p_on then (select username from public.profiles where id = auth.uid()) else null end
    where id = p_post;
  -- segnalato di nuovo: torna a comparire a tutti
  -- (chi segnala non riceve la finestra)
  if p_on then
    delete from public.forum_highlight_seen where post_id = p_post;
    insert into public.forum_highlight_seen (user_id, post_id) values (auth.uid(), p_post);
  end if;
end;
$$;
revoke execute on function public.forum_highlight_post(uuid, boolean) from public, anon;
grant execute on function public.forum_highlight_post(uuid, boolean) to authenticated;

-- Segnalazioni ancora da vedere per chi guarda (con le regole di visibilita' del forum)
create or replace function public.forum_pending_highlights()
returns table (post_id uuid, thread_id uuid, title text, section_name text, author_name text, highlighted_by text, highlighted_at timestamptz)
language sql
stable
security invoker set search_path = ''
as $$
  select p.id, t.id, t.title, s.name, p.author_name, p.highlighted_by, p.highlighted_at
  from public.forum_posts p
  join public.forum_threads t on t.id = p.thread_id
  join public.forum_sections s on s.id = t.section_id
  where p.highlighted_at > now() - interval '30 days'
    and not exists (select 1 from public.forum_highlight_seen v where v.post_id = p.id and v.user_id = auth.uid())
  order by p.highlighted_at desc
  limit 10;
$$;
revoke execute on function public.forum_pending_highlights() from public, anon;
grant execute on function public.forum_pending_highlights() to authenticated;

-- Il permesso nuovo ai ruoli di moderatori e master (gli admin lo hanno sempre)
update public.staff_roles
  set permissions = array_append(coalesce(permissions, '{}'), 'forum.segnalare')
  where (name ilike '%moderat%' or name ilike '%master%')
    and not ('forum.segnalare' = any(coalesce(permissions, '{}')));
