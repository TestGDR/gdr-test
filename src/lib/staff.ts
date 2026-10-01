import "server-only";
import { notFound } from "next/navigation";
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

export type StaffContext = {
  isAdmin: boolean; // super-utente: tutti i permessi
  role: StaffRole | null;
  permissions: Set<string>;
  isStaff: boolean;
};

// Ruolo e permessi dell'utente loggato. Le pagine lo usano per mostrare o
// nascondere le funzioni; la sicurezza vera la fanno le regole del database.
export async function getStaffContext(): Promise<StaffContext & Awaited<ReturnType<typeof requireUser>>> {
  const auth = await requireUser();
  const [{ data }, { data: playerRole }] = await Promise.all([
    auth.supabase
      .from("profiles")
      .select("role, staff_role:staff_roles(id, name, description, color, sort_order, permissions, system_key)")
      .eq("id", auth.user.id)
      .single<{ role: string; staff_role: StaffRole | null }>(),
    // I permessi del ruolo Giocatore valgono per tutti
    auth.supabase.from("staff_roles").select("permissions").eq("system_key", "giocatore").maybeSingle(),
  ]);

  const isAdmin = data?.role === "admin";
  const role = data?.staff_role ?? null;
  const permissions = new Set(
    isAdmin ? ALL_PERMISSION_KEYS : [...(role?.permissions ?? []), ...(playerRole?.permissions ?? [])],
  );
  return { ...auth, isAdmin, role, permissions, isStaff: isAdmin || role !== null };
}

// Per le pagine riservate: senza il permesso la pagina "non esiste"
export async function requirePermission(permission: string) {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has(permission)) notFound();
  return ctx;
}
