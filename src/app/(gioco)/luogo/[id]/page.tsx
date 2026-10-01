import Link from "next/link";
import { notFound } from "next/navigation";
import InactiveBanner from "@/components/InactiveBanner";
import { GameArea } from "@/components/game/GameShell";
import { getMainCharacter } from "@/lib/main-character";
import { requireUser } from "@/lib/supabase/server";
import type { Location, Room } from "@/lib/types";

export default async function LuogoPage({ params }: PageProps<"/luogo/[id]">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const character = await getMainCharacter(supabase, user.id);

  const { data: location } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Location>();
  if (!location) notFound();

  const { data } = await supabase
    .from("rooms")
    .select("*")
    .eq("location_id", id)
    .order("sort_order");
  const rooms = (data ?? []) as Room[];

  return (
    <div className="mx-auto max-w-5xl">
      <GameArea title={location.name} image={location.image_url} />
      {character?.status !== "attivo" && <InactiveBanner />}
      <Link href={`/mappa?id=${location.map_id}`} className="text-sm text-muted hover:text-accent">
        ← Torna alla mappa
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-accent">{location.name}</h1>
      {location.description && <p className="mt-2 text-muted">{location.description}</p>}
      {location.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={location.image_url}
          alt={location.name}
          className="mt-4 max-h-72 w-full rounded-lg object-cover"
        />
      )}

      <h2 className="mt-8 mb-3 font-serif text-xl">Liste</h2>
      {rooms.length === 0 && <p className="text-muted">Nessuna lista in questo luogo.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {rooms.map((room) => (
          <li key={room.id}>
            <Link href={`/chat/${room.id}`} className="panel block transition hover:border-accent">
              <h3 className="font-serif text-lg">{room.name}</h3>
              {room.description && <p className="mt-1 text-sm text-muted">{room.description}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
