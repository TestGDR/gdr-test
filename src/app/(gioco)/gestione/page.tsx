import Link from "next/link";
import { notFound } from "next/navigation";
import { GameArea } from "@/components/game/GameShell";
import { getStaffContext } from "@/lib/staff";

// Pannelli di gestione: ognuno compare solo a chi ha il relativo permesso
const PANELS = [
  {
    permission: "gestione.ruoli",
    href: "/gestione/ruoli",
    title: "Ruoli & Permessi",
    description: "Crea i ruoli staff, scegli cosa possono fare e assegnali agli utenti.",
  },
  {
    permission: "utenti.gestire",
    href: "/gestione/utenti",
    title: "Utenti",
    description: "Modifica, ban ed eliminazione degli account.",
  },
  {
    permission: "manutenzione.sito",
    href: "/gestione/manutenzione",
    title: "Manutenzione",
    description: "Pulizia di chat, missive e OFF vecchi; eliminazione dei personaggi inattivi.",
  },
  {
    permission: ["chat.log", "messaggi.log"],
    href: "/gestione/log",
    title: "Log",
    description: "Cerca e scarica i log delle chat, delle missive (ON) e dei messaggi OFF.",
  },
  {
    permission: "gestione.accessi",
    href: "/gestione/accessi",
    title: "Registro accessi",
    description: "IP di accesso, controllo VPN e IP condivisi tra account.",
  },
  {
    permission: "casate.gestire",
    href: "/gestione/casate",
    title: "Casate",
    description: "Stemmi, ruoli e stipendi, alberi genealogici, PNG e PG di ogni casata.",
  },
  {
    permission: "draghi.gestire",
    href: "/gestione/draghi",
    title: "Draghi",
    description: "Draghi e uova delle casate, dotazione iniziale, fasi di crescita e punteggi.",
  },
  {
    permission: "meteo.gestire",
    href: "/gestione/meteo",
    title: "Meteo",
    description: "Regioni climatiche, stagione attuale, semi (modelli di giornata) e meteo di oggi.",
  },
  {
    permission: "viaggi.gestire",
    href: "/gestione/viaggi",
    title: "Viaggi",
    description: "Percorsi tra le macroaree (anche di mappe diverse), andature, rotte dei corvi, missive e posizione dei personaggi.",
  },
  {
    permission: "mondo.gestire",
    href: "/gestione/mondo",
    title: "Gestione mondo",
    description: "Mappe principali da attivare e spegnere, macroaree sulla mappa, chat pubbliche e private.",
  },
];

export default async function GestionePage() {
  const { isAdmin, role, permissions } = await getStaffContext();
  const visible = PANELS.filter((p) => [p.permission].flat().some((k) => permissions.has(k)));
  // Senza nessun pannello (giocatori, master) la pagina "non esiste"
  if (visible.length === 0) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title="Gestione" />
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl tracking-wide text-accent">Gestione</h1>
        <p className="text-sm text-muted">
          Il tuo ruolo:{" "}
          {isAdmin ? (
            <strong className="text-accent">Admin (tutti i permessi)</strong>
          ) : (
            <strong style={{ color: role?.color }}>{role?.name ?? "Giocatore"}</strong>
          )}
        </p>
      </div>

      {visible.length === 0 && (
        <p className="text-muted">Il tuo ruolo non ha ancora accesso a nessun pannello.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {visible.map((panel) => (
          <li key={panel.title}>
            {panel.href ? (
              <Link
                href={panel.href}
                className="block h-full rounded-md border border-border bg-black/50 p-5 transition hover:border-accent hover:bg-blood/10"
              >
                <h2 className="font-serif text-xl text-accent">{panel.title}</h2>
                <p className="mt-2 text-sm text-muted">{panel.description}</p>
              </Link>
            ) : (
              <div className="h-full rounded-md border border-border/60 bg-black/30 p-5 opacity-60">
                <h2 className="font-serif text-xl">
                  {panel.title}{" "}
                  <span className="ml-1 rounded border border-border px-1.5 py-0.5 align-middle text-[10px] tracking-wider uppercase">
                    in arrivo
                  </span>
                </h2>
                <p className="mt-2 text-sm text-muted">{panel.description}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
