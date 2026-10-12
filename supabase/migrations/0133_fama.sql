-- =====================================================================
-- 0133 - Fama al posto dell'Onore
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Una sola scala da -100 a +100: tutti partono da 0 ("Sconosciuto"),
-- salendo si diventa famosi nel bene, scendendo famigerati.
-- La cambia solo lo staff (master, moderatori, admin), a mano e con una
-- motivazione; ogni variazione resta nella cronologia. Non ha effetti sui
-- tiri e non torna verso lo zero col tempo.
-- =====================================================================

alter table public.characters
  add column if not exists fame int not null default 0 check (fame between -100 and 100);

create table if not exists public.fame_log (
  id           bigint generated always as identity primary key,
  character_id uuid not null references public.characters(id) on delete cascade,
  delta        int  not null,
  fame_after   int  not null,
  reason       text not null default '',
  by_user      uuid references public.profiles(id) on delete set null default auth.uid(),
  by_name      text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists fame_log_character_idx on public.fame_log (character_id, created_at desc);

alter table public.fame_log enable row level security;
drop policy if exists "cronologia della fama" on public.fame_log;
create policy "cronologia della fama" on public.fame_log for select to authenticated
  using (public.is_my_character(character_id) or public.can_master_mode());
grant select on public.fame_log to authenticated;
grant select, insert, update, delete on public.fame_log to service_role;

-- Lo staff alza o abbassa la fama (resta tra -100 e +100)
create or replace function public.staff_adjust_fame(p_character uuid, p_delta int, p_reason text)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_old int;
  v_new int;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.can_master_mode() then
    raise exception 'Solo master, moderatori e admin cambiano la fama.' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Indica di quanti punti cambia la fama.' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'Scrivi il motivo: resta nella cronologia del personaggio.' using errcode = 'P0001';
  end if;
  select fame into v_old from public.characters where id = p_character for update;
  if not found then raise exception 'Personaggio non trovato.' using errcode = 'P0001'; end if;
  v_new := least(100, greatest(-100, v_old + p_delta));
  if v_new = v_old then
    raise exception 'La fama è già al limite della scala.' using errcode = 'P0001';
  end if;
  update public.characters set fame = v_new where id = p_character;
  insert into public.fame_log (character_id, delta, fame_after, reason, by_name)
    values (p_character, v_new - v_old, v_new, left(v_reason, 200), public.staff_display_name());
  return v_new;
end;
$$;
revoke execute on function public.staff_adjust_fame(uuid, int, text) from public, anon;
grant execute on function public.staff_adjust_fame(uuid, int, text) to authenticated;
