"use client";

import Link from "next/link";
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
  // In mappa: solo "Mappa". In chat: solo il nome della chat, cliccabile per entrarci
  const groups = new Map<string, { label: string; chatId: string | null; players: OnlinePlayer[] }>();
  for (const p of visible) {
    const key = p.availability === "cerca" ? "cerca" : p.place === "chat" ? p.placeKey : "fuori";
    const label = key === "cerca" ? "In cerca di gioco adesso" : p.place === "chat" ? p.placeLabel : "Mappa";
    const chatId = key !== "cerca" && p.place === "chat" ? p.placeKey.replace(/^chat:/, "") : null;
    if (!groups.has(key)) groups.set(key, { label, chatId, players: [] });
    groups.get(key)!.players.push(p);
  }
  const order = (key: string) => (key === "cerca" ? 0 : key === "fuori" ? 1 : 2);
  const sorted = [...groups.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));

  return (
    <Modal open={open} onClose={onClose} title="Elenco online" size="tall">
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 sm:px-4">
          <p className="font-serif text-lg tracking-[0.15em] uppercase sm:text-xl">
            <span className="text-accent">{online.length}</span> online
          </p>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-2 py-0.5 text-[0.625rem] tracking-wider uppercase transition sm:px-3 sm:py-1 sm:text-xs ${
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
                {group.chatId ? (
                  <Link
                    href={`/chat/${group.chatId}`}
                    onClick={onClose}
                    title={`Entra in ${group.label}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {group.label}
                  </Link>
                ) : (
                  <>
                    {group.label}
                    <span className="rounded-full border border-accent/60 px-1.5 text-[0.625rem] text-accent">{group.players.length}</span>
                  </>
                )}
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
      className={`flex items-center gap-2 rounded-md border border-border/70 bg-black/40 px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2 ${
        player.live ? "" : "opacity-50"
      }`}
      title={player.live ? undefined : "Connessione momentaneamente persa: resta nell'elenco per qualche minuto"}
    >
      <AvailabilityDot value={player.availability} onChange={isMe ? onChangeAvailability : undefined} />
      <Avatar name={player.name} url={player.avatar} size="h-8 w-8 sm:h-11 sm:w-11" />
      {/* Stemma della casata: alto quanto nome e frase insieme */}
      {player.sigil ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={player.sigil} alt="" title={`Casata ${player.house}`} className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10" />
      ) : (
        <span className="w-8 shrink-0 sm:w-10" aria-hidden /> // senza casata: i nomi restano allineati
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 sm:gap-2">
          {/* Nome e cognome (la casata) insieme: tutto il nome apre la scheda */}
          <button
            type="button"
            onClick={() => player.characterId && onOpenSheet(player.characterId)}
            disabled={!player.characterId}
            title={player.characterId ? `Apri la scheda di ${fullName(player)}` : undefined}
            // su cellulare nome e cognome vanno a capo invece di essere tagliati
            className="font-name min-w-0 text-left text-[0.8125rem] leading-tight font-semibold break-words text-foreground hover:underline disabled:no-underline sm:truncate sm:text-[0.9375rem]"
          >
            {fullName(player)}
          </button>
        </p>
        <p className="truncate text-[0.6875rem] text-[#7d7470] sm:text-xs">{player.phrase || "\u00a0"}</p>
      </div>
      {/* Simboli */}
      <div className="flex shrink-0 items-center gap-1 text-base sm:gap-2 [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-5 sm:[&_svg]:w-5">
        {isStaff(player) && (
          <span title={player.staffRole ?? ""} className="text-accent" style={{ color: player.staffColor ?? undefined }}>
            <CrownIcon />
          </span>
        )}
        {!player.active && (
          <span title="Personaggio non ancora attivo" className="text-amber-200">
            <HourglassIcon />
          </span>
        )}
        {!isMe && player.characterId && (
          <button
            type="button"
            onClick={() => onMessageOff({ id: player.characterId!, name: fullName(player), avatar: player.avatar })}
            title={`Messaggio OFF a ${fullName(player)}`}
            aria-label={`Messaggio OFF a ${fullName(player)}`}
            className="text-[#e2c99a] transition hover:text-accent"
          >
            <BubbleIcon />
          </button>
        )}
      </div>
    </li>
  );
}

// Nome e cognome (la casata), solo iniziali maiuscole: "Daemon Blackfyre"
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
const fullName = (p: OnlinePlayer) => titleCase([p.name, p.house].filter(Boolean).join(" "));

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
      <label htmlFor="phrase" className="text-[0.625rem] tracking-wider text-muted uppercase sm:text-xs">
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
