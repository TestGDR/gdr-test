-- =====================================================================
-- 0004 - Manuale di Gioco e Ambientazione
-- Eseguire in Supabase: SQL Editor -> New query -> incolla -> Run
--
-- Ogni riga e' una sottosezione. Per modificare i testi: Table Editor ->
-- guide_pages. Il campo "body" e' in Markdown:
--   **grassetto**  *corsivo*  - elenco  | tabelle |  > riquadro esempio
-- section_order ordina le sezioni, sort_order le sottosezioni al loro interno.
-- =====================================================================

create table public.guide_pages (
  id             uuid primary key default gen_random_uuid(),
  book           text not null check (book in ('manuale', 'ambientazione')),
  section        text not null,
  section_order  int  not null default 0,
  title          text not null,
  sort_order     int  not null default 0,
  body           text not null default '',
  updated_at     timestamptz not null default now()
);
create index guide_pages_book_idx on public.guide_pages(book, section_order, sort_order);

alter table public.guide_pages enable row level security;

-- Leggibile da tutti, anche da chi non e' iscritto; modificabile solo dallo staff
create policy "guide visibili a tutti" on public.guide_pages
  for select to anon, authenticated using (true);
create policy "guide modificabili dallo staff" on public.guide_pages
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select on public.guide_pages to anon, authenticated;
grant insert, update, delete on public.guide_pages to authenticated;

-- ---------------------------------------------------------------------
-- Contenuti di esempio (da sostituire)
-- ---------------------------------------------------------------------
insert into public.guide_pages (book, section, section_order, title, sort_order, body) values
('manuale', 'Primi passi', 1, 'Benvenuto a Westeros GDR', 1,
'Westeros GDR è un gioco di ruolo **play by chat**: ogni giocatore interpreta un personaggio e ne racconta azioni e parole nelle *liste*, le chat dei luoghi della mappa.

Per iniziare:
- crea il tuo personaggio all''iscrizione;
- leggi il **Regolamento** e l''**Ambientazione**;
- esplora la mappa ed entra in una lista.'),

('manuale', 'Primi passi', 1, 'Come si scrive in lista', 2,
'Ogni messaggio descrive **cosa fa** il personaggio. Il parlato va tra «caporali» o "virgolette" e viene evidenziato automaticamente.

> **Esempio**
> Si avvicina al bancone e appoggia una moneta di rame. «Una birra, e che sia fresca.»

I commenti del giocatore vanno scritti come **Fuori gioco (OFF)**.'),

('manuale', 'Primi passi', 1, 'Approvazione del personaggio', 3,
'Dopo l''iscrizione completa la scheda del personaggio con una breve storia. Lo staff potrà chiederti modifiche perché sia coerente con l''ambientazione.'),

('manuale', 'Sistema di gioco', 2, 'Statistiche del personaggio', 1,
'Ogni personaggio ha alcune statistiche che ne descrivono capacità e condizioni.

| Statistica | Come la percepisce il personaggio |
|---|---|
| Salute | «Mi sento bene», «Sono ferito» |
| Forza | «So di essere molto forte» |
| Destrezza | «Sono agile e veloce» |

On-game i personaggi non conoscono i numeri: percepiscono le proprie capacità **solo in termini narrativi**.

> **Esempio**
> Un personaggio con 13 di Forza non dirà mai «Ho tredici a Forza!», ma «So di essere molto forte».'),

('manuale', 'Regolamento', 3, 'Regole di comportamento', 1,
'- Rispetta gli altri giocatori, dentro e fuori dal gioco.
- Non usare informazioni che il tuo personaggio non può conoscere (*metagame*).
- Non decidere le azioni dei personaggi altrui (*powerplay*).
- Segui le indicazioni dei master.'),

('ambientazione', 'Il continente', 1, 'Westeros', 1,
'Il continente occidentale, diviso in regni un tempo indipendenti e ora sotto il **Trono di Spade**.

*Testo da completare.*'),

('ambientazione', 'Il continente', 1, 'Le terre oltre il mare stretto', 2,
'Essos e le Città Libere.

*Testo da completare.*'),

('ambientazione', 'Le Casate', 2, 'Le Grandi Casate', 1,
'| Casata | Sede | Motto |
|---|---|---|
| Stark | Grande Inverno | L''inverno sta arrivando |
| Lannister | Castel Granito | Udite il mio ruggito |
| Targaryen | Roccia del Drago | Fuoco e sangue |

*Tabella da completare.*'),

('ambientazione', 'Epoca di gioco', 3, 'Quando si svolge il gioco', 1,
'Indica qui l''anno e la situazione politica in cui è ambientato il gioco.

*Testo da completare.*');
