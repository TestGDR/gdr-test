import type { ReactNode } from "react";

// Icone in stile PEGI (disegnate da zero: i loghi PEGI ufficiali sono marchi registrati
// e riservati ai videogiochi classificati). Indicano età minima e contenuti del gioco.

const svg = {
  viewBox: "0 0 32 32",
  width: 26,
  height: 26,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const DESCRIPTORS: { label: string; icon: ReactNode }[] = [
  {
    label: "Violenza",
    icon: (
      // Spada
      <svg {...svg}>
        <path d="M24 4 L27 5 L28 8 L13 23 L9 19 Z" />
        <path d="M7 17 L15 25 M10 22 L5 27 M4 26 L6 28" />
      </svg>
    ),
  },
  {
    label: "Linguaggio scurrile",
    icon: (
      // Fumetto con simboli
      <svg {...svg}>
        <path d="M5 7 H27 V21 H14 L8 27 V21 H5 Z" />
        <text x="16" y="17.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="currentColor" stroke="none">
          #@!
        </text>
      </svg>
    ),
  },
  {
    label: "Paura",
    icon: (
      // Ragno
      <svg {...svg}>
        <ellipse cx="16" cy="18" rx="4" ry="5" />
        <circle cx="16" cy="11" r="2.5" />
        <path d="M12 15 L6 11 L4 14 M12 18 L5 18 L3 21 M12 21 L6 25 L5 28 M20 15 L26 11 L28 14 M20 18 L27 18 L29 21 M20 21 L26 25 L27 28" />
      </svg>
    ),
  },
  {
    label: "Interazione online con altri giocatori",
    icon: (
      // Globo
      <svg {...svg}>
        <circle cx="16" cy="16" r="11" />
        <path d="M5 16 H27 M16 5 C11 10 11 22 16 27 M16 5 C21 10 21 22 16 27" />
      </svg>
    ),
  },
];

export default function AgeRating() {
  return (
    <ul className="flex items-end justify-center gap-2" aria-label="Classificazione dei contenuti">
      <li
        title="Vietato ai minori di 18 anni"
        className="flex h-14 w-12 flex-col items-center justify-center rounded-sm border-2 border-white bg-red-700 text-white"
      >
        <span className="text-2xl leading-none font-black">18</span>
        <span className="mt-0.5 text-[8px] font-semibold tracking-wider">ANNI</span>
      </li>
      {DESCRIPTORS.map((d) => (
        <li
          key={d.label}
          title={d.label}
          className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-white bg-black text-white"
        >
          {d.icon}
          <span className="sr-only">{d.label}</span>
        </li>
      ))}
    </ul>
  );
}
