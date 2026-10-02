"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAP_IMAGE_MAX_BYTES, ROOM_IMAGE_MAX_BYTES, WORLD_IMAGE_TYPES } from "@/lib/world";

export type WorldResult = { error?: string; id?: string };

const BUCKET = "mondo";
const DENIED = { error: "Non hai il permesso di gestire il mondo di gioco." };

// Ogni azione ricontrolla il permesso (le regole del database lo rifarebbero comunque)
async function authorized() {
  const ctx = await getStaffContext();
  return ctx.permissions.has("mondo.gestire") ? ctx : null;
}

function done(id?: string): WorldResult {
  revalidatePath("/", "layout"); // mappa, chat e utility vedono subito le modifiche
  return id ? { id } : {};
}

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? "")
    .trim()
    .slice(0, max);

const int = (form: FormData, key: string, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(form.get(key)));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function fileFrom(form: FormData, key: string) {
  const file = form.get(key);
  return file instanceof File && file.size > 0 ? file : null;
}

// ---------------------------------------------------------------------
// Immagini di mappe e chat: caricate dal server nell'archivio "mondo"
// ---------------------------------------------------------------------
async function uploadImage(file: File, folder: string, maxBytes: number): Promise<{ url?: string; error?: string }> {
  if (!WORLD_IMAGE_TYPES.includes(file.type)) return { error: "Formato non valido: usa PNG, JPG, WebP o GIF." };
  if (file.size > maxBytes) return { error: `Immagine troppo grande (massimo ${maxBytes / 1024 / 1024} MB).` };
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) return { error: "Caricamento dell'immagine non riuscito." };
  return { url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

// Elimina un'immagine non piu' usata (se non riesce, pazienza: resta solo il file)
async function removeImage(url: string | null | undefined) {
  const marker = `/object/public/${BUCKET}/`;
  if (!url?.includes(marker)) return;
  await createAdminClient()?.storage.from(BUCKET).remove([url.split(marker)[1]]);
}

// ---------------------------------------------------------------------
// Mappe principali
// ---------------------------------------------------------------------
export async function saveMap(form: FormData): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const id = text(form, "id", 36) || undefined;
  const name = text(form, "name", 80);
  if (!name) return { error: "Dai un nome alla mappa." };
  const row: Record<string, unknown> = { name, description: text(form, "description", 4000) };

  const { data: current } = id
    ? await ctx.supabase.from("maps").select("image_url").eq("id", id).single()
    : { data: null };

  const image = fileFrom(form, "image");
  if (image) {
    const up = await uploadImage(image, "mappe", MAP_IMAGE_MAX_BYTES);
    if (up.error) return { error: up.error };
    row.image_url = up.url;
  } else if (!id) {
    return { error: "Carica l'immagine della mappa." };
  }

  const { data, error } = id
    ? await ctx.supabase.from("maps").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("maps").insert(row).select("id").single();
  if (error) {
    if (row.image_url) await removeImage(row.image_url as string);
    return { error: "Salvataggio non riuscito." };
  }
  if (row.image_url && current?.image_url) await removeImage(current.image_url);
  return done(data.id);
}

export async function setMapActive(id: string, active: boolean): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { error } = await ctx.supabase.from("maps").update({ active }).eq("id", id);
  return error ? { error: "Modifica non riuscita." } : done();
}

export async function deleteMap(id: string): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { data: map } = await ctx.supabase.from("maps").select("image_url").eq("id", id).single();
  const { data: locs } = await ctx.supabase.from("locations").select("id").eq("map_id", id);
  const { data: rooms } = await ctx.supabase
    .from("rooms")
    .select("image_url")
    .in("location_id", (locs ?? []).map((l) => l.id));
  // Macroaree, chat e messaggi si cancellano con la mappa
  const { error } = await ctx.supabase.from("maps").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  await removeImage(map?.image_url);
  for (const room of rooms ?? []) await removeImage(room.image_url);
  return done();
}

// ---------------------------------------------------------------------
// Macroaree (i puntini sulla mappa)
// ---------------------------------------------------------------------
export async function saveLocation(form: FormData): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const id = text(form, "id", 36) || undefined;
  const name = text(form, "name", 80);
  const mapId = text(form, "map_id", 36);
  if (!name) return { error: "Dai un nome alla macroarea." };
  if (!mapId) return { error: "Scegli la mappa a cui appartiene." };
  const row: Record<string, unknown> = { name, map_id: mapId, description: text(form, "description", 4000) };
  if (!id) Object.assign(row, { x: 50, y: 50 }); // le nuove compaiono al centro: poi si trascinano

  const { data, error } = id
    ? await ctx.supabase.from("locations").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("locations").insert(row).select("id").single();
  return error ? { error: "Salvataggio non riuscito." } : done(data.id);
}

export async function saveLocationPositions(positions: { id: string; x: number; y: number }[]): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const round = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
  for (const p of positions.slice(0, 500)) {
    const { error } = await ctx.supabase.from("locations").update({ x: round(p.x), y: round(p.y) }).eq("id", p.id);
    if (error) return { error: "Salvataggio delle posizioni non riuscito." };
  }
  return done();
}

export async function deleteLocation(id: string): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { data: rooms } = await ctx.supabase.from("rooms").select("image_url").eq("location_id", id);
  const { error } = await ctx.supabase.from("locations").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  for (const room of rooms ?? []) await removeImage(room.image_url);
  return done();
}

// ---------------------------------------------------------------------
// Chat di gioco
// ---------------------------------------------------------------------
export async function saveRoom(form: FormData): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const id = text(form, "id", 36) || undefined;
  const name = text(form, "name", 80);
  const locationId = text(form, "location_id", 36);
  const access = text(form, "access", 20);
  if (!name) return { error: "Dai un nome alla chat." };
  if (!locationId) return { error: "Scegli la macroarea a cui appartiene." };
  if (!["pubblica", "casata", "affitto"].includes(access)) return { error: "Scegli il tipo di chat." };
  const houseId = text(form, "house_id", 36);
  // Il gruppo deve essere della stessa macroarea
  const groupId = text(form, "group_id", 36);
  const { data: group } = groupId
    ? await ctx.supabase.from("room_groups").select("location_id").eq("id", groupId).maybeSingle()
    : { data: null };
  if (access === "casata" && !houseId) return { error: "Scegli la casata a cui appartiene la chat." };

  const row: Record<string, unknown> = {
    name,
    location_id: locationId,
    description: text(form, "description", 4000),
    access,
    house_id: access === "casata" ? houseId : null,
    group_id: group?.location_id === locationId ? groupId : null,
    price_per_hour: access === "affitto" ? int(form, "price_per_hour", 0, 1000000, 0) : 0,
    max_hours: access === "affitto" ? int(form, "max_hours", 1, 168, 24) : 24,
  };

  const { data: current } = id
    ? await ctx.supabase.from("rooms").select("image_url").eq("id", id).single()
    : { data: null };

  const image = fileFrom(form, "image");
  if (image) {
    const up = await uploadImage(image, "chat", ROOM_IMAGE_MAX_BYTES);
    if (up.error) return { error: up.error };
    row.image_url = up.url;
  } else if (form.get("remove_image") === "1") {
    row.image_url = null;
  }

  const { data, error } = id
    ? await ctx.supabase.from("rooms").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("rooms").insert(row).select("id").single();
  if (error) {
    if (row.image_url) await removeImage(row.image_url as string);
    return { error: "Salvataggio non riuscito." };
  }
  if ("image_url" in row && current?.image_url) await removeImage(current.image_url);
  return done(data.id);
}

export async function deleteRoom(id: string): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { data: room } = await ctx.supabase.from("rooms").select("image_url").eq("id", id).single();
  const { error } = await ctx.supabase.from("rooms").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  await removeImage(room?.image_url);
  return done();
}

// ---------------------------------------------------------------------
// Gruppi di chat (contenitori con un nome dentro una macroarea)
// ---------------------------------------------------------------------
export async function saveRoomGroup(locationId: string, name: string, id?: string): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const clean = name.trim().slice(0, 80);
  if (!clean) return { error: "Dai un nome al gruppo." };

  if (id) {
    const { error } = await ctx.supabase.from("room_groups").update({ name: clean }).eq("id", id);
    return error ? { error: "Salvataggio non riuscito." } : done(id);
  }
  // In fondo all'elenco della macroarea
  const { data: last } = await ctx.supabase
    .from("room_groups")
    .select("sort_order")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await ctx.supabase
    .from("room_groups")
    .insert({ location_id: locationId, name: clean, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id")
    .single();
  return error ? { error: "Salvataggio non riuscito." } : done(data.id);
}

// Scambia la posizione del gruppo con quello prima (-1) o dopo (+1)
export async function moveRoomGroup(id: string, direction: -1 | 1): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { data: group } = await ctx.supabase.from("room_groups").select("location_id").eq("id", id).single();
  if (!group) return { error: "Gruppo non trovato." };
  const { data: list } = await ctx.supabase
    .from("room_groups")
    .select("id")
    .eq("location_id", group.location_id)
    .order("sort_order")
    .order("name");
  const ids = (list ?? []).map((g) => g.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return done();
  [ids[from], ids[to]] = [ids[to], ids[from]];
  for (const [i, gid] of ids.entries()) {
    const { error } = await ctx.supabase.from("room_groups").update({ sort_order: i }).eq("id", gid);
    if (error) return { error: "Spostamento non riuscito." };
  }
  return done();
}

export async function deleteRoomGroup(id: string): Promise<WorldResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  // Le chat del gruppo restano, senza gruppo
  const { error } = await ctx.supabase.from("room_groups").delete().eq("id", id);
  return error ? { error: "Eliminazione non riuscita." } : done();
}
