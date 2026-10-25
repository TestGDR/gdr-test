"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "draghi";

// Immagine del drago: la cambiano lo staff (draghi.gestire) e il cavaliere
export async function saveDragonImage(form: FormData): Promise<{ error?: string; url?: string }> {
  const ctx = await getStaffContext();
  const id = String(form.get("id") ?? "");
  const link = String(form.get("url") ?? "").trim();
  const remove = form.get("remove") === "1";

  const { data: dragon } = await ctx.supabase.from("dragons").select("id, image_url, rider_id").eq("id", id).maybeSingle();
  if (!dragon) return { error: "Drago non trovato." };
  if (!ctx.permissions.has("draghi.gestire")) {
    const { data: rider } = await ctx.supabase
      .from("characters")
      .select("id")
      .eq("id", dragon.rider_id ?? "")
      .eq("owner_id", ctx.user.id)
      .maybeSingle();
    if (!rider) return { error: "Solo il cavaliere o lo staff possono cambiare l'immagine." };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };

  // l'immagine e' un link (niente file caricati: non consumano spazio)
  let url: string | null = null;
  if (!remove) {
    if (!link) return { error: "Incolla il link dell'immagine." };
    if (!link.startsWith("https://") || /s/.test(link) || link.length > 1000)
      return { error: "Il link deve iniziare con https://" };
    url = link;
  }

  // Salvataggio con i permessi dell'utente (le regole del database ricontrollano)
  const { error } = await ctx.supabase.from("dragons").update({ image_url: url }).eq("id", id);
  if (error) return { error: "Salvataggio non riuscito." };

  const marker = `/object/public/${BUCKET}/`;
  if (dragon.image_url?.includes(marker)) await admin.storage.from(BUCKET).remove([dragon.image_url.split(marker)[1]]);
  revalidatePath("/", "layout");
  return { url: url ?? undefined };
}
