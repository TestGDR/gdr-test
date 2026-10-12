"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_LABEL, when, type Spy, type SpyLevel, type SpySettings } from "@/lib/spies";
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
  { id: "livelli", label: "Livelli, prezzi e riuscita" },
  { id: "regole", label: "Regole generali" },
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
  const [levels, setLevels] = useState<SpyLevel[]>([]);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [m, s, st, lv] = await Promise.all([
      supabase.from("spy_missions").select("*, character:characters(name)").order("started_at", { ascending: false }).limit(200),
      supabase.from("spies").select("*, character:characters(name)").order("created_at", { ascending: false }),
      supabase.from("spy_settings").select("*").maybeSingle(),
      supabase.from("spy_levels").select("*").order("level"),
    ]);
    setMissing(!!st.error || !st.data || !!lv.error);
    setLevels((lv.data ?? []) as SpyLevel[]);
    setMissions((m.data ?? []) as unknown as Mission[]);
    setSpies((s.data ?? []) as unknown as SpyRow[]);
    setSettings((st.data ?? null) as SpySettings | null);
  }, [supabase]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (missions === null) return <p className="text-sm text-muted">Caricamento...</p>;
  if (missing || !settings) return <p className="text-sm text-amber-200">Prima vanno eseguite le migrazioni 0131 e 0134 in Supabase.</p>;

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
                  {sp.status === "abbandonata" && (
                    <button type="button" onClick={() => run(() => supabase.rpc("spy_set_status", { p_spy: sp.id, p_status: "libera" }), `${sp.name} è tornata dal suo padrone.`)} className="text-xs text-muted hover:text-accent" title="Il giocatore aveva rinunciato a lei">
                      Falla tornare
                    </button>
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

        {tab === "livelli" && (
          <LevelsForm
            key={levels.map((l) => `${l.level}:${l.cost}:${l.ok_light}:${l.ok_normal}:${l.ok_deep}`).join("|")}
            levels={levels}
            canEdit={canRules}
            onSave={(next) =>
              run(async () => {
                // i livelli tolti dal fondo spariscono, gli altri si aggiornano
                const drop = levels.filter((l) => !next.some((n) => n.level === l.level)).map((l) => l.level);
                if (drop.length) {
                  const r = await supabase.from("spy_levels").delete().in("level", drop);
                  if (r.error) return r;
                }
                return supabase.from("spy_levels").upsert(next);
              }, "Livelli salvati.")
            }
          />
        )}

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

const clamp = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const th = "py-1.5 pr-3 text-left text-xs tracking-wide text-muted uppercase";

// Un riga per livello: quanto costa arrivarci e quante probabilita' di riuscita da'
function LevelsForm({ levels, canEdit, onSave }: { levels: SpyLevel[]; canEdit: boolean; onSave: (l: SpyLevel[]) => Promise<boolean> }) {
  const [rows, setRows] = useState<SpyLevel[]>(levels);
  const set = (level: number, patch: Partial<SpyLevel>) => setRows((r) => r.map((x) => (x.level === level ? { ...x, ...patch } : x)));
  const last = rows[rows.length - 1];
  const changed = JSON.stringify(rows) !== JSON.stringify(levels);
  const pct = (l: SpyLevel, k: "ok_light" | "ok_normal" | "ok_deep", label: string) => (
    <td className="py-1.5 pr-3">
      <input
        type="number"
        min={0}
        max={100}
        value={l[k]}
        disabled={!canEdit}
        onChange={(e) => set(l.level, { [k]: clamp(e.target.value, 0, 100) })}
        aria-label={`Riuscita ${label} al livello ${l.level}`}
        className="input w-20 py-1"
      />
      <span className="ml-1 text-xs text-muted">%</span>
    </td>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ogni riga è un livello della spia. Il prezzo è quello che si paga per arrivarci: al livello 1 è il costo per reclutarla, dal 2
        in su è l&apos;addestramento. Le percentuali sono la probabilità che la missione riesca; il resto è la probabilità che la spia
        venga catturata o uccisa.
      </p>
      {!canEdit && <p className="text-sm text-muted">Per cambiare questi numeri serve il permesso &quot;Statistiche, abilità e tratti&quot;.</p>}
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>Livello</th>
              <th className={th}>Prezzo (monete)</th>
              <th className={th}>Riuscita: superficiale</th>
              <th className={th}>Riuscita: normale</th>
              <th className={th}>Riuscita: approfondita</th>
              <th className={th}>Totale speso fin qui</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={l.level} className="border-b border-border/50">
                <td className="py-1.5 pr-3 font-serif text-accent">
                  {l.level}
                  <span className="ml-2 text-xs text-muted">{l.level === 1 ? "reclutare" : "addestrare"}</span>
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="number"
                    min={0}
                    value={l.cost}
                    disabled={!canEdit}
                    onChange={(e) => set(l.level, { cost: clamp(e.target.value, 0, 10000000) })}
                    aria-label={`Prezzo del livello ${l.level}`}
                    className="input w-28 py-1"
                  />
                </td>
                {pct(l, "ok_light", "superficiale")}
                {pct(l, "ok_normal", "normale")}
                {pct(l, "ok_deep", "approfondita")}
                <td className="py-1.5 pr-3 text-muted">{rows.slice(0, i + 1).reduce((n, x) => n + x.cost, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {rows.length < 20 && (
            <button
              type="button"
              onClick={() =>
                setRows((r) => [
                  ...r,
                  last
                    ? { level: last.level + 1, cost: last.cost, ok_light: Math.min(100, last.ok_light + 5), ok_normal: Math.min(100, last.ok_normal + 5), ok_deep: Math.min(100, last.ok_deep + 5) }
                    : { level: 1, cost: 100, ok_light: 85, ok_normal: 70, ok_deep: 55 },
                ])
              }
              className="btn-ghost px-3 py-1 text-xs"
            >
              + Aggiungi un livello
            </button>
          )}
          {rows.length > 1 && (
            <button type="button" onClick={() => setRows((r) => r.slice(0, -1))} className="btn-ghost px-3 py-1 text-xs">
              Togli l&apos;ultimo livello
            </button>
          )}
          <button type="button" disabled={!changed} onClick={() => onSave(rows)} className="btn px-4">
            Salva i livelli
          </button>
        </div>
      )}
      <p className="text-xs text-muted">
        Se togli un livello che qualche spia ha già raggiunto, quella spia resta al suo livello ma non riesce più in nessuna missione:
        meglio non scendere sotto il livello più alto già in gioco.
      </p>
    </div>
  );
}

const FIELDS: { key: keyof SpySettings; label: string }[] = [
  { key: "max_spies", label: "Spie per personaggio" },
  { key: "max_spies_trait", label: "Spie per chi ha il tratto" },
  { key: "hours_light", label: "Ore di ricerca: superficiale" },
  { key: "hours_normal", label: "Ore di ricerca: normale" },
  { key: "hours_deep", label: "Ore di ricerca: approfondita" },
  { key: "killed_pct", label: "Quando fallisce: % di spie uccise (le altre catturate)" },
];

function RulesForm({ settings, canEdit, onSave }: { settings: SpySettings; canEdit: boolean; onSave: (s: Partial<SpySettings>) => Promise<boolean> }) {
  const [s, setS] = useState(settings);
  return (
    <div className="space-y-4">
      {!canEdit && <p className="text-sm text-muted">Per cambiare questi numeri serve il permesso &quot;Statistiche, abilità e tratti&quot;.</p>}
      <p className="text-sm text-muted">
        Nessuno parte con una spia: si reclutano tutte. Chi ha il tratto indicato qui sotto può averne di più. Il tempo di una missione è
        quello di una staffetta fino al luogo, più le ore della ricerca.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="block text-xs tracking-wide text-muted uppercase">Tratto che alza il numero di spie</span>
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
      {canEdit && (
        <button
          type="button"
          onClick={() =>
            onSave({
              trait_name: s.trait_name.trim() || "Spie",
              max_spies: Math.max(1, s.max_spies),
              max_spies_trait: Math.max(1, s.max_spies_trait),
              hours_light: s.hours_light,
              hours_normal: s.hours_normal,
              hours_deep: s.hours_deep,
              killed_pct: Math.min(100, s.killed_pct),
            })
          }
          className="btn px-4"
        >
          Salva le regole
        </button>
      )}
    </div>
  );
}
