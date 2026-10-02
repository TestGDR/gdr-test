"use client";

import type { ReactNode } from "react";
import SheetButton from "@/components/scheda/SheetButton";
import type { MainCharacter } from "@/lib/main-character";

// ---------------------------------------------------------------------
// Ritratto tondo del personaggio dentro un anello di ferro scuro con
// bordi di bronzo, borchie e rombi ai quattro punti cardinali.
// Cliccandolo si apre la scheda.
// ---------------------------------------------------------------------
export function RoundPortrait({
  character,
  displayName,
  size = "h-28 w-28",
}: {
  character: MainCharacter | null;
  displayName: string;
  size?: string;
}) {
  const name = character?.name ?? displayName;
  const face = (
    <span className={`relative block ${size}`}>
      {/* Immagine (o iniziale) dentro l'anello */}
      <span className="absolute inset-[8%] overflow-hidden rounded-full bg-[radial-gradient(circle_at_40%_35%,#2a2220,#0a0808)]">
        {character?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-serif text-4xl text-accent">{name[0]}</span>
        )}
      </span>
      <PortraitRing />
    </span>
  );

  if (!character) return face;
  return (
    <SheetButton
      characterId={character.id}
      className="group relative block shrink-0 rounded-full focus-visible:outline-none"
      trigger={
        <>
          <span className="block transition group-hover:brightness-125 group-focus-visible:brightness-125">{face}</span>
          {character.status !== "attivo" && (
            <span
              title="Personaggio non ancora attivo"
              className="absolute right-1 bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-orange-300/70 bg-black text-xs text-orange-300"
            >
              ⧗
            </span>
          )}
          <span className="sr-only">
            {character.status === "attivo" ? "Apri la scheda" : "Apri la scheda (PG non ancora attivo)"}
          </span>
        </>
      }
    />
  );
}

function PortraitRing() {
  // borchie ogni 45 gradi (tranne i punti cardinali, dove ci sono i rombi)
  const studs = [45, 135, 225, 315].map((deg) => {
    const r = (deg * Math.PI) / 180;
    return { x: 60 + 56 * Math.cos(r), y: 60 + 56 * Math.sin(r) };
  });
  return (
    <svg viewBox="0 0 120 120" className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]" aria-hidden>
      <defs>
        <linearGradient id="ring-iron" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a342e" />
          <stop offset=".45" stopColor="#15120f" />
          <stop offset=".7" stopColor="#2a2520" />
          <stop offset="1" stopColor="#0b0907" />
        </linearGradient>
        <linearGradient id="ring-bronze" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d8b47a" />
          <stop offset=".35" stopColor="#6e5030" />
          <stop offset=".65" stopColor="#2c1f12" />
          <stop offset="1" stopColor="#9a7646" />
        </linearGradient>
        <radialGradient id="ring-stud" cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#f3d9a4" />
          <stop offset=".5" stopColor="#8a6a3e" />
          <stop offset="1" stopColor="#20160b" />
        </radialGradient>
      </defs>
      {/* fascia di ferro */}
      <circle cx="60" cy="60" r="56" fill="none" stroke="url(#ring-iron)" strokeWidth="7" />
      {/* bordo esterno e interno di bronzo */}
      <circle cx="60" cy="60" r="59.2" fill="none" stroke="url(#ring-bronze)" strokeWidth="1.2" />
      <circle cx="60" cy="60" r="52.6" fill="none" stroke="url(#ring-bronze)" strokeWidth="1.8" />
      <circle cx="60" cy="60" r="51.4" fill="none" stroke="#000" strokeOpacity=".85" strokeWidth="1" />
      {/* rombi ai punti cardinali */}
      {[0, 90, 180, 270].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 60 60)`}>
          <polygon points="60,0.5 64,4.5 60,8.5 56,4.5" fill="url(#ring-stud)" stroke="#1a1209" strokeWidth=".6" />
          <circle cx="60" cy="4.5" r="1" fill="#120c06" />
        </g>
      ))}
      {studs.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r="1.8" fill="url(#ring-stud)" stroke="#1a1209" strokeWidth=".4" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------
// Piastra di metallo con due alloggi tondi bordati di bronzo e due ali
// laterali: dentro gli alloggi ci sono i pulsanti dei messaggi.
// ---------------------------------------------------------------------
export function MessagePlate({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="relative mx-auto aspect-[220/64] w-full max-w-[15rem]">
      <PlateArt />
      {/* i pulsanti stanno esattamente sopra i due alloggi (cx 85 e 135 su 220) */}
      <div className="absolute top-1/2 left-[38.6%] h-[62%] -translate-x-1/2 -translate-y-1/2 aspect-square">{left}</div>
      <div className="absolute top-1/2 left-[61.4%] h-[62%] -translate-x-1/2 -translate-y-1/2 aspect-square">{right}</div>
    </div>
  );
}

function PlateArt() {
  return (
    <svg viewBox="0 0 220 64" className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]" aria-hidden>
      <defs>
        <linearGradient id="plate-iron" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35302b" />
          <stop offset=".5" stopColor="#1a1714" />
          <stop offset="1" stopColor="#0b0908" />
        </linearGradient>
        <linearGradient id="plate-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9a9590" />
          <stop offset=".4" stopColor="#4a4642" />
          <stop offset="1" stopColor="#161412" />
        </linearGradient>
        <linearGradient id="plate-bronze" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e2c088" />
          <stop offset=".35" stopColor="#7a5a34" />
          <stop offset=".65" stopColor="#2c1f12" />
          <stop offset="1" stopColor="#b08a52" />
        </linearGradient>
        <radialGradient id="plate-socket" cx=".5" cy=".4" r=".6">
          <stop offset="0" stopColor="#201c19" />
          <stop offset="1" stopColor="#050404" />
        </radialGradient>
      </defs>

      {/* ali laterali */}
      <path d="M4 12 Q22 20 30 30 L30 46 Q18 50 8 58 Q16 44 12 32 Q10 22 4 12 Z" fill="url(#plate-wing)" stroke="#0a0908" strokeWidth="1" />
      <path d="M216 12 Q198 20 190 30 L190 46 Q202 50 212 58 Q204 44 208 32 Q210 22 216 12 Z" fill="url(#plate-wing)" stroke="#0a0908" strokeWidth="1" />

      {/* piastra centrale smussata */}
      <path d="M36 16 H184 L196 28 V44 L184 56 H36 L24 44 V28 Z" fill="url(#plate-iron)" stroke="#000" strokeWidth="1.2" />
      <path d="M38 19 H182 L192 29 V43 L182 53 H38 L28 43 V29 Z" fill="none" stroke="url(#plate-bronze)" strokeWidth="1" />
      {/* rombo tra i due alloggi */}
      <polygon points="110,30 114,35 110,40 106,35" fill="url(#plate-bronze)" stroke="#1a1209" strokeWidth=".6" />

      {/* alloggi tondi */}
      {[85, 135].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="35" r="21" fill="#050404" />
          <circle cx={cx} cy="35" r="19.5" fill="url(#plate-socket)" stroke="url(#plate-bronze)" strokeWidth="3.4" />
          <circle cx={cx} cy="35" r="16.6" fill="none" stroke="#000" strokeOpacity=".8" strokeWidth="1" />
          <circle cx={cx} cy="35" r="21.3" fill="none" stroke="#e2c088" strokeOpacity=".35" strokeWidth=".6" />
        </g>
      ))}
    </svg>
  );
}

// Pulsante rotondo dentro un alloggio della piastra
export function SocketButton({
  label,
  count,
  onClick,
  children,
}: {
  label: string;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label}: ${count} non letti` : label}
      title={label}
      className="relative flex h-full w-full items-center justify-center rounded-full text-[#c9a46a] transition hover:text-accent focus-visible:text-accent focus-visible:outline-none"
    >
      {children}
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-blood px-1.5 text-center text-[11px] font-bold text-white shadow">
          {count}
        </span>
      )}
    </button>
  );
}
