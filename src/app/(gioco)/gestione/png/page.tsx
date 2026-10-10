import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Character } from "@/lib/types";
import NpcManager, { type HouseNpc, type StaffUser } from "./NpcManager";

export default async function PngPage() {
  const { supabase } = await requirePermission("png.gestire");
  const [npcs, houses, houseNpcs] = await Promise.all([
    supabase.from("characters").select("*").eq("is_npc", true).order("name"),
    supabase.from("houses").select("id, name").order("name"),
    supabase
      .from("house_npcs")
      .select("id, name, house_id, image_url, deceased")
      .order("name"),
  ]);

  // Chi puo' muovere i PNG: per affidarne uno a una persona precisa
  const admin = createAdminClient();
  const { data: profiles } = admin
    ? await admin
        .from("profiles")
        .select("id, username, role, staff_role:staff_roles(name, permissions)")
    : { data: [] };
  const staff: StaffUser[] = (
    (profiles ?? []) as unknown as {
      id: string;
      username: string | null;
      role: string;
      staff_role: { name: string; permissions: string[] } | null;
    }[]
  )
    .filter(
      (p) =>
        p.role === "admin" ||
        p.staff_role?.permissions?.includes("png.gestire"),
    )
    .map((p) => ({
      id: p.id,
      name: p.username ?? "—",
      role: p.role === "admin" ? "Admin" : (p.staff_role?.name ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title="PNG" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">
        Anagrafe dei PNG
      </h1>
      <p className="mb-5 text-sm text-muted">
        I personaggi non giocanti hanno la stessa scheda dei PG: statistiche,
        abilità, vantaggi e svantaggi, oggetti, Punti ferita, aspetto e storia.
        Qui compaiono anche i PNG creati nelle Casate (quelli dell&apos;albero
        genealogico), da compilare. In chat li porta in giocata e li muove chi
        ha questo permesso; i giocatori ne vedono solo il nome e le azioni.
      </p>
      {npcs.error ? (
        <p className="text-sm text-red-400">
          Prima vanno eseguite le migrazioni 0113 e 0114 in Supabase.
        </p>
      ) : (
        <NpcManager
          npcs={(npcs.data ?? []) as Character[]}
          houses={(houses.data ?? []) as { id: string; name: string }[]}
          houseNpcs={(houseNpcs.data ?? []) as HouseNpc[]}
          staff={staff}
        />
      )}
    </div>
  );
}
