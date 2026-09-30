"use client";

import { useActionState, useState } from "react";
import { login, requestPasswordReset, type AuthState } from "@/app/login/actions";
import { AtIcon, IconField, KeyIcon, UserIcon } from "@/components/auth/fields";
import ModalButton from "@/components/ui/ModalButton";

// Pulsante "Accedi" che apre la modale di accesso
export function LoginButton({ className = "btn-ghost" }: { className?: string }) {
  return (
    <ModalButton label="Accedi" title="Accedi" className={className}>
      {() => <LoginPanel />}
    </ModalButton>
  );
}

// Accesso + recupero password (nella modale o nella pagina /login)
export default function LoginPanel() {
  const [view, setView] = useState<"login" | "recupero">("login");
  // Condiviso tra le due schermate: se hai scritto il nome, resta anche nel recupero
  const [identifier, setIdentifier] = useState("");

  return (
    <div>
      {view === "recupero" && (
        <h3 className="mb-3 font-serif text-xl text-accent">Recupero password</h3>
      )}
      {view === "login" ? (
        <LoginView
          identifier={identifier}
          setIdentifier={setIdentifier}
          onForgot={() => setView("recupero")}
        />
      ) : (
        <RecoveryView
          identifier={identifier}
          setIdentifier={setIdentifier}
          onBack={() => setView("login")}
        />
      )}
    </div>
  );
}

type ViewProps = { identifier: string; setIdentifier: (v: string) => void };

function LoginView({ identifier, setIdentifier, onForgot }: ViewProps & { onForgot: () => void }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});

  return (
    <form action={action} className="space-y-3">
      <IconField icon={<UserIcon />} label="Nome del personaggio">
        <input
          name="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          className="w-full bg-transparent outline-none"
        />
      </IconField>
      <IconField icon={<KeyIcon />} label="Password">
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full bg-transparent outline-none"
        />
      </IconField>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button className="btn w-full tracking-widest uppercase" disabled={pending}>
        {pending ? "Attendere..." : "Login"}
      </button>
      <button
        type="button"
        onClick={onForgot}
        className="w-full text-center text-sm text-muted hover:text-accent"
      >
        Password dimenticata?
      </button>
    </form>
  );
}

function RecoveryView({ identifier, setIdentifier, onBack }: ViewProps & { onBack: () => void }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        Inserisci il nome del tuo personaggio o l&apos;email dell&apos;account: riceverai un link
        per scegliere una nuova password.
      </p>
      <IconField icon={<AtIcon />} label="Nome del personaggio o email">
        <input
          name="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          className="w-full bg-transparent outline-none"
        />
      </IconField>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.message && <p className="text-sm text-green-400">{state.message}</p>}

      <button className="btn w-full tracking-widest uppercase" disabled={pending}>
        {pending ? "Invio..." : "Invia link"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-sm text-muted hover:text-accent"
      >
        ← Torna al login
      </button>
    </form>
  );
}
