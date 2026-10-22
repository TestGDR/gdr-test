-- =====================================================================
-- 0157 - Tratti: vantaggi e svantaggi del documento "Tratti" (seconda versione)
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- Regole nuove dei tratti:
-- - Costo diverso a seconda della statistica scelta (Talento e Debolezza
--   di statistica: TEM 1, VIG 2, EMP 2, INT 3, CAR 3, RIF 4).
-- - Scelta limitata a certe abilita' (Combattente nato: solo abilita' di
--   combattimento; Legame col drago: solo le tre abilita' sui draghi).
-- - Tratti incompatibili con alcune abilita' (Terrore del fuoco: non si
--   prende se il personaggio ha punti nelle abilita' sui draghi).
-- - Rete di contatti: il personaggio parte con una spia gia' reclutata.
-- - Alla creazione si possono prendere svantaggi fino a 5 punti.
-- I PG che hanno gia' un tratto lo tengono: cambiano solo nome, costo ed effetto.
-- =====================================================================

alter table public.traits
  add column if not exists stat_costs          jsonb,   -- costo per statistica scelta: {"will":1,"body":2,...}
  add column if not exists choice_options      text[],  -- abilita' tra cui scegliere (vuoto = tutte)
  add column if not exists incompatible_skills text[];  -- non si prende con punti in queste abilita'

-- ---------------------------------------------------------------------
-- Rete di contatti: la prima spia gia' reclutata
-- ---------------------------------------------------------------------
alter table public.spy_settings add column if not exists first_spy_trait text not null default 'Rete di contatti';
alter table public.characters add column if not exists free_spy_given boolean not null default false;

-- La chiama il pannello Spie quando si apre: se il PG ha il tratto e non
-- ha ancora avuto la spia in regalo, gliela da' (una volta sola)
create or replace function public.spy_init(p_character uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trait text;
begin
  if not exists (select 1 from public.characters
                  where id = p_character and owner_id = auth.uid() and status = 'attivo' and not free_spy_given) then
    return;
  end if;
  select first_spy_trait into v_trait from public.spy_settings;
  if exists (select 1 from public.character_traits ct join public.traits t on t.id = ct.trait_id
              where ct.character_id = p_character and lower(t.name) = lower(coalesce(v_trait, ''))) then
    insert into public.spies (character_id, name) values (p_character, 'La prima spia');
    update public.characters set free_spy_given = true where id = p_character;
  end if;
end;
$$;
revoke execute on function public.spy_init(uuid) from public, anon;
grant execute on function public.spy_init(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Alla creazione: svantaggi fino a 5 punti
-- ---------------------------------------------------------------------
update public.creation_blocks
   set config = config || '{"flaw_value_max": 5}'::jsonb
 where kind = 'tratti';

-- ---------------------------------------------------------------------
-- I tratti del documento: si aggiornano quelli che ci sono, si creano i nuovi
-- ---------------------------------------------------------------------
drop table if exists tmp_tratti;
create temporary table tmp_tratti (
  name text, kind text, cost int, effect text, choice text, grp text,
  modifiers jsonb, sort int, stat_costs jsonb, options text[], incompatible text[]
);

insert into tmp_tratti values
  -- Vantaggi: generali
  ('Talento', 'vantaggio', 1, '+1 a tutti i tiri di un''abilità a scelta.', 'abilita', null,
   '[{"target":"choice_skill","value":1}]', 1, null, null, null),
  ('Specialista', 'vantaggio', 1, '+2 a un''abilità a scelta, solo in una situazione precisa (per esempio Armi da tiro da cavallo).', 'abilita', null,
   '[{"target":"choice_skill","value":2,"condition":"situazione precisa"}]', 2, null, null, null),
  ('Talento di statistica', 'vantaggio', 3, '+1 a tutti i tiri con una statistica a scelta (se ne può avere una sola). Costo: TEM 1, VIG 2, EMP 2, INT 3, CAR 3, RIF 4.', 'statistica', 'talento_statistica',
   '[{"target":"choice_stat","value":1}]', 3, '{"will":1,"body":2,"emp":2,"int":3,"pre":3,"ref":4}', null, null),
  ('Combattente nato', 'vantaggio', 2, '+2 a un''abilità di combattimento a scelta.', 'abilita', null,
   '[{"target":"choice_skill","value":2}]', 4, null,
   array['Armi da impatto', 'Armi da taglio leggere', 'Armi da taglio pesanti', 'Armi da tiro', 'Armi in asta', 'Lotta', 'Parare', 'Schivare'], null),
  -- Vantaggi: fisici
  ('Riflessi pronti', 'vantaggio', 2, '+2 all''iniziativa.', 'nessuna', null,
   '[{"target":"initiative","value":2}]', 10, null, null, null),
  ('Salute di ferro', 'vantaggio', 2, '+2 a Resistenza, +1 ai tiri contro infezione e febbre.', 'nessuna', null,
   '[{"target":"skill","skill":"Resistenza","value":2},{"target":"other","value":1,"condition":"tiri contro infezione e febbre"}]', 11, null, null, null),
  ('Soglia del dolore alta', 'vantaggio', 1, '+2 a Resistenza nei tiri contro il dolore delle ferite.', 'nessuna', null,
   '[{"target":"skill","skill":"Resistenza","value":2,"condition":"contro il dolore delle ferite"}]', 12, null, null, null),
  ('Atleta', 'vantaggio', 1, '+2 a Atletica.', 'nessuna', null,
   '[{"target":"skill","skill":"Atletica","value":2}]', 13, null, null, null),
  ('Passo felpato', 'vantaggio', 1, '+2 a Furtività.', 'nessuna', null,
   '[{"target":"skill","skill":"Furtività","value":2}]', 14, null, null, null),
  ('Cavaliere nato', 'vantaggio', 1, '+2 a Equitazione.', 'nessuna', null,
   '[{"target":"skill","skill":"Equitazione","value":2}]', 15, null, null, null),
  -- Vantaggi: mentali e culturali
  ('Studioso', 'vantaggio', 1, '+2 a Conoscenze.', 'nessuna', null,
   '[{"target":"skill","skill":"Conoscenze","value":2}]', 20, null, null, null),
  ('Mani da guaritore', 'vantaggio', 1, '+2 a Medicina.', 'nessuna', null,
   '[{"target":"skill","skill":"Medicina","value":2}]', 21, null, null, null),
  ('Poliglotta', 'vantaggio', 1, '+2 a Lingue.', 'nessuna', null,
   '[{"target":"skill","skill":"Lingue","value":2}]', 22, null, null, null),
  ('Stratega', 'vantaggio', 1, '+2 a Strategia.', 'nessuna', null,
   '[{"target":"skill","skill":"Strategia","value":2}]', 23, null, null, null),
  ('Osservatore', 'vantaggio', 2, '+2 a Osservazione.', 'nessuna', null,
   '[{"target":"skill","skill":"Osservazione","value":2}]', 24, null, null, null),
  ('Istinto del pericolo', 'vantaggio', 2, '+2 a Intuito per accorgersi di imboscate e trappole; non sei mai colto di sorpresa.', 'nessuna', null,
   '[{"target":"skill","skill":"Intuito","value":2,"condition":"imboscate e trappole"}]', 25, null, null, null),
  ('Mente fredda', 'vantaggio', 1, '+2 a Autocontrollo.', 'nessuna', null,
   '[{"target":"skill","skill":"Autocontrollo","value":2}]', 26, null, null, null),
  ('Cuore di leone', 'vantaggio', 1, '+2 a Coraggio.', 'nessuna', null,
   '[{"target":"skill","skill":"Coraggio","value":2}]', 27, null, null, null),
  -- Vantaggi: sociali
  ('Lingua d''oro', 'vantaggio', 2, '+2 a Persuadere.', 'nessuna', null,
   '[{"target":"skill","skill":"Persuadere","value":2}]', 30, null, null, null),
  ('Sguardo che gela', 'vantaggio', 2, '+2 a Intimidire.', 'nessuna', null,
   '[{"target":"skill","skill":"Intimidire","value":2}]', 31, null, null, null),
  ('Occhio per le menzogne', 'vantaggio', 2, '+2 a Percepire Intenzioni.', 'nessuna', null,
   '[{"target":"skill","skill":"Percepire Intenzioni","value":2}]', 32, null, null, null),
  ('Comandante nato', 'vantaggio', 2, '+2 a Comando.', 'nessuna', null,
   '[{"target":"skill","skill":"Comando","value":2}]', 33, null, null, null),
  ('Fascino', 'vantaggio', 2, '+2 a Seduzione.', 'nessuna', null,
   '[{"target":"skill","skill":"Seduzione","value":2}]', 34, null, null, null),
  ('Maestro d''inganni', 'vantaggio', 2, '+2 a Dissimulare.', 'nessuna', null,
   '[{"target":"skill","skill":"Dissimulare","value":2}]', 35, null, null, null),
  ('Buona fama', 'vantaggio', 2, '+2 a Persuadere e Comando con chi conosce la tua reputazione.', 'nessuna', null,
   '[{"target":"skill","skill":"Persuadere","value":2,"condition":"con chi conosce la tua reputazione"},{"target":"skill","skill":"Comando","value":2,"condition":"con chi conosce la tua reputazione"}]', 36, null, null, null),
  ('Rete di contatti', 'vantaggio', 1, 'Inizi con una spia già reclutata (pannello Spie).', 'nessuna', null,
   '[]', 37, null, null, null),
  ('Spie', 'vantaggio', 2, 'Puoi avere fino a 3 spie al tuo servizio invece di 1 (pannello Spie); vanno comunque reclutate.', 'nessuna', null,
   '[]', 38, null, null, null),
  -- Vantaggi: animali e draghi
  ('Amico delle bestie', 'vantaggio', 1, '+2 a Addestrare animali e Comandare un animale.', 'nessuna', null,
   '[{"target":"skill","skill":"Addestrare animali","value":2},{"target":"skill","skill":"Comandare un animale","value":2}]', 40, null, null, null),
  ('Legame col drago', 'vantaggio', 2, '+2 a un''abilità sui draghi a scelta (Cavalcare un Drago, Addestrare un drago o Comandare un drago).', 'abilita', null,
   '[{"target":"choice_skill","value":2}]', 41, null,
   array['Cavalcare un Drago', 'Addestrare un drago', 'Comandare un drago'], null),

  -- Svantaggi
  ('Debolezza di statistica', 'svantaggio', 3, '−1 a tutti i tiri con una statistica a scelta (se ne può avere una sola). Valore: TEM 1, VIG 2, EMP 2, INT 3, CAR 3, RIF 4.', 'statistica', 'debolezza_statistica',
   '[{"target":"choice_stat","value":-1}]', 1, '{"will":1,"body":2,"emp":2,"int":3,"pre":3,"ref":4}', null, null),
  ('Zoppia', 'svantaggio', 2, '−2 a Atletica e Schivare, Corsa −3 metri.', 'nessuna', null,
   '[{"target":"skill","skill":"Atletica","value":-2},{"target":"skill","skill":"Schivare","value":-2},{"target":"run","value":-3}]', 2, null, null, null),
  ('Vista debole', 'svantaggio', 2, '−2 a Osservazione e Armi da tiro.', 'nessuna', null,
   '[{"target":"skill","skill":"Osservazione","value":-2},{"target":"skill","skill":"Armi da tiro","value":-2}]', 3, null, null, null),
  ('Salute fragile', 'svantaggio', 2, '−2 a Resistenza, −1 ai tiri contro infezione e febbre, −5 HP.', 'nessuna', null,
   '[{"target":"skill","skill":"Resistenza","value":-2},{"target":"other","value":-1,"condition":"tiri contro infezione e febbre"},{"target":"hp","value":-5}]', 4, null, null, null),
  ('Riflessi lenti', 'svantaggio', 1, '−2 all''iniziativa.', 'nessuna', null,
   '[{"target":"initiative","value":-2}]', 5, null, null, null),
  ('Codardo', 'svantaggio', 2, '−2 a Coraggio e Autocontrollo quando la vita è in pericolo.', 'nessuna', null,
   '[{"target":"skill","skill":"Coraggio","value":-2,"condition":"vita in pericolo"},{"target":"skill","skill":"Autocontrollo","value":-2,"condition":"vita in pericolo"}]', 6, null, null, null),
  ('Terrore del fuoco', 'svantaggio', 2, '−3 ai tiri di Tempra davanti a un grande incendio. Non si prende con punti nelle abilità sui draghi.', 'nessuna', null,
   '[{"target":"stat","stat":"will","value":-3,"condition":"davanti a un grande incendio"}]', 7, null, null,
   array['Cavalcare un Drago', 'Addestrare un drago', 'Comandare un drago']),
  ('Dipendenza dal vino', 'svantaggio', 2, 'Senza bere: −1 a tutti i tiri dopo un giorno, −2 dopo due, −3 dal terzo. Rifiutare un''offerta richiede un tiro di Autocontrollo.', 'nessuna', null,
   '[{"target":"other","value":-1,"condition":"dopo un giorno senza bere (−2 dopo due, −3 dal terzo)"}]', 8, null, null, null),
  ('Collerico', 'svantaggio', 1, '−2 a Persuadere e Dissimulare quando sei provocato o insultato.', 'nessuna', null,
   '[{"target":"skill","skill":"Persuadere","value":-2,"condition":"provocato o insultato"},{"target":"skill","skill":"Dissimulare","value":-2,"condition":"provocato o insultato"}]', 9, null, null, null),
  ('Orgoglioso', 'svantaggio', 1, '−2 a Autocontrollo quando il tuo onore è messo in discussione.', 'nessuna', null,
   '[{"target":"skill","skill":"Autocontrollo","value":-2,"condition":"onore messo in discussione"}]', 10, null, null, null),
  ('Parlata impacciata', 'svantaggio', 1, '−2 a Persuadere.', 'nessuna', null,
   '[{"target":"skill","skill":"Persuadere","value":-2}]', 11, null, null, null),
  ('Ignorante', 'svantaggio', 1, '−2 a Conoscenze e Lingue.', 'nessuna', null,
   '[{"target":"skill","skill":"Conoscenze","value":-2},{"target":"skill","skill":"Lingue","value":-2}]', 12, null, null, null),
  ('Maldestro in sella', 'svantaggio', 1, '−2 a Equitazione.', 'nessuna', null,
   '[{"target":"skill","skill":"Equitazione","value":-2}]', 13, null, null, null),
  ('Sfregiato', 'svantaggio', 1, '−2 a Seduzione.', 'nessuna', null,
   '[{"target":"skill","skill":"Seduzione","value":-2}]', 14, null, null, null),
  ('Cattiva fama', 'svantaggio', 2, '−2 a Persuadere, Seduzione e Comando con chi conosce la tua reputazione.', 'nessuna', null,
   '[{"target":"skill","skill":"Persuadere","value":-2,"condition":"con chi conosce la tua reputazione"},{"target":"skill","skill":"Seduzione","value":-2,"condition":"con chi conosce la tua reputazione"},{"target":"skill","skill":"Comando","value":-2,"condition":"con chi conosce la tua reputazione"}]', 15, null, null, null),
  ('Bastardo', 'svantaggio', 1, '−2 a Persuadere e Comando con chi dà peso al sangue nobile.', 'nessuna', null,
   '[{"target":"skill","skill":"Persuadere","value":-2,"condition":"con chi dà peso al sangue nobile"},{"target":"skill","skill":"Comando","value":-2,"condition":"con chi dà peso al sangue nobile"}]', 16, null, null, null),
  ('Nemico giurato', 'svantaggio', 2, 'Un personaggio o una casata ti ostacola, a discrezione del master.', 'nessuna', null,
   '[]', 17, null, null, null);

update public.traits t
   set kind = v.kind, cost = v.cost, effect = v.effect, choice = v.choice, unique_group = v.grp,
       modifiers = v.modifiers, sort_order = v.sort, stat_costs = v.stat_costs,
       choice_options = v.options, incompatible_skills = v.incompatible, active = true
  from tmp_tratti v
 where lower(t.name) = lower(v.name);

insert into public.traits (name, kind, cost, effect, choice, unique_group, requires_master, modifiers, sort_order, active,
                           stat_costs, choice_options, incompatible_skills)
select v.name, v.kind, v.cost, v.effect, v.choice, v.grp, false, v.modifiers, v.sort, true, v.stat_costs, v.options, v.incompatible
  from tmp_tratti v
 where not exists (select 1 from public.traits t where lower(t.name) = lower(v.name));

drop table tmp_tratti;

-- Sangue del drago (non e' nel documento): resta solo con il permesso del Master, in fondo ai vantaggi
update public.traits set sort_order = 50 where lower(name) = 'sangue del drago';

-- Controllo finale: 29 vantaggi del documento (+ Sangue del drago) e 17 svantaggi
select kind, count(*) as tratti from public.traits where active group by kind order by kind;
