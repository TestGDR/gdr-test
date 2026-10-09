"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  COMBAT,
  type AttackKind,
  type DefenseKind,
  type LocationId,
} from "@/lib/rules/combat-config";
import { HP_STATE_LABEL } from "@/lib/rules/hp";
import {
  attack,
  catchBreath,
  combatStatus,
  deathSave,
  defend,
  firstAid,
  reload,
  rollInitiative,
  stabilize,
} from "../combat-actions";

type Full = Awaited<ReturnType<typeof combatStatus>>;
type Status = {
  me: NonNullable<Full["me"]>;
  pending: NonNullable<Full["pending"]>;
  others: NonNullable<Full["others"]>;
};

const field = "mb-1 block text-[0.7rem] tracking-wider text-muted uppercase";
const box = "space-y-2 border border-accent/40 bg-black/40 p-3";

// Finestra "Combattimento" della chat: chi attacca lancia l'attacco, il
// bersaglio lancia la difesa; il gioco confronta i tiri e applica il danno
export default function CombatPanel({
  roomId,
  characterId,
  others,
  onDone,
}: {
  roomId: string;
  characterId: string;
  others: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [st, setSt] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = others.map((o) => o.id).join(",");

  const load = useCallback(
    () =>
      combatStatus(roomId, characterId, ids ? ids.split(",") : []).then((r) => {
        if (r.me && r.pending && r.others)
          setSt({ me: r.me, pending: r.pending, others: r.others });
        else setError(r.error ?? "Errore");
      }),
    [roomId, characterId, ids],
  );
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        setError(r.error);
        load();
      } else onDone();
    });
  }

  if (!st)
    return <p className="text-sm text-muted">{error ?? "Caricamento..."}</p>;
  const m = st.me;
  const down =
    m.state === "morente" || m.state === "stabilizzato" || m.state === "morto";

  return (
    <div className="space-y-3">
      {/* Stato del personaggio */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border border-border/60 bg-black/30 px-3 py-2 text-sm">
        <span>
          PF <strong className="text-accent">{m.hp}</strong>/{m.maxHp}
        </span>
        <span>
          Stamina <strong className="text-accent">{m.stamina}</strong>/
          {m.maxStamina}
        </span>
        {m.encumbrance < 0 && (
          <span className="text-muted">Ingombro {m.encumbrance} a RIF</span>
        )}
        <span className={m.state === "illeso" ? "text-muted" : "text-red-300"}>
          {HP_STATE_LABEL[m.state]}
        </span>
        {m.stunned && (
          <span className="text-[#f0c75e]">
            Stordito: perde la prossima azione
          </span>
        )}
        {m.bleeding.length > 0 && (
          <span className="text-red-300">
            Sanguina: {m.bleeding.map((b) => b.label).join(", ")}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {m.state === "morto" ? (
        <p className="text-sm text-muted">Il personaggio è morto.</p>
      ) : m.state === "morente" ? (
        <div className={box}>
          <p className="text-sm">
            Il personaggio è <strong className="text-red-300">morente</strong>:
            prima di ogni sua azione deve fare il tiro salvezza (BODY + TEM +
            d10 contro DV 12, +1 a ogni round). Un altro personaggio può
            stabilizzarlo con Medicina.
          </p>
          <button
            type="button"
            disabled={pending || !m.dyingSaveDue}
            onClick={() => run(() => deathSave(roomId, characterId))}
            className="btn px-4 py-1.5 text-sm"
          >
            {m.dyingSaveDue
              ? "🎲 Tiro salvezza"
              : "Tiro fatto: ora puoi scrivere la tua azione"}
          </button>
        </div>
      ) : null}

      {/* Attacchi da cui difendersi */}
      {st.pending.length > 0 && (
        <Defense
          pending={st.pending}
          weapons={m.weapons.filter((w) => w.kind === "arma" && !w.ranged)}
          busy={pending}
          onDefend={(id, d, w) => run(() => defend(id, characterId, d, w))}
        />
      )}

      {!down && (
        <Attack
          others={others}
          weapons={m.weapons}
          busy={pending}
          onAttack={(target, o) =>
            run(() => attack(roomId, characterId, target, o))
          }
        />
      )}

      {!down && (
        <div className={box}>
          <p className={field}>Altre azioni</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => catchBreath(roomId, characterId))}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Riprendi fiato (+Recupero di Stamina)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => rollInitiative(roomId, characterId))}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Tira l&apos;iniziativa
            </button>
            {m.weapons
              .filter((w) => w.reload > 0 && !w.loaded)
              .map((w) => (
                <button
                  key={w.id}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => reload(roomId, characterId, w.id))}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Ricarica {w.name}
                </button>
              ))}
          </div>
          <Medicine
            me={{ id: characterId, name: "te stesso", bleeding: m.bleeding }}
            others={st.others}
            hasBandages={m.hasBandages}
            busy={pending}
            onStabilize={(t) => run(() => stabilize(roomId, characterId, t))}
            onFirstAid={(t, w) =>
              run(() => firstAid(roomId, characterId, t, w))
            }
          />
        </div>
      )}
    </div>
  );
}

function Defense({
  pending,
  weapons,
  busy,
  onDefend,
}: {
  pending: Status["pending"];
  weapons: Status["me"]["weapons"];
  busy: boolean;
  onDefend: (id: string, d: DefenseKind, weapon: string | null) => void;
}) {
  const [weapon, setWeapon] = useState(weapons[0]?.id ?? "");
  return (
    <div className="space-y-2 border border-red-800/60 bg-red-950/20 p-3">
      <p className="text-sm text-red-200">
        Sei attaccato: scrivi la tua azione e poi scegli come difenderti. Parare
        e Schivare costano 1 Stamina; incassando il colpo va a segno.
      </p>
      {weapons.length > 1 && (
        <label className="block">
          <span className={field}>Para con</span>
          <select
            value={weapon}
            onChange={(e) => setWeapon(e.target.value)}
            className="input w-56! py-1 text-sm"
          >
            {weapons.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="space-y-1.5">
        {pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              <strong className="text-accent">{p.attacker}</strong> con{" "}
              {p.weapon}
              {p.kind !== "Normale" &&
                ` (${p.kind.toLowerCase()}${p.aimed ? `, a ${p.aimed.toLowerCase()}` : ""})`}
              {p.ranged && " — a distanza"}
            </span>
            {(["parry", "dodge", "take"] as const).map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => onDefend(p.id, d, weapon || null)}
                className={
                  d === "take"
                    ? "btn-ghost px-2.5 py-1 text-xs"
                    : "btn px-2.5 py-1 text-xs"
                }
              >
                {COMBAT.defenses[d].label}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Attack({
  others,
  weapons,
  busy,
  onAttack,
}: {
  others: { id: string; name: string }[];
  weapons: Status["me"]["weapons"];
  busy: boolean;
  onAttack: (target: string, o: Parameters<typeof attack>[3]) => void;
}) {
  const [target, setTarget] = useState("");
  const [weapon, setWeapon] = useState("");
  const [kind, setKind] = useState<AttackKind>("normal");
  const [aimed, setAimed] = useState<LocationId>("torso");
  const [distance, setDistance] = useState("10");
  const [cover, setCover] = useState(false);
  const [running, setRunning] = useState(false);
  const [contact, setContact] = useState(false);
  const [mounted, setMounted] = useState<"" | "cavallo" | "drago">("");
  const [charge, setCharge] = useState(false);
  const w = weapons.find((x) => x.id === weapon);
  const ranged = !!w?.ranged;

  return (
    <div className={box}>
      <p className="text-sm text-muted">
        Scrivi la tua azione, poi lancia l&apos;attacco:{" "}
        <strong>RIF + abilità dell&apos;arma + d10</strong>. Il bersaglio
        sceglie la difesa e il gioco confronta i tiri.
      </p>
      {others.length === 0 ? (
        <p className="text-sm text-[#f0c75e]">
          In questa chat non ci sono altri personaggi da attaccare.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className={field}>Bersaglio</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="input w-48! py-1 text-sm"
              >
                <option value="">Scegli...</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={field}>Arma</span>
              <select
                value={weapon}
                onChange={(e) => setWeapon(e.target.value)}
                className="input w-56! py-1 text-sm"
              >
                <option value="">A mani nude (Lotta)</option>
                {weapons.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.kind === "scudo" ? `Colpo di scudo: ${x.name}` : x.name}
                    {x.aff ? ` · AFF ${x.aff}` : ""}
                    {x.reload > 0 && !x.loaded ? " · scarica" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={field}>Tipo di attacco</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AttackKind)}
                className="input w-40! py-1 text-sm"
              >
                {(Object.keys(COMBAT.attackKinds) as AttackKind[])
                  .filter((k) => !(ranged && k === "fast"))
                  .map((k) => (
                    <option key={k} value={k}>
                      {COMBAT.attackKinds[k].label}
                    </option>
                  ))}
              </select>
            </label>
            {kind === "aimed" && (
              <label className="block">
                <span className={field}>Mira a</span>
                <select
                  value={aimed}
                  onChange={(e) => setAimed(e.target.value as LocationId)}
                  className="input w-48! py-1 text-sm"
                >
                  {COMBAT.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label} ({l.aimPenalty})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {ranged && (
              <label className="block">
                <span className={field}>Distanza (m)</span>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  className="input w-24! py-1 text-sm"
                />
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              {COMBAT.attackKinds[kind].label}: {kindHelp[kind]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {ranged && (
              <>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={cover}
                    onChange={(e) => setCover(e.target.checked)}
                  />{" "}
                  copertura parziale (−3)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={running}
                    onChange={(e) => setRunning(e.target.checked)}
                  />{" "}
                  bersaglio che corre (DV +2)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={contact}
                    onChange={(e) => setContact(e.target.checked)}
                  />{" "}
                  a contatto (−3)
                </label>
              </>
            )}
            <label className="flex items-center gap-1.5">
              in sella:
              <select
                value={mounted}
                onChange={(e) =>
                  setMounted(e.target.value as "" | "cavallo" | "drago")
                }
                className="input w-28! py-0.5 text-xs"
              >
                <option value="">no</option>
                <option value="cavallo">a cavallo</option>
                <option value="drago">su un drago</option>
              </select>
            </label>
            {mounted && w?.effects.includes("da_carica") && (
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={charge}
                  onChange={(e) => setCharge(e.target.checked)}
                />{" "}
                carica (+2, +1d6 al danno)
              </label>
            )}
          </div>
          <button
            type="button"
            disabled={busy || !target}
            onClick={() =>
              onAttack(target, {
                weaponId: weapon || null,
                kind,
                aimed: kind === "aimed" ? aimed : undefined,
                distance: ranged ? Number(distance) || 0 : undefined,
                cover,
                running,
                contact,
                mounted: mounted || null,
                charge,
              })
            }
            className="btn px-4 py-1.5 text-sm"
          >
            {busy ? "..." : "⚔ Attacca"}
          </button>
        </>
      )}
    </div>
  );
}

const kindHelp: Record<AttackKind, string> = {
  normal: "danno normale, 1 Stamina.",
  fast: "due colpi in una azione, −3 a ciascuno (−2 con armi rapide), 1 Stamina per colpo.",
  strong: "−3 al colpire, danno ×1,5, 3 Stamina.",
  aimed: "scegli la parte del corpo, con la sua penalità; 1 Stamina.",
  disarm:
    "−3 al colpire: se vinci di 5 o più l'avversario perde l'arma, nessun danno; 1 Stamina.",
};

function Medicine({
  me,
  others,
  hasBandages,
  busy,
  onStabilize,
  onFirstAid,
}: {
  me: { id: string; name: string; bleeding: { id: string; label: string }[] };
  others: Status["others"];
  hasBandages: boolean;
  busy: boolean;
  onStabilize: (target: string) => void;
  onFirstAid: (target: string, wound: string) => void;
}) {
  const dying = others.filter((o) => o.state === "morente");
  const bleeding = [me, ...others].flatMap((o) =>
    o.bleeding.map((b) => ({ target: o.id, who: o.name, ...b })),
  );
  if (!dying.length && !bleeding.length) return null;
  return (
    <div className="space-y-1.5 border-t border-border/50 pt-2 text-sm">
      <p className={field}>Medicina (INT + Medicina + d10)</p>
      {dying.map((o) => (
        <div key={o.id} className="flex flex-wrap items-center gap-2">
          <span className="flex-1">
            <strong className="text-red-300">{o.name}</strong> è morente
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStabilize(o.id)}
            className="btn px-2.5 py-1 text-xs"
          >
            Stabilizza (DV 15)
          </button>
        </div>
      ))}
      {bleeding.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-2">
          <span className="flex-1">
            {b.who === "te stesso" ? "Sanguini" : `${b.who} sanguina`}:{" "}
            {b.label}
          </span>
          <button
            type="button"
            disabled={busy || !hasBandages}
            title={hasBandages ? "" : "Servono delle bende"}
            onClick={() => onFirstAid(b.target, b.id)}
            className="btn-ghost px-2.5 py-1 text-xs"
          >
            Primo soccorso
          </button>
        </div>
      ))}
      {!hasBandages && bleeding.length > 0 && (
        <p className="text-xs text-muted">
          Per il primo soccorso servono delle bende.
        </p>
      )}
    </div>
  );
}
