import type { ReactNode } from "react";

// Campo con icona a sinistra, usato nelle modali di accesso e registrazione

export function IconField({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="flex overflow-hidden rounded-md border border-border bg-background focus-within:border-accent">
      <span className="flex w-12 shrink-0 items-center justify-center border-r border-border text-muted">
        {icon}
      </span>
      <span className="flex-1 px-3 py-1.5">
        <span className="block text-xs text-muted">{label}</span>
        {children}
      </span>
    </label>
  );
}


const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function AtIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" />
    </svg>
  );
}

export function KeyIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 20 3M16 7l3 3M14 9l2 2" />
    </svg>
  );
}
