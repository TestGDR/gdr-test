-- =====================================================================
-- 0141 - Commerci tra casate (tratte commerciali)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Una tratta: la casata A da' ogni mese una quantita' di una risorsa e ne
-- riceve un'altra dalla casata B, per un certo numero di mesi.
-- - La propone chi nella casata ha un ruolo che gestisce le risorse
--   ("Costruisce nei feudi"), a una casata precisa oppure a tutte (offerta
--   aperta). L'altra casata accetta o rifiuta.
-- - Per le casate PNG agisce lo staff (permesso "economia.gestire") dal
--   pannello Gestione -> Commerci. Le casate PNG non hanno un tesoro da
--   controllare: consegnano sempre.
-- - Il primo scambio avviene all'accettazione, i successivi ogni 1 del mese.
--   Se una casata PG non ha abbastanza risorse, lo scambio di quel mese salta.
-- - Una tratta si puo' annullare (da una delle due parti) e rinnovare (con
--   una nuova proposta che l'altra parte deve accettare).
-- =====================================================================

create table if not exists public.trade_routes (
  id            uuid primary key default gen_random_uuid(),
  from_house    uuid not null references public.houses(id) on delete cascade,
  to_house      uuid references public.houses(id) on delete cascade, -- null = offerta aperta a tutte
  give_resource uuid not null references public.resources(id) on delete cascade,
  give_amount   int  not null check (give_amount between 1 and 1000000),
  want_resource uuid not null references public.resources(id) on delete cascade,
  want_amount   int  not null check (want_amount between 1 and 1000000),
  months        int  not null check (months between 1 and 24),
  months_left   int  not null default 0,
  status        text not null default 'proposta'
                check (status in ('proposta', 'attiva', 'conclusa', 'annullata', 'rifiutata')),
  note          text not null default '' check (char_length(note) <= 500),
  created_by    text not null default '',
  renew_of      uuid references public.trade_routes(id) on delete set null,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  ended_at      timestamptz,
  check (to_house is null or to_house <> from_house),
  check (give_resource <> want_resource)
);
create index if not exists trade_routes_from_idx on public.trade_routes (from_house, status);
create index if not exists trade_routes_to_idx on public.trade_routes (to_house, status);

-- mesi in cui gli scambi sono gia' stati eseguiti
create table if not exists public.trade_months (month date primary key, run_at timestamptz not null default now());

alter table public.trade_routes enable row level security;
alter table public.trade_months enable row level security;

-- le vedono le due casate, lo staff dell'economia e (le offerte aperte) tutti
drop policy if exists "tratte visibili" on public.trade_routes;
create policy "tratte visibili" on public.trade_routes for select to authenticated
  using (
    public.has_permission('economia.gestire')
    or public.is_house_member(from_house)
    or public.is_house_member(to_house)
    or (status = 'proposta' and to_house is null)
  );
grant select on public.trade_routes to authenticated;
grant select, insert, update, delete on public.trade_routes, public.trade_months to service_role;

-- Posso agire per questa casata? Lo staff dell'economia per tutte; un PG per
-- la propria casata (giocabile) se il suo ruolo gestisce le risorse
create or replace function public.trade_can_act(p_house uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.has_permission('economia.gestire') or exists (
    select 1
      from public.characters ch
      join public.house_roles hr on hr.id = ch.house_role_id
      join public.houses h on h.id = ch.house_id
     where ch.owner_id = auth.uid() and ch.house_id = p_house and hr.can_build and h.playable
  );
$$;
grant execute on function public.trade_can_act(uuid) to authenticated;

-- Uno scambio: vero se e' avvenuto. Le casate PNG non hanno tesoro da toccare.
create or replace function public.trade_exchange(p_route uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.trade_routes;
  v_from_pg boolean; v_to_pg boolean;
  v_from text; v_to text;
begin
  select * into r from public.trade_routes where id = p_route;
  if r.id is null or r.to_house is null then return false; end if;
  select playable, name into v_from_pg, v_from from public.houses where id = r.from_house;
  select playable, name into v_to_pg, v_to from public.houses where id = r.to_house;
  if v_from_pg and coalesce((select amount from public.house_resources
       where house_id = r.from_house and resource_id = r.give_resource), 0) < r.give_amount then return false; end if;
  if v_to_pg and coalesce((select amount from public.house_resources
       where house_id = r.to_house and resource_id = r.want_resource), 0) < r.want_amount then return false; end if;
  if v_from_pg then
    perform public.economy_add(r.from_house, r.give_resource, -r.give_amount, 'Commercio con ' || v_to);
    perform public.economy_add(r.from_house, r.want_resource, r.want_amount, 'Commercio con ' || v_to);
  end if;
  if v_to_pg then
    perform public.economy_add(r.to_house, r.want_resource, -r.want_amount, 'Commercio con ' || v_from);
    perform public.economy_add(r.to_house, r.give_resource, r.give_amount, 'Commercio con ' || v_from);
  end if;
  return true;
end;
$$;
revoke execute on function public.trade_exchange(uuid) from public, anon, authenticated;

-- Chi firma la proposta: il mio PG di quella casata, altrimenti lo staff
create or replace function public.trade_signer(p_house uuid)
returns text
language sql stable
security definer set search_path = ''
as $$
  select coalesce(
    (select ch.name from public.characters ch where ch.owner_id = auth.uid() and ch.house_id = p_house limit 1),
    'Staff');
$$;
revoke execute on function public.trade_signer(uuid) from public, anon, authenticated;

-- Proporre una tratta (p_to null = offerta aperta a tutte le casate)
create or replace function public.trade_offer(
  p_from uuid, p_to uuid, p_give_resource uuid, p_give_amount int,
  p_want_resource uuid, p_want_amount int, p_months int, p_note text
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.trade_can_act(p_from) then
    raise exception 'Non puoi proporre tratte per questa casata.' using errcode = '42501';
  end if;
  if p_to is not null and (p_to = p_from or not exists (select 1 from public.houses where id = p_to)) then
    raise exception 'Casata non valida.' using errcode = 'P0001';
  end if;
  if p_give_resource = p_want_resource then
    raise exception 'Scegli due risorse diverse.' using errcode = 'P0001';
  end if;
  if coalesce(p_give_amount, 0) < 1 or coalesce(p_want_amount, 0) < 1 then
    raise exception 'Le quantità devono essere almeno 1.' using errcode = 'P0001';
  end if;
  if coalesce(p_months, 0) not between 1 and 24 then
    raise exception 'La durata va da 1 a 24 mesi.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.trade_routes where from_house = p_from and status = 'proposta') >= 20 then
    raise exception 'Troppe proposte in attesa: ritirane qualcuna.' using errcode = 'P0001';
  end if;
  insert into public.trade_routes (from_house, to_house, give_resource, give_amount, want_resource, want_amount, months, note, created_by)
    values (p_from, p_to, p_give_resource, p_give_amount, p_want_resource, p_want_amount, p_months,
            left(btrim(coalesce(p_note, '')), 500), public.trade_signer(p_from))
    returning id into v_id;
  return v_id;
end;
$$;

-- Accettare una proposta (p_house: la casata che accetta)
create or replace function public.trade_accept(p_route uuid, p_house uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.trade_routes;
  o public.trade_routes;
begin
  select * into r from public.trade_routes where id = p_route for update;
  if r.id is null or r.status <> 'proposta' then
    raise exception 'La proposta non è più disponibile.' using errcode = 'P0001';
  end if;
  if p_house = r.from_house or (r.to_house is not null and r.to_house <> p_house) then
    raise exception 'Questa proposta non è per la tua casata.' using errcode = 'P0001';
  end if;
  if not public.trade_can_act(p_house) then
    raise exception 'Non puoi accettare tratte per questa casata.' using errcode = '42501';
  end if;

  -- rinnovo di una tratta ancora attiva: si allunga quella, senza un nuovo scambio subito
  if r.renew_of is not null then
    select * into o from public.trade_routes where id = r.renew_of for update;
    if o.id is not null and o.status = 'attiva' then
      update public.trade_routes set months_left = months_left + r.months, months = months + r.months where id = o.id;
      delete from public.trade_routes where id = r.id;
      return;
    end if;
  end if;

  update public.trade_routes set to_house = p_house where id = r.id;
  if not public.trade_exchange(r.id) then
    raise exception 'Risorse insufficienti per il primo scambio.' using errcode = 'P0001';
  end if;
  update public.trade_routes
     set status = case when r.months > 1 then 'attiva' else 'conclusa' end,
         months_left = r.months - 1,
         accepted_at = now(),
         ended_at = case when r.months > 1 then null else now() end
   where id = r.id;
end;
$$;

-- Rifiutare una proposta ricevuta
create or replace function public.trade_refuse(p_route uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.trade_routes;
begin
  select * into r from public.trade_routes where id = p_route for update;
  if r.id is null or r.status <> 'proposta' or r.to_house is null then
    raise exception 'La proposta non è più disponibile.' using errcode = 'P0001';
  end if;
  if not public.trade_can_act(r.to_house) then
    raise exception 'Non puoi rifiutare questa proposta.' using errcode = '42501';
  end if;
  update public.trade_routes set status = 'rifiutata', ended_at = now() where id = r.id;
end;
$$;

-- Ritirare una propria proposta, oppure chiudere una tratta attiva (una delle due parti)
create or replace function public.trade_cancel(p_route uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.trade_routes;
begin
  select * into r from public.trade_routes where id = p_route for update;
  if r.id is null or r.status not in ('proposta', 'attiva') then
    raise exception 'La tratta non si può più annullare.' using errcode = 'P0001';
  end if;
  if not (public.trade_can_act(r.from_house) or (r.status = 'attiva' and public.trade_can_act(r.to_house))) then
    raise exception 'Non puoi annullare questa tratta.' using errcode = '42501';
  end if;
  update public.trade_routes set status = 'annullata', ended_at = now() where id = r.id;
  delete from public.trade_routes where renew_of = r.id and status = 'proposta';
end;
$$;

-- Rinnovare: una nuova proposta, con le stesse condizioni, all'altra casata
create or replace function public.trade_renew(p_route uuid, p_house uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.trade_routes;
  v_id uuid;
  v_mine boolean;
begin
  select * into r from public.trade_routes where id = p_route;
  if r.id is null or r.status not in ('attiva', 'conclusa') or r.to_house is null then
    raise exception 'Questa tratta non si può rinnovare.' using errcode = 'P0001';
  end if;
  if p_house not in (r.from_house, r.to_house) or not public.trade_can_act(p_house) then
    raise exception 'Non puoi rinnovare questa tratta.' using errcode = '42501';
  end if;
  if exists (select 1 from public.trade_routes where renew_of = r.id and status = 'proposta') then
    raise exception 'C''è già una richiesta di rinnovo in attesa.' using errcode = 'P0001';
  end if;
  v_mine := p_house = r.from_house;
  insert into public.trade_routes (from_house, to_house, give_resource, give_amount, want_resource, want_amount,
                                   months, note, created_by, renew_of)
    values (p_house,
            case when v_mine then r.to_house else r.from_house end,
            case when v_mine then r.give_resource else r.want_resource end,
            case when v_mine then r.give_amount else r.want_amount end,
            case when v_mine then r.want_resource else r.give_resource end,
            case when v_mine then r.want_amount else r.give_amount end,
            r.months, 'Rinnovo della tratta', public.trade_signer(p_house), r.id)
    returning id into v_id;
  return v_id;
end;
$$;

-- Gli scambi del mese per tutte le tratte attive
create or replace function public.run_trade_routes(p_force boolean default false)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
  r record;
  n int := 0;
begin
  -- il controllo automatico non ha un utente; dal sito serve il permesso
  if auth.uid() is not null and not public.has_permission('economia.gestire') then raise exception 'Permesso negato'; end if;
  if not p_force then
    if exists (select 1 from public.trade_months where month = v_month) then return 0; end if;
    insert into public.trade_months (month) values (v_month);
  end if;
  for r in select t.id, t.from_house, t.to_house, t.months_left, hf.playable as from_pg, ht.playable as to_pg,
                  hf.name as from_name, ht.name as to_name
             from public.trade_routes t
             join public.houses hf on hf.id = t.from_house
             join public.houses ht on ht.id = t.to_house
            where t.status = 'attiva'
  loop
    if public.trade_exchange(r.id) then
      n := n + 1;
    else
      -- scambio saltato: resta scritto nei movimenti delle casate PG
      if r.from_pg then
        insert into public.economy_log (house_id, resource_id, delta, reason)
          values (r.from_house, null, 0, 'Commercio con ' || r.to_name || ' saltato: risorse insufficienti');
      end if;
      if r.to_pg then
        insert into public.economy_log (house_id, resource_id, delta, reason)
          values (r.to_house, null, 0, 'Commercio con ' || r.from_name || ' saltato: risorse insufficienti');
      end if;
    end if;
    update public.trade_routes
       set months_left = greatest(0, months_left - 1),
           status = case when months_left <= 1 then 'conclusa' else 'attiva' end,
           ended_at = case when months_left <= 1 then now() else null end
     where id = r.id;
  end loop;
  return n;
end;
$$;

revoke execute on function public.trade_offer(uuid, uuid, uuid, int, uuid, int, int, text) from public, anon;
revoke execute on function public.trade_accept(uuid, uuid) from public, anon;
revoke execute on function public.trade_refuse(uuid) from public, anon;
revoke execute on function public.trade_cancel(uuid) from public, anon;
revoke execute on function public.trade_renew(uuid, uuid) from public, anon;
revoke execute on function public.run_trade_routes(boolean) from public, anon;
grant execute on function public.trade_offer(uuid, uuid, uuid, int, uuid, int, int, text) to authenticated;
grant execute on function public.trade_accept(uuid, uuid) to authenticated;
grant execute on function public.trade_refuse(uuid) to authenticated;
grant execute on function public.trade_cancel(uuid) to authenticated;
grant execute on function public.trade_renew(uuid, uuid) to authenticated;
grant execute on function public.run_trade_routes(boolean) to authenticated;

-- ogni 1 del mese, dopo gli introiti (il controllo evita doppi scambi)
select cron.unschedule('tratte-mensili') where exists (select 1 from cron.job where jobname = 'tratte-mensili');
select cron.schedule('tratte-mensili', '30 * 1 * *', 'select public.run_trade_routes(false)');
