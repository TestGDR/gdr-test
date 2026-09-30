import LoginForm from "@/components/auth/LoginForm";
import RegisterButton from "@/components/auth/RegisterModal";

export default function LoginPage() {
  return (
    <section className="mx-auto mt-10 max-w-md">
      <div className="panel">
        <h1 className="mb-6 font-serif text-2xl text-accent">Accedi</h1>
        <LoginForm />
        <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted">
          Non hai ancora un personaggio?
          <RegisterButton className="btn-ghost mt-3 w-full">Registrati</RegisterButton>
        </div>
      </div>
    </section>
  );
}
