"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { FAME_MAX, FAME_MIN, FAME_SCALE, fameTitle, fameTone, signedFame } from "@/lib/fame";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";

type Entry = { id: number; delta: number; fame_after: number; reason: string; by_name: string; created_at: string };

// Riquadro della Fama nella scheda (accanto ai PX). Tutti vedono il titolo;
// il numero e la cronologia li vedono il proprietario e lo staff; lo staff
// (master, moderatori, admin) la alza o la abbassa con una motivazione.
export default function FameBox({ character }: { character: Character }) {
  const supabase = useMemo(() => createClient(), []);
  const [fame, setFame] = useState(character.fame ?? 0);
  const [staff, setStaff] = useState(false);
  const [own, setOwn] = useState(false);
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Entry[] | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("can_master_mode").then(({ data }) => setStaff(data === true));
    supabase.auth.getUser().then(({ data }) => setOwn(!!data.user && data.user.id === character.owner_id));
  }, [supabase, character.owner_id]);

  const loadLog = useCallback(
    () =>
      supabase
        .from("fame_log")
        .select("*")
        .eq("character_id", character.id)
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data }) => setLog((data ?? []) as Entry[])),
    [supabase, character.id],
  );

  const canSee = staff || own;
  const n = Math.trunc(Number(delta)) || 0;
  const next = Math.min(FAME_MAX, Math.max(FAME_MIN, fame + n));

  async function apply() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("staff_adjust_fame", { p_character: character.id, p_delta: n, p_reason: reason });
    setBusy(false);
    if (error) return setError(error.message.length < 200 ? error.message : "Operazione non riuscita.");
    setFame(data as number);
    setDelta("");
    setReason("");
    loadLog();
  }

  const box = "min-w-24 border border-accent/40 bg-black/30 px-3 py-2 text-center";
  const content = (
    <>
      <dt className="text-[0.65rem] tracking-[0.16em] text-muted uppercase">Fama</dt>
      <dd className={`font-serif text-xl ${fameTone(fame)}`}>{fameTitle(fame)}</dd>
      {canSee && <dd className="text-xs text-muted">{signedFame(fame)}</dd>}
    </>
  );

  return (
    <>
      {canSee ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            loadLog();
          }}
          title={staff ? "Cronologia e modifica della fama" : "Cronologia della tua fama"}
          className={`${box} transition hover:border-accent`}
        >
          {content}
        </button>
      ) : (
        <div className={box}>{content}</div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={`Fama di ${character.name}`} size="md">
        <div className="space-y-4">
          <p>
            <span className={`font-serif text-2xl ${fameTone(fame)}`}>{fameTitle(fame)}</span>{" "}
            <span className="text-sm text-muted">
              ({signedFame(fame)} su una scala da {FAME_MIN} a +{FAME_MAX})
            </span>
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-3">
            {FAME_SCALE.map((t) => (
              <li key={t.title} className={fameTitle(fame) === t.title ? "font-semibold text-foreground" : ""}>
                {t.title}: {signedFame(t.from)} / {signedFame(t.to)}
              </li>
            ))}
          </ul>

          {staff && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs tracking-wide text-muted uppercase">Cambia la fama</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block space-y-1 text-xs text-muted">
                  Punti (con il meno per togliere)
                  <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="es. 5 o -10" className="input w-32" />
                </label>
                <label className="block min-w-40 flex-1 space-y-1 text-xs text-muted">
                  Motivo
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Es. ha vinto il torneo" className="input" />
                </label>
                <button type="button" onClick={apply} disabled={busy || n === 0 || !reason.trim()} className="btn px-4">
                  Applica
                </button>
              </div>
              {n !== 0 && (
                <p className="text-xs text-muted">
                  Passerebbe da {signedFame(fame)} ({fameTitle(fame)}) a {signedFame(next)} (
                  <span className={fameTone(next)}>{fameTitle(next)}</span>).
                </p>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs tracking-wide text-muted uppercase">Cronologia</p>
            {log === null ? (
              <p className="text-sm text-muted">Caricamento...</p>
            ) : log.length === 0 ? (
              <p className="text-sm text-muted">Nessuna variazione finora: nessuno parla ancora di {character.name}.</p>
            ) : (
              <ul className="max-h-60 space-y-1.5 overflow-y-auto text-sm">
                {log.map((e) => (
                  <li key={e.id} className="border-l-2 border-border pl-2">
                    <span className={e.delta > 0 ? "text-green-400" : "text-red-400"}>{signedFame(e.delta)}</span> → {signedFame(e.fame_after)} ({fameTitle(e.fame_after)})
                    <span className="block text-xs text-muted">
                      {new Date(e.created_at).toLocaleDateString("it-IT")} · {e.reason}
                      {staff && e.by_name ? ` · ${e.by_name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
