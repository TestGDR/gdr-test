import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { requireUser } from "@/lib/supabase/server";

export type StaffRole = {
  id: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  permissions: string[];
  system_key: "giocatore" | null; // ruolo di sistema (non eliminabile)
};

// Riga del profilo letta insieme ai permessi (serve anche al layout di gioco:
// cosi' il profilo si legge una volta sola per richiesta)
export type StaffProfile = {
  username: string | null;
  role: string;
  status_text: string | null;
  invisible: boolean | null;
  banned_until: string | null;
  staff_role: StaffRole | null;
};

export type StaffContext = {
  isAdmin: boolean; // super-utente: tutti i permessi
  role: StaffRole | null;
  permissions: Set<string>;
  isStaff: boolean;
  profile: StaffProfile | null;
};

// Ruolo e permessi dell'utente loggato. Le pagine lo usano per mostrare o
// nascondere le funzioni; la sicurezza vera la fanno le regole del database.
// cache(): layout e pagina della stessa richiesta lo calcolano una volta sola
// (i permessi restituiti sono condivisi: vanno solo letti, mai modificati)
export const getStaffContext = cache(
  async (): Promise<StaffContext & Awaited<ReturnType<typeof requireUser>>> => {
    const auth = await requireUser();
    const [{ data }, { data: playerRole }] = await Promise.all([
      auth.supabase
        .from("profiles")
        .select(
          "username, role, status_text, invisible, banned_until, staff_role:staff_roles(id, name, description, color, sort_order, permissions, system_key)",
        )
        .eq("id", auth.user.id)
        .single<StaffProfile>(),
      // I permessi del ruolo Giocatore valgono per tutti
      auth.supabase.from("staff_roles").select("permissions").eq("system_key", "giocatore").maybeSingle(),
    ]);

    // Utente bannato con una sessione ancora aperta: lo si fa uscire subito
    if (isBanned(data?.banned_until ?? null)) redirect("/api/sospeso");

    const isAdmin = data?.role === "admin";
    const role = data?.staff_role ?? null;
    const permissions = new Set(
      isAdmin ? ALL_PERMISSION_KEYS : [...(role?.permissions ?? []), ...(playerRole?.permissions ?? [])],
    );
    return { ...auth, isAdmin, role, permissions, isStaff: isAdmin || role !== null, profile: data ?? null };
  },
);

// Per le pagine riservate: senza il permesso la pagina "non esiste"
export async function requirePermission(permission: string) {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has(permission)) notFound();
  return ctx;
}

// Ban in corso: "infinity" (permanente) oppure una data futura
export function isBanned(bannedUntil: string | null) {
  if (!bannedUntil) return false;
  if (bannedUntil === "infinity") return true;
  const t = new Date(bannedUntil).getTime();
  return Number.isNaN(t) ? true : t > Date.now();
}
