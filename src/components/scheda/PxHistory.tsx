"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import { useIsAdmin } from "./AdminText";

type Row = {
  id: number;
  amount: number;
  reason: string;
  kind: string | null;
  created_at: string;
  by: { username: string | null } | null;
};

// tipo di movimento (le righe vecchie senza tipo sono dei draghi o dello staff)
const KIND: Record<string, string> = {
  assegnati: "Assegnati",
  chat: "Chat",
  abilita: "Abilità",
  drago: "Drago",
  modifica: "Modifica admin",
};
const kindOf = (r: Pick<Row, "kind" | "amount">) =>
  r.kind ? (KIND[r.kind] ?? r.kind) : r.amount > 0 ? "Staff" : "Drago";

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

// Riquadro PX (pagina Caratteristiche): da spendere, spesi e, per gli admin,
// il pulsante dello storico
export default function PxBox({ character }: { character: Character }) {
  const isAdmin = useIsAdmin();
  const supabase = useMemo(() => createClient(), []);
  const [spent, setSpent] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  // spesi: abilita' e draghi (le correzioni dell'admin non contano)
  useEffect(() => {
    supabase
      .from("px_log")
      .select("amount, kind")
      .eq("character_id", character.id)
      .lt("amount", 0)
      .then(({ data, error }) => {
        if (error) return;
        setSpent(
          ((data ?? []) as { amount: number; kind: string | null }[])
            .filter((r) => r.kind !== "modifica")
            .reduce((a, r) => a - r.amount, 0),
        );
      });
  }, [supabase, character.id]);

  const left = `${character.px ?? 0}${character.px_half ? ",5" : ""}`;
  return (
    <div className="min-w-24 border border-accent/40 bg-black/30 px-3 py-2 text-center">
      <p className="text-[0.65rem] tracking-[0.16em] text-muted uppercase">PX</p>
      <dl className="mt-1 space-y-0.5 text-left text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Da spendere</dt>
          <dd className="font-serif text-base leading-tight text-accent">{left}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Spesi</dt>
          <dd className="font-serif text-base leading-tight text-foreground">{spent ?? "…"}</dd>
        </div>
      </dl>
      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 w-full border border-border/70 px-2 py-0.5 text-[0.65rem] tracking-[0.12em] text-muted uppercase hover:border-accent hover:text-accent"
          >
            Storico PX
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title={`Storico PX · ${character.name}`} size="lg">
            {open && <PxHistoryList characterId={character.id} />}
          </Modal>
        </>
      )}
    </div>
  );
}

// Elenco dei movimenti: si carica solo aprendo la finestra
function PxHistoryList({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase
      .from("px_log")
      .select("id, amount, reason, kind, created_at, by:profiles(username)")
      .eq("character_id", characterId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, [supabase, characterId]);

  if (!rows) return <p className="p-4 text-sm text-muted">Caricamento...</p>;
  if (!rows.length) return <p className="p-4 text-sm text-muted">Nessun movimento registrato.</p>;
  const gained = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const spent = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-muted">
        Guadagnati <strong className="text-green-400">+{gained}</strong> · spesi o tolti{" "}
        <strong className="text-red-400">−{spent}</strong>
        {rows.length >= 500 && " (ultimi 500 movimenti)"}
      </p>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel text-xs text-muted">
            <tr>
              <th className="p-2">Quando</th>
              <th className="p-2 text-right">PX</th>
              <th className="p-2">Tipo</th>
              <th className="p-2">Motivo</th>
              <th className="p-2">Da</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="whitespace-nowrap p-2 text-xs text-muted">{when(r.created_at)}</td>
                <td className={`p-2 text-right font-semibold ${r.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                  {r.amount > 0 ? `+${r.amount}` : `−${-r.amount}`}
                </td>
                <td className="whitespace-nowrap p-2 text-[#d8c39a]">{kindOf(r)}</td>
                <td className="p-2 break-words">{r.reason || "—"}</td>
                <td className="p-2 text-xs text-muted">{r.kind === "chat" ? "—" : (r.by?.username ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
