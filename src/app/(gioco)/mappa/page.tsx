import Link from "next/link";
import InactiveBanner from "@/components/InactiveBanner";
import { GameArea } from "@/components/game/GameShell";
import { getMainCharacter } from "@/lib/main-character";
import { requireUser } from "@/lib/supabase/server";
import type { GameMap, Location, Room } from "@/lib/types";
import type { ActiveRental } from "@/lib/world";
import MapView from "./MapView";

export default async function MappaPage({ searchParams }: PageProps<"/mappa">) {
  const { supabase, user } = await requireUser();
  const character = await getMainCharacter(supabase, user.id);
  const { id, luogo } = await searchParams;

  // Solo le mappe attive (anche lo staff qui vede la mappa di gioco)
  const { data: maps } = await supabase.from("maps").select("*").eq("active", true).order("sort_order").order("name");
  const allMaps = (maps ?? []) as GameMap[];
  const map = allMaps.find((m) => m.id === id) ?? allMaps[0];

  if (!map) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <GameArea title="Mappa" />
        <p className="text-muted">Nessuna mappa attiva al momento.</p>
      </div>
    );
  }

  const { data: locs } = await supabase.from("locations").select("*").eq("map_id", map.id).order("name");
  const locations = (locs ?? []) as Location[];
  const locationIds = locations.map((l) => l.id);

  const [{ data: rooms }, { data: houses }, { data: rentals }] = await Promise.all([
    supabase.from("rooms").select("*").in("location_id", locationIds).order("sort_order").order("name"),
    supabase.from("houses").select("id, name"),
    supabase
      .from("room_rentals")
      .select("room_id, ends_at, character_id, character:characters(name, owner_id)")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <GameArea title={map.name} image={map.image_url} />
      {character?.status !== "attivo" && <InactiveBanner />}

      {allMaps.length > 1 && (
        <nav className="mb-3 flex flex-wrap justify-center gap-2 text-xs">
          {allMaps.map((m) => (
            <Link
              key={m.id}
              href={`/mappa?id=${m.id}`}
              className={`rounded border px-2 py-1 ${m.id === map.id ? "border-accent text-accent" : "border-border text-muted hover:text-accent"}`}
            >
              {m.name}
            </Link>
          ))}
        </nav>
      )}

      <MapView
        key={map.id}
        map={map}
        locations={locations}
        rooms={(rooms ?? []) as Room[]}
        houses={houses ?? []}
        rentals={(rentals ?? []) as unknown as ActiveRental[]}
        userId={user.id}
        initialLocationId={typeof luogo === "string" ? luogo : null}
      />
    </div>
  );
}
