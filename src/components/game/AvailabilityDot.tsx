"use client";

import { useEffect, useRef, useState } from "react";
import { AVAILABILITY, type Availability } from "@/lib/availability";

const OPTIONS: Availability[] = ["disponibile", "cerca", "occupato"];

// Pallino della disponibilita'. Il proprio e' cliccabile e apre il menu di scelta.
export default function AvailabilityDot({
  value,
  onChange,
  align = "left",
}: {
  value: Availability;
  onChange?: (value: Availability) => void;
  align?: "left" | "right"; // lato verso cui si apre il menu
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Il menu si chiude cliccando altrove
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const dot = <span className={`block h-2.5 w-2.5 rounded-full ${AVAILABILITY[value].dot}`} />;

  if (!onChange) {
    return (
      <span title={AVAILABILITY[value].label} className="inline-flex shrink-0">
        {dot}
      </span>
    );
  }

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${AVAILABILITY[value].label} — clicca per cambiare`}
        aria-label={`Disponibilità: ${AVAILABILITY[value].label}. Cambia`}
        aria-expanded={open}
        className="-m-1.5 rounded-full p-1.5 hover:bg-white/10"
      >
        {dot}
      </button>
      {open && (
        <span
          role="menu"
          className={`absolute top-6 z-50 ${align === "left" ? "left-0" : "right-0"} w-48 rounded-md border border-border bg-panel p-1 shadow-xl shadow-black`}
        >
          {OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-blood/25 ${
                option === value ? "text-accent" : ""
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${AVAILABILITY[option].dot}`} />
              {AVAILABILITY[option].label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
