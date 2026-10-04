import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import EconomyManager, { type HouseLite, type PlaceLite } from "./EconomyManager";

export default async function EconomiaPage() {
  const { supabase } = await requirePermission("economia.gestire");
  const [{ data: houses }, { data: places }] = await Promise.all([
    supabase.from("houses").select("id, name, playable").order("name"),
    supabase.from("locations").select("id, name").eq("kind", "luogo").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title="Economia" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Economia</h1>
      <EconomyManager houses={(houses ?? []) as HouseLite[]} places={(places ?? []) as PlaceLite[]} />
    </div>
  );
}
