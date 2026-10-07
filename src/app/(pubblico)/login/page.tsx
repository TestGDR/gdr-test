import { redirect } from "next/navigation";
import HomeScreen from "@/components/HomeScreen";
import { createClient } from "@/lib/supabase/server";

// Ci si arriva aprendo una pagina riservata senza essere loggati, da un link
// scaduto o dopo la chiusura per inattivita': e' uguale alla home, con l'avviso
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { errore } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/mappa");

  const notice =
    errore === "link" ? (
      <p className="rounded-md border border-blood/60 bg-black/70 p-3 text-sm">
        Il link è scaduto o non è valido. Richiedine uno nuovo.
      </p>
    ) : errore === "inattivita" ? (
      <p className="rounded-md border border-accent/50 bg-black/70 p-3 text-sm">
        La sessione è stata chiusa dopo un&apos;ora di inattività. Accedi di
        nuovo per tornare in gioco.
      </p>
    ) : null;

  return <HomeScreen notice={notice} />;
}
