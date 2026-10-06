"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isWearable,
  itemPlace,
  ItemImage,
  type Category,
  type Item,
  type Quality,
  type Slot,
} from "@/components/scheda/Equipment";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";

type Mine = {
  id: string;
  equipped: boolean;
  quality_id: string | null;
  quality: Pick<Quality, "name" | "level"> | null;
  item: Item;
};

// Mercato (barra di destra): due banchi.
// - Bottega: gli oggetti in vendita, divisi per sezione, comprati con le monete del conto
// - Fabbro: migliora la qualita' degli oggetti che si indossano. Si paga in monete;
//   se fallisce si perde la meta' del costo e l'oggetto resta com'era
// Quello che si compra o si migliora sta nell'inventario (scheda -> Equipaggiamento)
export default function MarketPanel({
  character,
}: {
  character: MainCharacter | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [bench, setBench] = useState<"bottega" | "fabbro">("bottega");
  const [coins, setCoins] = useState<number | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const characterId = character?.status === "attivo" ? character.id : null;

  const loadCoins = useCallback(() => {
    if (!characterId) return;
    supabase
      .from("characters")
      .select("coins")
      .eq("id", characterId)
      .single()
      .then(({ data }) => setCoins((data?.coins as number | undefined) ?? 0));
  }, [supabase, characterId]);

  useEffect(() => {
    Promise.all([
      supabase.from("equipment_slots").select("*").order("sort_order"),
      supabase
        .from("item_categories")
        .select("*")
        .order("sort_order")
        .order("name"),
      supabase.from("item_qualities").select("*").order("level"),
    ]).then(([s, c, q]) => {
      setSlots((s.data ?? []) as Slot[]);
      setCategories((c.data ?? []) as Category[]);
      setQualities((q.data ?? []) as Quality[]);
    });
    loadCoins();
  }, [supabase, loadCoins]);

  if (!characterId)
    return (
      <p className="py-6 text-center text-muted">
        Per comprare al mercato serve un personaggio attivo.
      </p>
    );
  const slotName = (i: Item) => itemPlace(i, slots);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["bottega", "fabbro"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBench(b)}
              className={`border px-4 py-1.5 text-xs font-semibold tracking-[0.16em] uppercase ${
                bench === b
                  ? "border-accent bg-blood/20 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {b === "bottega" ? "Bottega" : "Fabbro"}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          Sul conto: <strong className="text-accent">{coins ?? "..."}</strong>{" "}
          monete
        </p>
      </div>
      {bench === "bottega" ? (
        <Shop
          characterId={characterId}
          coins={coins}
          categories={categories}
          qualities={qualities}
          slotName={slotName}
          onPaid={loadCoins}
        />
      ) : (
        <Smith
          characterId={characterId}
          coins={coins}
          qualities={qualities}
          slotName={slotName}
          onPaid={loadCoins}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Bottega: oggetti in vendita, divisi per sezione
// ---------------------------------------------------------------------
function Shop({
  characterId,
  coins,
  categories,
  qualities,
  slotName,
  onPaid,
}: {
  characterId: string;
  coins: number | null;
  categories: Category[];
  qualities: Quality[];
  slotName: (i: Item) => string;
  onPaid: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase
      .from("items")
      .select("*")
      .eq("in_shop", true)
      .not("price", "is", null)
      .order("price")
      .order("name")
      .then(({ data }) => setItems((data ?? []) as Item[]));
  }, [supabase]);

  const sections = [
    ...categories.map((c) => ({ id: c.id, name: c.name })),
    { id: "", name: "Varie" },
  ]
    .map((s) => ({
      ...s,
      n: (items ?? []).filter((i) => (i.category_id ?? "") === s.id).length,
    }))
    .filter((s) => s.n > 0);
  const current = sections.find((s) => s.id === section) ?? sections[0];

  async function buy(it: Item) {
    if (!window.confirm(`Comprare ${it.name} per ${it.price} monete?`)) return;
    setBusy(it.id);
    setMsg(null);
    const { error } = await supabase.rpc("buy_item", {
      p_character: characterId,
      p_item: it.id,
    });
    setBusy(null);
    if (error)
      return setMsg({
        ok: false,
        text: error.message.includes("monete")
          ? "Sul conto non ci sono abbastanza monete."
          : "Acquisto non riuscito.",
      });
    setMsg({
      ok: true,
      text: `Hai comprato ${it.name}: è nell'inventario (scheda → Equipaggiamento).`,
    });
    onPaid();
  }

  if (items === null)
    return <p className="text-sm text-muted">Caricamento...</p>;
  if (items.length === 0)
    return <p className="py-4 text-sm text-muted">La bottega è vuota.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {sections.map((s) => (
          <button
            key={s.id || "varie"}
            type="button"
            onClick={() => setSection(s.id)}
            className={`border px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.14em] uppercase ${
              current?.id === s.id
                ? "border-accent/70 text-accent"
                : "border-border text-[#e8d8b4] hover:border-accent/50"
            }`}
          >
            {s.name} <span className="ml-1 text-muted">{s.n}</span>
          </button>
        ))}
      </div>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
      <ul className="space-y-1.5">
        {items
          .filter((i) => (i.category_id ?? "") === current?.id)
          .map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-2 border border-border/60 bg-black/30 p-1.5"
            >
              <span className="equip-frame h-11 w-11 shrink-0">
                <ItemImage item={it} fill />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-sm text-accent"
                  title={it.description || it.name}
                >
                  {it.name}
                </span>
                <span className="block text-xs text-muted">
                  <span className="text-[#d8c39a]">
                    {qualities.find((q) => q.id === it.quality_id)?.name ??
                      qualities[0]?.name}
                  </span>{" "}
                  · {slotName(it)}
                </span>
              </span>
              <span className="text-xs whitespace-nowrap text-accent">
                {it.price} monete
              </span>
              <button
                type="button"
                disabled={busy === it.id || (coins ?? 0) < (it.price ?? 0)}
                onClick={() => buy(it)}
                className="btn px-2.5 py-1 text-xs"
              >
                Compra
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Fabbro: migliora di un livello la qualita' degli oggetti che si indossano
// ---------------------------------------------------------------------
function Smith({
  characterId,
  coins,
  qualities,
  slotName,
  onPaid,
}: {
  characterId: string;
  coins: number | null;
  qualities: Quality[];
  slotName: (i: Item) => string;
  onPaid: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    () =>
      supabase
        .from("character_items")
        .select(
          "id, equipped, quality_id, quality:item_qualities(name, level), item:items(*)",
        )
        .eq("character_id", characterId)
        .order("acquired_at")
        .then(({ data }) =>
          setMine(
            ((data ?? []) as unknown as Mine[]).filter(
              (m) => m.item && isWearable(m.item),
            ),
          ),
        ),
    [supabase, characterId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const levelOf = (m: Mine) => m.quality?.level ?? qualities[0]?.level ?? 1;
  const nextOf = (m: Mine) => qualities.find((q) => q.level > levelOf(m));

  async function upgrade(m: Mine) {
    const next = nextOf(m);
    if (!next) return;
    if (
      !window.confirm(
        `Portare ${m.item.name} a ${next.name}?\nCosto: ${next.upgrade_cost} monete · riuscita ${next.success_pct}%.\nSe fallisce perdi ${Math.ceil(next.upgrade_cost / 2)} monete e l'oggetto resta com'è.`,
      )
    )
      return;
    setBusy(m.id);
    setMsg(null);
    const { data, error } = await supabase.rpc("smith_upgrade", {
      p_character_item: m.id,
    });
    setBusy(null);
    if (error)
      return setMsg({
        ok: false,
        text: error.message.includes("monete")
          ? "Sul conto non ci sono abbastanza monete."
          : "Il fabbro non può lavorare questo oggetto.",
      });
    const r = ((data as
      { success: boolean; quality: string; paid: number }[] | null) ?? [])[0];
    setMsg(
      r?.success
        ? {
            ok: true,
            text: `Il fabbro ce l'ha fatta: ${m.item.name} ora è ${r.quality}. Hai pagato ${r.paid} monete.`,
          }
        : {
            ok: false,
            text: `Il lavoro non è riuscito: ${m.item.name} resta com'era. Hai perso ${r?.paid ?? 0} monete.`,
          },
    );
    load();
    onPaid();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Il fabbro migliora le armi e tutto ciò che si indossa, un livello alla
        volta
        {qualities.length > 0 &&
          ` (${qualities.map((q) => q.name).join(" → ")})`}
        . Il lavoro è subito pronto, ma può non riuscire: in quel caso perdi
        metà del costo e l&apos;oggetto resta com&apos;era.
      </p>
      {msg && (
        <p
          className={`border px-3 py-2 text-sm ${msg.ok ? "border-green-700/60 bg-green-900/20 text-green-300" : "border-red-800/60 bg-red-950/30 text-red-300"}`}
        >
          {msg.text}
        </p>
      )}
      {mine === null ? (
        <p className="text-sm text-muted">Caricamento...</p>
      ) : mine.length === 0 ? (
        <p className="py-4 text-sm text-muted">
          Non hai oggetti da far lavorare al fabbro.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {mine.map((m) => {
            const next = nextOf(m);
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-2 border border-border/60 bg-black/30 p-1.5"
              >
                <span className="equip-frame h-11 w-11 shrink-0">
                  <ItemImage item={m.item} fill />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-accent">
                    {m.item.name}
                  </span>
                  <span className="block text-xs text-muted">
                    <span className="text-[#d8c39a]">
                      {m.quality?.name ?? qualities[0]?.name ?? "—"}
                    </span>{" "}
                    · {slotName(m.item)}
                    {m.equipped && " · indossato"}
                  </span>
                </span>
                {next ? (
                  <>
                    <span className="text-right text-xs leading-tight text-muted">
                      → <span className="text-[#d8c39a]">{next.name}</span>
                      <span className="block">
                        <span className="text-accent">{next.upgrade_cost}</span>{" "}
                        monete · {next.success_pct}%
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={
                        busy === m.id || (coins ?? 0) < next.upgrade_cost
                      }
                      onClick={() => upgrade(m)}
                      className="btn px-2.5 py-1 text-xs"
                    >
                      Migliora
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-[#d8c39a]">
                    Qualità massima
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
