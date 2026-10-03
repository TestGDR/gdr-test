import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import type { Dragon, DragonStage, TraitPair } from "@/lib/dragons";
import { requirePermission } from "@/lib/staff";
import DragonsManager, { type HouseLite, type PgLite } from "./DragonsManager";

export default async function DraghiPage() {
  const { supabase } = await requirePermission("draghi.gestire");

  const [houses, dragons, stages, traits, pgs] = await Promise.all([
    supabase.from("houses").select("id, name, sigil_url").order("sort_order").order("name"),
    supabase.from("dragons").select("*").order("created_at"),
    supabase.from("dragon_stages").select("*").order("sort_order"),
    supabase.from("dragon_trait_pairs").select("*").order("pregio"),
    supabase.from("characters").select("id, name, house_id, px, status").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Draghi" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Draghi</h1>
      <DragonsManager
        houses={(houses.data ?? []) as HouseLite[]}
        dragons={(dragons.data ?? []) as Dragon[]}
        stages={(stages.data ?? []) as DragonStage[]}
        traits={(traits.data ?? []) as TraitPair[]}
        pgs={(pgs.data ?? []) as PgLite[]}
      />
    </div>
  );
}
