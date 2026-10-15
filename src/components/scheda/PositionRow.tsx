"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PaperRow } from "./PaperSheet";

type Place = { id: string; name: string };

// Dati della scheda -> Posizione: il luogo in cui si trova il PG (lo cambiano i
// viaggi). Admin e moderatori la possono correggere da qui.
export default function PositionRow({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [place, setPlace] = useState<string | null | undefined>(undefined);
  const [travel, setTravel] = useState<string | null>(null); // "verso <luogo>" se e' in viaggio (lo vede chi puo')
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: loc }, { data: trip }] = await Promise.all([
      supabase.rpc("character_location", { p_character: characterId }),
      supabase
        .from("travels")
        .select("to:locations!travels_to_location_fkey(name)")
        .eq("character_id", characterId)
        .eq("status", "in_viaggio")
        .maybeSingle(),
    ]);
    const id = (loc as string | null) ?? null;
    setChoice(id ?? "");
    setPlace(id ? ((await supabase.from("locations").select("name").eq("id", id).maybeSingle()).data?.name ?? "—") : null);
    setTravel((trip?.to as unknown as { name: string } | null)?.name ?? null);
  }, [supabase, characterId]);

  useEffect(() => {
    Promise.resolve().then(load);
    Promise.all([
      supabase.rpc("has_permission", { perm: "chat.moderare" }),
      supabase.rpc("has_permission", { perm: "mondo.gestire" }),
    ]).then(([a, b]) => setCanEdit(a.data === true || b.data === true));
  }, [supabase, load]);

  async function startEdit() {
    setError(null);
    if (!places.length) {
      const { data } = await supabase
        .from("locations")
        .select("id, name, map:maps!inner(active)")
        .eq("in_game", true)
        .eq("kind", "luogo")
        .eq("map.active", true)
        .order("name");
      setPlaces(((data ?? []) as unknown as Place[]).map((p) => ({ id: p.id, name: p.name })));
    }
    setEditing(true);
  }

  async function save() {
    if (!choice) return setError("Scegli un luogo.");
    const { error } = await supabase.rpc("staff_set_position", { p_character: characterId, p_location: choice });
    if (error) return setError("Posizione non salvata.");
    setEditing(false);
    load();
  }

  const value = editing ? (
    <span className="flex flex-wrap items-center gap-1.5">
      <select value={choice} onChange={(e) => setChoice(e.target.value)} className="input w-auto! py-0.5 text-sm" aria-label="Nuova posizione">
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={save} className="text-xs text-[#7a1d16] underline">
        Salva
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs underline">
        Annulla
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  ) : (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {place === undefined ? "..." : (place ?? "—")}
      {travel && <span className="text-xs italic">(in viaggio verso {travel})</span>}
      {canEdit && (
        <button type="button" onClick={startEdit} title="Correggi la posizione (staff)" aria-label="Correggi la posizione" className="text-xs text-[#7a1d16]/70 hover:text-[#7a1d16]">
          ✎
        </button>
      )}
    </span>
  );

  return <PaperRow label="Posizione" value={value} />;
}
