"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Slot = {
  id: string;
  name: string;
  side: "sinistra" | "destra" | "sotto";
  capacity: number;
  slot_group: string | null; // es. "Mano": Mano dx e Mano sx
  sort_order: number;
};
export type Category = { id: string; name: string; sort_order: number };
export type Item = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  slot_id: string | null; // nicchia precisa
  slot_group: string | null; // oppure un gruppo di nicchie (es. "Mano": destra o sinistra, a scelta)
  category_id: string | null;
  price: number | null;
  in_shop: boolean; // presente al mercato
  at_signup?: boolean; // disponibile all'iscrizione
  quality_id?: string | null; // livello (qualita') con cui nasce
  damage?: string | null; // danno (es. "2d5+1"), per i tiri con ARMA
  // Combattimento (documento "Combattimento, armi e danni")
  kind?: "altro" | "arma" | "scudo" | "armatura" | "munizione";
  weapon_category?: "mischia" | "distanza" | null;
  weapon_skill_id?: string | null; // abilita' per attaccare
  damage_type?: string | null;
  damage_type_alt?: string | null; // secondo modo di colpire (spade: affondo)
  hands?: string | null;
  body_min?: number;
  reach_m?: number | null;
  range_m?: number | null;
  reload_actions?: number;
  pierce?: number; // effetto perforante
  effects?: string[];
  ammo_type?: string | null;
  aff_max?: number | null; // armi e scudi
  parry_bonus?: number; // scudi
  bash_dice?: string | null;
  attack_penalty?: number;
  armor_part?: string | null; // armature
  material?: string | null;
  sp_max?: number | null;
  encumbrance?: number;
  weight_kg?: number | null;
  ammo_capacity?: number | null; // munizioni
};
export type Quality = {
  id: string;
  name: string;
  level: number;
  upgrade_cost: number;
  success_pct: number;
  // bonus di combattimento del livello
  hit_bonus?: number;
  damage_bonus?: number;
  pierce_bonus?: number;
  aff_bonus?: number;
  sp_bonus?: number;
};
// Si indossa: in una nicchia precisa o in una del suo gruppo
export const isWearable = (i: Pick<Item, "slot_id" | "slot_group">) =>
  !!(i.slot_id || i.slot_group);
// Dove si indossa, da mostrare (es. "Busto", "Mano (destra o sinistra)")
export const itemPlace = (
  i: Pick<Item, "slot_id" | "slot_group">,
  slots: Slot[],
) =>
  i.slot_id
    ? (slots.find((s) => s.id === i.slot_id)?.name ?? "—")
    : i.slot_group
      ? `${i.slot_group} (a scelta)`
      : "Non si indossa";

type Owned = {
  id: string;
  equipped: boolean;
  equipped_slot_id: string | null; // nicchia dove e' indossato
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
  // in giocata l'equipaggiamento non si cambia (lo blocca il database)
  const [inGame, setInGame] = useState(false);
  useEffect(() => {
    if (!isOwn) return;
    supabase
      .rpc("character_in_game", { p_character: characterId })
      .then(({ data }) => setInGame(data === true));
  }, [supabase, characterId, isOwn]);

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
            "id, equipped, equipped_slot_id, quality_id, quality:item_qualities(name, level), item:items(*)",
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

  async function equip(
    ownedId: string,
    on: boolean,
    slotId: string | null = null,
  ) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("equip_item", {
      p_character_item: ownedId,
      p_on: on,
      p_slot: slotId,
    });
    setBusy(false);
    if (error)
      return setError(
        error.message.includes("giocata")
          ? error.message
          : error.message.includes("posto")
          ? "Non c'è più posto: togli prima un oggetto."
          : error.message.includes("indossa")
            ? "Questo oggetto non si indossa."
            : "Operazione non riuscita.",
      );
    setPick(on ? { kind: "indossato", ownedId } : null);
    load();
  }

  if (slots === null) return <p className="p-6 text-muted">Caricamento...</p>;
  const lockNote = isOwn && inGame && (
    <p className="border border-amber-500/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
      Sei in giocata: l&apos;equipaggiamento è bloccato (non puoi indossare, togliere o comprare oggetti) finché non esci
      dalla giocata.
    </p>
  );

  const worn = owned.filter((o) => o.equipped);
  const bag = owned.filter((o) => !o.equipped);
  const place = (i: Item) => itemPlace(i, slots);
  const slotOf = (o: Owned) => o.equipped_slot_id ?? o.item.slot_id;

  // Nicchia: un riquadro per ogni posto della parte del corpo
  const groupOf = (id: string | null) =>
    slots.find((x) => x.id === id)?.slot_group ?? null;
  const niche = (s: Slot) => {
    const inSlot = worn.filter((w) => slotOf(w) === s.id);
    // mano bloccata da un oggetto a due mani indossato nell'altra nicchia del gruppo
    const blocker = s.slot_group
      ? worn.find(
          (w) =>
            w.item.hands === "2" &&
            slotOf(w) !== s.id &&
            groupOf(slotOf(w)) === s.slot_group,
        )
      : undefined;
    const boxes = Array.from(
      { length: Math.max(1, s.capacity) },
      (_, i) => inSlot[i] ?? null,
    );
    return (
      <div key={s.id} className="flex flex-col items-center">
        <span
          className={`mb-1 text-center font-serif text-[0.6875rem] leading-tight tracking-[0.14em] text-[#e6cdb0] uppercase ${s.side === "sotto" ? "" : "max-w-[5.5rem]"}`}
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
              disabled={!o && !blocker}
              onClick={() => {
                const x = o ?? blocker;
                if (x) setPick({ kind: "indossato", ownedId: x.id });
              }}
              title={
                o
                  ? o.item.name
                  : blocker
                    ? `Occupata: ${blocker.item.name} (a due mani)`
                    : `${s.name}: vuota`
              }
              className={`equip-frame h-[4.5rem] w-[4.5rem] ${o && pick?.kind === "indossato" && pick.ownedId === o.id ? "equip-frame-on" : ""}`}
            >
              {o ? (
                <ItemImage item={o.item} fill />
              ) : blocker ? (
                <span className="block h-full w-full opacity-35 grayscale">
                  <ItemImage item={blocker.item} fill />
                </span>
              ) : (
                <SlotIcon name={s.name} />
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

  const details = (picked || error || !isOwn) && (
    <div className="min-h-24 border-t border-[#c08a4e]/30 pt-3">
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
              {picked.equipped
                ? (slots.find((s) => s.id === slotOf(picked))?.name ??
                  place(picked.item))
                : place(picked.item)}
              {picked.item.hands === "2" && " · a due mani"}
              {pick?.kind === "borsa" &&
                ` · ${bag.filter((b) => groupKey(b) === pick.key).length} in borsa`}
              {picked.equipped && " · indossato"}
            </p>
            {picked.item.description && (
              <p className="mt-1 text-sm whitespace-pre-line text-[#e8d8b4]">
                {picked.item.description}
              </p>
            )}
            {isOwn && isWearable(picked.item) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {picked.equipped ||
                picked.item.slot_id ||
                picked.item.hands === "2" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => equip(picked.id, !picked.equipped)}
                    className={`${picked.equipped ? "btn-ghost" : "btn"} px-3 py-1 text-xs tracking-[0.12em] uppercase`}
                  >
                    {picked.equipped
                      ? "Togli"
                      : picked.item.hands === "2"
                        ? "Indossa (a due mani)"
                        : "Indossa"}
                  </button>
                ) : (
                  // oggetto di un gruppo (es. Mano): si sceglie la nicchia
                  slots
                    .filter((s) => s.slot_group === picked.item.slot_group)
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={busy}
                        onClick={() => equip(picked.id, true, s.id)}
                        className="btn px-3 py-1 text-xs tracking-[0.12em] uppercase"
                      >
                        Indossa: {s.name}
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Figura con le nicchie */}
      <div className="shrink-0 border-b border-[#7a5530]/40 px-4 pt-3 pb-4 md:w-[23rem] md:border-r md:border-b-0">
        <h3 className="font-serif text-[1.6rem] leading-tight tracking-wide text-[#e6cdb0] [font-variant:small-caps]">Equipaggiamento</h3>
        <div aria-hidden className="mb-3 flex items-center gap-2 text-[#c08a4e]">
          <span className="h-px flex-1 bg-gradient-to-r from-[#c08a4e]/20 to-[#c08a4e]" />
          <span className="text-xs">❖</span>
          <span className="h-px flex-1 bg-gradient-to-l from-[#c08a4e]/20 to-[#c08a4e]" />
        </div>
        {/* colonne laterali uguali: la figura resta al centro esatto, le nicchie si distribuiscono su tutta la sua altezza */}
        <div className="grid h-[29rem] grid-cols-[5.25rem_minmax(0,1fr)_5.25rem] gap-1">
          <div className="flex flex-col items-center justify-evenly">{left.map(niche)}</div>
          <div className="flex items-center justify-center">
            <BodyFigure />
          </div>
          <div className="flex flex-col items-center justify-evenly">{right.map(niche)}</div>
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
              className="inventario-barra flex w-full items-center gap-3 px-3 py-2 text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/ui/equip/tab-baule-piccolo.png" alt="" aria-hidden className="h-6 w-6" />
              <span className="flex-1 font-serif text-lg tracking-[0.14em] text-[#f3e2cc] uppercase">Inventario</span>
              <span className="font-serif text-lg text-[#f3e2cc]">{bag.length}</span>
            </button>
            {bagOpen && (
              <Inventory
                bag={bag}
                categories={categories}
                pick={pick}
                isOwn={isOwn}
                onPick={(key) => setPick({ kind: "borsa", key })}
              />
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            L&apos;inventario lo vede solo il proprietario.
          </p>
        )}
        {lockNote}
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
  isOwn,
  onPick,
}: {
  bag: Owned[];
  categories: Category[];
  pick: Selection;
  isOwn: boolean;
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
  // "Tutto" e le categorie (quelle senza oggetti restano, spente); "Varie" per chi non ha categoria
  const noCategory = groups.some((g) => !g.item.category_id);
  const tabs = [
    { id: "*", name: "Tutto" },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
    ...(noCategory && !categories.some((c) => c.name.toLowerCase() === "varie") ? [{ id: "", name: "Varie" }] : []),
  ].map((t) => ({
    ...t,
    n: groups
      .filter((g) => t.id === "*" || (g.item.category_id ?? "") === t.id || (t.name.toLowerCase() === "varie" && !g.item.category_id))
      .reduce((a, g) => a + g.n, 0),
  }));
  const [tab, setTab] = useState("*");
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const shown = groups.filter(
    (g) =>
      current.id === "*" ||
      (g.item.category_id ?? "") === current.id ||
      (current.name.toLowerCase() === "varie" && !g.item.category_id),
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id || "varie"}
            type="button"
            onClick={() => setTab(t.id)}
            title={`${t.name}: ${t.n}`}
            className={`inventario-scheda flex flex-col items-center gap-1 px-1 py-1.5 font-serif text-[0.625rem] tracking-[0.08em] uppercase ${
              current.id === t.id ? "inventario-scheda-attiva" : ""
            } ${t.n === 0 && t.id !== "*" ? "opacity-55" : ""}`}
          >
            <CategoryIcon name={t.name} />
            <span className="max-w-full truncate">{t.name}</span>
            {t.n > 0 && t.id !== "*" && <span className="sr-only"> ({t.n})</span>}
          </button>
        ))}
      </div>
      <div className="pannello-bronzo inventario-borsa min-h-[14rem] p-3">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/ui/equip/baule.png" alt="" aria-hidden className="h-[52px] w-[70px] opacity-80" />
            <p className="mt-3 font-serif text-base tracking-[0.12em] text-[#d4b394] uppercase">
              {groups.length === 0 ? "La borsa è vuota." : "Niente in questa categoria."}
            </p>
            <div aria-hidden className="my-2 flex w-56 items-center gap-1.5 text-[#c08a4e]">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#c08a4e]" />
              <span className="text-[0.6rem]">❖</span>
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#c08a4e]" />
            </div>
            {isOwn && <p className="text-sm text-[#a08a64] italic">Clicca un oggetto, o una nicchia della figura, per vederlo e usarlo.</p>}
          </div>
        ) : (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {shown
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
                {g.quality && isWearable(g.item) && (
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
        )}
      </div>
    </div>
  );
}

// Icona di una nicchia vuota (ritagliate dall'immagine dell'equipaggiamento)
function SlotIcon({ name }: { name: string }) {
  const key = name.toLowerCase().replace(/\s+/g, "-");
  const known = ["testa", "collo", "busto", "gambe", "braccio", "mano-dx", "mano-sx", "piedi"];
  if (!known.includes(key)) return <span className="text-xs text-[#a08a64]/70 italic">vuota</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/images/ui/equip/nicchia-${key}.png`} alt="" aria-hidden className="h-[54px] w-[50px] opacity-75" />;
}

// Icona di una categoria dell'inventario
function CategoryIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const file =
    n === "tutto" ? "tab-tutto" :
    n === "armi" ? "tab-armi" :
    n === "armature" ? "nicchia-busto" :
    n === "vestiti" ? "tab-armature" :
    n === "gioielli" || n === "accessori" ? "tab-accessori" :
    n === "consumabili" ? null :
    "tab-varie";
  if (!file)
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#d4a15c" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
        <path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 14h9" />
      </svg>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/images/ui/equip/${file}.png`} alt="" aria-hidden className="h-[22px] w-[22px] object-contain" />;
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
      src="/images/ui/equip/cavaliere.webp"
      alt=""
      className="mx-auto max-h-[28rem] w-full object-contain [mask-image:radial-gradient(ellipse_50%_52%_at_center,black_55%,transparent_100%)]"
    />
  );
}
