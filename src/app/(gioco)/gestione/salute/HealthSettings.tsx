"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RULES } from "@/lib/rules/config";
import { DEFAULT_SETTINGS, normalizeSettings, type GameSettings } from "@/lib/rules/settings";
import { resetGameSettingsCache } from "@/lib/rules/useGameSettings";
import { createClient } from "@/lib/supabase/client";

type SkillLite = { name: string; stat: string };
type StatLite = { id: string; code: string; label: string };

const box = "space-y-3 border border-border bg-black/40 p-4";
const th = "py-2 pr-3 text-left text-xs tracking-wider text-muted uppercase";
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block space-y-1">
    <span className="block text-xs tracking-wide text-muted uppercase">{label}</span>
    {children}
  </label>
);
const toNumber = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(",", ".")) || 0);

// Caselle da spuntare (abilita' o statistiche)
function Checks({ options, value, onChange }: { options: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {options.map((o) => (
        <label key={o.key} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={value.includes(o.key)}
            onChange={() => onChange(value.includes(o.key) ? value.filter((x) => x !== o.key) : [...value, o.key])}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export default function HealthSettings({
  initial,
  skills,
  stats,
  missing,
}: {
  initial: GameSettings;
  skills: SkillLite[];
  stats: StatLite[];
  missing: boolean; // tabella non ancora creata
}) {
  const supabase = useMemo(() => createClient(), []);
  const [s, setS] = useState<GameSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  const skillOptions = skills.map((x) => ({ key: x.name, label: x.name }));
  const statOptions = stats.map((x) => ({ key: x.id, label: `${x.code} · ${x.label}` }));
  const carry = RULES.derived.carryPerBody;

  async function save() {
    const clean = normalizeSettings(s);
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("game_settings").upsert({ id: true, data: clean });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.code === "42501" ? "Non hai il permesso di cambiare queste regole." : "Salvataggio non riuscito." });
    setS(clean);
    resetGameSettingsCache();
    setMsg({ ok: true, text: "Regole salvate: valgono da subito per tutti." });
  }

  // margine massimo di una ferita = uno in meno della ferita dopo
  const sorted = [...s.criticals].sort((a, b) => a.min - b.min);
  const upTo = (id: string) => {
    const i = sorted.findIndex((c) => c.id === id);
    return sorted[i + 1] ? sorted[i + 1].min - 1 : null;
  };

  return (
    <div className="space-y-5">
      {missing && <p className="text-sm text-amber-200">Prima va eseguita la migrazione 0122 in Supabase: finché manca, valgono i valori di base e non si può salvare.</p>}

      <section className={box}>
        <h2 className="font-serif text-xl text-accent">Stamina</h2>
        <div className="flex flex-wrap gap-4">
          <Field label="Minuti di riposo per recuperare">
            <input type="number" min={1} value={s.staminaRestMinutes} onChange={(e) => set("staminaRestMinutes", toNumber(e.target.value))} className="input w-32" />
          </Field>
          <Field label="Malus con la Stamina a 0">
            <input type="number" max={0} value={s.staminaZeroPenalty} onChange={(e) => set("staminaZeroPenalty", toNumber(e.target.value))} className="input w-32" />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Ogni {s.staminaRestMinutes} minuti senza azioni di combattimento il personaggio recupera tanta Stamina quanto il suo Recupero.
          Con la Stamina a 0 ogni tiro di combattimento ha {s.staminaZeroPenalty}.
        </p>
      </section>

      <section className={box}>
        <h2 className="font-serif text-xl text-accent">Ferite critiche</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>Nome</th>
                <th className={th}>Dal margine</th>
                <th className={th}>Danno in più</th>
                <th className={th}>Malus alle prove</th>
                <th className={th}>Sanguina (PF a round)</th>
                <th className={th}>Guarisce in</th>
              </tr>
            </thead>
            <tbody>
              {s.criticals.map((c, i) => {
                const edit = (k: "label" | "min" | "bonus" | "penalty" | "bleed", v: string) =>
                  set(
                    "criticals",
                    s.criticals.map((x, j) => (j === i ? { ...x, [k]: k === "label" ? v : toNumber(v) } : x)),
                  );
                const cell = (k: "min" | "bonus" | "penalty" | "bleed", min: number, max: number) => (
                  <td className="py-2 pr-3">
                    <input type="number" min={min} max={max} value={c[k]} onChange={(e) => edit(k, e.target.value)} aria-label={`${k} di ${c.label}`} className="input w-24 py-1" />
                  </td>
                );
                return (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="py-2 pr-3">
                      <input value={c.label} maxLength={30} onChange={(e) => edit("label", e.target.value)} aria-label="Nome della ferita" className="input w-32 py-1" />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="number" min={1} value={c.min} onChange={(e) => edit("min", e.target.value)} aria-label={`Margine di ${c.label}`} className="input w-20 py-1" />
                      <span className="ml-2 text-xs text-muted">{upTo(c.id) !== null ? `fino a ${upTo(c.id)}` : "in su"}</span>
                    </td>
                    {cell("bonus", 0, 99)}
                    {cell("penalty", -10, 0)}
                    {cell("bleed", 0, 20)}
                    <td className="py-2 pr-3 text-muted">
                      {c.penalty < 0 ? `${Math.round(-c.penalty * s.woundHealDays * 10) / 10} giorni` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Field label="Giorni perché il malus migliori di 1">
          <input type="number" min={0.1} step={0.5} value={s.woundHealDays} onChange={(e) => set("woundHealDays", toNumber(e.target.value))} className="input w-32" />
        </Field>
        <p className="text-xs text-muted">
          Il margine è di quanto il colpo supera la difesa. Una ferita non guarisce finché sanguina, e una mutilazione non guarisce mai da
          sola. La ferita grave a testa o tronco fa perdere l&apos;azione, quella mortale uccide: questo resta fisso.
        </p>
      </section>

      <section className={box}>
        <h2 className="font-serif text-xl text-accent">Cosa ostacola ogni ferita</h2>
        <p className="text-xs text-muted">
          Fuori dal combattimento il malus della ferita si applica alle prove spuntate qui. Con più ferite conta solo la peggiore.
        </p>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Ferita al braccio — abilità</p>
          <Checks options={skillOptions} value={s.woundSkills.arm} onChange={(v) => set("woundSkills", { ...s.woundSkills, arm: v })} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Ferita alla gamba — abilità</p>
          <Checks options={skillOptions} value={s.woundSkills.leg} onChange={(v) => set("woundSkills", { ...s.woundSkills, leg: v })} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Ferita alla testa — tutte le prove su queste statistiche</p>
          <Checks options={statOptions} value={s.woundSkills.headStats} onChange={(v) => set("woundSkills", { ...s.woundSkills, headStats: v })} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Ferita al tronco — tutte le prove su queste statistiche</p>
          <Checks options={statOptions} value={s.woundSkills.torsoStats} onChange={(v) => set("woundSkills", { ...s.woundSkills, torsoStats: v })} />
        </div>
      </section>

      <section className={box}>
        <h2 className="font-serif text-xl text-accent">Peso trasportato</h2>
        <p className="text-xs text-muted">
          Il carico di un personaggio è BODY × {carry} kg. Le soglie sono in percentuale del carico: con BODY 5 il carico è {5 * carry} kg.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>Stato</th>
                <th className={th}>Oltre (% del carico)</th>
                <th className={th}>Malus</th>
                <th className={th}>Con BODY 5</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {s.load.map((t, i) => {
                const edit = (patch: Partial<GameSettings["load"][number]>) =>
                  set(
                    "load",
                    s.load.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                  );
                return (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-3">
                      <input value={t.label} maxLength={40} onChange={(e) => edit({ label: e.target.value })} aria-label="Nome dello stato" className="input w-48 py-1" />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="number" min={10} step={5} value={Math.round(t.over * 100)} onChange={(e) => edit({ over: toNumber(e.target.value) / 100 })} aria-label="Soglia in percentuale" className="input w-24 py-1" />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="number" max={0} value={t.penalty} onChange={(e) => edit({ penalty: toNumber(e.target.value) })} aria-label="Malus" className="input w-24 py-1" />
                    </td>
                    <td className="py-2 pr-3 text-muted">oltre {Math.round(t.over * 5 * carry * 10) / 10} kg</td>
                    <td className="py-2 pr-3">
                      <button type="button" onClick={() => set("load", s.load.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-300">
                        Togli
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {s.load.length < 6 && (
          <button
            type="button"
            onClick={() => set("load", [...s.load, { over: (s.load[s.load.length - 1]?.over ?? 1) + 0.5, penalty: (s.load[s.load.length - 1]?.penalty ?? 0) - 2, label: "Nuova soglia" }])}
            className="btn-ghost px-3 py-1 text-xs"
          >
            + Aggiungi soglia
          </button>
        )}
        <div className="space-y-1">
          <p className="text-sm font-semibold">Il peso penalizza i tiri di combattimento e le prove su queste statistiche</p>
          <Checks options={statOptions} value={s.loadStats} onChange={(v) => set("loadStats", v)} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || missing} className="btn">
          {busy ? "Salvataggio..." : "Salva le regole"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => window.confirm("Rimettere tutti i valori a quelli di base del regolamento? Poi premi Salva per confermare.") && setS(DEFAULT_SETTINGS)}
          className="btn-ghost text-sm"
        >
          Valori di base
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
