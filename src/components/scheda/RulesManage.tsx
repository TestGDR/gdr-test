"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  choiceLabel,
  loadCatalog,
  type CharacterTrait,
  type Skill,
  type Trait,
} from "@/lib/rules/catalog";
import { RULES } from "@/lib/rules/config";
import { useStats } from "@/lib/rules/useStats";
import { skillLevelCap } from "@/lib/rules/engine";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";

const label = "mb-1 block text-xs tracking-wider text-muted uppercase";

// Modifica di una parte del regolamento del PG (non legata ai limiti della creazione):
// - "progress": PX, Risorse e Onore (Gestisci, solo admin)
// - "skills": livelli delle abilita' (pagina Abilita', pennina di admin e moderatori)
// - "traits": vantaggi e svantaggi (pagina Tratti, pennina di admin e moderatori)
export default function RulesManage({
  character,
  onSaved,
  section,
  onDone,
}: {
  character: Character;
  onSaved: () => void;
  section: "progress" | "skills" | "traits";
  onDone?: () => void; // torna alla lettura
}) {
  const stats = useStats();
  const supabase = useMemo(() => createClient(), []);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [levels, setLevels] = useState<Record<string, number> | null>(null);
  const [owned, setOwned] = useState<CharacterTrait[]>([]);
  const [progress, setProgress] = useState({
    px: String(character.px ?? 0),
    resources: String(character.resources ?? 0),
    honor: String(character.honor ?? RULES.honor.start),
  });
  const [hp, setHp] = useState({
    value:
      character.hp_current === null || character.hp_current === undefined
        ? ""
        : String(character.hp_current),
    dead: !!character.dead_at,
  });
  const [addTrait, setAddTrait] = useState("");
  const [addChoice, setAddChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [catalog, { data: lv }, { data: tr }] = await Promise.all([
      loadCatalog(supabase),
      supabase
        .from("character_skills")
        .select("skill_id, level")
        .eq("character_id", character.id),
      supabase
        .from("character_traits")
        .select("trait_id, choice")
        .eq("character_id", character.id),
    ]);
    setSkills(catalog.skills);
    setTraits(catalog.traits);
    setLevels(
      Object.fromEntries(
        (lv ?? []).map((l) => [l.skill_id as string, l.level as number]),
      ),
    );
    setOwned((tr ?? []) as CharacterTrait[]);
  }, [supabase, character.id]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const done = (error: { message: string } | null, ok: string) => {
    setBusy(false);
    if (error)
      return setMsg({
        ok: false,
        text:
          error.message.length < 140
            ? error.message
            : "Operazione non riuscita.",
      });
    setMsg({ ok: true, text: ok });
    load();
    onSaved();
  };

  async function saveProgress() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("admin_set_progress", {
      p_character: character.id,
      p_px: Math.max(0, Math.trunc(Number(progress.px)) || 0),
      p_resources: Math.max(0, Math.trunc(Number(progress.resources)) || 0),
      p_honor: Math.min(
        RULES.honor.max,
        Math.max(RULES.honor.min, Math.trunc(Number(progress.honor)) || 0),
      ),
    });
    done(error, "PX, Risorse e Onore salvati.");
  }

  // PF attuali: vuoto = pieni; il recupero giornaliero riparte da adesso
  async function saveHp() {
    setBusy(true);
    setMsg(null);
    const v = hp.value.trim();
    const { error } = await supabase.rpc("admin_set_hp", {
      p_character: character.id,
      p_hp: v === "" ? null : Math.trunc(Number(v)) || 0,
      p_dead: hp.dead,
    });
    done(error, "Punti ferita salvati.");
  }

  async function saveLevels() {
    if (!levels) return;
    setBusy(true);
    setMsg(null);
    const rows = Object.entries(levels).map(([skill_id, level]) => ({
      character_id: character.id,
      skill_id,
      level,
    }));
    const zero = rows.filter((r) => r.level === 0).map((r) => r.skill_id);
    const keep = rows.filter((r) => r.level > 0);
    const res1 = keep.length
      ? await supabase.from("character_skills").upsert(keep)
      : { error: null };
    const res2 = zero.length
      ? await supabase
          .from("character_skills")
          .delete()
          .eq("character_id", character.id)
          .in("skill_id", zero)
      : { error: null };
    done(res1.error ?? res2.error, "Abilità salvate.");
  }

  async function addOwnedTrait() {
    const t = traits.find((x) => x.id === addTrait);
    if (!t) return;
    if (t.choice !== "nessuna" && !addChoice)
      return setMsg({
        ok: false,
        text: `Scegli ${t.choice === "abilita" ? "l'abilità" : "la statistica"}.`,
      });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("character_traits").insert({
      character_id: character.id,
      trait_id: t.id,
      choice: t.choice === "nessuna" ? null : addChoice,
    });
    setAddTrait("");
    setAddChoice("");
    done(error, `${t.name} aggiunto.`);
  }

  async function removeTrait(id: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("character_traits")
      .delete()
      .eq("character_id", character.id)
      .eq("trait_id", id);
    done(error, "Tratto tolto.");
  }

  const picked = traits.find((x) => x.id === addTrait);
  // un'abilita' non supera mai il valore della sua statistica (e 10)
  const capOf = (stat: string) =>
    skillLevelCap(Number(character.attributes?.[stat]) || RULES.statMin);

  return (
    <section
      className={
        section === "progress"
          ? "space-y-4 border-t border-border pt-4"
          : "space-y-4"
      }
    >
      {section === "progress" && (
        <h4 className="font-serif text-lg text-accent">
          PX, Risorse, Onore e Punti ferita
        </h4>
      )}
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}

      {section === "progress" && (
        <div className="flex flex-wrap items-end gap-3">
          {(
            [
              ["px", "PX"],
              ["resources", "Risorse"],
              ["honor", `Onore (${RULES.honor.min}-${RULES.honor.max})`],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="block">
              <span className={label}>{l}</span>
              <input
                type="number"
                min={0}
                value={progress[k]}
                onChange={(e) =>
                  setProgress((p) => ({ ...p, [k]: e.target.value }))
                }
                className="input w-28! py-1.5"
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={saveProgress}
            className="btn px-4 py-1.5 text-sm"
          >
            Salva
          </button>
        </div>
      )}

      {section === "progress" && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border/50 pt-3">
          <label className="block">
            <span className={label}>PF attuali (vuoto = pieni)</span>
            <input
              type="number"
              value={hp.value}
              onChange={(e) => setHp((h) => ({ ...h, value: e.target.value }))}
              className="input w-28! py-1.5"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={hp.dead}
              onChange={(e) => setHp((h) => ({ ...h, dead: e.target.checked }))}
            />
            Morto
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={saveHp}
            className="btn px-4 py-1.5 text-sm"
          >
            Salva PF
          </button>
          <p className="w-full text-xs text-muted">
            I PF scendono da soli negli attacchi in chat e risalgono ogni giorno
            del valore di Recupero. Togliendo &quot;Morto&quot; il personaggio
            torna in vita con i PF scritti qui.
          </p>
        </div>
      )}

      {section === "skills" && (
        <div>
          <p className={label}>
            Abilità (livello 0-{RULES.skillMax}, mai oltre il valore della
            statistica)
          </p>
          {!levels ? (
            <p className="text-sm text-muted">Caricamento...</p>
          ) : (
            <>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {stats.map((s) => (
                  <div key={s.id} className="space-y-1">
                    <p className="mt-2 text-xs font-semibold text-accent">
                      {s.label}
                    </p>
                    {skills
                      .filter((k) => k.stat === s.id)
                      .map((k) => (
                        <label
                          key={k.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span
                            className={
                              k.active ? "" : "text-muted line-through"
                            }
                          >
                            {k.name}
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={capOf(k.stat)}
                            value={levels[k.id] ?? 0}
                            onChange={(e) =>
                              setLevels((l) => ({
                                ...l,
                                [k.id]: Math.min(
                                  capOf(k.stat),
                                  Math.max(
                                    0,
                                    Math.trunc(Number(e.target.value)) || 0,
                                  ),
                                ),
                              }))
                            }
                            className="input w-16! py-0.5 text-center"
                          />
                        </label>
                      ))}
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={saveLevels}
                className="btn mt-3 px-4 py-1.5 text-sm"
              >
                Salva abilità
              </button>
              {onDone && (
                <button
                  type="button"
                  onClick={onDone}
                  className="btn-ghost mt-3 ml-2 px-4 py-1.5 text-sm"
                >
                  Chiudi
                </button>
              )}
            </>
          )}
        </div>
      )}

      {section === "traits" && (
        <div>
          <p className={label}>Tratti</p>
          <ul className="mb-2 space-y-1 text-sm">
            {owned.length === 0 && (
              <li className="text-muted">Nessun tratto.</li>
            )}
            {owned.map((o) => {
              const t = traits.find((x) => x.id === o.trait_id);
              if (!t) return null;
              return (
                <li
                  key={o.trait_id}
                  className="flex items-center justify-between gap-2 border-b border-border/40 py-1"
                >
                  <span>
                    <span
                      className={
                        t.kind === "vantaggio"
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {t.kind === "vantaggio" ? "+" : "−"}
                    </span>{" "}
                    {t.name}
                    {o.choice && (
                      <span className="text-accent">
                        {" "}
                        · {choiceLabel(t, o.choice, skills)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeTrait(o.trait_id)}
                    className="text-xs text-muted hover:text-red-400"
                  >
                    Togli
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={addTrait}
              onChange={(e) => (setAddTrait(e.target.value), setAddChoice(""))}
              className="input w-64! py-1.5"
            >
              <option value="">Aggiungi un tratto...</option>
              {(["vantaggio", "svantaggio"] as const).map((kind) => (
                <optgroup
                  key={kind}
                  label={kind === "vantaggio" ? "Vantaggi" : "Svantaggi"}
                >
                  {traits
                    .filter(
                      (t) =>
                        t.kind === kind &&
                        !owned.some((o) => o.trait_id === t.id),
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.cost})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {picked && picked.choice !== "nessuna" && (
              <select
                value={addChoice}
                onChange={(e) => setAddChoice(e.target.value)}
                className="input w-56! py-1.5"
              >
                <option value="">
                  {picked.choice === "abilita"
                    ? "Quale abilità?"
                    : "Quale statistica?"}
                </option>
                {picked.choice === "abilita"
                  ? skills.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))
                  : stats.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
              </select>
            )}
            <button
              type="button"
              disabled={busy || !addTrait}
              onClick={addOwnedTrait}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Aggiungi
            </button>
            {onDone && (
              <button
                type="button"
                onClick={onDone}
                className="btn-ghost px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
