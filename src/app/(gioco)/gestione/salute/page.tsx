import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { normalizeSettings } from "@/lib/rules/settings";
import { loadStats } from "@/lib/rules/stats";
import { requirePermission } from "@/lib/staff";
import HealthSettings from "./HealthSettings";

export default async function SalutePage() {
  const { supabase } = await requirePermission("regole.gestire");
  const [settings, { data: skills }, stats] = await Promise.all([
    supabase.from("game_settings").select("data").maybeSingle(),
    supabase.from("skills").select("name, stat").order("name"),
    loadStats(supabase),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title="Salute, ferite e peso" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Salute, ferite e peso</h1>
      <HealthSettings
        initial={normalizeSettings(settings.data?.data)}
        skills={(skills ?? []) as { name: string; stat: string }[]}
        stats={stats.map((s) => ({ id: s.id, code: s.code, label: s.label }))}
        missing={!!settings.error}
      />
    </div>
  );
}
