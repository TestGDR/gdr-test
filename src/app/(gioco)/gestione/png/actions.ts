"use server";

import { RULES } from "@/lib/rules/config";
import { skillLevelCap } from "@/lib/rules/engine";
import { loadStats } from "@/lib/rules/stats";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type NpcInput = {
  id?: string;
  name: string;
  sex: "uomo" | "donna";
  age: number;
  description: string; // note per lo staff
  appearance: string;
  story: string;
  avatar_url: string | null;
  attributes: Record<string, number>;
  skills: Record<string, number>; // id abilita' -> livello
  traits: { trait_id: string; choice: string | null }[];
  house_id: string | null; // casata (crea o sposta il PNG di casata collegato)
  house_npc_id: string | null; // PNG di casata di cui questa e' la scheda
  manager_id: string | null; // affidato a (vuoto = lo muove chiunque abbia il permesso)
};

async function staff() {
  const { permissions, supabase } = await getStaffContext();
  if (!permissions.has("png.gestire"))
    return { error: "Non hai il permesso di gestire i PNG." } as const;
  const admin = createAdminClient();
  if (!admin)
    return { error: "Configurazione del server incompleta." } as const;
  // houses: le tabelle delle casate si scrivono con l'utente (il server non
  // ne ha il permesso); serve anche il permesso Casate
  return { admin, houses: supabase } as const;
}

function message(error: { code?: string; message: string }) {
  if (error.code === "23505")
    return "Esiste già un personaggio con questo nome.";
  if (error.code === "42501")
    return "Per assegnare una casata a un PNG serve anche il permesso di gestire le Casate.";
  if (error.code === "42703" || error.code === "23502")
    return "Prima vanno eseguite le migrazioni 0113 e 0114 in Supabase.";
  return error.message.length < 160
    ? error.message
    : "Salvataggio non riuscito.";
}

// Crea o aggiorna un PNG: anagrafica, casata, statistiche, abilita', tratti, storia
export async function saveNpc(
  input: NpcInput,
): Promise<{ error?: string; id?: string }> {
  const ctx = await staff();
  if ("error" in ctx) return { error: ctx.error };
  const { admin, houses } = ctx;

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40)
    return { error: "Il nome deve avere tra 2 e 40 lettere." };
  if (input.sex !== "uomo" && input.sex !== "donna")
    return { error: "Scegli il sesso." };
  const age = Math.trunc(Number(input.age));
  if (!(age >= 1 && age <= 120)) return { error: "Età non valida." };
  const avatar = input.avatar_url?.trim() || null;
  if (avatar && !avatar.startsWith("https://"))
    return { error: "L'immagine deve iniziare con https://" };

  const stats = await loadStats(admin);
  const attributes: Record<string, number> = {};
  for (const s of stats)
    attributes[s.id] = Math.min(
      RULES.statMax,
      Math.max(RULES.statMin, Math.trunc(Number(input.attributes[s.id])) || 0),
    );

  // PNG gia' esistente: e' davvero un PNG, e a quale PNG di casata e' collegato
  let id = input.id;
  let linked: string | null = null;
  if (id) {
    const { data: existing } = await admin
      .from("characters")
      .select("is_npc, house_npc_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing?.is_npc) return { error: "PNG non trovato." };
    linked = (existing.house_npc_id as string | null) ?? null;
  }

  // Casata: il PNG e' anche tra i PNG della casata (quelli dell'albero)
  let houseNpcId = input.house_npc_id ?? linked;
  if (houseNpcId) {
    const { data: hn } = await houses
      .from("house_npcs")
      .select("id, house_id")
      .eq("id", houseNpcId)
      .maybeSingle();
    if (!hn) houseNpcId = null;
    else if (!input.house_id) {
      // casata tolta: la scheda si scollega (il PNG resta nella casata)
      houseNpcId = null;
    } else if (hn.house_id !== input.house_id) {
      // spostato in un'altra casata: il ruolo di prima non vale piu'
      const { error } = await houses
        .from("house_npcs")
        .update({ house_id: input.house_id, house_role_id: null })
        .eq("id", houseNpcId);
      if (error) return { error: message(error) };
    }
  }
  if (!houseNpcId && input.house_id) {
    const { data: created, error } = await houses
      .from("house_npcs")
      .insert({ house_id: input.house_id, name })
      .select("id")
      .single();
    if (error) return { error: message(error) };
    houseNpcId = created.id as string;
  }

  const row = {
    name,
    sex: input.sex,
    age,
    description: input.description.trim().slice(0, 4000),
    appearance: input.appearance.trim().slice(0, 20000) || null,
    avatar_url: avatar,
    attributes,
    house_npc_id: houseNpcId,
    npc_manager_id: input.manager_id || null,
  };
  if (id) {
    const { error } = await admin.from("characters").update(row).eq("id", id);
    if (error) return { error: message(error) };
  } else {
    const { data, error } = await admin
      .from("characters")
      .insert({ ...row, is_npc: true, owner_id: null, status: "attivo" })
      .select("id")
      .single();
    if (error) return { error: message(error) };
    id = data.id as string;
  }

  // il PNG di casata collegato segue nome e immagine della scheda
  if (houseNpcId) {
    await houses
      .from("house_npcs")
      .update(avatar ? { name, image_url: avatar } : { name })
      .eq("id", houseNpcId);
    await houses
      .from("house_family_members")
      .update({ name })
      .eq("npc_id", houseNpcId);
  }

  // abilita': mai oltre il valore della statistica
  const { data: skills } = await admin.from("skills").select("id, stat");
  const levels = (skills ?? [])
    .map((s) => ({
      character_id: id!,
      skill_id: s.id as string,
      level: Math.min(
        skillLevelCap(attributes[s.stat as string] ?? RULES.statMin),
        Math.max(0, Math.trunc(Number(input.skills[s.id as string])) || 0),
      ),
    }))
    .filter((l) => l.level > 0);
  await admin.from("character_skills").delete().eq("character_id", id);
  if (levels.length) {
    const { error } = await admin.from("character_skills").insert(levels);
    if (error) return { error: message(error) };
  }

  // vantaggi e svantaggi
  const { data: catalog } = await admin.from("traits").select("id, choice");
  const traits = input.traits
    .filter((t) => (catalog ?? []).some((c) => c.id === t.trait_id))
    .filter(
      (t, i, list) => list.findIndex((x) => x.trait_id === t.trait_id) === i,
    )
    .map((t) => {
      const needs =
        (catalog ?? []).find((c) => c.id === t.trait_id)?.choice !== "nessuna";
      return {
        character_id: id!,
        trait_id: t.trait_id,
        choice: needs ? (t.choice ?? "").slice(0, 60) || null : null,
      };
    });
  await admin.from("character_traits").delete().eq("character_id", id);
  if (traits.length) {
    const { error } = await admin.from("character_traits").insert(traits);
    if (error) return { error: message(error) };
  }

  // storia (per i PNG e' subito approvata: la scrive lo staff)
  const story = input.story.trim().slice(0, 4000);
  const now = new Date().toISOString();
  const { error: storyError } = await admin
    .from("character_backgrounds")
    .upsert({
      character_id: id,
      body: story,
      submitted_at: now,
      approved_at: now,
    });
  if (storyError) return { error: message(storyError) };

  return { id };
}

// Storia e tratti di un PNG (la storia la legge solo chi ha il permesso apposito:
// qui la carica il server per chi gestisce i PNG)
export async function loadNpcExtra(id: string): Promise<{
  story: string;
  traits: { trait_id: string; choice: string | null }[];
}> {
  const ctx = await staff();
  if ("error" in ctx) return { story: "", traits: [] };
  const [{ data: bg }, { data: tr }] = await Promise.all([
    ctx.admin
      .from("character_backgrounds")
      .select("body")
      .eq("character_id", id)
      .maybeSingle(),
    ctx.admin
      .from("character_traits")
      .select("trait_id, choice")
      .eq("character_id", id),
  ]);
  return {
    story: (bg?.body as string | undefined) ?? "",
    traits: (tr ?? []) as { trait_id: string; choice: string | null }[],
  };
}

// Elimina la scheda del PNG (se era un PNG di casata, quello resta nella casata)
export async function deleteNpc(id: string): Promise<{ error?: string }> {
  const ctx = await staff();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.admin
    .from("characters")
    .delete()
    .eq("id", id)
    .eq("is_npc", true);
  return error ? { error: message(error) } : {};
}

// Riporta il PNG in piena salute: PF e Stamina pieni, niente ferite, vivo
export async function healNpc(id: string): Promise<{ error?: string }> {
  const ctx = await staff();
  if ("error" in ctx) return { error: ctx.error };
  const { admin } = ctx;
  const { error } = await admin
    .from("characters")
    .update({
      hp_current: null,
      stamina_current: null,
      dead_at: null,
      dying_since: null,
      dying_round: 0,
      dying_save_due: false,
      stabilized_at: null,
      stunned: false,
    })
    .eq("id", id)
    .eq("is_npc", true);
  if (error) return { error: message(error) };
  await admin.from("character_wounds").delete().eq("character_id", id);
  return {};
}

// Da' un oggetto del catalogo al PNG
export async function addNpcItem(
  npcId: string,
  itemId: string,
): Promise<{ error?: string }> {
  const ctx = await staff();
  if ("error" in ctx) return { error: ctx.error };
  const { data: npc } = await ctx.admin
    .from("characters")
    .select("is_npc")
    .eq("id", npcId)
    .maybeSingle();
  if (!npc?.is_npc) return { error: "PNG non trovato." };
  const { error } = await ctx.admin
    .from("character_items")
    .insert({ character_id: npcId, item_id: itemId, source: "staff" });
  return error ? { error: message(error) } : {};
}

// Toglie un oggetto al PNG
export async function removeNpcItem(
  npcId: string,
  characterItemId: string,
): Promise<{ error?: string }> {
  const ctx = await staff();
  if ("error" in ctx) return { error: ctx.error };
  const { data: npc } = await ctx.admin
    .from("characters")
    .select("is_npc")
    .eq("id", npcId)
    .maybeSingle();
  if (!npc?.is_npc) return { error: "PNG non trovato." };
  const { error } = await ctx.admin
    .from("character_items")
    .delete()
    .eq("id", characterItemId)
    .eq("character_id", npcId);
  return error ? { error: message(error) } : {};
}
