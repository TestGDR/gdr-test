import { cookies } from "next/headers";
import GameShell from "@/components/game/GameShell";
import { AVAILABILITY_COOKIE, isAvailability } from "@/lib/availability";
import { getMainCharacter } from "@/lib/main-character";
import { requireUser } from "@/lib/supabase/server";

// Mondo di gioco: barra con la zona attuale, colonna sinistra (luogo, data,
// personaggio, presenti), area centrale e colonna destra con le icone
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, character, cookieStore] = await Promise.all([
    supabase.from("profiles").select("username, role, status_text").eq("id", user.id).single(),
    getMainCharacter(supabase, user.id),
    cookies(),
  ]);
  const savedAvailability = cookieStore.get(AVAILABILITY_COOKIE)?.value;

  return (
    <GameShell
      userId={user.id}
      displayName={profile?.username ?? "Viandante"}
      character={character}
      role={profile?.role ?? "player"}
      statusText={profile?.status_text ?? ""}
      initialAvailability={isAvailability(savedAvailability) ? savedAvailability : "disponibile"}
    >
      {children}
    </GameShell>
  );
}
