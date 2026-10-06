"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ItemImage,
  itemPlace,
  type Category,
  type Item,
  type Quality,
  type Slot,
} from "@/components/scheda/Equipment";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { id: "oggetti", label: "Oggetti" },
  { id: "assegna", label: "Assegna ai PG" },
  { id: "categorie", label: "Categorie" },
  { id: "qualita", label: "Qualità (fabbro)" },
  { id: "parti", label: "Parti del corpo" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Msg = { ok: boolean; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <span className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
      {msg.text}
    </span>
  );
}

// Gestione -> Oggetti: catalogo (con negozio), assegnazione ai PG, parti del corpo
export default function ItemsManager({
  slots,
  categories,
  qualities,
  items,
}: {
  slots: Slot[];
  categories: Category[];
  qualities: Quality[];
  items: Item[];
}) {
  const [tab, setTab] = useState<Tab>("oggetti");
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm tracking-wider uppercase ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "oggetti" && (
        <ItemsTab
          slots={slots}
          categories={categories}
          qualities={qualities}
          items={items}
        />
      )}
      {tab === "assegna" && <GiveTab slots={slots} items={items} />}
      {tab === "categorie" && <CategoriesTab categories={categories} />}
      {tab === "qualita" && <QualitiesTab qualities={qualities} />}
      {tab === "parti" && <SlotsTab slots={slots} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Catalogo degli oggetti
// ---------------------------------------------------------------------
const EMPTY: Omit<Item, "id"> = {
  name: "",
  description: "",
  image_url: null,
  slot_id: null,
  slot_group: null,
  category_id: null,
  price: null,
  in_shop: false,
  at_signup: false,
  quality_id: null,
};

function ItemsTab({
  slots,
  categories,
  qualities,
  items,
}: {
  slots: Slot[];
  categories: Category[];
  qualities: Quality[];
  items: Item[];
}) {
  const [selected, setSelected] = useState<string | "nuovo" | null>(
    items[0]?.id ?? "nuovo",
  );
  const [q, setQ] = useState("");
  const shown = items.filter(
    (i) => !q || i.name.toLowerCase().includes(q.toLowerCase()),
  );
  const current =
    selected === "nuovo" ? null : items.find((i) => i.id === selected);

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        <SignupMax />
        <button
          type="button"
          onClick={() => setSelected("nuovo")}
          className="btn w-full py-1.5 text-sm"
        >
          + Nuovo oggetto
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca..."
          aria-label="Cerca un oggetto"
          className="input py-1.5 text-sm"
        />
        <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
          {shown.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSelected(i.id)}
                className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left text-sm ${
                  selected === i.id
                    ? "border-accent bg-blood/20"
                    : "border-border/60 bg-black/30 hover:border-accent/60"
                }`}
              >
                <ItemImage item={i} small />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-accent">{i.name}</span>
                  <span className="block text-xs text-muted">
                    {qualities.find((q) => q.id === i.quality_id)?.name ??
                      qualities[0]?.name}{" "}
                    · {itemPlace(i, slots)}
                    {i.in_shop && i.price !== null && ` · mercato ${i.price}`}
                    {i.at_signup && " · iscrizione"}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="text-sm text-muted">Nessun oggetto.</li>
          )}
        </ul>
      </div>
      <ItemForm
        key={selected ?? "x"}
        slots={slots}
        categories={categories}
        qualities={qualities}
        item={current ?? null}
        onCreated={(id) => setSelected(id)}
      />
    </div>
  );
}

function ItemForm({
  slots,
  categories,
  qualities,
  item,
  onCreated,
}: {
  slots: Slot[];
  categories: Category[];
  qualities: Quality[];
  item: Item | null;
  onCreated: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [v, setV] = useState<Omit<Item, "id">>(item ?? EMPTY);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Omit<Item, "id">>) => setV((x) => ({ ...x, ...p }));

  async function save() {
    if (!v.name.trim()) return setMsg({ ok: false, text: "Scrivi il nome." });
    const image = v.image_url?.trim() || null;
    if (image && !image.startsWith("https://"))
      return setMsg({
        ok: false,
        text: "L'immagine deve iniziare con https://",
      });
    setBusy(true);
    const row = {
      ...v,
      name: v.name.trim(),
      description: v.description.trim(),
      image_url: image,
      in_shop: v.in_shop && v.price !== null,
    };
    const res = item
      ? await supabase
          .from("items")
          .update(row)
          .eq("id", item.id)
          .select("id")
          .single()
      : await supabase.from("items").insert(row).select("id").single();
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: "Oggetto non salvato." });
    setMsg({ ok: true, text: "Salvato." });
    router.refresh();
    if (!item && res.data) onCreated(res.data.id as string);
  }

  async function remove() {
    if (
      !item ||
      !window.confirm(
        `Eliminare ${item.name}? Sparisce anche dai PG che lo possiedono.`,
      )
    )
      return;
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) return setMsg({ ok: false, text: "Oggetto non eliminato." });
    router.refresh();
    onCreated("nuovo");
  }

  return (
    <div className="space-y-3 border border-border/60 bg-black/30 p-4">
      <h2 className="font-serif text-xl text-accent">
        {item ? item.name : "Nuovo oggetto"}
      </h2>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Nome
        </span>
        <input
          value={v.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={80}
          className="input py-1.5"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Descrizione
        </span>
        <textarea
          value={v.description}
          onChange={(e) => set({ description: e.target.value })}
          maxLength={2000}
          rows={4}
          className="input resize-y text-sm"
        />
      </label>
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-dashed border-accent/50 bg-black/40">
          {v.image_url?.startsWith("https://") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={v.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-center text-[0.65rem] text-muted">
              100 × 100
            </span>
          )}
        </span>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Immagine (indirizzo, quadrata 100 × 100)
          </span>
          <input
            value={v.image_url ?? ""}
            onChange={(e) => set({ image_url: e.target.value })}
            placeholder="https://..."
            className="input py-1.5"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Categoria
          </span>
          <select
            value={v.category_id ?? ""}
            onChange={(e) => set({ category_id: e.target.value || null })}
            className="input w-44! py-1.5"
          >
            <option value="">Varie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Dove si indossa
          </span>
          {/* una nicchia precisa, oppure un gruppo (es. Mano: destra o sinistra, la sceglie il giocatore) */}
          <select
            value={v.slot_id ?? (v.slot_group ? `gruppo:${v.slot_group}` : "")}
            onChange={(e) => {
              const val = e.target.value;
              if (val.startsWith("gruppo:"))
                set({ slot_id: null, slot_group: val.slice(7) });
              else set({ slot_id: val || null, slot_group: null });
            }}
            className="input w-64! py-1.5"
          >
            <option value="">— non si indossa —</option>
            {[
              ...new Set(
                slots.map((s) => s.slot_group).filter((g): g is string => !!g),
              ),
            ].map((g) => (
              <option key={g} value={`gruppo:${g}`}>
                {g} (a scelta:{" "}
                {slots
                  .filter((s) => s.slot_group === g)
                  .map((s) => s.name)
                  .join(" o ")}
                )
              </option>
            ))}
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Prezzo (monete)
          </span>
          <input
            type="number"
            min={0}
            value={v.price ?? ""}
            onChange={(e) =>
              set({
                price:
                  e.target.value === ""
                    ? null
                    : Math.max(0, Math.trunc(Number(e.target.value)) || 0),
              })
            }
            className="input w-32! py-1.5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Livello
          </span>
          <select
            value={v.quality_id ?? qualities[0]?.id ?? ""}
            onChange={(e) => set({ quality_id: e.target.value || null })}
            className="input w-40! py-1.5"
          >
            {qualities.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!v.at_signup}
            onChange={(e) => set({ at_signup: e.target.checked })}
          />
          Disponibile all&apos;iscrizione
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={v.in_shop}
            disabled={v.price === null}
            onChange={(e) => set({ in_shop: e.target.checked })}
          />
          Presente al mercato
        </label>
      </div>
      <p className="text-xs text-muted">
        Il livello è la qualità con cui l&apos;oggetto arriva al PG: comprato al
        mercato, scelto all&apos;iscrizione o assegnato dallo staff. Poi il
        fabbro può migliorarlo.
      </p>
      {v.price === null && (
        <p className="text-xs text-muted">
          Senza prezzo l&apos;oggetto non va al mercato: si può solo scegliere
          all&apos;iscrizione o assegnare dallo staff.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="btn px-4 py-1.5 text-sm"
        >
          {item ? "Salva" : "Crea oggetto"}
        </button>
        {item && (
          <button
            type="button"
            onClick={remove}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Elimina
          </button>
        )}
        <Note msg={msg} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Assegnare oggetti ai PG (arriva un messaggio di SISTEMA) e togliere
// ---------------------------------------------------------------------
type Pg = { id: string; name: string; house: { name: string } | null };
type Owned = {
  id: string;
  equipped: boolean;
  source: string;
  item: Item | null;
};
const pgName = (p: Pg) => (p.house ? `${p.name} ${p.house.name}` : p.name);

function GiveTab({ slots, items }: { slots: Slot[]; items: Item[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Pg[]>([]);
  const [pg, setPg] = useState<Pg | null>(null);
  const [owned, setOwned] = useState<Owned[]>([]);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const text = q.trim().replace(/[%_,()]/g, "");
    if (text.length < 2) return;
    const t = setTimeout(() => {
      supabase
        .from("characters")
        .select("id, name, house:houses(name)")
        .ilike("name", `%${text}%`)
        .order("name")
        .limit(10)
        .then(({ data }) => setFound((data ?? []) as unknown as Pg[]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, supabase]);

  const loadOwned = (id: string) =>
    supabase
      .from("character_items")
      .select("id, equipped, source, item:items(*)")
      .eq("character_id", id)
      .order("acquired_at")
      .then(({ data }) =>
        setOwned(((data ?? []) as unknown as Owned[]).filter((o) => o.item)),
      );

  async function give() {
    if (!pg || !itemId) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("give_item", {
      p_character: pg.id,
      p_item: itemId,
      p_qty: qty,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Oggetto non assegnato." });
    setMsg({
      ok: true,
      text: `Assegnato a ${pgName(pg)}: ha ricevuto un messaggio di SISTEMA.`,
    });
    loadOwned(pg.id);
  }

  async function take(o: Owned) {
    if (!pg || !window.confirm(`Togliere ${o.item?.name} a ${pgName(pg)}?`))
      return;
    const { error } = await supabase
      .from("character_items")
      .delete()
      .eq("id", o.id);
    if (error) return setMsg({ ok: false, text: "Oggetto non tolto." });
    loadOwned(pg.id);
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un PG per nome..."
          aria-label="Cerca un PG"
          className="input py-1.5 text-sm"
        />
        <ul className="space-y-1">
          {(q.trim().length >= 2 ? found : []).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setPg(p);
                  setMsg(null);
                  loadOwned(p.id);
                }}
                className={`w-full border px-2 py-1.5 text-left text-sm ${pg?.id === p.id ? "border-accent bg-blood/20 text-accent" : "border-border/60 bg-black/30 hover:border-accent/60"}`}
              >
                {pgName(p)}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {!pg ? (
        <p className="text-sm text-muted">
          Cerca e scegli un PG per assegnargli oggetti o vedere cosa possiede.
        </p>
      ) : (
        <div className="space-y-4 border border-border/60 bg-black/30 p-4">
          <h2 className="font-serif text-xl text-accent">{pgName(pg)}</h2>
          {items.length === 0 ? (
            <p className="text-sm text-muted">
              Crea prima qualche oggetto nella scheda Oggetti.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-48 flex-1">
                <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
                  Oggetto
                </span>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="input py-1.5"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
                  Quanti
                </span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={qty}
                  onChange={(e) =>
                    setQty(
                      Math.min(50, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                  className="input w-20! py-1.5"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={give}
                className="btn px-4 py-1.5 text-sm"
              >
                Assegna
              </button>
            </div>
          )}
          <Note msg={msg} />
          <div>
            <h3 className="mb-2 font-serif text-lg text-[#d8c39a]">
              Cosa possiede
            </h3>
            {owned.length === 0 ? (
              <p className="text-sm text-muted">Nessun oggetto.</p>
            ) : (
              <ul className="space-y-1">
                {owned.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center gap-2 border border-border/60 bg-black/30 px-2 py-1.5 text-sm"
                  >
                    <ItemImage item={o.item!} small />
                    <span className="min-w-0 flex-1">
                      <span className="text-accent">{o.item!.name}</span>
                      <span className="block text-xs text-muted">
                        {itemPlace(o.item!, slots)}
                        {o.equipped && " · indossato"} ·{" "}
                        {o.source === "negozio"
                          ? "comprato"
                          : "dato dallo staff"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => take(o)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Togli
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Parti del corpo
// ---------------------------------------------------------------------
function SlotsTab({ slots }: { slots: Slot[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  type Row = Pick<Slot, "name" | "side" | "capacity" | "slot_group">;
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [added, setAdded] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const row = (s: Slot): Row =>
    rows[s.id] ?? {
      name: s.name,
      side: s.side,
      capacity: s.capacity,
      slot_group: s.slot_group,
    };
  const set = (s: Slot, p: Partial<Row>) =>
    setRows((r) => ({ ...r, [s.id]: { ...row(s), ...p } }));
  const changed = (s: Slot) => {
    const r = row(s);
    return (
      r.name.trim() !== s.name ||
      r.side !== s.side ||
      r.capacity !== s.capacity ||
      (r.slot_group ?? "") !== (s.slot_group ?? "")
    );
  };

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    setMsg(
      error
        ? { ok: false, text: "Operazione non riuscita." }
        : { ok: true, text: ok },
    );
    if (!error) router.refresh();
    return !error;
  }

  async function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[i], next[j]] = [next[j], next[i]];
    await Promise.all(
      next.map((s, k) =>
        supabase
          .from("equipment_slots")
          .update({ sort_order: k + 1 })
          .eq("id", s.id),
      ),
    );
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-muted">
        Le nicchie intorno alla figura dell&apos;equipaggiamento: dove stanno (a
        sinistra, a destra o sotto la figura) e quanti oggetti ci entrano (la
        cintura, per esempio, 3). Eliminando una parte, i suoi oggetti diventano
        &quot;non si indossa&quot;.
      </p>
      <ul className="space-y-1.5">
        {slots.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <input
              value={row(s).name}
              onChange={(e) => set(s, { name: e.target.value })}
              maxLength={40}
              aria-label={`Nome della parte ${s.name}`}
              className="input flex-1 py-1 text-sm"
            />
            <select
              value={row(s).side}
              onChange={(e) => set(s, { side: e.target.value as Slot["side"] })}
              aria-label="Posizione"
              className="input w-32! py-1 text-sm"
            >
              <option value="sinistra">a sinistra</option>
              <option value="destra">a destra</option>
              <option value="sotto">sotto</option>
            </select>
            <input
              value={row(s).slot_group ?? ""}
              onChange={(e) => set(s, { slot_group: e.target.value || null })}
              maxLength={40}
              placeholder="gruppo"
              title="Gruppo: le nicchie con lo stesso gruppo (es. Mano) accolgono gli oggetti creati per il gruppo"
              aria-label="Gruppo della nicchia"
              className="input w-24! py-1 text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-muted">
              posti
              <input
                type="number"
                min={1}
                max={10}
                value={row(s).capacity}
                onChange={(e) =>
                  set(s, {
                    capacity: Math.min(
                      10,
                      Math.max(1, Number(e.target.value) || 1),
                    ),
                  })
                }
                className="input w-16! py-1 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Sposta su"
              className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={i === slots.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Sposta giù"
              className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={!row(s).name.trim() || !changed(s)}
              onClick={() =>
                run(
                  supabase
                    .from("equipment_slots")
                    .update({
                      ...row(s),
                      name: row(s).name.trim(),
                      slot_group: row(s).slot_group?.trim() || null,
                    })
                    .eq("id", s.id),
                  "Salvato.",
                )
              }
              className="btn px-2 py-1 text-xs"
            >
              Salva
            </button>
            <button
              type="button"
              onClick={() =>
                window.confirm(`Eliminare ${s.name}?`) &&
                run(
                  supabase.from("equipment_slots").delete().eq("id", s.id),
                  "Eliminata.",
                )
              }
              className="px-1 text-xs text-red-400 hover:text-red-300"
            >
              Elimina
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={added}
          onChange={(e) => setAdded(e.target.value)}
          maxLength={40}
          placeholder="Nuova parte del corpo"
          aria-label="Nuova parte del corpo"
          className="input flex-1 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={!added.trim()}
          onClick={() =>
            run(
              supabase
                .from("equipment_slots")
                .insert({ name: added.trim(), sort_order: slots.length + 1 }),
              "Aggiunta.",
            ).then((ok) => ok && setAdded(""))
          }
          className="btn px-3 py-1.5 text-sm"
        >
          Aggiungi
        </button>
      </div>
      <Note msg={msg} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Categorie degli oggetti (le schede dell'inventario)
// ---------------------------------------------------------------------
function CategoriesTab({ categories }: { categories: Category[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>({});
  const [added, setAdded] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const name = (c: Category) => names[c.id] ?? c.name;

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    setMsg(
      error
        ? { ok: false, text: "Operazione non riuscita." }
        : { ok: true, text: ok },
    );
    if (!error) router.refresh();
    return !error;
  }

  async function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[i], next[j]] = [next[j], next[i]];
    await Promise.all(
      next.map((c, k) =>
        supabase
          .from("item_categories")
          .update({ sort_order: k + 1 })
          .eq("id", c.id),
      ),
    );
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-muted">
        Le schede dell&apos;inventario dei PG (Armi, Consumabili, Munizioni...).
        Gli oggetti senza categoria finiscono in &quot;Varie&quot;.
      </p>
      <ul className="space-y-1.5">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              value={name(c)}
              onChange={(e) =>
                setNames((n) => ({ ...n, [c.id]: e.target.value }))
              }
              maxLength={40}
              aria-label={`Nome della categoria ${c.name}`}
              className="input flex-1 py-1 text-sm"
            />
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Sposta su"
              className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={i === categories.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Sposta giù"
              className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={!name(c).trim() || name(c).trim() === c.name}
              onClick={() =>
                run(
                  supabase
                    .from("item_categories")
                    .update({ name: name(c).trim() })
                    .eq("id", c.id),
                  "Salvato.",
                )
              }
              className="btn px-2 py-1 text-xs"
            >
              Salva
            </button>
            <button
              type="button"
              onClick={() =>
                window.confirm(`Eliminare ${c.name}?`) &&
                run(
                  supabase.from("item_categories").delete().eq("id", c.id),
                  "Eliminata.",
                )
              }
              className="px-1 text-xs text-red-400 hover:text-red-300"
            >
              Elimina
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={added}
          onChange={(e) => setAdded(e.target.value)}
          maxLength={40}
          placeholder="Nuova categoria"
          aria-label="Nuova categoria"
          className="input flex-1 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={!added.trim()}
          onClick={() =>
            run(
              supabase.from("item_categories").insert({
                name: added.trim(),
                sort_order: categories.length + 1,
              }),
              "Aggiunta.",
            ).then((ok) => ok && setAdded(""))
          }
          className="btn px-3 py-1.5 text-sm"
        >
          Aggiungi
        </button>
      </div>
      <Note msg={msg} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Qualita' (fabbro): livelli in ordine, costo per arrivarci e riuscita
// ---------------------------------------------------------------------
function QualitiesTab({ qualities }: { qualities: Quality[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  type Row = Pick<Quality, "name" | "upgrade_cost" | "success_pct">;
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [added, setAdded] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const row = (q: Quality): Row =>
    rows[q.id] ?? {
      name: q.name,
      upgrade_cost: q.upgrade_cost,
      success_pct: q.success_pct,
    };
  const set = (q: Quality, p: Partial<Row>) =>
    setRows((r) => ({ ...r, [q.id]: { ...row(q), ...p } }));
  const changed = (q: Quality) => {
    const r = row(q);
    return (
      r.name.trim() !== q.name ||
      r.upgrade_cost !== q.upgrade_cost ||
      r.success_pct !== q.success_pct
    );
  };

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    setMsg(
      error
        ? { ok: false, text: "Operazione non riuscita." }
        : { ok: true, text: ok },
    );
    if (!error) router.refresh();
    return !error;
  }

  // Scambia il livello con il vicino (passando da un livello libero: i livelli sono unici)
  async function move(i: number, d: -1 | 1) {
    const a = qualities[i];
    const b = qualities[i + d];
    if (!a || !b) return;
    const free = Math.max(...qualities.map((q) => q.level)) + 1;
    await supabase
      .from("item_qualities")
      .update({ level: free })
      .eq("id", a.id);
    await supabase
      .from("item_qualities")
      .update({ level: a.level })
      .eq("id", b.id);
    await run(
      supabase.from("item_qualities").update({ level: b.level }).eq("id", a.id),
      "Ordine salvato.",
    );
  }

  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-muted">
        I livelli di qualità degli oggetti, dal più basso al più alto. Gli
        oggetti nuovi partono dal primo. Per ogni livello: quanto costa al
        fabbro arrivarci dal livello prima e la probabilità che il lavoro
        riesca. Se fallisce, il PG perde metà del costo e l&apos;oggetto resta
        com&apos;era. Il fabbro migliora solo gli oggetti che si indossano.
      </p>
      <ul className="space-y-1.5">
        {qualities.map((q, i) => (
          <li key={q.id} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-center text-xs text-muted">{i + 1}</span>
            <input
              value={row(q).name}
              onChange={(e) => set(q, { name: e.target.value })}
              maxLength={40}
              aria-label={`Nome del livello ${q.name}`}
              className="input flex-1 py-1 text-sm"
            />
            {i === 0 ? (
              <span className="w-[13.5rem] text-xs text-muted">
                livello di partenza
              </span>
            ) : (
              <>
                <label className="flex items-center gap-1 text-xs text-muted">
                  costo
                  <input
                    type="number"
                    min={0}
                    value={row(q).upgrade_cost}
                    onChange={(e) =>
                      set(q, {
                        upgrade_cost: Math.max(
                          0,
                          Math.trunc(Number(e.target.value)) || 0,
                        ),
                      })
                    }
                    className="input w-20! py-1 text-sm"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  riuscita %
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={row(q).success_pct}
                    onChange={(e) =>
                      set(q, {
                        success_pct: Math.min(
                          100,
                          Math.max(1, Math.trunc(Number(e.target.value)) || 1),
                        ),
                      })
                    }
                    className="input w-16! py-1 text-sm"
                  />
                </label>
              </>
            )}
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Sposta su"
              className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={i === qualities.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Sposta giù"
              className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={!row(q).name.trim() || !changed(q)}
              onClick={() =>
                run(
                  supabase
                    .from("item_qualities")
                    .update({ ...row(q), name: row(q).name.trim() })
                    .eq("id", q.id),
                  "Salvato.",
                )
              }
              className="btn px-2 py-1 text-xs"
            >
              Salva
            </button>
            <button
              type="button"
              disabled={qualities.length <= 1}
              onClick={() =>
                window.confirm(
                  `Eliminare ${q.name}? Gli oggetti di questa qualità tornano al livello più basso.`,
                ) &&
                run(
                  supabase.from("item_qualities").delete().eq("id", q.id),
                  "Eliminato.",
                )
              }
              className="px-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-30"
            >
              Elimina
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={added}
          onChange={(e) => setAdded(e.target.value)}
          maxLength={40}
          placeholder="Nuovo livello (in fondo)"
          aria-label="Nuovo livello di qualità"
          className="input flex-1 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={!added.trim()}
          onClick={() =>
            run(
              supabase.from("item_qualities").insert({
                name: added.trim(),
                level: Math.max(0, ...qualities.map((q) => q.level)) + 1,
                upgrade_cost: 100,
                success_pct: 50,
              }),
              "Aggiunto.",
            ).then((ok) => ok && setAdded(""))
          }
          className="btn px-3 py-1.5 text-sm"
        >
          Aggiungi
        </button>
      </div>
      <Note msg={msg} />
    </div>
  );
}

// Quanti oggetti si scelgono all'iscrizione (tra quelli "disponibili all'iscrizione")
function SignupMax() {
  const supabase = useMemo(() => createClient(), []);
  const [max, setMax] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    supabase
      .from("item_settings")
      .select("signup_max")
      .maybeSingle()
      .then(({ data }) => {
        const n = (data?.signup_max as number | undefined) ?? 3;
        setMax(n);
        setSaved(n);
      });
  }, [supabase]);

  async function save() {
    if (max === null) return;
    const { error } = await supabase
      .from("item_settings")
      .update({ signup_max: max })
      .eq("id", true);
    setMsg(
      error
        ? { ok: false, text: "Non salvato." }
        : { ok: true, text: "Salvato." },
    );
    if (!error) setSaved(max);
  }

  return (
    <div className="space-y-1 border border-border/60 bg-black/30 p-2 text-xs">
      <label className="flex items-center justify-between gap-2 text-muted">
        Oggetti da scegliere all&apos;iscrizione
        <input
          type="number"
          min={0}
          max={20}
          value={max ?? ""}
          onChange={(e) =>
            setMax(
              Math.min(
                20,
                Math.max(0, Math.trunc(Number(e.target.value)) || 0),
              ),
            )
          }
          className="input w-16! py-1 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={max === null || max === saved}
          onClick={save}
          className="btn px-2 py-1 text-xs"
        >
          Salva
        </button>
        <Note msg={msg} />
      </div>
    </div>
  );
}
