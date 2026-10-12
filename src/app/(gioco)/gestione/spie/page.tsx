import Link from "next/link";
import { notFound } from "next/navigation";
import { GameArea } from "@/components/game/GameShell";
import { getStaffContext } from "@/lib/staff";
import SpiesManager from "./SpiesManager";

// Missioni delle spie: chi narra o modera (master, moderatori, admin)
export default async function SpiePage() {
  const { permissions } = await getStaffContext();
  if (!permissions.has("chat.narrazione") && !permissions.has("chat.moderare")) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title="Spie" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Spie</h1>
      <SpiesManager canRules={permissions.has("regole.gestire")} />
    </div>
  );
}
