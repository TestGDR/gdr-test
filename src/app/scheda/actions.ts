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
import { RULES } from "@/lib/rules/config";
import { loadStats } from "@/lib/rules/stats";
import { VISIBLE_MARKS_MAX } from "@/lib/marital";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/staff";

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

// Fine della creazione: il giocatore invia il PG in approvazione (si apre un
// ticket e il PG resta bloccato). Le scelte si controllano qui sul server
export async function finalizeCharacter(characterId: string): Promise<CreationResult> {
  return processCreation(characterId, "submit");
}

// Lo staff (permesso "schede.approvare") accetta il PG: ricontrolla le scelte
// e le scrive sulla scheda, che diventa attiva
export async function approveCharacter(characterId: string): Promise<CreationResult> {
  return processCreation(characterId, "approve");
}

// Lo staff rimanda il PG in creazione, con una nota per il giocatore
export async function sendBackCharacter(characterId: string, note: string): Promise<CreationResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("review_send_back", { p_character: characterId, p_note: note.slice(0, 2000) });
  if (error) return { error: error.message.length < 140 ? error.message : "Operazione non riuscita." };
  revalidatePath("/", "layout");
  return {};
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function processCreation(characterId: string, mode: "submit" | "approve"): Promise<CreationResult> {
  const { supabase, user } = await requireUser();

  const [{ data: character }, { data: draft }, flow, { data: traitCatalog }, { data: activeSkills }] =
    await Promise.all([
      supabase.from("characters").select("id, owner_id, status, coins, name").eq("id", characterId).maybeSingle(),
      supabase.from("character_drafts").select("data").eq("character_id", characterId).maybeSingle(),
      loadFlow(supabase),
      supabase.from("traits").select("id, name, kind, cost, choice, unique_group, requires_master, active"),
      supabase.from("skills").select("id, stat").eq("active", true),
    ]);
  if (!character) return { error: "Personaggio non trovato." };
  if (mode === "submit") {
    if (character.owner_id !== user.id) return { error: "Personaggio non trovato." };
    if (character.status === "revisione") return { error: "Il personaggio è già in attesa di approvazione." };
    if (character.status !== "bozza") return { error: "Questo personaggio è già attivo." };
  } else {
    const { data: can } = await supabase.rpc("can_approve_story");
    if (can !== true) return { error: "Non hai il permesso di approvare i personaggi." };
    if (character.status !== "revisione") return { error: "Il personaggio non è in attesa di approvazione." };
  }
  if (flow.length === 0)
    return { error: "La creazione non è ancora configurata: avvisa lo staff." };

  const data = sanitizeCreationData(draft?.data);
  const catalog = (traitCatalog ?? []) as TraitInfo[];
  const skillIds = new Set((activeSkills ?? []).map((s) => s.id as string));
  const skillStats = Object.fromEntries((activeSkills ?? []).map((s) => [s.id as string, s.stat as string]));
  const statList = await loadStats(supabase);
  const invalidStep = firstInvalidFlowStep(flow, data, { traits: catalog, skillIds, skillStats, stats: statList });
  if (invalidStep !== null) {
    return { error: `Completa il passaggio "${flow[invalidStep].title}".`, invalidStep };
  }
  const traitsStep = flow.findIndex((s) => s.blocks.some((b) => b.kind === "tratti"));
  if (hasBlock(flow, "tratti"))
    for (const t of data.traits ?? []) {
      const info = catalog.find((x) => x.id === t.id);
      if (info?.choice === "abilita" && !skillIds.has(t.choice ?? ""))
        return { error: `Per "${info.name}" scegli un'abilità valida.`, invalidStep: traitsStep };
      if (info?.choice === "statistica" && !statList.some((s) => s.id === t.choice))
        return { error: `Per "${info.name}" scegli una statistica valida.`, invalidStep: traitsStep };
    }

  // Solo i dati dei blocchi presenti nella creazione
  const has = (k: Parameters<typeof hasBlock>[1]) => hasBlock(flow, k);
  const stepOf = (k: Parameters<typeof hasBlock>[1]) => flow.findIndex((s) => s.blocks.some((b) => b.kind === k));
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

  // Data di nascita: giorno e luna scelti, l'anno si ricava dall'eta' e dalla data di gioco
  let birth: Record<string, number> = {};
  const ageBlock = allBlocks(flow).find((b) => b.kind === "eta");
  if (ageBlock && cfg(ageBlock).birthday && data.age && data.birth_day && data.birth_month) {
    const { data: year } = await supabase.rpc("birth_year_for", {
      p_age: data.age,
      p_day: data.birth_day,
      p_month: data.birth_month,
    });
    if (typeof year === "number") birth = { birth_day: data.birth_day, birth_month: data.birth_month, birth_year: year };
  }

  // Casata e ruolo: devono essere ancora aperti all'iscrizione per sesso ed eta'
  let houseId: string | null = null;
  let roleLabel = "";
  if (has("casata") && data.house_role_id) {
    const { data: roles } = await supabase.rpc("signup_house_roles", { p_sex: data.sex ?? "", p_age: data.age ?? 0 });
    const role = ((roles ?? []) as { role_id: string; house_id: string; role_name: string; house_name: string }[]).find(
      (r) => r.role_id === data.house_role_id,
    );
    if (!role)
      return { error: "Il ruolo di casata scelto non è più disponibile: scegline un altro.", invalidStep: stepOf("casata") };
    houseId = role.house_id;
    roleLabel = `${role.role_name} della Casata ${role.house_name}`;
  }

  // Drago: uno solo, libero e della casata scelta
  let dragonLabel = "";
  if (has("drago") && data.dragon_id) {
    if (!houseId) return { error: "Per reclamare un drago scegli prima la casata.", invalidStep: stepOf("drago") };
    const { data: d } = await supabase
      .from("dragons")
      .select("name, status, house_id, rider_id, npc_rider_id")
      .eq("id", data.dragon_id)
      .maybeSingle();
    if (!d || d.house_id !== houseId || d.rider_id || d.npc_rider_id)
      return { error: "Il drago scelto non è più libero: scegline un altro.", invalidStep: stepOf("drago") };
    dragonLabel = d.status === "uovo" ? d.name || "Uovo di drago" : d.name || "Drago";
  }

  // Prestavolto: non deve essere gia' di un altro PG (lo controlla anche il database)
  const claim = has("prestavolto") ? data.face_claim?.trim().replace(/\s+/g, " ") : undefined;
  if (claim) {
    const { data: same } = await supabase
      .from("characters")
      .select("id")
      .ilike("face_claim", claim.replace(/[\\%_]/g, "\\$&"))
      .neq("id", characterId)
      .limit(1);
    if (same?.length)
      return { error: "Questo prestavolto è già usato da un altro personaggio.", invalidStep: stepOf("prestavolto") };
  }

  // Equipaggiamento: oggetti disponibili all'iscrizione, comprati con le monete della creazione
  const equipBlock = allBlocks(flow).find((b) => b.kind === "equipaggiamento");
  const budget = equipBlock ? (cfg(equipBlock).coins ?? 0) : 0;
  let itemIds: string[] = [];
  let spent = 0;
  if (equipBlock && data.items?.length) {
    const { data: allowed } = await supabase
      .from("items")
      .select("id, price")
      .eq("at_signup", true)
      .in("id", data.items);
    const list = (allowed ?? []) as { id: string; price: number | null }[];
    itemIds = data.items.filter((id) => list.some((i) => i.id === id));
    spent = list.filter((i) => itemIds.includes(i.id)).reduce((a, i) => a + (i.price ?? 0), 0);
    if (spent > budget)
      return { error: `Gli oggetti scelti costano ${spent} monete, ne hai ${budget}.`, invalidStep: stepOf("equipaggiamento") };
  }

  // ---- Invio in approvazione: ticket e PG bloccato ----
  if (mode === "submit") {
    const row = (k: string, v: string) => (v ? `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>` : "");
    const body =
      `<p><strong>Richiesta di approvazione del personaggio ${esc(character.name)}.</strong></p><ul>` +
      row("Sesso", data.sex ?? "") +
      row("Età", data.age ? `${data.age} anni` : "") +
      row("Casata e ruolo", roleLabel) +
      row("Drago", dragonLabel) +
      row("Prestavolto", claim ?? "") +
      `</ul><p>Lo staff controlla tutte le scelte dalla scheda del personaggio (Anagrafica → ${esc(character.name)}) ` +
      `e preme <strong>Sblocca e conferma</strong> oppure <strong>Rimanda</strong>.</p>`;
    const { error } = await supabase.rpc("submit_character", { p_character: characterId, p_body: body });
    if (error) return { error: error.message.length < 140 ? error.message : "Invio non riuscito, riprova." };
    revalidatePath("/", "layout");
    return {};
  }

  // ---- Approvazione: le scelte vanno sulla scheda (scrive solo il server) ----
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };
  if (has("drago") && data.dragon_id) {
    const { data: claimed, error: claimError } = await admin.rpc("claim_signup_dragon", {
      p_character: characterId,
      p_dragon: data.dragon_id,
      p_house: houseId,
    });
    if (claimError) return { error: "Reclamo del drago non riuscito, riprova." };
    if (!claimed) return { error: "Il drago scelto non è più libero: rimanda il PG perché ne scelga un altro." };
  }
  if (has("storia") && data.story?.trim()) {
    const now = new Date().toISOString();
    const { error: storyError } = await admin
      .from("character_backgrounds")
      .upsert({ character_id: characterId, body: data.story.trim(), submitted_at: now, approved_at: now, approved_by: user.id });
    if (storyError) return { error: "Approvazione non riuscita, riprova." };
  }
  const update: Record<string, unknown> = {
    status: "attivo",
    sex: data.sex ?? null,
    age: data.age ?? null,
    ...birth,
    attributes: statsBlock
      ? Object.fromEntries(statList.map((s) => [s.id, data.attributes?.[s.id] ?? cfg(statsBlock).min]))
      : Object.fromEntries(statList.map((s) => [s.id, RULES.statMin])),
    honor: RULES.honor.start,
    custom_fields: publicFields,
    activated_at: new Date().toISOString(),
  };
  if (has("aspetto")) update.appearance = data.appearance?.trim() || null;
  if (houseId) {
    update.house_id = houseId;
    update.house_role_id = data.house_role_id;
  }
  if (equipBlock && cfg(equipBlock).keep_change)
    update.coins = ((character.coins as number | null) ?? 0) + Math.max(0, budget - spent); // monete avanzate
  if (claim) update.face_claim = claim;
  for (const f of PHYSICAL_FIELDS)
    if (physicalFields.includes(f.id)) update[f.id] = data[f.id]?.trim().slice(0, f.max) || null;
  const { error } = await admin.from("characters").update(update).eq("id", characterId).eq("status", "revisione");
  if (error)
    return {
      error: error.code === "23505" ? "Questo prestavolto è già usato da un altro personaggio." : "Approvazione non riuscita, riprova.",
    };
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

  // Equipaggiamento di partenza (nasce del livello dell'oggetto)
  if (itemIds.length)
    await admin
      .from("character_items")
      .insert(itemIds.map((item_id) => ({ character_id: characterId, item_id, source: "iscrizione" })));

  // Risposta nel ticket (che si chiude) e messaggio di SISTEMA al giocatore
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const staffName = (profile?.username as string | undefined) ?? "Staff";
  const { data: ch } = await admin.from("characters").select("review_ticket_id").eq("id", characterId).maybeSingle();
  if (ch?.review_ticket_id) {
    await admin.from("ticket_messages").insert({
      ticket_id: ch.review_ticket_id,
      author_id: user.id,
      author_name: staffName,
      from_staff: true,
      body: "<p><strong>Personaggio approvato.</strong> Benvenuto in gioco!</p>",
    });
    await admin
      .from("tickets")
      .update({ status: "chiuso", last_message_at: new Date().toISOString(), last_author_name: staffName })
      .eq("id", ch.review_ticket_id);
  }
  await admin.rpc("send_system_message", {
    p_character: characterId,
    p_body: "Il tuo personaggio è stato approvato: da adesso puoi giocare nelle chat. Buon gioco!",
  });

  revalidatePath("/", "layout");
  return {};
}

// L'admin resetta un PG: torna in creazione da capo (bozza vuota), perde le
// scelte della creazione e quello che ne derivava. Restano nome, immagini,
// messaggi e cronologia
export async function resetCharacter(characterId: string): Promise<CreationResult> {
  const { isAdmin } = await getStaffContext();
  if (!isAdmin) return { error: "Solo gli admin possono resettare un personaggio." };
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." };

  const { data: character } = await admin.from("characters").select("id").eq("id", characterId).maybeSingle();
  if (!character) return { error: "Personaggio non trovato." };

  // il drago torna libero per la casata
  await admin.from("dragons").update({ rider_id: null }).eq("rider_id", characterId);
  await Promise.all([
    admin.from("character_drafts").delete().eq("character_id", characterId),
    admin.from("character_skills").delete().eq("character_id", characterId),
    admin.from("character_traits").delete().eq("character_id", characterId),
    admin.from("character_items").delete().eq("character_id", characterId),
    admin.from("character_backgrounds").delete().eq("character_id", characterId),
    admin.from("character_private_fields").delete().eq("character_id", characterId),
    admin.from("pregnancies").delete().eq("character_id", characterId),
  ]);
  const { error } = await admin
    .from("characters")
    .update({
      status: "bozza",
      creation_step: 0,
      sex: null,
      age: null,
      birth_day: null,
      birth_month: null,
      birth_year: null,
      attributes: null,
      appearance: null,
      face_claim: null,
      height: null,
      eye_color: null,
      hair_color: null,
      visible_marks: null,
      custom_fields: {},
      house_id: null,
      house_role_id: null,
      px: 0,
      coins: 0,
      resources: 0,
      honor: RULES.honor.start,
      hp_current: null,
      stamina_current: null,
      marital_status: null,
      partner_character_id: null,
      partner_npc: null,
      activated_at: null,
      sheet_unlocks: [],
    })
    .eq("id", characterId);
  if (error) return { error: "Reset non riuscito: " + error.message.slice(0, 100) };
  await admin.rpc("send_system_message", {
    p_character: characterId,
    p_body: "Il tuo personaggio è stato resettato dallo staff: rifai la creazione dalla scheda e inviala in approvazione.",
  });
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
