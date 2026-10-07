"use client";

import type { ReactNode } from "react";

// Foglio di pergamena (con altri fogli sotto, sfalsati): intestazione con
// l'ornamento, segnalibro rosso facoltativo e, in fondo, una fascia per un'azione
export function PaperSheet({
  title,
  ribbon,
  footer,
  centered,
  titleAction,
  children,
}: {
  title: ReactNode;
  titleAction?: ReactNode; // accanto al titolo centrato (es. la pennina)
  centered?: boolean; // titolo centrato e rosso (es. il nome del PG)
  ribbon?: ReactNode; // contenuto del segnalibro (es. stemma della casata)
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="paper-stack relative">
      <div className="paper-sheet relative px-5 pt-4 pb-4">
        {ribbon !== undefined && (
          <div className="paper-ribbon absolute top-0 right-5 flex h-16 w-11 items-start justify-center pt-2" aria-hidden>
            {ribbon}
          </div>
        )}
        {centered ? (
          <h3 className="mb-2 flex items-center justify-center gap-2 border-b border-[#3b2a1a]/30 px-14 pb-2 text-center font-serif text-2xl font-semibold text-[#7a1d16]">
            <span className="min-w-0 truncate">{title}</span>
            {titleAction}
          </h3>
        ) : (
          <h3 className="mb-2 flex items-center gap-2 border-b border-[#3b2a1a]/30 pr-14 pb-2 font-serif text-xl text-[#2a1d12]">
            <StarOrnament />
            <span className="min-w-0 truncate">{title}</span>
          </h3>
        )}
        {children}
        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </div>
  );
}

// Riga del foglio: rombo con la stella, titolo in grassetto e il valore sotto
export function PaperRow({ label, value, right }: { label: string; value: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#3b2a1a]/20 py-2 last:border-b-0">
      <DiamondStar />
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[0.95rem] leading-tight font-semibold text-[#2a1d12]">{label}</p>
        <div className="truncate text-sm text-[#4a3826]">{value}</div>
      </div>
      {right && <span className="shrink-0 text-sm text-[#4a3826]">{right}</span>}
    </div>
  );
}

// Fascia in fondo al foglio, come "+ Aggiungi" (per modificare)
export function PaperAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 bg-[#3b2a1a]/12 px-3 py-2 text-left font-serif text-sm text-[#3b2a1a] transition hover:bg-[#3b2a1a]/20"
    >
      {children}
    </button>
  );
}

function StarOrnament() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b2a1a" strokeWidth="1.3" aria-hidden className="shrink-0">
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
      <path d="M12 7l1.4 3.6L17 12l-3.6 1.4L12 17l-1.4-3.6L7 12l3.6-1.4z" fill="#3b2a1a" />
    </svg>
  );
}

function DiamondStar() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
      <path d="M13 1.5 24.5 13 13 24.5 1.5 13Z" fill="#2a1d12" stroke="#7d6a55" strokeWidth="1" />
      <path d="M13 6l1.5 5.5L20 13l-5.5 1.5L13 20l-1.5-5.5L6 13l5.5-1.5z" fill="#d8c39a" />
    </svg>
  );
}
