-- Eliminazione definitiva di un ticket in archivio (sospeso o chiuso).
-- Solo l'admin. Con il ticket spariscono anche messaggi, partecipanti e letture.

create or replace function public.delete_ticket(p_ticket uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo gli admin possono eliminare un ticket'; end if;
  delete from public.tickets where id = p_ticket and status in ('sospeso', 'chiuso');
  if not found then raise exception 'Si possono eliminare solo i ticket in archivio'; end if;
end;
$$;

revoke all on function public.delete_ticket(uuid) from public, anon;
grant execute on function public.delete_ticket(uuid) to authenticated;
