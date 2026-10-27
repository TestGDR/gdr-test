"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { createClient } from "@/lib/supabase/client";
import {
  KIND_LABEL,
  PLACE_TYPES,
  type FeatureKind,
  type House,
  type MapFeature,
  type MapSettings,
  type PlaceType,
  type Point,
} from "./map-types";

type View = "politica" | "castelli";
type Draft = Omit<MapFeature, "id"> & { id?: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const toPt = (ll: L.LatLng): Point => [Math.round(ll.lat * 10) / 10, Math.round(ll.lng * 10) / 10];
const DEFAULT_COLOR: Record<FeatureKind, string> = { confine: "#b8322a", strada: "#d8c39a", luogo: "#c9a45c" };

// Icona di un luogo: torre per i castelli, cerchio con l'iniziale per gli altri
function placeIcon(f: Pick<MapFeature, "color" | "place_type">, selected = false) {
  const c = f.color;
  const ring = selected ? "#fff3c4" : "#1a120c";
  const html =
    f.place_type === "castello" || !f.place_type
      ? `<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12h-6v-5a2 2 0 0 0-4 0v5z" fill="${c}" stroke="${ring}" stroke-width="1.5"/></svg>`
      : `<span style="display:flex;width:20px;height:20px;align-items:center;justify-content:center;border-radius:9999px;background:${c};border:2px solid ${ring};color:#1a120c;font:700 11px/1 Georgia,serif">${esc(PLACE_TYPES.find((p) => p.id === f.place_type)?.letter ?? "•")}</span>`;
  return L.divIcon({ html, className: "map-place-icon", iconSize: [24, 24], iconAnchor: [12, 12] });
}

export default function MapCanvas({
  canEdit,
  settings: initialSettings,
  features: initialFeatures,
  houses,
}: {
  canEdit: boolean;
  settings: MapSettings;
  features: MapFeature[];
  houses: House[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const bgRef = useRef<L.Layer | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const layersRef = useRef(new Map<string, L.Layer>());
  const fitted = useRef(false);

  const [settings, setSettings] = useState(initialSettings);
  const [features, setFeatures] = useState(initialFeatures);
  const [view, setView] = useState<View>("politica");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shaping, setShaping] = useState<string | null>(null); // forma in modifica
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [bgUrl, setBgUrl] = useState(initialSettings.image_url ?? "");
  const [bgOpen, setBgOpen] = useState(!initialSettings.image_url && canEdit);

  // --- Mappa (una volta) ---------------------------------------------------
  useEffect(() => {
    if (!box.current) return;
    const map = L.map(box.current, {
      crs: L.CRS.Simple,
      minZoom: -5,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
    });
    mapRef.current = map;
    groupRef.current = L.layerGroup().addTo(map);
    map.on("click", () => setSelected(null));

    if (canEdit) {
      map.pm.setLang("it");
      map.pm.setGlobalOptions({ markerStyle: { icon: placeIcon({ color: "#c9a45c", place_type: "castello" }) } });
      map.pm.addControls({
        position: "topleft",
        drawMarker: true,
        drawPolyline: true,
        drawPolygon: true,
        drawRectangle: false,
        drawCircle: false,
        drawCircleMarker: false,
        drawText: false,
        editMode: false,
        dragMode: false,
        cutPolygon: false,
        removalMode: false,
        rotateMode: false,
      });
      // disegnato un elemento nuovo: si apre il modulo per nome e descrizione
      map.on("pm:create", (e) => {
        const layer = e.layer as L.Layer;
        let kind: FeatureKind;
        let geometry: Point | Point[];
        if (e.shape === "Marker") {
          kind = "luogo";
          geometry = toPt((layer as L.Marker).getLatLng());
        } else if (e.shape === "Polygon") {
          kind = "confine";
          geometry = ((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]).map(toPt);
        } else {
          kind = "strada";
          geometry = ((layer as L.Polyline).getLatLngs() as L.LatLng[]).map(toPt);
        }
        map.removeLayer(layer);
        setSelected(null);
        setMsg(null);
        setDraft({
          kind,
          name: "",
          description: "",
          color: DEFAULT_COLOR[kind],
          place_type: kind === "luogo" ? "castello" : null,
          house_id: null,
          geometry,
        });
      });
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [canEdit]);

  // --- Sfondo -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds: L.LatLngBoundsExpression = [
      [0, 0],
      [settings.height, settings.width],
    ];
    if (bgRef.current) map.removeLayer(bgRef.current);
    bgRef.current = settings.image_url
      ? L.imageOverlay(settings.image_url, bounds, { interactive: false }).addTo(map)
      : L.rectangle(bounds, { color: "#7a5530", weight: 1, fill: false, interactive: false }).addTo(map);
    const pad = Math.max(settings.width, settings.height) * 0.25;
    map.setMaxBounds([
      [-pad, -pad],
      [settings.height + pad, settings.width + pad],
    ]);
    if (!fitted.current) {
      map.fitBounds(bounds);
      fitted.current = true;
    }
  }, [settings]);

  // --- Confini, strade e luoghi -------------------------------------------
  useEffect(() => {
    const group = groupRef.current;
    if (!group || shaping) return; // mentre si modifica una forma non si ridisegna
    group.clearLayers();
    layersRef.current.clear();
    const order: FeatureKind[] = ["confine", "strada", "luogo"];
    for (const kind of order)
      for (const f of features.filter((x) => x.kind === kind)) {
        // vista "castelli": solo i castelli, senza confini e strade
        if (view === "castelli" && !(f.kind === "luogo" && (f.place_type ?? "castello") === "castello")) continue;
        const sel = f.id === selected;
        let layer: L.Layer;
        if (f.kind === "luogo") {
          layer = L.marker(f.geometry as Point, { icon: placeIcon(f, sel), riseOnHover: true });
          if (f.name)
            (layer as L.Marker).bindTooltip(esc(f.name), {
              permanent: true,
              direction: "right",
              offset: [10, 0],
              className: "map-label map-label-place",
            });
        } else if (f.kind === "confine") {
          layer = L.polygon(f.geometry as Point[], {
            color: f.color,
            weight: sel ? 4 : 2,
            fillColor: f.color,
            fillOpacity: sel ? 0.35 : 0.2,
          });
          if (f.name)
            (layer as L.Polygon).bindTooltip(esc(f.name), {
              permanent: true,
              direction: "center",
              className: "map-label map-label-border",
            });
        } else {
          layer = L.polyline(f.geometry as Point[], { color: f.color, weight: sel ? 5 : 3, dashArray: "8 6" });
          if (f.name) (layer as L.Polyline).bindTooltip(esc(f.name), { sticky: true, className: "map-label" });
        }
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          setDraft(null);
          setSelected(f.id);
        });
        layer.addTo(group);
        layersRef.current.set(f.id, layer);
      }
  }, [features, view, selected, shaping]);

  const reload = async () => {
    const { data } = await supabase.from("map_features").select("*").order("created_at");
    setFeatures((data ?? []) as MapFeature[]);
  };

  // --- Azioni dello staff ---------------------------------------------------
  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    const row = {
      kind: draft.kind,
      name: draft.name.trim(),
      description: draft.description.trim(),
      color: draft.color,
      place_type: draft.kind === "luogo" ? draft.place_type : null,
      house_id: draft.kind === "confine" ? draft.house_id : draft.kind === "luogo" ? draft.house_id : null,
      geometry: draft.geometry,
      updated_at: new Date().toISOString(),
    };
    const res = draft.id
      ? await supabase.from("map_features").update(row).eq("id", draft.id).select("id").single()
      : await supabase.from("map_features").insert(row).select("id").single();
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: "Non salvato." });
    setDraft(null);
    await reload();
    setSelected(res.data.id as string);
  }

  function startShape(id: string) {
    const layer = layersRef.current.get(id) as (L.Layer & { pm: { enable: (o?: object) => void } }) | undefined;
    if (!layer) return;
    layer.pm.enable({ allowSelfIntersection: true, draggable: true });
    setShaping(id);
  }

  async function saveShape() {
    const id = shaping;
    const layer = id ? layersRef.current.get(id) : undefined;
    const f = features.find((x) => x.id === id);
    if (!id || !layer || !f) return;
    (layer as L.Layer & { pm: { disable: () => void } }).pm.disable();
    const geometry =
      f.kind === "luogo"
        ? toPt((layer as L.Marker).getLatLng())
        : f.kind === "confine"
          ? ((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]).map(toPt)
          : ((layer as L.Polyline).getLatLngs() as L.LatLng[]).map(toPt);
    setBusy(true);
    const { error } = await supabase
      .from("map_features")
      .update({ geometry, updated_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(false);
    setShaping(null);
    if (error) setMsg({ ok: false, text: "Forma non salvata." });
    await reload();
  }

  function cancelShape() {
    const layer = shaping ? layersRef.current.get(shaping) : undefined;
    (layer as (L.Layer & { pm: { disable: () => void } }) | undefined)?.pm.disable();
    setShaping(null);
    setFeatures((x) => [...x]); // ridisegna com'era
  }

  async function remove(f: MapFeature) {
    if (!window.confirm(`Togliere dalla mappa "${f.name || KIND_LABEL[f.kind]}"?`)) return;
    const { error } = await supabase.from("map_features").delete().eq("id", f.id);
    if (error) return setMsg({ ok: false, text: "Non tolto." });
    setSelected(null);
    reload();
  }

  async function saveBackground() {
    const url = bgUrl.trim();
    if (url && !url.startsWith("https://")) return setMsg({ ok: false, text: "Il link deve iniziare con https://" });
    setBusy(true);
    setMsg(null);
    // misura dell'immagine: le coordinate della mappa sono i suoi pixel
    const size = url
      ? await new Promise<{ w: number; h: number } | null>((ok) => {
          const img = new Image();
          img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => ok(null);
          img.src = url;
        })
      : { w: settings.width, h: settings.height };
    if (!size) {
      setBusy(false);
      return setMsg({ ok: false, text: "Immagine non trovata: controlla il link (deve portare all'immagine)." });
    }
    const next = { image_url: url || null, width: size.w, height: size.h };
    const { error } = await supabase
      .from("interactive_map")
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Sfondo non salvato." });
    fitted.current = false;
    setSettings(next);
    setMsg({ ok: true, text: "Sfondo salvato." });
  }

  function focus(f: MapFeature) {
    const map = mapRef.current;
    const layer = layersRef.current.get(f.id);
    setDraft(null);
    setSelected(f.id);
    if (!map || !layer) return;
    if (layer instanceof L.Marker) map.setView(layer.getLatLng(), Math.max(map.getZoom(), 0));
    else map.fitBounds((layer as L.Polyline).getBounds(), { maxZoom: 1, padding: [40, 40] });
  }

  const sel = features.find((f) => f.id === selected) ?? null;
  const houseOf = (id: string | null) => houses.find((h) => h.id === id) ?? null;
  const text = q.trim().toLowerCase();
  const listed = features
    .filter((f) => f.name && (view === "politica" || (f.kind === "luogo" && (f.place_type ?? "castello") === "castello")))
    .filter((f) => !text || f.name.toLowerCase().includes(text) || f.description.toLowerCase().includes(text))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
  const label = "mb-1 block text-[0.65rem] tracking-[0.14em] text-muted uppercase";

  return (
    <div className="flex h-dvh flex-col bg-[#0f0b08] text-foreground lg:flex-row">
      {/* mappa */}
      <div className="relative min-h-0 flex-1">
        <div ref={box} className="map-interattiva h-full w-full" />
        {/* vista politica / solo castelli */}
        <div className="absolute top-3 right-3 z-[1000] flex overflow-hidden border border-[#7a5530] bg-black/80 text-xs tracking-[0.12em] uppercase shadow-lg">
          {(
            [
              ["politica", "Politica"],
              ["castelli", "Castelli"],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={`px-3 py-2 ${view === id ? "bg-blood/40 text-accent" : "text-muted hover:text-foreground"}`}
            >
              {name}
            </button>
          ))}
        </div>
        {shaping && (
          <div className="absolute bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 flex-wrap items-center gap-2 border border-accent/60 bg-black/90 px-3 py-2 text-sm shadow-xl">
            <span>Trascina i punti per cambiare la forma (o il segnaposto per spostarlo).</span>
            <button type="button" disabled={busy} onClick={saveShape} className="btn px-3 py-1 text-xs">
              Salva forma
            </button>
            <button type="button" onClick={cancelShape} className="btn-ghost px-3 py-1 text-xs">
              Annulla
            </button>
          </div>
        )}
      </div>

      {/* colonna: dettagli, modulo, elenco */}
      <aside className="max-h-[45dvh] w-full shrink-0 space-y-4 overflow-y-auto border-t border-[#7a5530]/60 bg-[#14100c] p-4 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
        <header>
          <h1 className="font-serif text-2xl tracking-wide text-accent">Mappa di Westeros</h1>
          <p className="text-xs text-muted">
            {view === "politica" ? "Vista politica: confini, strade e luoghi." : "Vista dei castelli."} Usa + e − (o la
            rotella) per avvicinarti e allontanarti.
          </p>
        </header>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}

        {canEdit && !draft && !sel && (
          <section className="space-y-2 border border-border/60 p-3 text-xs text-muted">
            <p>
              <strong className="text-foreground">Per disegnare</strong> usa i pulsanti a sinistra della mappa: il
              segnaposto aggiunge un <strong>luogo</strong>, la linea una <strong>strada</strong>, il poligono un{" "}
              <strong>confine</strong> (clicca il primo punto per chiuderlo). Poi scrivi nome e descrizione qui.
            </p>
            <button type="button" onClick={() => setBgOpen((o) => !o)} className="underline hover:text-accent">
              {bgOpen ? "Chiudi lo sfondo" : "Cambia l'immagine di sfondo"}
            </button>
            {bgOpen && (
              <div className="space-y-2">
                <input
                  value={bgUrl}
                  onChange={(e) => setBgUrl(e.target.value)}
                  placeholder="https://… link dell'immagine della mappa"
                  className="input py-1 text-xs"
                />
                <button type="button" disabled={busy} onClick={saveBackground} className="btn px-3 py-1 text-xs">
                  Salva sfondo
                </button>
                <p>
                  Incolla il link diretto dell&apos;immagine. Le posizioni dei disegni seguono i pixel dell&apos;immagine:
                  cambiando sfondo con un&apos;immagine di misura diversa, i disegni vanno risistemati.
                </p>
              </div>
            )}
          </section>
        )}

        {draft ? (
          <section className="space-y-3">
            <h2 className="font-serif text-lg text-accent">
              {draft.id ? "Modifica" : "Nuovo"} · {KIND_LABEL[draft.kind]}
            </h2>
            <label className="block">
              <span className={label}>Nome</span>
              <input
                value={draft.name}
                maxLength={80}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="input py-1.5"
                autoFocus
              />
            </label>
            {draft.kind === "luogo" && (
              <label className="block">
                <span className={label}>Tipo di luogo</span>
                <select
                  value={draft.place_type ?? "castello"}
                  onChange={(e) => setDraft({ ...draft, place_type: e.target.value as PlaceType })}
                  className="input py-1.5"
                >
                  {PLACE_TYPES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.kind !== "strada" && (
              <label className="block">
                <span className={label}>Casata (facoltativa)</span>
                <select
                  value={draft.house_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, house_id: e.target.value || null })}
                  className="input py-1.5"
                >
                  <option value="">—</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="h-7 w-10 cursor-pointer border border-border bg-transparent"
              />
              Colore
            </label>
            <label className="block">
              <span className={label}>Descrizione</span>
              <textarea
                value={draft.description}
                maxLength={2000}
                rows={5}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="input text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={saveDraft} className="btn px-4 py-1.5 text-sm">
                {busy ? "..." : "Salva"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="btn-ghost px-4 py-1.5 text-sm">
                Annulla
              </button>
            </div>
          </section>
        ) : sel ? (
          <section className="space-y-2">
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted hover:text-accent">
              ← Elenco
            </button>
            <p className="text-[0.65rem] tracking-[0.14em] text-[#d8c39a] uppercase">
              {sel.kind === "luogo"
                ? (PLACE_TYPES.find((p) => p.id === sel.place_type)?.label ?? "Luogo")
                : KIND_LABEL[sel.kind]}
            </p>
            <h2 className="flex items-center gap-2 font-serif text-xl leading-tight text-accent">
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: sel.color }} />
              {sel.name || "Senza nome"}
            </h2>
            {houseOf(sel.house_id) && (
              <p className="flex items-center gap-2 text-sm">
                {houseOf(sel.house_id)!.sigil_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={houseOf(sel.house_id)!.sigil_url!} alt="" className="h-6 w-6 object-contain" />
                )}
                Casata {houseOf(sel.house_id)!.name}
              </p>
            )}
            {sel.description ? (
              <p className="text-sm whitespace-pre-line text-muted">{sel.description}</p>
            ) : (
              <p className="text-sm text-muted italic">Nessuna descrizione.</p>
            )}
            {canEdit && !shaping && (
              <div className="flex flex-wrap gap-3 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setDraft({ ...sel })}
                  className="text-muted underline hover:text-accent"
                >
                  Modifica testi
                </button>
                <button type="button" onClick={() => startShape(sel.id)} className="text-muted underline hover:text-accent">
                  {sel.kind === "luogo" ? "Sposta" : "Modifica forma"}
                </button>
                <button type="button" onClick={() => remove(sel)} className="text-red-400 underline hover:text-red-300">
                  Togli
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca un luogo..."
              className="input py-1.5 text-sm"
            />
            {listed.length === 0 ? (
              <p className="text-sm text-muted">
                {features.length === 0 ? "La mappa è ancora vuota." : "Nessun elemento trovato."}
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {listed.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => focus(f)}
                      className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:text-accent"
                    >
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.color }} />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-[0.65rem] text-muted uppercase">
                        {f.kind === "luogo"
                          ? (PLACE_TYPES.find((p) => p.id === f.place_type)?.label ?? "Luogo")
                          : KIND_LABEL[f.kind]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
