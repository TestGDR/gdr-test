"use client";

import { useState, useTransition } from "react";
import CombatPanel from "./CombatPanel";
import { rollFreeDice, rollRaggira } from "../dice-actions";
import DicePanel, { type DiceCategory } from "./DicePanel";

export type CommandTab = DiceCategory | "raggira" | "combattimento";
type Tab = CommandTab;
const TABS: { id: Tab; label: string }[] = [
  { id: "abilita", label: "Tiri sulle abilità" },
  { id: "statistiche", label: "Tiri sulle statistiche" },
  { id: "liberi", label: "Dadi liberi" },
  { id: "raggira", label: "Raggira" },
  { id: "combattimento", label: "Combattimento" },
  { id: "oggetti", label: "Lancia oggetti" },
];

// Finestra "Comandi" della chat: tutti i tiri, divisi per tipo
export default function ChatCommands({
  roomId,
  characterId,
  canNarrate,
  others,
  onDone,
  initialTab = "abilita",
}: {
  roomId: string;
  characterId: string;
  canNarrate: boolean;
  others: { id: string; name: string }[]; // PG presenti in chat (per Raggira e combattimento)
  onDone: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-4">
      <nav
        className="flex flex-wrap gap-1 border-b border-border pb-2"
        aria-label="Comandi"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`border px-3 py-1.5 text-xs tracking-wider uppercase ${
              tab === t.id
                ? "border-accent bg-blood/20 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "combattimento" ? (
        <CombatPanel
          roomId={roomId}
          characterId={characterId}
          others={others}
          onDone={onDone}
        />
      ) : tab === "raggira" ? (
        <Raggira
          roomId={roomId}
          characterId={characterId}
          others={others}
          onDone={onDone}
        />
      ) : (
        <>
          {tab === "liberi" && (
            <FreeDice
              roomId={roomId}
              characterId={characterId}
              onDone={onDone}
            />
          )}
          {tab === "oggetti" && (
            <p className="text-sm text-muted">
              Il danno dell&apos;oggetto scelto (es. 2d5+1), tra quelli che il
              personaggio possiede.
            </p>
          )}
          <DicePanel
            key={tab}
            roomId={roomId}
            characterId={characterId}
            canNarrate={canNarrate}
            category={tab}
            onRolled={onDone}
          />
        </>
      )}
    </div>
  );
}

// Formula scritta dal giocatore (es. 3d6+1)
function FreeDice({
  roomId,
  characterId,
  onDone,
}: {
  roomId: string;
  characterId: string;
  onDone: () => void;
}) {
  const [formula, setFormula] = useState("1d20");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function roll() {
    setError(null);
    startTransition(async () => {
      const res = await rollFreeDice(roomId, characterId, formula);
      if (res.error) setError(res.error);
      else onDone();
    });
  }
  return (
    <div className="space-y-2 border border-accent/40 bg-black/40 p-3">
      <p className="text-sm text-muted">
        Scrivi i dadi da tirare: <code>1d20</code>, <code>3d6+1</code>,{" "}
        <code>2d10-2</code>…
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={formula}
          maxLength={40}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), roll())}
          className="input w-40! py-1 font-mono text-sm"
          aria-label="Dadi da tirare"
        />
        <button
          type="button"
          disabled={pending || !formula.trim()}
          onClick={roll}
          className="btn px-4 py-1.5 text-sm"
        >
          {pending ? "..." : "🎲 Tira"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// Raggira: prova contrapposta contro un PG presente
function Raggira({
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
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function roll() {
    setError(null);
    startTransition(async () => {
      const res = await rollRaggira(roomId, characterId, target);
      if (res.error) setError(res.error);
      else onDone();
    });
  }
  return (
    <div className="space-y-2 border border-accent/40 bg-black/40 p-3">
      <p className="text-sm text-muted">
        Prova contrapposta del regolamento:{" "}
        <strong>EMP + Dissimulare + d10</strong> contro{" "}
        <strong>EMP + Percepire Intenzioni + d10</strong> del bersaglio (a
        parità vince chi difende). I dadi si tirano per entrambi e il risultato
        compare in chat.
      </p>
      {others.length === 0 ? (
        <p className="text-sm text-[#f0c75e]">
          In questa chat non ci sono altri personaggi con cui giocare.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[0.7rem] tracking-wider text-muted uppercase">
              Bersaglio
            </span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="input w-56! py-1 text-sm"
            >
              <option value="">Scegli...</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !target}
            onClick={roll}
            className="btn px-4 py-1.5 text-sm"
          >
            {pending ? "..." : "🎲 Raggira"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
