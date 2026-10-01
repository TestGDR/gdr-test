import type { SupabaseClient } from "@supabase/supabase-js";

export type MainCharacter = { id: string; name: string; status: "bozza" | "attivo" };

// Il personaggio principale dell'account: quello creato all'iscrizione (il piu' vecchio)
export async function getMainCharacter(
  supabase: SupabaseClient,
  userId: string,
): Promise<MainCharacter | null> {
  const { data } = await supabase
    .from("characters")
    .select("id, name, status")
    .eq("owner_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle<MainCharacter>();
  return data;
}
