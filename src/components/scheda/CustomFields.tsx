"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomValue } from "@/lib/character-creation";
import {
  cfg,
  customValueText,
  FIELD_TYPES,
  type BlockConfig,
  type CreationBlock,
} from "@/lib/creation-flow";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import { PaperRow } from "./PaperSheet";

type FieldDef = { id: string; c: BlockConfig };

// Campi personalizzati della creazione (Gestione -> Creazione personaggio)
function useCustomFields(characterId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [defs, setDefs] = useState<FieldDef[] | null>(null);
  const [priv, setPriv] = useState<Record<string, CustomValue> | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from("creation_blocks")
        .select("id, kind, config, sort_order, step_id")
        .eq("kind", "campo")
        .order("sort_order"),
      supabase
        .from("character_private_fields")
        .select("data")
        .eq("character_id", characterId)
        .maybeSingle(),
    ]).then(([b, p]) => {
      setDefs(
        ((b.data ?? []) as CreationBlock[]).map((x) => ({
          id: x.id,
          c: cfg(x),
        })),
      );
      // senza permesso la riga non arriva: i campi riservati restano nascosti
      setPriv(
        (p.data?.data as Record<string, CustomValue> | undefined) ?? null,
      );
    });
  }, [supabase, characterId]);

  return { supabase, defs, priv, setPriv };
}

// Righe della pagina Dati: i campi visibili a tutti e, a chi puo' vederli, quelli riservati
export function CustomFieldRows({ character }: { character: Character }) {
  const { defs, priv } = useCustomFields(character.id);
  if (!defs) return null;
  const pub = character.custom_fields ?? {};
  const rows = defs.filter(
    ({ c }) =>
      c.key &&
      (c.visibility === "pubblico" ||
        (c.visibility === "riservato" && priv !== null)),
  );
  if (!rows.length) return null;
  return (
    <>
      {rows.map(({ id, c }) => {
        const v = c.visibility === "pubblico" ? pub[c.key!] : priv?.[c.key!];
        return (
          <PaperRow
            key={id}
            label={
              c.visibility === "riservato"
                ? `${c.label} (riservato)`
                : (c.label ?? "")
            }
            wrap
            value={
              <span className="whitespace-pre-line">
                {customValueText(c, v)}
              </span>
            }
          />
        );
      })}
    </>
  );
}

// Scheda -> Gestisci (admin): correggere i campi personalizzati
export function CustomFieldsManage({
  character,
  onSaved,
}: {
  character: Character;
  onSaved: () => void;
}) {
  const { supabase, defs, priv } = useCustomFields(character.id);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!defs) return null;
  if (!defs.length) return null;
  // valori come testo modificabile (le scelte multiple separate da virgola)
  const current =
    values ??
    Object.fromEntries(
      defs.map(({ c }) => {
        const v =
          c.visibility === "pubblico"
            ? character.custom_fields?.[c.key!]
            : priv?.[c.key!];
        return [
          c.key!,
          v === undefined
            ? ""
            : Array.isArray(v)
              ? v.join(", ")
              : typeof v === "boolean"
                ? v
                  ? "si"
                  : "no"
                : String(v),
        ];
      }),
    );

  async function save() {
    const pub: Record<string, CustomValue> = {};
    const prv: Record<string, CustomValue> = {};
    for (const { c } of defs!) {
      const raw = (current[c.key!] ?? "").trim();
      if (!raw) continue;
      let v: CustomValue = raw;
      if (c.type === "numero") v = Number(raw);
      if (c.type === "si_no") v = /^s/i.test(raw);
      if (c.type === "scelta_multipla")
        v = raw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      (c.visibility === "pubblico" ? pub : prv)[c.key!] = v;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("admin_set_custom_fields", {
      p_character: character.id,
      p_public: pub,
      p_private: prv,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Salvataggio non riuscito." });
    setMsg({ ok: true, text: "Campi salvati." });
    onSaved();
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h4 className="font-serif text-lg text-accent">Campi personalizzati</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {defs.map(({ id, c }) => (
          <label key={id} className="block">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
              {c.label}{" "}
              <span className="normal-case">
                ({FIELD_TYPES[c.type ?? "testo"]}, {c.visibility})
              </span>
            </span>
            <input
              value={current[c.key!] ?? ""}
              placeholder={
                c.type === "si_no"
                  ? "sì / no"
                  : c.type === "scelta_multipla"
                    ? "valori separati da virgola"
                    : c.options?.join(" / ")
              }
              onChange={(e) =>
                setValues({ ...current, [c.key!]: e.target.value })
              }
              className="input py-1.5"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="btn px-4 py-1.5 text-sm"
        >
          Salva campi
        </button>
        {msg && (
          <span
            className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}
