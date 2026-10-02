import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import type { GameMap, Location, Room } from "@/lib/types";
import WorldManager from "./WorldManager";

export default async function MondoPage() {
  const { supabase } = await requirePermission("mondo.gestire");

  // Con il permesso si vedono anche le mappe spente (regole del database)
  const [maps, locations, rooms, houses] = await Promise.all([
    supabase.from("maps").select("*").order("sort_order").order("name"),
    supabase.from("locations").select("*").order("name"),
    supabase.from("rooms").select("*").order("sort_order").order("name"),
    supabase.from("houses").select("id, name").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Gestione mondo" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Gestione mondo</h1>
      <WorldManager
        maps={(maps.data ?? []) as GameMap[]}
        locations={(locations.data ?? []) as Location[]}
        rooms={(rooms.data ?? []) as Room[]}
        houses={houses.data ?? []}
      />
    </div>
  );
}
