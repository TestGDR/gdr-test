"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  MAX_VALUE,
  STATS,
  colorHex,
  dragonName,
  monthlyUpkeep,
  nextStage,
  stageLabel,
  type Dragon,
  type DragonStage,
} from "@/lib/dragons";
import { useDragonSkills } from "@/lib/dragon-skills";
import { createClient } from "@/lib/supabase/client";
import { saveDragonImage } from "./actions";

// Pannello "Il mio drago": foglio di pergamena con l'immagine del drago in una
// cornice esagonale, i valori nei cerchi e le linguette laterali per le sezioni

type TraitInfo = { pregio: string; difetto: string; pregio_text?: string; difetto_text?: string };
type Data = { dragon: Dragon | null; stages: DragonStage[]; traits: TraitInfo[]; px: number; riderName: string };

const TABS = [
  { id: "scheda", label: "Scheda" },
  { id: "abilita", label: "Abilità" },
  { id: "carattere", label: "Carattere" },
  { id: "tratti", label: "Pregi e difetti" },
  { id: "crescita", label: "Crescita" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// inchiostro e tratti della pergamena
const INK = "text-[#3b2a1a]";
const LINE = "#6b4a2e";

export default function DragonPanel({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("scheda");

  const fetchAll = useCallback(async (): Promise<Data> => {
    const [dragon, stages, traits, me] = await Promise.all([
      supabase.from("dragons").select("*").eq("rider_id", characterId).maybeSingle(),
      supabase.from("dragon_stages").select("*").order("sort_order"),
      supabase.from("dragon_trait_pairs").select("*"),
      supabase.from("characters").select("name, px").eq("id", characterId).single(),
    ]);
    return {
      dragon: (dragon.data ?? null) as Dragon | null,
      stages: (stages.data ?? []) as DragonStage[],
      traits: (traits.data ?? []) as TraitInfo[],
      px: me.data?.px ?? 0,
      riderName: me.data?.name ?? "",
    };
  }, [supabase, characterId]);

  const reload = useCallback(() => fetchAll().then(setData), [fetchAll]);
  useEffect(() => {
    fetchAll().then(setData);
  }, [fetchAll]);

  return (
    <div className="flex h-full bg-[#e2d0a8] bg-[url('/images/scheda-drago.webp')] bg-cover bg-center">
      <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 ${INK}`}>
        {!data ? (
          <p className="py-20 text-center italic">Caricamento...</p>
        ) : !data.dragon ? (
          <div className="py-20 text-center">
            <p className="font-serif text-2xl text-[#8b2a14]">Nessun drago</p>
            <p className="mt-2 italic">Non sei ancora il cavaliere di un drago.</p>
          </div>
        ) : (
          <>
            <Header dragon={data.dragon} stages={data.stages} />
            {tab === "scheda" && <Overview dragon={data.dragon} stages={data.stages} riderName={data.riderName} />}
            {tab === "abilita" && <Skills dragon={data.dragon} />}
            {tab === "carattere" && <Character dragon={data.dragon} />}
            {tab === "tratti" && <Traits dragon={data.dragon} traits={data.traits} />}
            {tab === "crescita" && <Growth dragon={data.dragon} stages={data.stages} px={data.px} onChanged={reload} />}
          </>
        )}
      </div>

      {/* Linguette laterali */}
      {data?.dragon && (
        <nav aria-label="Sezioni della scheda" className="flex w-9 shrink-0 flex-col gap-1.5 py-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`flex-1 rounded-l-none border-y border-r py-3 font-serif text-[11px] tracking-[0.18em] uppercase shadow-[2px_2px_4px_rgb(0_0_0/0.35)] transition [writing-mode:vertical-rl] ${
                tab === t.id
                  ? "-ml-1 border-[#3a2410] bg-[#6b2a14] text-[#f4e9cd]"
                  : "border-[#3a2410]/60 bg-[#5a3a1e] text-[#e8d8b4] hover:bg-[#6b4424]"
              }`}
            >
              {t.label}
              {t.id === "crescita" && data.dragon!.unspent_points > 0 && (
                <span className="mt-1 inline-block rounded-full bg-[#c9a05a] px-1 text-[10px] text-[#3b2a1a] [writing-mode:horizontal-tb]">
                  {data.dragon!.unspent_points}
                </span>
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Intestazione: sesso (cerchio a sinistra), nome, colori (cerchio a destra)
// ---------------------------------------------------------------------
function Header({ dragon, stages }: { dragon: Dragon; stages: DragonStage[] }) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <Ring size="h-12 w-12" title={dragon.sex === "maschio" ? "Maschio" : "Femmina"}>
        <span className="font-serif text-xl">{dragon.sex === "maschio" ? "♂" : "♀"}</span>
      </Ring>
      <div className="min-w-0 flex-1 text-center">
        <p className="text-[11px] tracking-[0.3em] text-[#6b4a2e] uppercase">{stageLabel(dragon.stage, stages)}</p>
        <h2 className="truncate font-serif text-2xl tracking-wide text-[#3b2a1a] sm:text-3xl">{dragonName(dragon)}</h2>
      </div>
      <Ring size="h-12 w-12" title={[dragon.color1, dragon.color2].filter(Boolean).join(" e ")}>
        <span className="flex gap-0.5">
          {[dragon.color1, dragon.color2].filter(Boolean).map((c) => (
            <span key={c} className="h-4 w-4 rounded-full border border-black/50" style={{ background: colorHex(c) }} />
          ))}
        </span>
      </Ring>
    </header>
  );
}

// ---------------------------------------------------------------------
// Scheda: cornice esagonale, mantenimento e crescita nei cerchi grandi,
// caratteristiche nei cerchi piccoli, targhette in basso
// ---------------------------------------------------------------------
function Overview({ dragon, stages, riderName }: { dragon: Dragon; stages: DragonStage[]; riderName: string }) {
  const cost = stages.find((s) => s.stage === dragon.stage)?.px_to_next ?? null;
  const next = nextStage(dragon.stage, stages);
  return (
    <div className="space-y-5">
      <div className="relative mx-auto flex max-w-xl items-center justify-center">
        <BigRing label="Mantenimento" value={monthlyUpkeep(dragon, stages)} note="risorse / mese" className="absolute bottom-6 left-0 z-10" />
        <HexFrame dragon={dragon} />
        <BigRing
          label="Crescita"
          value={next && cost !== null ? cost : "—"}
          note={next ? `PX per ${next.label.toLowerCase()}` : "è adulto"}
          className="absolute right-0 bottom-6 z-10"
        />
      </div>

      {/* caratteristiche: due per lato, come su una scheda incisa */}
      <div className="mx-auto flex max-w-xl items-start justify-between px-2">
        {STATS.map((s, i) => (
          <div key={s.key} className={`flex flex-col items-center gap-1 ${i === 1 || i === 2 ? "mt-6" : ""}`}>
            <Ring size="h-14 w-14">
              <span className="font-serif text-xl">{dragon.stats[s.key] ?? 0}</span>
            </Ring>
            <span className="text-[10px] tracking-[0.2em] text-[#6b4a2e] uppercase">{s.label}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-sm">
        Cavaliere: <strong className="font-serif">{riderName}</strong>
      </p>

      {/* targhette */}
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Ribbon>{stageLabel(dragon.stage, stages)}</Ribbon>
        <Ribbon>{dragon.sex === "maschio" ? "Maschio" : "Femmina"}</Ribbon>
        <Ribbon tone="teal">{[dragon.color1, dragon.color2].filter(Boolean).join(" · ")}</Ribbon>
      </div>
    </div>
  );
}

// Immagine del drago dentro un esagono a doppio filo con segni runici
function HexFrame({ dragon }: { dragon: Dragon }) {
  const hex = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
  return (
    <div className="relative h-[19rem] w-[16.5rem] sm:h-[22rem] sm:w-[19rem]">
      <svg viewBox="0 0 100 115" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <polygon points="50,1 99,29 99,86 50,114 1,86 1,29" fill="none" stroke={LINE} strokeWidth="1.1" />
        <polygon points="50,4.5 96,31 96,84 50,110.5 4,84 4,31" fill="none" stroke={LINE} strokeWidth="2.6" strokeDasharray="0.6 1.4" strokeOpacity=".7" />
        <polygon points="50,8 93,33 93,82 50,107 7,82 7,33" fill="none" stroke={LINE} strokeWidth="1.1" />
      </svg>
      <div className="absolute inset-[7.5%] overflow-hidden bg-[#d9c49a]" style={{ clipPath: hex }}>
        {dragon.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dragon.image_url} alt={dragonName(dragon)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle,#efe3c6,#cdb486)] text-center">
            <DragonGlyph colors={[dragon.color1, dragon.color2]} />
            <span className="px-8 text-xs italic">Carica un&apos;immagine dalla linguetta Crescita</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DragonGlyph({ colors }: { colors: (string | null)[] }) {
  const c1 = colorHex(colors[0] ?? "Bronzo");
  const c2 = colorHex(colors[1] ?? colors[0] ?? "Bronzo");
  return (
    <svg viewBox="0 0 40 48" className="h-28 w-28 opacity-80" aria-hidden>
      <defs>
        <linearGradient id="glyph" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <path
        d="M20 4c3 6 9 8 14 8-3 3-4 6-3 10 2 0 4 1 5 3-4 0-6 2-7 5l-3 14-6-8-6 8-3-14c-1-3-3-5-7-5 1-2 3-3 5-3 1-4 0-7-3-10 5 0 11-2 14-8Z"
        fill="url(#glyph)"
        stroke="#3b2a1a"
        strokeOpacity=".6"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Abilita': sei cerchi grandi
// ---------------------------------------------------------------------
function Skills({ dragon }: { dragon: Dragon }) {
  const skills = useDragonSkills();
  return (
    <div className="space-y-5">
      <SectionTitle>Abilità</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
        {skills.map((s) => (
          <div key={s.key} className="flex flex-col items-center gap-2">
            <BigRing
              label={s.label}
              value={dragon.skills[s.key] ?? 0}
              note={`${STATS.find((st) => st.key === s.stat_key)?.label ?? ""} · su ${MAX_VALUE}`}
            />
          </div>
        ))}
      </div>
      <SectionTitle>Caratteristiche</SectionTitle>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.key} className="flex flex-col items-center gap-1">
            <Ring size="h-14 w-14">
              <span className="font-serif text-xl">{dragon.stats[s.key] ?? 0}</span>
            </Ring>
            <span className="text-[10px] tracking-[0.2em] text-[#6b4a2e] uppercase">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Carattere: titolo, descrizione e paragrafo dei tratti
// ---------------------------------------------------------------------
function Character({ dragon }: { dragon: Dragon }) {
  const [main, ...traits] = dragon.temperament.split(/\n\s*\n/);
  const [title, ...rest] = main.split(" — ");
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <SectionTitle>Carattere</SectionTitle>
      {rest.length > 0 && <h3 className="text-center font-serif text-xl text-[#8b2a14]">{title}</h3>}
      <p className="leading-relaxed first-letter:float-left first-letter:mr-1.5 first-letter:font-serif first-letter:text-5xl first-letter:leading-[0.85] first-letter:text-[#8b2a14]">
        {rest.length > 0 ? rest.join(" — ") : main}
      </p>
      {traits.map((t, i) => (
        <p key={i} className="leading-relaxed italic">
          {t}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Pregi e difetti, con la loro descrizione
// ---------------------------------------------------------------------
function Traits({ dragon, traits }: { dragon: Dragon; traits: TraitInfo[] }) {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <SectionTitle>Pregi</SectionTitle>
      <ul className="space-y-3">
        {dragon.pregi.map((p) => (
          <li key={p}>
            <Ribbon>{p}</Ribbon>
            <p className="mt-1.5 text-sm leading-relaxed">{traits.find((t) => t.pregio === p)?.pregio_text}</p>
          </li>
        ))}
      </ul>
      <SectionTitle>Difetti</SectionTitle>
      <ul className="space-y-3">
        {dragon.difetti.map((d) => (
          <li key={d}>
            <Ribbon tone="red">{d}</Ribbon>
            <p className="mt-1.5 text-sm leading-relaxed">{traits.find((t) => t.difetto === d)?.difetto_text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Crescita: nome, immagine, PX per la fase successiva, punti da distribuire
// ---------------------------------------------------------------------
function Growth({ dragon, stages, px, onChanged }: { dragon: Dragon; stages: DragonStage[]; px: number; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const skills = useDragonSkills();
  const [name, setName] = useState(dragon.name);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stage = stages.find((s) => s.stage === dragon.stage);
  const next = nextStage(dragon.stage, stages);
  const cost = stage?.px_to_next ?? null;
  const statCap = stage?.stat_cap ?? MAX_VALUE;
  const used = Object.values(alloc).reduce((a, b) => a + b, 0);
  const left = dragon.unspent_points - used;
  const value = (k: string) => (dragon.stats[k] ?? dragon.skills[k] ?? 0) + (alloc[k] ?? 0);
  const cap = (k: string) => (k in dragon.stats ? statCap : MAX_VALUE);

  async function run(op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await op();
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok });
    if (!error) onChanged();
    return !error;
  }

  async function uploadImage(file: File | null, remove = false) {
    const form = new FormData();
    form.set("id", dragon.id);
    if (remove) form.set("remove", "1");
    else if (file) form.set("image", file);
    setBusy(true);
    setMsg(null);
    const res = await saveDragonImage(form);
    setBusy(false);
    setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Immagine aggiornata." });
    if (!res.error) onChanged();
  }

  const box = "space-y-3 border border-[#6b4a2e]/40 bg-[#f4e9cd]/50 p-4";
  const button = "border border-[#3a2410] bg-[#6b2a14] px-4 py-1.5 font-serif text-xs tracking-widest text-[#f4e9cd] uppercase shadow transition hover:bg-[#7e3218] disabled:opacity-40";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {msg && <p className={`text-center text-sm font-semibold ${msg.ok ? "text-[#2f5a2a]" : "text-[#8b2a14]"}`}>{msg.text}</p>}

      <section className={box}>
        <SectionTitle>Nome e immagine</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Dai un nome al tuo drago"
            aria-label="Nome del drago"
            className="min-w-0 flex-1 border-0 border-b border-[#6b4a2e] bg-transparent px-1 py-1 font-serif text-lg text-[#3b2a1a] placeholder:text-[#7a6248] focus:border-[#8b2a14] focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || name.trim() === dragon.name}
            onClick={() => run(() => supabase.from("dragons").update({ name: name.trim() }).eq("id", dragon.id), "Nome salvato.")}
            className={button}
          >
            Salva nome
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className={`${button} cursor-pointer`}>
            {dragon.image_url ? "Cambia immagine" : "Carica immagine"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              disabled={busy}
              onChange={(e) => uploadImage(e.target.files?.[0] ?? null)}
            />
          </label>
          {dragon.image_url && (
            <button type="button" disabled={busy} onClick={() => uploadImage(null, true)} className="text-[#8b2a14] underline">
              Rimuovi
            </button>
          )}
          <span className="text-xs italic">PNG, JPG, WebP o GIF · max 1 MB</span>
        </div>
      </section>

      <section className={box}>
        <SectionTitle>Crescita</SectionTitle>
        {next && cost !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Da <strong>{stage?.label}</strong> a <strong>{next.label}</strong>: servono <strong>{cost} PX</strong>. Ne hai{" "}
              <strong>{px}</strong>.
            </p>
            <button
              type="button"
              disabled={busy || px < cost}
              onClick={() =>
                window.confirm(`Spendere ${cost} PX per far crescere ${dragonName(dragon)} a ${next.label}?`) &&
                run(() => supabase.rpc("dragon_grow", { p_dragon: dragon.id }), `${dragonName(dragon)} è cresciuto: ora è ${next.label.toLowerCase()}!`)
              }
              className={button}
            >
              Fai crescere
            </button>
          </div>
        ) : (
          <p className="text-sm italic">È adulto: ha raggiunto l&apos;ultima fase di crescita.</p>
        )}
      </section>

      {dragon.unspent_points > 0 && (
        <section className={box}>
          <SectionTitle>Punti da distribuire: {left}</SectionTitle>
          <p className="text-center text-xs italic">
            In questa fase ogni caratteristica arriva al massimo a {statCap}; le abilità a {MAX_VALUE}.
          </p>
          {[
            { title: "Caratteristiche", items: STATS },
            { title: "Abilità", items: skills },
          ].map((group) => (
            <div key={group.title}>
              <h4 className="mb-2 text-center text-[11px] tracking-[0.25em] text-[#6b4a2e] uppercase">{group.title}</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.items.map((it) => (
                  <div key={it.key} className="flex items-center justify-center gap-2">
                    <PointButton label="−" disabled={!alloc[it.key]} onClick={() => setAlloc((a) => ({ ...a, [it.key]: (a[it.key] ?? 0) - 1 }))} />
                    <div className="flex flex-col items-center">
                      <Ring size="h-12 w-12" highlight={!!alloc[it.key]}>
                        <span className="font-serif text-lg">{value(it.key)}</span>
                      </Ring>
                      <span className="mt-0.5 text-[9px] tracking-[0.15em] text-[#6b4a2e] uppercase">{it.label}</span>
                    </div>
                    <PointButton
                      label="+"
                      disabled={left <= 0 || value(it.key) >= cap(it.key)}
                      onClick={() => setAlloc((a) => ({ ...a, [it.key]: (a[it.key] ?? 0) + 1 }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-center gap-3">
            <button
              type="button"
              disabled={busy || used === 0}
              onClick={async () => {
                if (await run(() => supabase.rpc("dragon_assign_points", { p_dragon: dragon.id, p_alloc: alloc }), "Punti assegnati.")) setAlloc({});
              }}
              className={button}
            >
              Conferma punti
            </button>
            {used > 0 && (
              <button type="button" onClick={() => setAlloc({})} className="text-sm text-[#8b2a14] underline">
                Annulla
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Elementi grafici
// ---------------------------------------------------------------------
// Cerchio inciso a doppio filo
function Ring({ size, children, title, highlight }: { size: string; children: ReactNode; title?: string; highlight?: boolean }) {
  return (
    <span
      title={title}
      className={`${size} flex items-center justify-center rounded-full border-2 border-[#6b4a2e] ${highlight ? "bg-[#c9a05a]/45" : "bg-[#f4e9cd]/40"} shadow-[0_0_0_3px_#e8dab8,0_0_0_4px_#6b4a2e80]`}
    >
      {children}
    </span>
  );
}

// Cerchio grande con etichetta (come AC / HP della scheda di riferimento)
function BigRing({ label, value, note, className = "" }: { label: string; value: ReactNode; note?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <span className="mb-1 font-serif text-[11px] tracking-[0.2em] text-[#6b4a2e] uppercase">{label}</span>
      <Ring size="h-20 w-20">
        <span className="font-serif text-3xl">{value}</span>
      </Ring>
      {note && <span className="mt-1.5 max-w-24 text-center text-[10px] leading-tight italic">{note}</span>}
    </div>
  );
}

function Ribbon({ children, tone = "brown" }: { children: ReactNode; tone?: "brown" | "teal" | "red" }) {
  const bg = tone === "teal" ? "bg-[#2f5a5a]" : tone === "red" ? "bg-[#6b1d0e]" : "bg-[#5a3a1e]";
  return (
    <span
      className={`inline-block ${bg} px-5 py-1 font-serif text-[11px] tracking-[0.2em] text-[#f4e9cd] uppercase shadow-[0_2px_3px_rgb(0_0_0/0.4)] [clip-path:polygon(6%_0,94%_0,100%_50%,94%_100%,6%_100%,0_50%)]`}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-3 font-serif text-sm tracking-[0.25em] text-[#6b4a2e] uppercase">
      <span className="h-px flex-1 bg-[#6b4a2e]/40" />
      {children}
      <span className="h-px flex-1 bg-[#6b4a2e]/40" />
    </h3>
  );
}

function PointButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "Aggiungi un punto" : "Togli un punto"}
      className="h-7 w-7 rounded-full border border-[#6b4a2e] font-serif text-lg leading-none text-[#3b2a1a] hover:bg-[#c9a05a]/40 disabled:opacity-25"
    >
      {label}
    </button>
  );
}
