"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ItemImage,
  itemPlace,
  type Item,
  type Quality,
  type Slot,
} from "./Equipment";

type SignupItem = Item & { quality: Pick<Quality, "name"> | null };

// Oggetti disponibili all'iscrizione e quanti se ne possono scegliere
export function useSignupItems() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<{
    items: SignupItem[];
    slots: Slot[];
    max: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from("items")
        .select("*, quality:item_qualities(name)")
        .eq("at_signup", true)
        .order("name"),
      supabase.from("equipment_slots").select("*").order("sort_order"),
      supabase.from("item_settings").select("signup_max").maybeSingle(),
    ]).then(([i, s, m]) =>
      setData({
        items: (i.data ?? []) as SignupItem[],
        slots: (s.data ?? []) as Slot[],
        max: (m.data?.signup_max as number | undefined) ?? 3,
      }),
    );
  }, [supabase]);

  return data;
}

// Prezzo di un oggetto all'iscrizione (senza prezzo = gratis)
export const signupPrice = (it: { price?: number | null }) => it.price ?? 0;

// Passaggio "Equipaggiamento" della creazione: il giocatore compra gli oggetti
// di partenza (disponibili all'iscrizione) con le monete della creazione
export default function StepItems({
  chosen,
  onChange,
  budget,
}: {
  chosen: string[];
  onChange: (ids: string[]) => void;
  budget: number; // monete a disposizione
}) {
  const data = useSignupItems();
  if (!data) return <p className="text-sm text-muted">Caricamento...</p>;
  const { items, slots } = data;
  // scelti ancora disponibili (lo staff potrebbe averne tolto qualcuno)
  const picked = chosen.filter((id) => items.some((i) => i.id === id));
  const spent = items
    .filter((i) => picked.includes(i.id))
    .reduce((a, i) => a + signupPrice(i), 0);
  const left = budget - spent;

  if (items.length === 0)
    return (
      <p className="text-sm text-muted">
        Per ora non ci sono oggetti da comprare all&apos;iscrizione: puoi andare
        avanti.
      </p>
    );

  function toggle(id: string) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    if (picked.includes(id)) onChange(picked.filter((x) => x !== id));
    else if (signupPrice(it) <= left) onChange([...picked, id]);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Hai <strong className="text-accent">{budget} monete</strong> per
        comprare l&apos;equipaggiamento con cui parte il tuo personaggio: puoi
        prendere oggetti finché le monete bastano. Li troverai nella scheda,
        alla voce Equipaggiamento. Monete rimaste:{" "}
        <strong className={left === 0 ? "text-green-400" : "text-accent"}>
          {left}
        </strong>
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => {
          const on = picked.includes(it.id);
          const tooMuch = !on && signupPrice(it) > left;
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => toggle(it.id)}
                disabled={tooMuch}
                aria-pressed={on}
                className={`flex w-full items-start gap-3 border p-2 text-left transition ${
                  on
                    ? "border-accent bg-blood/20"
                    : "border-border/70 bg-black/30 hover:border-accent/60"
                } disabled:opacity-40`}
              >
                <span className="equip-frame h-12 w-12 shrink-0">
                  <ItemImage item={it} fill />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-serif text-accent">{it.name}</span>
                    <span className="shrink-0 text-xs">
                      {on ? (
                        <span className="text-green-400">✓ preso</span>
                      ) : (
                        <span className="text-[#d8c39a]">
                          {signupPrice(it)
                            ? `${signupPrice(it)} monete`
                            : "gratis"}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="block text-xs text-muted">
                    {it.quality && (
                      <span className="text-[#d8c39a]">
                        {it.quality.name} ·{" "}
                      </span>
                    )}
                    {itemPlace(it, slots)}
                  </span>
                  {it.description && (
                    <span className="mt-1 block text-xs text-[#e8d8b4]">
                      {it.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Riepilogo: nomi degli oggetti scelti
export function ChosenItems({ chosen }: { chosen: string[] }) {
  const data = useSignupItems();
  const names = (data?.items ?? [])
    .filter((i) => chosen.includes(i.id))
    .map((i) => i.name);
  return (
    <div>
      <dt className="text-xs text-muted uppercase">Equipaggiamento</dt>
      <dd>{data === null ? "..." : names.length ? names.join(", ") : "—"}</dd>
    </div>
  );
}
