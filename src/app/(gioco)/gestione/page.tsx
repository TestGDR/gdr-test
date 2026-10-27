import Link from "next/link";
import { notFound } from "next/navigation";
import { GameArea } from "@/components/game/GameShell";
import { getStaffContext } from "@/lib/staff";

// Sezioni della pagina, in quest'ordine
const SECTIONS = [
  { id: "personaggi", title: "Personaggi", hint: "Schede, creazione, PX, PNG, oggetti e draghi" },
  { id: "utenti", title: "Utenti e staff", hint: "Account, ruoli, iscrizioni, accessi e log" },
  { id: "gioco", title: "Gioco e chat", hint: "Chat, dadi e spie" },
  { id: "mondo", title: "Mondo", hint: "Mappe, data, meteo e viaggi" },
  { id: "casate", title: "Casate ed economia", hint: "Casate, feudi, commerci ed eserciti" },
  { id: "sito", title: "Sito", hint: "Manutenzione" },
] as const;

// Pannelli di gestione: ognuno compare solo a chi ha il relativo permesso
const PANELS: {
  section: (typeof SECTIONS)[number]["id"];
  permission: string | string[];
  href: string;
  title: string;
  description: string;
}[] = [
  {
    permission: "gestione.ruoli",
    section: "utenti",
    href: "/gestione/ruoli",
    title: "Ruoli & Permessi",
    description:
      "Crea i ruoli staff, scegli cosa possono fare e assegnali agli utenti.",
  },
  {
    permission: "utenti.gestire",
    section: "utenti",
    href: "/gestione/utenti",
    title: "Utenti",
    description: "Modifica, ban ed eliminazione degli account.",
  },
  {
    permission: "manutenzione.sito",
    section: "sito",
    href: "/gestione/manutenzione",
    title: "Manutenzione",
    description:
      "Pulizia di chat, missive e OFF vecchi; eliminazione dei personaggi inattivi.",
  },
  {
    permission: "iscrizioni.gestire",
    section: "utenti",
    href: "/gestione/iscrizioni",
    title: "Iscrizioni",
    description: "Apri e chiudi le iscrizioni: con le iscrizioni chiuse il pulsante Registrati della home è disattivato.",
  },
  {
    permission: ["chat.log", "messaggi.log"],
    section: "utenti",
    href: "/gestione/log",
    title: "Log",
    description:
      "Cerca e scarica i log delle chat, delle missive (ON) e dei messaggi OFF.",
  },
  {
    permission: "gestione.accessi",
    section: "utenti",
    href: "/gestione/accessi",
    title: "Registro accessi",
    description: "IP di accesso, controllo VPN e IP condivisi tra account.",
  },
  {
    permission: "casate.gestire",
    section: "casate",
    href: "/gestione/casate",
    title: "Casate",
    description:
      "Stemmi, ruoli e stipendi, alberi genealogici, PNG e PG di ogni casata.",
  },
  {
    permission: "px.assegnare",
    section: "personaggi",
    href: "/gestione/px",
    title: "Assegna PX",
    description: "Dai PX a uno o più personaggi, con il motivo: si aggiungono a quelli che hanno e arriva un messaggio di SISTEMA.",
  },
  {
    permission: "draghi.gestire",
    section: "personaggi",
    href: "/gestione/draghi",
    title: "Draghi",
    description:
      "Draghi e uova delle casate, dotazione iniziale, fasi di crescita e punteggi.",
  },
  {
    permission: "meteo.gestire",
    section: "mondo",
    href: "/gestione/meteo",
    title: "Meteo",
    description:
      "Regioni climatiche, stagione attuale, semi (modelli di giornata) e meteo di oggi.",
  },
  {
    permission: "economia.gestire",
    section: "casate",
    href: "/gestione/commerci",
    title: "Commerci",
    description:
      "Tratte commerciali delle casate: proponi, accetta, annulla e rinnova per conto delle casate PNG.",
  },
  {
    permission: "economia.gestire",
    section: "casate",
    href: "/gestione/economia",
    title: "Economia",
    description:
      "Risorse, tipi di feudo con i loro introiti, strutture, feudi delle casate e tesoro.",
  },
  {
    permission: "eserciti.gestire",
    section: "casate",
    href: "/gestione/eserciti",
    title: "Eserciti",
    description:
      "Tipi di truppa con forze e debolezze, truppe delle casate PG e PNG, regni e potenza.",
  },
  {
    permission: "oggetti.gestire",
    section: "personaggi",
    href: "/gestione/oggetti",
    title: "Oggetti",
    description:
      "Oggetti indossabili e negozio, parti del corpo, oggetti da assegnare ai PG.",
  },
  {
    permission: "creazione.gestire",
    section: "personaggi",
    href: "/gestione/creazione",
    title: "Creazione personaggio",
    description:
      "Passaggi della creazione del PG, cosa chiede ognuno (punti, testi, campi nuovi) e anteprima.",
  },
  {
    permission: "dadi.gestire",
    section: "gioco",
    href: "/gestione/dadi",
    title: "Dadi",
    description:
      "Tiri usabili in chat: formule (es. STAT + ABILITA + 1d10, 2d5), regole condizionali ed esiti.",
  },
  {
    permission: "regole.gestire",
    section: "personaggi",
    href: "/gestione/salute",
    title: "Salute, ferite e peso",
    description:
      "Recupero della Stamina, ferite critiche con malus e guarigione, cosa ostacola ogni ferita, soglie del peso trasportato.",
  },
  {
    permission: "regole.gestire",
    section: "personaggi",
    href: "/gestione/regole",
    title: "Statistiche, abilità e tratti",
    description:
      "Statistiche del personaggio (sigle usate anche nei dadi), abilità con la statistica collegata, vantaggi e svantaggi con i loro effetti sui tiri.",
  },
  {
    permission: "viaggi.gestire",
    section: "mondo",
    href: "/gestione/viaggi",
    title: "Viaggi",
    description:
      "Percorsi tra le macroaree (anche di mappe diverse), andature, rotte dei corvi, missive e posizione dei personaggi.",
  },
  {
    permission: "mondo.gestire",
    section: "mondo",
    href: "/gestione/data",
    title: "Data di gioco",
    description:
      "Data ON che scorre da sola (1 giorno reale = 1 giorno ON): correzione dell'anno e dei giorni.",
  },
  {
    permission: ["chat.narrazione", "chat.moderare"],
    section: "gioco",
    href: "/gestione/spie",
    title: "Spie",
    description: "Missioni delle spie dei personaggi: richieste, esito del dado, rapporto per il giocatore, spie catturate, regole e costi.",
  },
  {
    permission: "png.gestire",
    section: "personaggi",
    href: "/gestione/png",
    title: "PNG",
    description: "Anagrafe dei personaggi non giocanti: crearli con la stessa scheda dei PG e usarli nelle chat.",
  },
  {
    permission: "mondo.gestire",
    section: "gioco",
    href: "/gestione/chat",
    title: "Chat",
    description:
      "Impostazioni delle chat di gioco: limite di caratteri delle azioni.",
  },
  {
    permission: "mondo.gestire",
    section: "mondo",
    href: "/gestione/mondo",
    title: "Gestione mondo",
    description:
      "Mappe principali da attivare e spegnere, macroaree sulla mappa, chat pubbliche e private.",
  },
];

export default async function GestionePage() {
  const { isAdmin, role, permissions } = await getStaffContext();
  // sempre in ordine alfabetico, anche quando se ne aggiungono di nuove
  const visible = PANELS.filter((p) =>
    [p.permission].flat().some((k) => permissions.has(k)),
  ).sort((x, y) =>
    x.title.localeCompare(y.title, "it", { sensitivity: "base" }),
  );
  // Senza nessun pannello (giocatori, master) la pagina "non esiste"
  if (visible.length === 0) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title="Gestione" />
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl tracking-wide text-accent">
          Gestione
        </h1>
        <p className="text-sm text-muted">
          Il tuo ruolo:{" "}
          {isAdmin ? (
            <strong className="text-accent">Admin (tutti i permessi)</strong>
          ) : (
            <strong style={{ color: role?.color }}>
              {role?.name ?? "Giocatore"}
            </strong>
          )}
        </p>
      </div>

      {visible.length === 0 && (
        <p className="text-muted">
          Il tuo ruolo non ha ancora accesso a nessun pannello.
        </p>
      )}

      {/* Elenco diviso per sezioni: titolo e, sotto, la descrizione */}
      <div className="space-y-8">
        {SECTIONS.map((sec) => {
          const list = visible.filter((p) => p.section === sec.id);
          if (!list.length) return null;
          return (
            <section key={sec.id}>
              <h2 className="mb-1 flex flex-wrap items-baseline gap-x-3 border-b border-accent/40 pb-1.5 font-serif text-2xl tracking-wide text-foreground">
                {sec.title}
                <span className="font-sans text-xs tracking-normal text-muted">{sec.hint}</span>
              </h2>
              <ul className="divide-y divide-border/60">
                {list.map((panel) => (
                  <li key={panel.href}>
                    <Link
                      href={panel.href}
                      className="group block px-3 py-3 transition hover:bg-blood/10"
                    >
                      <h3 className="font-serif text-xl text-accent group-hover:underline">
                        {panel.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-muted">{panel.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
