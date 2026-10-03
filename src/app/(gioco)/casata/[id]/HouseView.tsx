"use client";

import DOMPurify from "dompurify";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import HouseDragons from "@/components/draghi/HouseDragons";
import { buildTree, FamilyCanvas } from "@/components/houses/FamilyTree";
import { SheetModal } from "@/components/scheda/SheetButton";
import { GAME_YEAR } from "@/lib/game-config";
import {
  lifeLabel,
  type FamilyMember,
  type FamilyRelation,
  type House,
  type HouseNpc,
  type HouseRole,
} from "@/lib/houses";

export type HouseMemberPg = {
  id: string;
  name: string;
  status: "bozza" | "attivo";
  avatar_url: string | null;
  house_role_id: string | null;
};

type Props = {
  house: House;
  roles: HouseRole[];
  npcs: HouseNpc[];
  members: HouseMemberPg[];
  family: FamilyMember[];
  relations: FamilyRelation[];
  allNpcs: HouseNpc[];
  allHouses: House[];
};

export default function HouseView({ house, roles, npcs, members, family, relations, allNpcs, allHouses }: Props) {
  const [sheetId, setSheetId] = useState<string | null>(null);
  const tree = buildTree(family, relations, allNpcs, allHouses, house.id);

  return (
    <div className="space-y-6">
      {/* Intestazione: stemma, nome, motto */}
      <header className="flex flex-col items-center gap-3 rounded-md border border-border bg-[radial-gradient(ellipse_at_top,#2a1612_0%,#0b0a0a_75%)] px-6 py-8 text-center">
        {house.sigil_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={house.sigil_url} alt={`Stemma della casata ${house.name}`} className="h-32 w-32 object-contain drop-shadow-[0_0_18px_rgba(226,98,45,0.35)]" />
        ) : (
          <span className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-accent/60 font-serif text-5xl text-accent">
            {house.name[0]}
          </span>
        )}
        <h1 className="font-serif text-4xl tracking-wide text-accent">Casata {house.name}</h1>
        {house.motto && <p className="font-serif text-xl text-foreground/90 italic">«{house.motto}»</p>}
        {house.description && <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-line text-muted">{house.description}</p>}
      </header>

      {house.history && (
        <Section title="Storia">
          <SafeHtml html={house.history} />
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Membri (${members.length})`}>
          {members.length === 0 ? (
            <p className="text-sm text-muted">Nessun PG in questa casata.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSheetId(m.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-border bg-black/40 px-3 py-2 text-left transition hover:border-accent"
                  >
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded border border-blood/60 font-serif text-accent">{m.name[0]}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-accent">
                        {m.name} <span className="text-foreground">{house.name}</span>
                      </span>
                      <span className="block text-xs text-muted">
                        {roles.find((r) => r.id === m.house_role_id)?.name ?? "Senza ruolo"}
                        {m.status !== "attivo" && " · PG non attivo"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Ruoli">
          {roles.length === 0 ? (
            <p className="text-sm text-muted">Nessun ruolo.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {roles.map((r) => {
                const pgs = members.filter((m) => m.house_role_id === r.id);
                const pngs = npcs.filter((n) => n.house_role_id === r.id);
                return (
                  <li key={r.id} className="py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-serif text-foreground">{r.name}</span>
                      <span className="text-xs text-muted">
                        {r.daily_salary} monete/giorno
                        {r.signup_available && r.max_members !== null && ` · ${pgs.length + pngs.length}/${r.max_members} posti`}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {pgs.map((m) => (
                        <button key={m.id} type="button" onClick={() => setSheetId(m.id)} className="rounded-full border border-accent/50 px-2 py-0.5 text-accent hover:bg-accent/10">
                          PG · {m.name}
                        </button>
                      ))}
                      {pngs.map((n) => (
                        <span key={n.id} className="rounded-full border border-border px-2 py-0.5 text-muted">
                          PNG · {n.name}
                        </span>
                      ))}
                      {pgs.length + pngs.length === 0 && <span className="text-muted italic">vacante</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section title={`PNG (${npcs.length})`}>
        {npcs.length === 0 ? (
          <p className="text-sm text-muted">Nessun PNG.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {npcs.map((n) => {
              const life = lifeLabel(n, GAME_YEAR);
              const role = roles.find((r) => r.id === n.house_role_id)?.name;
              return (
                <li key={n.id} className={`flex gap-3 rounded-md border border-border bg-black/40 p-3 ${n.deceased ? "opacity-75" : ""}`}>
                  {n.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.image_url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-border font-serif text-2xl text-muted">{n.name[0]}</span>
                  )}
                  <div className="min-w-0">
                    <p className="font-serif text-accent">
                      {n.name}
                      {n.deceased && <span className="ml-1 text-muted">†</span>}
                    </p>
                    {(role || n.title) && <p className="text-xs text-muted">{[role, n.title].filter(Boolean).join(" · ")}</p>}
                    {life && <p className="text-xs text-foreground/70">{life}</p>}
                    {n.description && <p className="mt-1 line-clamp-4 text-xs leading-relaxed whitespace-pre-line">{n.description}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Draghi">
        <HouseDragons houseId={house.id} />
      </Section>

      <Section title="Albero genealogico">
        {tree.roots.length === 0 ? (
          <p className="text-sm text-muted">L&apos;albero genealogico non è ancora stato compilato.</p>
        ) : (
          <div className="max-h-[75vh] overflow-auto rounded-md border border-border/60 bg-[radial-gradient(ellipse_at_top,#1d1512_0%,transparent_70%)]">
            <FamilyCanvas tree={tree} family={family} selectedId={null} readOnly />
          </div>
        )}
      </Section>

      <SheetModal characterId={sheetId} onClose={() => setSheetId(null)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-black/40 p-5">
      <h2 className="mb-3 font-serif text-xl tracking-wide text-accent uppercase">{title}</h2>
      {children}
    </section>
  );
}

// Storia scritta con l'editor: HTML ripulito nel browser prima di mostrarlo
// (sul server non c'e' il DOM: il testo compare appena la pagina e' nel browser)
const noop = () => () => {};
function SafeHtml({ html }: { html: string }) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const clean = inBrowser ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : "";
  return <div className="guide-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}
