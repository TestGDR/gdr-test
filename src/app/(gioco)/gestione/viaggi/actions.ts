"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/staff";

// Andature: moltiplicano il tempo dei viaggi
export async function saveTravelSettings(form: FormData): Promise<{ error?: string }> {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has("viaggi.gestire")) return { error: "Non hai il permesso di gestire i viaggi." };
  const num = (key: string, fallback: number) => {
    const n = Number(String(form.get(key) ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.min(10, Math.max(0.1, Math.round(n * 100) / 100)) : fallback;
  };
  const { error } = await ctx.supabase
    .from("missive_settings")
    .update({ pace_slow_factor: num("pace_slow_factor", 1.5), pace_fast_factor: num("pace_fast_factor", 0.75) })
    .eq("id", true);
  if (error) return { error: "Andature non salvate." };
  revalidatePath("/gestione/viaggi");
  return {};
}

// Missive: probabilita' di intercettazione e luogo di partenza dei PG
export async function saveMissiveSettings(form: FormData): Promise<{ error?: string }> {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has("viaggi.gestire")) return { error: "Non hai il permesso di gestire le missive." };
  const pct = (key: string, fallback: number) => {
    const n = Math.round(Number(form.get(key)));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
  };
  const { error } = await ctx.supabase
    .from("missive_settings")
    .update({
      raven_intercept_pct: pct("raven_intercept_pct", 10),
      rider_intercept_pct: pct("rider_intercept_pct", 20),
      default_location_id: String(form.get("default_location_id") ?? "").slice(0, 36) || null,
    })
    .eq("id", true);
  if (error) return { error: "Impostazioni non salvate." };
  revalidatePath("/gestione/viaggi");
  return {};
}

// Lo staff corregge la posizione di un PG
export async function setCharacterPosition(characterId: string, locationId: string | null): Promise<{ error?: string }> {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has("viaggi.gestire")) return { error: "Non hai il permesso." };
  const { error } = await ctx.supabase.rpc("staff_set_position", { p_character: characterId, p_location: locationId });
  if (error) return { error: "Posizione non salvata." };
  revalidatePath("/gestione/viaggi");
  return {};
}
