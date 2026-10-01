"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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

const TABS = [
  { id: "pg", label: "Anagrafica giocatori" },
  { id: "prestavolti", label: "Anagrafica prestavolti" },
  { id: "casate", label: "Casate PG" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// Pulsante della barra in alto: apre l'Utility giocatore
export default function UtilityButton({ className, trigger }: { className: string; trigger: ReactNode }) {
  // I dati si caricano a ogni apertura, cosi' sono sempre aggiornati
  const [openCount, setOpenCount] = useState(0);
  return (
    <ModalButton label={trigger} title="Utility giocatore" size="xl" className={className} onOpen={() => setOpenCount((c) => c + 1)}>
      {(close) => (openCount > 0 ? <UtilityPanel key={openCount} onNavigate={close} /> : null)}
    </ModalButton>
  );
}

function UtilityPanel({ onNavigate }: { onNavigate: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("pg");
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

  const q = query.trim().toLowerCase();
  const fullName = (p: Pg) => (p.house ? `${p.name} ${p.house.name}` : p.name);
  const visiblePgs = (pgs ?? []).filter((p) => !q || fullName(p).toLowerCase().includes(q) || (p.face_claim ?? "").toLowerCase().includes(q));
  const faceClaims = visiblePgs.filter((p) => p.face_claim).sort((a, b) => a.face_claim!.localeCompare(b.face_claim!));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 pt-2">
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-xs tracking-[0.12em] uppercase transition ${
                tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "casate" && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "pg" ? "Cerca un personaggio..." : "Cerca un prestavolto..."}
            className="input my-1.5 ml-auto w-full py-1.5 text-sm sm:w-64"
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
        {pgs !== null && tab === "casate" && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {houses.map((h) => {
              const members = (pgs ?? []).filter((p) => p.house?.name === h.name).length;
              return (
                <li key={h.id}>
                  <Link
                    href={`/casata/${h.id}`}
                    onClick={onNavigate}
                    className="flex h-full items-center gap-3 rounded-md border border-border bg-black/40 p-3 transition hover:border-accent hover:bg-blood/10"
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
                  </Link>
                </li>
              );
            })}
            {houses.length === 0 && <li className="text-muted">Nessuna casata giocabile.</li>}
          </ul>
        )}
      </div>

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
