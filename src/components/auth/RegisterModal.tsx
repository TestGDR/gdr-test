"use client";

import { useActionState, useState, type ReactNode } from "react";
import { signup, type AuthState } from "@/app/(pubblico)/login/actions";
import { AtIcon, IconField, KeyIcon, UserIcon } from "@/components/auth/fields";
import ModalButton from "@/components/ui/ModalButton";
import { LEGAL_DOCS, type LegalDocId } from "@/lib/legal";

type ConsentKey = "accept_disclaimer" | "accept_terms" | "accept_privacy";

// Ogni casella si sblocca solo dopo aver aperto tutti i documenti collegati
const CONSENTS: { key: ConsentKey; docs: LegalDocId[] }[] = [
  { key: "accept_disclaimer", docs: ["disclaimer"] },
  { key: "accept_terms", docs: ["termini"] },
  { key: "accept_privacy", docs: ["privacy", "cookie"] },
];

export default function RegisterButton({
  className = "btn",
  children = "Registrati",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <ModalButton label={children} title="Registrazione" className={className}>
      {() => <RegisterForm />}
    </ModalButton>
  );
}

function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, {});

  // Campi controllati: React svuota i campi non controllati dopo ogni invio
  const [characterName, setCharacterName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [openedDocs, setOpenedDocs] = useState<Set<LegalDocId>>(new Set());
  const [checked, setChecked] = useState<Record<ConsentKey | "accept_adult", boolean>>({
    accept_disclaimer: false,
    accept_terms: false,
    accept_privacy: false,
    accept_adult: false,
  });
  const [viewingDoc, setViewingDoc] = useState<LegalDocId | null>(null);

  const documentsAccepted = CONSENTS.every((c) => checked[c.key]);
  const allAccepted = documentsAccepted && checked.accept_adult;

  function openDoc(id: LegalDocId) {
    setOpenedDocs((prev) => new Set(prev).add(id));
    setViewingDoc(id);
  }

  function toggle(key: ConsentKey | "accept_adult", value: boolean) {
    setChecked((prev) => {
      const next = { ...prev, [key]: value };
      // Togliendo un documento si toglie anche la dichiarazione finale
      if (key !== "accept_adult" && !value) next.accept_adult = false;
      return next;
    });
  }

  function docLink(id: LegalDocId, label: string) {
    return (
      <button
        type="button"
        onClick={() => openDoc(id)}
        className="font-semibold uppercase underline decoration-dotted underline-offset-2 hover:text-accent"
      >
        {label}
      </button>
    );
  }

  const labels: Record<ConsentKey, ReactNode> = {
    accept_disclaimer: <>Dichiaro di aver letto ed accettato il {docLink("disclaimer", "Disclaimer")} alla registrazione</>,
    accept_terms: <>Dichiaro di aver letto ed accettato i {docLink("termini", "Termini del servizio")}</>,
    accept_privacy: (
      <>
        Dichiaro di aver letto ed accettato la {docLink("privacy", "Privacy Policy")} e la{" "}
        {docLink("cookie", "Cookie Policy")}
      </>
    ),
  };

  return (
    <div>
      {viewingDoc && (
        <div>
          <h3 className="mb-3 font-serif text-xl text-accent">{LEGAL_DOCS[viewingDoc].title}</h3>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-background p-4 text-sm leading-relaxed">
            {LEGAL_DOCS[viewingDoc].body}
          </div>
          <button type="button" className="btn mt-4 w-full" onClick={() => setViewingDoc(null)}>
            Ho letto, torna alla registrazione
          </button>
        </div>
      )}

      {/* Il form resta montato (solo nascosto) per non perdere i dati inseriti */}
      <form action={action} className={viewingDoc ? "hidden" : "space-y-3"}>
        <IconField icon={<UserIcon />} label="Nome del personaggio">
          <input
            name="character_name"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            required
            minLength={2}
            maxLength={40}
            autoComplete="off"
            className="w-full bg-transparent outline-none"
          />
        </IconField>
        <p className="-mt-1 text-xs text-muted">
          Unico in tutto il gioco: lo userai per accedere. Solo lettere, spazi, apostrofi e trattini.
        </p>
        <IconField icon={<AtIcon />} label="Email">
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full bg-transparent outline-none"
          />
        </IconField>
        <IconField icon={<KeyIcon />} label="Password (min. 8 caratteri)">
          <input
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full bg-transparent outline-none"
          />
        </IconField>

        <div className="rounded-md border border-accent/60 bg-accent/15 p-3 text-sm text-amber-50">
          Per andare avanti con la registrazione è necessario flaggare tutte le checkbox presenti.
          I link sono cliccabili, occorre aprirli e chiuderli per rendere attiva la selezione.
        </div>

        <div className="space-y-2 text-sm">
          {CONSENTS.map((c) => {
            const unlocked = c.docs.every((d) => openedDocs.has(d));
            return (
              <Consent
                key={c.key}
                name={c.key}
                checked={checked[c.key]}
                disabled={!unlocked}
                onChange={(v) => toggle(c.key, v)}
              >
                {labels[c.key]}
              </Consent>
            );
          })}
          <Consent
            name="accept_adult"
            checked={checked.accept_adult}
            disabled={!documentsAccepted}
            onChange={(v) => toggle("accept_adult", v)}
          >
            Dichiaro di avere almeno 18 anni compiuti
          </Consent>
        </div>

        {state.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state.message && <p className="text-sm text-green-400">{state.message}</p>}

        <button className="btn w-full tracking-widest uppercase" disabled={pending || !allAccepted}>
          {pending ? "Attendere..." : "Registrati"}
        </button>
      </form>
    </div>
  );
}

function Consent({
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-start gap-2 ${disabled ? "text-muted" : ""}`}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={name}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed"
      />
      <span>{children}</span>
    </div>
  );
}
