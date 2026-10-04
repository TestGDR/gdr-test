"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import WeatherView from "@/components/game/WeatherView";
import { createClient } from "@/lib/supabase/client";
import type { GameMap } from "@/lib/types";
import { CONDITIONS, PERIODS, SEASONS, condition, type Season, type WeatherHour, type WeatherRegion, type WeatherSeed } from "@/lib/weather";

type Props = { regions: WeatherRegion[]; seeds: WeatherSeed[]; season: Season; maps: GameMap[] };

const TABS = [
  { id: "regioni", label: "Regioni e stagione" },
  { id: "semi", label: "Semi (modelli di giornata)" },
  { id: "oggi", label: "Meteo di oggi" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// Esegue un'operazione sul database, mostra l'esito e ricarica i dati della pagina
function useOp() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await op();
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok });
    if (!error) router.refresh();
    return !error;
  }
  const feedback = msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>;
  return { supabase, run, busy, feedback };
}

export default function WeatherManager(props: Props) {
  const [tab, setTab] = useState<Tab>("regioni");
  return (
    <section className="border border-border bg-black/50">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-xs tracking-[0.12em] uppercase transition ${
              tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "regioni" && <RegionsTab {...props} />}
        {tab === "semi" && <SeedsTab regions={props.regions} seeds={props.seeds} season={props.season} />}
        {tab === "oggi" && <TodayTab regions={props.regions} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Regioni, stagione attuale, regione di ogni mappa
// ---------------------------------------------------------------------
function RegionsTab({ regions, season, maps }: Props) {
  const { supabase, run, busy, feedback } = useOp();
  const [selectedId, setSelectedId] = useState<string | null>(regions[0]?.id ?? null);
  const selected = regions.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      {feedback}
      <div className="flex flex-wrap items-center gap-3 border border-border/70 p-3">
        <span className="text-sm">Stagione attuale in tutto il mondo:</span>
        <select
          value={season}
          disabled={busy}
          onChange={(e) =>
            run(() => supabase.from("weather_settings").update({ current_season: e.target.value }).eq("id", true), "Stagione cambiata: vale dalla prossima estrazione (o rigenera il meteo di oggi).")
          }
          className="input w-40! py-1"
        >
          {SEASONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-1">
          <p className="mb-1 text-xs text-muted">I giocatori vedono solo il meteo delle regioni attive.</p>
          {regions.map((r) => (
            <div key={r.id} className={`flex items-center gap-2 px-2 py-1.5 ${r.id === selectedId ? "bg-blood/30" : "hover:bg-blood/15"}`}>
              <button type="button" onClick={() => setSelectedId(r.id)} className="min-w-0 flex-1 truncate text-left font-serif">
                {r.name}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => supabase.from("weather_regions").update({ active: !r.active }).eq("id", r.id), r.active ? `${r.name} spenta.` : `${r.name} attivata.`)}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] tracking-wider uppercase ${
                  r.active ? "border-green-700 bg-green-900/40 text-green-300" : "border-border text-muted hover:text-foreground"
                }`}
              >
                {r.active ? "Attiva" : "Spenta"}
              </button>
            </div>
          ))}
          <NewRegion />
        </aside>
        {selected && <RegionForm key={selected.id} region={selected} />}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="font-serif text-lg text-accent">Regione climatica di ogni mappa</h3>
        <p className="text-xs text-muted">Il pulsante Meteo del gioco mostra il tempo della regione della mappa in cui si trova il giocatore (anche nelle sue chat).</p>
        <ul className="divide-y divide-border/60 border border-border/60">
          {maps.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-40 flex-1 font-serif">
                {m.name}
                {!m.active && <span className="ml-2 text-xs text-muted">(spenta)</span>}
              </span>
              <select
                value={m.weather_region_id ?? ""}
                disabled={busy}
                onChange={(e) => run(() => supabase.from("maps").update({ weather_region_id: e.target.value || null }).eq("id", m.id), `Regione di ${m.name} salvata.`)}
                aria-label={`Regione climatica di ${m.name}`}
                className="input w-56! py-1"
              >
                <option value="">Nessuna</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RegionForm({ region }: { region: WeatherRegion }) {
  const { supabase, run, busy, feedback } = useOp();
  const [v, setV] = useState(region);
  return (
    <div className="space-y-3">
      <Field label="Nome">
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} className="input" />
      </Field>
      <Field label="Descrizione del territorio">
        <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={3} className="input" />
      </Field>
      <Field label="Modello climatico (lo leggono anche i giocatori)">
        <textarea value={v.climate} onChange={(e) => setV({ ...v, climate: e.target.value })} rows={3} className="input" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !v.name.trim()}
          onClick={() => run(() => supabase.from("weather_regions").update({ name: v.name.trim(), description: v.description, climate: v.climate }).eq("id", region.id), "Regione salvata.")}
          className="btn"
        >
          Salva
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            window.confirm(`Eliminare la regione ${region.name} con tutti i suoi semi?`) &&
            run(() => supabase.from("weather_regions").delete().eq("id", region.id), "Regione eliminata.")
          }
          className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300"
        >
          Elimina
        </button>
        {feedback}
      </div>
    </div>
  );
}

function NewRegion() {
  const { supabase, run, busy } = useOp();
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => supabase.from("weather_regions").insert({ name: name.trim(), sort_order: 100 }), "Regione creata: aggiungi i suoi semi.")) setName("");
      }}
      className="flex gap-1 pt-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nuova regione" className="input min-w-0 flex-1 py-1 text-sm" />
      <button className="btn-ghost px-2 py-1 text-xs" disabled={busy || !name.trim()}>
        + Aggiungi
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Semi: modelli di giornata per regione e stagione, con il loro peso
// ---------------------------------------------------------------------
function SeedsTab({ regions, seeds, season }: { regions: WeatherRegion[]; seeds: WeatherSeed[]; season: Season }) {
  const { supabase, run, busy, feedback } = useOp();
  const [regionId, setRegionId] = useState(regions.find((r) => r.active)?.id ?? regions[0]?.id ?? "");
  const [seasonSel, setSeasonSel] = useState<Season>(season);
  const list = seeds.filter((s) => s.region_id === regionId && s.season === seasonSel);
  const total = list.reduce((a, s) => a + s.weight, 0);
  const blank: WeatherHour[] = PERIODS.map(() => ({ cond: "sereno", temp: 15 }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ogni giorno, per ogni regione attiva, si estrae un seme della stagione attuale: più alto è il peso, più spesso esce (la percentuale
        è la probabilità). Ogni seme descrive le 4 fasce della giornata; ora per ora le temperature salgono e scendono gradualmente e,
        quando il tempo cambia tra una fascia e l&apos;altra, c&apos;è uno stadio intermedio.
      </p>
      <div className="flex flex-wrap gap-3">
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="Regione" className="input w-56!">
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.active ? "" : " (spenta)"}
            </option>
          ))}
        </select>
        <select value={seasonSel} onChange={(e) => setSeasonSel(e.target.value as Season)} aria-label="Stagione" className="input w-40!">
          {SEASONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {s.id === season ? " (attuale)" : ""}
            </option>
          ))}
        </select>
      </div>
      {feedback}
      <ul className="space-y-3">
        {list.map((s) => (
          <SeedEditor key={s.id} seed={s} percent={total ? Math.round((s.weight / total) * 100) : 0} busy={busy} run={run} supabase={supabase} />
        ))}
        {list.length === 0 && <li className="text-sm text-muted">Nessun seme per questa regione e stagione: il meteo non verrà generato.</li>}
      </ul>
      <button
        type="button"
        disabled={busy || !regionId}
        onClick={() =>
          run(
            () => supabase.from("weather_seeds").insert({ region_id: regionId, season: seasonSel, name: "Nuova giornata", weight: 10, periods: blank, sort_order: list.length }),
            "Seme aggiunto: modificalo qui sopra.",
          )
        }
        className="btn-ghost text-sm"
      >
        + Nuovo seme
      </button>
    </div>
  );
}

function SeedEditor({
  seed,
  percent,
  busy,
  run,
  supabase,
}: {
  seed: WeatherSeed;
  percent: number;
  busy: boolean;
  run: ReturnType<typeof useOp>["run"];
  supabase: ReturnType<typeof useOp>["supabase"];
}) {
  const [v, setV] = useState(seed);
  const changed = JSON.stringify(v) !== JSON.stringify(seed);
  const setPeriod = (i: number, patch: Partial<WeatherHour>) =>
    setV((x) => ({ ...x, periods: x.periods.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));

  return (
    <li className={`space-y-3 border p-3 ${changed ? "border-accent/60" : "border-border/60"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} aria-label="Nome del seme" className="input w-64! py-1 font-serif" />
        <label className="flex items-center gap-2 text-sm">
          Peso
          <input
            type="number"
            min={1}
            max={1000}
            value={v.weight}
            onChange={(e) => setV({ ...v, weight: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })}
            className="input w-20! py-1"
          />
        </label>
        <span className="text-xs text-muted">≈ {percent}% dei giorni</span>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={busy || !changed || !v.name.trim()}
            onClick={() => run(() => supabase.from("weather_seeds").update({ name: v.name.trim(), weight: v.weight, periods: v.periods }).eq("id", seed.id), "Seme salvato.")}
            className="btn px-3 py-1 text-xs"
          >
            Salva
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm(`Eliminare il seme "${seed.name}"?`) && run(() => supabase.from("weather_seeds").delete().eq("id", seed.id), "Seme eliminato.")}
            className="btn-ghost border-red-900 px-2 py-1 text-xs text-red-400 hover:border-red-500"
          >
            Elimina
          </button>
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PERIODS.map((p, i) => (
          <div key={p.id} className="space-y-1 border border-border/50 p-2">
            <p className="text-xs tracking-wider text-muted uppercase">
              {p.label} <span className="normal-case">({String(p.from).padStart(2, "0")}–{p.to}:59)</span>
            </p>
            <div className="flex gap-1.5">
              <select value={v.periods[i]?.cond} onChange={(e) => setPeriod(i, { cond: e.target.value })} aria-label={`Tempo: ${p.label}`} className="input min-w-0 flex-1 py-1 text-xs">
                {CONDITIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={-60}
                max={60}
                value={v.periods[i]?.temp}
                onChange={(e) => setPeriod(i, { temp: Math.max(-60, Math.min(60, Math.round(Number(e.target.value) || 0))) })}
                aria-label={`Temperatura: ${p.label}`}
                className="input w-16! py-1 text-xs"
              />
              <span className="self-center text-xs text-muted">°</span>
            </div>
            <p className="text-[0.6875rem] text-muted">{condition(v.periods[i]?.cond ?? "").label}</p>
          </div>
        ))}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------
// Meteo di oggi delle regioni attive, con possibilita' di rigenerarlo
// ---------------------------------------------------------------------
function TodayTab({ regions }: { regions: WeatherRegion[] }) {
  const { supabase, run, busy, feedback } = useOp();
  const active = regions.filter((r) => r.active);
  const [version, setVersion] = useState(0);
  if (active.length === 0) return <p className="text-muted">Nessuna regione attiva.</p>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Il meteo di ogni regione si estrae al primo sguardo della giornata (ora italiana) ed è uguale per tutti. Rigenerandolo si rifà
        l&apos;estrazione di oggi, per esempio dopo aver cambiato stagione o semi.
      </p>
      {feedback}
      {active.map((r) => (
        <div key={r.id} className="space-y-3 border border-border/60 p-4">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await run(() => supabase.rpc("weather_regenerate", { p_region: r.id }), `Meteo di ${r.name} rigenerato.`)) setVersion((n) => n + 1);
              }}
              className="btn-ghost px-3 py-1 text-xs"
            >
              ⟳ Rigenera oggi
            </button>
          </div>
          <WeatherView key={`${r.id}-${version}`} regionId={r.id} />
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs tracking-wider text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}
