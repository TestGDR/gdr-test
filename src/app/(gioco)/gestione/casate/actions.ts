"use server";

import { revalidatePath } from "next/cache";
import { AGE_MAX, AGE_MIN } from "@/lib/character-creation";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "@/lib/houses";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type HouseResult = { error?: string; id?: string };

const BUCKET = "casate";
const DENIED = { error: "Non hai il permesso di gestire le casate." };

// Ogni azione ricontrolla il permesso (le regole del database lo rifarebbero comunque)
async function authorized() {
  const ctx = await getStaffContext();
  return ctx.permissions.has("casate.gestire") ? ctx : null;
}

function done(id?: string): HouseResult {
  revalidatePath("/", "layout"); // stemmi visibili anche in scheda e nell'elenco online
  return id ? { id } : {};
}

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? "")
    .trim()
    .slice(0, max);

// ---------------------------------------------------------------------
// Immagini (stemmi e ritratti): caricate dal server nell'archivio "casate"
// ---------------------------------------------------------------------
async function uploadImage(file: File, folder: string): Promise<{ url?: string; error?: string }> {
  if (!IMAGE_TYPES.includes(file.type)) return { error: "Formato non valido: usa PNG, JPG, WebP o GIF." };
  if (file.size > IMAGE_MAX_BYTES) return { error: "Immagine troppo grande (massimo 1 MB)." };
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

function fileFrom(form: FormData, key: string) {
  const file = form.get(key);
  return file instanceof File && file.size > 0 ? file : null;
}

// ---------------------------------------------------------------------
// Casata
// ---------------------------------------------------------------------
export async function saveHouse(form: FormData): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const id = text(form, "id", 36) || undefined;
  const name = normalizeCharacterName(text(form, "name", 40));
  const nameError = validateCharacterName(name);
  if (nameError) return { error: nameError.replace("Il nome", "Il nome della casata") };

  const row: Record<string, unknown> = { name, description: text(form, "description", 8000) };

  const { data: current } = id
    ? await ctx.supabase.from("houses").select("sigil_url").eq("id", id).single()
    : { data: null };

  const sigil = fileFrom(form, "sigil");
  if (sigil) {
    const up = await uploadImage(sigil, "stemmi");
    if (up.error) return { error: up.error };
    row.sigil_url = up.url;
  } else if (form.get("remove_sigil") === "1") {
    row.sigil_url = null;
  }

  const { data, error } = id
    ? await ctx.supabase.from("houses").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("houses").insert(row).select("id").single();
  if (error) {
    if (row.sigil_url) await removeImage(row.sigil_url as string);
    if (error.code === "23505") return { error: "Esiste già una casata con questo nome." };
    return { error: "Salvataggio non riuscito." };
  }
  if ("sigil_url" in row && current?.sigil_url) await removeImage(current.sigil_url);
  return done(data.id);
}

export async function deleteHouse(id: string): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const [{ data: house }, { data: npcs }] = await Promise.all([
    ctx.supabase.from("houses").select("sigil_url").eq("id", id).single(),
    ctx.supabase.from("house_npcs").select("image_url").eq("house_id", id),
  ]);
  // Ruoli, albero e PNG si cancellano con la casata; i PG restano, senza casata
  const { error } = await ctx.supabase.from("houses").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  await removeImage(house?.sigil_url);
  for (const npc of npcs ?? []) await removeImage(npc.image_url);
  return done();
}

// ---------------------------------------------------------------------
// Ruoli e stipendi
// ---------------------------------------------------------------------
export async function saveHouseRole(input: {
  id?: string;
  house_id: string;
  name: string;
  daily_salary: number;
  sort_order: number;
  signup_available: boolean;
  max_members: number | null;
  required_sex: string | null;
  min_age: number | null;
  max_age: number | null;
}): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return { error: "Il nome del ruolo deve avere tra 2 e 40 caratteri." };
  const salary = Math.trunc(Number(input.daily_salary));
  if (!Number.isFinite(salary) || salary < 0 || salary > 1_000_000) {
    return { error: "Lo stipendio deve essere un numero tra 0 e 1.000.000." };
  }

  // Requisiti per l'iscrizione (ignorati se il ruolo non e' disponibile all'iscrizione)
  const optInt = (v: number | null) => (v === null || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)));
  const signup = Boolean(input.signup_available);
  const maxMembers = signup ? optInt(input.max_members) : null;
  const minAge = signup ? optInt(input.min_age) : null;
  const maxAge = signup ? optInt(input.max_age) : null;
  const sex = signup && (input.required_sex === "uomo" || input.required_sex === "donna") ? input.required_sex : null;
  if (signup) {
    if (!maxMembers || maxMembers < 1 || maxMembers > 1000) {
      return { error: "Indica quanti PG al massimo possono avere il ruolo (da 1 a 1000)." };
    }
    for (const age of [minAge, maxAge]) {
      if (age !== null && (age < AGE_MIN || age > AGE_MAX)) {
        return { error: `Le età devono essere tra ${AGE_MIN} e ${AGE_MAX} anni.` };
      }
    }
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      return { error: "L'età minima non può superare quella massima." };
    }
  }

  const row = {
    name,
    daily_salary: salary,
    sort_order: Math.trunc(input.sort_order) || 0,
    signup_available: signup,
    max_members: maxMembers,
    required_sex: sex,
    min_age: minAge,
    max_age: maxAge,
  };
  const { data, error } = input.id
    ? await ctx.supabase.from("house_roles").update(row).eq("id", input.id).select("id").single()
    : await ctx.supabase.from("house_roles").insert({ ...row, house_id: input.house_id }).select("id").single();
  if (error) {
    if (error.code === "23505") return { error: "Questa casata ha già un ruolo con questo nome." };
    return { error: "Salvataggio non riuscito." };
  }
  return done(data.id);
}

export async function deleteHouseRole(id: string): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  // I PG con questo ruolo restano nella casata, senza ruolo
  const { error } = await ctx.supabase.from("house_roles").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  return done();
}

// ---------------------------------------------------------------------
// Albero genealogico
// ---------------------------------------------------------------------
export async function saveFamilyMember(input: {
  id?: string;
  house_id: string;
  parent_id: string | null;
  parent2_id: string | null;
  npc_id: string | null;
  name: string;
  spouse: string;
  note: string;
  deceased: boolean;
}): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  // Collegato a un PNG (di qualunque casata): il nome e' quello del PNG
  let name = input.name.trim().slice(0, 80);
  if (input.npc_id) {
    const { data: npc } = await ctx.supabase.from("house_npcs").select("name").eq("id", input.npc_id).maybeSingle();
    if (!npc) return { error: "PNG non trovato." };
    name = npc.name;
  }
  if (!name) return { error: "Scrivi il nome o scegli un PNG." };

  // I genitori devono essere della stessa casata, diversi tra loro e non discendenti
  // del membro (niente cicli, seguendo entrambe le linee di discendenza)
  const parents = [input.parent_id, input.parent2_id].filter((p): p is string => Boolean(p));
  if (parents.length === 2 && parents[0] === parents[1]) return { error: "I due genitori devono essere persone diverse." };
  if (parents.length) {
    const { data: tree } = await ctx.supabase
      .from("house_family_members")
      .select("id, parent_id, parent2_id")
      .eq("house_id", input.house_id);
    const byId = new Map((tree ?? []).map((m) => [m.id as string, m]));
    for (const p of parents) if (!byId.has(p)) return { error: "Genitore non valido." };
    const seen = new Set<string>();
    const queue = [...parents];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === input.id) return { error: "Un membro non può discendere da se stesso." };
      if (seen.has(current)) continue;
      seen.add(current);
      const m = byId.get(current);
      if (m?.parent_id) queue.push(m.parent_id);
      if (m?.parent2_id) queue.push(m.parent2_id);
    }
  }

  const row = {
    parent_id: parents[0] ?? null,
    parent2_id: parents[1] ?? null,
    npc_id: input.npc_id || null,
    name,
    spouse: input.spouse.trim().slice(0, 80),
    note: input.note.trim().slice(0, 200),
    deceased: Boolean(input.deceased),
  };
  const { data, error } = input.id
    ? await ctx.supabase.from("house_family_members").update(row).eq("id", input.id).select("id").single()
    : await ctx.supabase
        .from("house_family_members")
        .insert({ ...row, house_id: input.house_id })
        .select("id")
        .single();
  if (error) {
    if (error.code === "23505") return { error: "Questo PNG è già in questo albero." };
    return { error: "Salvataggio non riuscito." };
  }
  return done(data.id);
}

export async function deleteFamilyMember(id: string): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  // I figli restano nell'albero, risalendo di un livello
  const { error } = await ctx.supabase.from("house_family_members").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  return done();
}

// ---------------------------------------------------------------------
// Rapporti tra membri dell'albero (matrimoni, promesse, amanti, separati)
// ---------------------------------------------------------------------
const RELATION_KINDS = ["matrimonio", "promessi", "amanti", "separati"];

export async function saveRelation(input: {
  house_id: string;
  member_a: string;
  member_b: string;
  kind: string;
  note: string;
}): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  if (!RELATION_KINDS.includes(input.kind)) return { error: "Tipo di rapporto non valido." };
  if (!input.member_a || !input.member_b) return { error: "Scegli le due persone." };
  if (input.member_a === input.member_b) return { error: "Scegli due persone diverse." };
  const { data: both } = await ctx.supabase
    .from("house_family_members")
    .select("id")
    .eq("house_id", input.house_id)
    .in("id", [input.member_a, input.member_b]);
  if ((both ?? []).length !== 2) return { error: "Le due persone devono essere nell'albero di questa casata." };

  const { data, error } = await ctx.supabase
    .from("house_family_relations")
    .insert({
      house_id: input.house_id,
      member_a: input.member_a,
      member_b: input.member_b,
      kind: input.kind,
      note: input.note.trim().slice(0, 120),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Questo rapporto esiste già." };
    return { error: "Salvataggio non riuscito." };
  }
  return done(data.id);
}

export async function deleteRelation(id: string): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { error } = await ctx.supabase.from("house_family_relations").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  return done();
}

// ---------------------------------------------------------------------
// PNG di casata
// ---------------------------------------------------------------------
export async function saveNpc(form: FormData): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const id = text(form, "id", 36) || undefined;
  const name = text(form, "name", 80);
  if (!name) return { error: "Scrivi il nome del PNG." };
  const row: Record<string, unknown> = {
    name,
    title: text(form, "title", 80),
    description: text(form, "description", 4000),
  };

  const { data: current } = id
    ? await ctx.supabase.from("house_npcs").select("image_url").eq("id", id).single()
    : { data: null };

  const image = fileFrom(form, "image");
  if (image) {
    const up = await uploadImage(image, "png");
    if (up.error) return { error: up.error };
    row.image_url = up.url;
  } else if (form.get("remove_image") === "1") {
    row.image_url = null;
  }

  const { data, error } = id
    ? await ctx.supabase.from("house_npcs").update(row).eq("id", id).select("id").single()
    : await ctx.supabase
        .from("house_npcs")
        .insert({ ...row, house_id: text(form, "house_id", 36) })
        .select("id")
        .single();
  if (error) {
    if (row.image_url) await removeImage(row.image_url as string);
    return { error: "Salvataggio non riuscito." };
  }
  if ("image_url" in row && current?.image_url) await removeImage(current.image_url);
  // Il nome negli alberi genealogici segue quello del PNG
  if (id) await ctx.supabase.from("house_family_members").update({ name }).eq("npc_id", id);
  return done(data.id);
}

export async function deleteNpc(id: string): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { data: npc } = await ctx.supabase.from("house_npcs").select("image_url").eq("id", id).single();
  const { error } = await ctx.supabase.from("house_npcs").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  await removeImage(npc?.image_url);
  return done();
}

// ---------------------------------------------------------------------
// PG membri: casata e ruolo li scrive solo il server (secret key)
// ---------------------------------------------------------------------
async function roleBelongsTo(ctx: NonNullable<Awaited<ReturnType<typeof authorized>>>, roleId: string | null, houseId: string) {
  if (!roleId) return true;
  const { data } = await ctx.supabase.from("house_roles").select("house_id").eq("id", roleId).single();
  return data?.house_id === houseId;
}

export async function addMember(houseId: string, characterName: string, roleId: string | null): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const name = normalizeCharacterName(characterName);
  if (validateCharacterName(name)) return { error: "Nome del personaggio non valido." };
  const { data: character } = await ctx.supabase
    .from("characters")
    .select("id, house_id")
    .ilike("name", name)
    .maybeSingle();
  if (!character) return { error: "Nessun personaggio con questo nome." };
  if (character.house_id === houseId) return { error: "Il personaggio è già in questa casata." };
  if (!(await roleBelongsTo(ctx, roleId, houseId))) return { error: "Ruolo non valido." };

  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const { error } = await admin
    .from("characters")
    .update({ house_id: houseId, house_role_id: roleId })
    .eq("id", character.id);
  if (error) return { error: "Assegnazione non riuscita." };
  return done();
}

export async function setMemberRole(characterId: string, houseId: string, roleId: string | null): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  if (!(await roleBelongsTo(ctx, roleId, houseId))) return { error: "Ruolo non valido." };

  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const { error } = await admin
    .from("characters")
    .update({ house_role_id: roleId })
    .eq("id", characterId)
    .eq("house_id", houseId);
  if (error) return { error: "Modifica non riuscita." };
  return done();
}

export async function removeMember(characterId: string): Promise<HouseResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const { error } = await admin
    .from("characters")
    .update({ house_id: null, house_role_id: null })
    .eq("id", characterId);
  if (error) return { error: "Rimozione non riuscita." };
  return done();
}
