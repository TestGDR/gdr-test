"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

type Size = "md" | "xl";

const SIZE_CLASS: Record<Size, string> = {
  md: "w-[min(32rem,calc(100vw-2rem))] max-h-[90vh]",
  xl: "w-[min(80rem,calc(100vw-2rem))] h-[min(52rem,calc(100vh-2rem))]",
};

// Pulsante che apre una finestra modale.
// - si chiude SOLO con la X (niente clic fuori, niente tasto Esc)
// - si trascina dalla barra del titolo
// - dimensione fissa, non ridimensionabile
export default function ModalButton({
  label,
  title,
  className = "btn",
  size = "md",
  onOpen,
  children,
}: {
  label: ReactNode;
  title: string;
  className?: string;
  size?: Size;
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  const open = () => {
    setOffset({ x: 0, y: 0 }); // ogni apertura riparte dal centro
    dialog?.showModal();
    onOpen?.();
  };
  const close = () => dialog?.close();

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
    const minX = -centerLeft - rect.width + 120;
    const maxX = window.innerWidth - centerLeft - 120;
    const minY = -centerTop;
    const maxY = window.innerHeight - centerTop - 48;
    const x = drag.current.baseX + e.clientX - drag.current.startX;
    const y = drag.current.baseY + e.clientY - drag.current.startY;
    setOffset({
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    });
  }

  function onDragEnd() {
    drag.current = null;
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {label}
      </button>
      <dialog
        ref={setDialog}
        // Esc non chiude la modale
        onCancel={(e) => e.preventDefault()}
        onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        className={`${SIZE_CLASS[size]} m-auto flex-col overflow-hidden rounded-lg border border-border bg-panel/95 p-0 text-foreground shadow-2xl shadow-black backdrop:bg-black/70 open:flex`}
      >
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="bar flex shrink-0 cursor-grab touch-none items-center justify-between border-b px-4 py-3 select-none active:cursor-grabbing"
        >
          <h2 className="text-xs font-bold tracking-[0.2em] text-muted uppercase">{title}</h2>
          <div className="flex items-center gap-3 text-muted">
            <GrabIcon />
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
        <div className={size === "xl" ? "min-h-0 flex-1" : "min-h-0 overflow-y-auto p-5"}>
          {children(close)}
        </div>
      </dialog>
    </>
  );
}

function GrabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-7a1.5 1.5 0 0 1 3 0V12M14 5.5a1.5 1.5 0 0 1 3 0V12M17 7.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 14.4a1.5 1.5 0 0 1 2.4-1.8L8 14" />
    </svg>
  );
}
