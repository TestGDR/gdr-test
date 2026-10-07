import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { loadFlow } from "@/lib/creation-flow";
import { requirePermission } from "@/lib/staff";
import CreationBuilder from "./CreationBuilder";

export default async function CreazionePage() {
  const { supabase } = await requirePermission("creazione.gestire");
  const steps = await loadFlow(supabase);

  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title="Creazione personaggio" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">
        Creazione personaggio
      </h1>
      <p className="mb-6 text-sm text-muted">
        Decidi i passaggi della creazione e cosa chiede ognuno. Le modifiche
        valgono subito per chi crea un personaggio da adesso; chi è a metà
        creazione ritrova le scelte già fatte. L&apos;ultimo passaggio è sempre
        il riepilogo.
      </p>
      <CreationBuilder steps={steps} />
    </div>
  );
}
