import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import TravelManager, { type TravelSettings } from "./TravelManager";

export default async function ViaggiPage() {
  const { supabase } = await requirePermission("mondo.gestire");
  const { data } = await supabase
    .from("missive_settings")
    .select("walk_full_hours, horse_full_hours, dragon_full_hours, pace_slow_factor, pace_fast_factor")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title="Viaggi" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Viaggi</h1>
      {data ? (
        <TravelManager settings={data as TravelSettings} />
      ) : (
        <p className="text-red-400">Impostazioni non trovate: esegui le migrazioni 0053 e 0054.</p>
      )}
    </div>
  );
}
