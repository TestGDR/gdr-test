"use client";

import { useActionState, useState } from "react";
import { login, type AuthState } from "@/app/login/actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});
  // Controllato, cosi' dopo un errore il nome resta scritto
  const [identifier, setIdentifier] = useState("");

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Nome del personaggio</span>
        <input
          name="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          className="input"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </label>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Attendere..." : "Accedi"}
      </button>
    </form>
  );
}
