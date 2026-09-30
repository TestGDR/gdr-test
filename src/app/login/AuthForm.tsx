"use client";

import { useActionState, useState } from "react";
import { login, signup, type AuthState } from "./actions";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(login, {});
  const [signupState, signupAction, signupPending] = useActionState<AuthState, FormData>(
    signup,
    {},
  );

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  return (
    <div className="panel">
      <h1 className="mb-6 font-serif text-2xl text-accent">
        {isLogin ? "Accedi" : "Registrati"}
      </h1>

      <form action={isLogin ? loginAction : signupAction} className="space-y-4">
        {!isLogin && (
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Nome del personaggio</span>
            <input
              name="character_name"
              required
              minLength={2}
              maxLength={40}
              autoComplete="off"
              className="input"
            />
            <span className="mt-1 block text-xs text-muted">
              Unico in tutto il gioco. Solo lettere, spazi, apostrofi e trattini.
            </span>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Email</span>
          <input name="email" type="email" required className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="input"
          />
        </label>

        {state.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state.message && <p className="text-sm text-green-400">{state.message}</p>}

        <button className="btn w-full" disabled={pending}>
          {pending ? "Attendere..." : isLogin ? "Accedi" : "Crea account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(isLogin ? "signup" : "login")}
        className="mt-4 w-full text-center text-sm text-muted hover:text-accent"
      >
        {isLogin ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
      </button>
    </div>
  );
}
