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
    permission: "mondo.gestire",
    href: null,
    title: "Gestione mondo",
    description: "Mappe, luoghi e liste di gioco.",
  },
];

export default async function GestionePage() {
  const { isAdmin, role, permissions } = await getStaffContext();
  const visible = PANELS.filter((p) => permissions.has(p.permission));
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
