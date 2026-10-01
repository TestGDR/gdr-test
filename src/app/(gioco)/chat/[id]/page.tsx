import Link from "next/link";
import { notFound } from "next/navigation";
import InactiveBanner from "@/components/InactiveBanner";
import { GameArea } from "@/components/game/GameShell";
import { getStaffContext } from "@/lib/staff";
import type { Character, Location, Message, Room } from "@/lib/types";
import ChatRoom from "./ChatRoom";

const HISTORY_SIZE = 100;

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const { supabase, user, permissions } = await getStaffContext();

  const { data: room } = await supabase
    .from("rooms")
    .select("*, location:locations(*)")
    .eq("id", id)
    .maybeSingle<Room & { location: Location }>();
  if (!room) notFound();

  const [{ data: messages }, { data: characters }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_SIZE),
    // Solo i personaggi attivi possono giocare (lo impone anche il database)
    supabase
      .from("characters")
      .select("*")
      .eq("owner_id", user.id)
      .eq("status", "attivo")
      .order("created_at"),
  ]);

  if (!characters?.length) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <GameArea title={room.name} image={room.location.image_url} />
        <InactiveBanner />
        <Link href={`/luogo/${room.location.id}`} className="btn-ghost">
          ← Torna a {room.location.name}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <GameArea title={room.name} image={room.location.image_url} />
      <div className="mb-3">
        <Link href={`/luogo/${room.location.id}`} className="text-sm text-muted hover:text-accent">
          ← {room.location.name}
        </Link>
        <h1 className="font-serif text-2xl text-accent">{room.name}</h1>
        {room.description && <p className="text-sm text-muted">{room.description}</p>}
      </div>
      <ChatRoom
        roomId={room.id}
        canNarrate={permissions.has("chat.narrazione")}
        characters={(characters ?? []) as Character[]}
        initialMessages={((messages ?? []) as Message[]).reverse()}
      />
    </div>
  );
}
