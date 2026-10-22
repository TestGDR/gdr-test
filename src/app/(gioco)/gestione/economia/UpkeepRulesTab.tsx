"use client";

import { useEffect, useState } from "react";
import type { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------
// Gestione -> Economia -> Esercito e mercato (migrazione 0156):
// mantenimento dei soldati ogni 1000, riserva, guerra, draghi affamati,
// riduzioni delle strutture (Intendenza) e mercato PNG di emergenza.
// ---------------------------------------------------------------------

type Settings = {
  reserve_factor: number;
  war_factor: number;
  war_forage_per_100: number;
  war_labor_cut: number;
  dragon_hunger_factor: number;
  npc_buy_price: number;
  npc_sell_price: number;
  npc_monthly_limit: number;
};
const FIELDS: { key: keyof Settings; label: string; hint: string; min: number; max: number }[] = [
  { key: "reserve_factor", label: "Riserva e congedo ×", hint: "quanto pagano i soldati in riserva o congedati (0,25 = un quarto)", min: 0, max: 1 },
  { key: "war_factor", label: "Guerra ×", hint: "mantenimento delle truppe in campo durante una guerra", min: 0, max: 20 },
  { key: "war_forage_per_100", label: "Foraggio ogni 100 soldati", hint: "Alimenti in più al mese in guerra", min: 0, max: 1000 },
  { key: "war_labor_cut", label: "Calo Manodopera in guerra", hint: "0,15 = la Manodopera prodotta cala del 15%", min: 0, max: 1 },
  { key: "dragon_hunger_factor", label: "Draghi Affamati ×", hint: "mantenimento dei draghi mentre sono Affamati", min: 1, max: 10 },
  { key: "npc_buy_price", label: "Mercato PNG: compra a", hint: "Oro per unità", min: 0, max: 1000 },
  { key: "npc_sell_price", label: "Mercato PNG: vende a", hint: "Oro per unità", min: 0, max: 1000 },
  { key: "npc_monthly_limit", label: "Mercato PNG: tetto al mese", hint: "unità per risorsa e per casata", min: 0, max: 1000000 },
];

const num = (x: string) => Number(x.replace(",", "."));

export default function UpkeepRulesTab({
  supabase,
  resources,
  structures,
  reload,
}: {
  supabase: ReturnType<typeof createClient>;
  resources: { id: string; name: string }[];
  structures: { id: string; name: string }[];
  reload: () => void;
}) {
  const [values, setValues] = useState<Record<string, string> | null | undefined>(undefined);
  const [army, setArmy] = useState<Record<string, string>>({});
  const [cuts, setCuts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("economy_settings").select(FIELDS.map((f) => f.key).join(", ")).maybeSingle(),
      supabase.from("army_upkeep").select("resource_id, per_1000"),
      supabase.from("structure_types").select("id, soldier_upkeep_cut"),
    ]).then(([s, a, c]) => {
      if (s.error || !s.data) return setValues(null);
      const row = s.data as unknown as Settings;
      setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(row[f.key]).replace(".", ",")])));
      setArmy(Object.fromEntries(((a.data ?? []) as { resource_id: string; per_1000: number }[]).map((x) => [x.resource_id, String(x.per_1000).replace(".", ",")])));
      setCuts(
        Object.fromEntries(
          ((c.data ?? []) as { id: string; soldier_upkeep_cut: number }[])
            .filter((x) => Number(x.soldier_upkeep_cut) > 0)
            .map((x) => [x.id, String(x.soldier_upkeep_cut).replace(".", ",")]),
        ),
      );
    });
  }, [supabase]);

  if (values === undefined) return <p className="text-muted">Caricamento...</p>;
  if (values === null) return <p className="text-sm text-amber-200">Per queste regole va eseguita la migrazione 0156 in Supabase.</p>;

  const bad = FIELDS.some((f) => !(num(values[f.key]) >= f.min && num(values[f.key]) <= f.max));
  const badArmy = Object.values(army).some((v) => v.trim() !== "" && !(num(v) >= 0));
  const badCut = Object.values(cuts).some((v) => v.trim() !== "" && !(num(v) >= 0 && num(v) <= 100));

  async function save() {
    setMsg(null);
    const upd = await supabase
      .from("economy_settings")
      .update(Object.fromEntries(FIELDS.map((f) => [f.key, num(values![f.key])])))
      .eq("id", true);
    // mantenimento ogni 1000 soldati: le righe vuote o a zero si tolgono
    const keep = Object.entries(army).filter(([, v]) => v.trim() !== "" && num(v) > 0);
    const del = await supabase.from("army_upkeep").delete().not("resource_id", "in", `(${keep.map(([id]) => id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
    const ins = keep.length
      ? await supabase.from("army_upkeep").upsert(keep.map(([resource_id, v]) => ({ resource_id, per_1000: num(v) })))
      : { error: null };
    // riduzioni del mantenimento dei soldati (Intendenza)
    const cutErrors = await Promise.all(
      structures.map((s) =>
        supabase
          .from("structure_types")
          .update({ soldier_upkeep_cut: cuts[s.id]?.trim() ? num(cuts[s.id]) : 0 })
          .eq("id", s.id)
          .then((r) => r.error),
      ),
    );
    const error = upd.error || del.error || ins.error || cutErrors.find(Boolean);
    setMsg(error ? { ok: false, text: "Non tutto è stato salvato." } : { ok: true, text: "Salvato: vale dal prossimo 1° del mese." });
    if (!error) reload();
  }

  const cutList = structures.filter((s) => cuts[s.id] !== undefined);
  const otherStructures = structures.filter((s) => cuts[s.id] === undefined);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-serif text-lg text-accent">Mantenimento dell&apos;esercito</h3>
        <p className="text-xs text-muted">
          Ogni mese, ogni 1000 soldati (navi e macchine da guerra contano come un soldato ciascuna). Si somma all&apos;eventuale mantenimento proprio
          di un tipo di truppa (Gestione → Eserciti).
        </p>
        <div className="flex flex-wrap gap-3">
          {resources.map((r) => (
            <label key={r.id} className="block">
              <span className="mb-1 block text-xs text-muted">{r.name}</span>
              <input
                inputMode="decimal"
                value={army[r.id] ?? ""}
                onChange={(e) => setArmy((a) => ({ ...a, [r.id]: e.target.value }))}
                placeholder="0"
                className="input w-24! py-1.5"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-serif text-lg text-accent">Riserva, guerra, draghi e mercato</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs text-muted">{f.label}</span>
              <input
                inputMode="decimal"
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v!, [f.key]: e.target.value }))}
                className="input py-1.5"
              />
              <span className="mt-0.5 block text-[0.6875rem] text-muted">{f.hint}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">
          La guerra di una casata e lo stato Affamato dei draghi si cambiano dal pannello Feudi → Esercito, scegliendo la casata come staff.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-serif text-lg text-accent">Strutture che riducono il mantenimento dei soldati</h3>
        <ul className="flex flex-wrap gap-3">
          {cutList.map((s) => (
            <li key={s.id} className="flex items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">{s.name} (−%)</span>
                <input
                  inputMode="decimal"
                  value={cuts[s.id]}
                  onChange={(e) => setCuts((c) => ({ ...c, [s.id]: e.target.value }))}
                  className="input w-24! py-1.5"
                />
              </label>
            </li>
          ))}
          {otherStructures.length > 0 && (
            <li className="flex items-end">
              <select
                value=""
                onChange={(e) => e.target.value && setCuts((c) => ({ ...c, [e.target.value]: "10" }))}
                className="input w-auto! py-1.5 text-sm"
                aria-label="Aggiungi una struttura"
              >
                <option value="">+ Aggiungi struttura</option>
                {otherStructures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </li>
          )}
        </ul>
        <p className="text-xs text-muted">Se una casata ha più strutture con una riduzione, vale la più alta. A 0 la riduzione si toglie.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={bad || badArmy || badCut} onClick={save} className="btn px-4 py-1.5 text-sm">
          Salva
        </button>
        {(bad || badArmy || badCut) && <span className="text-xs text-red-400">Controlla i valori: alcuni sono fuori dai limiti.</span>}
        {msg && <span className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
