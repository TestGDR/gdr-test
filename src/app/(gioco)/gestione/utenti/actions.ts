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

// Nome utente, email e nome del personaggio principale
export async function updateUser(
  id: string,
  values: { username: string; email: string; characterId: string | null; characterName: string },
): Promise<UserResult> {
  const g = await guard(id);
  if ("error" in g) return { error: g.error };
  const { admin } = g;

  const username = values.username.trim();
  if (username.length < 3 || username.length > 30) return { error: "Il nome utente deve avere da 3 a 30 caratteri." };
  const { error: e1 } = await admin.from("profiles").update({ username }).eq("id", id);
  if (e1) return { error: e1.code === "23505" ? "Nome utente già in uso." : "Salvataggio del nome utente non riuscito." };

  const email = values.email.trim().toLowerCase();
  const { data: current } = await admin.auth.admin.getUserById(id);
  if (email && email !== current.user?.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email non valida." };
    const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) return { error: "Email non aggiornata: forse è già usata da un altro account." };
  }

  if (values.characterId) {
    const name = normalizeCharacterName(values.characterName);
    const nameError = validateCharacterName(name);
    if (nameError) return { error: nameError };
    const { error } = await admin.from("characters").update({ name }).eq("id", values.characterId).eq("owner_id", id);
    if (error) return { error: error.code === "23505" ? "Esiste già un personaggio con questo nome." : "Nome del personaggio non salvato." };
  }
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
