"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { approveCharacter, sendBackCharacter } from "@/app/scheda/actions";
import {
  sanitizeCreationData,
  type CreationData,
} from "@/lib/character-creation";
import { loadFlow, type CreationStep } from "@/lib/creation-flow";
import { loadCatalog, type Skill, type Trait } from "@/lib/rules/catalog";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import { Summary } from "./CreationWizard";

// Scheda di un PG in attesa di approvazione, vista dallo staff che approva:
// tutte le scelte della creazione e i pulsanti "Sblocca e conferma" / "Rimanda"
export default function ReviewPanel({
  character,
  onDone,
}: {
  character: Character;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [state, setState] = useState<{
    data: CreationData;
    flow: CreationStep[];
    skills: Skill[];
    traits: Trait[];
  } | null>(null);
  const [note, setNote] = useState("");
  const [sendingBack, setSendingBack] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    Promise.all([
      supabase
        .from("character_drafts")
        .select("data")
        .eq("character_id", character.id)
        .maybeSingle(),
      loadFlow(supabase),
      loadCatalog(supabase),
    ]).then(([d, flow, cat]) =>
      setState({
        data: sanitizeCreationData(d.data?.data),
        flow,
        skills: cat.skills,
        traits: cat.traits,
      }),
    );
  }, [supabase, character.id]);

  function approve() {
    if (
      !window.confirm(
        `Sbloccare e confermare ${character.name}? Il personaggio diventa attivo e può giocare.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await approveCharacter(character.id);
      if (res.error) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: "Personaggio approvato." });
      router.refresh();
      onDone();
    });
  }

  function sendBack() {
    startTransition(async () => {
      const res = await sendBackCharacter(character.id, note.trim());
      if (res.error) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: "Personaggio rimandato in creazione." });
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-4 p-6 text-left">
      <h3 className="border-b border-border pb-2 font-serif text-2xl text-accent">
        Approvazione di {character.name}
      </h3>
      <p className="text-sm text-muted">
        Il giocatore ha inviato il personaggio in approvazione (trovi anche il
        ticket nella sezione Approvazione PG). Controlla le scelte: con{" "}
        <strong>Sblocca e conferma</strong> il PG diventa attivo; con{" "}
        <strong>Rimanda</strong> torna in creazione con le scelte già fatte,
        così il giocatore può correggerle e rimandarlo.
      </p>
      {!state ? (
        <p className="text-muted">Caricamento...</p>
      ) : (
        <div className="border border-border bg-black/30 p-4">
          <Summary
            name={character.name}
            flow={state.flow}
            data={state.data}
            skills={state.skills}
            traits={state.traits}
            review
          />
        </div>
      )}
      {sendingBack ? (
        <div className="space-y-2 border border-accent/40 bg-black/40 p-3">
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
              Nota per il giocatore (cosa correggere)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              className="input resize-y text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={sendBack}
              className="btn px-4 py-1.5 text-sm"
            >
              {pending ? "..." : "Rimanda in creazione"}
            </button>
            <button
              type="button"
              onClick={() => setSendingBack(false)}
              className="btn-ghost px-4 py-1.5 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !state}
            onClick={approve}
            className="btn px-5 py-2 text-sm tracking-widest uppercase"
          >
            {pending ? "..." : "Sblocca e conferma"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setSendingBack(true)}
            className="btn-ghost px-5 py-2 text-sm tracking-widest uppercase"
          >
            Rimanda
          </button>
        </div>
      )}
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
