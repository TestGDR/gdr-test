-- =====================================================================
-- 0031 - Draghi: effetti di pregi e difetti su caratteristiche e abilita'
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni pregio o difetto puo' avere piu' effetti: un modificatore (positivo
-- o negativo) su una caratteristica o su un'abilita', con una condizione
-- facoltativa ("solo di notte", "nei tiri di inseguimento"...).
-- I valori del drago non cambiano: i modificatori si sommano nei tiri.
-- =====================================================================

create table public.dragon_trait_effects (
  id           bigint generated always as identity primary key,
  side         text not null check (side in ('pregio', 'difetto')),
  trait        text not null,
  target_kind  text not null check (target_kind in ('caratteristica', 'abilita')),
  target_key   text not null,
  modifier     int  not null check (modifier between -10 and 10 and modifier <> 0),
  condition    text not null default '' check (char_length(condition) <= 120),
  created_at   timestamptz not null default now()
);
create index dragon_trait_effects_trait_idx on public.dragon_trait_effects(side, trait);

alter table public.dragon_trait_effects enable row level security;
create policy "effetti visibili"     on public.dragon_trait_effects for select to authenticated using (true);
create policy "effetti con permesso" on public.dragon_trait_effects for all to authenticated
  using (public.has_permission('draghi.gestire')) with check (public.has_permission('draghi.gestire'));
grant select, insert, update, delete on public.dragon_trait_effects to authenticated;
grant select, insert, update, delete on public.dragon_trait_effects to service_role;

-- L'effetto deve riferirsi a un tratto e a una caratteristica/abilita' esistenti
create or replace function public.dragon_trait_effects_check()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.side = 'pregio' and not exists (select 1 from public.dragon_trait_pairs where pregio = new.trait) then
    raise exception 'Pregio sconosciuto: %', new.trait using errcode = 'P0001';
  end if;
  if new.side = 'difetto' and not exists (select 1 from public.dragon_trait_pairs where difetto = new.trait) then
    raise exception 'Difetto sconosciuto: %', new.trait using errcode = 'P0001';
  end if;
  if new.target_kind = 'caratteristica' and new.target_key not in ('vigore', 'destrezza', 'intelletto', 'percezione') then
    raise exception 'Caratteristica sconosciuta: %', new.target_key using errcode = 'P0001';
  end if;
  if new.target_kind = 'abilita' and not exists (select 1 from public.dragon_skills where key = new.target_key) then
    raise exception 'Abilità sconosciuta: %', new.target_key using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger dragon_trait_effects_check before insert or update on public.dragon_trait_effects
  for each row execute function public.dragon_trait_effects_check();

-- ---------------------------------------------------------------------
-- Tratti rinominati o eliminati: aggiornano anche draghi ed effetti
-- ---------------------------------------------------------------------
create or replace function public.dragon_trait_pairs_sync()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('app.dragon_internal', '1', true);
  if tg_op = 'UPDATE' then
    if new.pregio <> old.pregio then
      update public.dragons set pregi = array_replace(pregi, old.pregio, new.pregio) where old.pregio = any (pregi);
      update public.dragon_trait_effects set trait = new.pregio where side = 'pregio' and trait = old.pregio;
    end if;
    if new.difetto <> old.difetto then
      update public.dragons set difetti = array_replace(difetti, old.difetto, new.difetto) where old.difetto = any (difetti);
      update public.dragon_trait_effects set trait = new.difetto where side = 'difetto' and trait = old.difetto;
    end if;
  elsif tg_op = 'DELETE' then
    update public.dragons set
      pregi = array_remove(pregi, old.pregio),
      difetti = array_remove(difetti, old.difetto)
    where old.pregio = any (pregi) or old.difetto = any (difetti);
    delete from public.dragon_trait_effects
    where (side = 'pregio' and trait = old.pregio) or (side = 'difetto' and trait = old.difetto);
  end if;
  perform set_config('app.dragon_internal', '', true);
  return coalesce(new, old);
end;
$$;

-- Abilita' eliminata: sparisce dai draghi e dagli effetti
create or replace function public.dragon_skills_after_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set skills = skills - old.key where skills ? old.key;
  delete from public.dragon_trait_effects where target_kind = 'abilita' and target_key = old.key;
  perform set_config('app.dragon_internal', '', true);
  return old;
end;
$$;
