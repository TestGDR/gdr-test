import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import GuideButton from "@/components/guide/GuideButton";
import SheetButton from "@/components/scheda/SheetButton";
import { getMainCharacter, type MainCharacter } from "@/lib/main-character";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let isAdmin = false;
  let character: MainCharacter | null = null;
  if (user) {
    const [{ data }, main] = await Promise.all([
      supabase.from("profiles").select("username, role").eq("id", user.id).single(),
      getMainCharacter(supabase, user.id),
    ]);
    username = data?.username ?? null;
    isAdmin = data?.role === "admin";
    character = main;
  }

  return (
    <header className="bar border-b">
      <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 text-sm">
        {/* Sinistra: sezioni del gioco (solo da loggati) */}
        <div className="flex items-center gap-4">
          {user && (
            <>
              <Link href="/mappa" className="hover:text-accent">
                Mappa
              </Link>
              <Link href="/personaggi" className="hover:text-accent">
                Personaggi
              </Link>
              {isAdmin && (
                <Link href="/admin/accessi" className="hover:text-accent">
                  Accessi
                </Link>
              )}
            </>
          )}
        </div>

        {/* Centro: sempre visibile */}
        <div className="flex items-center gap-3 font-serif tracking-wide">
          <GuideButton book="manuale" label="Manuale di Gioco" />
          <span className="text-blood">|</span>
          <GuideButton book="ambientazione" label="Ambientazione" />
        </div>

        {/* Destra: utente */}
        <div className="flex items-center justify-end gap-4">
          {user && (
            <>
              {character ? (
                <SheetButton characterId={character.id} name={character.name} />
              ) : (
                <span className="text-muted">{username}</span>
              )}
              <form action={logout}>
                <button className="hover:text-accent">Esci</button>
              </form>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
