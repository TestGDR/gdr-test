"use client";

import { useState, type ReactNode } from "react";
import Modal, { type ModalSize } from "./Modal";

// Pulsante che apre una finestra modale (vedi Modal per il comportamento)
export default function ModalButton({
  label,
  title,
  className = "btn",
  size = "md",
  centerTitle,
  onOpen,
  children,
}: {
  label: ReactNode;
  title: string;
  className?: string;
  size?: ModalSize;
  centerTitle?: boolean;
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        {label}
      </button>
      <Modal open={open} onClose={close} title={title} size={size} centerTitle={centerTitle}>
        {children(close)}
      </Modal>
    </>
  );
}
