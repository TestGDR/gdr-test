-- =====================================================================
-- 0158 - Tratti, versione 2 del documento: 20 vantaggi e 20 svantaggi,
--        meta' con effetto sui tiri e meta' narrativi
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
-- Si puo' eseguire piu' volte senza danni.
--
-- - Tratti narrativi: nessun bonus sui tiri. Il giocatore scrive una riga
--   che li concretizza (chi e' l'alleato, quale segreto...) e il master la
--   usa nella storia. La riga si salva insieme al tratto del personaggio.
-- - I tratti che non sono nel documento si disattivano: non si scelgono
--   piu', ma chi li ha gia' li tiene.
-- - Rete di spie: la prima spia gia' reclutata e fino a 3 spie.
-- =====================================================================

alter table public.traits add column if not exists narrative boolean not null default false;
alter table public.character_traits add column if not exists note text check (note is null or char_length(note) <= 300);

-- Rete di spie: da' la prima spia e alza il limite (prima erano due tratti)
update public.spy_settings set trait_name = 'Rete di spie', first_spy_trait = 'Rete di spie';

drop table if exists tmp_tratti;
create temporary table tmp_tratti (
  name text, kind text, cost int, effect text, choice text, grp text, narrative boolean,
  modifiers jsonb, sort int, stat_costs jsonb, options text[]
);

insert into tmp_tratti values
  -- Vantaggi con effetto sui tiri (12)
  ('Talento', 'vantaggio', 1, '+1 a tutti i tiri di un''abilità a scelta.', 'abilita', null, false,
   '[{"target":"choice_skill","value":1}]', 1, null, null),
  ('Specialista', 'vantaggio', 1, '+2 a un''abilità a scelta, solo in una situazione precisa (per esempio Armi da tiro da cavallo).', 'abilita', null, false,
   '[{"target":"choice_skill","value":2,"condition":"situazione precisa"}]', 2, null, null),
  ('Talento di statistica', 'vantaggio', 3, '+1 a tutti i tiri con una statistica a scelta (se ne può avere una sola). Costo: TEM 1, VIG 2, EMP 2, INT 3, CAR 3, RIF 4.', 'statistica', 'talento_statistica', false,
   '[{"target":"choice_stat","value":1}]', 3, '{"will":1,"body":2,"emp":2,"int":3,"pre":3,"ref":4}', null),
  ('Erudito', 'vantaggio', 1, '+2 a Conoscenze o Medicina (a scelta).', 'abilita', null, false,
   '[{"target":"choice_skill","value":2}]', 4, null, array['Conoscenze', 'Medicina']),
  ('Riflessi pronti', 'vantaggio', 2, '+2 all''iniziativa.', 'nessuna', null, false,
   '[{"target":"initiative","value":2}]', 5, null, null),
  ('Salute di ferro', 'vantaggio', 2, '+2 a Resistenza, +1 ai tiri contro infezione e febbre.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Resistenza","value":2},{"target":"other","value":1,"condition":"tiri contro infezione e febbre"}]', 6, null, null),
  ('Combattente nato', 'vantaggio', 2, '+2 a un''abilità di combattimento a scelta.', 'abilita', null, false,
   '[{"target":"choice_skill","value":2}]', 7, null,
   array['Armi da impatto', 'Armi da taglio leggere', 'Armi da taglio pesanti', 'Armi da tiro', 'Armi in asta', 'Lotta', 'Parare', 'Schivare']),
  ('Legame col drago', 'vantaggio', 2, '+2 a un''abilità sui draghi a scelta (Cavalcare un Drago, Addestrare un drago o Comandare un drago).', 'abilita', null, false,
   '[{"target":"choice_skill","value":2}]', 8, null, array['Cavalcare un Drago', 'Addestrare un drago', 'Comandare un drago']),
  ('Lingua d''oro', 'vantaggio', 2, '+2 a Persuadere.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Persuadere","value":2}]', 9, null, null),
  ('Comandante nato', 'vantaggio', 2, '+2 a Comando.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Comando","value":2}]', 10, null, null),
  ('Occhio per le menzogne', 'vantaggio', 2, '+2 a Percepire Intenzioni.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Percepire Intenzioni","value":2}]', 11, null, null),
  ('Sguardo che gela', 'vantaggio', 2, '+2 a Intimidire.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Intimidire","value":2}]', 12, null, null),
  -- Vantaggi narrativi (6; Sangue nobile e Titolo o terre tolti)
  ('Alleato potente', 'vantaggio', 2, 'Un personaggio o una casata influente ti sostiene. Chi è e cosa può darti si decide col master.', 'nessuna', null, true, '[]', 20, null, null),
  ('Rete di spie', 'vantaggio', 2, 'Inizi con una spia già reclutata (pannello Spie) e puoi averne fino a 3 invece di 1; le altre vanno comunque reclutate.', 'nessuna', null, true, '[]', 22, null, null),
  ('Fedele compagno', 'vantaggio', 1, 'Uno scudiero o servitore leale ti segue, gestito come PNG.', 'nessuna', null, true, '[]', 24, null, null),
  ('Favore da riscuotere', 'vantaggio', 1, 'Una volta per campagna qualcuno di importante ti deve un favore.', 'nessuna', null, true, '[]', 25, null, null),
  ('Segreto utile', 'vantaggio', 1, 'Conosci qualcosa di compromettente su un nobile o una casata. Il master decide quando e come può servirti.', 'nessuna', null, true, '[]', 26, null, null),
  ('Mentore', 'vantaggio', 1, 'Un maestro ti ha formato e ti offre consigli, introduzioni e contatti.', 'nessuna', null, true, '[]', 27, null, null),

  -- Svantaggi con effetto sui tiri (12)
  ('Debolezza di statistica', 'svantaggio', 3, '−1 a tutti i tiri con una statistica a scelta (se ne può avere una sola). Valore: TEM 1, VIG 2, EMP 2, INT 3, CAR 3, RIF 4.', 'statistica', 'debolezza_statistica', false,
   '[{"target":"choice_stat","value":-1}]', 1, '{"will":1,"body":2,"emp":2,"int":3,"pre":3,"ref":4}', null),
  ('Zoppia', 'svantaggio', 2, '−2 a Atletica e Schivare, Corsa −3 metri.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Atletica","value":-2},{"target":"skill","skill":"Schivare","value":-2},{"target":"run","value":-3}]', 2, null, null),
  ('Vista debole', 'svantaggio', 2, '−2 a Osservazione e Armi da tiro.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Osservazione","value":-2},{"target":"skill","skill":"Armi da tiro","value":-2}]', 3, null, null),
  ('Salute fragile', 'svantaggio', 2, '−2 a Resistenza, −1 ai tiri contro infezione e febbre, −5 HP.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Resistenza","value":-2},{"target":"other","value":-1,"condition":"tiri contro infezione e febbre"},{"target":"hp","value":-5}]', 4, null, null),
  ('Codardo', 'svantaggio', 2, '−2 a Coraggio e Autocontrollo quando la vita è in pericolo.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Coraggio","value":-2,"condition":"vita in pericolo"},{"target":"skill","skill":"Autocontrollo","value":-2,"condition":"vita in pericolo"}]', 5, null, null),
  ('Cattiva fama', 'svantaggio', 2, '−2 a Persuadere, Seduzione e Comando con chi conosce la tua reputazione.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Persuadere","value":-2,"condition":"con chi conosce la tua reputazione"},{"target":"skill","skill":"Seduzione","value":-2,"condition":"con chi conosce la tua reputazione"},{"target":"skill","skill":"Comando","value":-2,"condition":"con chi conosce la tua reputazione"}]', 6, null, null),
  ('Dipendenza dal vino', 'svantaggio', 2, 'Senza bere: −1 a tutti i tiri dopo un giorno, −2 dopo due, −3 dal terzo. Rifiutare un''offerta richiede un tiro di Autocontrollo.', 'nessuna', null, false,
   '[{"target":"other","value":-1,"condition":"dopo un giorno senza bere (−2 dopo due, −3 dal terzo)"}]', 7, null, null),
  ('Riflessi lenti', 'svantaggio', 1, '−2 all''iniziativa.', 'nessuna', null, false,
   '[{"target":"initiative","value":-2}]', 8, null, null),
  ('Collerico', 'svantaggio', 1, '−2 a Persuadere e Dissimulare quando sei provocato o insultato.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Persuadere","value":-2,"condition":"provocato o insultato"},{"target":"skill","skill":"Dissimulare","value":-2,"condition":"provocato o insultato"}]', 9, null, null),
  ('Parlata impacciata', 'svantaggio', 1, '−2 a Persuadere.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Persuadere","value":-2}]', 10, null, null),
  ('Ignorante', 'svantaggio', 1, '−2 a Conoscenze e Lingue.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Conoscenze","value":-2},{"target":"skill","skill":"Lingue","value":-2}]', 11, null, null),
  ('Maldestro in sella', 'svantaggio', 1, '−2 a Equitazione.', 'nessuna', null, false,
   '[{"target":"skill","skill":"Equitazione","value":-2}]', 12, null, null),
  -- Svantaggi narrativi (7; Bastardo tolto)
  ('Nemico giurato', 'svantaggio', 2, 'Un personaggio o una casata ti ostacola. Chi è si decide col master.', 'nessuna', null, true, '[]', 20, null, null),
  ('Ricercato', 'svantaggio', 2, 'Hai una taglia sulla testa o un potente che ti vuole catturare.', 'nessuna', null, true, '[]', 22, null, null),
  ('Giuramento vincolante', 'svantaggio', 2, 'Hai giurato fedeltà o un voto che limita le tue scelte; infrangerlo ha conseguenze.', 'nessuna', null, true, '[]', 23, null, null),
  ('Segreto pericoloso', 'svantaggio', 2, 'Nascondi qualcosa che, se scoperto, ti rovina.', 'nessuna', null, true, '[]', 24, null, null),
  ('Debito', 'svantaggio', 1, 'Devi favori o denaro a una casata che prima o poi li riscuote.', 'nessuna', null, true, '[]', 25, null, null),
  ('Persona cara in pericolo', 'svantaggio', 1, 'Un familiare o una persona amata può essere minacciata o usata contro di te.', 'nessuna', null, true, '[]', 26, null, null),
  ('Codice d''onore', 'svantaggio', 1, 'Non menti, non tradisci e non colpisci a tradimento senza conseguenze; il master può metterti davanti a scelte difficili.', 'nessuna', null, true, '[]', 27, null, null);

update public.traits t
   set kind = v.kind, cost = v.cost, effect = v.effect, choice = v.choice, unique_group = v.grp,
       narrative = v.narrative, modifiers = v.modifiers, sort_order = v.sort, stat_costs = v.stat_costs,
       choice_options = v.options, incompatible_skills = null, active = true
  from tmp_tratti v
 where lower(t.name) = lower(v.name);

insert into public.traits (name, kind, cost, effect, choice, unique_group, requires_master, narrative, modifiers, sort_order, active,
                           stat_costs, choice_options)
select v.name, v.kind, v.cost, v.effect, v.choice, v.grp, false, v.narrative, v.modifiers, v.sort, true, v.stat_costs, v.options
  from tmp_tratti v
 where not exists (select 1 from public.traits t where lower(t.name) = lower(v.name));

-- Tutti gli altri tratti: disattivati (chi li ha gia' li tiene)
update public.traits t set active = false
 where not exists (select 1 from tmp_tratti v where lower(v.name) = lower(t.name));

drop table tmp_tratti;

-- Controllo finale: 18 vantaggi (6 narrativi) e 19 svantaggi (7 narrativi) attivi
select kind, count(*) as attivi, count(*) filter (where narrative) as narrativi
  from public.traits where active group by kind order by kind;
