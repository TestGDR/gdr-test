"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------
// Viaggio: da dove si trova il PG verso un altro luogo. Il tempo dipende
// dalla distanza, dal mezzo e dall'andatura; all'arrivo il PG si trova
// a destinazione (vedi migrazione 0053).
// ---------------------------------------------------------------------

type Mode = "piedi" | "cavallo" | "nave" | "drago";
type Pace = "calma" | "normale" | "fretta";
type Place = { id: string; name: string; map: { name: string } | null };
type Travel = { id: number; to_location: string; mode: Mode; pace: Pace; departed_at: string; arrive_at: string };
type Preview = { minutes: number | null; from_name: string | null; to_name: string | null; can_fly: boolean };
// destinazione raggiungibile: minuti ad andatura normale per ogni mezzo (null = con quel mezzo non si puo')
type Option = { location_id: string; name: string; map_name: string; walk: number | null; horse: number | null; ship: number | null; dragon: number | null };
const MODE_KEY: Record<Mode, "walk" | "horse" | "ship" | "dragon"> = { piedi: "walk", cavallo: "horse", nave: "ship", drago: "dragon" };

const MODES: { id: Mode; label: string }[] = [
  { id: "piedi", label: "A piedi" },
  { id: "cavallo", label: "A cavallo" },
  { id: "nave", label: "Per mare" },
  { id: "drago", label: "In groppa al drago" },
];
const PACES: { id: Pace; label: string; hint: string }[] = [
  { id: "calma", label: "Con calma", hint: "più lento" },
  { id: "normale", label: "Normale", hint: "" },
  { id: "fretta", label: "Di fretta", hint: "più veloce" },
];
const MODE_TEXT: Record<Mode, string> = { piedi: "a piedi", cavallo: "a cavallo", nave: "per mare", drago: "in groppa al drago" };

function duration(min: number) {
  if (min < 60) return `${min} minut${min === 1 ? "o" : "i"}`;
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d && `${d} giorn${d === 1 ? "o" : "i"}`, h && `${h} or${h === 1 ? "a" : "e"}`, m && `${m} minuti`].filter(Boolean).join(" e ");
}
const at = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function TravelPanel({ me }: { me: MainCharacter }) {
  const supabase = useMemo(() => createClient(), []);
  const [places, setPlaces] = useState<Place[]>([]); // per i nomi dei luoghi
  const [options, setOptions] = useState<Option[] | null>(null); // dove si puo' andare da qui
  const [here, setHere] = useState<string | null>(null); // id del luogo in cui si trova
  const [travel, setTravel] = useState<Travel | null | undefined>(undefined);
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<Mode>("cavallo");
  const [pace, setPace] = useState<Pace>("normale");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [canFly, setCanFly] = useState(false);
  const [rooms, setRooms] = useState<{ room_id: string; room_name: string; location_name: string }[]>([]); // chat di viaggio
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [{ data: loc }, { data: tr }] = await Promise.all([
      supabase.rpc("character_location", { p_character: me.id }),
      supabase
        .from("travels")
        .select("id, to_location, mode, pace, departed_at, arrive_at")
        .eq("character_id", me.id)
        .eq("status", "in_viaggio")
        .maybeSingle(),
    ]);
    return { here: (loc as string | null) ?? null, travel: (tr as Travel | null) ?? null };
  }, [supabase, me.id]);

  useEffect(() => {
    load().then((r) => (setHere(r.here), setTravel(r.travel)));
    supabase
      .from("locations")
      .select("id, name, map:maps(name)")
      .eq("in_game", true)
      .order("name")
      .then(({ data }) => setPlaces((data ?? []) as unknown as Place[]));
    supabase.rpc("travel_options", { p_character: me.id }).then(({ data }) => setOptions((data ?? []) as Option[]));
    supabase.rpc("can_fly", { p_character: me.id }).then(({ data }) => setCanFly(!!data));
  }, [supabase, me.id, load]);

  // in viaggio: le chat in cui si puo' giocare
  useEffect(() => {
    if (!travel) return;
    supabase
      .rpc("travel_rooms", { p_character: me.id })
      .then(({ data }) => setRooms((data ?? []) as { room_id: string; room_name: string; location_name: string }[]));
  }, [supabase, me.id, travel]);

  // il tempo che manca si aggiorna da solo; all'arrivo si ricarica
  useEffect(() => {
    if (!travel) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.parse(travel.arrive_at) + 70_000 < Date.now()) load().then((r) => (setHere(r.here), setTravel(r.travel)));
    }, 15_000);
    return () => clearInterval(timer);
  }, [travel, load]);

  // anteprima del viaggio scelto
  useEffect(() => {
    if (!to) return;
    supabase
      .rpc("travel_preview", { p_character: me.id, p_to: to, p_mode: mode, p_pace: pace })
      .then(({ data }) => setPreview(((data as Preview[] | null) ?? [])[0] ?? null));
  }, [supabase, me.id, to, mode, pace]);

  async function start() {
    setBusy(true);
    const { error } = await supabase.rpc("start_travel", { p_character: me.id, p_to: to, p_mode: mode, p_pace: pace });
    setBusy(false);
    if (error)
      return setError(
        error.message.includes("strada")
          ? "Non c'è una strada per questo luogo con questo mezzo."
          : error.message.includes("gia'")
            ? error.message.replace("gia'", "già")
            : "Partenza non riuscita.",
      );
    setError(null);
    load().then((r) => (setHere(r.here), setTravel(r.travel)));
  }

  async function cancel() {
    if (!window.confirm("Annullare il viaggio? Resterai nel luogo da cui sei partito.")) return;
    await supabase.rpc("cancel_travel", { p_character: me.id });
    load().then((r) => (setHere(r.here), setTravel(r.travel)));
    supabase.rpc("travel_options", { p_character: me.id }).then(({ data }) => setOptions((data ?? []) as Option[]));
  }

  const name = (id: string | null) => places.find((p) => p.id === id)?.name ?? "—";
  const groups = (options ?? []).reduce<Record<string, Option[]>>((acc, o) => {
    (acc[o.map_name] ??= []).push(o);
    return acc;
  }, {});
  const chosen = options?.find((o) => o.location_id === to) ?? null;
  // mezzo possibile verso la destinazione scelta (e il drago solo per chi ne cavalca uno)
  const modeOk = (m: Mode) => (m !== "drago" || canFly) && (!chosen || chosen[MODE_KEY[m]] != null);

  if (travel === undefined) return <p className="text-center text-muted">Caricamento...</p>;

  // In viaggio
  if (travel) {
    const total = Date.parse(travel.arrive_at) - Date.parse(travel.departed_at);
    const done = Math.min(1, Math.max(0, (now - Date.parse(travel.departed_at)) / Math.max(1, total)));
    const left = Math.max(0, Math.ceil((Date.parse(travel.arrive_at) - now) / 60_000));
    return (
      <div className="space-y-4">
        <p className="text-center font-serif text-lg">
          In viaggio da <span className="text-accent">{name(here)}</span> a <span className="text-accent">{name(travel.to_location)}</span>
        </p>
        <p className="text-center text-sm text-muted">
          {MODE_TEXT[travel.mode]}, {PACES.find((p) => p.id === travel.pace)?.label.toLowerCase()}
        </p>
        <div className="h-3 overflow-hidden border border-border bg-black/50">
          <div className="h-full bg-gradient-to-r from-blood to-accent transition-[width] duration-700" style={{ width: `${done * 100}%` }} />
        </div>
        <p className="text-center text-sm">
          {left > 0 ? (
            <>
              Arrivo previsto: <strong>{at(travel.arrive_at)}</strong> (tra {duration(left)})
            </>
          ) : (
            "Stai arrivando..."
          )}
        </p>
        <p className="text-center text-xs text-muted">
          Finché sei in viaggio ti trovi ancora a {name(here)}: corvi, staffette e paggi ti cercano lì. All&apos;arrivo riceverai un messaggio di SISTEMA.
        </p>
        <div className="space-y-1 border border-border bg-black/40 p-3">
          <p className="text-xs tracking-[0.12em] text-muted uppercase">Dove puoi giocare durante il viaggio</p>
          {rooms.length === 0 ? (
            <p className="text-sm text-muted">Nessuna chat di viaggio su questo percorso.</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {rooms.map((r) => (
                <li key={r.room_id}>
                  <Link href={`/chat/${r.room_id}`} className="text-accent hover:underline">
                    {r.room_name}
                  </Link>{" "}
                  <span className="text-xs text-muted">· {r.location_name}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted">Finché viaggi non puoi giocare nelle chat delle città e dei castelli.</p>
        </div>
        <div className="text-center">
          <button type="button" onClick={cancel} className="btn-ghost border-red-900 px-4 py-1.5 text-sm text-red-400 hover:border-red-500">
            Annulla il viaggio
          </button>
        </div>
      </div>
    );
  }

  // Preparare un viaggio
  return (
    <div className="space-y-4">
      <p className="text-center font-serif text-lg">
        Ti trovi a <span className="text-accent">{name(here)}</span>
      </p>
      <label className="block space-y-1">
        <span className="block text-xs tracking-[0.12em] text-muted uppercase">Destinazione</span>
        <select
          value={to}
          onChange={(e) => {
            const next = e.target.value;
            setTo(next);
            // se il mezzo scelto non va bene per la nuova destinazione, prende il primo possibile
            const o = options?.find((x) => x.location_id === next);
            if (o && o[MODE_KEY[mode]] == null) {
              const first = MODES.find((m) => (m.id !== "drago" || canFly) && o[MODE_KEY[m.id]] != null);
              if (first) setMode(first.id);
            }
          }}
          className="input py-1.5"
        >
          <option value="">Scegli dove andare</option>
          {Object.entries(groups).map(([map, list]) => (
            <optgroup key={map} label={map}>
              {list.map((o) => (
                <option key={o.location_id} value={o.location_id}>
                  {o.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {options !== null && options.length === 0 && (
          <span className="block text-xs text-muted">Da qui non ci sono strade verso altri luoghi.</span>
        )}
      </label>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs tracking-[0.12em] text-muted uppercase">Come viaggi</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODES.map((m) => {
            const disabled = !modeOk(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => setMode(m.id)}
                title={
                  disabled
                    ? m.id === "drago" && !canFly
                      ? "Serve un drago di cui sei il cavaliere, almeno adolescente"
                      : "Con questo mezzo non si arriva a questa destinazione"
                    : undefined
                }
                className={`border px-2 py-2 text-sm transition disabled:opacity-35 ${
                  mode === m.id ? "border-accent bg-blood/30 text-accent" : "border-border bg-black/40 hover:border-accent"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs tracking-[0.12em] text-muted uppercase">Andatura</legend>
        <div className="grid grid-cols-3 gap-2">
          {PACES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPace(p.id)}
              className={`border px-2 py-2 text-sm transition ${
                pace === p.id ? "border-accent bg-blood/30 text-accent" : "border-border bg-black/40 hover:border-accent"
              }`}
            >
              {p.label}
              {p.hint && <span className="block text-[10px] text-muted">{p.hint}</span>}
            </button>
          ))}
        </div>
      </fieldset>

      {to && preview && preview.minutes != null && modeOk(mode) && (
        <p className="border border-border bg-black/40 px-3 py-2 text-center text-sm">
          Da <strong>{preview.from_name}</strong> a <strong>{preview.to_name}</strong> {MODE_TEXT[mode]}: arriverai in circa{" "}
          <strong>{duration(preview.minutes!)}</strong>.
        </p>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
      <div className="text-center">
        <button type="button" disabled={busy || !to || !modeOk(mode)} onClick={start} className="btn px-8">
          Parti
        </button>
      </div>
    </div>
  );
}
