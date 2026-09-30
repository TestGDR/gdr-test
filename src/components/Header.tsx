import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let isAdmin = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username, role")
      .eq("id", user.id)
      .single();
    username = data?.username ?? null;
    isAdmin = data?.role === "admin";
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
          <Link href="/manuale" className="hover:text-accent">
            Manuale di Gioco
          </Link>
          <span className="text-blood">|</span>
          <Link href="/ambientazione" className="hover:text-accent">
            Ambientazione
          </Link>
        </div>

        {/* Destra: utente */}
        <div className="flex items-center justify-end gap-4">
          {user && (
            <>
              <span className="text-muted">{username}</span>
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
