"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  housePower,
  sumPowers,
  versus,
  type FiefPoints,
  type HouseTroop,
  type Kingdom,
  type Matchup,
  type TroopType,
} from "@/lib/armies";
import { createClient } from "@/lib/supabase/client";

export type HouseLite = { id: string; name: string; playable: boolean };

const TABS = [
  { id: "potenza", label: "Potenza" },
  { id: "eserciti", label: "Eserciti delle casate" },
  { id: "truppe", label: "Tipi di truppa" },
  { id: "regni", label: "Regni" },
  { id: "confronto", label: "Confronto" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// Alleanza: un gruppo di regni (un regno puo' stare in piu' alleanze)
type Alliance = { id: string; name: string; kingdoms: string[] };
type Result = { error: { message: string; code?: string } | null };
type Message = { ok: boolean; text: string } | null;

// Tutti i dati degli eserciti, ricaricati a ogni salvataggio
function useArmies() {
  const supabase = useMemo(() => createClient(), []);
  const [types, setTypes] = useState<TroopType[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [troops, setTroops] = useState<HouseTroop[]>([]);
  const [kingdoms, setKingdoms] = useState<Kingdom[]>([]);
  const [houseKingdom, setHouseKingdom] = useState<Record<string, string>>({});
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [alliancesMissing, setAlliancesMissing] = useState(false);
  const [fiefs, setFiefs] = useState<Record<string, FiefPoints>>({});
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    Promise.all([
      supabase.from("troop_types").select("*").order("sort_order").order("name"),
      supabase.from("troop_matchups").select("*"),
      supabase.from("house_troops").select("*"),
      supabase.from("kingdoms").select("*").order("sort_order").order("name"),
      supabase.from("house_kingdoms").select("*"),
      supabase.from("fiefs").select("house_id, structures:fief_structures(type:structure_types(attack, defense))"),
      supabase.from("alliances").select("id, name, members:alliance_kingdoms(kingdom_id)").order("name"),
    ]).then(([t, m, h, k, hk, f, al]) => {
      setAlliancesMissing(!!al.error);
      setAlliances(
        ((al.data ?? []) as unknown as { id: string; name: string; members: { kingdom_id: string }[] }[]).map((x) => ({
          id: x.id,
          name: x.name,
          kingdoms: (x.members ?? []).map((y) => y.kingdom_id),
        })),
      );
      setMissing(!!t.error);
      setTypes((t.data ?? []) as TroopType[]);
      setMatchups((m.data ?? []) as Matchup[]);
      setTroops((h.data ?? []) as HouseTroop[]);
      setKingdoms((k.data ?? []) as Kingdom[]);
      setHouseKingdom(Object.fromEntries((hk.data ?? []).map((x) => [x.house_id as string, x.kingdom_id as string])));
      // attacco e difesa delle strutture, sommati per casata
      const points: Record<string, FiefPoints> = {};
      for (const fief of (f.data ?? []) as unknown as {
        house_id: string;
        structures: { type: { attack: number; defense: number } | null }[];
      }[]) {
        const p = (points[fief.house_id] ??= { attack: 0, defense: 0 });
        for (const s of fief.structures ?? []) {
          p.attack += s.type?.attack ?? 0;
          p.defense += s.type?.defense ?? 0;
        }
      }
      setFiefs(points);
      setReady(true);
    });
  }, [supabase, version]);
  return { supabase, types, matchups, troops, kingdoms, houseKingdom, alliances, alliancesMissing, fiefs, ready, missing, reload: () => setVersion((v) => v + 1) };
}
type Armies = ReturnType<typeof useArmies>;

function errorText(error: { message: string; code?: string }) {
  if (error.code === "23505") return "Esiste già una voce con questo nome.";
  if (error.code === "42501") return "Non hai il permesso di gestire gli eserciti.";
  return error.message.length < 160 ? error.message : "Salvataggio non riuscito.";
}

// Esegue un salvataggio e mostra l'esito
function useSave(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Message>(null);
  async function run(op: () => PromiseLike<Result>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await op();
    setBusy(false);
    setMsg(error ? { ok: false, text: errorText(error) } : { ok: true, text: ok });
    if (!error) reload();
    return !error;
  }
  return { busy, msg, run };
}

const Msg = ({ msg }: { msg: Message }) =>
  msg ? <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p> : null;
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block space-y-1">
    <span className="block text-xs tracking-wide text-muted uppercase">{label}</span>
    {children}
  </label>
);
const int = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const num = (n: number) => n.toLocaleString("it-IT");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));
const kind = (h: HouseLite) => (h.playable ? "PG" : "PNG");
const th = "py-2 pr-3 text-left text-xs tracking-wider text-muted uppercase";

export default function ArmiesManager({ houses }: { houses: HouseLite[] }) {
  const [tab, setTab] = useState<Tab>("potenza");
  const data = useArmies();
  return (
    <section className="border border-border bg-black/50">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-xs tracking-[0.12em] uppercase transition sm:px-4 ${
              tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {!data.ready ? (
          <p className="text-sm text-muted">Caricamento...</p>
        ) : data.missing ? (
          <p className="text-sm text-amber-200">Prima va eseguita la migrazione 0119 in Supabase.</p>
        ) : (
          <>
            {tab === "potenza" && <PowerTab {...data} houses={houses} />}
            {tab === "eserciti" && <HouseArmiesTab {...data} houses={houses} />}
            {tab === "truppe" && <TroopTypesTab {...data} />}
            {tab === "regni" && <KingdomsTab {...data} houses={houses} />}
            {tab === "confronto" && <VersusTab {...data} houses={houses} />}
          </>
        )}
      </div>
    </section>
  );
}

const powerOf = (d: Armies, houseId: string) =>
  housePower(
    d.troops.filter((t) => t.house_id === houseId),
    d.types,
    d.fiefs[houseId],
  );

// ---------------------------------------------------------------------
// Potenza: ogni regno con le sue casate (in fondo quelle senza regno)
// ---------------------------------------------------------------------
type Filter = "tutte" | "pg" | "png";

function PowerTab(d: Armies & { houses: HouseLite[] }) {
  const [filter, setFilter] = useState<Filter>("tutte");
  // regni chiusi (a fisarmonica): resta visibile solo l'intestazione con la potenza
  const [closed, setClosed] = useState<string[]>([]);
  const toggle = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const shown = d.houses.filter((h) => filter === "tutte" || h.playable === (filter === "pg"));
  const rows = shown.map((h) => ({ house: h, power: powerOf(d, h.id) })).sort((x, y) => y.power.total - x.power.total);
  const groups = [
    ...d.kingdoms.map((k) => ({ id: k.id, name: k.name, members: rows.filter((r) => d.houseKingdom[r.house.id] === k.id) })),
    { id: "", name: "Senza regno", members: rows.filter((r) => !d.kingdoms.some((k) => k.id === d.houseKingdom[r.house.id])) },
  ]
    .map((g) => ({ ...g, power: sumPowers(g.members.map((m) => m.power)) }))
    // i regni dal piu' potente; "Senza regno" sempre in fondo
    .sort((x, y) => (x.id === "" ? 1 : y.id === "" ? -1 : y.power.total - x.power.total))
    .filter((g) => g.id !== "" || g.members.length > 0);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        La potenza di una casata è la somma dei punti delle sue truppe (attacco + difesa di ogni unità) e dei punti di attacco e difesa
        delle strutture dei suoi feudi. La potenza di un regno è la somma delle sue casate. I punti di forza e di debolezza tra truppe
        contano solo quando due eserciti si affrontano: vedi la pagina Confronto.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Mostra:</span>
        {(
          [
            ["tutte", "Tutte le casate"],
            ["pg", "Solo casate PG"],
            ["png", "Solo casate PNG"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={`border px-3 py-1 text-xs transition ${filter === id ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {groups.length > 1 && (
        <div className="flex gap-3 text-xs">
          <button type="button" onClick={() => setClosed([])} className="text-muted hover:text-accent">
            Apri tutti
          </button>
          <button type="button" onClick={() => setClosed(groups.map((g) => g.id))} className="text-muted hover:text-accent">
            Chiudi tutti
          </button>
        </div>
      )}
      {d.kingdoms.length === 0 && (
        <p className="text-sm text-amber-200">
          Non ci sono ancora regni: creali nella pagina Regni e assegna le casate, così ognuna compare sotto il suo regno.
        </p>
      )}
      {d.alliances.length > 0 && (
        <div className="border border-[#c9a05a]/50 bg-[#c9a05a]/5">
          <h3 className="border-b border-[#c9a05a]/40 px-3 py-2 font-serif text-xl text-[#e8cf9c]">Alleanze</h3>
          <div className="overflow-x-auto px-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>Alleanza</th>
                  <th className={th}>Regni</th>
                  <th className={th}>Unità</th>
                  <th className={th}>Truppe</th>
                  <th className={th}>Feudi</th>
                  <th className={th}>Potenza</th>
                </tr>
              </thead>
              <tbody>
                {d.alliances
                  .map((al) => ({
                    al,
                    members: groups.filter((g) => g.id && al.kingdoms.includes(g.id)),
                    power: sumPowers(rows.filter((x) => al.kingdoms.includes(d.houseKingdom[x.house.id] ?? "")).map((x) => x.power)),
                  }))
                  .sort((x, y) => y.power.total - x.power.total)
                  .map(({ al, members, power }) => (
                    <tr key={al.id} className="border-b border-border/50 last:border-b-0">
                      <td className="py-2 pr-3 font-serif text-[#e8cf9c]">{al.name}</td>
                      <td className="py-2 pr-3 text-muted">
                        {members.map((m) => `${m.name} (${num(m.power.total)})`).join(" + ") || "nessun regno"}
                      </td>
                      <td className="py-2 pr-3">{num(power.units)}</td>
                      <td className="py-2 pr-3">{num(power.army)}</td>
                      <td className="py-2 pr-3">{num(power.fief)}</td>
                      <td className="py-2 pr-3 font-semibold">{num(power.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.id || "nessuno"} className="border border-border bg-black/40">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={!closed.includes(g.id)}
            onClick={() => toggle(g.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(g.id);
              }
            }}
            title={closed.includes(g.id) ? "Mostra le casate" : "Nascondi le casate"}
            className={`flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 transition hover:bg-white/5 ${closed.includes(g.id) ? "" : "border-b border-border"}`}
          >
            <span aria-hidden className={`self-center text-xs text-muted transition-transform ${closed.includes(g.id) ? "" : "rotate-90"}`}>
              ▶
            </span>
            <h3 className={`font-serif text-xl ${g.id ? "text-accent" : "text-muted"}`}>{g.name}</h3>
            {d.alliances
              .filter((al) => g.id && al.kingdoms.includes(g.id))
              .map((al) => (
                <span key={al.id} className="border border-[#c9a05a]/50 px-2 py-0.5 text-xs text-[#e8cf9c]">
                  {al.name}
                </span>
              ))}
            <span className="text-xs text-muted">
              {g.members.length} {g.members.length === 1 ? "casata" : "casate"} · {num(g.power.units)} unità
            </span>
            {g.id && (
              <span className="ml-auto text-sm">
                Truppe {num(g.power.army)} + feudi {num(g.power.fief)} = potenza del regno{" "}
                <strong className="text-accent">{num(g.power.total)}</strong>
              </span>
            )}
          </div>
          {closed.includes(g.id) ? null : g.members.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">Nessuna casata{filter === "tutte" ? "" : " di questo tipo"} in questo regno.</p>
          ) : (
            <div className="overflow-x-auto px-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={th}>Casata</th>
                    <th className={th}>Unità</th>
                    <th className={th}>Truppe (att. / dif.)</th>
                    <th className={th}>Feudi (att. / dif.)</th>
                    <th className={th}>Potenza</th>
                  </tr>
                </thead>
                <tbody>
                  {g.members.map(({ house, power }) => (
                    <tr key={house.id} className="border-b border-border/50 last:border-b-0">
                      <td className="py-2 pr-3 font-serif">
                        {house.name}{" "}
                        <span className={`text-xs ${house.playable ? "text-muted" : "text-[#9fb4c9]"}`}>({kind(house)})</span>
                      </td>
                      <td className="py-2 pr-3">{num(power.units)}</td>
                      <td className="py-2 pr-3">
                        {num(power.army)}{" "}
                        <span className="text-xs text-muted">
                          ({num(power.armyAttack)} / {num(power.armyDefense)})
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {num(power.fief)}{" "}
                        <span className="text-xs text-muted">
                          ({num(power.fiefAttack)} / {num(power.fiefDefense)})
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-semibold">{num(power.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Casate raggruppate per regno, per i menu a tendina
function HouseOptions({ d, houses }: { d: Armies; houses: HouseLite[] }) {
  const option = (h: HouseLite) => (
    <option key={h.id} value={h.id}>
      {h.name} ({kind(h)})
    </option>
  );
  const free = houses.filter((h) => !d.kingdoms.some((k) => k.id === d.houseKingdom[h.id]));
  if (d.kingdoms.length === 0) return <>{houses.map(option)}</>;
  return (
    <>
      {d.kingdoms.map((k) => {
        const members = houses.filter((h) => d.houseKingdom[h.id] === k.id);
        return members.length ? (
          <optgroup key={k.id} label={k.name}>
            {members.map(option)}
          </optgroup>
        ) : null;
      })}
      {free.length > 0 && <optgroup label="Senza regno">{free.map(option)}</optgroup>}
    </>
  );
}

// ---------------------------------------------------------------------
// Eserciti delle casate: quante truppe di ogni tipo
// ---------------------------------------------------------------------
function HouseArmiesTab(d: Armies & { houses: HouseLite[] }) {
  const [houseId, setHouseId] = useState(d.houses[0]?.id ?? "");
  if (d.types.length === 0) return <p className="text-sm text-muted">Prima crea almeno un tipo di truppa nella pagina Tipi di truppa.</p>;
  return (
    <div className="space-y-4">
      <Field label="Casata">
        <select value={houseId} onChange={(e) => setHouseId(e.target.value)} className="input max-w-sm">
          <HouseOptions d={d} houses={d.houses} />
        </select>
      </Field>
      {houseId && <HouseArmyEditor key={houseId} d={d} houseId={houseId} />}
    </div>
  );
}

function HouseArmyEditor({ d, houseId }: { d: Armies; houseId: string }) {
  const { busy, msg, run } = useSave(d.reload);
  const saved = Object.fromEntries(d.troops.filter((t) => t.house_id === houseId).map((t) => [t.troop_type_id, t.quantity]));
  const [qty, setQty] = useState<Record<string, number>>(saved);
  const changed = d.types.some((t) => (qty[t.id] ?? 0) !== (saved[t.id] ?? 0));
  const power = housePower(
    d.types.map((t) => ({ house_id: houseId, troop_type_id: t.id, quantity: qty[t.id] ?? 0 })),
    d.types,
    d.fiefs[houseId],
  );

  async function save() {
    const keep = d.types.filter((t) => (qty[t.id] ?? 0) > 0);
    const drop = d.types.filter((t) => (qty[t.id] ?? 0) <= 0 && saved[t.id]).map((t) => t.id);
    await run(async () => {
      if (drop.length) {
        const r = await d.supabase.from("house_troops").delete().eq("house_id", houseId).in("troop_type_id", drop);
        if (r.error) return r;
      }
      if (!keep.length) return { error: null };
      return d.supabase
        .from("house_troops")
        .upsert(keep.map((t) => ({ house_id: houseId, troop_type_id: t.id, quantity: qty[t.id] })));
    }, "Esercito salvato.");
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>Truppa</th>
              <th className={th}>Per unità (att. / dif.)</th>
              <th className={th}>Quantità</th>
              <th className={th}>Punti</th>
            </tr>
          </thead>
          <tbody>
            {d.types.map((t) => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="py-2 pr-3 font-serif">{t.name}</td>
                <td className="py-2 pr-3 text-muted">
                  {num(t.attack)} / {num(t.defense)}
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    value={qty[t.id] ?? 0}
                    onChange={(e) => setQty((q) => ({ ...q, [t.id]: int(e.target.value, 0, 100000000) }))}
                    aria-label={`Quantità di ${t.name}`}
                    className="input w-32 py-1"
                  />
                </td>
                <td className="py-2 pr-3">{num((qty[t.id] ?? 0) * (t.attack + t.defense))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        Truppe <strong>{num(power.army)}</strong> + feudi <strong>{num(power.fief)}</strong> = potenza{" "}
        <strong className="text-accent">{num(power.total)}</strong>{" "}
        <span className="text-muted">({num(power.units)} unità)</span>
      </p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !changed} className="btn">
          {busy ? "Salvataggio..." : "Salva esercito"}
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tipi di truppa: punti per unita' e forza/debolezza contro le altre
// ---------------------------------------------------------------------
function TroopTypesTab(d: Armies) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = d.types.find((t) => t.id === openId) ?? null;
  const against = (t: TroopType) =>
    d.matchups
      .filter((m) => m.troop_type_id === t.id)
      .map((m) => `${signed(m.modifier)} contro ${d.types.find((x) => x.id === m.against_id)?.name ?? "?"}`)
      .join(", ");
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpenId("nuova")}
          className={`btn-ghost w-full text-sm ${openId === "nuova" ? "border-accent text-accent" : ""}`}
        >
          + Nuovo tipo di truppa
        </button>
        <ul className="space-y-1">
          {d.types.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className={`w-full border px-3 py-2 text-left text-sm transition hover:border-accent ${
                  t.id === openId ? "border-accent bg-blood/15" : "border-border bg-black/40"
                }`}
              >
                <span className="font-serif text-accent">{t.name}</span>
                <span className="ml-2 text-xs text-muted">
                  ATT {num(t.attack)} · DIF {num(t.defense)}
                </span>
                {against(t) && <span className="block text-xs text-muted">{against(t)}</span>}
              </button>
            </li>
          ))}
          {d.types.length === 0 && <li className="text-sm text-muted">Nessun tipo di truppa.</li>}
        </ul>
      </div>
      {openId && <TroopTypeForm key={openId} d={d} type={open} onDone={setOpenId} />}
    </div>
  );
}

function TroopTypeForm({ d, type, onDone }: { d: Armies; type: TroopType | null; onDone: (id: string | null) => void }) {
  const { busy, msg, run } = useSave(d.reload);
  const [name, setName] = useState(type?.name ?? "");
  const [description, setDescription] = useState(type?.description ?? "");
  const [attack, setAttack] = useState(type?.attack ?? 1);
  const [defense, setDefense] = useState(type?.defense ?? 1);
  const [order, setOrder] = useState(type?.sort_order ?? 0);
  const [mods, setMods] = useState<Record<string, number>>(
    Object.fromEntries(d.matchups.filter((m) => m.troop_type_id === type?.id).map((m) => [m.against_id, m.modifier])),
  );
  const others = d.types.filter((t) => t.id !== type?.id);

  async function save() {
    let id = type?.id ?? null;
    const done = await run(async () => {
      const row = { name: name.trim(), description: description.trim(), attack, defense, sort_order: order };
      if (!row.name) return { error: { message: "Scrivi il nome della truppa." } };
      if (id) {
        const r = await d.supabase.from("troop_types").update(row).eq("id", id);
        if (r.error) return r;
      } else {
        const r = await d.supabase.from("troop_types").insert(row).select("id").single();
        if (r.error) return r;
        id = r.data.id as string;
      }
      const del = await d.supabase.from("troop_matchups").delete().eq("troop_type_id", id);
      if (del.error) return del;
      const rows = others.filter((o) => (mods[o.id] ?? 0) !== 0).map((o) => ({ troop_type_id: id, against_id: o.id, modifier: mods[o.id] }));
      return rows.length ? d.supabase.from("troop_matchups").insert(rows) : { error: null };
    }, "Truppa salvata.");
    if (done) onDone(id);
  }

  async function remove() {
    if (!type || !window.confirm(`Eliminare il tipo di truppa "${type.name}"? Sparirà anche dagli eserciti delle casate.`)) return;
    if (await run(() => d.supabase.from("troop_types").delete().eq("id", type.id), "Truppa eliminata.")) onDone(null);
  }

  return (
    <div className="space-y-4 border border-border bg-black/40 p-4">
      <h3 className="font-serif text-xl text-accent">{type ? type.name : "Nuovo tipo di truppa"}</h3>
      <Field label="Nome">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Es. Fanteria, Arcieri, Cavalleria" className="input" />
      </Field>
      <Field label="Descrizione">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} className="input" />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Attacco per unità">
          <input type="number" min={0} value={attack} onChange={(e) => setAttack(int(e.target.value, 0, 1000000))} className="input w-32" />
        </Field>
        <Field label="Difesa per unità">
          <input type="number" min={0} value={defense} onChange={(e) => setDefense(int(e.target.value, 0, 1000000))} className="input w-32" />
        </Field>
        <Field label="Ordine">
          <input type="number" value={order} onChange={(e) => setOrder(int(e.target.value, -1000, 1000))} className="input w-24" />
        </Field>
      </div>
      <div>
        <p className="mb-1 text-xs tracking-wide text-muted uppercase">Forza o debolezza contro le altre truppe (punti per unità)</p>
        {others.length === 0 ? (
          <p className="text-sm text-muted">Crea altri tipi di truppa per impostare chi batte chi.</p>
        ) : (
          <ul className="space-y-1.5">
            {others.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-40 font-serif">contro {o.name}</span>
                <input
                  type="number"
                  value={mods[o.id] ?? 0}
                  onChange={(e) => setMods((m) => ({ ...m, [o.id]: int(e.target.value, -1000000, 1000000) }))}
                  aria-label={`Punti contro ${o.name}`}
                  className="input w-28 py-1"
                />
                <span className={`text-xs ${(mods[o.id] ?? 0) > 0 ? "text-green-400" : (mods[o.id] ?? 0) < 0 ? "text-red-400" : "text-muted"}`}>
                  {(mods[o.id] ?? 0) > 0 ? "punto di forza" : (mods[o.id] ?? 0) < 0 ? "punto debole" : "alla pari"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          Numero positivo = questa truppa è più forte contro quell&apos;altra; negativo = più debole. Vale in una sola direzione: il
          rovescio si imposta sull&apos;altra truppa.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="btn">
          {busy ? "Salvataggio..." : type ? "Salva" : "Crea truppa"}
        </button>
        {type && (
          <button type="button" onClick={remove} disabled={busy} className="btn-ghost border-red-900 text-red-400 hover:border-red-500 hover:text-red-300">
            Elimina
          </button>
        )}
        <Msg msg={msg} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Regni: gruppi di casate
// ---------------------------------------------------------------------
function KingdomsTab(d: Armies & { houses: HouseLite[] }) {
  const { busy, msg, run } = useSave(d.reload);
  const [name, setName] = useState("");

  const assign = (houseId: string, kingdomId: string) =>
    run(
      () =>
        kingdomId
          ? d.supabase.from("house_kingdoms").upsert({ house_id: houseId, kingdom_id: kingdomId })
          : d.supabase.from("house_kingdoms").delete().eq("house_id", houseId),
      "Regno della casata aggiornato.",
    );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-serif text-xl text-accent">Regni</h3>
        <ul className="space-y-1">
          {d.kingdoms.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 border border-border bg-black/40 px-3 py-2 text-sm">
              <span className="flex-1 font-serif text-accent">{k.name}</span>
              <span className="text-xs text-muted">{d.houses.filter((h) => d.houseKingdom[h.id] === k.id).length} casate</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const next = window.prompt("Nuovo nome del regno", k.name)?.trim();
                  if (next && next !== k.name) run(() => d.supabase.from("kingdoms").update({ name: next }).eq("id", k.id), "Regno rinominato.");
                }}
                className="text-xs text-muted hover:text-accent"
              >
                Rinomina
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  window.confirm(`Eliminare il regno "${k.name}"? Le sue casate resteranno senza regno.`) &&
                  run(() => d.supabase.from("kingdoms").delete().eq("id", k.id), "Regno eliminato.")
                }
                className="text-xs text-red-400 hover:text-red-300"
              >
                Elimina
              </button>
            </li>
          ))}
          {d.kingdoms.length === 0 && <li className="text-sm text-muted">Nessun regno.</li>}
        </ul>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            if (await run(() => d.supabase.from("kingdoms").insert({ name: name.trim() }), "Regno creato.")) setName("");
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nome del nuovo regno" className="input max-w-xs" />
          <button className="btn" disabled={busy || !name.trim()}>
            Crea regno
          </button>
        </form>
        <Msg msg={msg} />
      </div>
      <AlliancesSection d={d} />
      <div className="space-y-2">
        <h3 className="font-serif text-xl text-accent">A quale regno appartiene ogni casata</h3>
        <ul className="divide-y divide-border/60 border border-border/60">
          {d.houses.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-44 flex-1 font-serif">
                {h.name} <span className="text-xs text-muted">({kind(h)})</span>
              </span>
              <select
                value={d.houseKingdom[h.id] ?? ""}
                disabled={busy || d.kingdoms.length === 0}
                onChange={(e) => assign(h.id, e.target.value)}
                aria-label={`Regno di ${h.name}`}
                className="input w-56! py-1"
              >
                <option value="">Nessun regno</option>
                {d.kingdoms.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Alleanze tra regni: si creano e si spuntano i regni che ne fanno parte
function AlliancesSection({ d }: { d: Armies }) {
  const { busy, msg, run } = useSave(d.reload);
  const [name, setName] = useState("");
  if (d.alliancesMissing)
    return <p className="text-sm text-amber-200">Per le alleanze tra regni va eseguita la migrazione 0120 in Supabase.</p>;
  return (
    <div className="space-y-2">
      <h3 className="font-serif text-xl text-accent">Alleanze tra regni</h3>
      <p className="text-sm text-muted">
        Un&apos;alleanza unisce due o più regni: nella pagina Potenza compare la somma delle loro forze, e nel Confronto si può schierare
        l&apos;alleanza intera. Un regno può far parte di più alleanze.
      </p>
      <ul className="space-y-2">
        {d.alliances.map((al) => (
          <li key={al.id} className="space-y-2 border border-[#c9a05a]/40 bg-black/40 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 font-serif text-[#e8cf9c]">{al.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const next = window.prompt("Nuovo nome dell'alleanza", al.name)?.trim();
                  if (next && next !== al.name) run(() => d.supabase.from("alliances").update({ name: next }).eq("id", al.id), "Alleanza rinominata.");
                }}
                className="text-xs text-muted hover:text-accent"
              >
                Rinomina
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  window.confirm(`Sciogliere l'alleanza "${al.name}"?`) &&
                  run(() => d.supabase.from("alliances").delete().eq("id", al.id), "Alleanza sciolta.")
                }
                className="text-xs text-red-400 hover:text-red-300"
              >
                Sciogli
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {d.kingdoms.map((k) => {
                const inside = al.kingdoms.includes(k.id);
                return (
                  <label key={k.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={inside}
                      disabled={busy}
                      onChange={() =>
                        run(
                          () =>
                            inside
                              ? d.supabase.from("alliance_kingdoms").delete().eq("alliance_id", al.id).eq("kingdom_id", k.id)
                              : d.supabase.from("alliance_kingdoms").insert({ alliance_id: al.id, kingdom_id: k.id }),
                          inside ? `${k.name} lascia l'alleanza.` : `${k.name} entra nell'alleanza.`,
                        )
                      }
                    />
                    {k.name}
                  </label>
                );
              })}
              {d.kingdoms.length === 0 && <span className="text-muted">Crea prima i regni.</span>}
            </div>
          </li>
        ))}
        {d.alliances.length === 0 && <li className="text-sm text-muted">Nessuna alleanza.</li>}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await run(() => d.supabase.from("alliances").insert({ name: name.trim() }), "Alleanza creata: spunta i regni che ne fanno parte.")) setName("");
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nome della nuova alleanza" className="input max-w-xs" />
        <button className="btn" disabled={busy || !name.trim()}>
          Crea alleanza
        </button>
      </form>
      <Msg msg={msg} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Confronto: due eserciti uno contro l'altro, con forze e debolezze
// ---------------------------------------------------------------------
function VersusTab(d: Armies & { houses: HouseLite[] }) {
  // si confrontano casate, regni o alleanze: "c:<id>", "r:<id>", "a:<id>"
  const options = [
    ...d.alliances.map((al) => ({ key: `a:${al.id}`, label: `Alleanza: ${al.name}` })),
    ...d.kingdoms.map((k) => ({ key: `r:${k.id}`, label: `Regno: ${k.name}` })),
    ...d.houses.map((h) => ({ key: `c:${h.id}`, label: `${h.name} (${kind(h)})` })),
  ];
  const [a, setA] = useState(options[0]?.key ?? "");
  const [b, setB] = useState(options[1]?.key ?? "");
  const side = (key: string) => {
    const realms = key.startsWith("a:") ? (d.alliances.find((al) => al.id === key.slice(2))?.kingdoms ?? []) : key.startsWith("r:") ? [key.slice(2)] : null;
    const ids = realms ? d.houses.filter((h) => realms.includes(d.houseKingdom[h.id] ?? "")).map((h) => h.id) : [key.slice(2)];
    const power = housePower(
      d.troops.filter((t) => ids.includes(t.house_id)),
      d.types,
      ids.reduce((p, id) => ({ attack: p.attack + (d.fiefs[id]?.attack ?? 0), defense: p.defense + (d.fiefs[id]?.defense ?? 0) }), {
        attack: 0,
        defense: 0,
      }),
    );
    return { label: options.find((o) => o.key === key)?.label ?? "?", power };
  };
  const A = side(a);
  const B = side(b);
  const va = versus(A.power.lines, B.power.lines, d.matchups);
  const vb = versus(B.power.lines, A.power.lines, d.matchups);
  const picker = (value: string, set: (v: string) => void, label: string) => (
    <Field label={label}>
      <select value={value} onChange={(e) => set(e.target.value)} className="input">
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const column = (s: ReturnType<typeof side>, v: ReturnType<typeof versus>, win: boolean) => (
    <div className={`space-y-2 border p-3 ${win ? "border-accent bg-blood/10" : "border-border bg-black/40"}`}>
      <h3 className="font-serif text-lg text-accent">{s.label}</h3>
      <ul className="space-y-0.5 text-sm">
        {v.details.map((l) => (
          <li key={l.name} className="flex justify-between gap-3">
            <span>
              {num(l.quantity)} × {l.name}
            </span>
            <span>
              {num(l.base)}{" "}
              {l.bonus !== 0 && <span className={l.bonus > 0 ? "text-green-400" : "text-red-400"}>{signed(l.bonus)}</span>}
            </span>
          </li>
        ))}
        {v.details.length === 0 && <li className="text-muted">Nessuna truppa.</li>}
      </ul>
      <p className="border-t border-border/60 pt-2 text-sm">
        Truppe {num(v.base)} {v.bonus !== 0 && <span className={v.bonus > 0 ? "text-green-400" : "text-red-400"}>{signed(v.bonus)}</span>} ={" "}
        <strong className="text-accent">{num(v.total)}</strong>
        <span className="block text-xs text-muted">
          Con i feudi (se si combatte in casa): {num(v.total + s.power.fief)}
        </span>
      </p>
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ogni truppa vale i suoi punti, più i punti di forza o di debolezza contro le truppe avversarie, in proporzione a quante sono
        nell&apos;esercito nemico. È un aiuto per il master: l&apos;esito di una battaglia lo decide comunque lui.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {picker(a, setA, "Primo esercito")}
        {picker(b, setB, "Secondo esercito")}
      </div>
      {a && b && (
        <div className="grid gap-3 sm:grid-cols-2">
          {column(A, va, va.total > vb.total)}
          {column(B, vb, vb.total > va.total)}
        </div>
      )}
    </div>
  );
}
