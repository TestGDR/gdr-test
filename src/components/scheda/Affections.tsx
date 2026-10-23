"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RichEditor from "@/components/guide/RichEditor";
import { createClient } from "@/lib/supabase/client";
import { cleanPlayerHtml } from "./player-html";

type Person = {
  id: string;
  name: string;
  avatar_url: string | null;
  house: { name: string } | null;
};
type Affection = {
  id: string;
  body: string;
  sort_order: number;
  target: Person;
};

const fullName = (p: Person) =>
  p.house ? `${p.name} ${p.house.name}` : p.name;
const PERSON = "id, name, avatar_url, house:houses(name)";
export const AFFECTION_MAX = 10000;

// Affetti: i PG cari al personaggio, con la loro immagine di chat e un testo
// scritto con l'editor. Ogni affetto si modifica con la sua pennina e si salva
// con "Salva". Cliccando un PG si apre la sua scheda
export default function Affections({
  characterId,
  isOwn,
  onOpenSheet,
  sigil = null,
}: {
  characterId: string;
  isOwn: boolean;
  onOpenSheet: (id: string) => void;
  sigil?: string | null; // stemma della casata, in filigrana sullo sfondo
}) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Affection[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      supabase
        .from("character_affections")
        .select(
          `id, body, sort_order, target:characters!character_affections_target_id_fkey(${PERSON})`,
        )
        .eq("character_id", characterId)
        .order("sort_order")
        .order("created_at")
        .then(({ data }) => {
          const rows = ((data ?? []) as unknown as Affection[]).filter(
            (a) => a.target,
          );
          setList(rows);
          return rows;
        }),
    [supabase, characterId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Aggiunto un PG: si apre subito il suo editor
  async function add(p: Person) {
    setError(null);
    const { data, error } = await supabase
      .from("character_affections")
      .insert({
        character_id: characterId,
        target_id: p.id,
        body: "",
        sort_order: (list?.length ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error) return setError("PG non aggiunto.");
    await load();
    setEditingId(data.id as string);
  }

  async function remove(a: Affection) {
    if (!window.confirm(`Togliere ${fullName(a.target)} dagli affetti?`))
      return;
    const { error } = await supabase
      .from("character_affections")
      .delete()
      .eq("id", a.id);
    if (error) return setError("Affetto non tolto.");
    setEditingId(null);
    load();
  }

  // Sposta su o giu' scambiando l'ordine con il vicino
  async function move(i: number, d: -1 | 1) {
    if (!list) return;
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    await Promise.all(
      next.map((a, k) =>
        supabase
          .from("character_affections")
          .update({ sort_order: k })
          .eq("id", a.id),
      ),
    );
  }

  return (
    <div className="affetti-pagina pannello-bronzo relative m-3 min-h-[calc(100%-1.5rem)] overflow-hidden px-4 pt-3 pb-4">
      {sigil && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sigil} alt="" aria-hidden className="pointer-events-none absolute -top-6 -right-16 h-80 w-80 object-contain opacity-[0.18] [mask-image:radial-gradient(circle,black_30%,transparent_68%)]" />
      )}
      <h3 className="relative font-serif text-[1.7rem] leading-tight tracking-wide text-[#e6cdb0] [font-variant:small-caps]">Affetti</h3>
      <div aria-hidden className="relative mb-3 flex items-center gap-2 text-[#c08a4e]">
        <span className="h-px flex-1 bg-gradient-to-r from-[#c08a4e]/20 to-[#c08a4e]" />
        <CrownIcon />
        <span className="h-px flex-1 bg-gradient-to-l from-[#c08a4e]/20 to-[#c08a4e]" />
      </div>
      {isOwn && list && (
        <AddPerson
          characterId={characterId}
          exclude={list.map((a) => a.target.id)}
          onPick={add}
        />
      )}
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {list === null ? (
        <p className="text-muted">Caricamento...</p>
      ) : list.length === 0 ? (
        <p className="text-muted">
          Nessun affetto.{isOwn && " Cerca qui sopra un PG per aggiungerlo."}
        </p>
      ) : (
        <ul className="relative space-y-3">
          {list.map((a, i) => (
            <li key={a.id} className="affetto-scheda relative flex gap-4 py-2.5 pr-3 pl-10">
              {/* fascia rossa con la stella */}
              <span aria-hidden className="affetto-fascia absolute inset-y-0 left-0 flex w-7 items-center justify-center text-[#e0c08a]">
                ✦
              </span>
              <button
                type="button"
                onClick={() => onOpenSheet(a.target.id)}
                title={`Apri la scheda di ${fullName(a.target)}`}
                className="cornice-ritratto shrink-0 self-start"
              >
                <Avatar person={a.target} />
              </button>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenSheet(a.target.id)}
                      className="text-left font-serif text-xl tracking-wide text-[#e6cdb0] [font-variant:small-caps] hover:text-[#f6e6c8]"
                    >
                      {fullName(a.target)}
                    </button>
                    <div aria-hidden className="mt-1 flex w-60 max-w-full items-center gap-1.5 text-[#c08a4e]">
                      <span className="h-px flex-1 bg-gradient-to-r from-[#c08a4e]/30 to-[#c08a4e]" />
                      <span className="text-[0.6rem]">❖</span>
                      <span className="h-px flex-1 bg-gradient-to-l from-[#c08a4e]/30 to-[#c08a4e]" />
                    </div>
                  </div>
                  {isOwn && editingId !== a.id && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        aria-label="Sposta su"
                        className="affetto-tasto"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i === list.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label="Sposta giù"
                        className="affetto-tasto"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(a.id)}
                        aria-label={`Modifica l'affetto per ${fullName(a.target)}`}
                        title="Modifica"
                        className="affetto-tasto"
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
                          <path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L9 19l-4 1 1-4Z" />
                          <path d="M15.5 6.5l3 3" />
                        </svg>
                      </button>
                    </span>
                  )}
                </div>
                {editingId === a.id ? (
                  <AffectionEditor
                    affection={a}
                    onDone={(saved) => {
                      setEditingId(null);
                      if (saved) load();
                    }}
                    onRemove={() => remove(a)}
                  />
                ) : (
                  <AffectionText body={a.body} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 28 22" width="26" height="20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      <path d="M4 17 2.5 6.5l6 5L14 3l5.5 8.5 6-5L24 17Z" fill="rgb(192 138 78 / 0.15)" />
      <path d="M4 20h20M4 17h20" />
      <circle cx="14" cy="3" r="1.2" fill="currentColor" />
    </svg>
  );
}

function AffectionText({ body }: { body: string }) {
  const clean = useMemo(() => cleanPlayerHtml(body), [body]);
  if (!clean.trim()) return null;
  // contain: paint tiene dentro la pagina anche gli stili scritti dal giocatore
  return (
    <div
      className="guide-content mt-2 overflow-hidden text-sm text-[#e4dccf] [contain:paint]"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

// Testo di un affetto: editor di testo, poi Salva
function AffectionEditor({
  affection,
  onDone,
  onRemove,
}: {
  affection: Affection;
  onDone: (saved: boolean) => void;
  onRemove: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [body, setBody] = useState(affection.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (body.length > AFFECTION_MAX) return setError("Testo troppo lungo.");
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("character_affections")
      .update({ body: body.trim() })
      .eq("id", affection.id);
    setBusy(false);
    if (error) return setError("Affetto non salvato.");
    onDone(true);
  }

  return (
    <div className="mt-2 space-y-2">
      <RichEditor value={body} onChange={setBody} />
      <p className="text-xs text-muted">
        {body.length.toLocaleString("it-IT")} /{" "}
        {AFFECTION_MAX.toLocaleString("it-IT")} caratteri
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="btn px-4 py-1.5 text-sm"
        >
          {busy ? "Salvataggio..." : "Salva"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDone(false)}
          className="btn-ghost px-4 py-1.5 text-sm"
        >
          Annulla
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="ml-auto text-sm text-red-400 hover:text-red-300"
        >
          Togli dagli affetti
        </button>
      </div>
    </div>
  );
}

function Avatar({
  person,
  small = false,
}: {
  person: Person;
  small?: boolean;
}) {
  const size = small ? "h-10 w-10" : "h-[132px] w-[116px]";
  return person.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={person.avatar_url}
      alt=""
      className={`${size} border border-[#3a2c2a] object-cover`}
    />
  ) : (
    <span
      className={`${size} flex items-center justify-center border border-[#3a2c2a] bg-black/40 font-serif text-2xl text-accent`}
    >
      {person.name[0]}
    </span>
  );
}

// Ricerca per nome e/o cognome (= casata), di qualsiasi PG anche non ancora
// attivo; escluso questo e quelli gia' negli affetti. Ogni parola scritta deve
// comparire nel nome completo (es. "dae targ" trova Daemon Targaryen)
function AddPerson({
  characterId,
  exclude,
  onPick,
}: {
  characterId: string;
  exclude: string[];
  onPick: (p: Person) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; list: Person[] }>({
    q: "",
    list: [],
  });

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[%_,()]/g, ""))
      .filter(Boolean);
    const t = setTimeout(async () => {
      const byName = words.map((w) => `name.ilike.%${w}%`).join(",");
      const { data: houses } = await supabase
        .from("houses")
        .select("id")
        .or(byName);
      const houseIds = (houses ?? []).map((h) => h.id as string);
      const { data } = await supabase
        .from("characters")
        .select(PERSON)
        .neq("id", characterId)
        .or(
          houseIds.length
            ? `${byName},house_id.in.(${houseIds.join(",")})`
            : byName,
        )
        .order("name")
        .limit(50);
      const list = ((data ?? []) as unknown as Person[]).filter((p) =>
        words.every((w) => fullName(p).toLowerCase().includes(w)),
      );
      setFound({ q: text, list: list.slice(0, 8) });
    }, 250);
    return () => clearTimeout(t);
  }, [q, supabase, characterId]);

  const searched = q.trim().length >= 2 && found.q === q.trim();
  const shown =
    q.trim().length < 2
      ? []
      : found.list.filter((p) => !exclude.includes(p.id));

  return (
    <div className="relative mb-4 flex gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Aggiungi un PG: scrivi nome o cognome..."
        aria-label="Cerca un PG da aggiungere"
        className="missiva-input min-w-0 flex-1 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={shown.length === 0}
        onClick={() => {
          const p = shown[0];
          if (!p) return;
          setQ("");
          onPick(p);
        }}
        title={shown[0] ? `Aggiungi ${fullName(shown[0])}` : "Scrivi un nome per cercare"}
        aria-label="Aggiungi il primo PG trovato"
        className="affetto-tasto h-10! w-12! text-2xl"
      >
        +
      </button>
      {searched && shown.length === 0 && (
        <p className="absolute inset-x-0 top-full z-10 border border-border bg-panel px-3 py-2 text-sm text-muted shadow-xl shadow-black">
          Nessun PG trovato.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 max-h-64 overflow-y-auto border border-border bg-panel shadow-xl shadow-black">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  onPick(p);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-blood/20"
              >
                <Avatar person={p} small />
                <span className="font-serif text-accent">{fullName(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
