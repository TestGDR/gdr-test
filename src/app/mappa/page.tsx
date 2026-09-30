import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import type { GameMap, Location } from "@/lib/types";

export default async function MappaPage({ searchParams }: PageProps<"/mappa">) {
  const { supabase } = await requireUser();
  const { id } = await searchParams;

  const { data: maps } = await supabase.from("maps").select("*").order("sort_order");
  const allMaps = (maps ?? []) as GameMap[];
  const map = allMaps.find((m) => m.id === id) ?? allMaps[0];

  if (!map) {
    return <p className="text-muted">Nessuna mappa presente. Esegui lo script seed.sql su Supabase.</p>;
  }

  const { data: locs } = await supabase.from("locations").select("*").eq("map_id", map.id);
  const locations = (locs ?? []) as Location[];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-4">
        <h1 className="font-serif text-3xl text-accent">{map.name}</h1>
        {allMaps.length > 1 &&
          allMaps.map((m) => (
            <Link
              key={m.id}
              href={`/mappa?id=${m.id}`}
              className={m.id === map.id ? "text-accent" : "text-muted hover:text-accent"}
            >
              {m.name}
            </Link>
          ))}
      </div>
      {map.description && <p className="mb-4 text-muted">{map.description}</p>}

      <div className="relative overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={map.image_url} alt={map.name} className="block w-full select-none" />
        {locations.map((loc) => (
          <Link
            key={loc.id}
            href={`/luogo/${loc.id}`}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
          >
            <span className="block h-5 w-5 rounded-full border-2 border-background bg-accent shadow-lg ring-4 ring-accent/30 transition group-hover:scale-125" />
            <span className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap rounded bg-background/90 px-2 py-1 text-sm opacity-0 transition group-hover:opacity-100 sm:opacity-80">
              {loc.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
