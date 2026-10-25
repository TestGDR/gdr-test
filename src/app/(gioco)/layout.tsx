import { cookies } from "next/headers";
import GameShell from "@/components/game/GameShell";
import { AVAILABILITY_COOKIE, isAvailability } from "@/lib/availability";
import { getMainCharacter } from "@/lib/main-character";
import { MANAGEMENT_PERMISSIONS } from "@/lib/permissions";
import { getStaffContext } from "@/lib/staff";

// Mondo di gioco: barra con titolo e icone, colonna sinistra (luogo, data,
// personaggio, presenti), area centrale e colonna destra con le icone
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  // il profilo (nome, stato, invisibilita', ruolo) arriva gia' con i permessi:
  // una sola lettura di "profiles" invece di tre
  const { supabase, user, permissions, profile } = await getStaffContext();
  const [character, cookieStore] = await Promise.all([getMainCharacter(supabase, user.id), cookies()]);
  const savedAvailability = cookieStore.get(AVAILABILITY_COOKIE)?.value;
  // "Il mio drago" compare solo a chi cavalca un drago
  const hasDragon = character
    ? !!(await supabase.from("dragons").select("id").eq("rider_id", character.id).limit(1).maybeSingle()).data
    : false;

  // Invisibilita' dello staff
  const invisible = !!profile?.invisible;

  // L'admin e' staff anche senza un ruolo assegnato
  // alla pagina arrivano solo nome e colore del ruolo, come prima
  const staffRole = profile?.staff_role
    ? { name: profile.staff_role.name, color: profile.staff_role.color }
    : profile?.role === "admin"
      ? { name: "Admin", color: "#c9a45c" }
      : null;

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
      canBroadcast={permissions.has("messaggi.tutti")}
      canModerate={permissions.has("ricerca.moderare")}
      canManageUsers={permissions.has("assenze.gestire")}
      canManageTickets={permissions.has("ticket.gestire")}
      canTicketCategories={permissions.has("ticket.categorie")}
      canCastleArchive={permissions.has("missive.castello")}
      canChooseOrigin={permissions.has("missive.parti_da")}
      canModerateForum={permissions.has("forum.moderare")}
      canManageForum={permissions.has("forum.sezioni")}
      canHighlightForum={permissions.has("forum.segnalare")}
      canReviewGossip={permissions.has("pettegolezzi.gestire")}
      hasDragon={hasDragon}
      canInvisible={permissions.has("staff.invisibile")}
      initialInvisible={invisible}
    >
      {children}
    </GameShell>
  );
}
