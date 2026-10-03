"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

// Periodi selezionabili: "piu' vecchi di..."
const DAYS: Record<string, number> = { "7g": 7, "1m": 30, "3m": 90, "6m": 182, "1a": 365 };

export type CleanResult = { error?: string; count?: number };
export type InactiveUser = { id: string; name: string; lastActivity: string | null; rider: boolean };

async function authorized() {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has("manutenzione.sito")) return null;
  const admin = createAdminClient();
  return admin ? { ctx, admin } : null;
}

const cutoff = (period: string) => {
  const days = DAYS[period];
  return days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
};

// ---------------------------------------------------------------------
// Messaggi delle chat
// ---------------------------------------------------------------------
export async function countChatMessages(period: string): Promise<CleanResult> {
  const a = await authorized();
  const before = cutoff(period);
  if (!a || !before) return { error: "Operazione non permessa." };
  const { count, error } = await a.admin.from("messages").select("id", { count: "exact", head: true }).lt("created_at", before);
  return error ? { error: "Conteggio non riuscito." } : { count: count ?? 0 };
}

export async function deleteChatMessages(period: string): Promise<CleanResult> {
  const a = await authorized();
  const before = cutoff(period);
  if (!a || !before) return { error: "Operazione non permessa." };
  const { count, error } = await a.admin.from("messages").delete({ count: "exact" }).lt("created_at", before);
  if (error) return { error: "Pulizia non riuscita." };
  revalidatePath("/", "layout");
  return { count: count ?? 0 };
}

// ---------------------------------------------------------------------
// Missive (in gioco) e messaggi OFF
// ---------------------------------------------------------------------
const KINDS: Record<string, string[]> = { missiva: ["missiva"], off: ["off"], entrambi: ["missiva", "off"] };

export async function countPrivateMessages(period: string, kind: string): Promise<CleanResult> {
  const a = await authorized();
  const before = cutoff(period);
  if (!a || !before || !KINDS[kind]) return { error: "Operazione non permessa." };
  const { count, error } = await a.admin
    .from("private_messages")
    .select("id", { count: "exact", head: true })
    .lt("created_at", before)
    .in("kind", KINDS[kind]);
  return error ? { error: "Conteggio non riuscito." } : { count: count ?? 0 };
}

export async function deletePrivateMessages(period: string, kind: string): Promise<CleanResult> {
  const a = await authorized();
  const before = cutoff(period);
  if (!a || !before || !KINDS[kind]) return { error: "Operazione non permessa." };
  const { count, error } = await a.admin.from("private_messages").delete({ count: "exact" }).lt("created_at", before).in("kind", KINDS[kind]);
  if (error) return { error: "Pulizia non riuscita." };
  revalidatePath("/", "layout");
  return { count: count ?? 0 };
}

// ---------------------------------------------------------------------
// Account inattivi: nessun accesso e nessuna azione nel sito dal periodo
// scelto. Staff e admin non si toccano mai.
// ---------------------------------------------------------------------
async function findInactive(a: NonNullable<Awaited<ReturnType<typeof authorized>>>, before: string): Promise<InactiveUser[]> {
  const accounts: { id: string; created_at: string; last_sign_in_at?: string | null }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await a.admin.auth.admin.listUsers({ page, perPage: 1000 });
    accounts.push(...(data?.users ?? []).map((u) => ({ id: u.id, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })));
    if ((data?.users?.length ?? 0) < 1000) break;
  }
  const [{ data: profiles }, { data: online }, { data: pgs }, { data: dragons }] = await Promise.all([
    a.admin.from("profiles").select("id, username, role, staff_role_id"),
    a.admin.from("online_status").select("user_id, last_action"),
    a.admin.from("characters").select("id, name, owner_id").order("created_at"),
    a.admin.from("dragons").select("rider_id").not("rider_id", "is", null),
  ]);
  const riders = new Set((dragons ?? []).map((d) => d.rider_id));
  const limit = Date.parse(before);
  const out: InactiveUser[] = [];
  for (const acc of accounts) {
    const p = profiles?.find((x) => x.id === acc.id);
    if (!p || acc.id === a.ctx.user.id || p.role === "admin" || p.staff_role_id) continue; // staff e admin esclusi
    const times = [acc.created_at, acc.last_sign_in_at, online?.find((o) => o.user_id === acc.id)?.last_action]
      .filter(Boolean)
      .map((t) => Date.parse(t as string));
    const last = Math.max(...times);
    if (last >= limit) continue;
    const myPgs = (pgs ?? []).filter((c) => c.owner_id === acc.id);
    out.push({
      id: acc.id,
      name: myPgs[0]?.name ?? p.username,
      lastActivity: Number.isFinite(last) ? new Date(last).toISOString() : null,
      rider: myPgs.some((c) => riders.has(c.id)),
    });
  }
  return out.sort((x, y) => (x.lastActivity ?? "").localeCompare(y.lastActivity ?? ""));
}

export async function listInactive(period: string): Promise<{ error?: string; users?: InactiveUser[] }> {
  const a = await authorized();
  const before = cutoff(period);
  if (!a || !before) return { error: "Operazione non permessa." };
  return { users: await findInactive(a, before) };
}

// Elimina gli account indicati, ricontrollando che siano davvero inattivi
export async function deleteInactive(period: string, ids: string[]): Promise<CleanResult> {
  const a = await authorized();
  const before = cutoff(period);
  if (!a || !before) return { error: "Operazione non permessa." };
  const allowed = new Set((await findInactive(a, before)).map((u) => u.id));
  let count = 0;
  for (const id of ids) {
    if (!allowed.has(id)) continue;
    // account, profilo e personaggi; i draghi restano senza cavaliere
    const { error } = await a.admin.auth.admin.deleteUser(id);
    if (!error) count++;
  }
  revalidatePath("/", "layout");
  return { count };
}
