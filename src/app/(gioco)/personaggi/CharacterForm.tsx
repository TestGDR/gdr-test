"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCharacter, type CharacterState } from "./actions";

export default function CharacterForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<CharacterState, FormData>(createCharacter, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="panel space-y-4">
      <h2 className="font-serif text-xl text-accent">Nuovo personaggio</h2>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Nome</span>
        <input name="name" required minLength={2} maxLength={40} className="input" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">URL avatar (facoltativo)</span>
        <input name="avatar_url" type="url" placeholder="https://..." className="input" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Descrizione / storia</span>
        <textarea name="description" rows={5} maxLength={4000} className="input" />
      </label>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button className="btn" disabled={pending}>
        {pending ? "Creazione..." : "Crea personaggio"}
      </button>
    </form>
  );
}
