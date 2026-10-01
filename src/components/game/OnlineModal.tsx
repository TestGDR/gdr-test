"use client";

import { useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import type { Availability } from "@/lib/availability";
import AvailabilityDot from "./AvailabilityDot";
import { SheetModal } from "@/components/scheda/SheetButton";
import { Avatar, type Contact } from "./MessagesModal";
import type { OnlinePlayer } from "./presence";

type Filter = "tutti" | "chat" | "fuori" | "staff";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "tutti", label: "Tutti" },
  { id: "chat", label: "In chat" },
  { id: "fuori", label: "Fuori chat" },
  { id: "staff", label: "Staff" },
];

const isStaff = (p: OnlinePlayer) => p.staffRole !== null;

type Props = {
  open: boolean;
  onClose: () => void;
  online: OnlinePlayer[];
  myUserId: string;
  phrase: string;
  onSavePhrase: (phrase: string) => Promise<void>;
  onMessageOff: (to: Contact) => void;
  onChangeAvailability: (value: Availability) => void;
};

// Elenco esteso di tutti i presenti, raggruppati per posto
export default function OnlineModal(props: Props) {
  const { open, onClose, online } = props;
  const [filter, setFilter] = useState<Filter>("tutti");
  const [sheetId, setSheetId] = useState<string | null>(null); // scheda aperta cliccando un nome

  const visible = online.filter(
    (p) =>
      filter === "tutti" ||
      (filter === "chat" && p.place === "chat") ||
      (filter === "fuori" && p.place !== "chat") ||
      (filter === "staff" && isStaff(p)),
  );

  // Gruppi: in cima chi cerca gioco, poi chi e' fuori dalle chat, poi una sezione per lista
  const groups = new Map<string, { label: string; players: OnlinePlayer[] }>();
  for (const p of visible) {
    const key = p.availability === "cerca" ? "cerca" : p.place === "chat" ? p.placeKey : "fuori";
    const label =
      key === "cerca"
        ? "In cerca di gioco adesso"
        : p.place === "chat"
          ? `In chat · ${p.placeLabel}`
          : "Online fuori chat";
    if (!groups.has(key)) groups.set(key, { label, players: [] });
    groups.get(key)!.players.push(p);
  }
  const order = (key: string) => (key === "cerca" ? 0 : key === "fuori" ? 1 : 2);
  const sorted = [...groups.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));

  return (
    <Modal open={open} onClose={onClose} title="Elenco online" size="tall">
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 sm:px-4">
          <p className="font-serif text-xl tracking-[0.15em] uppercase">
            <span className="text-accent">{online.length}</span> online
          </p>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-3 py-1 text-xs tracking-wider uppercase transition ${
                  filter === f.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <PhraseEditor phrase={props.phrase} onSave={props.onSavePhrase} />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2 sm:p-4">
          {sorted.length === 0 && <p className="text-center text-muted">Nessuno in questa sezione.</p>}
          {sorted.map(([key, group]) => (
            <section key={key}>
              <h3
                className={`mb-2 flex items-center justify-center gap-2 rounded-md border py-1.5 text-xs font-semibold tracking-[0.15em] uppercase ${
                  key === "cerca"
                    ? "border-yellow-500/60 bg-gradient-to-r from-yellow-500/5 via-yellow-500/20 to-yellow-500/5 text-yellow-200"
                    : "border-blood/50 bg-gradient-to-r from-blood/10 via-blood/30 to-blood/10"
                }`}
              >
                {group.label}
                <span className="rounded-full border border-accent/60 px-1.5 text-[10px] text-accent">
                  {group.players.length}
                </span>
              </h3>
              <ul className="space-y-1.5">
                {group.players.map((p) => (
                  <PlayerRow
                    key={p.userId}
                    player={p}
                    isMe={p.userId === props.myUserId}
                    onMessageOff={props.onMessageOff}
                    onOpenSheet={setSheetId}
                    onChangeAvailability={props.onChangeAvailability}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <SheetModal characterId={sheetId} onClose={() => setSheetId(null)} />
    </Modal>
  );
}

function PlayerRow({
  player,
  isMe,
  onMessageOff,
  onChangeAvailability,
  onOpenSheet,
}: {
  player: OnlinePlayer;
  isMe: boolean;
  onMessageOff: (to: Contact) => void;
  onChangeAvailability: (value: Availability) => void;
  onOpenSheet: (characterId: string) => void;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-md border border-border/70 bg-black/40 px-2 py-2 sm:gap-3 sm:px-3 ${
        player.live ? "" : "opacity-50"
      }`}
      title={player.live ? undefined : "Connessione momentaneamente persa: resta nell'elenco per qualche minuto"}
    >
      <Avatar name={player.name} url={player.avatar} size="h-9 w-9 sm:h-11 sm:w-11" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          {player.sigil && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.sigil} alt="" title={`Casata ${player.house}`} className="h-5 w-5 shrink-0 object-contain" />
          )}
          {/* Il nome apre la scheda del personaggio */}
          <button
            type="button"
            onClick={() => player.characterId && onOpenSheet(player.characterId)}
            disabled={!player.characterId}
            title={player.characterId ? `Apri la scheda di ${player.name}` : undefined}
            className="truncate text-left font-serif tracking-wide text-accent uppercase hover:underline disabled:no-underline"
          >
            {player.name}
            {player.house && <span className="text-foreground/70"> {player.house}</span>}
          </button>
          {!isMe && player.characterId && (
            <button
              type="button"
              onClick={() => onMessageOff({ id: player.characterId!, name: player.name, avatar: player.avatar })}
              title={`Messaggio OFF a ${player.name}`}
              aria-label={`Messaggio OFF a ${player.name}`}
              className="text-muted hover:text-accent"
            >
              <BubbleIcon />
            </button>
          )}
        </p>
        <p className="truncate text-sm text-foreground/80">{player.phrase || " "}</p>
      </div>
      {/* Simboli */}
      <div className="flex shrink-0 items-center gap-2 text-base">
        {isStaff(player) && (
          <span title={player.staffRole ?? ""} className="text-accent" style={{ color: player.staffColor ?? undefined }}>
            <CrownIcon />
          </span>
        )}
        {!player.active && (
          <span title="Personaggio non ancora attivo" className="text-orange-300">
            <HourglassIcon />
          </span>
        )}
        <AvailabilityDot
          value={player.availability}
          onChange={isMe ? onChangeAvailability : undefined}
          align="right"
        />
      </div>
    </li>
  );
}

function PhraseEditor({ phrase, onSave }: { phrase: string; onSave: (p: string) => Promise<void> }) {
  const [value, setValue] = useState(phrase);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(value.trim());
    setSaving(false);
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
      <label htmlFor="phrase" className="text-xs tracking-wider text-muted uppercase">
        La tua frase
      </label>
      <input
        id="phrase"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        maxLength={80}
        placeholder="Es. Disponibile per giocate e legami!"
        className="input min-w-0 flex-1 py-1 text-sm"
      />
      <button className="btn-ghost px-3 py-1 text-xs" disabled={saving}>
        {saved ? "Salvata ✓" : "Salva"}
      </button>
    </form>
  );
}

const icon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const BubbleIcon = () => (
  <svg {...icon}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </svg>
);

const CrownIcon = () => (
  <svg {...icon}>
    <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />
  </svg>
);

const HourglassIcon = () => (
  <svg {...icon}>
    <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
  </svg>
);
