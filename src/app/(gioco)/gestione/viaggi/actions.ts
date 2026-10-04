"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/staff";

// Velocita' dei mezzi (ore per tutta la mappa) e andature (moltiplicatori)
export async function saveTravelSettings(form: FormData): Promise<{ error?: string }> {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has("mondo.gestire")) return { error: "Non hai il permesso di gestire i viaggi." };
  const num = (key: string, min: number, max: number, fallback: number) => {
    const n = Number(String(form.get(key) ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
  };
  const row = {
    walk_full_hours: num("walk_full_hours", 0, 1000, 48),
    horse_full_hours: num("horse_full_hours", 0, 1000, 16),
    dragon_full_hours: num("dragon_full_hours", 0, 1000, 2),
    pace_slow_factor: num("pace_slow_factor", 0.1, 10, 1.5),
    pace_fast_factor: num("pace_fast_factor", 0.1, 10, 0.75),
  };
  const { error } = await ctx.supabase.from("missive_settings").update(row).eq("id", true);
  if (error) return { error: "Velocità non salvate." };
  revalidatePath("/gestione/viaggi");
  return {};
}
