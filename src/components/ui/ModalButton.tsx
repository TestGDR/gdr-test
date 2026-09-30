"use client";

import { useState, type ReactNode } from "react";

// Pulsante che apre una finestra modale (<dialog> nativo: Esc per chiudere, focus gestito)
export default function ModalButton({
  label,
  className = "btn",
  children,
}: {
  label: ReactNode;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const close = () => dialog?.close();

  return (
    <>
      <button type="button" className={className} onClick={() => dialog?.showModal()}>
        {label}
      </button>
      <dialog
        ref={setDialog}
        // Click sullo sfondo scuro = chiudi
        onClick={(e) => e.target === dialog && close()}
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-panel p-0 text-foreground shadow-2xl shadow-black backdrop:bg-black/75 backdrop:backdrop-blur-sm"
      >
        <div className="max-h-[90vh] overflow-y-auto p-5">{children(close)}</div>
      </dialog>
    </>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-bold tracking-widest uppercase">{title}</h2>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Chiudi" className="text-muted hover:text-accent">
          ✕
        </button>
      )}
    </div>
  );
}
