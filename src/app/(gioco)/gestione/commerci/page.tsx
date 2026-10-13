import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import TradeManager from "./TradeManager";

export default async function CommerciPage() {
  const { supabase } = await requirePermission("economia.gestire");
  const [{ data: houses }, { data: resources }] = await Promise.all([
    supabase.from("houses").select("id, name, playable").order("name"),
    supabase.from("resources").select("id, name").order("sort_order").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <GameArea title="Commerci" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Commerci</h1>
      <TradeManager houses={houses ?? []} resources={resources ?? []} />
    </div>
  );
}
