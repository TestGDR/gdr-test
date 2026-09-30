import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import type { Character, Location, Message, Room } from "@/lib/types";
import ChatRoom from "./ChatRoom";

const HISTORY_SIZE = 100;

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  const { data: room } = await supabase
    .from("rooms")
    .select("*, location:locations(*)")
    .eq("id", id)
    .maybeSingle<Room & { location: Location }>();
  if (!room) notFound();

  const [{ data: messages }, { data: characters }, { data: profile }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_SIZE),
    supabase.from("characters").select("*").eq("owner_id", user.id).order("created_at"),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3">
        <Link href={`/luogo/${room.location.id}`} className="text-sm text-muted hover:text-accent">
          ← {room.location.name}
        </Link>
        <h1 className="font-serif text-2xl text-accent">{room.name}</h1>
        {room.description && <p className="text-sm text-muted">{room.description}</p>}
      </div>
      <ChatRoom
        roomId={room.id}
        userId={user.id}
        isStaff={profile?.role === "master" || profile?.role === "admin"}
        characters={(characters ?? []) as Character[]}
        initialMessages={((messages ?? []) as Message[]).reverse()}
      />
    </div>
  );
}
