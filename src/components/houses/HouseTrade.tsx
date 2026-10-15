"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Commerci di una casata: tratte attive, proposte ricevute e fatte, offerte aperte.
// Lo usano il pannello Feudo (per la propria casata) e Gestione → Commerci
// (lo staff, per le casate PNG).
type Route = {
  id: string;
  from_house: string;
  to_house: string | null;
  give_resource: string;
  give_amount: number;
  want_resource: string;
  want_amount: number;
  months: number;
  months_left: number;
  status: "proposta" | "attiva" | "conclusa" | "annullata" | "rifiutata";
  note: string;
  created_by: string;
  renew_of: string | null;
  created_at: string;
};
type House = { id: string; name: string; playable: boolean };
type Resource = { id: string; name: string; tradable?: boolean };

const STATUS_LABEL: Record<Route["status"], string> = {
  proposta: "In attesa",
  attiva: "Attiva",
  conclusa: "Conclusa",
  annullata: "Annullata",
  rifiutata: "Rifiutata",
};
const months = (n: number) => `${n} ${n === 1 ? "mese" : "mesi"}`;

export default function HouseTrade({
  houseId,
  canManage,
  resources,
  onChanged,
}: {
  houseId: string;
  canManage: boolean; // puo' proporre, accettare, annullare e rinnovare per questa casata
  resources: Resource[];
  onChanged?: () => void; // dopo uno scambio il tesoro e' cambiato
}) {
  const supabase = useMemo(() => createClient(), []);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [r, h] = await Promise.all([
      supabase
        .from("trade_routes")
        .select("*")
        .or(`from_house.eq.${houseId},to_house.eq.${houseId},and(to_house.is.null,status.eq.proposta)`)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("houses").select("id, name, playable").order("name"),
    ]);
    if (r.error) return setMissing(true);
    setRoutes((r.data ?? []) as Route[]);
    setHouses((h.data ?? []) as House[]);
  }, [supabase, houseId]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (missing) return <p className="text-sm text-amber-200">Per i commerci va eseguita la migrazione 0141 in Supabase.</p>;
  if (!routes) return <p className="text-sm text-muted">Caricamento dei commerci...</p>;

  const houseName = (id: string | null) => {
    const h = houses.find((x) => x.id === id);
    return h ? `${h.name}${h.playable ? "" : " (PNG)"}` : "tutte le casate";
  };
  const resName = (id: string) => resources.find((r) => r.id === id)?.name ?? "?";
  // la tratta vista da questa casata: che cosa da' e che cosa riceve
  const view = (r: Route) => {
    const mine = r.from_house === houseId;
    return {
      partner: mine ? r.to_house : r.from_house,
      give: `${(mine ? r.give_amount : r.want_amount).toLocaleString("it-IT")} ${resName(mine ? r.give_resource : r.want_resource)}`,
      get: `${(mine ? r.want_amount : r.give_amount).toLocaleString("it-IT")} ${resName(mine ? r.want_resource : r.give_resource)}`,
    };
  };

  async function run(op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await op();
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message.length < 200 ? error.message : "Operazione non riuscita." } : { ok: true, text: ok });
    if (!error) {
      load();
      onChanged?.();
    }
    return !error;
  }

  const involved = routes.filter((r) => r.from_house === houseId || r.to_house === houseId);
  const active = involved.filter((r) => r.status === "attiva");
  const incoming = involved.filter((r) => r.status === "proposta" && r.to_house === houseId);
  const mine = involved.filter((r) => r.status === "proposta" && r.from_house === houseId);
  const open = routes.filter((r) => r.status === "proposta" && r.to_house === null && r.from_house !== houseId);
  const past = involved.filter((r) => r.status !== "attiva" && r.status !== "proposta").slice(0, 10);
  const renewing = (id: string) => routes.some((r) => r.renew_of === id && r.status === "proposta");

  const row = "border border-border/60 bg-black/30 px-3 py-2 text-sm";
  const small = "btn-ghost px-3 py-1 text-xs";
  const danger = "btn-ghost border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500";
  const terms = (r: Route) => {
    const v = view(r);
    return (
      <>
        dai <strong className="text-accent">{v.give}</strong> e ricevi <strong className="text-accent">{v.get}</strong> ogni mese
      </>
    );
  };

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted">
        Una tratta scambia ogni mese una risorsa con un&apos;altra casata. Il primo scambio avviene quando la proposta viene accettata, i successivi il primo
        giorno di ogni mese. Se in un mese mancano le risorse, lo scambio di quel mese salta.
      </p>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}

      <div className="space-y-2">
        <h4 className="text-xs tracking-[0.12em] text-muted uppercase">Tratte attive</h4>
        {active.length === 0 && <p className="text-sm text-muted">Nessuna tratta attiva.</p>}
        <ul className="space-y-2">
          {active.map((r) => (
            <li key={r.id} className={`${row} flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-l-green-600`}>
              <span className="min-w-0 flex-1">
                <span className="block">
                  Con <strong>{houseName(view(r).partner)}</strong>: {terms(r)}
                </span>
                <span className="block text-xs text-muted">
                  {r.months_left > 0 ? `Ancora ${months(r.months_left)}` : "Ultimo mese"}
                  {renewing(r.id) && " · rinnovo in attesa di risposta"}
                </span>
              </span>
              {canManage && (
                <>
                  {!renewing(r.id) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => supabase.rpc("trade_renew", { p_route: r.id, p_house: houseId }),
                          `Richiesta di rinnovo inviata a ${houseName(view(r).partner)} (altri ${months(r.months)}).`,
                        )
                      }
                      className={small}
                      title={`Chiede all'altra casata di allungare la tratta di ${months(r.months)}`}
                    >
                      Rinnova
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      window.confirm(`Annullare la tratta con ${houseName(view(r).partner)}? Gli scambi si fermano subito.`) &&
                      run(() => supabase.rpc("trade_cancel", { p_route: r.id }), "Tratta annullata.")
                    }
                    className={danger}
                  >
                    Annulla
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      {incoming.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs tracking-[0.12em] text-muted uppercase">Proposte ricevute</h4>
          <ul className="space-y-2">
            {incoming.map((r) => (
              <li key={r.id} className={`${row} flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-l-accent`}>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    <strong>{houseName(r.from_house)}</strong> propone: {terms(r)}, per {months(r.months)}
                  </span>
                  <span className="block text-xs text-muted">
                    {r.renew_of ? "Rinnovo di una tratta · " : ""}da {r.created_by || "?"}
                    {r.note && !r.renew_of ? ` · ${r.note}` : ""}
                  </span>
                </span>
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => supabase.rpc("trade_accept", { p_route: r.id, p_house: houseId }), "Proposta accettata.")}
                      className="btn px-3 py-1 text-xs"
                    >
                      Accetta
                    </button>
                    <button type="button" disabled={busy} onClick={() => run(() => supabase.rpc("trade_refuse", { p_route: r.id }), "Proposta rifiutata.")} className={danger}>
                      Rifiuta
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {open.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs tracking-[0.12em] text-muted uppercase">Offerte aperte delle altre casate</h4>
          <ul className="space-y-2">
            {open.map((r) => (
              <li key={r.id} className={`${row} flex flex-wrap items-center gap-x-3 gap-y-2`}>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    <strong>{houseName(r.from_house)}</strong> offre: {terms(r)}, per {months(r.months)}
                  </span>
                  {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                </span>
                {canManage && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => supabase.rpc("trade_accept", { p_route: r.id, p_house: houseId }), "Offerta accettata: la tratta è attiva.")}
                    className="btn px-3 py-1 text-xs"
                  >
                    Accetta
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mine.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs tracking-[0.12em] text-muted uppercase">Proposte in attesa di risposta</h4>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id} className={`${row} flex flex-wrap items-center gap-x-3 gap-y-2`}>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    A <strong>{houseName(r.to_house)}</strong>: {terms(r)}, per {months(r.months)}
                  </span>
                  <span className="block text-xs text-muted">
                    {r.renew_of ? "Rinnovo di una tratta" : r.to_house ? "In attesa di risposta" : "Offerta aperta: la prima casata che accetta la ottiene"}
                  </span>
                </span>
                {canManage && (
                  <button type="button" disabled={busy} onClick={() => run(() => supabase.rpc("trade_cancel", { p_route: r.id }), "Proposta ritirata.")} className={danger}>
                    Ritira
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage &&
        (adding ? (
          <OfferForm
            houseId={houseId}
            houses={houses.filter((h) => h.id !== houseId)}
            resources={resources}
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              setMsg({ ok: true, text: "Proposta inviata." });
              load();
            }}
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} disabled={resources.length < 2} className="btn px-4 py-1.5 text-sm">
            Proponi una nuova tratta
          </button>
        ))}
      {!canManage && <p className="text-xs text-muted">Le tratte le gestisce chi nella casata ha un ruolo che amministra le risorse (es. il signore).</p>}

      {past.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs tracking-[0.12em] text-muted uppercase">Tratte passate</h4>
          <ul className="space-y-1.5">
            {past.map((r) => (
              <li key={r.id} className={`${row} flex flex-wrap items-center gap-x-3 gap-y-1 opacity-80`}>
                <span className="min-w-0 flex-1">
                  Con <strong>{houseName(view(r).partner)}</strong>: {terms(r)} <span className="text-xs text-muted">· {STATUS_LABEL[r.status]}</span>
                </span>
                {canManage && r.status === "conclusa" && !renewing(r.id) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() => supabase.rpc("trade_renew", { p_route: r.id, p_house: houseId }), `Richiesta di rinnovo inviata a ${houseName(view(r).partner)}.`)
                    }
                    className={small}
                  >
                    Rinnova
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Nuova proposta: a chi, cosa si offre, cosa si chiede, per quanti mesi
function OfferForm({
  houseId,
  houses,
  resources,
  onCancel,
  onDone,
}: {
  houseId: string;
  houses: House[];
  resources: Resource[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [to, setTo] = useState("");
  // solo le risorse commerciabili (la Manodopera no: Gestione -> Economia -> Risorse)
  const tradable = resources.filter((r) => r.tradable !== false);
  const [give, setGive] = useState(tradable[0]?.id ?? "");
  const [giveAmount, setGiveAmount] = useState("10");
  const [want, setWant] = useState(tradable[1]?.id ?? "");
  const [wantAmount, setWantAmount] = useState("10");
  const [duration, setDuration] = useState("3");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (give === want) return setError("Scegli due risorse diverse.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("trade_offer", {
      p_from: houseId,
      p_to: to || null,
      p_give_resource: give,
      p_give_amount: Number(giveAmount),
      p_want_resource: want,
      p_want_amount: Number(wantAmount),
      p_months: Number(duration),
      p_note: note,
    });
    setBusy(false);
    if (error) return setError(error.message.length < 200 ? error.message : "Proposta non inviata.");
    onDone();
  }

  const label = "block space-y-1 text-xs tracking-wide text-muted uppercase";
  const options = tradable.map((r) => (
    <option key={r.id} value={r.id}>
      {r.name}
    </option>
  ));
  return (
    <form onSubmit={submit} className="space-y-3 border border-accent/40 bg-black/40 p-3">
      <h4 className="font-serif text-lg text-accent">Nuova tratta commerciale</h4>
      <label className={label}>
        Con quale casata
        <select value={to} onChange={(e) => setTo(e.target.value)} className="input normal-case">
          <option value="">Tutte le casate (offerta aperta)</option>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
              {h.playable ? "" : " (PNG)"}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="space-y-1">
          <legend className="text-xs tracking-wide text-muted uppercase">Offri ogni mese</legend>
          <span className="flex gap-2">
            <input type="number" min={1} max={1000000} required value={giveAmount} onChange={(e) => setGiveAmount(e.target.value)} className="input w-28!" aria-label="Quantità offerta" />
            <select value={give} onChange={(e) => setGive(e.target.value)} className="input min-w-0 flex-1" aria-label="Risorsa offerta">
              {options}
            </select>
          </span>
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="text-xs tracking-wide text-muted uppercase">In cambio di</legend>
          <span className="flex gap-2">
            <input type="number" min={1} max={1000000} required value={wantAmount} onChange={(e) => setWantAmount(e.target.value)} className="input w-28!" aria-label="Quantità chiesta" />
            <select value={want} onChange={(e) => setWant(e.target.value)} className="input min-w-0 flex-1" aria-label="Risorsa chiesta">
              {options}
            </select>
          </span>
        </fieldset>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className={label}>
          Durata (mesi)
          <input type="number" min={1} max={24} required value={duration} onChange={(e) => setDuration(e.target.value)} className="input normal-case" />
        </label>
        <label className={label}>
          Nota (facoltativa)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="input normal-case" />
        </label>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn px-4 py-1.5 text-sm" disabled={busy}>
          {busy ? "..." : "Invia la proposta"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-4 py-1.5 text-sm">
          Annulla
        </button>
      </div>
    </form>
  );
}
