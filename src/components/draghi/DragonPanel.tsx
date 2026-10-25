"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  MAX_VALUE,
  STATS,
  colorHex,
  dragonModifiers,
  dragonName,
  effectLabel,
  signed,
  nextStage,
  stageLabel,
  type Dragon,
  type DragonStage,
  type Modifier,
} from "@/lib/dragons";
import { useDragonEffects, useDragonSkills } from "@/lib/dragon-skills";
import { createClient } from "@/lib/supabase/client";
import { saveDragonImage } from "./actions";
import DragonBars from "./DragonBars";

// Pannello "Il mio drago": foglio di pergamena con l'immagine del drago in una
// cornice esagonale, i valori nei cerchi e le linguette laterali per le sezioni

type TraitInfo = { pregio: string; difetto: string; pregio_text?: string; difetto_text?: string };
// canGrow: la linguetta Crescita c'e' solo per il cavaliere (il drago e' del suo PG)
type Data = { dragon: Dragon | null; stages: DragonStage[]; traits: TraitInfo[]; px: number; pxHalf: boolean; riderName: string; skillFactor: number; bondCost: number; canGrow: boolean };

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

// characterId: il drago di quel PG ("Il mio drago"); dragonId: un drago qualsiasi (Anagrafe draghi)
export default function DragonPanel({ characterId, dragonId }: { characterId?: string; dragonId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("scheda");

  const fetchAll = useCallback(async (): Promise<Data> => {
    const [dragon, stages, traits, settings, auth] = await Promise.all([
      dragonId
        ? supabase.from("dragons").select("*").eq("id", dragonId).maybeSingle()
        : supabase.from("dragons").select("*").eq("rider_id", characterId ?? "").maybeSingle(),
      supabase.from("dragon_stages").select("*").order("sort_order"),
      supabase.from("dragon_trait_pairs").select("*"),
      supabase.from("dragon_settings").select("*").maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const d = (dragon.data ?? null) as Dragon | null;
    // cavaliere: PG (con i suoi PX, se e' di chi guarda) oppure PNG
    const [me, npc] = await Promise.all([
      d?.rider_id
        ? supabase.from("characters").select("name, px, px_half, owner_id").eq("id", d.rider_id).maybeSingle()
        : Promise.resolve({ data: null }),
      d?.npc_rider_id
        ? supabase.from("house_npcs").select("name").eq("id", d.npc_rider_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const canGrow = !!me.data && me.data.owner_id === auth.data.user?.id;
    return {
      canGrow,
      dragon: (dragon.data ?? null) as Dragon | null,
      stages: (stages.data ?? []) as DragonStage[],
      traits: (traits.data ?? []) as TraitInfo[],
      px: canGrow ? (me.data?.px ?? 0) : 0,
      pxHalf: canGrow && !!me.data?.px_half,
      riderName: me.data?.name ?? (npc.data ? `${npc.data.name} (PNG)` : ""),
      skillFactor: settings.data?.skill_px_factor ?? 10,
      bondCost: settings.data?.bond_px_per_point ?? 1,
    };
  }, [supabase, characterId, dragonId]);

  const reload = useCallback(() => fetchAll().then(setData), [fetchAll]);
  useEffect(() => {
    fetchAll().then(setData);
  }, [fetchAll]);

  return (
    <div className="flex h-full bg-[#e2d0a8] bg-[url('/images/scheda-drago.webp')] bg-cover bg-center">
      <div className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-6 sm:py-3 ${INK}`}>
        {!data ? (
          <p className="py-20 text-center italic">Caricamento...</p>
        ) : !data.dragon ? (
          <div className="py-20 text-center">
            <p className="font-serif text-2xl text-[#8b2a14]">Nessun drago</p>
            <p className="mt-2 italic">{dragonId ? "Questo drago non esiste più." : "Non sei ancora il cavaliere di un drago."}</p>
          </div>
        ) : data.dragon.status === "uovo" && data.canGrow ? (
          <EggView dragon={data.dragon} onHatched={reload} />
        ) : (
          <>
            <Header dragon={data.dragon} stages={data.stages} />
            {tab === "scheda" && <Overview dragon={data.dragon} stages={data.stages} riderName={data.riderName} />}
            {tab === "abilita" && <Skills dragon={data.dragon} />}
            {tab === "carattere" && <Character dragon={data.dragon} />}
            {tab === "tratti" && <Traits dragon={data.dragon} traits={data.traits} />}
            {tab === "crescita" && data.canGrow && (
              <Growth dragon={data.dragon} stages={data.stages} px={data.px} pxHalf={data.pxHalf} skillFactor={data.skillFactor} bondCost={data.bondCost} onChanged={reload} />
            )}
          </>
        )}
      </div>

      {/* Linguette laterali */}
      {data?.dragon && data.dragon.status !== "uovo" && (
        <nav aria-label="Sezioni della scheda" className="flex w-9 shrink-0 flex-col gap-1.5 py-6">
          {TABS.filter((t) => t.id !== "crescita" || data.canGrow).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`flex-1 rounded-l-none border-y border-r py-2 font-serif text-[0.625rem] tracking-[0.1em] uppercase shadow-[2px_2px_4px_rgb(0_0_0/0.35)] transition [writing-mode:vertical-rl] ${
                tab === t.id
                  ? "-ml-1 border-[#3a2410] bg-[#6b2a14] text-[#f4e9cd]"
                  : "border-[#3a2410]/60 bg-[#5a3a1e] text-[#e8d8b4] hover:bg-[#6b4424]"
              }`}
            >
              {t.label}
              {t.id === "crescita" && data.dragon!.unspent_points > 0 && (
                <span className="mt-1 inline-block rounded-full bg-[#c9a05a] px-1 text-[0.625rem] text-[#3b2a1a] [writing-mode:horizontal-tb]">
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
    <header className="mb-3 flex items-center gap-3">
      <Ring size="h-9 w-9 sm:h-10 sm:w-10" title={dragon.sex === "maschio" ? "Maschio" : "Femmina"}>
        <span className="font-serif text-xl">{dragon.sex === "maschio" ? "♂" : "♀"}</span>
      </Ring>
      <div className="min-w-0 flex-1 text-center">
        <p className="text-[0.6875rem] tracking-[0.3em] text-[#6b4a2e] uppercase">{stageLabel(dragon.stage, stages)}</p>
        <h2 className="truncate font-serif text-xl tracking-wide text-[#3b2a1a] sm:text-2xl">{dragonName(dragon)}</h2>
      </div>
      <Ring size="h-9 w-9 sm:h-10 sm:w-10" title={[dragon.color1, dragon.color2].filter(Boolean).join(" e ")}>
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
  const mods = useMods(dragon);
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="relative flex items-center justify-center">
        <HexFrame dragon={dragon} />
      </div>
      <div className="space-y-4">
      <DragonBars dragon={dragon} stages={stages} variant="parchment" />

      {/* caratteristiche */}
      <div className="grid grid-cols-4 items-start gap-1">
        {STATS.map((s) => (
          <div key={s.key} className="relative flex flex-col items-center gap-1">
            <Ring size="h-11 w-11 sm:h-14 sm:w-14">
              <span className="font-serif text-lg sm:text-xl">{dragon.stats[s.key] ?? 0}</span>
            </Ring>
            <ModBadge mod={mods[`caratteristica:${s.key}`]} />
            <span className="text-[0.5rem] tracking-[0.08em] text-[#6b4a2e] uppercase sm:text-[0.625rem] sm:tracking-[0.2em]">{s.label}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-sm">
        Cavaliere: <strong className="font-serif">{riderName}</strong>
      </p>

      {/* targhette */}
      <div className="flex flex-wrap justify-center gap-2">
        <Ribbon>{stageLabel(dragon.stage, stages)}</Ribbon>
        <Ribbon>{dragon.sex === "maschio" ? "Maschio" : "Femmina"}</Ribbon>
        <Ribbon tone="teal">{[dragon.color1, dragon.color2].filter(Boolean).join(" · ")}</Ribbon>
      </div>
      </div>
    </div>
  );
}

// Immagine del drago dentro un esagono a doppio filo con segni runici
function HexFrame({ dragon }: { dragon: Dragon }) {
  const hex = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
  return (
    <div className="relative h-[15rem] w-[13rem] sm:h-[20rem] sm:w-[17.3rem]">
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
            <span className="px-8 text-xs italic">Metti il link di un&apos;immagine dalla linguetta Crescita</span>
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
  const mods = useMods(dragon);
  return (
    <div className="space-y-5">
      <SectionTitle>Abilità</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
        {skills.map((s) => (
          <div key={s.key} className="relative flex flex-col items-center gap-2">
            <ModBadge mod={mods[`abilita:${s.key}`]} big />
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
          <div key={s.key} className="relative flex flex-col items-center gap-1">
            <Ring size="h-14 w-14">
              <span className="font-serif text-xl">{dragon.stats[s.key] ?? 0}</span>
            </Ring>
            <ModBadge mod={mods[`caratteristica:${s.key}`]} />
            <span className="text-[0.625rem] tracking-[0.2em] text-[#6b4a2e] uppercase">{s.label}</span>
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
  const effects = useDragonEffects();
  const skills = useDragonSkills();
  const skillLabel = (k: string) => skills.find((s) => s.key === k)?.label ?? k;
  const list = (side: "pregio" | "difetto", trait: string) => {
    const mine = effects.filter((e) => e.side === side && e.trait === trait);
    if (mine.length === 0) return null;
    return (
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {mine.map((e) => (
          <li
            key={e.id}
            className={`border px-2 py-0.5 text-xs font-semibold ${e.modifier > 0 ? "border-[#2f5a2a]/60 text-[#2f5a2a]" : "border-[#8b2a14]/60 text-[#8b2a14]"}`}
          >
            {effectLabel(e, skillLabel)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <SectionTitle>Pregi</SectionTitle>
      <ul className="space-y-3">
        {dragon.pregi.map((p) => (
          <li key={p}>
            <Ribbon>{p}</Ribbon>
            <p className="mt-1.5 text-sm leading-relaxed">{traits.find((t) => t.pregio === p)?.pregio_text}</p>
            {list("pregio", p)}
          </li>
        ))}
      </ul>
      <SectionTitle>Difetti</SectionTitle>
      <ul className="space-y-3">
        {dragon.difetti.map((d) => (
          <li key={d}>
            <Ribbon tone="red">{d}</Ribbon>
            <p className="mt-1.5 text-sm leading-relaxed">{traits.find((t) => t.difetto === d)?.difetto_text}</p>
            {list("difetto", d)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Crescita: nome, immagine, PX per la fase successiva, punti da distribuire
// ---------------------------------------------------------------------
function Growth({
  dragon,
  stages,
  px,
  pxHalf,
  skillFactor,
  bondCost,
  onChanged,
}: {
  dragon: Dragon;
  stages: DragonStage[];
  px: number;
  pxHalf: boolean; // mezzo PX in sospeso (un'azione lunga vale mezzo PX)
  skillFactor: number;
  bondCost: number; // PX per ogni punto di fedelta'
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const skills = useDragonSkills();
  const [name, setName] = useState(dragon.name);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [bond, setBond] = useState("");
  const [imageUrl, setImageUrl] = useState(dragon.image_url ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stage = stages.find((s) => s.stage === dragon.stage);
  const next = nextStage(dragon.stage, stages);
  const adult = !next || (stage?.px_to_next ?? null) === null;
  const pxLabel = pxHalf ? `${px},5` : `${px}`;
  const statCap = stage?.stat_cap ?? MAX_VALUE;
  const used = Object.values(alloc).reduce((a, b) => a + b, 0);
  const left = dragon.unspent_points - used;
  const value = (k: string) => (dragon.stats[k] ?? dragon.skills[k] ?? 0) + (alloc[k] ?? 0);
  // caratteristiche: tetto della fase; abilita': mai oltre la loro caratteristica
  const cap = (k: string) =>
    k in dragon.stats ? statCap : Math.min(MAX_VALUE, value(skills.find((s) => s.key === k)?.stat_key ?? ""));

  async function run(op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await op();
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok });
    if (!error) onChanged();
    return !error;
  }

  async function saveImage(remove = false) {
    const form = new FormData();
    form.set("id", dragon.id);
    if (remove) form.set("remove", "1");
    else form.set("url", imageUrl);
    setBusy(true);
    setMsg(null);
    const res = await saveDragonImage(form);
    setBusy(false);
    setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Immagine aggiornata." });
    if (!res.error) {
      if (remove) setImageUrl("");
      onChanged();
    }
  }

  const box = "space-y-2 border border-[#6b4a2e]/40 bg-[#f4e9cd]/50 px-4 py-3";
  const button = "border border-[#3a2410] bg-[#6b2a14] px-4 py-1.5 font-serif text-xs tracking-widest text-[#f4e9cd] uppercase shadow transition hover:bg-[#7e3218] disabled:opacity-40";

  return (
    <div className="space-y-4">
      {msg && <p className={`text-center text-sm font-semibold ${msg.ok ? "text-[#2f5a2a]" : "text-[#8b2a14]"}`}>{msg.text}</p>}

      <div className="grid items-start gap-4 sm:grid-cols-2">
      <div className="space-y-4">
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            maxLength={1000}
            placeholder="https://… link dell'immagine"
            aria-label="Link dell'immagine del drago"
            className="min-w-0 flex-1 border-0 border-b border-[#6b4a2e] bg-transparent px-1 py-1 text-sm text-[#3b2a1a] placeholder:text-[#7a6248] focus:border-[#8b2a14] focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !imageUrl.trim() || imageUrl.trim() === (dragon.image_url ?? "")}
            onClick={() => saveImage()}
            className={button}
          >
            Salva immagine
          </button>
          {dragon.image_url && (
            <button type="button" disabled={busy} onClick={() => saveImage(true)} className="text-[#8b2a14] underline">
              Rimuovi
            </button>
          )}
        </div>
        <p className="text-xs italic">Incolla il link di un&apos;immagine già online (deve iniziare con https://)</p>
      </section>

      <section className={box}>
        <SectionTitle>Maturazione</SectionTitle>
        {/* le barre di maturazione e fedelta' sono nella pagina Scheda */}
        <p className="text-sm">
          {adult ? (
            <>È adulto: è ormai formato e le sue caratteristiche non crescono più. Puoi ancora completare le abilità.</>
          ) : (
            <>
              Ogni PX speso per far crescere il drago riempie la barra: quando è piena diventa{" "}
              <strong>{next.label.toLowerCase()}</strong> e riceve 5 punti da distribuire.
            </>
          )}{" "}
          Hai <strong>{pxLabel} PX</strong>.
        </p>
      </section>

      <section className={box}>
        <SectionTitle>Rafforza il legame</SectionTitle>
        {dragon.loyalty >= 100 ? (
          <p className="text-center text-sm italic">Il legame è completo: siete un&apos;anima sola.</p>
        ) : (
          (() => {
            const points = Math.min(100 - dragon.loyalty, Math.max(0, Math.trunc(Number(bond)) || 0));
            const price = points * bondCost;
            return (
              <>
                <p className="text-sm">
                  La fedeltà cresce solo così: ogni punto costa <strong>{bondCost} PX</strong>. Se il drago perde o cambia cavaliere,
                  la fedeltà torna a zero. Hai <strong>{pxLabel} PX</strong>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100 - dragon.loyalty}
                    value={bond}
                    onChange={(e) => setBond(e.target.value)}
                    placeholder="Punti"
                    aria-label="Punti di fedeltà da aggiungere"
                    className="w-24 border-0 border-b border-[#6b4a2e] bg-transparent px-1 py-1 font-serif text-lg text-[#3b2a1a] focus:border-[#8b2a14] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || points < 1 || px < price}
                    onClick={async () => {
                      if (
                        await run(
                          () => supabase.rpc("dragon_bond", { p_dragon: dragon.id, p_points: points }),
                          `La fedeltà sale al ${dragon.loyalty + points}%.`,
                        )
                      )
                        setBond("");
                    }}
                    className={button}
                  >
                    {points > 0 ? `+${points}% · ${price} PX` : "Rafforza"}
                  </button>
                </div>
              </>
            );
          })()
        )}
      </section>
      </div>

      <section className={box}>
        <SectionTitle>Crescita con i PX</SectionTitle>
        <p className="text-center text-[0.6875rem] leading-snug italic">
          Alzare una voce di 1 costa {skillFactor} PX × il nuovo valore. In questa fase ogni caratteristica arriva al massimo a{" "}
          {statCap}; un&apos;abilità non supera mai la sua caratteristica.
        </p>
        {[
          {
            title: "Caratteristiche",
            items: STATS.map((s) => ({
              key: s.key as string,
              label: s.label as string,
              cur: dragon.stats[s.key] ?? 0,
              max: adult ? 0 : statCap,
              note: "",
            })),
          },
          {
            title: "Abilità",
            items: skills.map((s) => ({
              key: s.key,
              label: s.label,
              cur: dragon.skills[s.key] ?? 0,
              max: Math.min(MAX_VALUE, dragon.stats[s.stat_key] ?? 0),
              note: STATS.find((st) => st.key === s.stat_key)?.label ?? "",
            })),
          },
        ].map((group) => (
          <div key={group.title}>
            <h4 className="mb-1 text-center text-[0.6875rem] tracking-[0.25em] text-[#6b4a2e] uppercase">{group.title}</h4>
            <ul className="divide-y divide-[#6b4a2e]/25">
              {group.items.map((it) => {
                const price = skillFactor * (it.cur + 1);
                const full = it.cur >= it.max;
                return (
                  <li key={it.key} className="flex items-center gap-3 py-0.5 text-sm">
                    <span className="flex-1 font-serif">
                      {it.label}
                      {it.note && <span className="ml-2 text-xs text-[#6b4a2e] italic">{it.note}</span>}
                    </span>
                    <span className="w-8 text-center font-serif text-base">{it.cur}</span>
                    <button
                      type="button"
                      disabled={busy || full || px < price}
                      onClick={() =>
                        run(() => supabase.rpc("dragon_buy", { p_dragon: dragon.id, p_key: it.key }), `${it.label} sale a ${it.cur + 1}.`)
                      }
                      className="w-28 border border-[#6b4a2e] px-2 py-0 text-xs leading-5 hover:bg-[#c9a05a]/30 disabled:opacity-35"
                    >
                      {full ? (group.title === "Caratteristiche" && adult ? "formato" : "al massimo") : `+1 · ${price} PX`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
      </div>

      {dragon.unspent_points > 0 && (
        <section className={box}>
          <SectionTitle>Punti da distribuire: {left}</SectionTitle>
          <p className="text-center text-xs italic">
            In questa fase ogni caratteristica arriva al massimo a {statCap}; un&apos;abilità non supera la sua caratteristica.
          </p>
          {[
            { title: "Caratteristiche", items: STATS },
            { title: "Abilità", items: skills },
          ].map((group) => (
            <div key={group.title}>
              <h4 className="mb-2 text-center text-[0.6875rem] tracking-[0.25em] text-[#6b4a2e] uppercase">{group.title}</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.items.map((it) => (
                  <div key={it.key} className="flex items-center justify-center gap-2">
                    <PointButton label="−" disabled={!alloc[it.key]} onClick={() => setAlloc((a) => ({ ...a, [it.key]: (a[it.key] ?? 0) - 1 }))} />
                    <div className="flex flex-col items-center">
                      <Ring size="h-12 w-12" highlight={!!alloc[it.key]}>
                        <span className="font-serif text-lg">{value(it.key)}</span>
                      </Ring>
                      <span className="mt-0.5 text-[0.5625rem] tracking-[0.15em] text-[#6b4a2e] uppercase">{it.label}</span>
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

// L'uovo non ancora schiuso: al posto del nome c'e' solo "Schiudi"
function EggView({ dragon, onHatched }: { dragon: Dragon; onHatched: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hatch() {
    if (!window.confirm("Far schiudere il tuo uovo? Nascerà un drago neonato con caratteristiche estratte a caso.")) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("hatch_egg", { p_dragon: dragon.id });
    setBusy(false);
    if (error) return setError(error.message);
    onHatched();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <SectionTitle>Uovo di drago</SectionTitle>
      <div className="flex h-36 w-28 items-center justify-center rounded-[50%] border-2 border-[#6b4a2e] bg-[radial-gradient(circle_at_35%_30%,#f4e9cd,#c9a05a_55%,#6b4a2e)] shadow-[inset_-6px_-10px_18px_rgb(0_0_0/0.35),0_6px_14px_rgb(0_0_0/0.35)]" />
      <p className="leading-relaxed italic">
        Il tuo uovo non si è ancora schiuso. Quando nascerà, il drago avrà caratteristiche, pregi, difetti e carattere estratti a caso, e
        potrai dargli un nome.
      </p>
      <button
        type="button"
        onClick={hatch}
        disabled={busy}
        className="border border-[#3a2410] bg-[#6b2a14] px-6 py-2 font-serif text-sm tracking-widest text-[#f4e9cd] uppercase shadow transition hover:bg-[#7e3218] disabled:opacity-40"
      >
        {busy ? "..." : "Schiudi"}
      </button>
      {error && <p className="text-sm font-semibold text-[#8b2a14]">{error}</p>}
    </div>
  );
}

// Modificatori del drago dai suoi pregi e difetti
function useMods(dragon: Dragon) {
  const effects = useDragonEffects();
  return dragonModifiers(dragon, effects);
}

// Bollino accanto a un valore: modificatore fisso (+1 / -2), oppure "*" se ce
// ne sono solo con una condizione. Passandoci sopra si legge da dove vengono.
function ModBadge({ mod, big }: { mod?: Modifier; big?: boolean }) {
  const skills = useDragonSkills();
  if (!mod) return null;
  const skillLabel = (k: string) => skills.find((s) => s.key === k)?.label ?? k;
  const title = mod.sources.map((e) => `${e.trait}: ${effectLabel(e, skillLabel)}`).join("\n");
  const text = mod.total !== 0 ? signed(mod.total) : "*";
  return (
    <span
      title={title}
      className={`absolute z-10 rounded-full border px-1.5 text-xs font-bold shadow ${big ? "top-5 right-3" : "-top-1 -right-2"} ${
        mod.total > 0 ? "border-[#2f5a2a] bg-[#dfe8c8] text-[#2f5a2a]" : mod.total < 0 ? "border-[#8b2a14] bg-[#f1d2c4] text-[#8b2a14]" : "border-[#6b4a2e] bg-[#f4e9cd] text-[#6b4a2e]"
      }`}
    >
      {text}
    </span>
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
      <span className="mb-1 flex min-h-[2.6em] items-end justify-center text-center font-serif text-[0.6875rem] leading-tight tracking-[0.12em] text-[#6b4a2e] uppercase sm:tracking-[0.2em]">{label}</span>
      <Ring size="h-20 w-20">
        <span className="font-serif text-3xl">{value}</span>
      </Ring>
      {note && <span className="mt-1.5 max-w-24 text-center text-[0.625rem] leading-tight italic">{note}</span>}
    </div>
  );
}

function Ribbon({ children, tone = "brown" }: { children: ReactNode; tone?: "brown" | "teal" | "red" }) {
  const bg = tone === "teal" ? "bg-[#2f5a5a]" : tone === "red" ? "bg-[#6b1d0e]" : "bg-[#5a3a1e]";
  return (
    <span
      className={`inline-block ${bg} px-5 py-1 font-serif text-[0.6875rem] tracking-[0.2em] text-[#f4e9cd] uppercase shadow-[0_2px_3px_rgb(0_0_0/0.4)] [clip-path:polygon(6%_0,94%_0,100%_50%,94%_100%,6%_100%,0_50%)]`}
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
