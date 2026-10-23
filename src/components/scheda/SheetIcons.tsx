// Icone della scheda del personaggio: linguette a sinistra e righe della pagina Dati.
// Tutte a linee, del colore del testo intorno (currentColor).

import type { ReactNode } from "react";

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const PATHS: Record<string, ReactNode> = {
  // linguette
  principale: <path d="M3 18h18M4 18 3 7l5 4 4-6 4 6 5-4-1 11M12 5v.01" />,
  dati: (
    <>
      <path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1Z" />
      <path d="M7 16V6a2 2 0 0 0-2-2M10 9h4M10 12h4M10 15h3" />
    </>
  ),
  sisache: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  affetti: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  caratteristiche: <path d="M12 2v20M2 12h20M12 7l1.6 3.4L17 12l-3.4 1.6L12 17l-1.6-3.4L7 12l3.4-1.6Z" />,
  abilita: (
    <>
      <path d="m4 4 9 9M4 4h3l9 9-3 3-9-9Z" />
      <path d="m20 4-9 9M20 4h-3l-3 3M14 16l3 3M7 16l-3 3 1 1 3-3M17 16l3 3-1 1-3-3" />
    </>
  ),
  tratti: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" />
      <path d="M12 8l1.2 2.5 2.8.4-2 2 .5 2.7L12 14.3l-2.5 1.3.5-2.7-2-2 2.8-.4Z" />
    </>
  ),
  aspetto: (
    <>
      <path d="M5 4c4 1.5 10 1.5 14 0v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10Z" />
      <path d="M8.5 10h2M13.5 10h2M9.5 15c1.5 1 3.5 1 5 0" />
    </>
  ),
  storia: (
    <>
      <path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1Z" />
      <path d="M12 6v14" />
    </>
  ),
  equipaggiamento: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3M6 13h12M10 13v3h4v-3" />
    </>
  ),
  // sezioni e righe della pagina Dati
  identita: <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19M12 7l1.4 3.6L17 12l-3.6 1.4L12 17l-1.4-3.6L7 12l3.6-1.4Z" />,
  nobilta: <path d="M3 18h18M4 18 3 7l5 4 4-6 4 6 5-4-1 11" />,
  legami: (
    <>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </>
  ),
  simboli: <path d="M4 18c3 0 5-2 5-5 0-2-1-3-1-5 2 0 3 1 4 2 1-3 4-5 8-5-1 3-3 4-5 5 2 1 3 3 3 5-2 0-3-1-4-2 0 3-3 5-6 5Z" />,
  maschio: (
    <>
      <circle cx="10" cy="14" r="5.5" />
      <path d="M14 10l6-6M15 4h5v5" />
    </>
  ),
  donna: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M12 14.5V21M9 18h6" />
    </>
  ),
  eta: <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />,
  altezza: <path d="M12 3v18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5" />,
  capelli: (
    <>
      <path d="M7 11a5 5 0 0 1 10 0v2a5 5 0 0 1-10 0Z" />
      <path d="M6 12c-1-5 2-9 6-9s7 4 6 9M8 20c1-1 2-2 4-2s3 1 4 2" />
    </>
  ),
  occhi: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  segni: <path d="M5 19 13 5M9 20 17 6M13 21l6-11" />,
  casata: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" />,
  ruolo: <path d="M3 18h18M4 18 3 7l5 4 4-6 4 6 5-4-1 11" />,
  posizione: <path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2Z" />,
  cuore: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  drago: <path d="M4 18c3 0 5-2 5-5 0-2-1-3-1-5 2 0 3 1 4 2 1-3 4-5 8-5-1 3-3 4-5 5 2 1 3 3 3 5-2 0-3-1-4-2 0 3-3 5-6 5Z" />,
  gravidanza: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  altro: <path d="M12 3 21 12 12 21 3 12Z" />,
};

export default function SheetIcon({ name, size }: { name: string; size?: number }) {
  return <Svg size={size}>{PATHS[name] ?? PATHS.altro}</Svg>;
}

// Icona di una riga della pagina Dati, dal nome della voce
export function rowIcon(label: string, sex?: string | null) {
  const map: Record<string, string> = {
    Sesso: sex === "donna" ? "donna" : "maschio",
    "Età": "eta",
    Altezza: "altezza",
    "Colore capelli": "capelli",
    "Colore occhi": "occhi",
    "Segni visibili": "segni",
    Casata: "casata",
    "Ruolo in casata": "ruolo",
    Posizione: "posizione",
    "Stato civile": "cuore",
    Drago: "drago",
    Gravidanza: "gravidanza",
  };
  return map[label] ?? "altro";
}
