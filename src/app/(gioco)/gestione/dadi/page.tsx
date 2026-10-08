import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import DiceManager, { type DiceTypeRow } from "./DiceManager";

export default async function DadiPage() {
  const { supabase } = await requirePermission("dadi.gestire");
  const { data } = await supabase
    .from("dice_types")
    .select("*")
    .order("sort_order")
    .order("name");

  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title="Dadi" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">
        Dadi
      </h1>
      <p className="mb-6 text-sm text-muted">
        I tiri che i giocatori usano in chat (pulsante 🎲 Dadi): una formula e
        delle regole che si applicano in base al risultato. Il tiro lo calcola
        il server, quindi nessuno può falsificarlo.
      </p>
      <DiceManager dice={(data ?? []) as DiceTypeRow[]} />
    </div>
  );
}
