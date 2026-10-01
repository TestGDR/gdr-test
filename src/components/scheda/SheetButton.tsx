"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalButton from "@/components/ui/ModalButton";
import {
  ATTRIBUTES,
  REGIONS,
  SEXES,
  SOCIAL_CLASSES,
  labelOf,
} from "@/lib/character-creation";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import CreationWizard from "./CreationWizard";

// Nome del personaggio nella barra in alto: apre la sua scheda in una modale
export default function SheetButton({ characterId, name }: { characterId: string; name: string }) {
  // Ogni apertura ricarica la scheda aggiornata dal database
  const [openCount, setOpenCount] = useState(0);

  return (
    <ModalButton
      label={name}
      title="Scheda personaggio"
      size="lg"
      className="font-serif text-accent hover:underline"
      onOpen={() => setOpenCount((c) => c + 1)}
    >
      {() => (openCount > 0 ? <SheetContent key={openCount} characterId={characterId} /> : null)}
    </ModalButton>
  );
}

function SheetContent({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [mode, setMode] = useState<"scheda" | "creazione">("scheda");

  const load = useCallback(
    () =>
      supabase
        .from("characters")
        .select("*")
        .eq("id", characterId)
        .single<Character>()
        .then(({ data }) => setCharacter(data)),
    [supabase, characterId],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!character) return <p className="text-center text-muted">Caricamento...</p>;

  if (mode === "creazione") {
    return (
      <CreationWizard
        character={character}
        onExit={() => load().then(() => setMode("scheda"))}
        onCreated={() =>
          load().then(() => {
            setMode("scheda");
            router.refresh(); // aggiorna mappa e barra: il PG ora e' attivo
          })
        }
      />
    );
  }

  return <CharacterSheet character={character} onCreate={() => setMode("creazione")} />;
}

function CharacterSheet({ character, onCreate }: { character: Character; onCreate: () => void }) {
  const active = character.status === "attivo";
  const started = character.creation_step > 0;

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-border pb-4">
        {character.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.avatar_url} alt="" className="h-16 w-16 rounded-md object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-background font-serif text-3xl text-accent">
            {character.name[0]}
          </div>
        )}
        <div>
          <h3 className="font-serif text-2xl text-foreground">{character.name}</h3>
          <span
            className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold tracking-wider uppercase ${
              active ? "bg-green-900/50 text-green-300" : "bg-blood/30 text-orange-200"
            }`}
          >
            {active ? "Attivo" : "Non attivo"}
          </span>
        </div>
      </div>

      {!active ? (
        <div className="flex flex-col items-center py-12 text-center">
          <p className="max-w-sm text-muted">
            Il tuo personaggio non è ancora stato creato: finché non lo completi puoi esplorare
            mappa e documentazione, ma non giocare nelle chat.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="btn mt-6 px-10 py-3 text-lg tracking-[0.2em] uppercase"
          >
            {started ? "Continua creazione" : "Crea PG"}
          </button>
        </div>
      ) : (
        <div className="space-y-5 pt-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Field label="Sesso" value={labelOf(SEXES, character.sex)} />
            <Field label="Età" value={character.age ? `${character.age} anni` : "—"} />
            <Field label="Origine" value={labelOf(REGIONS, character.region)} />
            <Field label="Ceto" value={labelOf(SOCIAL_CLASSES, character.social_class)} />
          </dl>

          <section>
            <h4 className="mb-2 font-serif text-accent">Caratteristiche</h4>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ATTRIBUTES.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {a.label}
                  <strong className="text-lg text-accent">{character.attributes?.[a.id] ?? "—"}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="mb-1 font-serif text-accent">Aspetto</h4>
            <p className="text-sm leading-relaxed whitespace-pre-line">{character.appearance}</p>
          </section>
          <section>
            <h4 className="mb-1 font-serif text-accent">Storia</h4>
            <p className="text-sm leading-relaxed whitespace-pre-line">{character.description}</p>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted uppercase">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
