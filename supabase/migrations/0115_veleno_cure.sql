-- =====================================================================
-- 0115 - Veleno e cure con Medicina
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- - Veleno: 1d6 PF a round per 1d6 round (dimezzato se si resiste)
-- - Armi avvelenate: il primo colpo che supera l'armatura avvelena
-- - Cure con Medicina: una al giorno per paziente (healed_at)
-- =====================================================================

alter table public.characters add column if not exists poison_rounds int not null default 0;
alter table public.characters add column if not exists poison_halved boolean not null default false;
alter table public.characters add column if not exists healed_at timestamptz;
alter table public.character_items add column if not exists poisoned boolean not null default false;
