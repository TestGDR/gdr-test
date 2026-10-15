"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Quality } from "@/components/scheda/Equipment";
import { ARMOR_MATERIALS, DAMAGE_TYPES } from "@/lib/rules/combat-config";
import {
  BONUS_LABEL,
  ITEM_CLASSES,
  NO_QUALITY_BONUS,
  type Bonus,
  type BonusField,
  type MaterialModRow,
  type QualityBonusRow,
} from "@/lib/rules/quality";
import { loadQualityBonuses } from "@/lib/rules/useQualityBonuses";
import { createClient } from "@/lib/supabase/client";

type Msg = { ok: boolean; text: string } | null;
const MAX: Record<BonusField, number> = {
  hit: 10,
  damage: 10,
  pierce: 10,
  aff: 50,
  sp: 20,
  parry: 10,
  encumbrance: 10,
};
const Note = ({ msg }: { msg: Msg }) =>
  msg && (
    <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
      {msg.text}
    </p>
  );

// ---------------------------------------------------------------------
// Bonus di ogni livello di qualita' per tipo di oggetto: ognuno ha solo
// i bonus che hanno senso (armi da taglio danno, perforanti perforazione,
// scudi parata, armature SP e ingombro). I valori sono il totale del
// livello, non quanto si aggiunge rispetto a quello prima.
// ---------------------------------------------------------------------
export function QualityBonusTable({ qualities }: { qualities: Quality[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<QualityBonusRow[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Bonus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    loadQualityBonuses(true).then(setRows);
  }, []);

  const key = (q: string, c: string) => `${q}|${c}`;
  const value = (q: string, c: string): Bonus =>
    edits[key(q, c)] ??
    rows?.find((r) => r.quality_id === q && r.item_class === c) ??
    NO_QUALITY_BONUS;
  const set = (q: string, c: string, f: BonusField, n: number) =>
    setEdits((e) => ({
      ...e,
      [key(q, c)]: { ...value(q, c), [f]: Math.min(MAX[f], Math.max(0, n)) },
    }));
  const changed = (c: string) =>
    qualities.some((q) => edits[key(q.id, c)] !== undefined);

  async function save(c: (typeof ITEM_CLASSES)[number]) {
    setBusy(c.id);
    setMsg(null);
    const payload = qualities.map((q) => {
      const v = value(q.id, c.id);
      const row: Record<string, unknown> = {
        quality_id: q.id,
        item_class: c.id,
      };
      // solo i bonus di questo tipo; gli altri restano a 0
      for (const f of Object.keys(NO_QUALITY_BONUS) as BonusField[])
        row[f] = (c.fields as readonly BonusField[]).includes(f) ? v[f] : 0;
      return row;
    });
    const { error } = await supabase
      .from("quality_bonuses")
      .upsert(payload, { onConflict: "quality_id,item_class" });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: "Non salvato." });
    const fresh = await loadQualityBonuses(true);
    setRows(fresh);
    setEdits((e) =>
      Object.fromEntries(
        Object.entries(e).filter(([k]) => !k.endsWith(`|${c.id}`)),
      ),
    );
    setMsg({ ok: true, text: `${c.label}: salvato.` });
  }

  if (rows === null)
    return <p className="text-sm text-muted">Caricamento dei bonus...</p>;

  return (
    <div className="space-y-3">
      <h3 className="font-serif text-lg text-accent">
        Bonus per tipo di oggetto
      </h3>
      <p className="text-sm text-muted">
        Cosa dà ogni livello di qualità, secondo il tipo di oggetto. Ogni tipo
        ha solo i bonus che hanno senso per lui: un martello non riceve
        perforazione, uno scudo migliora la parata, un&apos;armatura l&apos;SP e
        l&apos;ingombro. I numeri sono il totale del livello (non quanto si
        aggiunge al precedente). Le armi con due modi di colpire (es. spada di
        taglio o in affondo) usano i bonus del modo scelto nell&apos;attacco. Il
        fabbro migliora solo armi, scudi e armature.
      </p>
      <Note msg={msg} />
      <div className="grid gap-3 lg:grid-cols-2">
        {ITEM_CLASSES.map((c) => (
          <div key={c.id} className="border border-border/60 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-serif text-accent">{c.label}</span>
              <button
                type="button"
                disabled={busy === c.id || !changed(c.id)}
                onClick={() => save(c)}
                className="btn px-2 py-0.5 text-xs"
              >
                Salva
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="pb-1 text-left font-normal">Livello</th>
                  {c.fields.map((f) => (
                    <th key={f} className="pb-1 text-left font-normal">
                      {BONUS_LABEL[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qualities.map((q) => (
                  <tr key={q.id}>
                    <td className="py-0.5 pr-2 text-[#d8c39a]">{q.name}</td>
                    {c.fields.map((f) => (
                      <td key={f} className="py-0.5 pr-1">
                        <input
                          type="number"
                          min={0}
                          max={MAX[f]}
                          value={value(q.id, c.id)[f]}
                          onChange={(e) =>
                            set(
                              q.id,
                              c.id,
                              f,
                              Math.trunc(Number(e.target.value)) || 0,
                            )
                          }
                          aria-label={`${c.label}, ${q.name}: ${BONUS_LABEL[f]}`}
                          className="input w-14! py-0.5 text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Danno contro armature: per ogni tipo di danno e materiale, quanto vale
// il danno dell'arma prima di togliere l'SP del pezzo colpito
// ---------------------------------------------------------------------
export function MaterialModsTab() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<MaterialModRow[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    supabase
      .from("damage_material_mods")
      .select("damage_type, material, factor")
      .then(({ data, error }) =>
        setRows(error ? [] : ((data ?? []) as MaterialModRow[])),
      );
  }, [supabase]);

  const key = (d: string, m: string) => `${d}|${m}`;
  const shown = (d: string, m: string) =>
    edits[key(d, m)] ??
    String(
      rows?.find((r) => r.damage_type === d && r.material === m)?.factor ?? 1,
    );
  const parse = (s: string) => Number(s.replace(",", "."));
  const invalid = Object.values(edits).some((s) => {
    const n = parse(s);
    return !Number.isFinite(n) || n < 0 || n > 3;
  });

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = DAMAGE_TYPES.flatMap((d) =>
      ARMOR_MATERIALS.map((m) => ({
        damage_type: d.id,
        material: m.id,
        factor: Math.round(parse(shown(d.id, m.id)) * 100) / 100,
      })),
    );
    const { error } = await supabase
      .from("damage_material_mods")
      .upsert(payload, { onConflict: "damage_type,material" });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Non salvato." });
    setRows(payload);
    setEdits({});
    setMsg({ ok: true, text: "Salvato: vale da subito in combattimento." });
    router.refresh();
  }

  if (rows === null)
    return <p className="text-sm text-muted">Caricamento...</p>;

  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-muted">
        Quanto vale il danno di un&apos;arma contro ogni tipo di armatura, prima
        di togliere l&apos;SP del pezzo colpito. 1 = danno pieno, 0,5 =
        dimezzato, 0,75 = tre quarti. Esempio: una spada di taglio contro le
        piastre fa metà danno, in affondo passa meglio la maglia. Contro una
        parte del corpo senza armatura il danno è sempre pieno. Le armi con due
        modi di colpire (spade) usano il tipo di danno scelto nell&apos;attacco.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pr-3 pb-1 text-left font-normal">
                Danno \ Armatura
              </th>
              {ARMOR_MATERIALS.map((m) => (
                <th key={m.id} className="px-1 pb-1 text-left font-normal">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAMAGE_TYPES.map((d) => (
              <tr key={d.id}>
                <td className="py-1 pr-3 text-accent">{d.label}</td>
                {ARMOR_MATERIALS.map((m) => (
                  <td key={m.id} className="px-1 py-1">
                    <span className="flex items-center gap-0.5">
                      ×
                      <input
                        inputMode="decimal"
                        value={shown(d.id, m.id)}
                        onChange={(e) =>
                          setEdits((x) => ({
                            ...x,
                            [key(d.id, m.id)]: e.target.value,
                          }))
                        }
                        aria-label={`${d.label} contro ${m.label}`}
                        className="input w-16! py-0.5 text-sm"
                      />
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invalid && (
        <p className="text-xs text-red-400">
          Ogni valore va da 0 a 3 (es. 0,5).
        </p>
      )}
      <button
        type="button"
        disabled={busy || invalid || Object.keys(edits).length === 0}
        onClick={save}
        className="btn px-4 py-1.5 text-sm"
      >
        Salva
      </button>
      <Note msg={msg} />
    </div>
  );
}
