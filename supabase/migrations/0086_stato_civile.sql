-- =====================================================================
-- 0086 - Scheda: stato civile
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Anche: altezza, occhi, capelli e segni visibili modificabili dal proprietario.
-- Celibe/nubile, sposato, fidanzato ufficialmente, divorziato, vedovo.
-- Sposato e fidanzato ufficialmente possono indicare un PG o un PNG.
-- Lo imposta solo l'admin (Scheda -> Gestisci).
-- =====================================================================

alter table public.characters add column if not exists marital_status text;
alter table public.characters add column if not exists partner_character_id uuid references public.characters (id) on delete set null;
alter table public.characters add column if not exists partner_npc text;

alter table public.characters drop constraint if exists characters_marital_status_check;
alter table public.characters add constraint characters_marital_status_check
  check (marital_status is null or marital_status in ('libero', 'sposato', 'fidanzato', 'divorziato', 'vedovo'));
alter table public.characters drop constraint if exists characters_partner_npc_len;
alter table public.characters add constraint characters_partner_npc_len
  check (partner_npc is null or char_length(partner_npc) <= 60);

create or replace function public.set_marital_status(p_character uuid, p_status text, p_partner uuid, p_partner_npc text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_npc text := nullif(trim(coalesce(p_partner_npc, '')), '');
  v_with boolean := p_status in ('sposato', 'fidanzato');
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono cambiare lo stato civile.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('libero', 'sposato', 'fidanzato', 'divorziato', 'vedovo') then
    raise exception 'Stato civile non valido.' using errcode = 'P0001';
  end if;
  if p_partner = p_character then raise exception 'Un personaggio non può sposare se stesso.' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_npc, '')) > 60 then raise exception 'Nome del PNG troppo lungo.' using errcode = 'P0001'; end if;

  update public.characters
    set marital_status = p_status,
        partner_character_id = case when v_with then p_partner end,
        partner_npc = case when v_with and p_partner is null then v_npc end
    where id = p_character;
end;
$$;
revoke execute on function public.set_marital_status(uuid, text, uuid, text) from public, anon;
grant execute on function public.set_marital_status(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Dati: altezza, occhi, capelli e segni visibili li modifica anche il
-- proprietario (con la pennina accanto al nome)
-- ---------------------------------------------------------------------
alter table public.characters drop constraint if exists characters_looks_len;
alter table public.characters add constraint characters_looks_len check (
  char_length(coalesce(height, '')) <= 30
  and char_length(coalesce(eye_color, '')) <= 40
  and char_length(coalesce(hair_color, '')) <= 40
  and char_length(coalesce(visible_marks, '')) <= 300
);
grant update (height, eye_color, hair_color, visible_marks) on public.characters to authenticated;
