"use server";

import { revalidatePath } from "next/cache";
import {
  STEPS,
  TEXT_MAX,
  firstInvalidStep,
  sanitizeCreationData,
  type CreationData,
} from "@/lib/character-creation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type CreationResult = { error?: string; invalidStep?: number };

// Salva le scelte fatte finora (nella bozza, che vede solo il proprietario)
// e lo step raggiunto (avanti o indietro che sia)
export async function saveCreationProgress(
  characterId: string,
  rawData: CreationData,
  step: number,
): Promise<CreationResult> {
  const { supabase, user } = await requireUser();
  const data = sanitizeCreationData(rawData);
  const safeStep = Math.min(
    STEPS.length - 1,
    Math.max(0, Math.trunc(step) || 0),
  );

  // Solo il proprietario, solo finche' il PG e' in bozza
  const { data: character } = await supabase
    .from("characters")
    .select("id")
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "bozza")
    .maybeSingle();
  if (!character) return { error: "Salvataggio non riuscito, riprova." };

  const [draft, progress] = await Promise.all([
    supabase.from("character_drafts").upsert({
      character_id: characterId,
      data,
      updated_at: new Date().toISOString(),
    }),
    supabase
      .from("characters")
      .update({ creation_step: safeStep })
      .eq("id", characterId)
      .eq("owner_id", user.id),
  ]);
  if (draft.error || progress.error)
    return { error: "Salvataggio non riuscito, riprova." };
  return {};
}

// Conferma: rilegge le scelte salvate, le valida e attiva il personaggio.
// La storia va nella tabella riservata allo staff e da li' non si modifica piu'
export async function finalizeCharacter(
  characterId: string,
): Promise<CreationResult> {
  const { supabase, user } = await requireUser();

  const [{ data: character }, { data: draft }] = await Promise.all([
    supabase
      .from("characters")
      .select("id, owner_id, status")
      .eq("id", characterId)
      .maybeSingle(),
    supabase
      .from("character_drafts")
      .select("data")
      .eq("character_id", characterId)
      .maybeSingle(),
  ]);
  if (!character || character.owner_id !== user.id)
    return { error: "Personaggio non trovato." };
  if (character.status !== "bozza")
    return { error: "Questo personaggio è già attivo." };

  const data = sanitizeCreationData(draft?.data);
  const invalidStep = firstInvalidStep(data);
  if (invalidStep !== null) {
    return { error: `Completa lo step "${STEPS[invalidStep]}".`, invalidStep };
  }

  // Lo stato, la scheda definitiva e la storia li scrive solo il server (secret key)
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const { error: storyError } = await admin
    .from("character_backgrounds")
    .upsert({ character_id: characterId, body: data.story!.trim() });
  if (storyError) return { error: "Creazione non riuscita, riprova." };
  const { error } = await admin
    .from("characters")
    .update({
      status: "attivo",
      sex: data.sex,
      age: data.age,
      attributes: data.attributes,
      appearance: data.appearance!.trim(),
      activated_at: new Date().toISOString(),
    })
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "bozza");
  if (error) return { error: "Creazione non riuscita, riprova." };
  await admin.from("character_drafts").delete().eq("character_id", characterId);

  // Equipaggiamento di partenza: solo oggetti davvero disponibili all'iscrizione,
  // al massimo quanti ne permette lo staff (nascono del livello dell'oggetto)
  if (data.items?.length) {
    const [{ data: allowed }, { data: settings }] = await Promise.all([
      admin
        .from("items")
        .select("id")
        .eq("at_signup", true)
        .in("id", data.items),
      admin.from("item_settings").select("signup_max").maybeSingle(),
    ]);
    const max = (settings?.signup_max as number | undefined) ?? 3;
    const ok = new Set((allowed ?? []).map((i) => i.id as string));
    const rows = data.items
      .filter((id) => ok.has(id))
      .slice(0, max)
      .map((item_id) => ({
        character_id: characterId,
        item_id,
        source: "iscrizione",
      }));
    if (rows.length) await admin.from("character_items").insert(rows);
  }

  revalidatePath("/", "layout");
  return {};
}

// Campi della scheda che il proprietario modifica con la pennina di ogni sezione
export type SheetFields = {
  faceClaim?: string;
  avatarUrl?: string; // immagine di chat 100 x 100
  portraitUrl?: string; // ritratto della scheda
  coverUrl?: string; // immagine lunga da computer
  coverMobileUrl?: string; // immagine lunga da cellulare
  sheetHtml?: string; // pagina Principale in HTML e CSS
  knownHtml?: string; // "Si sa che"
  affectionsHtml?: string; // "Affetti"
  appearance?: string; // Aspetto
};

const COLUMNS: Record<keyof SheetFields, string> = {
  faceClaim: "face_claim",
  avatarUrl: "avatar_url",
  portraitUrl: "portrait_url",
  coverUrl: "cover_url",
  coverMobileUrl: "cover_mobile_url",
  sheetHtml: "sheet_html",
  knownHtml: "known_html",
  affectionsHtml: "affections_html",
  appearance: "appearance",
};
const IMAGES: (keyof SheetFields)[] = [
  "avatarUrl",
  "portraitUrl",
  "coverUrl",
  "coverMobileUrl",
];
// lunghezze massime (l'HTML si salva com'e': viene ripulito ogni volta che si mostra)
const MAX: Partial<Record<keyof SheetFields, number>> = {
  faceClaim: 80,
  avatarUrl: 1000,
  portraitUrl: 1000,
  coverUrl: 1000,
  coverMobileUrl: 1000,
  sheetHtml: 30000,
  knownHtml: 20000,
  affectionsHtml: 20000,
  appearance: TEXT_MAX,
};

// Salva solo i campi passati (una sezione alla volta)
export async function saveSheetFields(
  characterId: string,
  fields: SheetFields,
): Promise<CreationResult> {
  const { supabase, user } = await requireUser();
  const update: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(fields) as [
    keyof SheetFields,
    string | undefined,
  ][]) {
    if (raw === undefined || !(key in COLUMNS)) continue;
    const value =
      key === "faceClaim" ? raw.trim().replace(/\s+/g, " ") : raw.trim();
    if (value.length > (MAX[key] ?? 1000))
      return { error: "Testo troppo lungo." };
    if (
      IMAGES.includes(key) &&
      value &&
      !value.toLowerCase().startsWith("https://")
    )
      return {
        error: "Le immagini devono essere indirizzi che iniziano con https://",
      };
    if (key === "appearance" && !value)
      return { error: "L'aspetto non può restare vuoto." };
    update[COLUMNS[key]] = value || null;
  }
  if (Object.keys(update).length === 0) return {};

  const { error } = await supabase
    .from("characters")
    .update(update)
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "attivo");
  if (error) {
    if (error.code === "23505")
      return {
        error: "Questo prestavolto è già usato da un altro personaggio.",
      };
    return { error: "Salvataggio non riuscito." };
  }
  revalidatePath("/", "layout");
  return {};
}
