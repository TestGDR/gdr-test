import Image from "next/image";
import { redirect } from "next/navigation";
import AgeRating from "@/components/AgeRating";
import { LoginButton } from "@/components/auth/LoginPanel";
import RegisterButton from "@/components/auth/RegisterModal";
import { createClient } from "@/lib/supabase/server";
import homeBg from "../../../public/images/home-bg.jpg";
import logo from "../../../public/images/logo-westeros.png";

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

      <section className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <h1 className="sr-only">Westeros GDR</h1>
        <Image
          src={logo}
          alt="Westeros GDR"
          priority
          sizes="400px"
          // Il nero del logo si fonde con lo sfondo (blend "screen")
          className="h-auto w-full max-w-[400px] mix-blend-screen"
        />

        <div className="mt-6 flex justify-center gap-4">
          <RegisterButton className="btn min-w-32 tracking-widest uppercase" />
          <LoginButton className="btn-ghost min-w-32 tracking-widest uppercase" />
        </div>

        <div className="mt-8">
          <AgeRating />
        </div>
      </section>
    </>
  );
}
