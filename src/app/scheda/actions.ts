"use server";

import { revalidatePath } from "next/cache";
import {
  STEPS,
  firstInvalidStep,
  sanitizeCreationData,
  type CreationData,
} from "@/lib/character-creation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type CreationResult = { error?: string; invalidStep?: number };

// Salva le scelte fatte finora e lo step raggiunto (avanti o indietro che sia)
export async function saveCreationProgress(
  characterId: string,
  rawData: CreationData,
  step: number,
): Promise<CreationResult> {
  const { supabase, user } = await requireUser();
  const data = sanitizeCreationData(rawData);
  const safeStep = Math.min(STEPS.length - 1, Math.max(0, Math.trunc(step) || 0));

  // RLS + permessi di colonna: solo il proprietario, solo questi due campi
  const { error } = await supabase
    .from("characters")
    .update({ creation_data: data, creation_step: safeStep })
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "bozza");
  if (error) return { error: "Salvataggio non riuscito, riprova." };
  return {};
}

// Conferma: rilegge le scelte salvate, le valida e attiva il personaggio
export async function finalizeCharacter(characterId: string): Promise<CreationResult> {
  const { supabase, user } = await requireUser();

  const { data: character } = await supabase
    .from("characters")
    .select("id, owner_id, status, creation_data")
    .eq("id", characterId)
    .maybeSingle();
  if (!character || character.owner_id !== user.id) return { error: "Personaggio non trovato." };
  if (character.status !== "bozza") return { error: "Questo personaggio è già attivo." };

  const data = sanitizeCreationData(character.creation_data);
  const invalidStep = firstInvalidStep(data);
  if (invalidStep !== null) {
    return { error: `Completa lo step "${STEPS[invalidStep]}".`, invalidStep };
  }

  // Lo stato e la scheda definitiva li scrive solo il server (secret key)
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const { error } = await admin
    .from("characters")
    .update({
      status: "attivo",
      sex: data.sex,
      age: data.age,
      region: data.region,
      social_class: data.social_class,
      attributes: data.attributes,
      appearance: data.appearance!.trim(),
      description: data.story!.trim(),
      activated_at: new Date().toISOString(),
    })
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "bozza");
  if (error) return { error: "Creazione non riuscita, riprova." };

  revalidatePath("/", "layout");
  return {};
}

// Prestavolto e immagine del proprio personaggio (modificabili in ogni momento)
export async function saveSheetExtras(
  characterId: string,
  faceClaim: string,
  avatarUrl: string,
): Promise<CreationResult> {
  const { supabase, user } = await requireUser();
  const claim = faceClaim.trim().replace(/\s+/g, " ").slice(0, 80);
  const avatar = avatarUrl.trim();
  if (avatar && !avatar.toLowerCase().startsWith("https://")) {
    return { error: "L'immagine deve essere un indirizzo che inizia con https://" };
  }

  const { error } = await supabase
    .from("characters")
    .update({ face_claim: claim || null, avatar_url: avatar || null })
    .eq("id", characterId)
    .eq("owner_id", user.id);
  if (error) {
    if (error.code === "23505") return { error: "Questo prestavolto è già usato da un altro personaggio." };
    return { error: "Salvataggio non riuscito." };
  }
  revalidatePath("/", "layout");
  return {};
}
