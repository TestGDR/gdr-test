"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  choiceLabel,
  loadCatalog,
  traitHpBonus,
  type CharacterTrait,
  type Skill,
  type Trait,
} from "@/lib/rules/catalog";
import { RULES } from "@/lib/rules/config";
import {
  capTraitModifiers,
  deriveStats,
  pxCostForNext,
  type Stats,
} from "@/lib/rules/engine";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import RulesManage from "./RulesManage";

// Statistiche del PG (1-10); quelle mancanti valgono il minimo
export function statsOf(character: Character): Stats {
  return Object.fromEntries(
    RULES.stats.map((s) => [
      s.id,
      Number(character.attributes?.[s.id]) || RULES.statMin,
    ]),
  ) as Stats;
}

// Abilita', tratti del PG e catalogo
function useRulesData(characterId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<{
    skills: Skill[];
    traits: Trait[];
    levels: Record<string, number>;
    owned: CharacterTrait[];
  } | null>(null);

  const load = useCallback(async () => {
    const [catalog, { data: levels }, { data: owned }] = await Promise.all([
      loadCatalog(supabase),
      supabase
        .from("character_skills")
        .select("skill_id, level")
        .eq("character_id", characterId),
      supabase
        .from("character_traits")
        .select("trait_id, choice")
        .eq("character_id", characterId),
    ]);
    setData({
      ...catalog,
      levels: Object.fromEntries(
        (levels ?? []).map((l) => [l.skill_id as string, l.level as number]),
      ),
      owned: (owned ?? []) as CharacterTrait[],
    });
  }, [supabase, characterId]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  return { data, reload: load, supabase };
}

// Modificatore dei tratti (sempre attivi, senza condizioni) su un'abilita'
function skillTraitMod(skill: Skill, owned: CharacterTrait[], traits: Trait[]) {
  const mods: number[] = [];
  for (const o of owned) {
    const t = traits.find((x) => x.id === o.trait_id);
    for (const m of t?.modifiers ?? []) {
      if (m.condition) continue;
      if (m.target === "skill" && m.skill === skill.name) mods.push(m.value);
      if (m.target === "choice_skill" && o.choice === skill.id)
        mods.push(m.value);
      if (m.target === "stat" && m.stat === skill.stat) mods.push(m.value);
      if (m.target === "choice_stat" && o.choice === skill.stat)
        mods.push(m.value);
    }
  }
  return capTraitModifiers(mods);
}

function Title({
  children,
  onEdit,
}: {
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <h3 className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2 font-serif text-2xl text-accent">
      {children}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title={`Modifica: ${children}`}
          aria-label={`Modifica: ${children}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-black/60 text-muted transition hover:border-accent hover:text-accent"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
          </svg>
        </button>
      )}
    </h3>
  );
}

// ---------------------------------------------------------------------
// Statistiche derivate, PX, Risorse e Onore (pagina Caratteristiche)
// ---------------------------------------------------------------------
export function DerivedPanel({ character }: { character: Character }) {
  const { data } = useRulesData(character.id);
  const d = deriveStats(
    statsOf(character),
    data ? traitHpBonus(data.owned, data.traits) : 0,
  );
  const rows: [string, string][] = [
    ["Punti Ferita", `${character.hp_current ?? d.hp} / ${d.hp}`],
    ["Stamina", `${character.stamina_current ?? d.stamina} / ${d.stamina}`],
    ["Recupero", String(d.rec)],
    ["Corsa", `${d.run} m a round`],
    ["Salto", `${d.jump} m (da fermo ${d.jumpStanding} m)`],
    ["Carico senza malus", `${d.carry} kg`],
    ["Danno a mani nude", d.unarmed],
  ];
  return (
    <div className="grid w-full gap-4 sm:grid-cols-[1fr_auto]">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="border-b border-border/50 pb-1">
            <dt className="text-[0.7rem] tracking-[0.14em] text-muted uppercase">
              {k}
            </dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <dl className="flex gap-3 sm:flex-col">
        {(
          [
            ["PX", character.px ?? 0],
            ["Risorse", character.resources ?? 0],
            [
              "Onore",
              `${character.honor ?? RULES.honor.start} / ${RULES.honor.max}`,
            ],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            className="min-w-24 border border-accent/40 bg-black/30 px-3 py-2 text-center"
          >
            <dt className="text-[0.65rem] tracking-[0.16em] text-muted uppercase">
              {k}
            </dt>
            <dd className="font-serif text-xl text-accent">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------
// Pagina Abilita': livelli divisi per statistica; il proprietario sale di
// livello spendendo PX (10 x livello)
// ---------------------------------------------------------------------
export function SkillsPage({
  character,
  isOwn,
  canEdit,
  onSaved,
}: {
  character: Character;
  isOwn: boolean;
  canEdit: boolean; // admin e moderatori: pennina per cambiare i livelli
  onSaved: () => void;
}) {
  const { data, reload, supabase } = useRulesData(character.id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stats = statsOf(character);
  const px = character.px ?? 0;

  async function raise(skill: Skill, level: number) {
    const cost = pxCostForNext(level);
    if (
      !window.confirm(
        `Portare ${skill.name} al livello ${level + 1} spendendo ${cost} PX?`,
      )
    )
      return;
    setBusy(skill.id);
    setMsg(null);
    const { error } = await supabase.rpc("spend_px", {
      p_character: character.id,
      p_skill: skill.id,
    });
    setBusy(null);
    if (error)
      return setMsg({
        ok: false,
        text:
          error.message.length < 140
            ? error.message
            : "Operazione non riuscita.",
      });
    setMsg({ ok: true, text: `${skill.name} ora è al livello ${level + 1}.` });
    await reload();
    onSaved();
  }

  if (editing)
    return (
      <div className="p-6">
        <Title>Abilità</Title>
        <RulesManage
          character={character}
          section="skills"
          onSaved={() => (reload(), onSaved())}
          onDone={() => setEditing(false)}
        />
      </div>
    );

  return (
    <div className="p-6">
      <Title onEdit={canEdit ? () => setEditing(true) : undefined}>
        Abilità
      </Title>
      <p className="mb-4 text-sm text-muted">
        Ogni prova è{" "}
        <strong className="text-foreground">statistica + abilità + d10</strong>.
        Un&apos;abilità che non hai vale 0.{" "}
        {isOwn && (
          <>
            Hai <strong className="text-accent">{px} PX</strong>: salire al
            livello N costa N × 10 PX.
          </>
        )}
      </p>
      {msg && (
        <p
          className={`mb-3 text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
        >
          {msg.text}
        </p>
      )}
      {!data ? (
        <p className="text-muted">Caricamento...</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {RULES.stats.map((s) => {
            const list = data.skills.filter(
              (k) => k.stat === s.id && (k.active || data.levels[k.id]),
            );
            if (!list.length) return null;
            return (
              <section key={s.id}>
                <h4 className="mb-2 flex items-baseline justify-between border-b border-accent/30 pb-1 font-serif text-lg text-accent">
                  {s.label}
                  <span className="text-xs tracking-[0.14em] text-muted">
                    {s.code} {stats[s.id]}
                  </span>
                </h4>
                <ul className="space-y-1">
                  {list.map((k) => {
                    const level = data.levels[k.id] ?? 0;
                    const mod = skillTraitMod(k, data.owned, data.traits);
                    const cost = pxCostForNext(level);
                    return (
                      <li
                        key={k.id}
                        className="flex items-center gap-2 text-sm"
                        title={k.description || undefined}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${level ? "text-foreground" : "text-muted"}`}
                        >
                          {k.name}
                        </span>
                        <span
                          className="w-16 text-right text-xs text-muted"
                          title="Statistica + abilità (+ tratti)"
                        >
                          {stats[k.stat] + level + mod}
                          {mod !== 0 && (
                            <span
                              className={
                                mod > 0 ? "text-green-400" : "text-red-400"
                              }
                            >
                              {" "}
                              ({mod > 0 ? "+" : ""}
                              {mod})
                            </span>
                          )}
                        </span>
                        <strong className="w-6 text-center text-accent">
                          {level}
                        </strong>
                        {isOwn && (
                          <button
                            type="button"
                            disabled={
                              busy !== null ||
                              level >= RULES.skillMax ||
                              px < cost
                            }
                            onClick={() => raise(k, level)}
                            title={
                              level >= RULES.skillMax
                                ? "Livello massimo"
                                : `Sali al livello ${level + 1}: ${cost} PX`
                            }
                            className="h-6 w-6 border border-border text-xs hover:border-accent hover:text-accent disabled:opacity-30"
                          >
                            +
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Il numero a sinistra del livello è il bonus del tiro (statistica +
        abilità + tratti sempre attivi). I tratti che valgono solo in certe
        situazioni si aggiungono al momento.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Pagina Tratti: vantaggi e svantaggi del PG
// ---------------------------------------------------------------------
export function TraitsPage({
  character,
  canEdit,
  onSaved,
}: {
  character: Character;
  canEdit: boolean; // admin e moderatori: pennina per aggiungere e togliere tratti
  onSaved: () => void;
}) {
  const { data, reload } = useRulesData(character.id);
  const [editing, setEditing] = useState(false);

  if (editing)
    return (
      <div className="p-6">
        <Title>Tratti</Title>
        <RulesManage
          character={character}
          section="traits"
          onSaved={() => (reload(), onSaved())}
          onDone={() => setEditing(false)}
        />
      </div>
    );

  return (
    <div className="p-6">
      <Title onEdit={canEdit ? () => setEditing(true) : undefined}>
        Tratti
      </Title>
      {!data ? (
        <p className="text-muted">Caricamento...</p>
      ) : data.owned.length === 0 ? (
        <p className="py-8 text-center text-muted italic">
          Nessun vantaggio o svantaggio.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {(["vantaggio", "svantaggio"] as const).map((kind) => {
            const list = data.owned
              .map((o) => ({
                o,
                t: data.traits.find((x) => x.id === o.trait_id),
              }))
              .filter(
                (x): x is { o: CharacterTrait; t: Trait } => x.t?.kind === kind,
              );
            return (
              <section key={kind}>
                <h4 className="mb-2 border-b border-accent/30 pb-1 font-serif text-lg text-accent">
                  {kind === "vantaggio" ? "Vantaggi" : "Svantaggi"}
                </h4>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">—</p>
                ) : (
                  <ul className="space-y-3">
                    {list.map(({ o, t }) => {
                      const chosen = choiceLabel(t, o.choice, data.skills);
                      return (
                        <li key={t.id}>
                          <p className="flex items-baseline justify-between gap-2">
                            <span className="font-serif text-base text-foreground">
                              {t.name}
                              {chosen && (
                                <span className="text-accent"> · {chosen}</span>
                              )}
                            </span>
                            <span className="shrink-0 text-xs text-muted">
                              {kind === "vantaggio" ? "costo" : "valore"}{" "}
                              {t.cost}
                            </span>
                          </p>
                          <p className="text-sm text-muted">{t.effect}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
