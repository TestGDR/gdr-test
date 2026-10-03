import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import type { GameMap } from "@/lib/types";
import type { Season, WeatherRegion, WeatherSeed } from "@/lib/weather";
import WeatherManager from "./WeatherManager";

export default async function MeteoPage() {
  const { supabase } = await requirePermission("mondo.gestire");

  const [regions, seeds, settings, maps] = await Promise.all([
    supabase.from("weather_regions").select("*").order("sort_order").order("name"),
    supabase.from("weather_seeds").select("*").order("sort_order").order("name"),
    supabase.from("weather_settings").select("current_season").maybeSingle(),
    supabase.from("maps").select("*").order("sort_order").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Meteo" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Meteo</h1>
      <WeatherManager
        regions={(regions.data ?? []) as WeatherRegion[]}
        seeds={(seeds.data ?? []) as WeatherSeed[]}
        season={(settings.data?.current_season ?? "autunno") as Season}
        maps={(maps.data ?? []) as GameMap[]}
      />
    </div>
  );
}
