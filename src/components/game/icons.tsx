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

// Il mio drago: drago in volo visto dall'alto (ali spiegate, coda arricciata)
export const DragonIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M11 9.2 2 3.5c.9 1.6 1 3.1.4 4.6 1.4-.2 2.6.3 3.3 1.4 1.2-.5 2.4-.2 3.2.9.7-.3 1.4-.2 2.1.4Z" />
    <path d="M13 9.2 22 3.5c-.9 1.6-1 3.1-.4 4.6-1.4-.2-2.6.3-3.3 1.4-1.2-.5-2.4-.2-3.2.9-.7-.3-1.4-.2-2.1.4Z" />
    <ellipse cx="12" cy="11.2" rx="1.9" ry="3.8" />
    <path d="M12 3.2l1.5 2.4L12 7.6l-1.5-2L12 3.2Zm-1.1.7-1-1.8m3.2 1.8 1-1.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M12 14.6c-.2 2.6.6 4.2 2.4 5.2 1 .5 1.5-.4 1-1.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="m15.2 18.1 1.6.2-.4 1.6Z" />
  </svg>
);

// Info luogo: una "i" in un cerchio
export const InfoIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 11v6M12 7.5v.01" />
  </svg>
);

// Meteo: sole dietro una nuvola
export const WeatherIcon = () => (
  <svg {...base}>
    <path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2M19.1 4.9l-1.4 1.4" />
    <path d="M8.2 10.2a4 4 0 0 1 7.3-1.9" />
    <path d="M17.5 21H9a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.6 1.9 3 3 0 0 1-2 6Z" />
  </svg>
);

// Libro aperto (Manuale)
export const BookIcon = () => (
  <svg {...base}>
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
  </svg>
);

// Castello con torri merlate e portone (Ambientazione)
export const CastleIcon = () => (
  <svg {...base}>
    <path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z" />
    <path d="M18 11V4H6v7" />
    <path d="M15 22v-4a3 3 0 0 0-6 0v4" />
    <path d="M22 11V9M2 11V9M6 4V2M18 4V2M10 4V2M14 4V2" />
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

export const ToolsIcon = () => (
  <svg {...base}>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />
  </svg>
);

export const TicketIcon = () => (
  <svg {...base}>
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
    <path d="M14 5v2M14 11v2M14 17v2" />
  </svg>
);

export const GearIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
