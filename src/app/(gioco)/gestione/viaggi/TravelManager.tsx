"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveMissiveSettings, saveTravelSettings, setCharacterPosition } from "./actions";

export type TravelSettings = {
  pace_slow_factor: number;
  pace_fast_factor: number;
  raven_intercept_pct: number;
  rider_intercept_pct: number;
  default_location_id: string | null;
};
export type MapRow = { id: string; name: string; active: boolean };
export type PlaceRow = { id: string; name: string; map_id: string; in_game: boolean; has_ravens: boolean; kind: string };
export type PgRow = { id: string; name: string; location_id: string | null };

type Times = {
  walk_minutes: number | null;
  horse_minutes: number | null;
  ship_minutes: number | null;
  dragon_minutes: number | null;
  raven_minutes: number | null;
};
type RouteRow = Times & { location_a: string; location_b: string };

const MODES = [
  { key: "walk_minutes", label: "A piedi" },
  { key: "horse_minutes", label: "A cavallo" },
  { key: "ship_minutes", label: "Per mare" },
  { key: "dragon_minutes", label: "In drago" },
  { key: "raven_minutes", label: "Corvo" },
] as const;
type ModeKey = (typeof MODES)[number]["key"];
type Mode = (typeof MODES)[number];
// i mezzi dei viaggi e, a parte, il corvo (rotte dei corvi)
const TRAVEL_MODES: readonly Mode[] = MODES.slice(0, 4);
const RAVEN_MODES: readonly Mode[] = MODES.slice(4);

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

export default function TravelManager({
  settings,
  maps,
  places,
  pgs,
}: {
  settings: TravelSettings;
  maps: MapRow[];
  places: PlaceRow[];
  pgs: PgRow[];
}) {
  // solo i luoghi veri: le macroaree di viaggio non sono tappe ne' destinazioni
  const gamePlaces = places.filter((p) => p.in_game && p.kind === "luogo");
  return (
    <div className="space-y-6">
      <PaceForm settings={settings} />
      <Routes maps={maps} places={gamePlaces} />
      <Routes maps={maps} places={gamePlaces.filter((p) => p.has_ravens)} raven />
      <MissiveSection settings={settings} maps={maps} places={gamePlaces} />
      <Positions maps={maps} places={gamePlaces} pgs={pgs} />
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
function TimeInputs({
  modes,
  values,
  onChange,
}: {
  modes: readonly Mode[];
  values: Record<ModeKey, string>;
  onChange: (v: Record<ModeKey, string>) => void;
}) {
  return (
    <>
      {modes.map((m) => (
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

const emptyTimes = (): Record<ModeKey, string> => ({ walk_minutes: "", horse_minutes: "", ship_minutes: "", dragon_minutes: "", raven_minutes: "" });
const timesOf = (r: Times): Record<ModeKey, string> => ({
  walk_minutes: toHours(r.walk_minutes),
  horse_minutes: toHours(r.horse_minutes),
  ship_minutes: toHours(r.ship_minutes),
  dragon_minutes: toHours(r.dragon_minutes),
  raven_minutes: toHours(r.raven_minutes),
});
const minutesOf = (v: Record<ModeKey, string>) => ({
  walk_minutes: toMinutes(v.walk_minutes),
  horse_minutes: toMinutes(v.horse_minutes),
  ship_minutes: toMinutes(v.ship_minutes),
  dragon_minutes: toMinutes(v.dragon_minutes),
  raven_minutes: toMinutes(v.raven_minutes),
});
const showTimes = (t: Times, modes: readonly Mode[]) =>
  modes.map((m) => (
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

// raven = rotte dei corvi: solo tra castelli o citta', solo il tempo del corvo.
// Stessa tabella dei percorsi: ogni sezione tocca solo le sue colonne.
function Routes({ maps, places, raven = false }: { maps: MapRow[]; places: PlaceRow[]; raven?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const modes = raven ? RAVEN_MODES : TRAVEL_MODES;
  const others = raven ? TRAVEL_MODES : RAVEN_MODES;
  const has = (r: Times, list: readonly Mode[]) => list.some((m) => r[m.key] != null);
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
    const part = Object.fromEntries(modes.map((m) => [m.key, t[m.key]]));
    if (Object.values(part).every((v) => v == null)) return setError(raven ? "Scrivi il tempo del corvo." : "Scrivi almeno un tempo.");
    const [a, b] = [from.place, to.place].sort();
    // solo le colonne di questa sezione: l'altra resta com'e'
    const { error } = await supabase.from("travel_routes").upsert({ location_a: a, location_b: b, ...part });
    if (error) return setError("Percorso non salvato.");
    setError(null);
    setTimes(emptyTimes());
    setTo({ map: "", place: "" });
    setEditing(null);
    load().then(setRows);
  }

  async function remove(r: RouteRow) {
    if (!window.confirm(`Cancellare ${raven ? "la rotta del corvo" : "il percorso"} ${placeName(r.location_a)} ↔ ${placeName(r.location_b)}?`)) return;
    const match = supabase.from("travel_routes");
    // se la tratta serve anche all'altra sezione si svuotano solo le colonne di questa
    if (has(r, others))
      await match
        .update(Object.fromEntries(modes.map((m) => [m.key, null])))
        .eq("location_a", r.location_a)
        .eq("location_b", r.location_b);
    else await match.delete().eq("location_a", r.location_a).eq("location_b", r.location_b);
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
    .filter((r) => has(r, modes))
    .filter((r) => !q || placeName(r.location_a).toLowerCase().includes(q) || placeName(r.location_b).toLowerCase().includes(q))
    .sort((x, y) => placeName(x.location_a).localeCompare(placeName(y.location_a)));

  return (
    <Box
      title={raven ? "Rotte dei corvi" : "Percorsi"}
      text={
        raven ? (
          <>
            Il tempo di volo del corvo tra due <strong className="text-foreground">castelli o città</strong> (le macroaree con la casella
            &quot;Castello o città&quot; in Gestione mondo), nei due sensi. Ogni rotta ha il suo tempo. Un corvo parte solo se mittente e
            destinatario sono in un castello o città collegati da una catena di rotte: con più tappe, il maestro lo inoltra. Altrimenti parte
            una staffetta lungo i percorsi.
          </>
        ) : (
        <>
          Si viaggia <strong className="text-foreground">solo lungo i percorsi</strong>. Un percorso collega due macroaree, anche di mappe
          diverse (per esempio Terre della Tempesta / Approdo ↔ Dorne / Stepstones), nei due sensi, con un tempo per ogni mezzo ad andatura
          normale. Lascia vuoto un mezzo se con quello non si può fare (es. a piedi attraverso il mare). Il viaggio segue da solo la strada
          più breve, anche con più tappe, sempre con lo stesso mezzo: se tra due macroaree non c&apos;è una catena di percorsi, non ci si arriva.
          <br />
          <strong className="text-foreground">Missive:</strong> la staffetta segue questi percorsi, per ogni tratta il più veloce tra a
          cavallo e per mare, di fretta. I corvi hanno le loro rotte, qui sotto.
        </>
        )
      }
    >
      <div className="space-y-3 border border-dashed border-border p-3">
        <p className="text-xs tracking-[0.12em] text-accent uppercase">
          {editing ? (raven ? "Modifica la rotta" : "Modifica il percorso") : raven ? "Nuova rotta del corvo" : "Nuovo percorso"}
        </p>
        {raven && places.length < 2 && (
          <p className="text-sm text-orange-300">Servono almeno due macroaree con la casella &quot;Castello o città&quot; (Gestione mondo).</p>
        )}
        <div className="flex flex-wrap gap-4">
          <PlacePicker label="Da" maps={maps} places={places} value={from} onChange={setFrom} />
          <PlacePicker label="A" maps={maps} places={places} value={to} onChange={setTo} />
        </div>
        <div className="flex flex-wrap gap-4">
          <TimeInputs modes={modes} values={times} onChange={setTimes} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={save} className="btn px-4 py-1.5 text-sm">
            {editing ? "Salva le modifiche" : raven ? "+ Aggiungi rotta" : "+ Aggiungi percorso"}
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
      {rows !== null && shown.length === 0 && <p className="text-sm text-muted">{raven ? "Nessuna rotta dei corvi." : "Nessun percorso."}</p>}
      <ul className="divide-y divide-border/60 border border-border/60">
        {shown.map((r) => (
          <li key={key(r)} className={`flex flex-wrap items-center gap-4 px-3 py-2 ${editing === key(r) ? "bg-blood/15" : ""}`}>
            <span className="min-w-56 flex-1">
              <span className="font-serif">{placeName(r.location_a)}</span> ↔ <span className="font-serif">{placeName(r.location_b)}</span>
              <span className="block text-[11px] text-muted">
                {mapOf(r.location_a) === mapOf(r.location_b) ? mapOf(r.location_a) : `${mapOf(r.location_a)} ↔ ${mapOf(r.location_b)}`}
              </span>
            </span>
            <span className="min-w-40">{showTimes(r, modes)}</span>
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
// Missive: intercettazioni e luogo di partenza
function MissiveSection({ settings, maps, places }: { settings: TravelSettings; maps: MapRow[]; places: PlaceRow[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = "block space-y-1 text-xs tracking-wide text-muted uppercase";
  const mapName = (id: string) => maps.find((m) => m.id === id)?.name ?? "?";
  return (
    <Box
      title="Missive"
      text={
        <>
          Stesso luogo: un paggio, subito. Tra due castelli o città con una rotta dei corvi: un corvo. Altrimenti una staffetta lungo i
          percorsi. Senza strada il cartiglio non parte. Fuori dai territori sicuri corvi e staffette possono essere intercettati: non
          arrivano mai e li trovi nei Log. Le caselle &quot;territorio sicuro&quot; (mappe) e &quot;castello o città&quot; (macroaree) sono in
          Gestione mondo.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => {
            const r = await saveMissiveSettings(form);
            setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Impostazioni salvate." });
          });
        }}
        className="space-y-3"
      >
        <div className="flex flex-wrap gap-3">
          <label className={field}>
            <span>Corvo: intercettazione (%)</span>
            <input name="raven_intercept_pct" type="number" min={0} max={100} defaultValue={settings.raven_intercept_pct} className="input w-28!" />
          </label>
          <label className={field}>
            <span>Staffetta: intercettazione (%)</span>
            <input name="rider_intercept_pct" type="number" min={0} max={100} defaultValue={settings.rider_intercept_pct} className="input w-28!" />
          </label>
          <label className={field}>
            <span>Luogo di partenza dei nuovi PG</span>
            <select name="default_location_id" defaultValue={settings.default_location_id ?? ""} className="input w-72!">
              <option value="">— nessuno —</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({mapName(p.map_id)})
                </option>
              ))}
            </select>
          </label>
        </div>
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
// Posizione dei PG: si corregge a mano
function Positions({ maps, places, pgs }: { maps: MapRow[]; places: PlaceRow[]; pgs: PgRow[] }) {
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mapName = (id: string) => maps.find((m) => m.id === id)?.name ?? "?";
  const q = query.trim().toLowerCase();
  const shown = q ? pgs.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30) : [];
  return (
    <Box
      title="Posizione dei personaggi"
      text="Ogni PG si trova nel luogo dell'ultima chat di gioco in cui ha scritto un'azione, o dove è arrivato con un viaggio. Qui puoi correggerla: cerca il personaggio e scegli il luogo."
    >
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome del personaggio" className="input max-w-sm py-1.5" />
      {shown.length > 0 && (
        <ul className="divide-y divide-border/60 border border-border/60">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 font-serif">{p.name}</span>
              <select
                defaultValue={p.location_id ?? ""}
                disabled={pending}
                onChange={(e) =>
                  start(async () => {
                    const r = await setCharacterPosition(p.id, e.target.value || null);
                    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Posizione di ${p.name} aggiornata.` });
                  })
                }
                aria-label={`Posizione di ${p.name}`}
                className="input w-72! py-1"
              >
                <option value="">— luogo di partenza —</option>
                {places.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({mapName(l.map_id)})
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </Box>
  );
}
