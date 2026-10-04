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
      { key: "gestione.accessi", label: "Registro accessi", description: "IP, controllo VPN e IP condivisi tra account" },
      { key: "mondo.gestire", label: "Gestione mondo", description: "Mappe, luoghi e liste di gioco" },
      { key: "casate.gestire", label: "Gestione casate", description: "Casate, ruoli e stipendi, alberi genealogici, PNG e membri" },
      { key: "draghi.gestire", label: "Gestione draghi", description: "Draghi e uova delle casate, fasi di crescita e punteggi" },
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
    ],
  },
  {
    id: "chat",
    title: "Chat e moderazione",
    description: "Liste di gioco e messaggi.",
    items: [
      { key: "chat.narrazione", label: "Narrazione master", description: "Scrivere messaggi di narrazione nelle liste" },
      { key: "chat.moderare", label: "Moderare le liste", description: "Eliminare messaggi scritti da altri" },
      { key: "chat.log", label: "Log chat", description: "Cercare e scaricare i log delle chat di gioco" },
      { key: "messaggi.log", label: "Log messaggi", description: "Cercare e scaricare missive (ON) e messaggi OFF" },
      { key: "ticket.gestire", label: "Gestire i ticket", description: "Vedere tutti i ticket, rispondere, prenderli in carico, sospenderli e chiuderli" },
    ],
  },
  {
    id: "forum",
    title: "Forum e bacheca",
    description: "Forum, annunci e comunicazioni.",
    items: [
      { key: "forum.moderare", label: "Moderare il forum", description: "Modificare ed eliminare post altrui", soon: true },
      { key: "forum.sezioni", label: "Gestire le sezioni", description: "Creare ed eliminare sezioni del forum", soon: true },
      { key: "notizie.on", label: "Notizie ON", description: "Scrivere, modificare ed eliminare le Notizie ON (dal mondo di gioco)" },
      { key: "annunci.globali", label: "Annunci globali", description: "Scrivere, modificare ed eliminare le Notizie OFF" },
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
  "draghi.gestire",
  "utenti.gestire",
  "manutenzione.sito",
  "chat.log",
  "messaggi.log",
];
