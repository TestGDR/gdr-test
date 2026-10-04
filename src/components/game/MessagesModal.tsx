"use client";

import Modal from "@/components/ui/Modal";
import type { MainCharacter } from "@/lib/main-character";
import OffMessages from "./OffMessages";
import Scrolls from "./Scrolls";

export type MessageKind = "missiva" | "off";
export type Contact = { id: string; name: string; avatar?: string | null };

export const KIND_LABEL: Record<MessageKind, string> = { missiva: "Missive", off: "Messaggi OFF" };

type Props = {
  kind: MessageKind;
  open: boolean;
  onClose: () => void;
  me: MainCharacter;
  initialTo: Contact | null;
  session: number; // cambia a ogni apertura: riparte da zero con i dati aggiornati
  onRead: () => void;
  canBroadcast: boolean; // puo' scrivere i messaggi OFF a tutti
  isAdmin: boolean; // nelle missive vede l'Archivio messaggi castello
  isStaff: boolean; // nelle missive sceglie da dove parte il cartiglio
};

export default function MessagesModal({ kind, open, onClose, me, initialTo, session, onRead, canBroadcast, isAdmin, isStaff }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={KIND_LABEL[kind]} size="xl">
      {open &&
        (kind === "off" ? (
          <OffMessages key={session} me={me} initialTo={initialTo} canBroadcast={canBroadcast} onRead={onRead} />
        ) : (
          <Scrolls key={session} me={me} initialTo={initialTo} isAdmin={isAdmin} isStaff={isStaff} onRead={onRead} />
        ))}
    </Modal>
  );
}

// bare: senza bordo (quando l'immagine sta gia' dentro una cornice)
export function Avatar({ name, url, size = "h-9 w-9", bare = false }: { name: string; url?: string | null; size?: string; bare?: boolean }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${size} shrink-0 rounded object-cover`} />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded bg-background font-serif text-accent ${bare ? "" : "border border-blood/60"}`}
    >
      {name[0]}
    </span>
  );
}
