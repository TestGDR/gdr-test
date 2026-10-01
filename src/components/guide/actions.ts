"use server";

import { IMAGE_TYPES } from "@/lib/houses";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type GuideResult = { error?: string; id?: string };
type Book = "manuale" | "ambientazione";

const BOOKS: Book[] = ["manuale", "ambientazione"];
const DENIED = { error: "Non hai il permesso di modificare la documentazione." };

// Ogni azione ricontrolla il permesso (le regole del database lo rifarebbero comunque)
async function authorized() {
  const ctx = await getStaffContext();
  return ctx.permissions.has("documentazione.scrivere") ? ctx : null;
}

const clean = (text: string, max: number) => text.trim().replace(/\s+/g, " ").slice(0, max);

// ---------------------------------------------------------------------
// Macrosezioni
// ---------------------------------------------------------------------
export async function createSection(book: Book, title: string): Promise<GuideResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  if (!BOOKS.includes(book)) return { error: "Documentazione non valida." };
  const name = clean(title, 120);
  if (!name) return { error: "Scrivi il nome della macrosezione." };

  const { data: last } = await ctx.supabase
    .from("guide_sections")
    .select("sort_order")
    .eq("book", book)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await ctx.supabase
    .from("guide_sections")
    .insert({ book, title: name, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return { error: "Creazione non riuscita." };
  return { id: data.id };
}

export async function renameSection(id: string, title: string): Promise<GuideResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const name = clean(title, 120);
  if (!name) return { error: "Scrivi il nome della macrosezione." };
  const { error } = await ctx.supabase.from("guide_sections").update({ title: name }).eq("id", id);
  return error ? { error: "Modifica non riuscita." } : {};
}

// Elimina la macrosezione e tutte le sue sezioni
export async function deleteSection(id: string): Promise<GuideResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { error } = await ctx.supabase.from("guide_sections").delete().eq("id", id);
  return error ? { error: "Eliminazione non riuscita." } : {};
}

// ---------------------------------------------------------------------
// Sezioni (pagine con il testo)
// ---------------------------------------------------------------------
export async function createPage(sectionId: string, title: string): Promise<GuideResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const name = clean(title, 120);
  if (!name) return { error: "Scrivi il titolo della sezione." };

  const { data: section } = await ctx.supabase.from("guide_sections").select("book").eq("id", sectionId).maybeSingle();
  if (!section) return { error: "Macrosezione non trovata." };
  const { data: last } = await ctx.supabase
    .from("guide_pages")
    .select("sort_order")
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await ctx.supabase
    .from("guide_pages")
    .insert({
      book: section.book,
      section_id: sectionId,
      title: name,
      body: "",
      format: "html",
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) return { error: "Creazione non riuscita." };
  return { id: data.id };
}

// Il testo viene sempre salvato in HTML (viene ripulito anche quando si mostra)
export async function savePage(id: string, title: string, bodyHtml: string): Promise<GuideResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const name = clean(title, 120);
  if (!name) return { error: "Scrivi il titolo della sezione." };
  if (bodyHtml.length > 200_000) return { error: "Il testo è troppo lungo." };

  const { error } = await ctx.supabase
    .from("guide_pages")
    .update({ title: name, body: bodyHtml, format: "html", updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: "Salvataggio non riuscito." } : {};
}

export async function deletePage(id: string): Promise<GuideResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const { error } = await ctx.supabase.from("guide_pages").delete().eq("id", id);
  return error ? { error: "Eliminazione non riuscita." } : {};
}

// ---------------------------------------------------------------------
// Immagini inserite nel testo: caricate dal server nell'archivio "documentazione"
// ---------------------------------------------------------------------
const GUIDE_IMAGE_MAX = 2 * 1024 * 1024;

export async function uploadGuideImage(form: FormData): Promise<{ url?: string; error?: string }> {
  const ctx = await authorized();
  if (!ctx) return DENIED;
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Scegli un'immagine." };
  if (!IMAGE_TYPES.includes(file.type)) return { error: "Formato non valido: usa PNG, JPG, WebP o GIF." };
  if (file.size > GUIDE_IMAGE_MAX) return { error: "Immagine troppo grande (massimo 2 MB)." };

  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `immagini/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("documentazione").upload(path, file, { contentType: file.type });
  if (error) return { error: "Caricamento dell'immagine non riuscito." };
  return { url: admin.storage.from("documentazione").getPublicUrl(path).data.publicUrl };
}

// ---------------------------------------------------------------------
// Nuovo ordine dopo un trascinamento: l'elenco completo di macrosezioni,
// ognuna con le sue sezioni nell'ordine voluto
// ---------------------------------------------------------------------
export async function saveOrder(
  book: Book,
  layout: { sectionId: string; pageIds: string[] }[],
): Promise<GuideResult> {
  const ctx = await authorized();
  if (!ctx) return DENIED;

  // Solo macrosezioni e pagine di questa documentazione
  const [{ data: sections }, { data: pages }] = await Promise.all([
    ctx.supabase.from("guide_sections").select("id").eq("book", book),
    ctx.supabase.from("guide_pages").select("id").eq("book", book),
  ]);
  const validSections = new Set((sections ?? []).map((s) => s.id));
  const validPages = new Set((pages ?? []).map((p) => p.id));
  if (layout.some((l) => !validSections.has(l.sectionId) || l.pageIds.some((p) => !validPages.has(p)))) {
    return { error: "Ordine non valido." };
  }

  const updates = layout.flatMap((l, sectionIndex) => [
    ctx.supabase.from("guide_sections").update({ sort_order: sectionIndex + 1 }).eq("id", l.sectionId),
    ...l.pageIds.map((pageId, pageIndex) =>
      ctx.supabase.from("guide_pages").update({ section_id: l.sectionId, sort_order: pageIndex + 1 }).eq("id", pageId),
    ),
  ]);
  const results = await Promise.all(updates);
  return results.some((r) => r.error) ? { error: "Salvataggio dell'ordine non riuscito." } : {};
}
