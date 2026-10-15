"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { housePower, type FiefPoints, type HouseTroop, type Matchup, type TroopType } from "@/lib/armies";
import { createClient } from "@/lib/supabase/client";

type Data = {
  types: TroopType[];
  matchups: Matchup[];
  troops: HouseTroop[];
  kingdom: string | null;
  called: boolean | null; // null: migrazione 0143 non ancora eseguita
  categories: { id: string; name: string }[]; // gruppi di truppe (terrestri, navali...)
  training: { troop_type_id: string; resource_id: string; amount: number }[] | null; // null: migrazione 0148 mancante
  treasury: Record<string, number>;
  upkeep: { resource_id: string; army: number }[];
};

const num = (n: number) => n.toLocaleString("it-IT");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));

// Esercito e potenza della casata (pannello Feudi): lo vedono i membri.
// Chi comanda (ruolo che gestisce le risorse) lo richiama o lo congeda:
// richiamato paga tutto il mantenimento, congedato un quarto (e conta comunque)
export default function HouseArmy({
  houseId,
  fief,
  canCommand = false,
  resources = [],
  onChanged,
}: {
  houseId: string;
  fief: FiefPoints;
  canCommand?: boolean;
  resources?: { id: string; name: string }[];
  onChanged?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [t, m, h, k, house, up, cg, tr, tre] = await Promise.all([
      supabase.from("troop_types").select("*").order("sort_order").order("name"),
      supabase.from("troop_matchups").select("*"),
      supabase.from("house_troops").select("*").eq("house_id", houseId),
      supabase.from("house_kingdoms").select("kingdom:kingdoms(name)").eq("house_id", houseId).maybeSingle(),
      supabase.from("houses").select("army_called").eq("id", houseId).maybeSingle(),
      supabase.rpc("house_upkeep", { p_house: houseId }),
      supabase.from("troop_categories").select("id, name").order("sort_order").order("name"),
      supabase.from("troop_training_costs").select("*"),
      supabase.from("house_resources").select("resource_id, amount").eq("house_id", houseId),
    ]);
    // tabelle non ancora create: il riquadro non compare
    if (t.error) return;
    setData({
      types: (t.data ?? []) as TroopType[],
      matchups: (m.data ?? []) as Matchup[],
      troops: (h.data ?? []) as HouseTroop[],
      kingdom: (k.data?.kingdom as unknown as { name: string } | null)?.name ?? null,
      called: house.error ? null : !!house.data?.army_called,
      upkeep: ((up.data ?? []) as { resource_id: string; army: number }[]).filter((u) => u.army > 0),
      categories: (cg.data ?? []) as { id: string; name: string }[],
      training: tr.error ? null : ((tr.data ?? []) as { troop_type_id: string; resource_id: string; amount: number }[]),
      treasury: Object.fromEntries((tre.data ?? []).map((x) => [x.resource_id as string, Number(x.amount)])),
    });
  }, [supabase, houseId]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (!data) return null;
  const power = housePower(data.troops, data.types, fief);
  const against = (id: string) =>
    data.matchups
      .filter((m) => m.troop_type_id === id)
      .map((m) => `${signed(m.modifier)} contro ${data.types.find((x) => x.id === m.against_id)?.name ?? "?"}`)
      .join(", ");
  const resName = (id: string) => resources.find((r) => r.id === id)?.name ?? "?";
  // le carte divise per gruppo, nell'ordine dei gruppi; quelle senza gruppo in fondo
  const groups = [
    ...data.categories.map((c) => ({ id: c.id, name: c.name, lines: power.lines.filter((l) => l.type.category_id === c.id) })),
    {
      id: "nessuno",
      name: "Senza gruppo",
      lines: power.lines.filter((l) => !l.type.category_id || !data.categories.some((c) => c.id === l.type.category_id)),
    },
  ].filter((g) => g.lines.length > 0);

  async function toggle(called: boolean) {
    if (
      !window.confirm(
        called
          ? "Richiamare l'esercito? Da adesso ogni mese paga tutto il suo mantenimento."
          : "Congedare l'esercito? Pagherà un quarto del mantenimento e conterà comunque nella potenza.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("set_army_called", { p_house: houseId, p_called: called });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message.length < 160 ? error.message : "Operazione non riuscita." } : { ok: true, text: called ? "Esercito richiamato." : "Esercito congedato." });
    if (!error) {
      load();
      onChanged?.();
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-serif text-xl tracking-wide text-accent">
        Esercito e potenza
        {data.kingdom && <span className="ml-2 text-sm text-muted">· {data.kingdom}</span>}
      </h3>
      {data.called !== null && (
        <div className="flex flex-wrap items-center gap-3 border border-border/60 bg-black/30 px-3 py-2 text-sm">
          <span>
            Stato:{" "}
            <strong className={data.called ? "text-red-300" : "text-muted"}>{data.called ? "Richiamato alle armi" : "Congedato"}</strong>
          </span>
          <span className="text-xs text-muted">
            {data.upkeep.length
              ? `Mantenimento al mese: ${data.upkeep.map((u) => `${num(u.army)} ${resName(u.resource_id)}`).join(", ")}`
              : "Nessun mantenimento al mese."}
            {!data.called && " (un quarto, finché è congedato)"}
          </span>
          {canCommand && (
            <button
              type="button"
              disabled={busy}
              onClick={() => toggle(!data.called)}
              className={`ml-auto px-3 py-1 text-xs ${data.called ? "btn-ghost" : "btn"}`}
            >
              {data.called ? "Congeda l'esercito" : "Richiama l'esercito"}
            </button>
          )}
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
      {canCommand && data.training !== null && data.types.length > 0 && (
        <TrainBox
          types={data.types}
          categories={data.categories}
          training={data.training}
          treasury={data.treasury}
          resources={resources}
          busy={busy}
          onTrain={async (typeId, count, label) => {
            if (!window.confirm(`Addestrare ${count} ${label}?`)) return;
            setBusy(true);
            setMsg(null);
            const { error } = await supabase.rpc("train_troops", { p_house: houseId, p_troop_type: typeId, p_count: count });
            setBusy(false);
            setMsg(error ? { ok: false, text: error.message.length < 160 ? error.message : "Addestramento non riuscito." } : { ok: true, text: `${count} ${label} addestrati: sono già nell'esercito.` });
            if (!error) {
              load();
              onChanged?.();
            }
          }}
        />
      )}
      {power.lines.length === 0 ? (
        <p className="text-sm text-muted">La casata non ha truppe.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="space-y-2">
              {groups.length > 1 && <h4 className="text-xs tracking-[0.15em] text-muted uppercase">{g.name}</h4>}
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {g.lines.map((l) => (
                  <li
                    key={l.type.id}
                    title={[l.type.description, against(l.type.id)].filter(Boolean).join(" · ") || undefined}
                    className="flex flex-col overflow-hidden rounded border border-accent/40 bg-black/50 shadow shadow-black/60"
                  >
                    {l.type.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.type.image_url} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <span aria-hidden className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[#3a2a1c] via-[#1f1712] to-black font-serif text-2xl text-accent/80">
                        {l.type.name[0]}
                      </span>
                    )}
                    <span className="px-1 py-1 text-center">
                      <span className="line-clamp-2 block font-serif text-xs leading-tight text-accent">{l.type.name}</span>
                      <span className="block text-[0.6875rem] text-foreground">× {num(l.quantity)}</span>
                      <span className="block text-[0.625rem] text-muted">
                        ATT {num(l.attack)} · DIF {num(l.defense)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm">
        Truppe <strong>{num(power.army)}</strong> + feudi <strong>{num(power.fief)}</strong> = potenza{" "}
        <strong className="text-accent">{num(power.total)}</strong>
      </p>
    </section>
  );
}

// Addestrare nuove truppe con la manodopera dei feudi: gruppi da 10, 50 o 100
const BATCHES = [10, 50, 100];
function TrainBox({
  types,
  categories,
  training,
  treasury,
  resources,
  busy,
  onTrain,
}: {
  types: TroopType[];
  categories: { id: string; name: string }[];
  training: { troop_type_id: string; resource_id: string; amount: number }[];
  treasury: Record<string, number>;
  resources: { id: string; name: string }[];
  busy: boolean;
  onTrain: (typeId: string, count: number, label: string) => void;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const type = types.find((t) => t.id === typeId);
  const labor = resources.find((r) => r.name.toLowerCase() === "manodopera");
  // costo di un gruppo: 1 manodopera per soldato + costo della truppa ogni 10
  const cost = (count: number) => {
    const c: Record<string, number> = {};
    if (labor) c[labor.id] = count;
    for (const t of training.filter((x) => x.troop_type_id === typeId)) c[t.resource_id] = (c[t.resource_id] ?? 0) + (t.amount * count) / 10;
    return c;
  };
  const name = (id: string) => resources.find((r) => r.id === id)?.name ?? "?";
  const groups = [
    ...categories.map((c) => ({ label: c.name, list: types.filter((t) => t.category_id === c.id) })),
    { label: "Senza gruppo", list: types.filter((t) => !t.category_id || !categories.some((c) => c.id === t.category_id)) },
  ].filter((g) => g.list.length);
  return (
    <div className="space-y-2 border border-accent/40 bg-black/30 p-3">
      <h4 className="font-serif text-lg text-accent">Addestra nuove truppe</h4>
      <p className="text-xs text-muted">
        Prendi uomini dalla Manodopera dei feudi e addestrali: ogni soldato costa 1 Manodopera, più il costo della truppa. Hai{" "}
        <strong className="text-foreground">{labor ? (treasury[labor.id] ?? 0).toLocaleString("it-IT") : 0}</strong> Manodopera.
      </p>
      <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Truppa da addestrare" className="input max-w-sm py-1 text-sm">
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        {BATCHES.map((n) => {
          const c = cost(n);
          const lacks = Object.entries(c).some(([id, v]) => (treasury[id] ?? 0) < v);
          return (
            <button
              key={n}
              type="button"
              disabled={busy || !type || lacks}
              onClick={() => type && onTrain(type.id, n, type.name)}
              title={lacks ? "Il tesoro non basta" : `Addestra ${n} ${type?.name ?? ""}`}
              className="btn-ghost flex flex-col items-start px-3 py-1.5 text-left text-xs disabled:opacity-45"
            >
              <span className="font-serif text-sm text-accent">+{n} soldati</span>
              <span className="text-muted">
                {Object.entries(c)
                  .map(([id, v]) => `${v.toLocaleString("it-IT")} ${name(id)}`)
                  .join(" · ")}
              </span>
              {lacks && <span className="text-red-400">Tesoro insufficiente</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
