"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveTravelSettings } from "./actions";

export type TravelSettings = {
  walk_full_hours: number;
  horse_full_hours: number;
  dragon_full_hours: number;
  pace_slow_factor: number;
  pace_fast_factor: number;
};
type Route = {
  location_a: string;
  location_b: string;
  name_a: string;
  name_b: string;
  map_a: string;
  map_b: string;
  auto_walk: number;
  auto_horse: number;
  auto_dragon: number;
  walk_minutes: number | null;
  horse_minutes: number | null;
  dragon_minutes: number | null;
};

const MODES = [
  { key: "walk", label: "A piedi" },
  { key: "horse", label: "A cavallo" },
  { key: "dragon", label: "In drago" },
] as const;

// minuti -> "1 g 4 h 30 min"
function duration(min: number) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d && `${d} g`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ") || "0 min";
}
// ore (anche con la virgola) -> minuti; vuoto -> null
function toMinutes(v: string) {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n * 60)) : null;
}
const toHours = (m: number | null) => (m == null ? "" : String(Math.round((m / 60) * 100) / 100));

export default function TravelManager({ settings }: { settings: TravelSettings }) {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-6">
      <SpeedForm settings={settings} onSaved={() => setVersion((v) => v + 1)} />
      <RoutesTable key={version} />
    </div>
  );
}

function Box({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border border-border bg-black/50 p-5">
      <h2 className="font-serif text-xl text-accent">{title}</h2>
      <p className="text-sm text-muted">{text}</p>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------
// Velocita' dei mezzi e andature
function SpeedForm({ settings, onSaved }: { settings: TravelSettings; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = "block space-y-1 text-xs tracking-wide text-muted uppercase";
  return (
    <Box
      title="Velocità"
      text="Per ogni mezzo, quante ore reali servono per attraversare tutta la mappa: il tempo di un viaggio è in proporzione alla distanza tra i due luoghi (tra mappe diverse vale il tempo intero). Le andature moltiplicano il tempo."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => {
            const r = await saveTravelSettings(form);
            setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Velocità salvate." });
            if (!r.error) onSaved();
          });
        }}
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={field}>
            <span>A piedi: ore per tutta la mappa</span>
            <input name="walk_full_hours" type="number" min={0} max={1000} step={0.25} defaultValue={settings.walk_full_hours} className="input" />
          </label>
          <label className={field}>
            <span>A cavallo: ore per tutta la mappa</span>
            <input name="horse_full_hours" type="number" min={0} max={1000} step={0.25} defaultValue={settings.horse_full_hours} className="input" />
          </label>
          <label className={field}>
            <span>In drago: ore per tutta la mappa</span>
            <input name="dragon_full_hours" type="number" min={0} max={1000} step={0.25} defaultValue={settings.dragon_full_hours} className="input" />
          </label>
          <label className={field}>
            <span>Con calma: moltiplica il tempo per</span>
            <input name="pace_slow_factor" type="number" min={0.1} max={10} step={0.05} defaultValue={settings.pace_slow_factor} className="input" />
          </label>
          <label className={field}>
            <span>Di fretta: moltiplica il tempo per</span>
            <input name="pace_fast_factor" type="number" min={0.1} max={10} step={0.05} defaultValue={settings.pace_fast_factor} className="input" />
          </label>
        </div>
        <p className="text-xs text-muted">Esempio: con calma 1,5 = una volta e mezza il tempo; di fretta 0,75 = tre quarti del tempo.</p>
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>
            Salva
          </button>
          {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
        </div>
      </form>
    </Box>
  );
}

// ---------------------------------------------------------------------
// Tempi di percorrenza tra ogni coppia di luoghi (andatura normale)
function RoutesTable() {
  const supabase = useMemo(() => createClient(), []);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(
    () =>
      supabase.rpc("travel_matrix").then(({ data, error }) => {
        if (error) setError("Impossibile caricare i percorsi (hai eseguito la migrazione 0054?).");
        return (data ?? []) as Route[];
      }),
    [supabase],
  );
  useEffect(() => {
    load().then(setRoutes);
  }, [load]);

  const q = query.trim().toLowerCase();
  const shown = (routes ?? []).filter((r) => !q || r.name_a.toLowerCase().includes(q) || r.name_b.toLowerCase().includes(q));

  return (
    <Box
      title="Tempi di percorrenza"
      text="Ogni coppia di luoghi di gioco, nei due sensi, con andatura normale. In grigio il tempo calcolato dalla distanza; scrivi un numero di ore per sostituirlo su quel percorso (vuoto = torna al calcolo automatico)."
    >
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca un luogo" className="input max-w-xs py-1.5" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {routes === null && !error && <p className="text-sm text-muted">Caricamento...</p>}
      {routes !== null && (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs text-muted uppercase">
              <tr>
                <th className="p-2">Percorso</th>
                {MODES.map((m) => (
                  <th key={m.key} className="p-2">
                    {m.label} (ore)
                  </th>
                ))}
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <RouteRow key={`${r.location_a}-${r.location_b}`} route={r} onSaved={() => load().then(setRoutes)} />
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="p-4 text-sm text-muted">Nessun percorso.</p>}
        </div>
      )}
    </Box>
  );
}

function RouteRow({ route, onSaved }: { route: Route; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [values, setValues] = useState({
    walk: toHours(route.walk_minutes),
    horse: toHours(route.horse_minutes),
    dragon: toHours(route.dragon_minutes),
  });
  const [state, setState] = useState<"" | "salvato" | "errore">("");
  const initial = { walk: toHours(route.walk_minutes), horse: toHours(route.horse_minutes), dragon: toHours(route.dragon_minutes) };
  const changed = values.walk !== initial.walk || values.horse !== initial.horse || values.dragon !== initial.dragon;
  const auto = { walk: route.auto_walk, horse: route.auto_horse, dragon: route.auto_dragon };

  async function save() {
    const row = {
      location_a: route.location_a,
      location_b: route.location_b,
      walk_minutes: toMinutes(values.walk),
      horse_minutes: toMinutes(values.horse),
      dragon_minutes: toMinutes(values.dragon),
    };
    const empty = !row.walk_minutes && !row.horse_minutes && !row.dragon_minutes;
    const { error } = empty
      ? await supabase.from("travel_routes").delete().eq("location_a", route.location_a).eq("location_b", route.location_b)
      : await supabase.from("travel_routes").upsert(row);
    setState(error ? "errore" : "salvato");
    if (!error) onSaved();
  }

  return (
    <tr className="border-t border-border/60">
      <td className="p-2">
        <span className="font-serif">{route.name_a}</span> ↔ <span className="font-serif">{route.name_b}</span>
        {route.map_a !== route.map_b && <span className="block text-[11px] text-muted">mappe diverse</span>}
      </td>
      {MODES.map((m) => (
        <td key={m.key} className="p-2">
          <input
            value={values[m.key]}
            onChange={(e) => (setValues((v) => ({ ...v, [m.key]: e.target.value })), setState(""))}
            inputMode="decimal"
            placeholder={(Math.round((auto[m.key] / 60) * 100) / 100).toString()}
            title={`Calcolato: ${duration(auto[m.key])}`}
            className={`input w-24! py-1 ${values[m.key] ? "border-accent/70" : ""}`}
          />
          <span className="mt-0.5 block text-[10px] text-muted">
            {values[m.key] && toMinutes(values[m.key]) ? duration(toMinutes(values[m.key])!) : `auto: ${duration(auto[m.key])}`}
          </span>
        </td>
      ))}
      <td className="p-2 text-right whitespace-nowrap">
        <button type="button" disabled={!changed} onClick={save} className="btn px-3 py-1 text-xs">
          Salva
        </button>
        {state === "salvato" && <span className="ml-2 text-xs text-green-400">✓</span>}
        {state === "errore" && <span className="ml-2 text-xs text-red-400">errore</span>}
      </td>
    </tr>
  );
}
