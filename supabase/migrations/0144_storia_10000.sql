-- =====================================================================
-- 0144 - Storia (BG) del personaggio fino a 10000 caratteri (prima 4000)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
-- =====================================================================

alter table public.character_backgrounds drop constraint if exists character_backgrounds_body_check;
alter table public.character_backgrounds
  add constraint character_backgrounds_body_check check (char_length(body) <= 10000);

-- Le funzioni che salvano la storia avevano il limite scritto dentro: lo si
-- aggiorna senza toccare il resto (salvare la propria storia, mandarla in
-- approvazione, Gestisci della scheda)
do $$
declare
  f record;
  v_def text;
  v_new text;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('update_my_background', 'save_my_story', 'sheet_manage_update')
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := v_def;
    v_new := replace(v_new, '> 4000 then raise', '> 10000 then raise');
    v_new := replace(v_new, 'supera i 4000 caratteri', 'supera i 10000 caratteri');
    v_new := replace(v_new, 'not between 100 and 4000', 'not between 100 and 10000');
    v_new := replace(v_new, 'tra 100 e 4000 caratteri', 'tra 100 e 10000 caratteri');
    if v_new <> v_def then
      execute v_new;
    end if;
  end loop;
end $$;
