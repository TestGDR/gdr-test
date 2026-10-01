"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ACCESS_COOKIE, getClientIp, logAccess, type AccessEvent } from "@/lib/access-log";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import { LEGAL_VERSION } from "@/lib/legal";
import { sendWelcomeEmail } from "@/lib/mailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

const LOGIN_ERROR = "Nome del personaggio o password non corretti.";

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

// Dal nome del personaggio risale all'email dell'account (Supabase accede solo via email)
async function emailFromCharacterName(rawName: string): Promise<string | null> {
  const name = normalizeCharacterName(rawName);
  // Il formato valido esclude anche % e _, che in ilike farebbero da jolly
  if (validateCharacterName(name)) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const { data: character } = await admin
    .from("characters")
    .select("owner_id")
    .ilike("name", name)
    .maybeSingle();
  if (!character) return null;

  const { data } = await admin.auth.admin.getUserById(character.owner_id);
  return data.user?.email ?? null;
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Si accede con il nome del personaggio; l'email resta accettata come alternativa
  const email = identifier.includes("@") ? identifier : await emailFromCharacterName(identifier);
  if (!email) return { error: LOGIN_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Devi prima confermare l'email: controlla la tua casella di posta." };
    }
    return { error: LOGIN_ERROR };
  }
  await recordAccess(data.user.id, "login");
  redirect("/mappa");
}

const REQUIRED_CONSENTS = [
  "accept_disclaimer",
  "accept_terms",
  "accept_privacy",
  "accept_adult",
] as const;

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const characterName = normalizeCharacterName(String(formData.get("character_name") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // I controlli nel browser si possono aggirare: si ripetono tutti qui
  if (REQUIRED_CONSENTS.some((key) => formData.get(key) !== "on")) {
    return { error: "Devi accettare tutte le condizioni per registrarti." };
  }

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
      data: {
        character_name: characterName,
        terms_version: LEGAL_VERSION,
        adult_declared: "true",
      },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    // Il trigger del database fallisce se il nome e' stato preso nel frattempo
    if (error.message.includes("Database error")) {
      return { error: "Questo nome è già usato da un altro personaggio." };
    }
    if (error.code === "weak_password") return { error: "Password troppo debole." };
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: "Esiste già un account con questa email. Usa \"Password dimenticata?\" se non ricordi la password." };
    }
    return { error: error.message };
  }

  // Email gia' registrata: Supabase restituisce un utente fittizio senza identita'
  // (per non rivelare quali email esistono) e non crea nulla.
  const isNewUser = (data.user?.identities?.length ?? 0) > 0;
  if (data.user && isNewUser) {
    await recordAccess(data.user.id, "iscrizione");
    after(() => sendWelcomeEmail({ to: email, characterName, siteUrl: origin ?? "" }));
  }

  // Se la conferma email e' disattivata su Supabase, l'utente e' gia' loggato
  if (data.session) redirect("/mappa");
  return { message: "Iscrizione completata! Controlla la tua email per confermare l'account." };
}

// Recupero password: accetta nome del personaggio o email. La risposta e' sempre la
// stessa, per non rivelare quali account esistono.
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const done = {
    message:
      "Se l'account esiste, ti abbiamo inviato un'email con il link per reimpostare la password.",
  };

  const email = identifier.includes("@") ? identifier : await emailFromCharacterName(identifier);
  if (!email) return done;

  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reimposta-password`,
  });
  if (error?.status === 429) {
    return { error: "Troppe richieste in poco tempo. Riprova tra qualche minuto." };
  }
  return done;
}

// Nuova password, dopo aver aperto il link ricevuto via email
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { supabase } = await requireUser();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };
  if (password !== formData.get("password_confirm")) {
    return { error: "Le due password non coincidono." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") {
      return { error: "La nuova password deve essere diversa da quella attuale." };
    }
    return { error: error.message };
  }
  redirect("/mappa");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACCESS_COOKIE);
  redirect("/");
}
