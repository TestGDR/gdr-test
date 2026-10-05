"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Slot = {
  id: string;
  name: string;
  side: "sinistra" | "destra" | "sotto";
  capacity: number;
  sort_order: number;
};
export type Category = { id: string; name: string; sort_order: number };
export type Item = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  slot_id: string | null;
  category_id: string | null;
  price: number | null;
  in_shop: boolean;
};
export type Quality = {
  id: string;
  name: string;
  level: number;
  upgrade_cost: number;
  success_pct: number;
};
type Owned = {
  id: string;
  equipped: boolean;
  quality_id: string | null;
  quality: Pick<Quality, "name" | "level"> | null;
  item: Item;
};
// oggetti uguali e della stessa qualita' stanno nella stessa casella dell'inventario
const groupKey = (o: Owned) => `${o.item.id}|${o.quality_id ?? ""}`;
// Cosa si guarda nel riquadro in basso: un oggetto dell'inventario o una nicchia
type Selection =
  | { kind: "borsa"; key: string }
  | { kind: "indossato"; ownedId: string }
  | null;

// Equipaggiamento: a sinistra la figura con le nicchie delle parti del corpo
// (cosa indossa il PG), a destra l'inventario diviso per categorie e il
// riquadro dei dettagli. Il proprietario indossa e toglie; gli altri vedono solo
// cosa indossa
export default function Equipment({
  characterId,
  isOwn,
}: {
  characterId: string;
  isOwn: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [owned, setOwned] = useState<Owned[]>([]);
  const [bagOpen, setBagOpen] = useState(true); // inventario aperto
  const [pick, setPick] = useState<Selection>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        supabase
          .from("equipment_slots")
          .select("*")
          .order("sort_order")
          .order("name"),
        supabase
          .from("item_categories")
          .select("*")
          .order("sort_order")
          .order("name"),
        supabase
          .from("character_items")
          .select(
            "id, equipped, quality_id, quality:item_qualities(name, level), item:items(*)",
          )
          .eq("character_id", characterId)
          .order("acquired_at"),
      ]).then(([s, c, o]) => {
        setSlots((s.data ?? []) as Slot[]);
        setCategories((c.data ?? []) as Category[]);
        setOwned(((o.data ?? []) as unknown as Owned[]).filter((x) => x.item));
      }),
    [supabase, characterId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function equip(ownedId: string, on: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("equip_item", {
      p_character_item: ownedId,
      p_on: on,
    });
    setBusy(false);
    if (error)
      return setError(
        error.message.includes("posto")
          ? "Non c'è più posto: togli prima un oggetto."
          : error.message.includes("indossa")
            ? "Questo oggetto non si indossa."
            : "Operazione non riuscita.",
      );
    setPick(on ? { kind: "indossato", ownedId } : null);
    load();
  }

  if (slots === null) return <p className="p-6 text-muted">Caricamento...</p>;

  const worn = owned.filter((o) => o.equipped);
  const bag = owned.filter((o) => !o.equipped);
  const slotName = (id: string | null) =>
    slots.find((s) => s.id === id)?.name ?? "Non si indossa";

  // Nicchia: un riquadro per ogni posto della parte del corpo
  const niche = (s: Slot) => {
    const inSlot = worn.filter((w) => w.item.slot_id === s.id);
    const boxes = Array.from(
      { length: Math.max(1, s.capacity) },
      (_, i) => inSlot[i] ?? null,
    );
    return (
      <div key={s.id} className="flex flex-col items-center">
        <span
          className={`mb-1 text-center text-[0.6rem] leading-tight tracking-[0.16em] text-muted uppercase ${s.side === "sotto" ? "" : "max-w-[5.5rem]"}`}
          title={s.name}
        >
          {s.name}
          {s.capacity > 1 && ` · ${inSlot.length} su ${s.capacity}`}
        </span>
        <div className="flex gap-1.5">
          {boxes.map((o, i) => (
            <button
              key={o?.id ?? `vuota-${i}`}
              type="button"
              disabled={!o}
              onClick={() => o && setPick({ kind: "indossato", ownedId: o.id })}
              title={o ? o.item.name : `${s.name}: vuota`}
              className={`equip-frame h-[4.5rem] w-[4.5rem] ${o && pick?.kind === "indossato" && pick.ownedId === o.id ? "equip-frame-on" : ""}`}
            >
              {o ? (
                <ItemImage item={o.item} fill />
              ) : (
                <span className="text-xs text-muted/60 italic">vuota</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const left = slots.filter((s) => s.side === "sinistra");
  const right = slots.filter((s) => s.side === "destra");
  const below = slots.filter((s) => s.side === "sotto");

  // Oggetto scelto per il riquadro dei dettagli
  const picked =
    pick?.kind === "indossato"
      ? worn.find((o) => o.id === pick.ownedId)
      : pick?.kind === "borsa"
        ? bag.find((o) => groupKey(o) === pick.key)
        : undefined;

  const details = (
    <div className="min-h-28 border-t border-border/70 pt-3">
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {!picked ? (
        <p className="text-sm text-muted italic">
          {isOwn
            ? "Clicca un oggetto, o una nicchia della figura, per vederlo e usarlo."
            : "Clicca una nicchia della figura per vedere l'oggetto."}
        </p>
      ) : (
        <div className="flex gap-3">
          <span className="equip-frame h-16 w-16 shrink-0">
            <ItemImage item={picked.item} fill />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg leading-tight text-accent">
              {picked.item.name}
            </p>
            <p className="text-xs text-muted">
              {picked.quality && (
                <span className="text-[#d8c39a]">{picked.quality.name} · </span>
              )}
              {slotName(picked.item.slot_id)}
              {pick?.kind === "borsa" &&
                ` · ${bag.filter((b) => groupKey(b) === pick.key).length} in borsa`}
              {picked.equipped && " · indossato"}
            </p>
            {picked.item.description && (
              <p className="mt-1 text-sm whitespace-pre-line text-[#e8d8b4]">
                {picked.item.description}
              </p>
            )}
            {isOwn && picked.item.slot_id && (
              <button
                type="button"
                disabled={busy}
                onClick={() => equip(picked.id, !picked.equipped)}
                className={`${picked.equipped ? "btn-ghost" : "btn"} mt-2 px-3 py-1 text-xs tracking-[0.12em] uppercase`}
              >
                {picked.equipped ? "Togli" : "Indossa"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Figura con le nicchie */}
      <div className="shrink-0 border-b border-border/70 p-4 md:w-[22rem] md:border-r md:border-b-0">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
          <div className="space-y-2">{left.map(niche)}</div>
          <BodyFigure />
          <div className="space-y-2">{right.map(niche)}</div>
        </div>
        {below.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {below.map(niche)}
          </div>
        )}
      </div>

      {/* Inventario e dettagli (il negozio e' il Mercato, nella barra di destra) */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        {isOwn ? (
          <>
            <button
              type="button"
              onClick={() => setBagOpen((o) => !o)}
              aria-expanded={bagOpen}
              className={`self-start border px-3 py-1 text-xs font-semibold tracking-[0.16em] uppercase ${
                bagOpen
                  ? "border-accent bg-blood/20 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              Inventario {bag.length}
            </button>
            {bagOpen && (
              <Inventory
                bag={bag}
                categories={categories}
                pick={pick}
                onPick={(key) => setPick({ kind: "borsa", key })}
              />
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            L&apos;inventario lo vede solo il proprietario.
          </p>
        )}
        <div className="mt-auto">{details}</div>
      </div>
    </div>
  );
}

// Inventario: schede per categoria (con quanti oggetti) e griglia degli oggetti in borsa
function Inventory({
  bag,
  categories,
  pick,
  onPick,
}: {
  bag: Owned[];
  categories: Category[];
  pick: Selection;
  onPick: (key: string) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<
      string,
      { key: string; item: Item; quality: Owned["quality"]; n: number }
    >();
    for (const o of bag) {
      const g = m.get(groupKey(o));
      if (g) g.n++;
      else
        m.set(groupKey(o), {
          key: groupKey(o),
          item: o.item,
          quality: o.quality,
          n: 1,
        });
    }
    return [...m.values()];
  }, [bag]);
  const tabs = [
    ...categories.map((c) => ({ id: c.id, name: c.name })),
    { id: "", name: "Varie" }, // oggetti senza categoria
  ]
    .map((t) => ({
      ...t,
      n: groups
        .filter((g) => (g.item.category_id ?? "") === t.id)
        .reduce((a, g) => a + g.n, 0),
    }))
    .filter((t) => t.n > 0);
  const [tab, setTab] = useState<string | null>(null);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  if (groups.length === 0)
    return <p className="text-sm text-muted">La borsa è vuota.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id || "varie"}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.14em] uppercase ${
              current?.id === t.id
                ? "border-accent/70 text-accent"
                : "border-border text-[#e8d8b4] hover:border-accent/50"
            }`}
          >
            {t.name} <span className="ml-1 text-muted">{t.n}</span>
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {groups
          .filter((g) => (g.item.category_id ?? "") === current?.id)
          .map((g) => (
            <li key={g.key}>
              <button
                type="button"
                onClick={() => onPick(g.key)}
                title={
                  g.quality ? `${g.item.name} · ${g.quality.name}` : g.item.name
                }
                className={`relative flex aspect-square w-full items-center justify-center border bg-black/40 p-1 transition ${
                  pick?.kind === "borsa" && pick.key === g.key
                    ? "border-accent"
                    : "border-border/70 hover:border-accent/60"
                }`}
              >
                <ItemImage item={g.item} fill />
                {g.quality && g.item.slot_id && (
                  <span className="absolute top-0.5 left-1 text-[0.55rem] tracking-wider text-[#d8c39a] uppercase drop-shadow">
                    {g.quality.name}
                  </span>
                )}
                {g.n > 1 && (
                  <span className="absolute right-1 bottom-0.5 text-xs font-semibold text-[#f2e7c9] drop-shadow">
                    {g.n}
                  </span>
                )}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function ItemImage({
  item,
  small = false,
  fill = false,
}: {
  item: Pick<Item, "name" | "image_url">;
  small?: boolean;
  fill?: boolean;
}) {
  const size = fill ? "h-full w-full" : small ? "h-9 w-9" : "h-12 w-12";
  return item.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image_url}
      alt=""
      className={`${size} shrink-0 object-contain`}
    />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center bg-black/40 font-serif text-accent`}
    >
      {item.name[0]}
    </span>
  );
}

// Figura al centro delle nicchie: la silhouette di un cavaliere in armatura,
// grigio chiaro su sfondo trasparente (public/images/cavaliere.png)
function BodyFigure() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/cavaliere.png"
      alt=""
      className="mx-auto max-h-[24rem] w-full object-contain opacity-90 drop-shadow-[0_3px_6px_rgba(0,0,0,0.8)]"
    />
  );
}
