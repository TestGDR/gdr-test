import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import GrantPx, { type GrantRow, type PgRow } from "./GrantPx";

// Gestione -> Assegna PX: PX in aggiunta a uno o piu' PG, con lo storico delle assegnazioni
export default async function PxPage() {
  const { supabase } = await requirePermission("px.assegnare");
  const [{ data: pgs }, { data: log, error }] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, px, house:houses(name)")
      .eq("status", "attivo")
      .eq("is_npc", false)
      .order("name"),
    supabase
      .from("px_log")
      .select("id, amount, reason, created_at, character:characters(name), by:profiles(username)")
      .eq("kind", "assegnati")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <GameArea title="Assegna PX" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">Assegna PX</h1>
      <p className="mb-6 text-sm text-muted">
        Scegli uno o più personaggi, quanti PX dare e il motivo. I PX si <strong className="text-foreground">aggiungono</strong>{" "}
        a quelli che hanno già (per correggere un valore usa la pennina nella scheda). A ognuno arriva un messaggio OFF da
        SISTEMA.
      </p>
      {error ? (
        <p className="text-sm text-red-400">Prima va eseguita la migrazione 0167 in Supabase.</p>
      ) : (
        <GrantPx pgs={(pgs ?? []) as unknown as PgRow[]} log={(log ?? []) as unknown as GrantRow[]} />
      )}
    </div>
  );
}
