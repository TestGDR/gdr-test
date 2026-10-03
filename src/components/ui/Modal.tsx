"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ModalSize = "md" | "lg" | "xl" | "tall" | "area" | "sheet";

const SIZE_CLASS: Record<ModalSize, string> = {
  md: "w-[min(32rem,calc(100vw-2rem))] max-h-[90vh]",
  lg: "w-[min(46rem,calc(100vw-2rem))] max-h-[90vh]",
  xl: "w-[min(80rem,calc(100vw-2rem))] h-[min(52rem,calc(100vh-2rem))]",
  // stretta e alta (es. elenco online): max 600px, su cellulare tutta la larghezza disponibile
  tall: "w-[min(600px,calc(100vw-1rem))] h-[min(52rem,calc(100dvh-1rem))]",
  // chat di una macroarea: altezza fissa 700px (meno su schermi bassi)
  area: "w-[min(46rem,calc(100vw-2rem))] h-[min(700px,calc(100dvh-1rem))]",
  // scheda del drago: foglio alto, il contenuto gestisce da se' lo scorrimento
  sheet: "w-[min(820px,calc(100vw-1rem))] h-[min(940px,calc(100dvh-1rem))]",
};

// Finestra modale controllata dal chiamante (open / onClose).
// - si chiude SOLO con la X (niente clic fuori, niente tasto Esc)
// - si trascina dalla barra del titolo
// - dimensione fissa, non ridimensionabile
// - si riduce a icona (in basso a sinistra): la pagina sotto torna usabile e,
//   riaprendola, il contenuto e' esattamente come prima (resta montato)
export default function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tray, setTray] = useState<HTMLElement | null>(null); // contenitore delle icone, se ridotta
  // Chiusa dal chiamante (es. cambio pagina): non resta ridotta a icona
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setTray(null);
  }
  const minimized = open && tray !== null;
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  useEffect(() => {
    if (!dialog) return;
    // Ridotta: il dialog si chiude (la pagina torna cliccabile) ma il contenuto resta
    if (open && !minimized && !dialog.open) dialog.showModal();
    if ((!open || minimized) && dialog.open) dialog.close();
  }, [dialog, open, minimized]);

  function minimize() {
    setTray(trayElement());
  }

  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return; // la X non avvia il trascinamento
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  }

  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !dialog) return;
    const rect = dialog.getBoundingClientRect();
    // Limiti: la barra del titolo resta sempre raggiungibile dentro la finestra
    const centerLeft = (window.innerWidth - rect.width) / 2;
    const centerTop = (window.innerHeight - rect.height) / 2;
    const x = drag.current.baseX + e.clientX - drag.current.startX;
    const y = drag.current.baseY + e.clientY - drag.current.startY;
    setOffset({
      x: Math.min(
        window.innerWidth - centerLeft - 120,
        Math.max(-centerLeft - rect.width + 120, x),
      ),
      y: Math.min(window.innerHeight - centerTop - 48, Math.max(-centerTop, y)),
    });
  }

  function close() {
    setOffset({ x: 0, y: 0 }); // alla prossima apertura riparte dal centro
    setTray(null);
    onClose();
  }

  return (
    <>
      {minimized &&
        createPortal(
          <div className="flex items-center overflow-hidden rounded-md border border-accent/60 bg-panel text-sm shadow-xl shadow-black">
            <button
              type="button"
              onClick={() => setTray(null)}
              title={`Riapri: ${title}`}
              className="flex max-w-56 items-center gap-2 px-3 py-2 hover:bg-blood/20 hover:text-accent"
            >
              <RestoreIcon />
              <span className="truncate text-xs tracking-[0.12em] uppercase">
                {title || "Finestra"}
              </span>
            </button>
            <button
              type="button"
              onClick={close}
              aria-label={`Chiudi ${title}`}
              className="border-l border-border px-2 py-2 text-muted hover:text-accent"
            >
              ✕
            </button>
          </div>,
          tray,
        )}
      <dialog
        ref={setDialog}
        // Esc non chiude la modale
        onCancel={(e) => e.preventDefault()}
        onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        className={`${SIZE_CLASS[size]} m-auto flex-col overflow-hidden rounded-lg border border-border bg-panel p-0 text-foreground shadow-2xl shadow-black backdrop:bg-black/70 open:flex`}
      >
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          className="bar flex shrink-0 cursor-grab touch-none items-center justify-between border-b px-4 py-3 select-none active:cursor-grabbing"
        >
          <h2 className="text-xs font-bold tracking-[0.2em] text-muted uppercase">{title}</h2>
          <div className="flex items-center gap-3 text-muted">
            <GrabIcon />
            <button
              type="button"
              onClick={minimize}
              aria-label="Riduci a icona"
              title="Riduci a icona"
              className="leading-none hover:text-accent"
            >
              <MinimizeIcon />
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Chiudi"
              className="text-lg leading-none hover:text-accent"
            >
              ✕
            </button>
          </div>
        </div>
        <div
          className={
            size === "xl" || size === "tall" || size === "sheet"
              ? "min-h-0 flex-1"
              : "min-h-0 flex-1 overflow-y-auto p-5"
          }
        >
          {children}
        </div>
      </dialog>
    </>
  );
}

// Barra in basso a sinistra con le modali ridotte a icona (una sola per pagina)
function trayElement() {
  let el = document.getElementById("modali-ridotte");
  if (!el) {
    el = document.createElement("div");
    el.id = "modali-ridotte";
    el.className =
      "fixed bottom-3 left-3 z-[60] flex max-w-[calc(100vw-1.5rem)] flex-wrap-reverse gap-2";
    document.body.appendChild(el);
  }
  return el;
}

function MinimizeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M5 19h14" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 9h16" />
    </svg>
  );
}

function GrabIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-7a1.5 1.5 0 0 1 3 0V12M14 5.5a1.5 1.5 0 0 1 3 0V12M17 7.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 14.4a1.5 1.5 0 0 1 2.4-1.8L8 14" />
    </svg>
  );
}
