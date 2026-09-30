import { requireUser } from "@/lib/supabase/server";
import NewPasswordForm from "./NewPasswordForm";

export default async function ReimpostaPasswordPage() {
  await requireUser();

  return (
    <section className="mx-auto mt-10 max-w-md">
      <div className="panel">
        <h1 className="mb-4 font-serif text-2xl text-accent">Nuova password</h1>
        <NewPasswordForm />
      </div>
    </section>
  );
}
