import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import RegisterButton from "@/components/auth/RegisterModal";
import { createClient } from "@/lib/supabase/server";
import homeBg from "../../public/images/home-bg.jpg";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/mappa");

  return (
    <>
      {/* Sfondo a tutto schermo, dietro header e contenuti */}
      <div className="fixed inset-0 -z-10">
        <Image
          src={homeBg}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/80" />
      </div>

      <section className="mx-auto mt-16 max-w-2xl text-center">
        <h1 className="font-serif text-5xl font-bold text-accent drop-shadow-[0_0_18px_rgba(226,98,45,0.45)]">
          GDR Play By Chat
        </h1>
        <p className="mt-6 text-lg text-foreground/80 drop-shadow">
          Crea il tuo personaggio, esplora la mappa ed entra nelle liste: racconta in tempo reale
          cosa fa e cosa dice, insieme agli altri giocatori.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link href="/login" className="btn-ghost">
            Accedi
          </Link>
          <RegisterButton />
        </div>
      </section>
    </>
  );
}
