import type { Metadata } from "next";
import { getStaffContext } from "@/lib/staff";
import MapClient from "./MapClient";
import type { MapFeature, MapSettings } from "./map-types";

export const metadata: Metadata = { title: "Mappa interattiva · Westeros GDR" };

// Mappa interattiva (Utility -> si apre in una nuova scheda): la guardano tutti,
// chi ha "mappa.gestire" la modifica
export default async function MappaInterattivaPage() {
  const { supabase, permissions } = await getStaffContext();
  const [{ data: map, error }, { data: features }, { data: houses }] = await Promise.all([
    supabase.from("interactive_map").select("image_url, width, height").eq("id", 1).maybeSingle(),
    supabase.from("map_features").select("*").order("created_at"),
    supabase.from("houses").select("id, name, sigil_url").order("name"),
  ]);

  if (error)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center text-muted">
        La mappa interattiva non è ancora pronta: prima va eseguita la migrazione 0173 in Supabase.
      </main>
    );

  return (
    <MapClient
      canEdit={permissions.has("mappa.gestire")}
      settings={(map ?? { image_url: null, width: 2000, height: 2000 }) as MapSettings}
      features={(features ?? []) as MapFeature[]}
      houses={(houses ?? []) as { id: string; name: string; sigil_url: string | null }[]}
    />
  );
}
