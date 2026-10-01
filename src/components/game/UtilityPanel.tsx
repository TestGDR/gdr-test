"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import HouseLoader from "@/components/houses/HouseLoader";
import { SheetModal } from "@/components/scheda/SheetButton";
import ModalButton from "@/components/ui/ModalButton";
import { createClient } from "@/lib/supabase/client";

type Pg = {
  id: string;
  name: string;
  status: "bozza" | "attivo";
  face_claim: string | null;
  avatar_url: string | null;
  house: { name: string; sigil_url: string | null } | null;
};
type PlayableHouse = { id: string; name: string; sigil_url: string | null; motto: string };

// Box della schermata iniziale: cliccandone uno il suo contenuto prende il posto dei box
const BOXES = [
  { id: "pg", label: "Anagrafe personaggi", icon: <AddressBookIcon />, color: "text-accent" },
  { id: "prestavolti", label: "Anagrafe prestavolti", icon: <MasksIcon />, color: "text-amber-400" },
  { id: "casate", label: "Casate PG", icon: <ShieldIcon />, color: "text-red-500" },
] as const;
type Section = (typeof BOXES)[number]["id"];

// Pulsante della barra in alto: apre l'Utility giocatore
export default function UtilityButton({ className, trigger }: { className: string; trigger: ReactNode }) {
  // I dati si caricano a ogni apertura, cosi' sono sempre aggiornati
  const [openCount, setOpenCount] = useState(0);
  return (
    <ModalButton label={trigger} title="Utility giocatore" size="xl" className={className} onOpen={() => setOpenCount((c) => c + 1)}>
      {() => (openCount > 0 ? <UtilityPanel key={openCount} /> : null)}
    </ModalButton>
  );
}

function UtilityPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Section | null>(null); // null = schermata dei box
  const [houseId, setHouseId] = useState<string | null>(null); // casata aperta dentro la modale
  const [pgs, setPgs] = useState<Pg[] | null>(null);
  const [houses, setHouses] = useState<PlayableHouse[]>([]);
  const [query, setQuery] = useState("");
  const [sheetId, setSheetId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("characters").select("id, name, status, face_claim, avatar_url, house:houses(name, sigil_url)").order("name"),
      supabase.from("houses").select("id, name, sigil_url, motto").eq("playable", true).order("sort_order").order("name"),
    ]).then(([c, h]) => {
      setPgs((c.data ?? []) as unknown as Pg[]);
      setHouses((h.data ?? []) as PlayableHouse[]);
    });
  }, [supabase]);

  const openHouse = houses.find((h) => h.id === houseId);
  const q = query.trim().toLowerCase();
  const fullName = (p: Pg) => (p.house ? `${p.name} ${p.house.name}` : p.name);
  const visiblePgs = (pgs ?? []).filter((p) => !q || fullName(p).toLowerCase().includes(q) || (p.face_claim ?? "").toLowerCase().includes(q));
  const faceClaims = visiblePgs.filter((p) => p.face_claim).sort((a, b) => a.face_claim!.localeCompare(b.face_claim!));

  return (
    <div className="flex h-full flex-col">
      {tab === null ? (
        // Schermata iniziale: i box
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
          <h2 className="mb-8 text-center font-serif text-4xl tracking-[0.15em] text-accent uppercase">Utility</h2>
          <ul className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BOXES.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTab(b.id);
                    setHouseId(null);
                    setQuery("");
                  }}
                  className="group flex h-36 w-full flex-col items-center justify-center gap-4 border-4 border-double border-border bg-black/40 transition hover:border-accent/60 hover:bg-blood/10"
                >
                  <span className={`${b.color} transition group-hover:scale-110`}>{b.icon}</span>
                  <span className="font-serif text-sm tracking-[0.2em] text-muted uppercase group-hover:text-foreground">{b.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        {openHouse ? (
          <button type="button" onClick={() => setHouseId(null)} className="text-sm text-muted hover:text-accent">
            ← Casate PG
          </button>
        ) : (
          <button type="button" onClick={() => setTab(null)} className="text-sm text-muted hover:text-accent">
            ← Utility
          </button>
        )}
        <h2 className="font-serif text-lg tracking-[0.15em] text-accent uppercase">
          {openHouse ? `Casata ${openHouse.name}` : BOXES.find((b) => b.id === tab)?.label}
        </h2>
        {tab !== "casate" && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "pg" ? "Cerca un personaggio..." : "Cerca un prestavolto..."}
            className="input ml-auto w-full py-1.5 text-sm sm:w-64"
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {pgs === null && <p className="text-center text-muted">Caricamento...</p>}

        {/* Anagrafica giocatori: nome e cognome, cliccabili */}
        {pgs !== null && tab === "pg" && (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePgs.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSheetId(p.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-border bg-black/40 px-3 py-2 text-left transition hover:border-accent hover:bg-blood/10"
                >
                  <Portrait pg={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-accent">
                      {p.name}
                      {p.house && <span className="text-foreground"> {p.house.name}</span>}
                    </span>
                    {p.status !== "attivo" && <span className="text-xs text-orange-300">PG non ancora attivo</span>}
                  </span>
                  {p.house?.sigil_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.house.sigil_url} alt="" title={`Casata ${p.house.name}`} className="h-6 w-6 object-contain" />
                  )}
                </button>
              </li>
            ))}
            {visiblePgs.length === 0 && <li className="text-muted">Nessun personaggio trovato.</li>}
          </ul>
        )}

        {/* Anagrafica prestavolti */}
        {pgs !== null && tab === "prestavolti" && (
          <ul className="divide-y divide-border/60">
            {faceClaims.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-48 flex-1 font-serif text-foreground">{p.face_claim}</span>
                <button type="button" onClick={() => setSheetId(p.id)} className="text-sm text-accent hover:underline">
                  {fullName(p)}
                </button>
              </li>
            ))}
            {faceClaims.length === 0 && (
              <li className="py-2 text-muted">
                Nessun prestavolto registrato. Ogni giocatore lo inserisce nella propria scheda (✎ Prestavolto e immagine).
              </li>
            )}
          </ul>
        )}

        {/* Casate giocabili: aprono la pagina della casata */}
        {/* Pagina della casata aperta, al posto dell'elenco */}
        {tab === "casate" && houseId && <HouseLoader key={houseId} houseId={houseId} />}

        {pgs !== null && tab === "casate" && !houseId && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {houses.map((h) => {
              const members = (pgs ?? []).filter((p) => p.house?.name === h.name).length;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setHouseId(h.id)}
                    className="flex h-full w-full items-center gap-3 rounded-md border border-border bg-black/40 p-3 text-left transition hover:border-accent hover:bg-blood/10"
                  >
                    {h.sigil_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.sigil_url} alt="" className="h-14 w-14 shrink-0 object-contain" />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-border font-serif text-xl text-muted">
                        {h.name[0]}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-serif text-lg text-accent">{h.name}</span>
                      {h.motto && <span className="block truncate text-xs text-muted italic">«{h.motto}»</span>}
                      <span className="block text-xs text-muted">
                        {members} PG
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {houses.length === 0 && <li className="text-muted">Nessuna casata giocabile.</li>}
          </ul>
        )}
      </div>

      </>
      )}

      <SheetModal characterId={sheetId} onClose={() => setSheetId(null)} />
    </div>
  );
}

function Portrait({ pg }: { pg: Pg }) {
  return pg.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={pg.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-blood/60 bg-background font-serif text-accent">
      {pg.name[0]}
    </span>
  );
}

// Icone dei box
const big = { width: 44, height: 44, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true };

function AddressBookIcon() {
  return (
    <svg {...big}>
      <path d="M5 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm6 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-5 11h10c0-2.8-2.2-4-5-4s-5 1.2-5 4Z" />
      <path d="M20 5h1.5v3H20zM20 10.5h1.5v3H20zM20 16h1.5v3H20z" />
    </svg>
  );
}

function MasksIcon() {
  return (
    <svg {...big}>
      <path d="M2 4c3 .9 6 .9 9 0v6.5c0 3-2 5.3-4.5 5.3S2 13.5 2 10.5V4Zm2.6 4.1c.8-.6 1.8-.6 2.6 0 .2-.6-.5-1.2-1.3-1.2s-1.5.6-1.3 1.2Zm.8 3.6c.8.8 2.4.8 3.2 0-.9-.4-2.3-.4-3.2 0Z" opacity=".75" />
      <path d="M12 8c3 .9 6 .9 9 0v6.5c0 3-2 5.5-4.5 5.5S12 17.5 12 14.5V8Zm2.4 3.6c.2.6.8 1 1.4 1s1.2-.4 1.4-1c-.8-.3-2-.3-2.8 0Zm4.6 0c-.8-.3-2-.3-2.8 0 .2.6.8 1 1.4 1s1.2-.4 1.4-1Zm-4.2 4c.8 1.1 2.6 1.1 3.4 0-.9.3-2.5.3-3.4 0Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...big}>
      <path d="M12 2 4 5v6.5c0 5 3.4 9 8 10.5 4.6-1.5 8-5.5 8-10.5V5l-8-3Zm0 4.2 4 2.8-1.5 4.8h-5L8 9l4-2.8Z" />
    </svg>
  );
}
