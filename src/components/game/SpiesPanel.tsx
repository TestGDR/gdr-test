"use client";

import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DEPTHS,
  STATUS_LABEL,
  depthHours,
  duration,
  failChance,
  isLost,
  maxLevel,
  recruitCost,
  trainCost,
  when,
  type Depth,
  type Spy,
  type SpyLevel,
  type SpyRules,
  type SpySettings,
} from "@/lib/spies";
import { createClient } from "@/lib/supabase/client";

type Mission = {
  id: string;
  spy_id: string | null;
  spy_name: string;
  spy_level: number;
  target: string;
  place_name: string;
  depth: Depth;
  request: string;
  started_at: string;
  ends_at: string;
  finished: boolean;
  fail_chance: number;
  roll: number | null;
  outcome: "riuscita" | "catturata" | "uccisa" | null;
  report: string;
};
// Risposta dello staff nel ticket della missione (si legge a missione finita)
type Reply = { mission_id: string; author_name: string; body: string; created_at: string };
const clean = (html: string) => (typeof window === "undefined" ? "" : DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }));
type Pay = "personale" | "casata";
type Data = {
  settings: SpyRules;
  spies: Spy[];
  missions: Mission[];
  replies: Reply[];
  places: { id: string; name: string }[];
  coins: number;
  canHouse: boolean; // ha un ruolo che gestisce le risorse della casata
};

const STATUS_COLOR: Record<Spy["status"], string> = {
  libera: "text-green-400",
  missione: "text-[#e8cf9c]",
  catturata: "text-amber-300",
  morta: "text-red-400",
  abbandonata: "text-red-400",
};

// Pannello Spie del giocatore: reclutare, addestrare, mandare in missione, leggere i rapporti
export default function SpiesPanel({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [pay, setPay] = useState<Pay>("personale");
  const [name, setName] = useState("");
  const [sending, setSending] = useState<Spy | null>(null);
  // due pagine: le spie (con le missioni in corso) e l'archivio dei resoconti
  const [tab, setTab] = useState<"spie" | "archivio">("spie");
  const [only, setOnly] = useState<Spy | null>(null); // archivio di una sola spia
  const [opened, setOpened] = useState<string | null>(null); // missione aperta nell'archivio
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [settings, levels, limit, missions, replies, spies, places, me] = await Promise.all([
      supabase.from("spy_settings").select("*").maybeSingle(),
      supabase.from("spy_levels").select("*").order("level"),
      supabase.rpc("spy_limit", { p_character: characterId }),
      // legge le missioni e, per quelle finite, applica l'esito alla spia
      supabase.rpc("spy_my_missions", { p_character: characterId }),
      // le risposte dello staff nei ticket delle missioni finite
      supabase.rpc("spy_my_replies", { p_character: characterId }),
      supabase.from("spies").select("*").eq("character_id", characterId).order("created_at"),
      supabase.from("locations").select("id, name").eq("kind", "luogo").eq("in_game", true).order("name"),
      supabase.from("characters").select("coins, house_role:house_roles(can_build)").eq("id", characterId).maybeSingle(),
    ]);
    if (settings.error || !settings.data || levels.error) return setMissing(true);
    // le spie si rileggono dopo le missioni: lo stato e' gia' aggiornato
    const fresh = await supabase.from("spies").select("*").eq("character_id", characterId).order("created_at");
    setData({
      settings: {
        ...(settings.data as SpySettings),
        levels: (levels.data ?? []) as SpyLevel[],
        limit: (limit.data as number | null) ?? 1,
      },
      spies: ((fresh.data ?? spies.data ?? []) as Spy[]),
      missions: (missions.data ?? []) as Mission[],
      replies: (replies.data ?? []) as Reply[],
      places: (places.data ?? []) as { id: string; name: string }[],
      coins: (me.data?.coins as number | undefined) ?? 0,
      canHouse: !!(me.data?.house_role as unknown as { can_build: boolean } | null)?.can_build,
    });
  }, [supabase, characterId]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (missing) return <p className="text-amber-200">Per le spie vanno eseguite le migrazioni 0131 e 0134 in Supabase.</p>;
  if (!data) return <p className="text-muted">Caricamento...</p>;
  const { settings: s, spies, missions } = data;

  async function run(op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await op();
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message.length < 200 ? error.message : "Operazione non riuscita." } : { ok: true, text: ok });
    if (!error) load();
    return !error;
  }

  async function recruit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (await run(() => supabase.rpc("spy_recruit", { p_character: characterId, p_name: n, p_pay: pay }), `${n} è ora al tuo servizio.`)) setName("");
  }

  if (sending)
    return (
      <SendForm
        spy={sending}
        settings={s}
        places={data.places}
        onCancel={() => setSending(null)}
        onSent={() => {
          setSending(null);
          setMsg({ ok: true, text: `${sending.name} è partita. Saprai com'è andata al suo rientro.` });
          load();
        }}
      />
    );

  const alive = spies.filter((x) => !isLost(x.status));
  const running = missions.filter((m) => !m.finished);
  const past = missions.filter((m) => m.finished);
  const shown = only ? past.filter((m) => m.spy_id === only.id) : past;
  const repliesOf = (id: string) => data.replies.filter((r) => r.mission_id === id);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["spie", "Le tue spie"],
            ["archivio", `Archivio${past.length ? ` (${past.length})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setOnly(null);
            }}
            className={`-mb-px border-b-2 px-4 py-2 font-serif text-sm tracking-wide uppercase ${tab === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}

      {tab === "spie" && (
        <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-black/40 px-3 py-2 text-sm">
        <span>
          Conto: <strong className="text-accent">{data.coins}</strong> monete
        </span>
        <span className="text-muted">Paga con:</span>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={pay === "personale"} onChange={() => setPay("personale")} />
          conto personale
        </label>
        <label className={`flex items-center gap-1.5 ${data.canHouse ? "" : "opacity-40"}`} title={data.canHouse ? "" : "Serve un ruolo che gestisce le risorse della casata"}>
          <input type="radio" checked={pay === "casata"} disabled={!data.canHouse} onChange={() => setPay("casata")} />
          Oro della casata
        </label>
      </div>

      <section className="space-y-2">
        <h3 className="font-serif text-lg tracking-wide text-accent">
          Le tue spie <span className="text-sm text-muted">({alive.length} su {s.limit})</span>
        </h3>
        {spies.length === 0 ? (
          <p className="text-sm text-muted">Non hai ancora nessuna spia: reclutane una qui sotto.</p>
        ) : (
          <ul className="space-y-2">
            {spies.map((spy) => (
              <li key={spy.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 border border-border bg-black/50 px-3 py-2 ${isLost(spy.status) ? "opacity-50" : ""}`}>
                <span className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOnly(spy);
                      setTab("archivio");
                    }}
                    title={`Leggi i resoconti di ${spy.name}`}
                    className="block max-w-full truncate text-left font-serif text-accent hover:underline"
                  >
                    {spy.name}
                  </button>
                  <span className="block text-xs text-muted">
                    Livello {spy.level} · <span className={STATUS_COLOR[spy.status]}>{STATUS_LABEL[spy.status]}</span>
                    {spy.status === "libera" && ` · rischio ${failChance(s, spy.level, "superficiale")}% / ${failChance(s, spy.level, "normale")}% / ${failChance(s, spy.level, "approfondita")}%`}
                  </span>
                </span>
                {spy.status === "libera" && (
                  <>
                    {spy.level < maxLevel(s) ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => supabase.rpc("spy_train", { p_spy: spy.id, p_pay: pay }), `${spy.name} sale al livello ${spy.level + 1}.`)}
                        className="btn-ghost px-3 py-1 text-xs"
                        title="Una spia più esperta fallisce meno"
                      >
                        Addestra · {trainCost(s, spy.level)} monete
                      </button>
                    ) : (
                      <span className="text-xs text-muted">livello massimo</span>
                    )}
                    <button type="button" disabled={busy} onClick={() => setSending(spy)} className="btn px-3 py-1 text-xs">
                      Manda in missione
                    </button>
                  </>
                )}
                {spy.status === "catturata" && (
                  <>
                    <span className="text-xs text-muted">La sua sorte è nelle mani di chi l&apos;ha presa.</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Rinunciare a ${spy.name}? La perdi per sempre, ma il suo posto si libera e potrai reclutare un'altra spia.`) &&
                        run(() => supabase.rpc("spy_abandon", { p_spy: spy.id }), `Hai rinunciato a ${spy.name}: il suo posto è libero.`)
                      }
                      className="btn-ghost border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500"
                      title="La spia è persa per sempre, ma il posto si libera"
                    >
                      Abbandonala al suo destino
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {alive.length >= s.limit && s.limit < s.max_spies_trait && (
          <p className="text-xs text-muted">
            Puoi avere {s.limit} {s.limit === 1 ? "spia" : "spie"}. Con il tratto &quot;{s.trait_name}&quot; il limite sale a {s.max_spies_trait}.
          </p>
        )}
        {alive.length < s.limit && (
          <form onSubmit={recruit} className="flex flex-wrap items-center gap-2 pt-1">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nome della nuova spia" className="input min-w-0 flex-1" />
            <button className="btn px-4" disabled={busy || !name.trim()}>
              Recluta · {recruitCost(s)} monete
            </button>
          </form>
        )}
      </section>

      {running.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-serif text-lg tracking-wide text-accent">In missione</h3>
          <ul className="space-y-2">
            {running.map((m) => (
              <li key={m.id} className="border border-border border-l-2 border-l-accent bg-black/50 px-3 py-2 text-sm">
                <p>
                  <strong className="text-accent">{m.spy_name}</strong> → {m.place_name}: {m.target}
                </p>
                <p className="text-xs text-muted">
                  Ricerca {m.depth} · rischio {m.fail_chance}% · rientro previsto il {when(m.ends_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

        </>
      )}

      {tab === "archivio" && (
        <section className="space-y-2">
          {only && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Solo le missioni di <strong className="text-accent">{only.name}</strong>
              <button type="button" onClick={() => setOnly(null)} className="btn-ghost px-2 py-0.5 text-xs">
                Mostra tutte
              </button>
            </p>
          )}
          <p className="text-sm text-muted">
            {shown.length === 0
              ? only
                ? "Questa spia non ha ancora concluso nessuna missione."
                : "Ancora nessuna missione conclusa: qui troverai i resoconti delle tue spie, dal più recente."
              : "Clicca su una missione per leggere il resoconto e le risposte dei master."}
          </p>
          <ul className="space-y-2">
            {shown.map((m) => {
              const answers = repliesOf(m.id);
              const isOpen = opened === m.id;
              return (
                <li key={m.id} className={`border border-border border-l-2 bg-black/50 text-sm ${m.outcome === "riuscita" ? "border-l-green-600" : "border-l-red-700"}`}>
                  <button type="button" onClick={() => setOpened(isOpen ? null : m.id)} aria-expanded={isOpen} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/5">
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        <strong className="text-accent">{m.spy_name}</strong> → {m.place_name}: {m.target}
                      </span>
                      <span className="block text-xs text-muted">
                        {when(m.ends_at)} · ricerca {m.depth} ·{" "}
                        {m.outcome === "riuscita"
                          ? m.report || answers.length
                            ? `${(m.report ? 1 : 0) + answers.length} ${(m.report ? 1 : 0) + answers.length === 1 ? "risposta" : "risposte"}`
                            : "in attesa del resoconto"
                          : m.outcome === "uccisa"
                            ? "spia uccisa"
                            : "spia catturata"}
                      </span>
                    </span>
                    <span className="text-muted" aria-hidden>
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 border-t border-border/60 px-3 py-2">
                      <p className="text-xs text-muted">
                        Dado {m.roll} su 100 (falliva fino a {m.fail_chance})
                      </p>
                      <p className="text-xs whitespace-pre-wrap text-muted">
                        <span className="tracking-wide uppercase">Avevi chiesto:</span> {m.request}
                      </p>
                      {m.outcome !== "riuscita" && (
                        <p className="text-red-400">
                          {m.outcome === "uccisa" ? "La missione è fallita: la spia è stata uccisa." : "La missione è fallita: la spia è stata catturata."}
                        </p>
                      )}
                      {m.outcome === "riuscita" && !m.report && answers.length === 0 && (
                        <p className="text-green-400">La spia è tornata sana e salva: il suo rapporto arriverà a breve.</p>
                      )}
                      {m.report && (
                        <div className="border-t border-border/60 pt-2">
                          <p className="mb-1 text-[0.625rem] tracking-[0.15em] text-muted uppercase">Rapporto della spia</p>
                          <p className="leading-relaxed whitespace-pre-wrap">{m.report}</p>
                        </div>
                      )}
                      {answers.map((r, i) => (
                        <div key={i} className="border-t border-border/60 pt-2">
                          <p className="mb-1 text-[0.625rem] tracking-[0.15em] text-muted uppercase">
                            {r.author_name} · {when(r.created_at)}
                          </p>
                          <div className="guide-content text-sm break-words" dangerouslySetInnerHTML={{ __html: clean(r.body) }} />
                        </div>
                      ))}
                      <div className="flex justify-end border-t border-border/60 pt-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            window.confirm("Eliminare questo resoconto dal tuo archivio? Non potrai più rileggerlo.") &&
                            run(() => supabase.rpc("spy_hide_mission", { p_mission: m.id }), "Resoconto eliminato dall'archivio.")
                          }
                          className="btn-ghost border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500"
                        >
                          Elimina dall&apos;archivio
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// Nuova missione: dove, chi o cosa, quanto a fondo, che cosa scoprire
function SendForm({
  spy,
  settings,
  places,
  onCancel,
  onSent,
}: {
  spy: Spy;
  settings: SpyRules;
  places: { id: string; name: string }[];
  onCancel: () => void;
  onSent: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [place, setPlace] = useState("");
  const [target, setTarget] = useState("");
  const [depth, setDepth] = useState<Depth>("normale");
  const [request, setRequest] = useState("");
  const [travel, setTravel] = useState<{ key: string; minutes: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // tempo della staffetta fino al luogo scelto
  useEffect(() => {
    if (!place) return;
    supabase.rpc("spy_preview", { p_spy: spy.id, p_location: place, p_depth: depth }).then(({ data }) => {
      const row = ((data ?? []) as { travel_minutes: number | null }[])[0];
      setTravel({ key: place, minutes: row ? row.travel_minutes : null });
    });
  }, [supabase, spy.id, place, depth]);

  const minutes = travel?.key === place ? travel.minutes : undefined;
  const hours = depthHours(settings, depth);
  const risk = failChance(settings, spy.level, depth);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("spy_send", { p_spy: spy.id, p_location: place, p_target: target, p_depth: depth, p_request: request });
    setBusy(false);
    if (error) return setError(error.message.length < 200 ? error.message : "Invio non riuscito.");
    onSent();
  }

  const label = "block space-y-1 text-xs tracking-wide text-muted uppercase";
  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
      <h3 className="font-serif text-xl text-accent">
        Missione per {spy.name} <span className="text-sm text-muted">(livello {spy.level})</span>
      </h3>
      <label className={label}>
        Dove
        <select value={place} onChange={(e) => setPlace(e.target.value)} required className="input normal-case">
          <option value="">Scegli il luogo...</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Bersaglio (una persona, una casata, un luogo, un fatto)
        <input value={target} onChange={(e) => setTarget(e.target.value)} maxLength={200} required className="input normal-case" />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs tracking-wide text-muted uppercase">Tipo di ricerca</legend>
        {DEPTHS.map((d) => (
          <label key={d.id} className={`flex cursor-pointer items-start gap-2 border px-3 py-2 text-sm ${depth === d.id ? "border-accent bg-accent/10" : "border-border"}`}>
            <input type="radio" checked={depth === d.id} onChange={() => setDepth(d.id)} className="mt-1" />
            <span>
              <strong>{d.label}</strong>{" "}
              <span className="text-xs text-muted">
                +{depthHours(settings, d.id)} ore · rischio {failChance(settings, spy.level, d.id)}%
              </span>
              <span className="block text-xs text-muted">{d.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className={label}>
        Che cosa deve scoprire
        <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={5} maxLength={4000} required className="input normal-case" />
      </label>
      <div className="border border-border bg-black/40 px-3 py-2 text-sm">
        {!place ? (
          <p className="text-muted">Scegli il luogo per conoscere i tempi.</p>
        ) : minutes === undefined ? (
          <p className="text-muted">Calcolo dei tempi...</p>
        ) : minutes === null ? (
          <p className="text-amber-200">Da dove ti trovi non c&apos;è una strada per quel luogo.</p>
        ) : (
          <p>
            {minutes === 0 ? "La spia è già sul posto" : `Viaggio (staffetta) ${duration(minutes)}`} + ricerca {hours} {hours === 1 ? "ora" : "ore"} ={" "}
            <strong className="text-accent">{duration(minutes + hours * 60)}</strong>. Probabilità che fallisca: <strong className="text-accent">{risk}%</strong>.
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          L&apos;esito si decide alla partenza ma lo scoprirai solo al rientro. Se fallisce, la spia viene catturata o uccisa.
        </p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn px-4" disabled={busy || !place || minutes === null || minutes === undefined}>
          {busy ? "..." : "Manda la spia"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-4">
          Annulla
        </button>
      </div>
    </form>
  );
}
