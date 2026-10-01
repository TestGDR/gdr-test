import Link from "next/link";
import GuideButton from "@/components/guide/GuideButton";
import { createClient } from "@/lib/supabase/server";

// Barra in alto dell'area pubblica. Il mondo di gioco ha il proprio layout (GameShell).
export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="bar relative border-b">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <div className="flex items-center gap-3 font-serif tracking-wide">
          <GuideButton book="manuale" label="Manuale di Gioco" />
          <span className="text-blood">|</span>
          <GuideButton book="ambientazione" label="Ambientazione" />
        </div>
        {user && (
          <Link href="/mappa" className="text-accent hover:underline sm:absolute sm:right-4">
            Entra nel gioco →
          </Link>
        )}
      </nav>
    </header>
  );
}
