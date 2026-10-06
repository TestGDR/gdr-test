"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import Modal from "@/components/ui/Modal";
import type { GameMap, Location, Room, RoomGroup } from "@/lib/types";
import { untilLabel, type ActiveRental } from "@/lib/world";

type Props = {
  map: GameMap;
  locations: Location[];
  rooms: Room[];
  groups: RoomGroup[];
  houses: { id: string; name: string }[];
  rentals: ActiveRental[];
  userId: string;
  initialLocationId: string | null;
};

// Mappa principale (max 600px) con i puntini delle macroaree:
// cliccandone uno si apre la modale con le chat della macroarea
export default function MapView({ map, locations, rooms, groups, houses, rentals, userId, initialLocationId }: Props) {
  const [openId, setOpenId] = useState<string | null>(locations.some((l) => l.id === initialLocationId) ? initialLocationId : null);
  const open = locations.find((l) => l.id === openId);

  // Chiudendo la finestra tolgo "luogo" dall'indirizzo (arriva tornando da una chat):
  // cosi' aggiornando la pagina non si riapre da sola
  function close() {
    setOpenId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("luogo")) {
      url.searchParams.delete("luogo");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[38.125rem]">{/* mappa 600px + cornice 2 x 5px */}
      <div className="frame-ornate relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={map.image_url} alt={map.name} className="block w-full select-none" draggable={false} />
        {locations.map((loc) => (
          <button
            key={loc.id}
            type="button"
            onClick={() => setOpenId(loc.id)}
            aria-label={loc.name}
            className="group absolute -translate-x-1/2 -translate-y-1/2 p-1"
            style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
          >
            <MapDot />
            <span className={`pointer-events-none absolute top-7 z-10 ${
              // vicino ai bordi il nome si allinea al punto invece di uscire dalla mappa
              loc.x < 15 ? "left-0" : loc.x > 85 ? "right-0" : "left-1/2 -translate-x-1/2"
            } rounded border border-border bg-black/90 px-2 py-0.5 font-serif text-xs whitespace-nowrap text-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100`}>
              {loc.name}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 text-center">
        <h1 className="font-serif text-xl tracking-[0.15em] text-accent uppercase">{map.name}</h1>
        {map.description && <p className="mt-1 text-sm leading-relaxed text-muted">{map.description}</p>}
      </div>

      <Modal open={!!open} onClose={close} title={open?.name ?? ""} size="area">
        {open && (
          <RoomList
            location={open}
            rooms={rooms.filter((r) => r.location_id === open.id)}
            groups={groups.filter((g) => g.location_id === open.id)}
            houses={houses}
            rentals={rentals}
            userId={userId}
          />
        )}
      </Modal>
    </div>
  );
}

// Puntino luminoso della macroarea
export function MapDot() {
  return (
    <span className="relative block h-4 w-4">
      <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" />
      <span className="absolute inset-0 rounded-full bg-accent shadow-[0_0_10px_rgba(201,164,92,0.9)] transition group-hover:scale-125" />
    </span>
  );
}

const noop = () => () => {};

function RoomList({
  location,
  rooms,
  groups,
  houses,
  rentals,
  userId,
}: {
  location: Location;
  rooms: Room[];
  groups: RoomGroup[];
  houses: { id: string; name: string }[];
  rentals: ActiveRental[];
  userId: string;
}) {
  // Gli orari d'affitto si scrivono nel fuso orario del giocatore: solo nel browser
  const inBrowser = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  function status(room: Room) {
    if (room.access === "casata") {
      return {
        text: `Casata ${houses.find((h) => h.id === room.house_id)?.name ?? "—"}`,
        tone: "text-red-300",
      };
    }
    if (room.access === "affitto") {
      const rental = rentals.find((r) => r.room_id === room.id);
      if (!rental)
        return {
          text: `Libera · ${room.price_per_hour} monete/ora`,
          tone: "text-green-300",
        };
      const until = inBrowser ? ` ${untilLabel(rental.ends_at)}` : "";
      return rental.character?.owner_id === userId
        ? { text: `Affittata da te${until}`, tone: "text-accent" }
        : { text: `Occupata${until}`, tone: "text-amber-200" };
    }
    return null;
  }

  const sections = [
    {
      id: "senza-gruppo",
      name: null as string | null,
      rooms: rooms.filter((r) => !groups.some((g) => g.id === r.group_id)),
    },
    ...groups.map((g) => ({
      id: g.id,
      name: g.name as string | null,
      rooms: rooms.filter((r) => r.group_id === g.id),
    })),
  ].filter((s) => s.rooms.length > 0);

  return (
    <div>
      {location.description && <p className="mb-4 text-sm leading-relaxed whitespace-pre-line text-muted">{location.description}</p>}
      {rooms.length === 0 && <p className="text-center text-muted">Nessuna chat in questa zona.</p>}
      {/* Prima le chat senza gruppo, poi un blocco per ogni gruppo con il suo nome */}
      {sections.map((section) => (
        <section key={section.id} className="mb-5 last:mb-0">
          {section.name && (
            <h3 className="mb-2 border-b border-blood/50 pb-1 font-serif text-lg tracking-[0.12em] text-accent uppercase">
              {section.name}
            </h3>
          )}
          <ul className="space-y-3">
            {section.rooms.map((room) => {
              const st = status(room);
              return (
                <li key={room.id} className="flex gap-3 rounded-md border border-border bg-black/40 p-3">
                  {room.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={room.image_url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-border font-serif text-2xl text-muted">
                      {room.name[0]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <Link href={`/chat/${room.id}`} className="font-serif text-lg text-accent hover:underline">
                        {room.access !== "pubblica" && (
                          <span aria-label="Privata" title="Chat privata">
                            🔒{" "}
                          </span>
                        )}
                        {room.name}
                      </Link>
                      {st && <span className={`text-xs ${st.tone}`}>{st.text}</span>}
                    </div>
                    {room.description && (
                      <p className="mt-1 max-h-20 overflow-y-auto pr-1 text-sm leading-relaxed whitespace-pre-line text-muted">
                        {room.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
