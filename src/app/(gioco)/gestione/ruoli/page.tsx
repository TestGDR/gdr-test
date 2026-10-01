import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission, type StaffRole } from "@/lib/staff";
import RolesManager, { type UserRow } from "./RolesManager";

export default async function RuoliPage() {
  const { supabase } = await requirePermission("gestione.ruoli");

  const [{ data: roles }, { data: users }] = await Promise.all([
    supabase.from("staff_roles").select("*").order("sort_order").order("name"),
    supabase.from("profiles").select("id, username, role, staff_role_id").order("username").limit(2000),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Ruoli & Permessi" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Ruoli & Permessi</h1>
      <RolesManager roles={(roles ?? []) as StaffRole[]} users={(users ?? []) as UserRow[]} />
    </div>
  );
}
