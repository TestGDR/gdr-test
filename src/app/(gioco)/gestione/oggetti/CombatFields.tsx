"use client";

import type { Item } from "@/components/scheda/Equipment";
import {
  ARMOR_MATERIALS,
  COMBAT,
  DAMAGE_TYPES,
  WEAPON_EFFECTS,
} from "@/lib/rules/combat-config";

type V = Omit<Item, "id">;
const KINDS = [
  { id: "altro", label: "Altro (nessun valore di combattimento)" },
  { id: "arma", label: "Arma" },
  { id: "scudo", label: "Scudo" },
  { id: "armatura", label: "Armatura (pezzo)" },
  { id: "munizione", label: "Munizioni" },
] as const;

const lbl = "mb-1 block text-xs tracking-wider text-muted uppercase";
const int = (s: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(Number(s)) || 0));

// Tipo dell'oggetto e valori di combattimento (documento "Combattimento, armi e danni")
export default function CombatFields({
  v,
  set,
  skills,
}: {
  v: V;
  set: (p: Partial<V>) => void;
  skills: { id: string; name: string }[];
}) {
  const kind = v.kind ?? "altro";
  const num = (
    key: keyof V,
    label: string,
    min: number,
    max: number,
    width = "w-20!",
    step?: number,
  ) => (
    <label className="block">
      <span className={lbl}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={(v[key] as number | null | undefined) ?? ""}
        onChange={(e) =>
          set({
            [key]:
              e.target.value === ""
                ? null
                : step
                  ? Math.min(max, Math.max(min, Number(e.target.value) || 0))
                  : int(e.target.value, min, max),
          } as Partial<V>)
        }
        className={`input ${width} py-1.5`}
      />
    </label>
  );

  return (
    <fieldset className="space-y-3 border border-accent/30 p-3">
      <legend className="px-1 text-xs tracking-wider text-accent uppercase">
        Combattimento
      </legend>
      <label className="block">
        <span className={lbl}>Tipo di oggetto</span>
        <select
          value={kind}
          onChange={(e) => set({ kind: e.target.value as V["kind"] })}
          className="input w-72! py-1.5"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      {kind === "arma" && (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className={lbl}>Mischia o distanza</span>
              <select
                value={v.weapon_category ?? "mischia"}
                onChange={(e) =>
                  set({
                    weapon_category: e.target.value as "mischia" | "distanza",
                  })
                }
                className="input w-36! py-1.5"
              >
                <option value="mischia">Mischia</option>
                <option value="distanza">Distanza</option>
              </select>
            </label>
            <label className="block">
              <span className={lbl}>Abilità per colpire</span>
              <select
                value={v.weapon_skill_id ?? ""}
                onChange={(e) =>
                  set({ weapon_skill_id: e.target.value || null })
                }
                className="input w-52! py-1.5"
              >
                <option value="">— nessuna —</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={lbl}>Tipo di danno</span>
              <select
                value={v.damage_type ?? ""}
                onChange={(e) => set({ damage_type: e.target.value || null })}
                className="input w-36! py-1.5"
              >
                <option value="">—</option>
                {DAMAGE_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={lbl}>Mani</span>
              <select
                value={v.hands ?? "1"}
                onChange={(e) => set({ hands: e.target.value })}
                className="input w-24! py-1.5"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="1-2">1 o 2</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            {num("aff_max", "AFF", 1, 99)}
            {num("body_min", "BODY min.", 0, 10)}
            {num("pierce", "Perforante", 0, 20)}
            {v.weapon_category === "distanza" ? (
              <>
                {num("range_m", "Portata (m)", 1, 1000, "w-24!")}
                {num("reload_actions", "Ricarica (azioni)", 0, 5)}
                <label className="block">
                  <span className={lbl}>Munizioni</span>
                  <select
                    value={v.ammo_type ?? ""}
                    onChange={(e) => set({ ammo_type: e.target.value || null })}
                    className="input w-36! py-1.5"
                  >
                    <option value="">nessuna (si lancia)</option>
                    <option value="frecce">frecce</option>
                    <option value="quadrelli">quadrelli</option>
                  </select>
                </label>
              </>
            ) : (
              num("reach_m", "Portata (m)", 0, 10, "w-20!", 0.1)
            )}
          </div>
          <div>
            <span className={lbl}>Effetti</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {WEAPON_EFFECTS.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-1.5"
                  title={e.help}
                >
                  <input
                    type="checkbox"
                    checked={(v.effects ?? []).includes(e.id)}
                    onChange={(ev) =>
                      set({
                        effects: ev.target.checked
                          ? [...(v.effects ?? []), e.id]
                          : (v.effects ?? []).filter((x) => x !== e.id),
                      })
                    }
                  />
                  {e.label}
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">
            I dadi di danno sono nel campo &quot;Danno&quot; qui sopra (es.
            4d6).
          </p>
        </>
      )}

      {kind === "scudo" && (
        <div className="flex flex-wrap gap-3">
          {num("parry_bonus", "Bonus a Parare", 0, 10)}
          <label className="block">
            <span className={lbl}>Colpo di scudo</span>
            <input
              value={v.bash_dice ?? ""}
              maxLength={20}
              placeholder="1d6"
              onChange={(e) =>
                set({ bash_dice: e.target.value.trim() || null })
              }
              className="input w-24! py-1.5 font-mono"
            />
          </label>
          {num("aff_max", "AFF", 1, 99)}
          {num("attack_penalty", "Penalità al colpire", -10, 0)}
        </div>
      )}

      {kind === "armatura" && (
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className={lbl}>Protegge</span>
            <select
              value={v.armor_part ?? ""}
              onChange={(e) => set({ armor_part: e.target.value || null })}
              className="input w-48! py-1.5"
            >
              <option value="">Scegli...</option>
              {COMBAT.armorParts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={lbl}>Materiale</span>
            <select
              value={v.material ?? ""}
              onChange={(e) => set({ material: e.target.value || null })}
              className="input w-40! py-1.5"
            >
              <option value="">—</option>
              {ARMOR_MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {num("sp_max", "SP", 0, 50)}
          {num("encumbrance", "Ingombro (RIF)", -10, 0)}
        </div>
      )}

      {kind === "munizione" && (
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className={lbl}>Per</span>
            <select
              value={v.ammo_type ?? ""}
              onChange={(e) => set({ ammo_type: e.target.value || null })}
              className="input w-36! py-1.5"
            >
              <option value="">Scegli...</option>
              <option value="frecce">archi (frecce)</option>
              <option value="quadrelli">balestre (quadrelli)</option>
            </select>
          </label>
          {num("ammo_capacity", "Quantità", 1, 999)}
        </div>
      )}

      {kind !== "altro" && num("weight_kg", "Peso (kg)", 0, 999, "w-24!", 0.1)}
    </fieldset>
  );
}
