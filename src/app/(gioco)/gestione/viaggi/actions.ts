"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/staff";

// Andature: moltiplicano il tempo dei viaggi
export async function saveTravelSettings(form: FormData): Promise<{ error?: string }> {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has("mondo.gestire")) return { error: "Non hai il permesso di gestire i viaggi." };
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
