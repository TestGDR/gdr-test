// =====================================================================
// CATALOGO DEI PERMESSI STAFF
// Sono le caselle del pannello "Ruoli & Permessi". La chiave (es.
// "gestione.ruoli") e' quella salvata nel database e controllata dalle
// regole di sicurezza: non cambiarla dopo averla usata.
// "soon: true" = la funzione non esiste ancora, il permesso e' gia' pronto.
// =====================================================================

export type PermissionItem = { key: string; label: string; description: string; soon?: boolean };
export type PermissionSection = { id: string; title: string; description: string; items: PermissionItem[] };

export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    id: "gestione",
    title: "Pannelli di gestione",
    description: "Quali pannelli compaiono nella Gestione.",
    items: [
      { key: "gestione.ruoli", label: "Ruoli & Permessi", description: "Creare, modificare, eliminare e assegnare i ruoli staff" },
      { key: "gestione.accessi", label: "Registro accessi", description: "IP, controllo VPN e IP condivisi tra account; creazione, ultimo login e ultima azione dei PG" },
      { key: "mondo.gestire", label: "Gestione mondo", description: "Mappe, macroaree (luoghi, viaggio per terra e per mare, corvi, territori sicuri), gruppi e chat di gioco" },
      { key: "viaggi.gestire", label: "Viaggi e missive", description: "Percorsi, rotte dei corvi, andature, intercettazioni delle missive e posizione dei PG" },
      { key: "meteo.gestire", label: "Meteo", description: "Regioni climatiche, stagione, semi e meteo del giorno" },
      { key: "oggetti.gestire", label: "Oggetti", description: "Oggetti (categoria, nicchia, livello, all'iscrizione, al mercato), categorie, parti del corpo, qualità del fabbro, assegnare e togliere oggetti ai PG" },
      { key: "creazione.gestire", label: "Creazione personaggio", description: "Passaggi della creazione del PG: cosa chiede ognuno, testi, punti e campi personalizzati" },
      { key: "regole.gestire", label: "Abilità e tratti", description: "Catalogo delle abilità (con la statistica collegata) e dei vantaggi e svantaggi del regolamento" },
      { key: "economia.gestire", label: "Economia", description: "Risorse, tipi di feudo, strutture, feudi delle casate, tasse e tesoro" },
      { key: "casate.gestire", label: "Gestione casate", description: "Casate, ruoli (stipendi, iscrizione, descrizione), alberi genealogici, PNG e membri" },
      { key: "draghi.gestire", label: "Gestione draghi", description: "Draghi e uova delle casate, fasi di crescita, punteggi, abilità, pregi, difetti e caratteri" },
      { key: "documentazione.scrivere", label: "Manuale e Ambientazione", description: "Scrivere e modificare le pagine della documentazione" },
      { key: "utenti.gestire", label: "Gestione utenti", description: "Modificare, bannare ed eliminare gli account" },
      { key: "manutenzione.sito", label: "Manutenzione sito", description: "Pulire chat, missive e OFF vecchi ed eliminare gli account inattivi" },
    ],
  },
  {
    id: "schede",
    title: "Schede PG",
    description: "Cosa può fare sulle schede degli altri.",
    items: [
      { key: "schede.approvare", label: "Approvare e rimandare", description: "Approvare le schede in revisione", soon: true },
      { key: "schede.correggere", label: "Correggere una scheda", description: "Ritoccare anagrafica e caratteristiche altrui", soon: true },
      { key: "schede.background", label: "Correggere un background", description: "Riscrivere la storia di un PG", soon: true },
      { key: "schede.storia", label: "Leggere la Storia", description: "Leggere la Storia (background) dei personaggi, nascosta ai giocatori" },
      { key: "schede.abilita", label: "Abilità e tratti dei PG", description: "Pennina nelle pagine Abilità e Tratti della scheda: cambiare i livelli delle abilità, aggiungere e togliere vantaggi e svantaggi" },
      { key: "schede.gravidanze", label: "Gravidanze", description: "Vedere sempre la gravidanza delle PG (anche prima del 3° mese), con tentativi e sintomi del giorno" },
      { key: "schede.note_fato", label: "Note del Fato", description: "Scrivere e modificare le Note del Fato nella pagina Dati delle schede" },
    ],
  },
  {
    id: "chat",
    title: "Chat e moderazione",
    description: "Chat di gioco e log dei messaggi.",
    items: [
      { key: "chat.narrazione", label: "Narrazione master", description: "Scrivere messaggi di narrazione nelle chat di gioco" },
      { key: "chat.moderare", label: "Moderare le chat", description: "Eliminare nelle chat di gioco i messaggi scritti da altri" },
      { key: "chat.log", label: "Log chat", description: "Cercare e scaricare i log delle chat di gioco" },
      { key: "messaggi.log", label: "Log messaggi", description: "Cercare e scaricare missive (ON) e messaggi OFF" },
    ],
  },
  {
    id: "messaggi",
    title: "Messaggi, missive e ticket",
    description: "Comunicazioni con i giocatori.",
    items: [
      { key: "ticket.gestire", label: "Gestire i ticket", description: "Vedere tutti i ticket (anche quelli dei pettegolezzi), rispondere, prenderli in carico, sospenderli e chiuderli" },
      { key: "ticket.categorie", label: "Categorie dei ticket", description: "Aggiungere, modificare, riordinare ed eliminare le categorie dei ticket" },
      { key: "messaggi.tutti", label: "Messaggi OFF a tutti", description: "Scrivere nella conversazione \"Messaggi a tutti\" dei messaggi OFF" },
      { key: "missive.castello", label: "Archivio messaggi castello", description: "Leggere i cartigli arrivati con i corvi e riceverne l'avviso di SISTEMA" },
      { key: "missive.parti_da", label: "Missive: Parti da", description: "Scegliere il luogo da cui parte un cartiglio (per masterare e per i PNG)" },
    ],
  },
  {
    id: "gioco",
    title: "Gioco",
    description: "Pannelli dei giocatori.",
    items: [
      { key: "pettegolezzi.gestire", label: "Voci e pettegolezzi", description: "Approvare, modificare o rifiutare i pettegolezzi di fine giocata; dado e soglia" },
      { key: "ricerca.moderare", label: "Moderare la ricerca gioco", description: "Togliere le ricerche gioco degli altri giocatori" },
      { key: "assenze.gestire", label: "Gestire le assenze", description: "Togliere le assenze segnate dagli altri giocatori" },
    ],
  },
  {
    id: "forum",
    title: "Forum e bacheca",
    description: "Forum, annunci e comunicazioni.",
    items: [
      { key: "forum.moderare", label: "Moderare il forum", description: "Modificare ed eliminare gli interventi di tutti, chiudere, fissare e rendere importanti le discussioni" },
      { key: "forum.sezioni", label: "Gestire le sezioni", description: "Creare, modificare ed eliminare categorie e sezioni del forum" },
      { key: "notizie.on", label: "Notizie ON", description: "Scrivere, modificare ed eliminare le Notizie ON (dal mondo di gioco)" },
      { key: "annunci.globali", label: "Notizie OFF", description: "Scrivere, modificare ed eliminare le Notizie OFF" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_SECTIONS.flatMap((s) => s.items.map((i) => i.key));

export function isPermissionKey(key: string) {
  return ALL_PERMISSION_KEYS.includes(key);
}

// Permessi che aprono un pannello di Gestione: chi non ne ha nessuno non vede la rotella
export const MANAGEMENT_PERMISSIONS = [
  "gestione.ruoli",
  "gestione.accessi",
  "casate.gestire",
  "mondo.gestire",
  "viaggi.gestire",
  "meteo.gestire",
  "economia.gestire",
  "oggetti.gestire",
  "regole.gestire",
  "creazione.gestire",
  "draghi.gestire",
  "utenti.gestire",
  "manutenzione.sito",
  "chat.log",
  "messaggi.log",
];
