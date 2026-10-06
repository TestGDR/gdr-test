"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ForumCategory, ForumSection } from "./forum-data";

type House = { id: string; name: string };
type Msg = { ok: boolean; text: string } | null;

// Categorie e sezioni del forum (permesso "forum.sezioni"): nomi, ordine,
// descrizione e chi vede ogni sezione (tutti, solo staff, una casata)
export default function ForumManage({
  categories,
  sections,
  onChanged,
}: {
  categories: ForumCategory[];
  sections: ForumSection[];
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [houses, setHouses] = useState<House[]>([]);
  const [newCat, setNewCat] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    supabase
      .from("houses")
      .select("id, name")
      .order("name")
      .then(({ data }) => setHouses((data ?? []) as House[]));
  }, [supabase]);

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    setMsg(
      error
        ? { ok: false, text: "Operazione non riuscita." }
        : { ok: true, text: ok },
    );
    if (!error) onChanged();
    return !error;
  }

  async function swap<T extends { id: string }>(
    table: string,
    list: T[],
    i: number,
    d: -1 | 1,
  ) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    await Promise.all(
      next.map((x, k) =>
        supabase
          .from(table)
          .update({ sort_order: k + 1 })
          .eq("id", x.id),
      ),
    );
    onChanged();
  }

  return (
    <div className="space-y-5 p-5 sm:p-7">
      <div>
        <h2 className="font-serif text-3xl tracking-wide text-accent">
          Categorie e sezioni
        </h2>
        <p className="mt-1 text-sm text-muted">
          Le categorie sono i titoli a sinistra; dentro ci sono le sezioni dove
          si aprono le discussioni. Una sezione può essere per tutti, solo per
          lo staff o solo per i membri di una casata. Eliminando una sezione si
          eliminano anche le sue discussioni.
        </p>
      </div>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}

      {categories.map((c, i) => {
        const secs = sections.filter((s) => s.category_id === c.id);
        return (
          <section
            key={c.id}
            className="space-y-2 border border-border/60 bg-black/30 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <NameInput
                value={c.name}
                label={`Nome della categoria ${c.name}`}
                onSave={(name) =>
                  run(
                    supabase
                      .from("forum_categories")
                      .update({ name })
                      .eq("id", c.id),
                    "Categoria salvata.",
                  )
                }
              />
              <button
                type="button"
                disabled={i === 0}
                onClick={() => swap("forum_categories", categories, i, -1)}
                aria-label="Sposta su"
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === categories.length - 1}
                onClick={() => swap("forum_categories", categories, i, 1)}
                aria-label="Sposta giù"
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  window.confirm(
                    `Eliminare la categoria ${c.name} con tutte le sue sezioni e discussioni?`,
                  ) &&
                  run(
                    supabase.from("forum_categories").delete().eq("id", c.id),
                    "Categoria eliminata.",
                  )
                }
                className="px-1 text-xs text-red-400 hover:text-red-300"
              >
                Elimina
              </button>
            </div>
            <ul className="space-y-2 pl-4">
              {secs.map((s, k) => (
                <SectionRow
                  key={s.id}
                  section={s}
                  houses={houses}
                  first={k === 0}
                  last={k === secs.length - 1}
                  onMove={(d) => swap("forum_sections", secs, k, d)}
                  onSave={(v) =>
                    run(
                      supabase.from("forum_sections").update(v).eq("id", s.id),
                      "Sezione salvata.",
                    )
                  }
                  onDelete={() =>
                    window.confirm(
                      `Eliminare la sezione ${s.name} con tutte le sue discussioni?`,
                    ) &&
                    run(
                      supabase.from("forum_sections").delete().eq("id", s.id),
                      "Sezione eliminata.",
                    )
                  }
                />
              ))}
              <li>
                <AddInput
                  placeholder="Nuova sezione"
                  onAdd={(name) =>
                    run(
                      supabase.from("forum_sections").insert({
                        category_id: c.id,
                        name,
                        sort_order: secs.length + 1,
                      }),
                      "Sezione aggiunta.",
                    )
                  }
                />
              </li>
            </ul>
          </section>
        );
      })}
      <AddInput
        placeholder="Nuova categoria"
        value={newCat}
        setValue={setNewCat}
        onAdd={(name) =>
          run(
            supabase
              .from("forum_categories")
              .insert({ name, sort_order: categories.length + 1 }),
            "Categoria aggiunta.",
          )
        }
      />
    </div>
  );
}

function NameInput({
  value,
  label,
  onSave,
}: {
  value: string;
  label: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        maxLength={60}
        aria-label={label}
        className="input flex-1 py-1 text-sm font-semibold"
      />
      <button
        type="button"
        disabled={!v.trim() || v.trim() === value}
        onClick={() => onSave(v.trim())}
        className="btn px-2 py-1 text-xs"
      >
        Salva
      </button>
    </>
  );
}

function AddInput({
  placeholder,
  onAdd,
  value,
  setValue,
}: {
  placeholder: string;
  onAdd: (name: string) => Promise<boolean>;
  value?: string;
  setValue?: (v: string) => void;
}) {
  const [own, setOwn] = useState("");
  const v = value ?? own;
  const set = setValue ?? setOwn;
  return (
    <div className="flex gap-2">
      <input
        value={v}
        onChange={(e) => set(e.target.value)}
        maxLength={80}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input flex-1 py-1.5 text-sm"
      />
      <button
        type="button"
        disabled={!v.trim()}
        onClick={() => onAdd(v.trim()).then((ok) => ok && set(""))}
        className="btn px-3 py-1.5 text-sm"
      >
        Aggiungi
      </button>
    </div>
  );
}

function SectionRow({
  section,
  houses,
  first,
  last,
  onMove,
  onSave,
  onDelete,
}: {
  section: ForumSection;
  houses: House[];
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onSave: (v: Partial<ForumSection>) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState({
    name: section.name,
    description: section.description,
    visibility: section.visibility,
    house_id: section.house_id,
  });
  const changed =
    v.name.trim() !== section.name ||
    v.description !== section.description ||
    v.visibility !== section.visibility ||
    v.house_id !== section.house_id;

  return (
    <li className="space-y-1.5 border-l border-border pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          maxLength={80}
          aria-label="Nome della sezione"
          className="input flex-1 py-1 text-sm"
        />
        <select
          value={v.visibility}
          onChange={(e) =>
            setV({
              ...v,
              visibility: e.target.value as ForumSection["visibility"],
            })
          }
          aria-label="Chi la vede"
          className="input w-36! py-1 text-sm"
        >
          <option value="tutti">Per tutti</option>
          <option value="staff">Solo staff</option>
          <option value="casata">Una casata</option>
        </select>
        {v.visibility === "casata" && (
          <select
            value={v.house_id ?? ""}
            onChange={(e) => setV({ ...v, house_id: e.target.value || null })}
            aria-label="Casata"
            className="input w-40! py-1 text-sm"
          >
            <option value="">— scegli —</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={first}
          onClick={() => onMove(-1)}
          aria-label="Sposta su"
          className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={last}
          onClick={() => onMove(1)}
          aria-label="Sposta giù"
          className="btn-ghost px-2 py-1 text-xs disabled:opacity-30"
        >
          ↓
        </button>
        <button
          type="button"
          disabled={
            !v.name.trim() ||
            !changed ||
            (v.visibility === "casata" && !v.house_id)
          }
          onClick={() =>
            onSave({
              ...v,
              name: v.name.trim(),
              house_id: v.visibility === "casata" ? v.house_id : null,
            })
          }
          className="btn px-2 py-1 text-xs"
        >
          Salva
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-1 text-xs text-red-400 hover:text-red-300"
        >
          Elimina
        </button>
      </div>
      <input
        value={v.description}
        onChange={(e) => setV({ ...v, description: e.target.value })}
        maxLength={300}
        placeholder="Descrizione (facoltativa)"
        aria-label="Descrizione della sezione"
        className="input py-1 text-xs"
      />
    </li>
  );
}
