"use server";

import { revalidatePath } from "next/cache";
import { isPermissionKey } from "@/lib/permissions";
import { ADMIN_CHOICE, PLAYER_CHOICE } from "@/lib/role-choices";
import { getStaffContext } from "@/lib/staff";

export type RoleResult = { error?: string; id?: string };

export type RoleInput = {
  id?: string;
  name: string;
  description: string;
  color: string;
  permissions: string[];
};

// Ogni azione ricontrolla il permesso (le regole del database lo rifarebbero comunque)
async function authorized() {
  const ctx = await getStaffContext();
  return ctx.permissions.has("gestione.ruoli") ? ctx : null;
}

export async function saveRole(input: RoleInput): Promise<RoleResult> {
  const ctx = await authorized();
  if (!ctx) return { error: "Non hai il permesso di gestire i ruoli." };

  const name = input.name.trim().replace(/\s+/g, " ");
  const description = input.description.trim().slice(0, 200);
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : "#e2622d";
  // Solo permessi esistenti nel catalogo, senza doppioni
  const permissions = [...new Set(input.permissions.filter(isPermissionKey))];

  if (name.length < 2 || name.length > 40) return { error: "Il nome deve avere tra 2 e 40 caratteri." };

  const row = { name, description, color, permissions };
  const { data, error } = input.id
    ? await ctx.supabase.from("staff_roles").update(row).eq("id", input.id).select("id").single()
    : await ctx.supabase.from("staff_roles").insert(row).select("id").single();

  if (error) {
    if (error.code === "23505") return { error: "Esiste già un ruolo con questo nome." };
    return { error: "Salvataggio non riuscito." };
  }
  revalidatePath("/", "layout");
  return { id: data.id };
}

export async function deleteRole(id: string): Promise<RoleResult> {
  const ctx = await authorized();
  if (!ctx) return { error: "Non hai il permesso di gestire i ruoli." };

  // Gli utenti con questo ruolo tornano semplici giocatori (on delete set null)
  const { error } = await ctx.supabase.from("staff_roles").delete().eq("id", id);
  if (error) return { error: "Eliminazione non riuscita." };
  revalidatePath("/", "layout");
  return {};
}

// Scelta dal menu "Assegna ruoli": Admin, Giocatore o id di un ruolo staff
export async function assignRole(userId: string, choice: string): Promise<RoleResult> {
  const ctx = await authorized();
  if (!ctx) return { error: "Non hai il permesso di gestire i ruoli." };

  const { data: target } = await ctx.supabase.from("profiles").select("role").eq("id", userId).single();
  const targetIsAdmin = target?.role === "admin";

  // Il database ricontrolla tutto: solo un admin nomina/toglie admin, e ne resta sempre uno
  if (choice === ADMIN_CHOICE) {
    if (!targetIsAdmin) {
      const { error } = await ctx.supabase.rpc("set_admin", { target: userId, value: true });
      if (error) return { error: error.message };
    }
  } else {
    if (targetIsAdmin) {
      const { error } = await ctx.supabase.rpc("set_admin", { target: userId, value: false });
      if (error) return { error: error.message };
    }
    const { error } = await ctx.supabase.rpc("assign_staff_role", {
      target: userId,
      role_id: choice === PLAYER_CHOICE ? null : choice,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  return {};
}
