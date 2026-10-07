"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import { PaperRow } from "./PaperSheet";

type Pregnancy = {
  id: string;
  started_at: string;
  twins: boolean;
  status: "in_corso" | "conclusa" | "interrotta";
  birth_roll: number | null;
  birth_easy: boolean | null;
};
type Day = { day: string; month: number; symptom: string | null };
type Roll = {
  roll: number;
  success: boolean;
  twins_roll: number | null;
  twins: boolean | null;
};

// Fasi della gravidanza: ogni mese ON dura un mese reale
const PHASES: Record<number, string> = {
  1: "Inizio della gravidanza e comparsa dei primi sintomi.",
  2: "Sviluppo della gravidanza e sintomi più evidenti.",
  3: "Fase avanzata della gestazione.",
  4: "Fase finale e preparazione al parto.",
};

const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }); // AAAA-MM-GG

// Mese ON (1-4) dalla data di inizio, come nel database
function monthOf(started: string) {
  const s = new Date(started);
  const n = new Date();
  let m =
    (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth());
  if (n.getDate() < s.getDate()) m -= 1;
  return Math.min(4, Math.max(1, m + 1));
}

function addMonths(iso: string, months: number) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}

// Riga "Gravidanza" della pagina Dati (solo PG femminili): Si'/No, la fase
// e, passando il mouse sulla fase, i sintomi. La proprietaria tenta la gravidanza
export default function PregnancyRow({
  character,
  isOwn,
}: {
  character: Character;
  isOwn: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [active, setActive] = useState<Pregnancy | null | undefined>(undefined);
  const [day, setDay] = useState<Day | null>(null);
  const [symptoms, setSymptoms] = useState<{ month: number; label: string }[]>(
    [],
  );
  const [triedToday, setTriedToday] = useState(false);
  const [result, setResult] = useState<Roll | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // vede tutto: proprietaria, admin e chi ha "schede.gravidanze" (moderatori);
  // gli altri vedono la gravidanza solo dal 3° mese ON
  const [full, setFull] = useState(isOwn);
  useEffect(() => {
    if (isOwn) return;
    supabase
      .rpc("pregnancy_full_view", { p_character: character.id })
      .then(({ data }) => setFull(data === true));
  }, [supabase, character.id, isOwn]);

  const load = useCallback(async () => {
    const [{ data: preg }, { data: attempts }, { data: list }] =
      await Promise.all([
        supabase
          .from("pregnancies")
          .select("id, started_at, twins, status, birth_roll, birth_easy")
          .eq("character_id", character.id)
          .eq("status", "in_corso")
          .maybeSingle<Pregnancy>(),
        supabase
          .from("pregnancy_attempts")
          .select("created_at")
          .eq("character_id", character.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("pregnancy_symptoms")
          .select("month, label")
          .order("month")
          .order("sort_order"),
      ]);
    setSymptoms((list as { month: number; label: string }[] | null) ?? []);
    const last = attempts?.[0]?.created_at as string | undefined;
    setTriedToday(
      !!last &&
        new Date(last).toLocaleDateString("sv-SE", {
          timeZone: "Europe/Rome",
        }) === today(),
    );
    if (preg) {
      const { data: d } = await supabase
        .from("pregnancy_days")
        .select("day, month, symptom")
        .eq("pregnancy_id", preg.id)
        .eq("day", today())
        .maybeSingle<Day>();
      setDay(d ?? null);
    } else setDay(null);
    setActive(preg ?? null);
  }, [supabase, character.id]);

  useEffect(() => {
    // caricamento asincrono (lo stato si aggiorna dopo le richieste)
    Promise.resolve().then(load);
  }, [load]);

  async function attempt() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("pregnancy_attempt", {
      p_character: character.id,
    });
    setBusy(false);
    if (error)
      return setError(
        error.message.length < 140 ? error.message : "Tentativo non riuscito.",
      );
    const r = ((data as Roll[] | null) ?? [])[0] ?? null;
    setResult(r);
    // primo controllo dei sintomi (e messaggio di SISTEMA) subito
    if (r?.success)
      await supabase.rpc("pregnancy_tick", { p_character: character.id });
    load();
  }

  if (active === undefined) return <PaperRow label="Gravidanza" value="..." />;

  const month = active ? monthOf(active.started_at) : 0;
  // per chi non vede tutto: niente Si'/No prima del 3° mese ON
  const shown = active && (full || month >= 3) ? active : null;
  const monthSymptoms = symptoms.filter((s) => s.month === month);

  return (
    <div>
      <PaperRow
        label="Gravidanza"
        wrap
        value={
          shown ? (
            <span
              className="relative inline-block"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              Sì ·{" "}
              <button
                ref={setAnchor}
                type="button"
                onClick={() => setOpen((o) => !o)}
                onBlur={() => setOpen(false)}
                aria-expanded={open}
                className="font-semibold text-[#7a1d16] underline decoration-dotted underline-offset-2"
              >
                {month}° mese ON{shown.twins ? " · gemellare" : ""}
              </button>
              {open && anchor && (
                <FloatingTip anchor={anchor}>
                  <span className="block font-serif text-sm font-semibold text-[#7a1d16]">
                    {month}° mese ON
                    {shown.twins ? " · gravidanza gemellare" : ""}
                  </span>
                  <span className="mt-1 block italic">{PHASES[month]}</span>
                  <span className="mt-2 block font-semibold">
                    Sintomi possibili:
                  </span>
                  <span className="block">
                    {monthSymptoms.map((s) => (
                      <span key={s.label} className="block">
                        • {s.label}
                      </span>
                    ))}
                  </span>
                  {full && (
                    <span className="mt-2 block border-t border-[#3b2a1a]/25 pt-2">
                      <strong>Oggi:</strong>{" "}
                      {day
                        ? day.symptom
                          ? day.symptom
                          : "nessun sintomo"
                        : "controllo non ancora fatto"}
                    </span>
                  )}
                  <span className="mt-1 block">
                    <strong>Parto:</strong> dal {addMonths(shown.started_at, 4)}
                  </span>
                  <span className="mt-1 block text-[0.7rem] text-[#6b5640]">
                    Al parto il sistema tira il D100 del parto (01-50 facile) e un D100 per ogni neonato (01-50 femmina, 51-100 maschio).
                  </span>
                </FloatingTip>
              )}
            </span>
          ) : full ? (
            "No"
          ) : (
            "—"
          )
        }
        right={
          isOwn &&
          !active &&
          !result?.success && (
            <button
              type="button"
              disabled={busy || triedToday}
              onClick={attempt}
              title={
                triedToday
                  ? "Hai già tentato oggi: potrai riprovare domani."
                  : undefined
              }
              className="border border-[#7a1d16]/60 px-2 py-1 font-serif text-xs text-[#7a1d16] transition hover:bg-[#7a1d16]/10 disabled:opacity-50"
            >
              {busy
                ? "..."
                : triedToday
                  ? "Riprova domani"
                  : "Tenta la gravidanza"}
            </button>
          )
        }
      />
      {(result || error) && (
        <div className="mb-2 ml-9 space-y-1 bg-[#3b2a1a]/10 px-3 py-2 text-sm text-[#2a1d12]">
          {error && <p className="text-[#7a1d16]">{error}</p>}
          {result && (
            <>
              <p>
                🎲 D100: <strong>{result.roll}</strong> — Esito:{" "}
                <strong>
                  {result.success
                    ? "Gravidanza riuscita."
                    : "Gravidanza non riuscita."}
                </strong>
              </p>
              {result.success && result.twins_roll !== null && (
                <p>
                  🎲 D100: <strong>{result.twins_roll}</strong> — Esito:{" "}
                  <strong>
                    {result.twins
                      ? "Gravidanza gemellare."
                      : "Gravidanza singola."}
                  </strong>
                </p>
              )}
              {!result.success && (
                <p className="text-xs text-[#6b5640]">
                  Potrai tentare di nuovo da domani.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Riquadro sopra tutta la scheda (dentro la finestra, quindi non lo taglia
// niente), in alto rispetto alla voce: si legge senza scorrere
function FloatingTip({
  anchor,
  children,
}: {
  anchor: HTMLElement;
  children: ReactNode;
}) {
  const host = anchor.closest("dialog") ?? document.body;
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fixed = host === document.body;
    const h = fixed
      ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
      : host.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    const top = Math.max(8, a.top - h.top - t.height - 8);
    const left = Math.max(8, Math.min(a.left - h.left, h.width - t.width - 8));
    el.style.position = fixed ? "fixed" : "absolute";
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  }, [anchor, host]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ position: "absolute", top: 0, left: 0, visibility: "hidden" }}
      className="pointer-events-none z-50 block w-80 max-w-[calc(100%-1rem)] border border-[#3b2a1a]/50 bg-[#efe2c4] p-3 text-left text-xs leading-relaxed whitespace-normal text-[#2a1d12] shadow-xl shadow-black/60"
    >
      {children}
    </div>,
    host,
  );
}
