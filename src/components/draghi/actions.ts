"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "draghi";
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 1024 * 1024;

// Immagine del drago: la cambiano lo staff (draghi.gestire) e il cavaliere
export async function saveDragonImage(form: FormData): Promise<{ error?: string; url?: string }> {
  const ctx = await getStaffContext();
  const id = String(form.get("id") ?? "");
  const file = form.get("image");
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

  let url: string | null = null;
  if (!remove) {
    if (!(file instanceof File) || file.size === 0) return { error: "Scegli un'immagine." };
    if (!TYPES.includes(file.type)) return { error: "Formato non valido: usa PNG, JPG, WebP o GIF." };
    if (file.size > MAX_BYTES) return { error: "Immagine troppo grande (massimo 1 MB)." };
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) return { error: "Caricamento dell'immagine non riuscito." };
    url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Salvataggio con i permessi dell'utente (le regole del database ricontrollano)
  const { error } = await ctx.supabase.from("dragons").update({ image_url: url }).eq("id", id);
  if (error) return { error: "Salvataggio non riuscito." };

  const marker = `/object/public/${BUCKET}/`;
  if (dragon.image_url?.includes(marker)) await admin.storage.from(BUCKET).remove([dragon.image_url.split(marker)[1]]);
  revalidatePath("/", "layout");
  return { url: url ?? undefined };
}
