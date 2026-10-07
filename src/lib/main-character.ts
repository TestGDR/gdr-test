import type { SupabaseClient } from "@supabase/supabase-js";

export type MainCharacter = {
  id: string;
  name: string;
  status: "bozza" | "revisione" | "attivo";
  avatar_url: string | null;
  house: { name: string; sigil_url: string | null } | null;
};

// Il personaggio principale dell'account: quello creato all'iscrizione (il piu' vecchio)
export async function getMainCharacter(
  supabase: SupabaseClient,
  userId: string,
): Promise<MainCharacter | null> {
  const { data } = await supabase
    .from("characters")
    .select("id, name, status, avatar_url, house:houses(name, sigil_url)")
    .eq("owner_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle<MainCharacter>();
  return data;
}
