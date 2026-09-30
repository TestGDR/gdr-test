"use server";

import { revalidatePath } from "next/cache";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import { requireUser } from "@/lib/supabase/server";

export type CharacterState = { error?: string; ok?: boolean };

export async function createCharacter(
  _prev: CharacterState,
  formData: FormData,
): Promise<CharacterState> {
  const { supabase, user } = await requireUser();

  const name = normalizeCharacterName(String(formData.get("name") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim() || null;

  const nameError = validateCharacterName(name);
  if (nameError) return { error: nameError };

  const { error } = await supabase.from("characters").insert({
    owner_id: user.id,
    name,
    description,
    avatar_url: avatarUrl,
  });

  if (error) {
    if (error.code === "23505") return { error: "Esiste già un personaggio con questo nome." };
    return { error: error.message };
  }

  revalidatePath("/personaggi");
  return { ok: true };
}

export async function deleteCharacter(id: string) {
  const { supabase } = await requireUser();
  // La RLS permette di eliminare solo i propri personaggi
  await supabase.from("characters").delete().eq("id", id);
  revalidatePath("/personaggi");
}
