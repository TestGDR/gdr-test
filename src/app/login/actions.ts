"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ACCESS_COOKIE, getClientIp, logAccess, type AccessEvent } from "@/lib/access-log";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

// Registra IP e verifica VPN dopo aver risposto all'utente, senza rallentarlo
async function recordAccess(userId: string, event: AccessEvent) {
  const h = await headers();
  const ip = getClientIp(h);
  const userAgent = h.get("user-agent");
  if (ip) {
    (await cookies()).set(ACCESS_COOKIE, `${userId}|${ip}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  after(() => logAccess({ userId, event, ip, userAgent }));
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Devi prima confermare l'email: controlla la tua casella di posta." };
    }
    return { error: "Email o password non corretti." };
  }
  await recordAccess(data.user.id, "login");
  redirect("/mappa");
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const characterName = normalizeCharacterName(String(formData.get("character_name") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const nameError = validateCharacterName(characterName);
  if (nameError) return { error: nameError };
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };

  // Controllo preventivo per dare un messaggio chiaro. La garanzia vera e' l'indice
  // univoco nel database, che blocca anche due iscrizioni simultanee con lo stesso nome.
  const admin = createAdminClient();
  if (admin) {
    const { data: taken } = await admin
      .from("characters")
      .select("id")
      .ilike("name", characterName)
      .limit(1);
    if (taken?.length) return { error: "Questo nome è già usato da un altro personaggio." };
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { character_name: characterName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    // Il trigger del database fallisce se il nome e' stato preso nel frattempo
    if (error.message.includes("Database error")) {
      return { error: "Questo nome è già usato da un altro personaggio." };
    }
    if (error.code === "weak_password") return { error: "Password troppo debole." };
    return { error: error.message };
  }

  // Email gia' registrata: Supabase restituisce un utente fittizio senza identita'
  // (per non rivelare quali email esistono) e non crea nulla.
  const isNewUser = (data.user?.identities?.length ?? 0) > 0;
  if (data.user && isNewUser) await recordAccess(data.user.id, "iscrizione");

  // Se la conferma email e' disattivata su Supabase, l'utente e' gia' loggato
  if (data.session) redirect("/personaggi");
  return { message: "Iscrizione completata! Controlla la tua email per confermare l'account." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACCESS_COOKIE);
  redirect("/");
}
