"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent, type PointerEvent, type ReactNode } from "react";
import { MapDot } from "@/app/(gioco)/mappa/MapView";
import type { GameMap, Location, Room, RoomAccess, RoomGroup } from "@/lib/types";
import { ROOM_ACCESS } from "@/lib/world";
import {
  deleteLocation,
  deleteMap,
  deleteRoom,
  deleteRoomGroup,
  moveRoomGroup,
  saveLocation,
  saveLocationPositions,
  saveMap,
  saveRoom,
  saveRoomGroup,
  saveMissiveSettings,
  setCharacterPosition,
  setMapActive,
  type WorldResult,
} from "./actions";

type Data = {
  maps: GameMap[];
  locations: Location[];
  rooms: Room[];
  groups: RoomGroup[];
  houses: { id: string; name: string }[];
  missive: MissiveSettings | null;
  pgs: { id: string; name: string; location_id: string | null }[];
};
type MissiveSettings = {
  default_location_id: string | null;
  raven_full_hours: number;
  rider_full_hours: number;
  raven_intercept_pct: number;
  rider_intercept_pct: number;
};

const NEW = "__nuova";
const TABS = [
  { id: "mappe", label: "Mappe" },
  { id: "macroaree", label: "Macroaree" },
  { id: "chat", label: "Chat" },
  { id: "missive", label: "Missive" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const fileInput =
  "text-xs text-muted file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-foreground";

// Esegue un'azione del server, mostra l'esito e aggiorna i dati della pagina
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);

  function run(action: () => Promise<WorldResult>, ok: string, after?: (res: WorldResult) => void) {
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) return setMessage({ error: res.error });
      setMessage({ ok });
      router.refresh();
      after?.(res);
    });
  }

  const feedback = message && (
    <p className={`text-sm ${message.error ? "text-red-400" : "text-green-400"}`}>{message.error ?? message.ok}</p>
  );
  return { run, pending, feedback };
}

export default function WorldManager(data: Data) {
  const [tab, setTab] = useState<Tab>("mappe");
  // Mappa scelta: condivisa tra le schede, cosi' si passa da una all'altra senza perderla
  const [mapId, setMapId] = useState<string>(data.maps.find((m) => m.active)?.id ?? data.maps[0]?.id ?? NEW);

  return (
    <section className="rounded-md border border-border bg-black/50">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-2">
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
        {tab === "mappe" && <MapsTab maps={data.maps} locations={data.locations} selectedId={mapId} onSelect={setMapId} />}
        {tab === "macroaree" && <LocationsTab {...data} mapId={mapId} onSelectMap={setMapId} />}
        {tab === "chat" && <RoomsTab {...data} mapId={mapId} onSelectMap={setMapId} />}
        {tab === "missive" && <MissiveTab settings={data.missive} locations={data.locations} maps={data.maps} pgs={data.pgs} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Mappe principali: nome, descrizione, immagine; accese o spente
// ---------------------------------------------------------------------
function MapsTab({
  maps,
  locations,
  selectedId,
  onSelect,
}: {
  maps: GameMap[];
  locations: Location[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { run, pending, feedback } = useAction();
  const map = maps.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <aside className="h-fit space-y-2">
        <p className="text-xs text-muted">
          I giocatori vedono solo le mappe <strong className="text-green-300">attive</strong>, con le loro macroaree e chat.
        </p>
        <ul className="space-y-1">
          {maps.map((m) => (
            <li
              key={m.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 ${m.id === selectedId ? "bg-blood/30" : "hover:bg-blood/15"}`}
            >
              <button type="button" onClick={() => onSelect(m.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-serif">{m.name}</span>
                <span className="text-xs text-muted">{locations.filter((l) => l.map_id === m.id).length} macroaree</span>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setMapActive(m.id, !m.active), m.active ? `${m.name} spenta.` : `${m.name} attivata.`)}
                title={m.active ? "Spegni la mappa" : "Attiva la mappa"}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] tracking-wider uppercase ${
                  m.active ? "border-green-700 bg-green-900/40 text-green-300" : "border-border text-muted hover:text-foreground"
                }`}
              >
                {m.active ? "Attiva" : "Spenta"}
              </button>
            </li>
          ))}
          {maps.length === 0 && <li className="px-2 text-xs text-muted">Nessuna mappa.</li>}
        </ul>
        <button
          type="button"
          onClick={() => onSelect(NEW)}
          className={`btn-ghost w-full text-sm ${selectedId === NEW ? "border-accent text-accent" : ""}`}
        >
          + Nuova mappa
        </button>
        {feedback}
      </aside>
      <MapForm key={map?.id ?? NEW} map={map} onSaved={onSelect} />
    </div>
  );
}

function MapForm({ map, onSaved }: { map: GameMap | null; onSaved: (id: string) => void }) {
  const { run, pending, feedback } = useAction();
  const [preview, setPreview] = useState<string | null>(map?.image_url ?? null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (map) form.set("id", map.id);
    run(
      () => saveMap(form),
      "Mappa salvata.",
      (res) => !map && res.id && onSaved(res.id),
    );
  }

  function remove() {
    if (!map) return;
    if (!window.confirm(`Eliminare la mappa ${map.name}? Verranno cancellate anche tutte le sue macroaree, le chat e i messaggi.`)) return;
    run(
      () => deleteMap(map.id),
      "Mappa eliminata.",
      () => onSaved(NEW),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-serif text-2xl text-accent">{map ? map.name : "Nuova mappa"}</h2>
      <Field label="Nome">
        <input name="name" defaultValue={map?.name} required maxLength={80} className="input" />
      </Field>
      <Field label="Descrizione">
        <textarea name="description" defaultValue={map?.description} rows={3} maxLength={4000} className="input" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="safe" defaultChecked={map?.safe ?? false} className="h-4 w-4 accent-[#8b2a14]" />
        Territorio sicuro: corvi e staffette qui non vengono mai intercettati
      </label>
      <Field label="Immagine della mappa (larghezza mostrata: 600 px)">
        <div className="space-y-2">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full max-w-[600px] rounded border border-border" />
          )}
          <input
            type="file"
            name="image"
            accept={IMAGE_ACCEPT}
            required={!map}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : (map?.image_url ?? null));
            }}
            className={`block ${fileInput}`}
          />
          <span className="text-xs text-muted">PNG, JPG, WebP o GIF · max 5 MB · consigliata larghezza 1200 px</span>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Salvataggio..." : map ? "Salva" : "Crea mappa"}
        </button>
        {map && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300"
          >
            Elimina mappa
          </button>
        )}
        {feedback}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Macroaree: puntini trascinabili sulla mappa + dati
// ---------------------------------------------------------------------
function MapPicker({ maps, mapId, onSelect }: { maps: GameMap[]; mapId: string; onSelect: (id: string) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs tracking-wider text-muted uppercase">Mappa</span>
      <select
        value={maps.some((m) => m.id === mapId) ? mapId : ""}
        onChange={(e) => onSelect(e.target.value)}
        className="input w-auto py-1.5"
      >
        {!maps.some((m) => m.id === mapId) && <option value="">Scegli una mappa...</option>}
        {maps.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.active ? "" : " (spenta)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function LocationsTab({ maps, locations, mapId, onSelectMap }: Data & { mapId: string; onSelectMap: (id: string) => void }) {
  const map = maps.find((m) => m.id === mapId);
  const mapLocations = locations.filter((l) => l.map_id === mapId);
  const [selectedId, setSelectedId] = useState<string>(NEW);
  const location = mapLocations.find((l) => l.id === selectedId) ?? null;

  if (maps.length === 0) return <p className="text-muted">Crea prima una mappa.</p>;

  return (
    <div className="space-y-4">
      <MapPicker maps={maps} mapId={mapId} onSelect={(id) => (onSelectMap(id), setSelectedId(NEW))} />
      {map && (
        <div className="grid gap-5 xl:grid-cols-[600px_1fr]">
          <PositionEditor
            // ricomincia da capo quando arrivano posizioni nuove dal server
            key={map.id + mapLocations.map((l) => `${l.id}:${l.x}:${l.y}`).join()}
            map={map}
            locations={mapLocations}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {mapLocations.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedId(l.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${l.id === selectedId ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
                >
                  {l.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedId(NEW)}
                className={`rounded-full border border-dashed px-3 py-1 text-sm ${selectedId === NEW ? "border-accent text-accent" : "border-accent/50 text-muted hover:text-foreground"}`}
              >
                + Nuova macroarea
              </button>
            </div>
            <LocationForm key={location?.id ?? `${NEW}${mapId}`} location={location} maps={maps} mapId={mapId} onSaved={setSelectedId} />
          </div>
        </div>
      )}
    </div>
  );
}

function PositionEditor({
  map,
  locations,
  selectedId,
  onSelect,
}: {
  map: GameMap;
  locations: Location[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { run, pending, feedback } = useAction();
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const [pos, setPos] = useState(() => Object.fromEntries(locations.map((l) => [l.id, { x: Number(l.x), y: Number(l.y) }])));
  const changed = locations.filter((l) => pos[l.id].x !== Number(l.x) || pos[l.id].y !== Number(l.y));

  function move(e: PointerEvent) {
    const id = dragging.current;
    const rect = box.current?.getBoundingClientRect();
    if (!id || !rect) return;
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
    setPos((p) => ({
      ...p,
      [id]: { x: clamp(((e.clientX - rect.left) / rect.width) * 100), y: clamp(((e.clientY - rect.top) / rect.height) * 100) },
    }));
  }

  return (
    <div className="space-y-2">
      <div
        ref={box}
        onPointerMove={move}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
        className="relative w-full max-w-[600px] touch-none overflow-hidden rounded-md border border-border select-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={map.image_url} alt={map.name} className="block w-full" draggable={false} />
        {locations.map((l) => (
          <button
            key={l.id}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              dragging.current = l.id;
              onSelect(l.id);
            }}
            aria-label={`Sposta ${l.name}`}
            className={`group absolute -translate-x-1/2 -translate-y-1/2 cursor-grab p-1 active:cursor-grabbing ${l.id === selectedId ? "z-10" : ""}`}
            style={{ left: `${pos[l.id].x}%`, top: `${pos[l.id].y}%` }}
          >
            <MapDot />
            <span
              className={`pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 rounded border bg-black/90 px-1.5 py-0.5 font-serif text-[11px] whitespace-nowrap ${
                l.id === selectedId ? "border-accent text-accent" : "border-border text-foreground"
              }`}
            >
              {l.name}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted">Trascina i puntini, poi salva: le posizioni saranno quelle viste dai giocatori.</span>
        <button
          type="button"
          className="btn px-4 py-1.5 text-sm"
          disabled={pending || changed.length === 0}
          onClick={() => run(() => saveLocationPositions(changed.map((l) => ({ id: l.id, ...pos[l.id] }))), "Posizioni salvate.")}
        >
          Salva posizioni{changed.length > 0 && ` (${changed.length})`}
        </button>
        {changed.length > 0 && (
          <button
            type="button"
            className="text-sm text-muted hover:text-accent"
            onClick={() => setPos(Object.fromEntries(locations.map((l) => [l.id, { x: Number(l.x), y: Number(l.y) }])))}
          >
            Annulla
          </button>
        )}
        {feedback}
      </div>
    </div>
  );
}

function LocationForm({
  location,
  maps,
  mapId,
  onSaved,
}: {
  location: Location | null;
  maps: GameMap[];
  mapId: string;
  onSaved: (id: string) => void;
}) {
  const { run, pending, feedback } = useAction();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (location) form.set("id", location.id);
    run(
      () => saveLocation(form),
      location ? "Macroarea salvata." : "Macroarea creata: è al centro della mappa, trascinala dove vuoi.",
      (res) => !location && res.id && onSaved(res.id),
    );
  }

  function remove() {
    if (!location) return;
    if (!window.confirm(`Eliminare la macroarea ${location.name}? Verranno cancellate anche le sue chat e i messaggi.`)) return;
    run(
      () => deleteLocation(location.id),
      "Macroarea eliminata.",
      () => onSaved(NEW),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border/60 p-4">
      <h3 className="font-serif text-xl text-accent">{location ? location.name : "Nuova macroarea"}</h3>
      <Field label="Nome">
        <input name="name" defaultValue={location?.name} required maxLength={80} className="input" />
      </Field>
      <Field label="Mappa di appartenenza">
        <select name="map_id" defaultValue={location?.map_id ?? mapId} className="input">
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Descrizione">
        <textarea name="description" defaultValue={location?.description} rows={4} maxLength={4000} className="input" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="has_ravens" defaultChecked={location?.has_ravens ?? false} className="h-4 w-4 accent-[#8b2a14]" />
        Castello o città: partono e arrivano i corvi
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="in_game" defaultChecked={location?.in_game ?? true} className="h-4 w-4 accent-[#8b2a14]" />
        Luogo di gioco: entrando nelle sue chat il PG si trova qui (togli la spunta per le chat OFF)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Salvataggio..." : location ? "Salva" : "Crea macroarea"}
        </button>
        {location && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300"
          >
            Elimina
          </button>
        )}
        {feedback}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Missive: tempi di consegna, intercettazioni, luogo di partenza e
// posizione dei PG
// ---------------------------------------------------------------------
function MissiveTab({
  settings,
  locations,
  maps,
  pgs,
}: {
  settings: MissiveSettings | null;
  locations: Location[];
  maps: GameMap[];
  pgs: { id: string; name: string; location_id: string | null }[];
}) {
  const { run, pending, feedback } = useAction();
  const [query, setQuery] = useState("");
  const places = locations.filter((l) => l.in_game);
  const placeLabel = (l: Location) => `${l.name} (${maps.find((m) => m.id === l.map_id)?.name ?? "?"})`;
  const shown = query.trim() ? pgs.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30) : [];

  if (!settings) return <p className="text-red-400">Impostazioni delle missive non trovate: esegui la migrazione 0050.</p>;
  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          run(() => saveMissiveSettings(form), "Impostazioni salvate.");
        }}
        className="space-y-4 rounded-md border border-border/60 p-4"
      >
        <h3 className="font-serif text-xl text-accent">Consegna delle missive</h3>
        <p className="text-sm text-muted">
          Stesso luogo: un paggio, consegna immediata. Tra castelli e città: un corvo. Altrimenti una staffetta. Il tempo è in proporzione
          alla distanza sulla mappa: qui scegli quante ore reali servono per attraversarla tutta (tra mappe diverse vale il tempo intero).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Corvo: ore per tutta la mappa">
            <input name="raven_full_hours" type="number" min={0} max={240} step={0.25} defaultValue={settings.raven_full_hours} className="input" />
          </Field>
          <Field label="Staffetta: ore per tutta la mappa">
            <input name="rider_full_hours" type="number" min={0} max={240} step={0.25} defaultValue={settings.rider_full_hours} className="input" />
          </Field>
          <Field label="Corvo: probabilità di intercettazione (%)">
            <input name="raven_intercept_pct" type="number" min={0} max={100} defaultValue={settings.raven_intercept_pct} className="input" />
          </Field>
          <Field label="Staffetta: probabilità di intercettazione (%)">
            <input name="rider_intercept_pct" type="number" min={0} max={100} defaultValue={settings.rider_intercept_pct} className="input" />
          </Field>
        </div>
        <p className="text-xs text-muted">
          L&apos;intercettazione vale solo se il mittente o il destinatario si trovano in una mappa non segnata come &quot;territorio sicuro&quot;.
          I cartigli intercettati non arrivano mai: li trovi nei Log, scheda Missive.
        </p>
        <Field label="Luogo di partenza (per i PG che non sono ancora entrati in una chat di gioco)">
          <select name="default_location_id" defaultValue={settings.default_location_id ?? ""} className="input">
            <option value="">— nessuno —</option>
            {places.map((l) => (
              <option key={l.id} value={l.id}>
                {placeLabel(l)}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>
            Salva
          </button>
          {feedback}
        </div>
      </form>

      <section className="space-y-3 rounded-md border border-border/60 p-4">
        <h3 className="font-serif text-xl text-accent">Posizione dei personaggi</h3>
        <p className="text-sm text-muted">
          Ogni PG si trova nel luogo dell&apos;ultima chat di gioco in cui è entrato. Qui puoi correggerla: cerca il personaggio e scegli il luogo.
        </p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome del personaggio" className="input max-w-sm py-1.5" />
        {shown.length > 0 && (
          <ul className="divide-y divide-border/60 border border-border/60">
            {shown.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 font-serif">{p.name}</span>
                <select
                  defaultValue={p.location_id ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => setCharacterPosition(p.id, e.target.value || null), `Posizione di ${p.name} aggiornata.`)}
                  aria-label={`Posizione di ${p.name}`}
                  className="input w-72! py-1"
                >
                  <option value="">— luogo di partenza —</option>
                  {places.map((l) => (
                    <option key={l.id} value={l.id}>
                      {placeLabel(l)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        {feedback}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Chat: collegate a una macroarea; pubbliche, della casata o in affitto
// ---------------------------------------------------------------------
function RoomsTab({
  maps,
  locations,
  rooms,
  groups,
  houses,
  mapId,
  onSelectMap,
}: Data & { mapId: string; onSelectMap: (id: string) => void }) {
  const mapLocations = locations.filter((l) => l.map_id === mapId);
  const [locationId, setLocationId] = useState<string>(mapLocations[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string>(NEW);
  const current = mapLocations.find((l) => l.id === locationId) ?? mapLocations[0];
  const locationRooms = rooms.filter((r) => r.location_id === current?.id);
  const room = locationRooms.find((r) => r.id === selectedId) ?? null;
  const locationGroups = groups.filter((g) => g.location_id === current?.id);
  // Elenco a sinistra diviso come nella modale dei giocatori
  const roomSections = [
    { id: "senza", name: "Senza gruppo", rooms: locationRooms.filter((r) => !locationGroups.some((g) => g.id === r.group_id)) },
    ...locationGroups.map((g) => ({ id: g.id, name: g.name, rooms: locationRooms.filter((r) => r.group_id === g.id) })),
  ].filter((sec) => sec.rooms.length > 0);

  if (maps.length === 0) return <p className="text-muted">Crea prima una mappa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <MapPicker
          maps={maps}
          mapId={mapId}
          onSelect={(id) => {
            onSelectMap(id);
            setLocationId(locations.find((l) => l.map_id === id)?.id ?? "");
            setSelectedId(NEW);
          }}
        />
        {mapLocations.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs tracking-wider text-muted uppercase">Macroarea</span>
            <select
              value={current?.id}
              onChange={(e) => {
                setLocationId(e.target.value);
                setSelectedId(NEW);
              }}
              className="input w-auto py-1.5"
            >
              {mapLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({rooms.filter((r) => r.location_id === l.id).length})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!current ? (
        <p className="text-muted">Questa mappa non ha ancora macroaree: creale nella scheda Macroaree.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <aside className="h-fit space-y-1">
            <GroupsEditor locationId={current.id} groups={locationGroups} rooms={locationRooms} />
            {roomSections.map((section) => (
              <div key={section.id} className="space-y-1">
                <p className="px-2 pt-2 text-[11px] tracking-[0.15em] text-accent/80 uppercase">{section.name}</p>
                {section.rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${r.id === selectedId ? "bg-blood/30" : "hover:bg-blood/15"}`}
                  >
                    <RoomThumb url={r.image_url} name={r.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif">{r.name}</span>
                      <span className="text-xs text-muted">{ROOM_ACCESS.find((a) => a.id === r.access)?.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {locationRooms.length === 0 && <p className="px-2 text-xs text-muted">Nessuna chat in questa macroarea.</p>}
            <button
              type="button"
              onClick={() => setSelectedId(NEW)}
              className={`btn-ghost mt-2 w-full text-sm ${selectedId === NEW ? "border-accent text-accent" : ""}`}
            >
              + Nuova chat
            </button>
          </aside>
          <RoomForm
            key={room?.id ?? `${NEW}${current.id}`}
            room={room}
            maps={maps}
            locations={locations}
            groups={groups}
            houses={houses}
            locationId={current.id}
            onSaved={(id, newLocationId) => {
              if (newLocationId) setLocationId(newLocationId);
              setSelectedId(id);
            }}
          />
        </div>
      )}
    </div>
  );
}

// Gruppi della macroarea: crea, rinomina, ordina, elimina
function GroupsEditor({ locationId, groups, rooms }: { locationId: string; groups: RoomGroup[]; rooms: Room[] }) {
  const { run, pending, feedback } = useAction();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  function remove(group: RoomGroup) {
    if (!window.confirm(`Eliminare il gruppo ${group.name}? Le sue chat restano, senza gruppo.`)) return;
    run(() => deleteRoomGroup(group.id), "Gruppo eliminato.");
  }

  return (
    <div className="mb-3 space-y-2 rounded-md border border-border/60 p-2">
      <p className="text-xs tracking-wider text-muted uppercase">Gruppi</p>
      {groups.length === 0 && <p className="text-xs text-muted">Nessun gruppo: le chat compaiono tutte insieme.</p>}
      <ul className="space-y-1">
        {groups.map((g, i) => (
          <li key={g.id} className="flex items-center gap-1 text-sm">
            {editing?.id === g.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => saveRoomGroup(locationId, editing.name, g.id),
                    "Gruppo rinominato.",
                    () => setEditing(null),
                  );
                }}
                className="flex flex-1 gap-1"
              >
                <input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ id: g.id, name: e.target.value })}
                  maxLength={80}
                  aria-label="Nome del gruppo"
                  className="input min-w-0 flex-1 py-0.5 text-sm"
                />
                <button className="px-1 text-xs text-accent" disabled={pending}>
                  OK
                </button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-serif">
                  {g.name} <span className="text-xs text-muted">({rooms.filter((r) => r.group_id === g.id).length})</span>
                </span>
                <IconBtn
                  label="Sposta su"
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveRoomGroup(g.id, -1), "Ordine salvato.")}
                >
                  ↑
                </IconBtn>
                <IconBtn
                  label="Sposta giù"
                  disabled={pending || i === groups.length - 1}
                  onClick={() => run(() => moveRoomGroup(g.id, 1), "Ordine salvato.")}
                >
                  ↓
                </IconBtn>
                <IconBtn label="Rinomina" disabled={pending} onClick={() => setEditing({ id: g.id, name: g.name })}>
                  ✎
                </IconBtn>
                <IconBtn label="Elimina" disabled={pending} onClick={() => remove(g)}>
                  ✕
                </IconBtn>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim())
            run(
              () => saveRoomGroup(locationId, name),
              "Gruppo creato.",
              () => setName(""),
            );
        }}
        className="flex gap-1"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Nuovo gruppo"
          aria-label="Nome del nuovo gruppo"
          className="input min-w-0 flex-1 py-1 text-sm"
        />
        <button className="btn-ghost px-2 py-1 text-xs" disabled={pending || !name.trim()}>
          + Aggiungi
        </button>
      </form>
      {feedback}
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="h-6 w-6 shrink-0 rounded text-xs text-muted hover:bg-blood/20 hover:text-accent disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RoomThumb({ url, name, size = "h-9 w-9" }: { url: string | null; name: string; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${size} shrink-0 rounded object-cover`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded border border-border font-serif text-muted`}>
      {name[0] ?? "?"}
    </span>
  );
}

function RoomForm({
  room,
  maps,
  locations,
  groups,
  houses,
  locationId,
  onSaved,
}: {
  room: Room | null;
  maps: GameMap[];
  locations: Location[];
  groups: RoomGroup[];
  houses: { id: string; name: string }[];
  locationId: string;
  onSaved: (id: string, locationId?: string) => void;
}) {
  // La macroarea scelta decide quali gruppi si possono scegliere
  const [formLocation, setFormLocation] = useState(room?.location_id ?? locationId);
  const formGroups = groups.filter((g) => g.location_id === formLocation);
  const { run, pending, feedback } = useAction();
  const [access, setAccess] = useState<RoomAccess>(room?.access ?? "pubblica");
  const [preview, setPreview] = useState<string | null>(room?.image_url ?? null);
  const [removeImage, setRemoveImage] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (room) form.set("id", room.id);
    if (removeImage) form.set("remove_image", "1");
    const target = String(form.get("location_id"));
    run(
      () => saveRoom(form),
      "Chat salvata.",
      (res) => res.id && onSaved(res.id, target),
    );
  }

  function remove() {
    if (!room) return;
    if (!window.confirm(`Eliminare la chat ${room.name} con tutti i suoi messaggi?`)) return;
    run(
      () => deleteRoom(room.id),
      "Chat eliminata.",
      () => onSaved(NEW),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h3 className="font-serif text-xl text-accent">{room ? room.name : "Nuova chat"}</h3>
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <Field label="Nome">
            <input name="name" defaultValue={room?.name} required maxLength={80} className="input" />
          </Field>
          <Field label="Macroarea">
            <select name="location_id" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} className="input">
              {maps.map((m) => (
                <optgroup key={m.id} label={m.name}>
                  {locations
                    .filter((l) => l.map_id === m.id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Gruppo">
            <select
              key={formLocation}
              name="group_id"
              defaultValue={formGroups.some((g) => g.id === room?.group_id) ? (room?.group_id ?? "") : ""}
              className="input"
            >
              <option value="">Nessun gruppo</option>
              {formGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Immagine (in alto a sinistra)">
          <div className="flex flex-col items-center gap-2">
            <RoomThumb url={removeImage ? null : preview} name={room?.name ?? "?"} size="h-24 w-24" />
            <input
              type="file"
              name="image"
              accept={IMAGE_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setRemoveImage(false);
                setPreview(file ? URL.createObjectURL(file) : (room?.image_url ?? null));
              }}
              className={`w-56 ${fileInput}`}
            />
            <span className="text-xs text-muted">max 1 MB</span>
            {room?.image_url && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} />
                Rimuovi immagine
              </label>
            )}
          </div>
        </Field>
      </div>
      <Field label="Descrizione">
        <textarea name="description" defaultValue={room?.description} rows={4} maxLength={4000} className="input" />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs tracking-wider text-muted uppercase">Tipo di chat</legend>
        {ROOM_ACCESS.map((a) => (
          <label key={a.id} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="access"
              value={a.id}
              checked={access === a.id}
              onChange={() => setAccess(a.id)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span>
              {a.label} <span className="text-xs text-muted">— {a.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {access === "casata" && (
        <Field label="Casata">
          <select name="house_id" defaultValue={room?.house_id ?? ""} required className="input">
            <option value="" disabled>
              Scegli la casata...
            </option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {access === "affitto" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prezzo (monete all'ora)">
            <input
              name="price_per_hour"
              type="number"
              min={0}
              max={1000000}
              defaultValue={room?.price_per_hour ?? 10}
              required
              className="input"
            />
          </Field>
          <Field label="Ore massime per affitto">
            <input name="max_hours" type="number" min={1} max={168} defaultValue={room?.max_hours ?? 24} required className="input" />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Salvataggio..." : room ? "Salva" : "Crea chat"}
        </button>
        {room && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300"
          >
            Elimina chat
          </button>
        )}
        {feedback}
      </div>
    </form>
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
