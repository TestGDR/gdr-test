import Link from "next/link";
import { notFound } from "next/navigation";
import InactiveBanner from "@/components/InactiveBanner";
import { GameArea } from "@/components/game/GameShell";
import { getStaffContext } from "@/lib/staff";
import type { Character, Location, Message, Room } from "@/lib/types";
import ChatRoom from "./ChatRoom";
import RoomAccessBar, { type Guest } from "./RoomAccessBar";

const HISTORY_SIZE = 100;

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const { supabase, user, permissions } = await getStaffContext();

  // Le chat delle mappe spente non si vedono (regole del database)
  const { data: room } = await supabase
    .from("rooms")
    .select("*, location:locations(*)")
    .eq("id", id)
    .maybeSingle<Room & { location: Location }>();
  if (!room) notFound();

  const back = `/mappa?id=${room.location.map_id}&luogo=${room.location.id}`;
  const image = room.image_url ?? room.location.image_url;
  const isPrivate = room.access !== "pubblica";

  const [{ data: canEnter }, { data: controller }, { data: house }, { data: rental }, { data: guests }] = await Promise.all([
    supabase.rpc("can_enter_room", { r: id }),
    isPrivate ? supabase.rpc("room_controller", { r: id }) : Promise.resolve({ data: null }),
    room.house_id ? supabase.from("houses").select("name").eq("id", room.house_id).maybeSingle() : Promise.resolve({ data: null }),
    room.access === "affitto"
      ? supabase
          .from("room_rentals")
          .select("ends_at, character:characters(name)")
          .eq("room_id", id)
          .gt("ends_at", new Date().toISOString())
          .order("ends_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ ends_at: string; character: { name: string } | null }>()
      : Promise.resolve({ data: null }),
    isPrivate
      ? supabase.from("room_guests").select("character:characters(id, name)").eq("room_id", id).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);

  const header = (
    <div className="mb-3">
      <Link href={back} className="text-sm text-muted hover:text-accent">
        ← {room.location.name}
      </Link>
      <h1 className="font-serif text-2xl text-accent">
        {isPrivate && <span title="Chat privata">🔒 </span>}
        {room.name}
      </h1>
      {room.description && <p className="text-sm text-muted">{room.description}</p>}
    </div>
  );

  if (!canEnter) {
    return (
      <div className="mx-auto mt-6 max-w-xl text-center">
        <GameArea title={room.name} image={image} description={room.description} />
        {header}
        <p className="panel text-muted">
          {room.access === "casata"
            ? `Questa è una chat privata della casata ${house?.name ?? ""}: entrano solo i suoi membri e chi viene invitato.`
            : rental
              ? "Questa stanza è affittata da un altro personaggio: entra solo chi viene invitato."
              : "Questa stanza è libera: puoi affittarla da Utility → Prenota stanza."}
        </p>
      </div>
    );
  }

  const [{ data: messages }, { data: characters }] = await Promise.all([
    supabase.from("messages").select("*").eq("room_id", id).order("created_at", { ascending: false }).limit(HISTORY_SIZE),
    // Solo i personaggi attivi possono giocare (lo impone anche il database)
    supabase.from("characters").select("*").eq("owner_id", user.id).eq("status", "attivo").order("created_at"),
  ]);

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <GameArea title={room.name} image={image} description={room.description} />
      {header}
      {isPrivate && (
        <RoomAccessBar
          roomId={room.id}
          info={
            room.access === "casata"
              ? `Chat della casata ${house?.name ?? ""}`
              : rental
                ? `Affittata da ${rental.character?.name ?? "—"}`
                : "Affitto scaduto"
          }
          endsAt={rental?.ends_at ?? null}
          canManage={!!controller || permissions.has("chat.moderare")}
          guests={((guests ?? []) as unknown as { character: Guest | null }[]).flatMap((g) => (g.character ? [g.character] : []))}
        />
      )}
      {characters?.length ? (
        <ChatRoom
          roomId={room.id}
          canNarrate={permissions.has("chat.narrazione")}
          characters={characters as Character[]}
          initialMessages={((messages ?? []) as Message[]).reverse()}
        />
      ) : (
        <InactiveBanner />
      )}
    </div>
  );
}
