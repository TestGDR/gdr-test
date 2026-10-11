-- =====================================================================
-- 0121 - Ripristino completo della salute di un personaggio (solo admin)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Scheda -> Gestisci -> "Ripristina salute completa": PF e Stamina pieni,
-- niente ferite, sanguinamenti, veleno o stordimento, di nuovo vivo.
-- =====================================================================

create or replace function public.admin_full_heal(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo gli admin possono farlo.' using errcode = '42501';
  end if;
  update public.characters
     set hp_current = null,
         hp_updated_at = now(),
         stamina_current = null,
         stamina_updated_at = null,
         dead_at = null,
         dying_since = null,
         dying_round = 0,
         dying_save_due = false,
         stabilized_at = null,
         stunned = false,
         poison_rounds = 0,
         poison_halved = false,
         healed_at = null
   where id = p_character;
  if not found then
    raise exception 'Personaggio non trovato.' using errcode = 'P0001';
  end if;
  delete from public.character_wounds where character_id = p_character;
  -- le armi avvelenate che ha addosso restano com'erano
end;
$$;

revoke execute on function public.admin_full_heal(uuid) from public, anon;
grant execute on function public.admin_full_heal(uuid) to authenticated;
