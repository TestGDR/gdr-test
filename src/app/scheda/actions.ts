"use server";

import { revalidatePath } from "next/cache";
import {
  TEXT_MAX,
  sanitizeCreationData,
  type CreationData,
  type CustomValue,
  type TraitInfo,
} from "@/lib/character-creation";
import { allBlocks, cfg, firstInvalidFlowStep, hasBlock, loadFlow, PHYSICAL_FIELDS } from "@/lib/creation-flow";
import { RULES, STAT_IDS, type StatId } from "@/lib/rules/config";
import { VISIBLE_MARKS_MAX } from "@/lib/marital";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type CreationResult = { error?: string; invalidStep?: number };

// Salva le scelte fatte finora (nella bozza, che vede solo il proprietario)
// e il passaggio raggiunto (avanti o indietro che sia)
export async function saveCreationProgress(
  characterId: string,
  rawData: CreationData,
  step: number,
): Promise<CreationResult> {
  const { supabase, user } = await requireUser();
  const data = sanitizeCreationData(rawData);
  const safeStep = Math.min(100, Math.max(0, Math.trunc(step) || 0));

  // Solo il proprietario, solo finche' il PG e' in bozza
  const { data: character } = await supabase
    .from("characters")
    .select("id")
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "bozza")
    .maybeSingle();
  if (!character) return { error: "Salvataggio non riuscito, riprova." };

  const [draft, progress] = await Promise.all([
    supabase.from("character_drafts").upsert({
      character_id: characterId,
      data,
      updated_at: new Date().toISOString(),
    }),
    supabase
      .from("characters")
      .update({ creation_step: safeStep })
      .eq("id", characterId)
      .eq("owner_id", user.id),
  ]);
  if (draft.error || progress.error)
    return { error: "Salvataggio non riuscito, riprova." };
  return {};
}

// Conferma: rilegge le scelte salvate, le controlla con la creazione
// configurata in Gestione e attiva il personaggio. La storia va nella
// tabella riservata allo staff e da li' non si modifica piu'
export async function finalizeCharacter(
  characterId: string,
): Promise<CreationResult> {
  const { supabase, user } = await requireUser();

  const [{ data: character }, { data: draft }, flow, { data: traitCatalog }, { data: activeSkills }] =
    await Promise.all([
      supabase.from("characters").select("id, owner_id, status").eq("id", characterId).maybeSingle(),
      supabase.from("character_drafts").select("data").eq("character_id", characterId).maybeSingle(),
      loadFlow(supabase),
      supabase.from("traits").select("id, name, kind, cost, choice, unique_group, requires_master, active"),
      supabase.from("skills").select("id").eq("active", true),
    ]);
  if (!character || character.owner_id !== user.id)
    return { error: "Personaggio non trovato." };
  if (character.status !== "bozza")
    return { error: "Questo personaggio è già attivo." };
  if (flow.length === 0)
    return { error: "La creazione non è ancora configurata: avvisa lo staff." };

  const data = sanitizeCreationData(draft?.data);
  const catalog = (traitCatalog ?? []) as TraitInfo[];
  const skillIds = new Set((activeSkills ?? []).map((s) => s.id as string));
  const invalidStep = firstInvalidFlowStep(flow, data, { traits: catalog, skillIds });
  if (invalidStep !== null) {
    return { error: `Completa il passaggio "${flow[invalidStep].title}".`, invalidStep };
  }
  const traitsStep = flow.findIndex((s) => s.blocks.some((b) => b.kind === "tratti"));
  if (hasBlock(flow, "tratti"))
    for (const t of data.traits ?? []) {
      const info = catalog.find((x) => x.id === t.id);
      if (info?.choice === "abilita" && !skillIds.has(t.choice ?? ""))
        return { error: `Per "${info.name}" scegli un'abilità valida.`, invalidStep: traitsStep };
      if (info?.choice === "statistica" && !STAT_IDS.includes(t.choice as StatId))
        return { error: `Per "${info.name}" scegli una statistica valida.`, invalidStep: traitsStep };
    }

  // Solo i dati dei blocchi presenti nella creazione
  const has = (k: Parameters<typeof hasBlock>[1]) => hasBlock(flow, k);
  const statsBlock = allBlocks(flow).find((b) => b.kind === "statistiche");
  const physical = allBlocks(flow).find((b) => b.kind === "dati_fisici");
  const physicalFields = physical ? (cfg(physical).fields ?? []) : [];
  const publicFields: Record<string, CustomValue> = {};
  const privateFields: Record<string, CustomValue> = {};
  for (const b of allBlocks(flow).filter((x) => x.kind === "campo")) {
    const c = cfg(b);
    const v = data.custom?.[c.key ?? ""];
    if (v === undefined || !c.key) continue;
    if (c.visibility === "pubblico") publicFields[c.key] = v;
    else privateFields[c.key] = v;
  }

  // Lo stato, la scheda definitiva e la storia li scrive solo il server (secret key)
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  if (has("storia") && data.story?.trim()) {
    const { error: storyError } = await admin
      .from("character_backgrounds")
      .upsert({ character_id: characterId, body: data.story.trim() });
    if (storyError) return { error: "Creazione non riuscita, riprova." };
  }
  const update: Record<string, unknown> = {
    status: "attivo",
    sex: data.sex ?? null,
    age: data.age ?? null,
    attributes: statsBlock
      ? Object.fromEntries(RULES.stats.map((s) => [s.id, data.attributes?.[s.id] ?? cfg(statsBlock).min]))
      : Object.fromEntries(RULES.stats.map((s) => [s.id, RULES.statMin])),
    honor: RULES.honor.start,
    custom_fields: publicFields,
    activated_at: new Date().toISOString(),
  };
  if (has("aspetto")) update.appearance = data.appearance?.trim() || null;
  for (const f of PHYSICAL_FIELDS)
    if (physicalFields.includes(f.id)) update[f.id] = data[f.id]?.trim().slice(0, f.max) || null;
  const { error } = await admin
    .from("characters")
    .update(update)
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "bozza");
  if (error) return { error: "Creazione non riuscita, riprova." };
  await admin.from("character_drafts").delete().eq("character_id", characterId);
  if (Object.keys(privateFields).length)
    await admin.from("character_private_fields").upsert({ character_id: characterId, data: privateFields });

  // Abilita' e tratti della creazione (i livelli presi ora non costano PX)
  const skillRows = has("abilita")
    ? Object.entries(data.skills ?? {}).map(([skill_id, level]) => ({ character_id: characterId, skill_id, level }))
    : [];
  if (skillRows.length) await admin.from("character_skills").upsert(skillRows);
  const traitRows = has("tratti")
    ? (data.traits ?? []).map((t) => ({ character_id: characterId, trait_id: t.id, choice: t.choice ?? null }))
    : [];
  if (traitRows.length) await admin.from("character_traits").upsert(traitRows);

  // Equipaggiamento di partenza: solo oggetti davvero disponibili all'iscrizione,
  // al massimo quanti ne permette lo staff (nascono del livello dell'oggetto)
  if (has("equipaggiamento") && data.items?.length) {
    const [{ data: allowed }, { data: settings }] = await Promise.all([
      admin
        .from("items")
        .select("id")
        .eq("at_signup", true)
        .in("id", data.items),
      admin.from("item_settings").select("signup_max").maybeSingle(),
    ]);
    const max = (settings?.signup_max as number | undefined) ?? 3;
    const ok = new Set((allowed ?? []).map((i) => i.id as string));
    const rows = data.items
      .filter((id) => ok.has(id))
      .slice(0, max)
      .map((item_id) => ({
        character_id: characterId,
        item_id,
        source: "iscrizione",
      }));
    if (rows.length) await admin.from("character_items").insert(rows);
  }

  revalidatePath("/", "layout");
  return {};
}

// Campi della scheda che il proprietario modifica con la pennina di ogni sezione
export type SheetFields = {
  faceClaim?: string;
  avatarUrl?: string; // immagine di chat 100 x 100
  portraitUrl?: string; // ritratto della scheda
  coverUrl?: string; // immagine lunga da computer
  coverMobileUrl?: string; // immagine lunga da cellulare
  sheetHtml?: string; // pagina Principale in HTML e CSS
  knownHtml?: string; // "Si sa che"
  affectionsHtml?: string; // "Affetti"
  appearance?: string; // Aspetto
  height?: string; // Dati: altezza
  eyeColor?: string; // Dati: colore occhi
  hairColor?: string; // Dati: colore capelli
  visibleMarks?: string; // Dati: segni visibili
};

const COLUMNS: Record<keyof SheetFields, string> = {
  faceClaim: "face_claim",
  avatarUrl: "avatar_url",
  portraitUrl: "portrait_url",
  coverUrl: "cover_url",
  coverMobileUrl: "cover_mobile_url",
  sheetHtml: "sheet_html",
  knownHtml: "known_html",
  affectionsHtml: "affections_html",
  appearance: "appearance",
  height: "height",
  eyeColor: "eye_color",
  hairColor: "hair_color",
  visibleMarks: "visible_marks",
};
const IMAGES: (keyof SheetFields)[] = [
  "avatarUrl",
  "portraitUrl",
  "coverUrl",
  "coverMobileUrl",
];
// lunghezze massime (l'HTML si salva com'e': viene ripulito ogni volta che si mostra)
const MAX: Partial<Record<keyof SheetFields, number>> = {
  faceClaim: 80,
  avatarUrl: 1000,
  portraitUrl: 1000,
  coverUrl: 1000,
  coverMobileUrl: 1000,
  sheetHtml: 30000,
  knownHtml: 20000,
  affectionsHtml: 20000,
  appearance: TEXT_MAX,
  height: 30,
  eyeColor: 40,
  hairColor: 40,
  visibleMarks: VISIBLE_MARKS_MAX,
};

// Salva solo i campi passati (una sezione alla volta)
export async function saveSheetFields(
  characterId: string,
  fields: SheetFields,
): Promise<CreationResult> {
  const { supabase } = await requireUser();
  const update: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(fields) as [
    keyof SheetFields,
    string | undefined,
  ][]) {
    if (raw === undefined || !(key in COLUMNS)) continue;
    const value =
      key === "faceClaim" ? raw.trim().replace(/\s+/g, " ") : raw.trim();
    if (value.length > (MAX[key] ?? 1000))
      return { error: "Testo troppo lungo." };
    if (
      IMAGES.includes(key) &&
      value &&
      !value.toLowerCase().startsWith("https://")
    )
      return {
        error: "Le immagini devono essere indirizzi che iniziano con https://",
      };
    if (key === "appearance" && !value)
      return { error: "L'aspetto non può restare vuoto." };
    update[COLUMNS[key]] = value || null;
  }
  if (Object.keys(update).length === 0) return {};

  const { error } = await supabase
    .from("characters")
    .update(update)
    .eq("id", characterId) // proprietario o admin: lo decide il database (RLS)
    .eq("status", "attivo");
  if (error) {
    if (error.code === "23505")
      return {
        error: "Questo prestavolto è già usato da un altro personaggio.",
      };
    return { error: "Salvataggio non riuscito." };
  }
  revalidatePath("/", "layout");
  return {};
}
