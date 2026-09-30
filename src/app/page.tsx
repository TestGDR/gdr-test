import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/mappa");

  return (
    <section className="mx-auto mt-16 max-w-2xl text-center">
      <h1 className="font-serif text-5xl font-bold text-accent">GDR Play By Chat</h1>
      <p className="mt-6 text-lg text-muted">
        Crea il tuo personaggio, esplora la mappa ed entra nelle liste: racconta in tempo reale
        cosa fa e cosa dice, insieme agli altri giocatori.
      </p>
      <Link href="/login" className="btn mt-10">
        Entra nel gioco
      </Link>
    </section>
  );
}
