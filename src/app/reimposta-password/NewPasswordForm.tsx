"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/login/actions";

export default function NewPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Nuova password (min. 8 caratteri)</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Ripeti la password</span>
        <input
          name="password_confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </label>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Salvataggio..." : "Salva nuova password"}
      </button>
    </form>
  );
}
