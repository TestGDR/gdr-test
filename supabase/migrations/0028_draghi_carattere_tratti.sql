-- =====================================================================
-- 0028 - Draghi: il carattere racconta anche pregi e difetti
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni pregio e difetto ha una frase che descrive come si vede nel
-- comportamento del drago. Alla nascita il carattere diventa:
--   descrizione di base + frasi dei 2 pregi + frase del difetto
-- Lo staff puo' ricomporlo con i pregi e difetti attuali dal pannello.
-- =====================================================================

alter table public.dragon_trait_pairs
  add column pregio_text  text not null default '',
  add column difetto_text text not null default '';

update public.dragon_trait_pairs set
  pregio_text  = 'Si adatta a ogni clima: vola sereno tra le nevi del Nord come sotto il sole di Dorne, e non soffre i cambi di stagione.',
  difetto_text = 'Il suo limite è il clima: lontano dalle temperature a cui è abituato diventa fiacco, irritabile e si ammala facilmente.'
where pregio = 'adattabilità climatica';

update public.dragon_trait_pairs set
  pregio_text  = 'È nato per combattere: lo scontro lo esalta e affronta gli avversari con slancio e determinazione.',
  difetto_text = 'Il suo limite è un animo pacifista: evita lo scontro finché può, e in battaglia va spronato a lungo prima di attaccare.'
where pregio = 'combattivo';

update public.dragon_trait_pairs set
  pregio_text  = 'Ha scaglie spesse e una pelle coriacea: incassa colpi e frecce che ferirebbero gravemente un altro drago.',
  difetto_text = 'Il suo limite è un corpo fragile: le sue scaglie sono sottili e ogni ferita gli costa più del dovuto.'
where pregio = 'coriaceo';

update public.dragon_trait_pairs set
  pregio_text  = 'È docile: accetta di buon grado la sella, gli ordini e la vicinanza degli uomini della casata.',
  difetto_text = 'Il suo limite è l''aggressività: ringhia, morde e si scaglia contro chi lo infastidisce, a volte anche contro chi lo accudisce.'
where pregio = 'docile';

update public.dragon_trait_pairs set
  pregio_text  = 'Ha un forte istinto di guardia: veglia sul nido e sul suo cavaliere, e si accorge per primo dei pericoli.',
  difetto_text = 'Il suo limite è la pigrizia: dorme al sole appena può, si muove controvoglia e va convinto con la promessa di una preda.'
where pregio = 'istinto di guardia';

update public.dragon_trait_pairs set
  pregio_text  = 'È maestoso: la sua mole e il suo portamento incutono rispetto e soggezione a chiunque lo veda passare.',
  difetto_text = 'Il suo limite è un fisico striminzito: è più piccolo e magro dei suoi simili, e molti lo sottovalutano.'
where pregio = 'maestoso';

update public.dragon_trait_pairs set
  pregio_text  = 'Ha un animo nomade: ama i lunghi voli e le terre lontane, e si orienta senza fatica anche in luoghi sconosciuti.',
  difetto_text = 'Il suo limite è un forte senso del territorio: difende con ferocia il suo spazio e mal sopporta altri draghi vicino al nido.'
where pregio = 'nomade';

update public.dragon_trait_pairs set
  pregio_text  = 'Mangia poco: si accontenta di prede modeste e pesa meno degli altri sulle risorse della casata.',
  difetto_text = 'Il suo limite è una fame insaziabile: divora greggi intere e la sua fame pesa sulle risorse della casata.'
where pregio = 'poco affamato';

update public.dragon_trait_pairs set
  pregio_text  = 'È un predatore silenzioso: plana senza un rumore e piomba sulla preda prima che si accorga di lui.',
  difetto_text = 'Il suo limite è la caccia rumorosa: ruggisce, sbatte le ali e mette in fuga le prede ben prima di raggiungerle.'
where pregio = 'predatore silenzioso';

update public.dragon_trait_pairs set
  pregio_text  = 'Guarisce in fretta: ferite e bruciature che terrebbero un altro drago a terra per settimane gli passano in pochi giorni.',
  difetto_text = 'Il suo limite è una guarigione lenta: ogni ferita lo tiene a terra a lungo e lascia cicatrici profonde.'
where pregio = 'rigenerazione rapida';

update public.dragon_trait_pairs set
  pregio_text  = 'Sa dosare il suo soffio: può scaldare appena un focolare o incenerire una torre, a seconda di ciò che serve.',
  difetto_text = 'Il suo limite è un soffio incontrollato: quando si agita il fuoco gli sfugge, e più di una volta ha bruciato ciò che non doveva.'
where pregio = 'soffio modulabile';

update public.dragon_trait_pairs set
  pregio_text  = 'Ha una vista acutissima: scorge una lepre nell''erba da altezze in cui gli uomini sono solo puntini.',
  difetto_text = 'Il suo limite è la vista corta: vede male da lontano e si fida più del fiuto e dell''udito che degli occhi.'
where pregio = 'vista acuta';

update public.dragon_trait_pairs set
  pregio_text  = 'Ha una volontà di ferro: non si piega alle minacce, non si lascia intimidire e non cede alla paura.',
  difetto_text = 'Il suo limite è una volontà debole: si lascia influenzare facilmente e può essere sviato da chi sa come prenderlo.'
where pregio = 'volontà di ferro';

-- ---------------------------------------------------------------------
-- Carattere composto: descrizione di base (non gia' usata finche'
-- possibile) + frasi dei pregi + frase del difetto
-- ---------------------------------------------------------------------
create or replace function public.dragon_compose_temperament(p_pregi text[], p_difetti text[])
returns text
language plpgsql
volatile
security definer set search_path = ''
as $$
declare
  base text;
  extra text := '';
  line text;
begin
  select t.text into base from public.dragon_temperaments t
  where not exists (select 1 from public.dragons d where d.temperament like t.text || '%')
  order by random() limit 1;
  if base is null then
    select t.text into base from public.dragon_temperaments t order by random() limit 1;
  end if;

  for line in
    select p.pregio_text from public.dragon_trait_pairs p
    where p.pregio = any (coalesce(p_pregi, '{}')) and p.pregio_text <> ''
  loop
    extra := extra || ' ' || line;
  end loop;
  for line in
    select p.difetto_text from public.dragon_trait_pairs p
    where p.difetto = any (coalesce(p_difetti, '{}')) and p.difetto_text <> ''
  loop
    extra := extra || ' ' || line;
  end loop;

  return coalesce(base, '') || case when extra = '' then '' else E'\n\n' || trim(extra) end;
end;
$$;

revoke execute on function public.dragon_compose_temperament(text[], text[]) from public, anon;
grant execute on function public.dragon_compose_temperament(text[], text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Generazione casuale: ora il carattere include pregi e difetto estratti
-- ---------------------------------------------------------------------
create or replace function public.dragon_fill_random(p_id uuid, p_stage text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  palette text[] := array['Oro', 'Bianco', 'Blu', 'Nero', 'Rosso', 'Bronzo', 'Verde', 'Arancio'];
  cfg public.dragon_stages;
  st int[] := array[0, 0, 0, 0];       -- vigore, destrezza, intelletto, percezione
  sk int[] := array[0, 0, 0, 0, 0, 0]; -- volare, attacco fisico, attacco infuocato, schivare, fermezza, sensi
  remaining int;
  base int;
  k int;
  i int;
  c1 text;
  c2 text;
  pr text[] := '{}';
  df text[] := '{}';
  picks int[];
  rec record;
begin
  select * into cfg from public.dragon_stages where stage = p_stage;
  if cfg.stage is null then
    raise exception 'Fase sconosciuta: %', p_stage using errcode = 'P0001';
  end if;

  -- caratteristiche: punti a caso, mai oltre il tetto della fase
  remaining := least(cfg.stat_points, cfg.stat_cap * 4);
  while remaining > 0 loop
    k := 1 + floor(random() * 4)::int;
    if st[k] < cfg.stat_cap then
      st[k] := st[k] + 1;
      remaining := remaining - 1;
    end if;
  end loop;

  -- abilita'
  remaining := least(cfg.skill_points, 60);
  if cfg.sort_order >= 2 then
    -- da adolescente in su: omogenee, stessa base per tutte e il resto a caso su abilita' diverse
    base := remaining / 6;
    for i in 1..6 loop sk[i] := least(base, 10); end loop;
    remaining := remaining - base * 6;
    select array_agg(n order by random()) into picks from generate_series(1, 6) n;
    for i in 1..remaining loop
      sk[picks[i]] := least(sk[picks[i]] + 1, 10);
    end loop;
  else
    -- neonato e cucciolo: del tutto a caso (qualche abilita' puo' restare a 0)
    while remaining > 0 loop
      k := 1 + floor(random() * 6)::int;
      if sk[k] < 10 then
        sk[k] := sk[k] + 1;
        remaining := remaining - 1;
      end if;
    end loop;
  end if;

  -- 2 pregi e 1 difetto da tre coppie diverse: mai un pregio col suo opposto
  i := 0;
  for rec in select * from public.dragon_trait_pairs order by random() limit 3 loop
    i := i + 1;
    if i <= 2 then pr := pr || rec.pregio; else df := df || rec.difetto; end if;
  end loop;

  -- colore: uno solo o due diversi
  c1 := palette[1 + floor(random() * 8)::int];
  if random() < 0.5 then
    loop
      c2 := palette[1 + floor(random() * 8)::int];
      exit when c2 <> c1;
    end loop;
  end if;

  perform set_config('app.dragon_internal', '1', true);
  update public.dragons set
    status = 'drago',
    stage = p_stage,
    sex = case when random() < 0.5 then 'maschio' else 'femmina' end,
    color1 = c1,
    color2 = c2,
    pregi = pr,
    difetti = df,
    temperament = public.dragon_compose_temperament(pr, df),
    stats = jsonb_build_object('vigore', st[1], 'destrezza', st[2], 'intelletto', st[3], 'percezione', st[4]),
    skills = jsonb_build_object('volare', sk[1], 'attacco_fisico', sk[2], 'attacco_infuocato', sk[3],
                                'schivare', sk[4], 'fermezza', sk[5], 'sensi', sk[6]),
    unspent_points = 0,
    hatched_at = coalesce(hatched_at, now())
  where id = p_id;
  perform set_config('app.dragon_internal', '', true);
end;
$$;

revoke execute on function public.dragon_fill_random(uuid, text) from public, anon, authenticated;
