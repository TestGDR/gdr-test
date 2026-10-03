import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import Maintenance from "./Maintenance";

export default async function ManutenzionePage() {
  await requirePermission("manutenzione.sito");
  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title="Manutenzione" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">Manutenzione del sito</h1>
      <p className="mb-6 text-sm text-muted">
        Pulizie definitive: quello che elimini qui non si può recuperare. Prima di ogni eliminazione vedi quanti elementi verranno
        cancellati.
      </p>
      <Maintenance />
    </div>
  );
}
