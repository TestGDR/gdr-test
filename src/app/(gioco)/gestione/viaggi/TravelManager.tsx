"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveTravelSettings } from "./actions";

export type TravelSettings = { pace_slow_factor: number; pace_fast_factor: number };
export type MapRow = { id: string; name: string; active: boolean };
export type PlaceRow = { id: string; name: string; map_id: string; in_game: boolean };

type Times = { walk_minutes: number | null; horse_minutes: number | null; ship_minutes: number | null; dragon_minutes: number | null };
type RouteRow = Times & { location_a: string; location_b: string };
type MapTimeRow = Times & { map_a: string; map_b: string };

const MODES = [
  { key: "walk_minutes", label: "A piedi" },
  { key: "horse_minutes", label: "A cavallo" },
  { key: "ship_minutes", label: "Per mare" },
  { key: "dragon_minutes", label: "In drago" },
] as const;
type ModeKey = (typeof MODES)[number]["key"];

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

export default function TravelManager({ settings, maps, places }: { settings: TravelSettings; maps: MapRow[]; places: PlaceRow[] }) {
  return (
    <div className="space-y-6">
      <PaceForm settings={settings} />
      <Routes maps={maps} places={places.filter((p) => p.in_game)} />
      <MapTimes maps={maps} />
    </div>
  );
}

function Box({ title, text, children }: { title: string; text: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border border-border bg-black/50 p-5">
      <h2 className="font-serif text-xl text-accent">{title}</h2>
      <div className="text-sm text-muted">{text}</div>
      {children}
    </section>
  );
}

// Tre caselle (ore) per i mezzi; vuoto = con quel mezzo non si puo'
function TimeInputs({ values, onChange }: { values: Record<ModeKey, string>; onChange: (v: Record<ModeKey, string>) => void }) {
  return (
    <>
      {MODES.map((m) => (
        <label key={m.key} className="block space-y-1 text-xs tracking-wide text-muted uppercase">
          <span>{m.label} (ore)</span>
          <input
            value={values[m.key]}
            onChange={(e) => onChange({ ...values, [m.key]: e.target.value })}
            inputMode="decimal"
            placeholder="non si può"
            className="input w-28! py-1"
          />
          <span className="block text-[10px] tracking-normal normal-case">
            {toMinutes(values[m.key]) ? duration(toMinutes(values[m.key])!) : "—"}
          </span>
        </label>
      ))}
    </>
  );
}

const emptyTimes = (): Record<ModeKey, string> => ({ walk_minutes: "", horse_minutes: "", ship_minutes: "", dragon_minutes: "" });
const timesOf = (r: Times): Record<ModeKey, string> => ({
  walk_minutes: toHours(r.walk_minutes),
  horse_minutes: toHours(r.horse_minutes),
  ship_minutes: toHours(r.ship_minutes),
  dragon_minutes: toHours(r.dragon_minutes),
});
const minutesOf = (v: Record<ModeKey, string>) => ({
  walk_minutes: toMinutes(v.walk_minutes),
  horse_minutes: toMinutes(v.horse_minutes),
  ship_minutes: toMinutes(v.ship_minutes),
  dragon_minutes: toMinutes(v.dragon_minutes),
});
const noneSet = (t: Times) => !t.walk_minutes && !t.horse_minutes && !t.ship_minutes && !t.dragon_minutes;
const showTimes = (t: Times) =>
  MODES.map((m) => (
    <span key={m.key} className="block text-xs">
      <span className="text-muted">{m.label}:</span> {t[m.key] ? duration(t[m.key]!) : <span className="text-muted">non si può</span>}
    </span>
  ));

// ---------------------------------------------------------------------
// Andature
function PaceForm({ settings }: { settings: TravelSettings }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = "block space-y-1 text-xs tracking-wide text-muted uppercase";
  return (
    <Box title="Andature" text="Moltiplicano il tempo del viaggio. Esempio: con calma 1,5 = una volta e mezza il tempo; di fretta 0,75 = tre quarti del tempo.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => {
            const r = await saveTravelSettings(form);
            setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Andature salvate." });
          });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className={field}>
          <span>Con calma</span>
          <input name="pace_slow_factor" type="number" min={0.1} max={10} step={0.05} defaultValue={settings.pace_slow_factor} className="input w-28!" />
        </label>
        <label className={field}>
          <span>Di fretta</span>
          <input name="pace_fast_factor" type="number" min={0.1} max={10} step={0.05} defaultValue={settings.pace_fast_factor} className="input w-28!" />
        </label>
        <button className="btn" disabled={pending}>
          Salva
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
      </form>
    </Box>
  );
}

// ---------------------------------------------------------------------
// Percorsi tra due macroaree
function PlacePicker({
  label,
  maps,
  places,
  value,
  onChange,
}: {
  label: string;
  maps: MapRow[];
  places: PlaceRow[];
  value: { map: string; place: string };
  onChange: (v: { map: string; place: string }) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-xs tracking-wide text-muted uppercase">{label}</span>
      <div className="flex flex-wrap gap-2">
        <select value={value.map} onChange={(e) => onChange({ map: e.target.value, place: "" })} className="input w-48! py-1.5" aria-label={`${label}: mappa`}>
          <option value="">Mappa...</option>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.active ? "" : " (spenta)"}
            </option>
          ))}
        </select>
        <select
          value={value.place}
          onChange={(e) => onChange({ ...value, place: e.target.value })}
          disabled={!value.map}
          className="input w-56! py-1.5 disabled:opacity-50"
          aria-label={`${label}: macroarea`}
        >
          <option value="">Macroarea...</option>
          {places
            .filter((p) => p.map_id === value.map)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

function Routes({ maps, places }: { maps: MapRow[]; places: PlaceRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RouteRow[] | null>(null);
  const [from, setFrom] = useState({ map: "", place: "" });
  const [to, setTo] = useState({ map: "", place: "" });
  const [times, setTimes] = useState(emptyTimes());
  const [editing, setEditing] = useState<string | null>(null); // chiave del percorso in modifica
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(
    () => supabase.from("travel_routes").select("*").then(({ data }) => (data ?? []) as RouteRow[]),
    [supabase],
  );
  useEffect(() => {
    load().then(setRows);
  }, [load]);

  const placeName = (id: string) => places.find((p) => p.id === id)?.name ?? "?";
  const mapOf = (id: string) => maps.find((m) => m.id === places.find((p) => p.id === id)?.map_id)?.name ?? "?";
  const key = (r: RouteRow) => `${r.location_a}|${r.location_b}`;

  async function save() {
    if (!from.place || !to.place) return setError("Scegli la macroarea di partenza e quella di arrivo.");
    if (from.place === to.place) return setError("Partenza e arrivo sono la stessa macroarea.");
    const t = minutesOf(times);
    if (noneSet(t)) return setError("Scrivi almeno un tempo (a piedi, a cavallo o in drago).");
    const [a, b] = [from.place, to.place].sort();
    const { error } = await supabase.from("travel_routes").upsert({ location_a: a, location_b: b, ...t });
    if (error) return setError("Percorso non salvato.");
    setError(null);
    setTimes(emptyTimes());
    setTo({ map: "", place: "" });
    setEditing(null);
    load().then(setRows);
  }

  async function remove(r: RouteRow) {
    if (!window.confirm(`Cancellare il percorso ${placeName(r.location_a)} ↔ ${placeName(r.location_b)}?`)) return;
    await supabase.from("travel_routes").delete().eq("location_a", r.location_a).eq("location_b", r.location_b);
    load().then(setRows);
  }

  function edit(r: RouteRow) {
    const pa = places.find((p) => p.id === r.location_a), pb = places.find((p) => p.id === r.location_b);
    setFrom({ map: pa?.map_id ?? "", place: r.location_a });
    setTo({ map: pb?.map_id ?? "", place: r.location_b });
    setTimes(timesOf(r));
    setEditing(key(r));
  }

  const q = query.trim().toLowerCase();
  const shown = (rows ?? [])
    .filter((r) => !q || placeName(r.location_a).toLowerCase().includes(q) || placeName(r.location_b).toLowerCase().includes(q))
    .sort((x, y) => placeName(x.location_a).localeCompare(placeName(y.location_a)));

  return (
    <Box
      title="Percorsi"
      text={
        <>
          Un percorso collega due macroaree, nei due sensi, con un tempo per ogni mezzo ad andatura normale. Lascia vuoto un mezzo se con
          quello non si può fare (es. a piedi attraverso il mare); per mare si viaggia solo lungo i percorsi con un tempo per mare.{" "}
          <strong className="text-foreground">Tra mappe diverse si passa solo lungo i percorsi</strong>: per esempio Terre della Tempesta /
          Approdo ↔ Dorne / Stepstones. Il viaggio segue da solo la strada più breve, anche con più tappe.
        </>
      }
    >
      <div className="space-y-3 border border-dashed border-border p-3">
        <p className="text-xs tracking-[0.12em] text-accent uppercase">{editing ? "Modifica il percorso" : "Nuovo percorso"}</p>
        <div className="flex flex-wrap gap-4">
          <PlacePicker label="Da" maps={maps} places={places} value={from} onChange={setFrom} />
          <PlacePicker label="A" maps={maps} places={places} value={to} onChange={setTo} />
        </div>
        <div className="flex flex-wrap gap-4">
          <TimeInputs values={times} onChange={setTimes} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={save} className="btn px-4 py-1.5 text-sm">
            {editing ? "Salva le modifiche" : "+ Aggiungi percorso"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => (setEditing(null), setTimes(emptyTimes()), setFrom({ map: "", place: "" }), setTo({ map: "", place: "" }))}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Annulla
            </button>
          )}
        </div>
      </div>

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca una macroarea" className="input max-w-xs py-1.5" />
      {rows === null && <p className="text-sm text-muted">Caricamento...</p>}
      {rows !== null && shown.length === 0 && <p className="text-sm text-muted">Nessun percorso.</p>}
      <ul className="divide-y divide-border/60 border border-border/60">
        {shown.map((r) => (
          <li key={key(r)} className={`flex flex-wrap items-center gap-4 px-3 py-2 ${editing === key(r) ? "bg-blood/15" : ""}`}>
            <span className="min-w-56 flex-1">
              <span className="font-serif">{placeName(r.location_a)}</span> ↔ <span className="font-serif">{placeName(r.location_b)}</span>
              <span className="block text-[11px] text-muted">
                {mapOf(r.location_a) === mapOf(r.location_b) ? mapOf(r.location_a) : `${mapOf(r.location_a)} ↔ ${mapOf(r.location_b)}`}
              </span>
            </span>
            <span className="min-w-40">{showTimes(r)}</span>
            <span className="flex gap-2 text-xs">
              <button type="button" onClick={() => edit(r)} className="text-muted hover:text-accent">
                Modifica
              </button>
              <button type="button" onClick={() => remove(r)} className="text-red-400 hover:text-red-300">
                Cancella
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Box>
  );
}

// ---------------------------------------------------------------------
// Tempi tra due mappe (anche una mappa con se stessa)
function MapTimes({ maps }: { maps: MapRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<MapTimeRow[] | null>(null);
  const [a, setA] = useState("");
  const [times, setTimes] = useState(emptyTimes());
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => supabase.from("map_travel_times").select("*").then(({ data }) => (data ?? []) as MapTimeRow[]), [supabase]);
  useEffect(() => {
    load().then(setRows);
  }, [load]);
  const mapName = (id: string) => maps.find((m) => m.id === id)?.name ?? "?";

  async function save() {
    if (!a) return setError("Scegli la mappa.");
    const t = minutesOf(times);
    if (noneSet(t)) return setError("Scrivi almeno un tempo.");
    const { error } = await supabase.from("map_travel_times").upsert({ map_a: a, map_b: a, ...t });
    if (error) return setError("Tempi non salvati.");
    setError(null);
    setA("");
    setTimes(emptyTimes());
    setEditing(false);
    load().then(setRows);
  }

  async function remove(r: MapTimeRow) {
    if (!window.confirm("Cancellare questi tempi?")) return;
    await supabase.from("map_travel_times").delete().eq("map_a", r.map_a).eq("map_b", r.map_b);
    load().then(setRows);
  }

  return (
    <Box
      title="Tempi dentro le mappe"
      text={
        <>
          Il tempo standard per andare da una macroarea a un&apos;altra della stessa mappa, se tra le due non c&apos;è un percorso. Per
          passare a un&apos;altra mappa servono i percorsi qui sopra. Senza tempo standard, in una mappa ci si muove solo lungo i percorsi.
        </>
      }
    >
      <div className="space-y-3 border border-dashed border-border p-3">
        <p className="text-xs tracking-[0.12em] text-accent uppercase">{editing ? "Modifica i tempi" : "Tempi di una mappa"}</p>
        <select value={a} onChange={(e) => setA(e.target.value)} aria-label="Mappa" disabled={editing} className="input w-56! py-1.5">
          <option value="">Mappa...</option>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.active ? "" : " (spenta)"}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-4">
          <TimeInputs values={times} onChange={setTimes} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={save} className="btn px-4 py-1.5 text-sm">
            {editing ? "Salva le modifiche" : "+ Aggiungi"}
          </button>
          {editing && (
            <button type="button" onClick={() => (setEditing(false), setA(""), setTimes(emptyTimes()))} className="btn-ghost px-3 py-1.5 text-sm">
              Annulla
            </button>
          )}
        </div>
      </div>

      {rows === null && <p className="text-sm text-muted">Caricamento...</p>}
      {rows !== null && rows.length === 0 && <p className="text-sm text-muted">Nessuna mappa ha un tempo standard.</p>}
      <ul className="divide-y divide-border/60 border border-border/60">
        {rows?.map((r) => (
          <li key={`${r.map_a}|${r.map_b}`} className="flex flex-wrap items-center gap-4 px-3 py-2">
            <span className="min-w-56 flex-1 font-serif">Dentro {mapName(r.map_a)}</span>
            <span className="min-w-40">{showTimes(r)}</span>
            <span className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => (setA(r.map_a), setTimes(timesOf(r)), setEditing(true))}
                className="text-muted hover:text-accent"
              >
                Modifica
              </button>
              <button type="button" onClick={() => remove(r)} className="text-red-400 hover:text-red-300">
                Cancella
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Box>
  );
}
