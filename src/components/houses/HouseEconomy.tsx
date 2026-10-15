"use client";

import { useRouter } from "next/navigation";
import { worstMood, type MoodRow } from "@/lib/mood";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DEFAULT_ECONOMY, fiefTypeRows, sumAmounts, type EconomySettings } from "@/lib/fief-income";
import { createClient } from "@/lib/supabase/client";
import { fiefTaxPct, fiefsTaxes, type TaxSettings } from "@/lib/taxes";

// ---------------------------------------------------------------------
// Feudi e tesoro di una casata, nella pagina della casata.
// I feudi li vedono tutti; il tesoro solo i membri. Chi ha un ruolo di
// casata abilitato ("Costruisce nei feudi") costruisce le strutture.
// ---------------------------------------------------------------------

type Amount = { resource_id: string; amount: number };
export type EcoResource = { id: string; name: string; tradable?: boolean };
export type EcoStructureType = {
  id: string;
  name: string;
  description: string;
  image_url?: string | null; // facoltativa: si vede nelle caselle del feudo
  category?: string; // Produzione, Militari... (solo per raggrupparle)
  attack: number;
  defense: number;
  costs: Amount[];
  incomes: Amount[];
  upkeep: Amount[];
};
export type EcoFiefType = { id: string; name: string; incomes: Amount[]; upkeep?: Amount[] };
// mantenimento del mese per risorsa: esercito (pieno se richiamato, un quarto se congedato) e draghi
export type UpkeepRow = { resource_id: string; army: number; dragons: number };
export type EcoFief = {
  id: string;
  name: string;
  size: "piccolo" | "medio" | "grande";
  fief_type_id: string | null;
  fief_type2_id?: string | null; // secondo tipo (conta in parte)
  description: string;
  location: { name: string } | null;
  structures: { id: string; structure_type_id: string; is_background: boolean }[];
};

const CAPACITY = { piccolo: 5, medio: 7, grande: 10 } as const;

export default function HouseEconomy({
  houseName,
  playable,
  fiefs,
  fiefTypes,
  structureTypes,
  resources,
  treasury,
  isMember,
  builderId,
  onChanged,
  bare = false,
  taxes,
  part = "tutto",
  mood = null,
  upkeep = [],
}: {
  houseName: string;
  playable: boolean;
  fiefs: EcoFief[];
  fiefTypes: EcoFiefType[];
  structureTypes: EcoStructureType[];
  resources: EcoResource[];
  treasury: Record<string, number> | null; // null: non e' un membro
  isMember: boolean;
  builderId: string | null; // il mio PG, se puo' costruire
  onChanged?: () => void; // nel pannello della barra: ricarica i dati
  bare?: boolean; // senza riquadro (dentro una finestra)
  // nel pannello Feudi le parti stanno in schede separate: entrate (tesoro e da dove
  // arriva) oppure strutture (costruire e demolire); nella pagina della casata tutto insieme
  part?: "tutto" | "entrate" | "strutture";
  mood?: MoodRow[] | null; // umore del popolo (null: non disponibile)
  upkeep?: UpkeepRow[];
  // tasse: impostazioni, nome della casata regnante, se questa casata e' la regnante e quanto riceve
  taxes?: { settings: TaxSettings; rulerName: string | null; isRuler: boolean; received: Record<string, number> } | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // grandezza e secondo tipo (Gestione -> Economia), mantenimento dei tipi di feudo,
  // tipi di feudo in cui si costruisce ogni struttura (migrazione 0155)
  const [eco, setEco] = useState<EconomySettings>(DEFAULT_ECONOMY);
  const [typeUpkeep, setTypeUpkeep] = useState<(Amount & { fief_type_id: string })[]>([]);
  const [allowed, setAllowed] = useState<{ structure_type_id: string; fief_type_id: string }[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from("economy_settings").select("medium_factor, large_factor, secondary_factor").maybeSingle(),
      supabase.from("fief_type_upkeep").select("fief_type_id, resource_id, amount"),
      supabase.from("structure_fief_types").select("structure_type_id, fief_type_id"),
    ]).then(([e, u, a]) => {
      if (e.data) setEco(e.data as EconomySettings);
      setTypeUpkeep((u.data ?? []) as (Amount & { fief_type_id: string })[]);
      setAllowed((a.data ?? []) as { structure_type_id: string; fief_type_id: string }[]);
    });
  }, [supabase]);
  const types = fiefTypes.map((t) => ({ ...t, upkeep: typeUpkeep.filter((u) => u.fief_type_id === t.id) }));
  const res = (id: string) => resources.find((r) => r.id === id)?.name ?? "?";
  const text = (list: Amount[]) => (list.length ? list.map((a) => `${a.amount} ${res(a.resource_id)}`).join(", ") : "nulla");

  // al mese: introiti dei tipi di feudo + entrate delle strutture - mantenimento - tasse (+ tasse ricevute)
  const vassal = !!taxes?.settings.ruling_house_id && !taxes.isRuler;
  const paid = vassal && taxes ? fiefsTaxes(fiefs, taxes.settings, types, structureTypes, eco) : {};
  const monthly: Record<string, number> = {};
  for (const [r, n] of Object.entries(paid)) monthly[r] = (monthly[r] ?? 0) - n;
  if (taxes?.isRuler) for (const [r, n] of Object.entries(taxes.received)) monthly[r] = (monthly[r] ?? 0) + n;
  for (const u of upkeep) monthly[u.resource_id] = (monthly[u.resource_id] ?? 0) - u.army - u.dragons;
  for (const f of fiefs) {
    const rows = fiefTypeRows(f, types, eco);
    for (const a of rows.incomes) monthly[a.resource_id] = (monthly[a.resource_id] ?? 0) + a.amount;
    for (const a of rows.upkeep) monthly[a.resource_id] = (monthly[a.resource_id] ?? 0) - a.amount;
    for (const s of f.structures) {
      const t = structureTypes.find((x) => x.id === s.structure_type_id);
      for (const a of t?.incomes ?? []) monthly[a.resource_id] = (monthly[a.resource_id] ?? 0) + a.amount;
      for (const a of t?.upkeep ?? []) monthly[a.resource_id] = (monthly[a.resource_id] ?? 0) - a.amount;
    }
  }

  async function build(fief: EcoFief, typeId: string) {
    const type = structureTypes.find((t) => t.id === typeId);
    if (!type || !builderId) return;
    if (!window.confirm(`Costruire ${type.name} a ${fief.name}? Costa: ${text(type.costs)}.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("build_structure", { p_fief: fief.id, p_structure_type: typeId, p_character: builderId });
    setBusy(false);
    setMsg(
      error
        ? { ok: false, text: error.message.includes("insufficienti") ? `Il tesoro non basta (${error.message.split(":")[1]?.trim() ?? ""}).` : error.message.includes("duplicate key") || error.message.includes("già nel feudo") ? `${type.name} c'è già in ${fief.name}.` : error.message.replace("piu''", "più") }
        : { ok: true, text: `${type.name} costruita a ${fief.name}.` },
    );
    if (!error) {
      if (onChanged) onChanged();
      else router.refresh();
    }
  }

  // Demolire: la casata recupera meta' di quanto aveva speso (le strutture di BG non restituiscono nulla)
  async function demolish(fief: EcoFief, s: EcoFief["structures"][number]) {
    const type = structureTypes.find((t) => t.id === s.structure_type_id);
    const note = s.is_background ? "È una struttura di BG: non restituisce risorse." : "La casata recupera metà di quanto aveva speso.";
    if (!window.confirm(`Demolire ${type?.name ?? "la struttura"} a ${fief.name}? ${note}`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("demolish_structure", { p_structure: s.id, p_character: builderId });
    setBusy(false);
    const back = Object.entries((data ?? {}) as Record<string, number>).map(([id, n]) => `${n} ${res(id)}`);
    setMsg(error ? { ok: false, text: "Demolizione non riuscita." } : { ok: true, text: back.length ? `Demolita: recuperati ${back.join(", ")}.` : "Demolita." });
    if (!error) {
      if (onChanged) onChanged();
      else router.refresh();
    }
  }

  if (fiefs.length === 0 && !isMember) return null;
  const showIncome = part !== "strutture";
  const showFiefs = part !== "entrate";
  // da dove arriva ogni mese: per feudo, tipo di feudo + strutture - mantenimento
  const fiefMonthly = (f: EcoFief) => {
    const m: Record<string, number> = {};
    const rows = fiefTypeRows(f, types, eco);
    for (const a of rows.incomes) m[a.resource_id] = (m[a.resource_id] ?? 0) + a.amount;
    for (const a of rows.upkeep) m[a.resource_id] = (m[a.resource_id] ?? 0) - a.amount;
    for (const s of f.structures) {
      const t = structureTypes.find((x) => x.id === s.structure_type_id);
      for (const a of t?.incomes ?? []) m[a.resource_id] = (m[a.resource_id] ?? 0) + a.amount;
      for (const a of t?.upkeep ?? []) m[a.resource_id] = (m[a.resource_id] ?? 0) - a.amount;
    }
    return Object.entries(m).filter(([, n]) => n !== 0);
  };

  return (
    <section className={bare ? "space-y-4" : "mt-6 space-y-4 border border-border bg-black/40 p-5"}>
      {!bare && <h2 className="font-serif text-2xl text-accent">Feudi e risorse</h2>}
      {showIncome && (
        <>
      <p className="text-sm text-muted">
        I feudi di casa {houseName} ({playable ? "casata PG" : "casata PNG"}). Ogni 1° del mese la casata riceve le risorse dei feudi e delle
        strutture.
      </p>

      {isMember && part === "entrate" && mood !== null && <MoodBar rows={mood} res={res} />}

      {taxes?.isRuler && (
        <p className="border border-[#d4a72c]/50 bg-[#d4a72c]/10 px-3 py-2 text-sm text-[#f0c75e]">
          Casata regnante: ogni mese riceve le tasse delle casate feudatarie
          {Object.keys(taxes.received).length ? `: ${text(Object.entries(taxes.received).map(([resource_id, amount]) => ({ resource_id, amount })))}.` : "."}
        </p>
      )}
      {vassal && taxes?.rulerName && (
        <p className="text-sm text-muted">
          Casata feudataria: ogni mese paga le tasse a casa {taxes.rulerName}
          {Object.keys(paid).length ? `: ${text(Object.entries(paid).map(([resource_id, amount]) => ({ resource_id, amount })))}.` : " (per ora i feudi non producono nulla)."}
        </p>
      )}
      {isMember && treasury && (
        <div className="space-y-2">
          <h3 className="text-xs tracking-[0.12em] text-muted uppercase">Tesoro della casata</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resources.map((r) => (
              <li key={r.id} className="border border-border/60 bg-black/30 px-3 py-2">
                <span className="block text-xs text-muted uppercase">{r.name}</span>
                <span className="font-serif text-2xl text-accent">{(treasury[r.id] ?? 0).toLocaleString("it-IT")}</span>
                {monthly[r.id] ? (
                  <span className={`ml-2 text-xs ${monthly[r.id] > 0 ? "text-green-400" : "text-red-400"}`}>
                    {monthly[r.id] > 0 ? "+" : ""}
                    {monthly[r.id]} al mese
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {part === "entrate" && fiefs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs tracking-[0.12em] text-muted uppercase">Da dove arrivano, ogni mese</h3>
          <ul className="space-y-1 text-sm">
            {fiefs.map((f) => {
              const list = fiefMonthly(f);
              return (
                <li key={f.id} className="flex flex-wrap gap-x-2 border-b border-border/40 py-1">
                  <span className="font-serif text-accent">{f.name}</span>
                  <span className="text-muted">
                    {list.length
                      ? list.map(([id, n]) => `${n > 0 ? "+" : ""}${n} ${res(id)}`).join(" · ")
                      : "per ora non produce nulla"}
                  </span>
                </li>
              );
            })}
          </ul>
          {upkeep.some((u) => u.army > 0) && (
            <p className="flex flex-wrap gap-x-2 border-b border-border/40 py-1 text-sm">
              <span className="font-serif text-accent">Esercito</span>
              <span className="text-muted">{upkeep.filter((u) => u.army > 0).map((u) => `-${u.army} ${res(u.resource_id)}`).join(" · ")}</span>
            </p>
          )}
          {upkeep.some((u) => u.dragons > 0) && (
            <p className="flex flex-wrap gap-x-2 border-b border-border/40 py-1 text-sm">
              <span className="font-serif text-accent">Draghi</span>
              <span className="text-muted">{upkeep.filter((u) => u.dragons > 0).map((u) => `-${u.dragons} ${res(u.resource_id)}`).join(" · ")}</span>
            </p>
          )}
          <p className="text-xs text-muted">Già al netto del mantenimento delle strutture; le tasse sono scritte sopra.</p>
        </div>
      )}
      {part === "entrate" && fiefs.length === 0 && <p className="text-sm text-muted">La casata non ha ancora feudi.</p>}
        </>
      )}

      {showFiefs && fiefs.length === 0 && <p className="text-sm text-muted">La casata non ha ancora feudi.</p>}
      {showFiefs && (
      <ul className="space-y-3">
        {fiefs.map((f) => {
          const type = fiefTypes.find((t) => t.id === f.fief_type_id);
          const type2 = f.fief_type2_id ? fiefTypes.find((t) => t.id === f.fief_type2_id) : undefined;
          const rows = fiefTypeRows(f, types, eco);
          const cap = CAPACITY[f.size];
          const counts = new Map<string, number>();
          for (const s of f.structures) counts.set(s.structure_type_id, (counts.get(s.structure_type_id) ?? 0) + 1);
          return (
            <li key={f.id} className="border border-border/60 bg-black/30 p-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className="font-serif text-lg text-accent">{f.name}</h3>
                <span className="text-xs text-muted">
                  {type?.name ?? "senza tipo"}
                  {type2 && ` + ${type2.name} (secondario)`} · feudo {f.size}
                  {f.location && ` · ${f.location.name}`}
                </span>
                <span className="ml-auto text-right text-sm">
                  Strutture {f.structures.length}/{cap}
                  <span className="block text-xs text-muted">
                    Attacco {f.structures.reduce((n, s) => n + (structureTypes.find((t) => t.id === s.structure_type_id)?.attack ?? 0), 0)} · Difesa{" "}
                    {f.structures.reduce((n, s) => n + (structureTypes.find((t) => t.id === s.structure_type_id)?.defense ?? 0), 0)}
                  </span>
                </span>
              </div>
              {f.description && <p className="mt-1 text-sm whitespace-pre-line text-muted">{f.description}</p>}
              {(type || type2) && <p className="mt-1 text-xs text-muted">Rende ogni mese: {text(sumAmounts(rows.incomes))}</p>}
              {rows.upkeep.length > 0 && <p className="text-xs text-muted">Mantenimento del feudo: {text(sumAmounts(rows.upkeep))} al mese</p>}
              {vassal && taxes && <p className="text-xs text-muted">Tasse: {fiefTaxPct(f, taxes.settings)}% di ciò che produce</p>}
              <StructureSlots
                fief={f}
                cap={cap}
                structureTypes={structureTypes}
                allowed={allowed}
                fiefTypes={fiefTypes}
                treasury={treasury}
                builderId={builderId}
                busy={busy}
                text={text}
                onBuild={(typeId) => build(f, typeId)}
                onDemolish={(s) => demolish(f, s)}
              />
            </li>
          );
        })}
      </ul>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
      {showFiefs && isMember && !builderId && fiefs.length > 0 && (
        <p className="text-xs text-muted">Le strutture le costruisce chi nella casata ha un ruolo abilitato (es. il signore).</p>
      )}
    </section>
  );
}

// Una struttura vista come tessera: immagine (o l'iniziale su un fondo scuro), nome e forza
function StructureTile({ type, bg, onDemolish, busy }: { type: EcoStructureType | undefined; bg?: boolean; onDemolish?: () => void; busy?: boolean }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded border border-accent/40 bg-black/50 shadow shadow-black/60">
      <StructureImage type={type} />
      <div className="px-1.5 py-1 text-center">
        <p className="truncate font-serif text-xs text-accent" title={type?.description || type?.name}>
          {type?.name ?? "?"}
        </p>
        {(type?.attack || type?.defense) ? (
          <p className="text-[0.625rem] text-muted">
            ATT {type?.attack ?? 0} · DIF {type?.defense ?? 0}
          </p>
        ) : null}
      </div>
      {bg && <span className="absolute top-1 left-1 rounded border border-border bg-black/80 px-1 text-[0.5625rem] text-muted uppercase">BG</span>}
      {onDemolish && (
        <button
          type="button"
          disabled={busy}
          onClick={onDemolish}
          title={`Demolisci ${type?.name ?? "la struttura"}`}
          aria-label={`Demolisci ${type?.name ?? "la struttura"}`}
          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full border border-red-900 bg-black/80 text-[0.625rem] text-red-400 opacity-80 hover:text-red-300 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function StructureImage({ type, small = false }: { type: EcoStructureType | undefined; small?: boolean }) {
  return type?.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={type.image_url} alt="" className={`w-full object-cover ${small ? "aspect-[4/3]" : "aspect-square"}`} />
  ) : (
    <span
      aria-hidden
      className={`flex w-full items-center justify-center bg-gradient-to-br from-[#3a2a1c] via-[#1f1712] to-black font-serif text-accent/80 ${small ? "aspect-[4/3] text-2xl" : "aspect-square text-3xl"}`}
    >
      {type?.name?.[0] ?? "?"}
    </span>
  );
}

// Le caselle del feudo: quelle occupate e quelle libere; chi costruisce sceglie da un catalogo
function StructureSlots({
  fief,
  cap,
  structureTypes,
  allowed,
  fiefTypes,
  treasury,
  builderId,
  busy,
  text,
  onBuild,
  onDemolish,
}: {
  fief: EcoFief;
  cap: number;
  structureTypes: EcoStructureType[];
  allowed: { structure_type_id: string; fief_type_id: string }[];
  fiefTypes: EcoFiefType[];
  treasury: Record<string, number> | null;
  builderId: string | null;
  busy: boolean;
  text: (list: Amount[]) => string;
  onBuild: (typeId: string) => void;
  onDemolish: (s: EcoFief["structures"][number]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const free = Math.max(0, cap - fief.structures.length);
  const built = new Set(fief.structures.map((s) => s.structure_type_id));
  const lacks = (t: EcoStructureType) => !!treasury && t.costs.some((c) => (treasury[c.resource_id] ?? 0) < c.amount);
  // strutture che si costruiscono solo in certi tipi di feudo (es. Porto: Costiero)
  const onlyIn = (t: EcoStructureType) => allowed.filter((a) => a.structure_type_id === t.id).map((a) => a.fief_type_id);
  const forbidden = (t: EcoStructureType) => {
    const list = onlyIn(t);
    return list.length > 0 && !list.includes(fief.fief_type_id ?? "") && !list.includes(fief.fief_type2_id ?? "");
  };
  const typeNames = (ids: string[]) => ids.map((id) => fiefTypes.find((x) => x.id === id)?.name ?? "?").join(", ");
  // raggruppate per categoria, nell'ordine in cui compaiono
  const groups: { name: string; list: EcoStructureType[] }[] = [];
  for (const t of structureTypes) {
    const name = t.category?.trim() || "";
    const g = groups.find((x) => x.name === name);
    if (g) g.list.push(t);
    else groups.push({ name, list: [t] });
  }
  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {fief.structures.map((s) => (
          <StructureTile
            key={s.id}
            type={structureTypes.find((t) => t.id === s.structure_type_id)}
            bg={s.is_background}
            busy={busy}
            onDemolish={builderId ? () => onDemolish(s) : undefined}
          />
        ))}
        {Array.from({ length: free }, (_, i) =>
          builderId && i === 0 ? (
            <button
              key={i}
              type="button"
              disabled={busy}
              onClick={() => setPicking((v) => !v)}
              aria-expanded={picking}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded border border-dashed text-xs transition ${picking ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"}`}
            >
              <span className="text-2xl leading-none">+</span>
              Costruisci
            </button>
          ) : (
            <span key={i} className="flex aspect-square items-center justify-center rounded border border-dashed border-border/50 text-[0.625rem] tracking-wider text-muted/60 uppercase">
              Libera
            </span>
          ),
        )}
      </div>
      {builderId && picking && (
        <div className="space-y-2 border border-accent/40 bg-black/40 p-2">
          <p className="text-xs tracking-wide text-muted uppercase">Scegli che cosa costruire a {fief.name}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <Fragment key={g.name || "-"}>
            {g.name && groups.length > 1 && (
              <li className="pt-1 text-xs tracking-[0.12em] text-accent/80 uppercase sm:col-span-2">{g.name}</li>
            )}
            {g.list.map((t) => {
              const already = built.has(t.id);
              const notHere = !already && forbidden(t);
              const poor = !already && !notHere && lacks(t);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy || already || poor || notHere}
                    onClick={() => {
                      setPicking(false);
                      onBuild(t.id);
                    }}
                    title={already ? "C'è già in questo feudo: non se ne può costruire una seconda" : notHere ? `Si costruisce solo nei feudi di tipo ${typeNames(onlyIn(t))}` : poor ? "Il tesoro della casata non basta" : `Costruisci ${t.name}`}
                    className="flex w-full gap-2 rounded border border-border bg-black/50 p-1.5 text-left transition enabled:hover:border-accent disabled:opacity-45"
                  >
                    <span className="w-16 shrink-0">
                      <StructureImage type={t} small />
                    </span>
                    <span className="min-w-0 flex-1 text-xs">
                      <span className="block font-serif text-sm text-accent">{t.name}</span>
                      <span className="block text-muted">Costa: {text(t.costs)}</span>
                      {t.incomes.length > 0 && <span className="block text-green-400/90">Rende: {text(t.incomes)}/mese</span>}
                      {t.upkeep.length > 0 && <span className="block text-red-400/90">Mantenimento: {text(t.upkeep)}/mese</span>}
                      {(t.attack || t.defense) ? <span className="block text-muted">ATT {t.attack} · DIF {t.defense}</span> : null}
                      {already && <span className="block text-amber-200">Già nel feudo</span>}
                      {poor && <span className="block text-red-400">Tesoro insufficiente</span>}
                      {notHere && <span className="block text-amber-200">Solo nei feudi di tipo {typeNames(onlyIn(t))}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
              </Fragment>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Umore del popolo: barra da 0 a 100 (50 = stabile) e dettaglio risorsa per risorsa
// rispetto al minimo "da granaio" dei feudi
function MoodBar({ rows, res }: { rows: MoodRow[]; res: (id: string) => string }) {
  const worst = worstMood(rows);
  // minimi non ancora fissati: la barra c'e' lo stesso, vuota
  if (!worst)
    return (
      <div className="space-y-2 border border-border/60 bg-black/30 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs tracking-[0.12em] text-muted uppercase">Umore del popolo</h3>
          <span className="font-serif text-lg text-muted">—</span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-sm bg-white/10">
          <span className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
        </div>
        <p className="text-xs text-muted">Lo staff non ha ancora fissato i minimi di scorte per i feudi (Gestione → Economia → Umore del popolo).</p>
      </div>
    );
  const color = worst.color ?? "#968d89";
  return (
    <div className="space-y-2 border border-border/60 bg-black/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs tracking-[0.12em] text-muted uppercase">Umore del popolo</h3>
        <span className="font-serif text-lg" style={{ color }}>
          {worst.label ?? "—"} <span className="text-sm text-muted">{worst.score}/100</span>
        </span>
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-sm bg-white/10"
        role="meter"
        aria-label="Umore del popolo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={worst.score}
        aria-valuetext={worst.label ?? undefined}
      >
        <span className="absolute inset-y-0 left-0 rounded-sm transition-all" style={{ width: `${worst.score}%`, background: color }} />
        {/* 50: scorte esattamente al minimo */}
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/60" title="50: scorte al minimo (stabile)" />
      </div>
      <p className="text-xs text-muted">Conta la risorsa che sta peggio. A 50 le scorte sono esattamente al minimo.</p>
      <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.resource_id} className="flex justify-between gap-2">
            <span>{res(r.resource_id)}</span>
            <span style={{ color: r.color ?? undefined }}>
              {r.have.toLocaleString("it-IT")} su {r.need.toLocaleString("it-IT")} · {r.score}/100
              {r.label ? ` · ${r.label.toLowerCase()}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
