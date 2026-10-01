// Icone della barra del mondo di gioco (stroke = colore del testo corrente)
const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const MapIcon = () => (
  <svg {...base}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);

export const SheetIcon = () => (
  <svg {...base}>
    <path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M15 3v4h4M9 12h6M9 16h6M9 8h3" />
  </svg>
);

export const BookIcon = () => (
  <svg {...base}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
    <path d="M4 19a2 2 0 0 1 2-2h13M9 7h6M9 11h6" />
  </svg>
);

export const CastleIcon = () => (
  <svg {...base}>
    <path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12H4Z" />
    <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
  </svg>
);

export const UsersIcon = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.5 2.8 3.5 6" />
  </svg>
);

export const EyeIcon = () => (
  <svg {...base}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const RefreshIcon = () => (
  <svg {...base}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </svg>
);

export const PowerIcon = () => (
  <svg {...base}>
    <path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0" />
  </svg>
);

export const MenuIcon = () => (
  <svg {...base}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const FlameIcon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8Z" />
  </svg>
);

export const ChevronIcon = ({ left }: { left?: boolean }) => (
  <svg {...base} width={16} height={16} className={left ? "rotate-180" : ""}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
