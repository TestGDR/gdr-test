import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    username = data?.username ?? null;
  }

  return (
    <header className="border-b border-border bg-panel">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-serif text-xl font-bold text-accent">
          GDR Play By Chat
        </Link>
        {user && (
          <>
            <Link href="/mappa" className="hover:text-accent">
              Mappa
            </Link>
            <Link href="/personaggi" className="hover:text-accent">
              Personaggi
            </Link>
            <div className="ml-auto flex items-center gap-4">
              <span className="text-sm text-muted">{username}</span>
              <form action={logout}>
                <button className="text-sm hover:text-accent">Esci</button>
              </form>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
