"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOONS, MOON_DAYS, gameYearNow, moonName } from "@/lib/game-date";

type Ev = {
  id: string;
  year: number;
  month: number | null;
  day: number | null;
  title: string;
  summary: string;
};
type Draft = { id?: string; year: string; month: string; day: string; title: string; summary: string };

const empty = (): Draft => ({ year: String(gameYearNow()), month: "", day: "", title: "", summary: "" });

// Data di gioco dell'evento: "G. 12 - Decima Luna - 363 D.C.", "Decima Luna 363 D.C." o "363 D.C."
const dateLabel = (e: Pick<Ev, "year" | "month" | "day">) =>
  e.month && e.day
    ? `G. ${e.day} - ${moonName(e.month)} - ${e.year} D.C.`
    : e.month
      ? `${moonName(e.month)} ${e.year} D.C.`
      : `${e.year} D.C.`;

// Timeline: gli eventi di gioco in ordine di data ON. Lo staff con il permesso
// "timeline.gestire" aggiunge, corregge e toglie gli eventi
export default function TimelinePanel({ canEdit }: { canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(
    () =>
      supabase
        .from("timeline_events")
        .select("id, year, month, day, title, summary")
        .order("year")
        .order("month", { nullsFirst: true })
        .order("day", { nullsFirst: true })
        .order("created_at")
        .then(({ data, error }) => {
          setFailed(!!error);
          setEvents((data ?? []) as Ev[]);
        }),
    [supabase],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft) return;
    const year = Math.trunc(Number(draft.year));
    const month = draft.month ? Number(draft.month) : null;
    const day = month && draft.day ? Number(draft.day) : null;
    if (!Number.isFinite(year) || !draft.year.trim()) return setError("Scrivi l'anno.");
    if (!draft.title.trim()) return setError("Scrivi il titolo dell'evento.");
    if (month && day && day > MOON_DAYS[month - 1]) return setError(`La ${moonName(month)} ha ${MOON_DAYS[month - 1]} giorni.`);
    setBusy(true);
    setError(null);
    const row = { year, month, day, title: draft.title.trim(), summary: draft.summary.trim(), updated_at: new Date().toISOString() };
    const { error } = draft.id
      ? await supabase.from("timeline_events").update(row).eq("id", draft.id)
      : await supabase.from("timeline_events").insert(row);
    setBusy(false);
    if (error) return setError("Evento non salvato.");
    setDraft(null);
    load();
  }

  async function remove(e: Ev) {
    if (!window.confirm(`Togliere dalla timeline "${e.title}"?`)) return;
    const { error } = await supabase.from("timeline_events").delete().eq("id", e.id);
    if (error) return setError("Evento non tolto.");
    load();
  }

  const text = q.trim().toLowerCase();
  const shown = (events ?? []).filter(
    (e) => !text || e.title.toLowerCase().includes(text) || e.summary.toLowerCase().includes(text) || String(e.year).includes(text),
  );
  // un titoletto per ogni anno
  const years = [...new Set(shown.map((e) => e.year))];

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un evento, un nome o un anno..."
          className="input min-w-0 flex-1 py-1.5"
        />
        {canEdit && !draft && (
          <button type="button" onClick={() => (setDraft(empty()), setError(null))} className="btn px-4 py-1.5 text-sm">
            + Nuovo evento
          </button>
        )}
      </div>

      {draft && (
        <section className="space-y-3 border border-accent/50 bg-black/40 p-3">
          <h3 className="font-serif text-lg text-accent">{draft.id ? "Modifica evento" : "Nuovo evento"}</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Giorno</span>
              <select
                value={draft.day}
                disabled={!draft.month}
                onChange={(e) => setDraft({ ...draft, day: e.target.value })}
                className="input w-20! py-1.5"
              >
                <option value="">—</option>
                {Array.from({ length: draft.month ? MOON_DAYS[Number(draft.month) - 1] : 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Luna</span>
              <select
                value={draft.month}
                onChange={(e) => setDraft({ ...draft, month: e.target.value, day: e.target.value ? draft.day : "" })}
                className="input w-44! py-1.5"
              >
                <option value="">— solo l&apos;anno —</option>
                {MOONS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Anno (D.C.)</span>
              <input
                type="number"
                value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                className="input w-24! py-1.5"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Titolo</span>
            <input
              value={draft.title}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Es. L'assedio di Approdo del Re"
              className="input py-1.5"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Cosa è successo</span>
            <textarea
              value={draft.summary}
              maxLength={4000}
              rows={6}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              className="input text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className="btn px-4 py-1.5 text-sm">
              {busy ? "..." : "Salva"}
            </button>
            <button type="button" onClick={() => (setDraft(null), setError(null))} className="btn-ghost px-4 py-1.5 text-sm">
              Annulla
            </button>
          </div>
        </section>
      )}

      {!draft && error && <p className="text-sm text-red-400">{error}</p>}
      {events === null ? (
        <p className="text-muted">Caricamento...</p>
      ) : failed ? (
        <p className="text-sm text-red-400">La timeline non è ancora pronta (manca la migrazione 0172).</p>
      ) : shown.length === 0 ? (
        <p className="text-muted">{text ? "Nessun evento trovato." : "Ancora nessun evento nella timeline."}</p>
      ) : (
        <div className="space-y-6">
          {years.map((y) => (
            <section key={y}>
              <h3 className="mb-2 font-serif text-2xl tracking-wide text-accent">{y} D.C.</h3>
              {/* linea verticale con un punto per ogni evento */}
              <ol className="relative ml-2 space-y-4 border-l-2 border-accent/40 pl-5">
                {shown
                  .filter((e) => e.year === y)
                  .map((e) => (
                    <li key={e.id} className="relative">
                      <span
                        aria-hidden
                        className="absolute top-1.5 -left-[1.6rem] h-3 w-3 rounded-full border-2 border-accent bg-[#2a1a12]"
                      />
                      <p className="text-xs tracking-[0.14em] text-[#d8c39a] uppercase">{dateLabel(e)}</p>
                      <h4 className="font-serif text-lg leading-tight text-foreground">{e.title}</h4>
                      {e.summary && <p className="mt-1 text-sm whitespace-pre-line text-muted">{e.summary}</p>}
                      {canEdit && (
                        <p className="mt-1 flex gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setDraft({
                                id: e.id,
                                year: String(e.year),
                                month: e.month ? String(e.month) : "",
                                day: e.day ? String(e.day) : "",
                                title: e.title,
                                summary: e.summary,
                              });
                            }}
                            className="text-muted hover:text-accent"
                          >
                            Modifica
                          </button>
                          <button type="button" onClick={() => remove(e)} className="text-red-400 hover:text-red-300">
                            Togli
                          </button>
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
