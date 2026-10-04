"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------
// Feudi e tesoro di una casata, nella pagina della casata.
// I feudi li vedono tutti; il tesoro solo i membri. Chi ha un ruolo di
// casata abilitato ("Costruisce nei feudi") costruisce le strutture.
// ---------------------------------------------------------------------

type Amount = { resource_id: string; amount: number };
export type EcoResource = { id: string; name: string };
export type EcoStructureType = {
  id: string;
  name: string;
  description: string;
  attack: number;
  defense: number;
  costs: Amount[];
  incomes: Amount[];
  upkeep: Amount[];
};
export type EcoFiefType = { id: string; name: string; incomes: Amount[] };
export type EcoFief = {
  id: string;
  name: string;
  size: "piccolo" | "medio" | "grande";
  fief_type_id: string | null;
  description: string;
  location: { name: string } | null;
  structures: { id: string; structure_type_id: string; is_background: boolean }[];
};

const CAPACITY = { piccolo: 5, medio: 7, grande: 10 } as const;

export default function HouseEconomy({
  houseName,
  playable,
  fiefs,
  fiefTypes,
  structureTypes,
  resources,
  treasury,
  isMember,
  builderId,
  onChanged,
  bare = false,
}: {
  houseName: string;
  playable: boolean;
  fiefs: EcoFief[];
  fiefTypes: EcoFiefType[];
  structureTypes: EcoStructureType[];
  resources: EcoResource[];
  treasury: Record<string, number> | null; // null: non e' un membro
  isMember: boolean;
  builderId: string | null; // il mio PG, se puo' costruire
  onChanged?: () => void; // nel pannello della barra: ricarica i dati
  bare?: boolean; // senza riquadro (dentro una finestra)
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const res = (id: string) => resources.find((r) => r.id === id)?.name ?? "?";
  const text = (list: Amount[]) => (list.length ? list.map((a) => `${a.amount} ${res(a.resource_id)}`).join(", ") : "nulla");

  // al mese: introiti dei tipi di feudo + entrate delle strutture - mantenimento
  const monthly: Record<string, number> = {};
  for (const f of fiefs) {
    for (const a of fiefTypes.find((t) => t.id === f.fief_type_id)?.incomes ?? []) monthly[a.resource_id] = (monthly[a.resource_id] ?? 0) + a.amount;
    for (const s of f.structures) {
      const t = structureTypes.find((x) => x.id === s.structure_type_id);
      for (const a of t?.incomes ?? []) monthly[a.resource_id] = (monthly[a.resource_id] ?? 0) + a.amount;
      for (const a of t?.upkeep ?? []) monthly[a.resource_id] = (monthly[a.resource_id] ?? 0) - a.amount;
    }
  }

  async function build(fief: EcoFief, typeId: string) {
    const type = structureTypes.find((t) => t.id === typeId);
    if (!type || !builderId) return;
    if (!window.confirm(`Costruire ${type.name} a ${fief.name}? Costa: ${text(type.costs)}.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("build_structure", { p_fief: fief.id, p_structure_type: typeId, p_character: builderId });
    setBusy(false);
    setMsg(
      error
        ? { ok: false, text: error.message.includes("insufficienti") ? `Il tesoro non basta (${error.message.split(":")[1]?.trim() ?? ""}).` : error.message.replace("piu''", "più") }
        : { ok: true, text: `${type.name} costruita a ${fief.name}.` },
    );
    if (!error) {
      if (onChanged) onChanged();
      else router.refresh();
    }
  }

  // Demolire: la casata recupera meta' di quanto aveva speso (le strutture di BG non restituiscono nulla)
  async function demolish(fief: EcoFief, s: EcoFief["structures"][number]) {
    const type = structureTypes.find((t) => t.id === s.structure_type_id);
    const note = s.is_background ? "È una struttura di BG: non restituisce risorse." : "La casata recupera metà di quanto aveva speso.";
    if (!window.confirm(`Demolire ${type?.name ?? "la struttura"} a ${fief.name}? ${note}`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("demolish_structure", { p_structure: s.id, p_character: builderId });
    setBusy(false);
    const back = Object.entries((data ?? {}) as Record<string, number>).map(([id, n]) => `${n} ${res(id)}`);
    setMsg(error ? { ok: false, text: "Demolizione non riuscita." } : { ok: true, text: back.length ? `Demolita: recuperati ${back.join(", ")}.` : "Demolita." });
    if (!error) {
      if (onChanged) onChanged();
      else router.refresh();
    }
  }

  if (fiefs.length === 0 && !isMember) return null;

  return (
    <section className={bare ? "space-y-4" : "mt-6 space-y-4 border border-border bg-black/40 p-5"}>
      {!bare && <h2 className="font-serif text-2xl text-accent">Feudi e risorse</h2>}
      <p className="text-sm text-muted">
        I feudi di casa {houseName} ({playable ? "casata PG" : "casata PNG"}). Ogni 1° del mese la casata riceve le risorse dei feudi e delle
        strutture.
      </p>

      {isMember && treasury && (
        <div className="space-y-2">
          <h3 className="text-xs tracking-[0.12em] text-muted uppercase">Tesoro della casata</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resources.map((r) => (
              <li key={r.id} className="border border-border/60 bg-black/30 px-3 py-2">
                <span className="block text-xs text-muted uppercase">{r.name}</span>
                <span className="font-serif text-2xl text-accent">{(treasury[r.id] ?? 0).toLocaleString("it-IT")}</span>
                {monthly[r.id] ? (
                  <span className={`ml-2 text-xs ${monthly[r.id] > 0 ? "text-green-400" : "text-red-400"}`}>
                    {monthly[r.id] > 0 ? "+" : ""}
                    {monthly[r.id]} al mese
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fiefs.length === 0 && <p className="text-sm text-muted">La casata non ha ancora feudi.</p>}
      <ul className="space-y-3">
        {fiefs.map((f) => {
          const type = fiefTypes.find((t) => t.id === f.fief_type_id);
          const cap = CAPACITY[f.size];
          const counts = new Map<string, number>();
          for (const s of f.structures) counts.set(s.structure_type_id, (counts.get(s.structure_type_id) ?? 0) + 1);
          return (
            <li key={f.id} className="border border-border/60 bg-black/30 p-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className="font-serif text-lg text-accent">{f.name}</h3>
                <span className="text-xs text-muted">
                  {type?.name ?? "senza tipo"} · feudo {f.size}
                  {f.location && ` · ${f.location.name}`}
                </span>
                <span className="ml-auto text-right text-sm">
                  Strutture {f.structures.length}/{cap}
                  <span className="block text-xs text-muted">
                    Attacco {f.structures.reduce((n, s) => n + (structureTypes.find((t) => t.id === s.structure_type_id)?.attack ?? 0), 0)} · Difesa{" "}
                    {f.structures.reduce((n, s) => n + (structureTypes.find((t) => t.id === s.structure_type_id)?.defense ?? 0), 0)}
                  </span>
                </span>
              </div>
              {f.description && <p className="mt-1 text-sm whitespace-pre-line text-muted">{f.description}</p>}
              {type && <p className="mt-1 text-xs text-muted">Rende ogni mese: {text(type.incomes)}</p>}
              {f.structures.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nessuna struttura.</p>
              ) : builderId ? (
                // chi costruisce vede le strutture una per una e puo' demolirle
                <ul className="mt-2 space-y-1 text-sm">
                  {f.structures.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span>{structureTypes.find((t) => t.id === s.structure_type_id)?.name ?? "?"}</span>
                      {s.is_background && <span className="border border-border px-1 text-[0.625rem] text-muted uppercase">BG</span>}
                      <button type="button" disabled={busy} onClick={() => demolish(f, s)} className="ml-auto text-xs text-red-400 hover:text-red-300">
                        Demolisci
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm">
                  {[...counts].map(([id, n]) => `${structureTypes.find((t) => t.id === id)?.name ?? "?"}${n > 1 ? ` ×${n}` : ""}`).join(", ")}
                </p>
              )}
              {builderId && f.structures.length < cap && structureTypes.length > 0 && (
                <select
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && build(f, e.target.value)}
                  className="input mt-2 max-w-md py-1 text-sm"
                  aria-label={`Costruisci a ${f.name}`}
                >
                  <option value="">Costruisci una struttura…</option>
                  {structureTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — costa {text(t.costs)}
                      {t.incomes.length ? ` · rende ${text(t.incomes)}/mese` : ""}
                      {t.upkeep.length ? ` · mantenimento ${text(t.upkeep)}/mese` : ""}
                      {t.attack || t.defense ? ` · ATT ${t.attack} DIF ${t.defense}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
      {isMember && !builderId && fiefs.length > 0 && (
        <p className="text-xs text-muted">Le strutture le costruisce chi nella casata ha un ruolo abilitato (es. il signore).</p>
      )}
    </section>
  );
}
