import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import SignupSwitch from "./SignupSwitch";

export default async function IscrizioniPage() {
  const { supabase } = await requirePermission("iscrizioni.gestire");
  const { data, error } = await supabase.from("signup_settings").select("open, message").maybeSingle();

  return (
    <div className="mx-auto max-w-3xl">
      <GameArea title="Iscrizioni" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">Iscrizioni</h1>
      <p className="mb-6 text-sm text-muted">
        Apri o chiudi le iscrizioni al sito. Con le iscrizioni chiuse il pulsante &quot;Registrati&quot; della home è
        disattivato e nessuno può creare un nuovo account. Chi è già iscritto entra e gioca normalmente.
      </p>
      {error || !data ? (
        <p className="text-sm text-red-400">Prima va eseguita la migrazione 0153 in Supabase.</p>
      ) : (
        <SignupSwitch open={data.open as boolean} message={(data.message as string) ?? ""} />
      )}
    </div>
  );
}
