import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import GameClockEditor from "./GameClockEditor";

export default async function DataDiGiocoPage() {
  const { supabase } = await requirePermission("mondo.gestire");
  const [{ data: clock }, { data: today }] = await Promise.all([
    supabase.from("game_clock").select("year_offset, day_shift").eq("id", 1).maybeSingle(),
    supabase.rpc("game_today"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <GameArea title="Data di gioco" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">Data di gioco</h1>
      <p className="mb-6 text-sm text-muted">
        La data di gioco scorre da sola: 1 giorno reale = 1 giorno ON, con giorni e lune come il calendario reale
        (gennaio = Prima Luna). Qui puoi correggere l&apos;anno e spostare la data di qualche giorno. Le età dei PG con
        una data di nascita si aggiornano da sole ai compleanni.
      </p>
      <GameClockEditor
        clock={{ year_offset: clock?.year_offset ?? -1663, day_shift: clock?.day_shift ?? 0 }}
        today={((today ?? []) as { day: number; month: number; year: number }[])[0] ?? null}
      />
    </div>
  );
}
