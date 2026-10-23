"use client";

import { useActionState } from "react";
import { changePassword, type AuthState } from "@/app/(pubblico)/login/actions";

// Utility -> Cambio password: ogni giocatore puo' cambiarla quando vuole
export default function ChangePassword() {
  const [state, action, pending] = useActionState<AuthState, FormData>(changePassword, {});
  return (
    <form action={action} className="mx-auto max-w-sm space-y-3">
      <p className="text-center font-serif text-lg text-accent">Cambio password</p>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Password attuale</span>
        <input name="current" type="password" required autoComplete="current-password" className="input py-1.5" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Nuova password (almeno 8 caratteri)</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input py-1.5" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Ripeti la nuova password</span>
        <input name="password_confirm" type="password" required minLength={8} autoComplete="new-password" className="input py-1.5" />
      </label>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.message && <p className="text-sm text-green-400">{state.message}</p>}
      <button className="btn w-full py-1.5 text-sm" disabled={pending}>
        {pending ? "Salvataggio..." : "Cambia password"}
      </button>
    </form>
  );
}
