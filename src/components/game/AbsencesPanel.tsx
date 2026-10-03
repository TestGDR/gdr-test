"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MainCharacter } from "@/lib/main-character";

type Absence = {
  id: string;
  author_id: string;
  from_date: string;
  to_date: string;
  note: string;
  character: { name: string } | null;
};

// Data di oggi (fuso italiano) nel formato AAAA-MM-GG
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" });

// Assenze: ognuno segna le proprie, tutti vedono quelle in corso e future
export default function AbsencesPanel({
  userId,
  character,
  canManage,
}: {
  userId: string;
  character: MainCharacter | null;
  canManage: boolean; // staff: puo' togliere anche le assenze altrui
}) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Absence[] | null>(null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      supabase
        .from("absences")
        .select("id, author_id, from_date, to_date, note, character:characters(name)")
        .gte("to_date", today())
        .order("from_date")
        .then(({ data }) => (data ?? []) as unknown as Absence[]),
    [supabase],
  );

  useEffect(() => {
    load().then(setList);
  }, [load]);

  async function add() {
    if (!character) return;
    if (to < from) return setError("La data di ritorno viene prima di quella di partenza.");
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("absences")
      .insert({ character_id: character.id, from_date: from, to_date: to, note: note.trim().slice(0, 300) });
    setBusy(false);
    if (error) return setError("Assenza non salvata (al massimo un anno).");
    setNote("");
    load().then(setList);
  }

  async function remove(a: Absence) {
    if (!window.confirm("Togliere questa assenza?")) return;
    const { error } = await supabase.from("absences").delete().eq("id", a.id);
    if (error) setError("Assenza non tolta.");
    else setList((l) => l?.filter((x) => x.id !== a.id) ?? null);
  }

  const now = today();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Se starai via per un po&apos;, segnalo qui: gli altri giocatori sapranno quando torni.</p>

      {character && (
        <div className="space-y-2 border border-border bg-black/40 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="assenza-dal" className="text-muted">
              Dal
            </label>
            <input id="assenza-dal" type="date" value={from} min={now} onChange={(e) => setFrom(e.target.value)} className="input w-40! py-1.5" />
            <label htmlFor="assenza-al" className="text-muted">
              al
            </label>
            <input id="assenza-al" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input w-40! py-1.5" />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Nota (facoltativa): es. in vacanza, posso rispondere ai messaggi"
            aria-label="Nota"
            className="input py-1.5 text-sm"
          />
          <button type="button" disabled={busy} onClick={add} className="btn px-3 py-1.5 text-sm">
            Segna l&apos;assenza
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {list === null && <p className="text-sm text-muted">Caricamento...</p>}
      {list?.length === 0 && <p className="py-6 text-center text-muted">Nessuna assenza segnalata.</p>}
      <ul className="divide-y divide-border/60 border border-border/60">
        {list?.map((a) => {
          const current = a.from_date <= now;
          return (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-serif text-accent">{a.character?.name ?? "Personaggio"}</span>
              <span>
                {a.from_date === a.to_date ? day(a.from_date) : `dal ${day(a.from_date)} al ${day(a.to_date)}`}
              </span>
              {current && <span className="text-xs text-orange-300">assente ora</span>}
              {(a.author_id === userId || canManage) && (
                <button type="button" onClick={() => remove(a)} className="ml-auto text-xs text-red-400 hover:text-red-300">
                  Togli
                </button>
              )}
              {a.note && <span className="w-full text-muted">{a.note}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
