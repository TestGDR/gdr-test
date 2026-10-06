"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";

type Roll = {
  id: string;
  roll: number;
  sides: number;
  seen: boolean;
  created_at?: string;
};
type Report = {
  id: string;
  roll_id: string;
  character_id: string;
  author_name: string;
  participant_names: string;
  zone_name: string;
  summary: string;
  status: "attesa" | "approvato" | "rifiutato";
  published_text: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  roll?: { roll: number; sides: number } | null;
};
type Place = { id: string; name: string };
type Pg = { id: string; name: string; house: { name: string } | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const pgName = (p: Pg) => (p.house ? `${p.name} ${p.house.name}` : p.name);

// Voci e pettegolezzi: le voci approvate, il tiro di fine giocata e, per i
// master, i pettegolezzi da approvare
export default function GossipPanel({
  character,
  canReview,
}: {
  character: MainCharacter | null;
  canReview: boolean;
}) {
  const [tab, setTab] = useState<"voci" | "fine" | "mie" | "master">("voci");
  const tabs = [
    { id: "voci" as const, label: "Voci che girano" },
    { id: "fine" as const, label: "Fine giocata" },
    { id: "mie" as const, label: "I miei pettegolezzi" },
    ...(canReview ? [{ id: "master" as const, label: "Da approvare" }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border px-3 py-1 text-xs font-semibold tracking-[0.14em] uppercase ${
              tab === t.id
                ? "border-accent bg-blood/20 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "voci" && <Rumors />}
      {tab === "fine" && (
        <EndOfPlay character={character} onSent={() => setTab("mie")} />
      )}
      {tab === "mie" && <MyReports character={character} />}
      {tab === "master" && canReview && <Review />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Voci che girano (approvate)
// ---------------------------------------------------------------------
function Rumors() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Report[] | null>(null);
  useEffect(() => {
    supabase
      .from("gossip_reports")
      .select("*")
      .eq("status", "approvato")
      .order("reviewed_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setList((data ?? []) as Report[]));
  }, [supabase]);

  if (list === null)
    return <p className="text-sm text-muted">Caricamento...</p>;
  if (list.length === 0)
    return (
      <p className="py-6 text-center text-muted">
        Per ora non gira nessuna voce.
      </p>
    );
  return (
    <ul className="space-y-3">
      {list.map((r) => (
        <li
          key={r.id}
          className="border-l-2 border-accent/60 bg-black/30 px-3 py-2"
        >
          <p className="text-sm whitespace-pre-line text-[#f2e7c9] italic">
            «{r.published_text}»
          </p>
          <p className="mt-1 text-xs text-muted">
            {r.zone_name} · {when(r.reviewed_at ?? r.created_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------
// Fine giocata: tiro del dado e, se notati, il pettegolezzo
// ---------------------------------------------------------------------
function EndOfPlay({
  character,
  onSent,
}: {
  character: MainCharacter | null;
  onSent: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  // tiro "notati" ancora senza pettegolezzo (resta finche' non lo si scrive)
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [result, setResult] = useState<"notati" | "non-notati" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = character?.status === "attivo";

  useEffect(() => {
    if (!character) return;
    supabase
      .rpc("gossip_pending", { p_character: character.id })
      .then(({ data }) => setPending((data as string | null) ?? null));
  }, [supabase, character]);

  // Il numero uscito non si mostra: solo se si e' stati notati o no
  async function roll() {
    if (!character) return;
    if (
      !window.confirm(
        "Tirare il dado di fine giocata? Il tiro resta registrato.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("gossip_roll", {
      p_character: character.id,
    });
    setBusy(false);
    if (error) return setError("Tiro non riuscito.");
    const r = ((data as { id: string; seen: boolean }[] | null) ?? [])[0];
    if (!r) return setError("Tiro non riuscito.");
    setResult(r.seen ? "notati" : "non-notati");
    if (r.seen) setPending(r.id);
  }

  if (!active)
    return (
      <p className="py-6 text-center text-muted">
        Serve un personaggio attivo.
      </p>
    );
  if (pending === undefined)
    return <p className="text-sm text-muted">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        A fine giocata, come dice il regolamento, uno dei PG partecipanti tira
        il dado. Se siete stati notati bisogna scrivere un breve riassunto della
        giocata: diventerà un pettegolezzo, dopo il controllo dei master. Se
        nessuno vi ha visti non serve altro.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div
          className={`border px-4 py-3 text-center ${
            result === "notati"
              ? "border-[#d4a72c]/60 bg-[#d4a72c]/10"
              : "border-green-700/60 bg-green-900/20"
          }`}
        >
          <p className="font-serif text-2xl text-accent">
            {result === "notati"
              ? "Siete stati notati"
              : "Nessuno vi ha notati"}
          </p>
          <p className="mt-1 text-sm">
            {result === "notati"
              ? "Scrivete cosa si è visto della giocata."
              : "La giocata resta riservata."}
          </p>
        </div>
      )}

      {pending ? (
        <ReportForm character={character!} rollId={pending} onSent={onSent} />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={roll}
          className="btn px-6 py-2 tracking-[0.14em] uppercase"
        >
          {busy ? "Tiro..." : "Tira il dado"}
        </button>
      )}
    </div>
  );
}

function ReportForm({
  character,
  rollId,
  onSent,
}: {
  character: MainCharacter;
  rollId: string;
  onSent: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [places, setPlaces] = useState<Place[]>([]);
  const [rooms, setRooms] = useState<Place[]>([]);
  const [location, setLocation] = useState("");
  const [room, setRoom] = useState("");
  const [summary, setSummary] = useState("");
  const [others, setOthers] = useState<Pg[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Pg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .then(({ data }) => setPlaces((data ?? []) as Place[]));
  }, [supabase]);

  useEffect(() => {
    if (!location) return;
    supabase
      .from("rooms")
      .select("id, name")
      .eq("location_id", location)
      .order("sort_order")
      .order("name")
      .then(({ data }) => setRooms((data ?? []) as Place[]));
  }, [supabase, location]);

  useEffect(() => {
    const text = q.trim().replace(/[%_,()]/g, "");
    if (text.length < 2) return;
    const t = setTimeout(() => {
      supabase
        .from("characters")
        .select("id, name, house:houses(name)")
        .eq("status", "attivo")
        .neq("id", character.id)
        .ilike("name", `%${text}%`)
        .order("name")
        .limit(8)
        .then(({ data }) => setFound((data ?? []) as unknown as Pg[]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, supabase, character.id]);

  async function send() {
    setError(null);
    if (!location) return setError("Scegli la zona della giocata.");
    if (summary.trim().length < 10)
      return setError("Scrivi un breve riassunto (almeno 10 caratteri).");
    setBusy(true);
    const { error } = await supabase.rpc("gossip_report", {
      p_roll: rollId,
      p_summary: summary,
      p_location: location,
      p_room: room || null,
      p_participants: others.map((o) => o.id),
    });
    setBusy(false);
    if (error)
      return setError(
        error.message.length < 120
          ? error.message
          : "Pettegolezzo non inviato.",
      );
    onSent();
  }

  return (
    <div className="space-y-3 border border-[#d4a72c]/50 bg-black/30 p-3">
      <p className="text-sm text-[#f0c75e]">
        Siete stati notati: scrivete cosa si è visto. Il pettegolezzo apre un
        ticket verso la gestione.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Zona (macroarea)
          </span>
          <select
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setRoom("");
              setRooms([]);
            }}
            className="input py-1.5"
          >
            <option value="">— scegli —</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Chat (facoltativa)
          </span>
          <select
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            disabled={!location}
            className="input py-1.5"
          >
            <option value="">—</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Altri PG presenti
        </span>
        <div className="mb-1 flex flex-wrap gap-1.5">
          <span className="border border-accent/50 px-2 py-0.5 text-xs text-accent">
            {character.name}
          </span>
          {others.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOthers((l) => l.filter((x) => x.id !== o.id))}
              title="Togli"
              className="border border-border px-2 py-0.5 text-xs hover:border-red-400"
            >
              {pgName(o)} ✕
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Aggiungi un PG: scrivi il nome..."
            aria-label="Cerca un PG presente"
            className="input py-1.5 text-sm"
          />
          {q.trim().length >= 2 &&
            found.filter((f) => !others.some((o) => o.id === f.id)).length >
              0 && (
              <ul className="absolute inset-x-0 top-full z-10 max-h-48 overflow-y-auto border border-border bg-panel shadow-xl shadow-black">
                {found
                  .filter((f) => !others.some((o) => o.id === f.id))
                  .map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOthers((l) => [...l, f]);
                          setQ("");
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-blood/20"
                      >
                        {pgName(f)}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Breve riassunto della giocata
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={2000}
          rows={5}
          className="input resize-y text-sm"
        />
        <span className="text-xs text-muted">{summary.length} / 2.000</span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={send}
        className="btn px-5 py-1.5 text-sm"
      >
        {busy ? "Invio..." : "Manda il pettegolezzo alla gestione"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// I miei pettegolezzi (anche quelli in cui sono tra i presenti)
// ---------------------------------------------------------------------
const STATUS = {
  attesa: "In attesa dei master",
  approvato: "Approvato",
  rifiutato: "Non approvato",
} as const;

function MyReports({ character }: { character: MainCharacter | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Report[] | null>(null);
  useEffect(() => {
    if (!character) return;
    supabase
      .from("gossip_reports")
      .select("*")
      .or(`character_id.eq.${character.id},participants.cs.{${character.id}}`)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setList((data ?? []) as Report[]));
  }, [supabase, character]);

  if (!character)
    return <p className="py-6 text-center text-muted">Serve un personaggio.</p>;
  if (list === null)
    return <p className="text-sm text-muted">Caricamento...</p>;
  if (list.length === 0)
    return <p className="py-6 text-center text-muted">Nessun pettegolezzo.</p>;
  return (
    <ul className="space-y-2">
      {list.map((r) => (
        <li
          key={r.id}
          className="border border-border/60 bg-black/30 px-3 py-2 text-sm"
        >
          <p className="flex flex-wrap justify-between gap-2 text-xs">
            <span className="text-muted">
              {r.zone_name} · {when(r.created_at)} · di {r.author_name}
            </span>
            <span
              className={
                r.status === "approvato"
                  ? "text-green-400"
                  : r.status === "rifiutato"
                    ? "text-red-400"
                    : "text-[#f0c75e]"
              }
            >
              {STATUS[r.status]}
            </span>
          </p>
          <p className="mt-1 whitespace-pre-line">
            {r.status === "approvato" ? r.published_text : r.summary}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------
// Master: da approvare (anche modificando), ultimi tiri, dado e soglia
// ---------------------------------------------------------------------
function Review() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Report[] | null>(null);
  const [rolls, setRolls] = useState<
    (Roll & { character: { name: string } | null })[]
  >([]);
  const [showRolls, setShowRolls] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([
        supabase
          .from("gossip_reports")
          .select("*, roll:gossip_rolls(roll, sides)")
          .eq("status", "attesa")
          .order("created_at"),
        supabase
          .from("gossip_rolls")
          .select(
            "id, roll, sides, seen, created_at, character:characters(name)",
          )
          .order("created_at", { ascending: false })
          .limit(40),
      ]).then(([r, t]) => {
        setList((r.data ?? []) as Report[]);
        setRolls(
          (t.data ?? []) as unknown as (Roll & {
            character: { name: string } | null;
          })[],
        );
      }),
    [supabase],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <DiceSettings />
      {list === null ? (
        <p className="text-sm text-muted">Caricamento...</p>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-muted">
          Nessun pettegolezzo da approvare.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <ReviewItem key={r.id} report={r} onDone={load} />
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          onClick={() => setShowRolls((s) => !s)}
          className="text-xs text-muted hover:text-accent"
        >
          {showRolls ? "▲ Nascondi" : "▼ Mostra"} gli ultimi tiri di fine
          giocata
        </button>
        {showRolls && (
          <ul className="mt-2 space-y-0.5 text-xs">
            {rolls.map((t) => (
              <li
                key={t.id}
                className="flex justify-between gap-2 border-b border-border/40 py-1"
              >
                <span>
                  {t.character?.name ?? "?"} ·{" "}
                  {t.created_at && when(t.created_at)}
                </span>
                <span className={t.seen ? "text-[#f0c75e]" : "text-muted"}>
                  {t.roll} su d{t.sides} · {t.seen ? "notati" : "non notati"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReviewItem({
  report,
  onDone,
}: {
  report: Report;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState(report.summary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(approve: boolean) {
    if (!approve && !window.confirm("Non approvare questo pettegolezzo?"))
      return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("gossip_review", {
      p_report: report.id,
      p_approve: approve,
      p_text: text,
    });
    setBusy(false);
    if (error) return setError("Operazione non riuscita.");
    onDone();
  }

  return (
    <li className="space-y-2 border border-border/60 bg-black/30 p-3">
      <p className="text-xs text-muted">
        <strong className="text-accent">{report.author_name}</strong>
        {report.participant_names && ` con ${report.participant_names}`} ·{" "}
        {report.zone_name} · {when(report.created_at)}
        {report.roll && ` · dado ${report.roll.roll} su d${report.roll.sides}`}
      </p>
      <p className="text-xs text-muted">
        Riassunto del giocatore (lo puoi modificare: diventa il testo della
        voce):
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={4}
        className="input resize-y text-sm"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => review(true)}
          className="btn px-4 py-1.5 text-sm"
        >
          Approva
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => review(false)}
          className="btn-ghost px-4 py-1.5 text-sm text-red-400"
        >
          Non approvare
        </button>
      </div>
    </li>
  );
}

function DiceSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [v, setV] = useState<{ die_sides: number; seen_from: number } | null>(
    null,
  );
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("gossip_settings")
      .select("die_sides, seen_from")
      .maybeSingle()
      .then(({ data }) =>
        setV(
          (data as { die_sides: number; seen_from: number } | null) ?? {
            die_sides: 20,
            seen_from: 11,
          },
        ),
      );
  }, [supabase]);

  if (!v) return null;
  async function save() {
    if (!v) return;
    const { error } = await supabase
      .from("gossip_settings")
      .update(v)
      .eq("id", true);
    setMsg(error ? "Non salvato." : "Salvato.");
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border border-dashed border-border p-2 text-xs">
      <label className="flex items-center gap-1 text-muted">
        Dado d
        <input
          type="number"
          min={2}
          max={100}
          value={v.die_sides}
          onChange={(e) =>
            setV({
              ...v,
              die_sides: Math.min(
                100,
                Math.max(2, Number(e.target.value) || 2),
              ),
            })
          }
          className="input w-16! py-1 text-sm"
        />
      </label>
      <label className="flex items-center gap-1 text-muted">
        notati con
        <input
          type="number"
          min={1}
          max={100}
          value={v.seen_from}
          onChange={(e) =>
            setV({
              ...v,
              seen_from: Math.min(
                100,
                Math.max(1, Number(e.target.value) || 1),
              ),
            })
          }
          className="input w-16! py-1 text-sm"
        />
        o più
      </label>
      <span className="text-muted">
        ={" "}
        <strong className="text-accent">
          {Math.round(
            (Math.max(0, v.die_sides - v.seen_from + 1) / v.die_sides) * 100,
          )}
          %
        </strong>{" "}
        di essere notati
      </span>
      <button type="button" onClick={save} className="btn px-2 py-1 text-xs">
        Salva
      </button>
      {msg && <span className="text-muted">{msg}</span>}
    </div>
  );
}

// Per chi approva i pettegolezzi: quanti sono in attesa (l'icona si accende).
// Si ricontrolla ogni 30 secondi e quando si chiude il pannello
export function useGossipPending(canReview: boolean, panelOpen: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!canReview || panelOpen) return;
    const check = () =>
      supabase
        .from("gossip_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "attesa")
        .then(({ count }) => setCount(count ?? 0));
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [supabase, canReview, panelOpen]);
  return canReview ? count : 0;
}
