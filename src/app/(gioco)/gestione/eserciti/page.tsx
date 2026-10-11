import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import ArmiesManager, { type HouseLite } from "./ArmiesManager";

export default async function EserciciPage() {
  const { supabase } = await requirePermission("eserciti.gestire");
  const { data: houses } = await supabase.from("houses").select("id, name, playable").order("name");

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title="Eserciti" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Eserciti</h1>
      <ArmiesManager houses={(houses ?? []) as HouseLite[]} />
    </div>
  );
}
