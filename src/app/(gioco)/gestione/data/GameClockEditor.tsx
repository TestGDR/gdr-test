"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatGameDate, type GameDay } from "@/lib/game-date";
import { createClient } from "@/lib/supabase/client";

export default function GameClockEditor({
  clock,
  today,
}: {
  clock: { year_offset: number; day_shift: number };
  today: GameDay | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [year, setYear] = useState(String(today?.year ?? ""));
  const [shift, setShift] = useState(String(clock.day_shift));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const y = Math.trunc(Number(year));
    const s = Math.trunc(Number(shift)) || 0;
    if (!today || !Number.isFinite(y)) return setMsg({ ok: false, text: "Anno non valido." });
    // l'anno scelto vale per la data di oggi: lo scostamento resta lo stesso negli anni
    const offset = clock.year_offset + (y - today.year);
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("game_clock").update({ year_offset: offset, day_shift: s }).eq("id", 1);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Salvataggio non riuscito." });
    setMsg({ ok: true, text: "Data di gioco salvata." });
    router.refresh();
  }

  return (
    <div className="space-y-4 border border-border bg-black/40 p-5">
      <p>
        Oggi nel gioco: <strong className="font-serif text-lg text-accent">{today ? formatGameDate(today) : "—"}</strong>
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Anno di gioco di oggi (D.C.)</span>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="input w-32! py-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Sposta la data di (giorni)</span>
          <input type="number" value={shift} onChange={(e) => setShift(e.target.value)} className="input w-32! py-1.5" />
        </label>
        <button type="button" disabled={busy} onClick={save} className="btn px-4 py-1.5 text-sm">
          Salva
        </button>
      </div>
      <p className="text-xs text-muted">
        Esempio: con &quot;sposta di 3 giorni&quot; il gioco è sempre 3 giorni avanti rispetto al calendario reale (con un
        numero negativo, indietro). Cambiare l&apos;anno non cambia le date di nascita, quindi cambia le età.
      </p>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
