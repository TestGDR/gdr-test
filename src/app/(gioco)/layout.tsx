import GameShell from "@/components/game/GameShell";
import { getMainCharacter } from "@/lib/main-character";
import { requireUser } from "@/lib/supabase/server";

// Mondo di gioco: barra con la zona attuale, colonna sinistra (luogo, data,
// personaggio, presenti), area centrale e colonna destra con le icone
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, character] = await Promise.all([
    supabase.from("profiles").select("username, role").eq("id", user.id).single(),
    getMainCharacter(supabase, user.id),
  ]);

  return (
    <GameShell
      userId={user.id}
      displayName={profile?.username ?? "Viandante"}
      character={character}
      isAdmin={profile?.role === "admin"}
    >
      {children}
    </GameShell>
  );
}
