"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { resetCharacter } from "@/app/scheda/actions";
import { AGE_MAX, AGE_MIN, ATTRIBUTES, SEXES } from "@/lib/character-creation";
import { RULES } from "@/lib/rules/config";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import { CustomFieldsManage } from "./CustomFields";
import BirthPicker from "./BirthPicker";
import MaritalManage from "./MaritalManage";
import RulesManage from "./RulesManage";

// Scheda -> Gestisci. L'admin modifica velocemente i campi principali del PG e
// sblocca/blocca la scheda; con la scheda sbloccata il proprietario modifica
// gli stessi campi (tranne lo sblocco)
export default function SheetManage({
  character,
  isAdmin,
  onSaved,
}: {
  character: Character;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const unlocked = !!character.sheet_unlocks?.includes("scheda");
  const [name, setName] = useState(character.name);
  const [sex, setSex] = useState(character.sex ?? "uomo");
  const [age, setAge] = useState(String(character.age ?? ""));
  const [birth, setBirth] = useState<{ day?: number; month?: number }>({
    day: character.birth_day ?? undefined,
    month: character.birth_month ?? undefined,
  });
  const [attrs, setAttrs] = useState<Record<string, number>>(
    Object.fromEntries(
      ATTRIBUTES.map((a) => [
        a.id,
        Number(character.attributes?.[a.id]) || RULES.statMin,
      ]),
    ),
  );
  const [faceClaim, setFaceClaim] = useState(character.face_claim ?? "");
  const [looks, setLooks] = useState({
    height: character.height ?? "",
    eye_color: character.eye_color ?? "",
    hair_color: character.hair_color ?? "",
    visible_marks: character.visible_marks ?? "",
  });
  const [story, setStory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase
      .from("character_backgrounds")
      .select("body")
      .eq("character_id", character.id)
      .maybeSingle()
      .then(({ data }) => setStory((data?.body as string | undefined) ?? ""));
  }, [supabase, character.id]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("sheet_manage_update", {
      p_character: character.id,
      p_name: name,
      p_sex: sex,
      p_age: Number(age),
      p_attributes: attrs,
      p_face_claim: faceClaim,
      p_story: story ?? "",
      p_height: looks.height,
      p_eye_color: looks.eye_color,
      p_hair_color: looks.hair_color,
      p_visible_marks: looks.visible_marks,
    });
    // data di nascita (solo admin): l'anno si ricalcola dall'eta' appena salvata
    const birthError =
      !error && isAdmin && birth.day && birth.month
        ? (
            await supabase.rpc("set_birthday", {
              p_character: character.id,
              p_day: birth.day,
              p_month: birth.month,
            })
          ).error
        : null;
    setBusy(false);
    if (error || birthError)
      return setMsg({
        ok: false,
        text:
          (error ?? birthError)!.message.length < 140
            ? (error ?? birthError)!.message
            : "Scheda non salvata.",
      });
    setMsg({ ok: true, text: "Scheda salvata." });
    onSaved();
    router.refresh(); // il nome compare anche nella barra e nei presenti
  }

  async function toggleUnlock() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("set_sheet_unlock", {
      p_character: character.id,
      p_section: "scheda",
      p_on: !unlocked,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Operazione non riuscita." });
    onSaved();
  }

  return (
    <div className="space-y-5 p-6">
      <h3 className="border-b border-border pb-2 font-serif text-2xl text-accent">
        {isAdmin ? "Gestisci la scheda" : "Modifica la scheda"}
      </h3>

      {isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-accent/50 bg-black/40 px-3 py-2 text-sm">
          <span className="text-muted">
            {unlocked ? (
              <span className="text-green-400">
                Scheda sbloccata: il giocatore può modificare questi campi.
              </span>
            ) : (
              "Scheda bloccata: questi campi li modifica solo l'admin."
            )}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={toggleUnlock}
            className={`${unlocked ? "btn-ghost" : "btn"} px-3 py-1 text-xs tracking-[0.12em] uppercase`}
          >
            {unlocked ? "Blocca scheda" : "Sblocca scheda"}
          </button>
        </div>
      ) : (
        <p className="border border-[#d4a72c]/40 bg-[#d4a72c]/5 px-3 py-2 text-sm text-[#f0c75e]">
          L&apos;admin ha sbloccato la tua scheda: puoi correggere questi campi
          finché non la riblocca.
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Nome
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="input py-1.5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Sesso
          </span>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            className="input w-36! py-1.5"
          >
            {SEXES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Età
          </span>
          <input
            type="number"
            min={AGE_MIN}
            max={AGE_MAX}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="input w-24! py-1.5"
          />
        </label>
        {isAdmin && (
          <div>
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
              Nascita (giorno e luna)
            </span>
            <BirthPicker value={birth} onChange={setBirth} />
          </div>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Prestavolto
        </span>
        <input
          value={faceClaim}
          onChange={(e) => setFaceClaim(e.target.value)}
          maxLength={80}
          className="input py-1.5"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["height", "Altezza", 30],
            ["eye_color", "Colore occhi", 40],
            ["hair_color", "Colore capelli", 40],
          ] as const
        ).map(([key, label, max]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
              {label}
            </span>
            <input
              value={looks[key]}
              onChange={(e) =>
                setLooks((x) => ({ ...x, [key]: e.target.value }))
              }
              maxLength={max}
              className="input py-1.5"
            />
          </label>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Segni visibili
        </span>
        <textarea
          value={looks.visible_marks}
          onChange={(e) =>
            setLooks((x) => ({ ...x, visible_marks: e.target.value }))
          }
          maxLength={300}
          rows={2}
          className="input resize-y text-sm"
        />
      </label>

      <div>
        <p className="mb-1 text-xs tracking-wider text-muted uppercase">
          Statistiche ({RULES.statMin}-{RULES.statMax})
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ATTRIBUTES.map((a) => (
            <label
              key={a.id}
              className="flex items-center justify-between gap-2 border border-border/60 bg-black/30 px-2 py-1.5 text-sm"
            >
              <span title={a.description}>
                {a.code} · {a.label}
              </span>
              <input
                type="number"
                min={RULES.statMin}
                max={RULES.statMax}
                value={attrs[a.id] ?? RULES.statMin}
                onChange={(e) =>
                  setAttrs((x) => ({
                    ...x,
                    [a.id]: Math.min(
                      RULES.statMax,
                      Math.max(
                        RULES.statMin,
                        Math.trunc(Number(e.target.value)) || 0,
                      ),
                    ),
                  }))
                }
                className="input w-16! py-1 text-center"
              />
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Storia (background)
        </span>
        {story === null ? (
          <p className="text-sm text-muted">Caricamento...</p>
        ) : (
          <>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              maxLength={4000}
              rows={10}
              className="input resize-y text-sm"
            />
            <span className="text-xs text-muted">
              {story.length} / 4.000 caratteri
            </span>
          </>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button
          type="button"
          disabled={busy || story === null}
          onClick={save}
          className="btn px-5 py-1.5 text-sm"
        >
          {busy ? "Salvataggio..." : "Salva"}
        </button>
        {msg && (
          <span
            className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>

      {isAdmin && (
        <RulesManage
          character={character}
          onSaved={onSaved}
          section="progress"
        />
      )}
      {isAdmin && (
        <CustomFieldsManage character={character} onSaved={onSaved} />
      )}
      {isAdmin && <MaritalManage character={character} onSaved={onSaved} />}
      {isAdmin && <ResetCharacter character={character} />}
      {isAdmin && character.sex === "donna" && (
        <section className="space-y-2 border-t border-border pt-4">
          <h4 className="font-serif text-lg text-accent">Gravidanza</h4>
          <p className="text-xs text-muted">
            Interrompe la gravidanza in corso (per correzioni o decisioni
            narrative). Non arriva nessun messaggio alla giocatrice.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Interrompere la gravidanza in corso?"))
                return;
              setBusy(true);
              const { error } = await supabase.rpc("pregnancy_admin_end", {
                p_character: character.id,
              });
              setBusy(false);
              setMsg(
                error
                  ? { ok: false, text: "Operazione non riuscita." }
                  : { ok: true, text: "Gravidanza interrotta." },
              );
              if (!error) onSaved();
            }}
            className="btn-ghost px-3 py-1 text-xs tracking-[0.12em] uppercase"
          >
            Interrompi gravidanza
          </button>
        </section>
      )}
    </div>
  );
}

// Admin: reset completo del PG, che torna in creazione da capo. Per
// confermare si scrive il nome del personaggio (dentro la scheda, senza finestre del browser)
function ResetCharacter({ character }: { character: Character }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    if (typed.trim() !== character.name)
      return setMsg("Il nome non corrisponde: reset annullato.");
    startTransition(async () => {
      const res = await resetCharacter(character.id);
      if (res.error) return setMsg(res.error);
      setMsg("Personaggio resettato.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 border-t border-red-900/60 pt-4">
      <h4 className="font-serif text-lg text-red-400">
        Resetta il personaggio
      </h4>
      <p className="text-xs text-muted">
        Il PG torna in creazione da capo (va rifatta e rimandata in
        approvazione). Perde statistiche, abilità, tratti, oggetti, storia,
        casata, drago (torna libero), monete, PX e campi della creazione.
        Restano nome, immagini e messaggi.
      </p>
      {open ? (
        <div className="space-y-2 border border-red-900/70 bg-red-950/20 p-3">
          <label className="block">
            <span className="mb-1 block text-xs text-red-300">
              Per confermare scrivi il nome del personaggio:{" "}
              <strong>{character.name}</strong>
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input py-1.5"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || typed.trim() !== character.name}
              onClick={reset}
              className="border border-red-800 bg-red-900/40 px-3 py-1 text-xs tracking-[0.12em] text-red-100 uppercase hover:bg-red-800/60 disabled:opacity-40"
            >
              {pending ? "..." : "Resetta definitivamente"}
            </button>
            <button
              type="button"
              onClick={() => (setOpen(false), setTyped(""), setMsg(null))}
              className="btn-ghost px-3 py-1 text-xs"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-red-800 px-3 py-1 text-xs tracking-[0.12em] text-red-300 uppercase hover:bg-red-950/40"
        >
          Resetta personaggio
        </button>
      )}
      {msg && <p className="text-sm text-[#f0c75e]">{msg}</p>}
    </section>
  );
}
