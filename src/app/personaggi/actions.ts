"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

export type CharacterState = { error?: string; ok?: boolean };

export async function createCharacter(
  _prev: CharacterState,
  formData: FormData,
): Promise<CharacterState> {
  const { supabase, user } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim() || null;

  if (name.length < 2 || name.length > 40) {
    return { error: "Il nome deve avere tra 2 e 40 caratteri." };
  }

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
