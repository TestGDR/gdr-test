import Link from "next/link";
import InactiveBanner from "@/components/InactiveBanner";
import { GameArea } from "@/components/game/GameShell";
import { getMainCharacter } from "@/lib/main-character";
import { requireUser } from "@/lib/supabase/server";
import type { GameMap, Location } from "@/lib/types";

export default async function MappaPage({ searchParams }: PageProps<"/mappa">) {
  const { supabase, user } = await requireUser();
  const character = await getMainCharacter(supabase, user.id);
  const { id } = await searchParams;

  const { data: maps } = await supabase.from("maps").select("*").order("sort_order");
  const allMaps = (maps ?? []) as GameMap[];
  const map = allMaps.find((m) => m.id === id) ?? allMaps[0];

  if (!map) {
    return <p className="text-muted">Nessuna mappa presente. Esegui lo script seed.sql su Supabase.</p>;
  }

  const { data: locs } = await supabase
    .from("locations")
    .select("*")
    .eq("map_id", map.id)
    .order("name");
  const locations = (locs ?? []) as Location[];

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title={map.name} image={map.image_url} />
      {character?.status !== "attivo" && <InactiveBanner />}

      <div className="flex flex-col overflow-hidden rounded-md border border-border bg-black/50 shadow-2xl shadow-black lg:flex-row">
        {/* Descrizione ed elenco dei luoghi */}
        <section className="border-b border-border p-4 lg:w-72 lg:shrink-0 lg:border-r lg:border-b-0">
          <h2 className="font-serif text-lg tracking-[0.12em] text-accent uppercase">{map.name}</h2>
          {map.description && <p className="mt-3 text-sm leading-relaxed text-muted">{map.description}</p>}

          {allMaps.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {allMaps.map((m) => (
                <Link
                  key={m.id}
                  href={`/mappa?id=${m.id}`}
                  className={`rounded border px-2 py-1 ${
                    m.id === map.id ? "border-accent text-accent" : "border-border text-muted hover:text-accent"
                  }`}
                >
                  {m.name}
                </Link>
              ))}
            </div>
          )}

          <h3 className="mt-5 mb-2 text-xs tracking-[0.15em] text-muted uppercase">Luoghi</h3>
          <ul className="grid grid-cols-2 gap-1 text-sm lg:grid-cols-1">
            {locations.map((loc) => (
              <li key={loc.id}>
                <Link
                  href={`/luogo/${loc.id}`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-blood/25 hover:text-accent"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <span className="truncate">{loc.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Mappa con i punti cliccabili */}
        <div className="relative min-w-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={map.image_url} alt={map.name} className="block w-full select-none" />
          {locations.map((loc) => (
            <Link
              key={loc.id}
              href={`/luogo/${loc.id}`}
              aria-label={loc.name}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
            >
              <span className="block h-4 w-4 rounded-full border-2 border-black bg-accent shadow-[0_0_10px_rgba(226,98,45,0.9)] transition group-hover:scale-125 md:h-5 md:w-5" />
              <span className="pointer-events-none absolute top-6 left-1/2 hidden -translate-x-1/2 rounded border border-border bg-black/90 px-2 py-1 text-sm whitespace-nowrap opacity-0 transition group-hover:opacity-100 md:block">
                {loc.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
