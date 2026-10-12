"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_LABEL, when, type Spy, type SpySettings } from "@/lib/spies";
import { createClient } from "@/lib/supabase/client";

type Mission = {
  id: string;
  spy_id: string | null;
  spy_name: string;
  spy_level: number;
  target: string;
  place_name: string;
  depth: string;
  request: string;
  started_at: string;
  ends_at: string;
  fail_chance: number;
  roll: number;
  outcome: "riuscita" | "catturata" | "uccisa";
  report: string;
  character: { name: string } | null;
};
type SpyRow = Spy & { character: { name: string } | null };

const TABS = [
  { id: "missioni", label: "Missioni" },
  { id: "spie", label: "Spie dei personaggi" },
  { id: "regole", label: "Regole e costi" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const OUTCOME: Record<Mission["outcome"], { text: string; color: string }> = {
  riuscita: { text: "riuscita", color: "text-green-400" },
  catturata: { text: "fallita: spia catturata", color: "text-amber-300" },
  uccisa: { text: "fallita: spia uccisa", color: "text-red-400" },
};

export default function SpiesManager({ canRules }: { canRules: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("missioni");
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [spies, setSpies] = useState<SpyRow[]>([]);
  const [settings, setSettings] = useState<SpySettings | null>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [m, s, st] = await Promise.all([
      supabase.from("spy_missions").select("*, character:characters(name)").order("started_at", { ascending: false }).limit(200),
      supabase.from("spies").select("*, character:characters(name)").order("created_at", { ascending: false }),
      supabase.from("spy_settings").select("*").maybeSingle(),
    ]);
    setMissing(!!st.error || !st.data);
    setMissions((m.data ?? []) as unknown as Mission[]);
    setSpies((s.data ?? []) as unknown as SpyRow[]);
    setSettings((st.data ?? null) as SpySettings | null);
  }, [supabase]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (missions === null) return <p className="text-sm text-muted">Caricamento...</p>;
  if (missing || !settings) return <p className="text-sm text-amber-200">Prima va eseguita la migrazione 0131 in Supabase.</p>;

  const run = async (op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setMsg(null);
    const { error } = await op();
    setMsg(error ? { ok: false, text: error.message.length < 200 ? error.message : "Operazione non riuscita." } : { ok: true, text: ok });
    if (!error) load();
    return !error;
  };

  return (
    <section className="border border-border bg-black/50">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setMsg(null);
              setTab(t.id);
            }}
            className={`-mb-px border-b-2 px-3 py-2.5 text-xs tracking-[0.12em] uppercase transition sm:px-4 ${
              tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-4 p-4">
        {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}

        {tab === "missioni" &&
          (missions.length === 0 ? (
            <p className="text-sm text-muted">Nessuna missione finora.</p>
          ) : (
            <ul className="space-y-3">
              {missions.map((m) => (
                <MissionCard
                  key={m.id}
                  m={m}
                  back={Date.parse(m.ends_at) <= now}
                  onReport={(text) => run(() => supabase.rpc("spy_report", { p_mission: m.id, p_report: text }), "Rapporto salvato: il giocatore lo leggerà al rientro della spia.")}
                />
              ))}
            </ul>
          ))}

        {tab === "spie" &&
          (spies.length === 0 ? (
            <p className="text-sm text-muted">Nessun personaggio ha ancora delle spie.</p>
          ) : (
            <ul className="divide-y divide-border/60 border border-border/60">
              {spies.map((sp) => (
                <li key={sp.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-44 flex-1">
                    <span className="font-serif text-accent">{sp.name}</span> <span className="text-muted">di {sp.character?.name ?? "?"}</span>
                  </span>
                  <span className="text-xs text-muted">
                    Livello {sp.level} · {STATUS_LABEL[sp.status]}
                  </span>
                  {sp.status === "catturata" && (
                    <>
                      <button type="button" onClick={() => run(() => supabase.rpc("spy_set_status", { p_spy: sp.id, p_status: "libera" }), `${sp.name} è stata liberata.`)} className="btn-ghost px-3 py-1 text-xs">
                        Libera
                      </button>
                      <button
                        type="button"
                        onClick={() => window.confirm(`Far morire ${sp.name}?`) && run(() => supabase.rpc("spy_set_status", { p_spy: sp.id, p_status: "morta" }), `${sp.name} è morta.`)}
                        className="btn-ghost border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500"
                      >
                        Uccidi
                      </button>
                    </>
                  )}
                  {sp.status === "morta" && (
                    <button type="button" onClick={() => run(() => supabase.rpc("spy_set_status", { p_spy: sp.id, p_status: "libera" }), `${sp.name} è di nuovo disponibile.`)} className="text-xs text-muted hover:text-accent">
                      Riporta in vita
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ))}

        {tab === "regole" && (
          <RulesForm
            settings={settings}
            canEdit={canRules}
            onSave={(next) => run(() => supabase.from("spy_settings").update(next).eq("id", true), "Regole salvate.")}
          />
        )}
      </div>
    </section>
  );
}

function MissionCard({ m, back, onReport }: { m: Mission; back: boolean; onReport: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState(m.report);
  const [busy, setBusy] = useState(false);
  const o = OUTCOME[m.outcome];
  return (
    <li className="space-y-2 border border-border bg-black/40 p-3 text-sm">
      <p>
        <strong className="text-accent">{m.character?.name ?? "?"}</strong> manda <strong>{m.spy_name}</strong> (livello {m.spy_level}) a{" "}
        <strong>{m.place_name}</strong> — bersaglio: {m.target}
      </p>
      <p className="text-xs text-muted">
        Partita il {when(m.started_at)} · rientro il {when(m.ends_at)} {back ? "(rientrata)" : "(in corso)"} · ricerca {m.depth} · dado {m.roll} su 100, fallisce fino a {m.fail_chance} →{" "}
        <strong className={o.color}>{o.text}</strong>
      </p>
      <p className="border-l-2 border-border pl-3 whitespace-pre-wrap text-muted">{m.request}</p>
      {m.outcome === "riuscita" ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={8000}
            placeholder="Rapporto della spia: quello che il giocatore leggerà al rientro"
            className="input"
          />
          <button
            type="button"
            disabled={busy || text === m.report}
            onClick={async () => {
              setBusy(true);
              await onReport(text);
              setBusy(false);
            }}
            className="btn px-3 py-1 text-xs"
          >
            {m.report ? "Aggiorna il rapporto" : "Salva il rapporto"}
          </button>
          {!m.report && <span className="ml-2 text-xs text-amber-200">Manca ancora il rapporto.</span>}
        </div>
      ) : (
        <p className="text-xs text-muted">Missione fallita: non serve un rapporto. La sorte di una spia catturata si decide nella pagina &quot;Spie dei personaggi&quot;.</p>
      )}
    </li>
  );
}

const FIELDS: { key: keyof SpySettings; label: string; hint?: string }[] = [
  { key: "recruit_cost", label: "Costo per reclutare (monete)" },
  { key: "train_cost", label: "Costo per addestrare (monete × nuovo livello)" },
  { key: "max_level", label: "Livello massimo" },
  { key: "max_spies", label: "Spie per personaggio (al massimo)" },
  { key: "hours_light", label: "Ore di ricerca: superficiale" },
  { key: "hours_normal", label: "Ore di ricerca: normale" },
  { key: "hours_deep", label: "Ore di ricerca: approfondita" },
  { key: "fail_light", label: "Fallimento %: superficiale" },
  { key: "fail_normal", label: "Fallimento %: normale" },
  { key: "fail_deep", label: "Fallimento %: approfondita" },
  { key: "level_bonus", label: "Punti % in meno per ogni livello oltre il primo" },
  { key: "min_fail", label: "Fallimento % minimo" },
  { key: "killed_pct", label: "Tra i fallimenti: % di spie uccise (le altre catturate)" },
];

function RulesForm({ settings, canEdit, onSave }: { settings: SpySettings; canEdit: boolean; onSave: (s: Partial<SpySettings>) => Promise<boolean> }) {
  const [s, setS] = useState(settings);
  const levels = Array.from({ length: s.max_level }, (_, i) => i + 1);
  const chance = (base: number, level: number) => Math.max(s.min_fail, base - s.level_bonus * (level - 1));
  return (
    <div className="space-y-4">
      {!canEdit && <p className="text-sm text-muted">Per cambiare questi numeri serve il permesso &quot;Statistiche, abilità e tratti&quot;.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="block text-xs tracking-wide text-muted uppercase">Tratto che dà la prima spia</span>
          <input value={s.trait_name} disabled={!canEdit} onChange={(e) => setS({ ...s, trait_name: e.target.value })} maxLength={60} className="input max-w-xs" />
        </label>
        {FIELDS.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="block text-xs tracking-wide text-muted uppercase">{f.label}</span>
            <input
              type="number"
              min={0}
              value={s[f.key] as number}
              disabled={!canEdit}
              onChange={(e) => setS({ ...s, [f.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              className="input w-32"
            />
          </label>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <caption className="mb-1 text-left text-xs tracking-wide text-muted uppercase">Probabilità di fallire con questi numeri</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="py-1 pr-4 text-left">Livello</th>
              <th className="py-1 pr-4 text-left">Superficiale</th>
              <th className="py-1 pr-4 text-left">Normale</th>
              <th className="py-1 pr-4 text-left">Approfondita</th>
              <th className="py-1 pr-4 text-left">Addestrarla a questo livello</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l} className="border-b border-border/50">
                <td className="py-1 pr-4">{l}</td>
                <td className="py-1 pr-4">{chance(s.fail_light, l)}%</td>
                <td className="py-1 pr-4">{chance(s.fail_normal, l)}%</td>
                <td className="py-1 pr-4">{chance(s.fail_deep, l)}%</td>
                <td className="py-1 pr-4 text-muted">{l === 1 ? `reclutata: ${s.recruit_cost}` : `${s.train_cost * l}`} monete</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <button type="button" onClick={() => onSave(s)} className="btn px-4">
          Salva le regole
        </button>
      )}
    </div>
  );
}
