"use server";

import { revalidatePath } from "next/cache";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserResult = { error?: string };

// Permesso, e regole di sicurezza: mai su se stessi, gli admin solo da un admin
async function guard(targetId: string) {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has("utenti.gestire")) return { error: "Non hai il permesso di gestire gli utenti." } as const;
  if (targetId === ctx.user.id) return { error: "Non puoi farlo sul tuo account." } as const;
  const admin = createAdminClient();
  if (!admin) return { error: "Configurazione del server incompleta." } as const;
  const { data: target } = await admin.from("profiles").select("role").eq("id", targetId).maybeSingle();
  if (!target) return { error: "Utente non trovato." } as const;
  if (target.role === "admin" && !ctx.isAdmin) return { error: "Solo un admin può intervenire su un altro admin." } as const;
  return { ctx, admin } as const;
}

function done(): UserResult {
  revalidatePath("/gestione/utenti");
  return {};
}

// Nome del personaggio: e' anche il nome utente (si entra con quello), quindi
// cambiano insieme. L'email resta riservata all'utente.
export async function renameUser(id: string, characterId: string | null, rawName: string): Promise<UserResult> {
  const g = await guard(id);
  if ("error" in g) return { error: g.error };
  const { admin } = g;

  const name = normalizeCharacterName(rawName);
  const nameError = validateCharacterName(name);
  if (nameError) return { error: nameError };

  if (characterId) {
    const { error } = await admin.from("characters").update({ name }).eq("id", characterId).eq("owner_id", id);
    if (error) return { error: error.code === "23505" ? "Esiste già un personaggio con questo nome." : "Nome non salvato." };
  }
  const { error } = await admin.from("profiles").update({ username: name }).eq("id", id);
  if (error) return { error: error.code === "23505" ? "Questo nome è già in uso." : "Nome non salvato." };
  return done();
}

// Ban: ore = null per un ban permanente
export async function banUser(id: string, hours: number | null, reason: string): Promise<UserResult> {
  const g = await guard(id);
  if ("error" in g) return { error: g.error };
  const { admin } = g;
  const duration = hours === null ? "876000h" : `${Math.max(1, Math.round(hours))}h`;
  // blocca il login (e il rinnovo della sessione) nel sistema di accesso
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: duration });
  if (error) return { error: "Ban non riuscito." };
  const until = hours === null ? "infinity" : new Date(Date.now() + hours * 3600_000).toISOString();
  await admin.from("profiles").update({ banned_until: until, ban_reason: reason.trim().slice(0, 300) }).eq("id", id);
  return done();
}

export async function unbanUser(id: string): Promise<UserResult> {
  const g = await guard(id);
  if ("error" in g) return { error: g.error };
  const { admin } = g;
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (error) return { error: "Sblocco non riuscito." };
  await admin.from("profiles").update({ banned_until: null, ban_reason: "" }).eq("id", id);
  return done();
}

// Eliminazione definitiva: account, profilo, personaggi e tutto cio' che ne dipende
export async function deleteUser(id: string): Promise<UserResult> {
  const g = await guard(id);
  if ("error" in g) return { error: g.error };
  const { error } = await g.admin.auth.admin.deleteUser(id);
  if (error) return { error: "Eliminazione non riuscita." };
  return done();
}
