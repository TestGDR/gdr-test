"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AVAILABILITY, type Availability } from "@/lib/availability";
import { QuestContext } from "./quest";

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
  // Quest Mode (solo master, moderatori e admin, nel menu del proprio pallino)
  const quest = useContext(QuestContext);
  // punto dello schermo in cui si apre il menu (null = chiuso)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;
  const ref = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);

  // Il menu si chiude cliccando altrove
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target))
        setPos(null);
    };
    // il menu sta fermo sullo schermo: se la pagina o un elenco scorre, si chiude
    const away = () => setPos(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  // Il menu si apre sotto il pallino, senza uscire dallo schermo (192 = larghezza del menu)
  function toggle() {
    if (open || !ref.current) return setPos(null);
    const box = ref.current.getBoundingClientRect();
    const left = align === "left" ? box.left : box.right - 192;
    setPos({
      top: box.bottom + 8,
      left: Math.max(8, Math.min(left, window.innerWidth - 200)),
    });
  }

  const dot = (
    <span
      className={`block h-2.5 w-2.5 rounded-full ${AVAILABILITY[value].dot}`}
    />
  );

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
        onClick={toggle}
        title={`${AVAILABILITY[value].label} — clicca per cambiare`}
        aria-label={`Disponibilità: ${AVAILABILITY[value].label}. Cambia`}
        aria-expanded={open}
        className={`-m-1.5 rounded-full p-1.5 hover:bg-white/10 ${quest?.on ? "ring-1 ring-[#f0c75e]" : ""}`}
      >
        {dot}
      </button>
      {/* disegnato in fondo alla pagina: sta sopra a tutto e non allarga i riquadri che scorrono */}
      {pos &&
        createPortal(
          <span
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100001] block w-48 rounded-md border border-border bg-panel p-1 shadow-xl shadow-black"
          >
            {OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(option);
                  setPos(null);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-blood/25 ${
                  option === value ? "text-accent" : ""
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${AVAILABILITY[option].dot}`}
                />
                {AVAILABILITY[option].label}
              </button>
            ))}
            {quest?.allowed && (
              <>
                <span className="my-1 block border-t border-border" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={quest.on}
                  disabled={quest.busy}
                  onClick={() => {
                    quest.toggle();
                    setPos(null);
                  }}
                  title="Entri in qualsiasi chat senza spostare il tuo PG"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-blood/25 ${quest.on ? "text-[#f0c75e]" : ""}`}
                >
                  <span aria-hidden>{quest.on ? "◆" : "◇"}</span>
                  Quest Mode {quest.on ? "attiva" : "spenta"}
                </button>
              </>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}
