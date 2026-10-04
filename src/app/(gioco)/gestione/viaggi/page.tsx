import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import TravelManager, { type MapRow, type PgRow, type PlaceRow, type TravelSettings } from "./TravelManager";

export default async function ViaggiPage() {
  const { supabase } = await requirePermission("mondo.gestire");
  // con il permesso si vedono anche mappe spente e i loro luoghi
  const [{ data: settings }, { data: maps }, { data: places }, { data: pgs }] = await Promise.all([
    supabase
      .from("missive_settings")
      .select("pace_slow_factor, pace_fast_factor, raven_intercept_pct, rider_intercept_pct, default_location_id")
      .maybeSingle(),
    supabase.from("maps").select("id, name, active").order("sort_order").order("name"),
    supabase.from("locations").select("id, name, map_id, in_game, has_ravens, kind").order("name"),
    supabase.from("characters").select("id, name, location_id").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title="Viaggi" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Viaggi</h1>
      {settings ? (
        <TravelManager
          settings={settings as TravelSettings}
          maps={(maps ?? []) as MapRow[]}
          places={(places ?? []) as PlaceRow[]}
          pgs={(pgs ?? []) as PgRow[]}
        />
      ) : (
        <p className="text-red-400">Impostazioni non trovate: esegui le migrazioni 0053 e 0054.</p>
      )}
    </div>
  );
}
