import Link from "next/link";
import { notFound } from "next/navigation";
import { GameArea } from "@/components/game/GameShell";
import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import LogViewer from "./LogViewer";

type RoomRow = { id: string; name: string; location: { name: string } | null };

export default async function LogPage() {
  const { permissions } = await getStaffContext();
  const canChat = permissions.has("chat.log");
  const canMessages = permissions.has("messaggi.log");
  if (!canChat && !canMessages) notFound();

  const admin = createAdminClient();
  if (!admin) return <p className="text-red-400">Configurazione del server incompleta.</p>;
  const { data } = canChat ? await admin.from("rooms").select("id, name, location:locations(name)") : { data: [] };
  const rooms = ((data ?? []) as unknown as RoomRow[])
    .map((r) => ({ id: r.id, label: `${r.location?.name ?? "—"} · ${r.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Log" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Log</h1>
      <LogViewer canChat={canChat} canMessages={canMessages} rooms={rooms} />
    </div>
  );
}
