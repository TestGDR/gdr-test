import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import type { FamilyMember, House, HouseMember, HouseNpc, HouseRole } from "@/lib/houses";
import { requirePermission } from "@/lib/staff";
import HousesManager from "./HousesManager";

export default async function CasatePage() {
  const { supabase } = await requirePermission("casate.gestire");

  const [houses, roles, family, npcs, members] = await Promise.all([
    supabase.from("houses").select("*").order("sort_order").order("name"),
    supabase.from("house_roles").select("*").order("sort_order").order("name"),
    supabase.from("house_family_members").select("*").order("sort_order").order("name"),
    supabase.from("house_npcs").select("*").order("sort_order").order("name"),
    supabase
      .from("characters")
      .select("id, name, status, house_id, house_role_id")
      .not("house_id", "is", null)
      .order("name"),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Casate" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Casate</h1>
      <HousesManager
        houses={(houses.data ?? []) as House[]}
        roles={(roles.data ?? []) as HouseRole[]}
        family={(family.data ?? []) as FamilyMember[]}
        npcs={(npcs.data ?? []) as HouseNpc[]}
        members={(members.data ?? []) as HouseMember[]}
      />
    </div>
  );
}
