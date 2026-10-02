"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { untilLabel } from "@/lib/world";

type RentableRoom = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  price_per_hour: number;
  max_hours: number;
  location: { name: string } | null;
};
type Rental = { room_id: string; ends_at: string; character_id: string; character: { name: string } | null };
type Me = { id: string; name: string; coins: number; status: "bozza" | "attivo" };

// Utility -> Prenota stanza: si sceglie la stanza e per quante ore affittarla
export default function RoomBooking() {
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<RentableRoom[] | null>(null);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ roomId: string; text: string; ok: boolean } | null>(null);

  // Legge i dati (senza toccare lo stato: lo aggiorna chi la chiama)
  const fetchAll = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    const [c, r, rr] = await Promise.all([
      supabase.from("characters").select("id, name, coins, status").eq("owner_id", userId ?? "").order("created_at").limit(1).maybeSingle<Me>(),
      // Solo le stanze delle mappe attive (regole del database)
      supabase
        .from("rooms")
        .select("id, name, description, image_url, price_per_hour, max_hours, location:locations(name)")
        .eq("access", "affitto")
        .order("name"),
      supabase
        .from("room_rentals")
        .select("room_id, ends_at, character_id, character:characters(name)")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: false }),
    ]);
    return {
      me: c.data,
      rooms: (r.data ?? []) as unknown as RentableRoom[],
      rentals: (rr.data ?? []) as unknown as Rental[],
    };
  }, [supabase]);

  const load = useCallback(
    () =>
      fetchAll().then((d) => {
        setMe(d.me);
        setRooms(d.rooms);
        setRentals(d.rentals);
      }),
    [fetchAll],
  );

  useEffect(() => {
    fetchAll().then((d) => {
      setMe(d.me);
      setRooms(d.rooms);
      setRentals(d.rentals);
    });
  }, [fetchAll]);

  async function rent(room: RentableRoom) {
    if (!me) return;
    const h = hours[room.id] ?? 1;
    setBusy(room.id);
    setMessage(null);
    const { error } = await supabase.rpc("rent_room", { p_room: room.id, p_character: me.id, p_hours: h });
    setBusy(null);
    setMessage(
      error
        ? { roomId: room.id, text: error.message, ok: false }
        : { roomId: room.id, text: `Stanza affittata per ${h} ${h === 1 ? "ora" : "ore"}.`, ok: true },
    );
    if (!error) load();
  }

  if (rooms === null) return <p className="text-center text-muted">Caricamento...</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <p className="text-sm text-muted">
          Chi affitta una stanza ne diventa il padrone finché dura l&apos;affitto: può invitare e cacciare altri personaggi.
        </p>
        {me && (
          <p className="font-serif text-accent">
            {me.name}: <strong>{me.coins}</strong> monete
          </p>
        )}
      </div>

      {me?.status !== "attivo" && (
        <p className="mb-4 rounded border border-blood/60 bg-blood/15 px-3 py-2 text-sm text-orange-200">
          Per affittare una stanza devi prima completare la creazione del personaggio.
        </p>
      )}
      {rooms.length === 0 && <p className="text-center text-muted">Nessuna stanza in affitto al momento.</p>}

      <ul className="space-y-3">
        {rooms.map((room) => {
          const rental = rentals.find((r) => r.room_id === room.id);
          const mine = !!rental && rental.character_id === me?.id;
          const h = hours[room.id] ?? 1;
          const cost = h * room.price_per_hour;
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
                <p className="font-serif text-lg text-accent">{room.name}</p>
                <p className="text-xs text-muted">
                  {room.location?.name} · {room.price_per_hour} monete/ora · massimo {room.max_hours} ore
                </p>
                <p className={`mt-1 text-xs ${mine ? "text-accent" : rental ? "text-orange-300" : "text-green-300"}`}>
                  {mine
                    ? `Affittata da te ${untilLabel(rental.ends_at)}`
                    : rental
                      ? `Occupata da ${rental.character?.name ?? "—"} ${untilLabel(rental.ends_at)}`
                      : "Libera"}
                </p>

                {(!rental || mine) && me?.status === "attivo" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <select
                      value={h}
                      onChange={(e) => setHours((prev) => ({ ...prev, [room.id]: Number(e.target.value) }))}
                      aria-label="Ore di affitto"
                      className="input w-auto py-1 text-sm"
                    >
                      {Array.from({ length: room.max_hours }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "ora" : "ore"}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => rent(room)}
                      disabled={busy !== null || (me?.coins ?? 0) < cost}
                      className="btn px-4 py-1 text-sm"
                    >
                      {mine ? "Prolunga" : "Affitta"} · {cost} monete
                    </button>
                    {mine && (
                      <Link href={`/chat/${room.id}`} className="text-accent hover:underline">
                        Entra →
                      </Link>
                    )}
                  </div>
                )}
                {message?.roomId === room.id && (
                  <p className={`mt-1 text-xs ${message.ok ? "text-green-300" : "text-red-400"}`}>{message.text}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
