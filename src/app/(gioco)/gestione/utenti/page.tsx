import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import UsersManager, { type UserRow } from "./UsersManager";

type Profile = {
  id: string;
  username: string;
  role: string;
  banned_until: string | null;
  ban_reason: string;
  staff_role: { name: string; color: string } | null;
};
type Pg = { id: string; name: string; owner_id: string; status: string; created_at: string; house: { name: string } | null };

export default async function UtentiPage() {
  const { user, isAdmin } = await requirePermission("utenti.gestire");
  const admin = createAdminClient();
  if (!admin) return <p className="text-red-400">Configurazione del server incompleta.</p>;

  // Email e ultimo accesso stanno nel sistema di accesso: si leggono solo dal server
  const accounts: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    accounts.push(...(data?.users ?? []));
    if ((data?.users?.length ?? 0) < 1000) break;
  }
  const [{ data: profiles }, { data: pgs }] = await Promise.all([
    admin.from("profiles").select("id, username, role, banned_until, ban_reason, staff_role:staff_roles(name, color)"),
    admin.from("characters").select("id, name, owner_id, status, created_at, house:houses(name)").order("created_at"),
  ]);

  const rows: UserRow[] = accounts.map((a) => {
    const p = (profiles as unknown as Profile[] | null)?.find((x) => x.id === a.id);
    const main = (pgs as unknown as Pg[] | null)?.find((c) => c.owner_id === a.id) ?? null;
    return {
      id: a.id,
      email: a.email ?? "",
      createdAt: a.created_at,
      lastSignIn: a.last_sign_in_at ?? null,
      username: p?.username ?? "",
      role: p?.role ?? "player",
      staffRole: p?.staff_role ?? null,
      bannedUntil: p?.banned_until ?? null,
      banReason: p?.ban_reason ?? "",
      character: main ? { id: main.id, name: main.name, status: main.status, house: main.house?.name ?? null } : null,
    };
  });
  rows.sort((a, b) => (a.character?.name ?? a.username).localeCompare(b.character?.name ?? b.username));

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Utenti" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Utenti</h1>
      <UsersManager rows={rows} myId={user.id} iAmAdmin={isAdmin} />
    </div>
  );
}
