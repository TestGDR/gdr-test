"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type PgRow = { id: string; name: string; px: number; house: { name: string } | null };
export type GrantRow = {
  id: number;
  amount: number;
  reason: string;
  created_at: string;
  character: { name: string } | null;
  by: { username: string | null } | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function GrantPx({ pgs, log }: { pgs: PgRow[]; log: GrantRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const name = (p: PgRow) => (p.house ? `${p.name} ${p.house.name}` : p.name);
  const shown = pgs.filter((p) => !q.trim() || name(p).toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const px = Math.trunc(Number(amount));
  const valid = picked.size > 0 && px >= 1 && px <= 1000 && reason.trim().length > 0;

  async function grant() {
    if (!valid) return;
    const who = pgs.filter((p) => picked.has(p.id));
    if (!window.confirm(`Dare ${px} PX a ${who.map((p) => p.name).join(", ")}?\nMotivo: ${reason.trim()}`)) return;
    setBusy(true);
    setMsg(null);
    const failed: string[] = [];
    for (const p of who) {
      const { error } = await supabase.rpc("staff_grant_px", {
        p_character: p.id,
        p_amount: px,
        p_reason: reason.trim(),
      });
      if (error) failed.push(p.name);
    }
    setBusy(false);
    setMsg(
      failed.length
        ? { ok: false, text: `PX non assegnati a: ${failed.join(", ")}.` }
        : { ok: true, text: `${px} PX assegnati a ${who.length === 1 ? who[0].name : `${who.length} personaggi`}.` },
    );
    if (!failed.length) {
      setPicked(new Set());
      setReason("");
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="panel space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">PX da dare</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input w-24! py-1.5"
            />
          </label>
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Motivo</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="Es. Quest della Fortezza Rossa"
              className="input py-1.5"
            />
          </label>
          <button type="button" disabled={!valid || busy} onClick={grant} className="btn px-5 py-1.5 text-sm">
            {busy ? "..." : `Assegna${picked.size ? ` a ${picked.size}` : ""}`}
          </button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca un personaggio..."
              className="input max-w-xs py-1.5"
            />
            <span className="text-xs text-muted">
              {picked.size} scelti
              {picked.size > 0 && (
                <button type="button" onClick={() => setPicked(new Set())} className="ml-2 underline hover:text-accent">
                  togli tutti
                </button>
              )}
            </span>
          </div>
          <ul className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <li key={p.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 border px-2 py-1.5 text-sm ${
                    picked.has(p.id) ? "border-accent bg-accent/10" : "border-border/60 bg-black/30"
                  }`}
                >
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="min-w-0 flex-1 truncate font-serif">{name(p)}</span>
                  <span className="text-xs text-muted">{p.px} PX</span>
                </label>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="text-sm text-muted">Nessun personaggio attivo trovato.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-serif text-xl text-accent">Ultimi PX assegnati</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted">Ancora nessuna assegnazione.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-muted">
                <tr>
                  <th className="p-2">Quando</th>
                  <th className="p-2">Personaggio</th>
                  <th className="p-2">PX</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Da</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="whitespace-nowrap p-2 text-muted">{when(r.created_at)}</td>
                    <td className="p-2 font-serif">{r.character?.name ?? "—"}</td>
                    <td className="p-2 text-green-400">+{r.amount}</td>
                    <td className="p-2">{r.reason}</td>
                    <td className="p-2 text-muted">{r.by?.username ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
