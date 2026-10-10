import Link from "next/link";
import { notFound } from "next/navigation";
import InactiveBanner from "@/components/InactiveBanner";
import { GameArea } from "@/components/game/GameShell";
import { CHAT_LENGTH, freshSince } from "@/lib/chat-ttl";
import { getStaffContext } from "@/lib/staff";
import type { Character, Location, Message, Room } from "@/lib/types";
import ChatRoom from "./ChatRoom";
import RoomAccessBar, { type Guest } from "./RoomAccessBar";

const HISTORY_SIZE = 100;

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const { supabase, user, permissions, isAdmin } = await getStaffContext();

  // Le chat delle mappe spente non si vedono (regole del database)
  const { data: room } = await supabase
    .from("rooms")
    .select("*, location:locations(*)")
    .eq("id", id)
    .maybeSingle<Room & { location: Location }>();
  if (!room) notFound();

  const back = `/mappa?id=${room.location.map_id}&luogo=${room.location.id}`;
  // meteo: quello della regione della mappa a cui appartiene la chat
  const { data: mapInfo } = await supabase
    .from("maps")
    .select("weather_region_id")
    .eq("id", room.location.map_id)
    .maybeSingle();
  const weatherRegionId = (mapInfo?.weather_region_id as string | null) ?? null;
  const image = room.image_url ?? room.location.image_url;
  const isPrivate = room.access !== "pubblica";

  const [
    { data: canEnter },
    { data: controller },
    { data: house },
    { data: rental },
    { data: guests },
  ] = await Promise.all([
    supabase.rpc("can_enter_room", { r: id }),
    isPrivate
      ? supabase.rpc("room_controller", { r: id })
      : Promise.resolve({ data: null }),
    room.house_id
      ? supabase
          .from("houses")
          .select("name")
          .eq("id", room.house_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    room.access === "affitto"
      ? supabase
          .from("room_rentals")
          .select("ends_at, character:characters(name)")
          .eq("room_id", id)
          .gt("ends_at", new Date().toISOString())
          .order("ends_at", { ascending: false })
          .limit(1)
          .maybeSingle<{
            ends_at: string;
            character: { name: string } | null;
          }>()
      : Promise.resolve({ data: null }),
    isPrivate
      ? supabase
          .from("room_guests")
          .select("character:characters(id, name)")
          .eq("room_id", id)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ]);

  // Cellulare: solo "‹ Torna alla mappa" (il nome della chat e' nel menu)
  const header = (
    <div className="mb-3 max-lg:mb-0 max-lg:flex max-lg:items-center max-lg:gap-3 max-lg:border-b max-lg:border-border max-lg:px-3 max-lg:py-2.5">
      {/* computer: torna al luogo (con l'elenco delle sue chat) */}
      <Link
        href={back}
        className="hidden text-sm text-muted hover:text-accent lg:inline"
      >
        ← {room.location.name}
      </Link>
      {/* cellulare: torna alla mappa, senza aprire la finestra del luogo */}
      <Link
        href={`/mappa?id=${room.location.map_id}`}
        className="flex shrink-0 items-center gap-1 text-sm text-muted hover:text-accent lg:hidden"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Torna alla mappa
      </Link>
      <h1 className="font-serif text-2xl text-accent max-lg:hidden">
        {isPrivate && <span title="Chat privata">🔒 </span>}
        {room.name}
      </h1>
      {room.description && (
        <p className="text-sm text-muted max-lg:hidden">{room.description}</p>
      )}
    </div>
  );

  if (!canEnter) {
    // viaggi: in viaggio si gioca solo nelle chat di viaggio, e viceversa
    const { data: travelBlock } = await supabase.rpc("room_travel_block", {
      r: id,
    });
    return (
      <div className="mx-auto mt-6 max-w-xl text-center">
        <GameArea
          title={room.name}
          image={image}
          description={room.description}
          weatherRegionId={weatherRegionId}
        />
        {header}
        <p className="panel text-muted">
          {travelBlock === "in_viaggio"
            ? "Sei in viaggio: finché non arrivi puoi giocare solo nelle chat di viaggio. Le trovi nel pannello Viaggio (la bussola)."
            : travelBlock === "non_in_viaggio"
              ? "Questa è una chat di viaggio: ci entra solo chi è in viaggio. Per partire usa il pannello Viaggio (la bussola)."
              : travelBlock === "viaggio_diverso"
                ? "Questa chat di viaggio non è sul tuo percorso (o è per chi viaggia con un altro mezzo): le tue sono nel pannello Viaggio."
                : room.access === "casata"
                  ? `Questa è una chat privata della casata ${house?.name ?? ""}: entrano solo i suoi membri e chi viene invitato.`
                  : rental
                    ? "Questa stanza è affittata da un altro personaggio: entra solo chi viene invitato."
                    : "Questa stanza è libera: puoi affittarla da Utility → Prenota stanza."}
        </p>
      </div>
    );
  }

  // Chi e' in giocata (attivo nell'ultima ora). Le azioni le legge solo chi e'
  // entrato (o lo staff): lo impone il database
  const since = freshSince();
  const cleared = (room as Room & { cleared_at?: string | null }).cleared_at;
  const cutoff = cleared && cleared > since ? cleared : since;
  const canNpc = permissions.has("png.gestire");
  const [{ data: presence }, { data: hiddenCount }, { data: npcRows }] =
    await Promise.all([
      supabase.rpc("chat_present", { p_room: id }),
      supabase.rpc("chat_hidden_count", { p_room: id }),
      // PNG che l'utente puo' portare in giocata e muovere
      canNpc
        ? supabase
            .from("characters")
            .select("id, name")
            .eq("is_npc", true)
            .eq("status", "attivo")
            .or(
              isAdmin
                ? "is_npc.eq.true"
                : `npc_manager_id.is.null,npc_manager_id.eq.${user.id}`,
            )
            .order("name")
        : Promise.resolve({ data: [] }),
    ]);
  const present = (
    (presence ?? []) as {
      character_id: string;
      name: string;
      is_npc: boolean;
    }[]
  ).map((p) => ({ id: p.character_id, name: p.name, isNpc: p.is_npc }));
  const npcs = (npcRows ?? []) as { id: string; name: string }[];

  const [{ data: messages }, { data: characters }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", id)
      // solo le azioni dell'ultima ora (e dopo l'ultima pulizia della chat)
      .gt("created_at", cutoff)
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

  // Giocate in corso in altre chat: prima di entrare qui bisogna uscire da li'
  const myIds = ((characters ?? []) as Character[]).map((c) => c.id);
  const { data: busy } = myIds.length
    ? await supabase
        .from("chat_presence")
        .select("character_id, room_id, room:rooms(name)")
        .in("character_id", myIds)
        .neq("room_id", id)
        .gt("last_active_at", since)
        .order("last_active_at", { ascending: false })
    : { data: [] };
  const elsewhere = (
    (busy ?? []) as unknown as {
      character_id: string;
      room_id: string;
      room: { name: string } | null;
    }[]
  ).map((b) => ({
    characterId: b.character_id,
    roomId: b.room_id,
    roomName: b.room?.name ?? "un'altra chat",
  }));

  // staff invisibile: gioca senza entrare in giocata e senza comparire tra i presenti
  const { data: invisibleNow } = await supabase.rpc("i_am_invisible");
  // Le azioni arrivano alla pagina solo a chi e' in giocata (con il proprio PG o
  // con un PNG che muove) o e' invisibile: vale anche per lo staff
  const canRead =
    !!invisibleNow ||
    present.some(
      (p) => myIds.includes(p.id) || npcs.some((n) => n.id === p.id),
    );

  // limite di caratteri delle azioni (Gestione -> Chat)
  const { data: chatSettings } = await supabase
    .from("chat_settings")
    .select("max_length")
    .maybeSingle();
  const maxLen =
    (chatSettings?.max_length as number | undefined) ?? CHAT_LENGTH.default;

  return (
    <div className="flex h-full min-h-[24rem] flex-col max-lg:min-h-0 max-lg:flex-1">
      <GameArea
        title={room.name}
        image={image}
        description={room.description}
        weatherRegionId={weatherRegionId}
      />
      {/* computer: luogo e nome della chat sono gia' nella colonna di sinistra */}
      <div className="lg:hidden">{header}</div>
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
          guests={(
            (guests ?? []) as unknown as { character: Guest | null }[]
          ).flatMap((g) => (g.character ? [g.character] : []))}
        />
      )}
      {characters?.length || canNpc ? (
        <ChatRoom
          key={`${present
            .filter(
              (p) =>
                ((characters ?? []) as Character[]).some(
                  (c) => c.id === p.id,
                ) || npcs.some((n) => n.id === p.id),
            )
            .map((p) => p.id)
            .join(",")}-${invisibleNow ? "inv" : ""}-${cleared ?? ""}`}
          presence={present}
          npcs={npcs}
          canNpc={canNpc}
          elsewhere={elsewhere}
          hiddenCount={(hiddenCount as number | null) ?? 0}
          invisible={!!invisibleNow}
          room={{
            id: room.id,
            name: room.name,
            description: room.description,
            image_url: image,
            access: room.access,
            location_id: room.location.id,
            location_name: room.location.name,
          }}
          canNarrate={permissions.has("chat.narrazione")}
          maxLen={maxLen}
          characters={(characters ?? []) as Character[]}
          initialMessages={
            canRead ? ((messages ?? []) as Message[]).reverse() : []
          }
        />
      ) : (
        <InactiveBanner />
      )}
    </div>
  );
}
