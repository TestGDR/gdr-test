"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ModalSize =
  | "md"
  | "lg"
  | "xl"
  | "utility"
  | "tall"
  | "area"
  | "sheet"
  | "panel"
  | "pg"
  | "panel600"
  | "faq";

const SIZE_CLASS: Record<ModalSize, string> = {
  md: "w-[min(32rem,calc(100vw-2rem))] max-h-[90vh]",
  lg: "w-[min(46rem,calc(100vw-2rem))] max-h-[90vh]",
  xl: "w-[min(80rem,calc(100vw-2rem))] h-[min(52rem,calc(100vh-2rem))]",
  // Utility e Locande e servizi: piu' piccola
  utility: "w-[min(56rem,calc(100vw-2rem))] h-[min(40rem,calc(100vh-2rem))]",
  // stretta (es. elenco online): alta quanto serve, al massimo 600px; oltre, l elenco scorre dentro
  tall: "w-[min(37.5rem,calc(100vw-1rem))] max-h-[min(37.5rem,calc(100dvh-1rem))]",
  // chat di una macroarea: altezza fissa 700px (meno su schermi bassi)
  area: "w-[min(46rem,calc(100vw-2rem))] h-[min(43.75rem,calc(100dvh-1rem))]",
  // scheda del drago: foglio largo e basso (le pagine stanno su due colonne)
  sheet:
    "w-[min(58rem,calc(100vw-1rem))] h-[min(40rem,calc(100dvh-1rem))]",
  // ricerca gioco e assenze: alta al massimo 600px, il contenuto scorre dentro
  panel:
    "w-[min(46rem,calc(100vw-2rem))] max-h-[min(37.5rem,calc(100dvh-1rem))]",
  // scheda del personaggio: linguette (13rem) + pagina 750 x 600, il contenuto gestisce lo scorrimento
  pg: "w-[min(59.875rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)]",
  // voci e pettegolezzi: sempre alta 600px (meno su schermi bassi), il contenuto scorre dentro
  panel600:
    "w-[min(46rem,calc(100vw-2rem))] h-[min(37.5rem,calc(100dvh-1rem))]",
  // FAQ: alta al massimo 600px, il contenuto scorre dentro (su cellulare quasi a tutta larghezza)
  faq: "w-[min(46rem,calc(100vw-1rem))] max-h-[min(37.5rem,calc(100dvh-1rem))]",
};

// Le finestre stanno una sopra l'altra: quella aperta o toccata per ultima
// passa davanti (le icone delle finestre ridotte restano sempre sopra a tutte)
let topZ = 70;
const raise = (el: HTMLElement | null) => {
  if (el) el.style.zIndex = String(++topZ);
};
const noSubscribe = () => () => {};
// Tiene la finestra tutta dentro la scheda del browser: lo spostamento dal
// centro non puo' superare lo spazio libero attorno (se e' piu' grande dello
// schermo resta centrata)
function clampInside(el: HTMLElement, x: number, y: number) {
  const rect = el.getBoundingClientRect();
  const maxX = Math.max(0, (window.innerWidth - rect.width) / 2);
  const maxY = Math.max(0, (window.innerHeight - rect.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}
// Scalino per ogni finestra gia aperta (su cellulare no: non ci sarebbe spazio)
function cascade() {
  if (typeof document === "undefined" || window.innerWidth < 640)
    return { x: 0, y: 0 };
  const n = Math.min(5, document.querySelectorAll("dialog[open]").length);
  return { x: n * 28, y: n * 28 };
}

// Finestra controllata dal chiamante (open / onClose).
// - non blocca la pagina: niente velo scuro, quello che sta sotto resta
//   cliccabile e si possono tenere piu' finestre aperte insieme
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
  // la finestra si disegna in fondo alla pagina (non dentro un'altra finestra):
  // serve il documento, quindi solo nel browser
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  // nata gia aperta (un pannello appena aperto): parte subito a scalino
  const [offset, setOffset] = useState(() =>
    open ? cascade() : { x: 0, y: 0 },
  );
  const [tray, setTray] = useState<HTMLElement | null>(null); // contenitore delle icone, se ridotta
  // Chiusa dal chiamante (es. cambio pagina): non resta ridotta a icona
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setTray(null);
    // si apre un po spostata rispetto alle finestre gia aperte, cosi non le copre del tutto
    else setOffset(cascade());
  }
  const minimized = open && tray !== null;
  const drag = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  useEffect(() => {
    if (!dialog) return;
    // Ridotta: il dialog si chiude (la pagina torna cliccabile) ma il contenuto resta
    if (open && !minimized && !dialog.open) {
      dialog.show(); // non modale: la pagina sotto resta usabile
      raise(dialog);
    }
    if ((!open || minimized) && dialog.open) dialog.close();
  }, [dialog, open, minimized]);

  // Appena aperta (lo scalino potrebbe portarla fuori), quando il contenuto la
  // allarga e quando si ridimensiona il browser: torna dentro i bordi
  useEffect(() => {
    if (!dialog || !open || minimized) return;
    const fit = () =>
      setOffset((o) => {
        const c = clampInside(dialog, o.x, o.y);
        return c.x === o.x && c.y === o.y ? o : c;
      });
    const frame = requestAnimationFrame(fit);
    const watcher = new ResizeObserver(fit);
    watcher.observe(dialog);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [dialog, open, minimized]);

  function minimize() {
    setTray(trayElement());
  }

  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return; // la X non avvia il trascinamento
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  }

  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !dialog) return;
    // Limiti: la finestra non esce dai bordi della scheda del browser
    const x = drag.current.baseX + e.clientX - drag.current.startX;
    const y = drag.current.baseY + e.clientY - drag.current.startY;
    setOffset(clampInside(dialog, x, y));
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
      {mounted &&
        createPortal(
          <dialog
            ref={setDialog}
            // toccandola passa davanti alle altre (in cattura: una finestra aperta
            // da dentro un'altra resta sopra a quella che l'ha aperta)
            onPointerDownCapture={(e) => raise(e.currentTarget)}
            // Esc non chiude la modale
            onCancel={(e) => e.preventDefault()}
            onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            className={`${SIZE_CLASS[size]} painted-modal fixed inset-0 m-auto flex-col overflow-hidden p-0 text-foreground shadow-2xl shadow-black open:flex`}
          >
            <div
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              className="relative flex shrink-0 cursor-grab touch-none items-center justify-between gap-3 py-2 pr-3 pl-1 select-none active:cursor-grabbing"
            >
              {/* titolo su una pennellata chiara, in alto a sinistra */}
              <h2 className="painted-title min-w-0 truncate">{title}</h2>
              <div className="ml-auto flex shrink-0 items-center gap-3 text-[#d9d3c4]">
                <GrabIcon />
                <button
                  type="button"
                  onClick={minimize}
                  aria-label="Riduci a icona"
                  title="Riduci a icona"
                  className="leading-none hover:text-white"
                >
                  <MinimizeIcon />
                </button>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Chiudi"
                  title="Chiudi"
                  className="painted-close"
                />
              </div>
            </div>
            <div
              className={
                size === "tall"
                  ? "flex min-h-0 flex-1 flex-col"
                  : size === "xl" || size === "sheet" || size === "pg"
                    ? "min-h-0 flex-1"
                    : "min-h-0 flex-1 overflow-y-auto p-5"
              }
            >
              {children}
            </div>
          </dialog>,
          document.body,
        )}
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
      "fixed bottom-3 left-3 z-[100000] flex max-w-[calc(100vw-1.5rem)] flex-wrap-reverse gap-2";
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
