"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { signup, type AuthState } from "@/app/login/actions";
import type { Captcha } from "@/lib/captcha";
import { LEGAL_DOCS, type LegalDocId } from "@/lib/legal";

type ConsentKey = "accept_disclaimer" | "accept_terms" | "accept_privacy";

// Ogni casella si sblocca solo dopo aver aperto tutti i documenti collegati
const CONSENTS: { key: ConsentKey; docs: LegalDocId[] }[] = [
  { key: "accept_disclaimer", docs: ["disclaimer"] },
  { key: "accept_terms", docs: ["termini"] },
  { key: "accept_privacy", docs: ["privacy", "cookie"] },
];

export default function RegisterButton({
  captcha,
  className = "btn",
  children = "Registrati",
}: {
  captcha: Captcha;
  className?: string;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => dialogRef.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-panel p-0 text-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <RegisterForm captcha={captcha} onClose={() => dialogRef.current?.close()} />
      </dialog>
    </>
  );
}

function RegisterForm({ captcha: initialCaptcha, onClose }: { captcha: Captcha; onClose: () => void }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, {});
  const captcha = state.captcha ?? initialCaptcha;

  // Campi controllati: React svuota i campi non controllati dopo ogni invio
  // (voluto solo per la risposta anti-robot, da reinserire a ogni tentativo)
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
    <div className="max-h-[90vh] overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-widest uppercase">
          {viewingDoc ? LEGAL_DOCS[viewingDoc].title : "Registrazione"}
        </h2>
        <button type="button" onClick={onClose} aria-label="Chiudi" className="text-muted hover:text-accent">
          ✕
        </button>
      </div>

      {viewingDoc && (
        <div>
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

        <div className="rounded-md bg-amber-300/90 p-3 text-sm text-stone-900">
          Per flaggare i checkbox ed accettare la documentazione, dovrai prima aprirla e consultarla,
          cliccando sui nomi riportati di fianco a ciascun checkbox. L&apos;ultimo checkbox sarà
          flaggabile solo dopo aver accettato la documentazione integrale.
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

        <div className="rounded-md border border-border p-3">
          <label className="block text-sm">
            Non sono un robot — quanto fa{" "}
            <strong className="text-accent">
              {captcha.a} + {captcha.b}
            </strong>
            ?
            <input
              name="captcha"
              inputMode="numeric"
              required
              placeholder="Risultato"
              autoComplete="off"
              className="input mt-2"
            />
          </label>
          <input type="hidden" name="captcha_token" value={captcha.token} />
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

function IconField({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="flex overflow-hidden rounded-md border border-border bg-background focus-within:border-accent">
      <span className="flex w-12 shrink-0 items-center justify-center border-r border-border text-muted">
        {icon}
      </span>
      <span className="flex-1 px-3 py-1.5">
        <span className="block text-xs text-muted">{label}</span>
        {children}
      </span>
    </label>
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

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 20 3M16 7l3 3M14 9l2 2" />
    </svg>
  );
}
