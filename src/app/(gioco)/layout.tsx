import { cookies } from "next/headers";
import GameShell from "@/components/game/GameShell";
import { AVAILABILITY_COOKIE, isAvailability } from "@/lib/availability";
import { getMainCharacter } from "@/lib/main-character";
import { MANAGEMENT_PERMISSIONS } from "@/lib/permissions";
import { getStaffContext } from "@/lib/staff";

type Profile = {
  username: string | null;
  role: string;
  status_text: string | null;
  staff_role: { name: string; color: string } | null;
};

// Mondo di gioco: barra con titolo e icone, colonna sinistra (luogo, data,
// personaggio, presenti), area centrale e colonna destra con le icone
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, permissions, isAdmin } = await getStaffContext();
  const [{ data: profile }, character, cookieStore] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, role, status_text, staff_role:staff_roles(name, color)")
      .eq("id", user.id)
      .single<Profile>(),
    getMainCharacter(supabase, user.id),
    cookies(),
  ]);
  const savedAvailability = cookieStore.get(AVAILABILITY_COOKIE)?.value;

  // L'admin e' staff anche senza un ruolo assegnato
  const staffRole =
    profile?.staff_role ?? (profile?.role === "admin" ? { name: "Admin", color: "#e2622d" } : null);

  return (
    <GameShell
      userId={user.id}
      displayName={profile?.username ?? "Viandante"}
      character={character}
      staffRole={staffRole}
      statusText={profile?.status_text ?? ""}
      initialAvailability={isAvailability(savedAvailability) ? savedAvailability : "disponibile"}
      canEditDocs={permissions.has("documentazione.scrivere")}
      canManage={MANAGEMENT_PERMISSIONS.some((p) => permissions.has(p))}
      canWriteNewsOn={permissions.has("notizie.on")}
      canWriteNewsOff={permissions.has("annunci.globali")}
      canModerate={permissions.has("chat.moderare")}
      canManageUsers={permissions.has("utenti.gestire")}
      canManageTickets={permissions.has("ticket.gestire")}
      isAdmin={isAdmin}
    >
      {children}
    </GameShell>
  );
}
