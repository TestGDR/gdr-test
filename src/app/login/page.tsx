import LoginPanel from "@/components/auth/LoginPanel";
import RegisterButton from "@/components/auth/RegisterModal";

// Pagina di riserva: ci si arriva quando si apre una pagina riservata senza essere loggati
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { errore } = await searchParams;

  return (
    <section className="mx-auto mt-10 max-w-md">
      <div className="panel">
        {errore === "link" && (
          <p className="mb-4 rounded-md border border-blood/60 bg-blood/20 p-3 text-sm">
            Il link è scaduto o non è valido. Richiedine uno nuovo.
          </p>
        )}
        <LoginPanel />
        <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted">
          Non hai ancora un personaggio?
          <RegisterButton className="btn-ghost mt-3 w-full">Registrati</RegisterButton>
        </div>
      </div>
    </section>
  );
}
