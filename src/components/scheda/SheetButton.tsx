"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { saveSheetExtras } from "@/app/scheda/actions";
import Modal from "@/components/ui/Modal";
import ModalButton from "@/components/ui/ModalButton";
import { ATTRIBUTES, REGIONS, SEXES, SOCIAL_CLASSES, labelOf } from "@/lib/character-creation";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import CreationWizard from "./CreationWizard";

// Apre la scheda del personaggio in una modale (dal nome o da un'icona)
export default function SheetButton({
  characterId,
  trigger,
  className = "font-serif text-accent hover:underline",
}: {
  characterId: string;
  trigger: ReactNode;
  className?: string;
}) {
  // Ogni apertura ricarica la scheda aggiornata dal database
  const [openCount, setOpenCount] = useState(0);

  return (
    <ModalButton
      label={trigger}
      title="Scheda personaggio"
      size="lg"
      className={className}
      onOpen={() => setOpenCount((c) => c + 1)}
    >
      {() => (openCount > 0 ? <SheetContent key={openCount} characterId={characterId} /> : null)}
    </ModalButton>
  );
}

// Scheda di un personaggio qualsiasi aperta da codice (es. dall'anagrafica)
export function SheetModal({ characterId, onClose }: { characterId: string | null; onClose: () => void }) {
  return (
    <Modal open={characterId !== null} onClose={onClose} title="Scheda personaggio" size="lg">
      {characterId && <SheetContent key={characterId} characterId={characterId} />}
    </Modal>
  );
}

export function SheetContent({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [mode, setMode] = useState<"scheda" | "creazione">("scheda");

  const load = useCallback(
    () =>
      supabase
        .from("characters")
        .select("*, house:houses(name, sigil_url), house_role:house_roles(name)")
        .eq("id", characterId)
        .single<Character>()
        .then(({ data }) => setCharacter(data)),
    [supabase, characterId],
  );

  useEffect(() => {
    load();
    supabase.auth.getSession().then(({ data }) => setViewerId(data.session?.user.id ?? null));
  }, [load, supabase]);

  if (!character) return <p className="text-center text-muted">Caricamento...</p>;
  // La scheda e' modificabile (creazione, prestavolto, immagine) solo dal proprietario
  const isOwn = viewerId !== null && viewerId === character.owner_id;

  if (mode === "creazione" && isOwn) {
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

  return <CharacterSheet character={character} isOwn={isOwn} onCreate={() => setMode("creazione")} onSaved={load} />;
}

function CharacterSheet({
  character,
  isOwn,
  onCreate,
  onSaved,
}: {
  character: Character;
  isOwn: boolean;
  onCreate: () => void;
  onSaved: () => void;
}) {
  const active = character.status === "attivo";
  const started = character.creation_step > 0;
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-border pb-4">
        {character.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.avatar_url} alt="" className="h-20 w-20 rounded-md object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-md border border-border bg-background font-serif text-3xl text-accent">
            {character.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-2xl text-foreground">
            {character.name}
            {character.house && <span className="text-accent"> {character.house.name}</span>}
          </h3>
          {character.house && (
            <p className="flex items-center gap-2 text-sm text-muted">
              {character.house.sigil_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={character.house.sigil_url} alt="" className="h-6 w-6 object-contain" />
              )}
              Casata {character.house.name}
              {character.house_role && <> · {character.house_role.name}</>}
            </p>
          )}
          {character.face_claim && (
            <p className="text-sm text-muted">
              Prestavolto: <span className="text-foreground">{character.face_claim}</span>
            </p>
          )}
          <span
            className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold tracking-wider uppercase ${
              active ? "bg-green-900/50 text-green-300" : "bg-blood/30 text-orange-200"
            }`}
          >
            {active ? "Attivo" : "Non attivo"}
          </span>
        </div>
        {isOwn && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
            ✎ Prestavolto e immagine
          </button>
        )}
      </div>

      {isOwn && editing && (
        <ExtrasForm
          character={character}
          onDone={(saved) => {
            setEditing(false);
            if (saved) onSaved();
          }}
        />
      )}

      {!active ? (
        isOwn ? (
          <div className="flex flex-col items-center py-12 text-center">
            <p className="max-w-sm text-muted">
              Il tuo personaggio non è ancora stato creato: finché non lo completi puoi esplorare
              mappa e documentazione, ma non giocare nelle chat.
            </p>
            <button type="button" onClick={onCreate} className="btn mt-6 px-10 py-3 text-lg tracking-[0.2em] uppercase">
              {started ? "Continua creazione" : "Crea PG"}
            </button>
          </div>
        ) : (
          <p className="py-12 text-center text-muted">Questo personaggio non ha ancora completato la creazione.</p>
        )
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

// Prestavolto e immagine: li modifica solo il proprietario
function ExtrasForm({ character, onDone }: { character: Character; onDone: (saved: boolean) => void }) {
  const [faceClaim, setFaceClaim] = useState(character.face_claim ?? "");
  const [avatar, setAvatar] = useState(character.avatar_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await saveSheetExtras(character.id, faceClaim, avatar);
    setSaving(false);
    if (res.error) return setError(res.error);
    onDone(true);
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border border-border bg-background/60 p-3">
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Prestavolto (nome e cognome)</span>
        <input value={faceClaim} onChange={(e) => setFaceClaim(e.target.value)} maxLength={80} placeholder="Es. Emilia Clarke" className="input py-1.5" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Immagine del personaggio (indirizzo)</span>
        <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://..." className="input py-1.5" />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn px-4 py-1.5 text-sm" disabled={saving}>
          {saving ? "Salvataggio..." : "Salva"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="btn-ghost px-4 py-1.5 text-sm">
          Annulla
        </button>
      </div>
    </form>
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
