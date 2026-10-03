"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  MAX_VALUE,
  STATS,
  colorHex,
  colorLabel,
  dragonModifiers,
  dragonName,
  effectLabel,
  signed,
  monthlyUpkeep,
  nextStage,
  stageLabel,
  type Dragon,
  type DragonStage,
} from "@/lib/dragons";
import { useDragonEffects, useDragonSkills } from "@/lib/dragon-skills";
import { createClient } from "@/lib/supabase/client";
import { saveDragonImage } from "./actions";

// Scheda di un drago. Con "rider" (il cavaliere che la guarda) compaiono
// nome e immagine modificabili, la crescita e la distribuzione dei punti.
export default function DragonCard({
  dragon,
  stages,
  riderName,
  rider,
  onChanged,
}: {
  dragon: Dragon;
  stages: DragonStage[];
  riderName?: string | null;
  rider?: { px: number } | null;
  onChanged?: () => void;
}) {
  const next = nextStage(dragon.stage, stages);
  const cost = stages.find((s) => s.stage === dragon.stage)?.px_to_next ?? null;

  return (
    <article className="space-y-4 border border-border bg-black/40 p-4">
      <header className="flex flex-wrap items-start gap-4">
        <DragonPortrait dragon={dragon} />
        <div className="min-w-0 flex-1 space-y-1">
          {rider ? (
            <RenameField dragon={dragon} onSaved={onChanged} />
          ) : (
            <h3 className="font-serif text-2xl text-accent">{dragonName(dragon)}</h3>
          )}
          <p className="text-sm text-muted">
            {stageLabel(dragon.stage, stages)} · {dragon.sex === "maschio" ? "Maschio" : "Femmina"} · {colorLabel(dragon)}
            <ColorDots dragon={dragon} />
          </p>
          <p className="text-sm text-muted">
            Cavaliere: <span className="text-foreground">{riderName ?? "nessuno"}</span> · Mantenimento:{" "}
            <span className="text-foreground">{monthlyUpkeep(dragon, stages)}</span> risorse al mese
          </p>
          {rider && <ImageField dragon={dragon} onSaved={onChanged} />}
        </div>
      </header>

      {dragon.temperament && <Temperament text={dragon.temperament} />}

      <div className="flex flex-wrap gap-1.5">
        {dragon.pregi.map((p) => (
          <span key={p} className="border border-[#c9a05a]/70 bg-[#c9a05a]/10 px-2 py-0.5 text-xs text-[#e8cf9c]">
            {p}
          </span>
        ))}
        {dragon.difetti.map((d) => (
          <span key={d} className="border border-red-900 bg-red-950/40 px-2 py-0.5 text-xs text-red-300">
            {d}
          </span>
        ))}
      </div>

      {rider && dragon.unspent_points > 0 ? (
        <PointsEditor dragon={dragon} statCap={stages.find((s) => s.stage === dragon.stage)?.stat_cap ?? MAX_VALUE} onSaved={onChanged} />
      ) : (
        <ValuesGrid dragon={dragon} />
      )}

      {rider && (
        <GrowBox dragonId={dragon.id} cost={cost} next={next?.label ?? null} px={rider.px} onSaved={onChanged} />
      )}
    </article>
  );
}

// Carattere: "Titolo — descrizione" (il titolo in evidenza), poi un paragrafo
// con come si vedono pregi e difetto nel comportamento
function Temperament({ text }: { text: string }) {
  const [main, ...traits] = text.split(/\n\s*\n/);
  const [title, ...rest] = main.split(" — ");
  return (
    <div className="space-y-2 border-l-2 border-accent/60 pl-3 text-sm leading-relaxed">
      <h4 className="font-serif tracking-wider text-accent uppercase">Carattere</h4>
      {rest.length > 0 ? (
        <p>
          <strong className="font-serif text-[#e8cf9c]">{title}</strong> — <span className="text-foreground/90 italic">{rest.join(" — ")}</span>
        </p>
      ) : (
        <p className="text-foreground/90 italic">{main}</p>
      )}
      {traits.map((t, i) => (
        <p key={i} className="text-foreground/90 italic">
          {t}
        </p>
      ))}
    </div>
  );
}

export function DragonPortrait({ dragon, size = "h-28 w-28" }: { dragon: Dragon; size?: string }) {
  if (dragon.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={dragon.image_url} alt="" className={`${size} shrink-0 border border-border object-cover`} />;
  }
  // Senza immagine: un uovo o una sagoma nei colori del drago
  const c1 = colorHex(dragon.color1 ?? "Bronzo");
  const c2 = colorHex(dragon.color2 ?? dragon.color1 ?? "Bronzo");
  return (
    <span className={`${size} flex shrink-0 items-center justify-center border border-border bg-black/50`}>
      <svg viewBox="0 0 40 48" className="h-3/4 w-3/4" aria-hidden>
        <defs>
          <linearGradient id={`g-${dragon.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c1} />
            <stop offset="1" stopColor={c2} />
          </linearGradient>
        </defs>
        {dragon.status === "uovo" ? (
          <ellipse cx="20" cy="26" rx="14" ry="19" fill={`url(#g-${dragon.id})`} stroke="#c9a05a" strokeWidth="1" />
        ) : (
          <path
            d="M20 4c3 6 9 8 14 8-3 3-4 6-3 10 2 0 4 1 5 3-4 0-6 2-7 5l-3 14-6-8-6 8-3-14c-1-3-3-5-7-5 1-2 3-3 5-3 1-4 0-7-3-10 5 0 11-2 14-8Z"
            fill={`url(#g-${dragon.id})`}
            stroke="#000"
            strokeOpacity=".5"
          />
        )}
      </svg>
    </span>
  );
}

function ColorDots({ dragon }: { dragon: Dragon }) {
  return (
    <span className="ml-2 inline-flex gap-1 align-middle">
      {[dragon.color1, dragon.color2].filter(Boolean).map((c) => (
        <span key={c} title={c!} className="inline-block h-3 w-3 rounded-full border border-black/60" style={{ background: colorHex(c) }} />
      ))}
    </span>
  );
}

// "Volare (Des)": abilita' con l'abbreviazione della sua caratteristica
const withStat = (skills: { key: string; label: string; stat_key: string }[]) =>
  skills.map((s) => ({ key: s.key, label: `${s.label} (${(STATS.find((st) => st.key === s.stat_key)?.label ?? "").slice(0, 3)})` }));

function ValuesGrid({ dragon }: { dragon: Dragon }) {
  const skills = useDragonSkills();
  const effects = useDragonEffects();
  const mods = dragonModifiers(dragon, effects);
  const skillLabel = (k: string) => skills.find((s) => s.key === k)?.label ?? k;
  // "+1" (o "*" se il modificatore vale solo in certe condizioni), con la spiegazione al passaggio
  function renderMod(kind: string, key: string) {
    const m = mods[`${kind}:${key}`];
    if (!m) return null;
    return (
      <span
        title={m.sources.map((e) => `${e.trait}: ${effectLabel(e, skillLabel)}`).join("\n")}
        className={`w-8 shrink-0 text-right text-xs font-bold ${m.total > 0 ? "text-green-400" : m.total < 0 ? "text-red-400" : "text-muted"}`}
      >
        {m.total !== 0 ? signed(m.total) : "*"}
      </span>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ValueList title="Caratteristiche" items={STATS} values={dragon.stats} renderControl={(key) => renderMod("caratteristica", key)} />
      <ValueList title="Abilità" items={withStat(skills)} values={dragon.skills} renderControl={(key) => renderMod("abilita", key)} />
    </div>
  );
}

function ValueList({
  title,
  items,
  values,
  extra,
  renderControl,
}: {
  title: string;
  items: readonly { key: string; label: string }[];
  values: Record<string, number>;
  extra?: Record<string, number>;
  renderControl?: (key: string) => ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-1.5 font-serif text-sm tracking-wider text-accent uppercase">{title}</h4>
      <ul className="space-y-1">
        {items.map((it) => {
          const base = values[it.key] ?? 0;
          const add = extra?.[it.key] ?? 0;
          return (
            <li key={it.key} className="flex items-center gap-2 text-sm">
              <span className="w-36 shrink-0">{it.label}</span>
              <span className="flex flex-1 gap-0.5" aria-hidden>
                {Array.from({ length: MAX_VALUE }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 flex-1 ${i < base ? "bg-accent" : i < base + add ? "bg-[#e8cf9c]" : "bg-white/10"}`}
                  />
                ))}
              </span>
              <span className="w-10 text-right font-semibold">
                {base + add}
                {add > 0 && <span className="text-xs text-[#e8cf9c]"> +{add}</span>}
              </span>
              {renderControl?.(it.key)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Distribuzione dei punti liberi (dopo una crescita)
function PointsEditor({ dragon, statCap, onSaved }: { dragon: Dragon; statCap: number; onSaved?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const skills = useDragonSkills();
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = Object.values(alloc).reduce((a, b) => a + b, 0);
  const left = dragon.unspent_points - used;
  const all = { ...dragon.stats, ...dragon.skills };
  // caratteristiche: tetto della fase; abilita': massimo generale
  const capOf = (key: string) => (key in dragon.stats ? statCap : MAX_VALUE);

  const control = (key: string) => (
    <span className="flex shrink-0 gap-1">
      <button
        type="button"
        aria-label="Togli un punto"
        disabled={!alloc[key]}
        onClick={() => setAlloc((a) => ({ ...a, [key]: (a[key] ?? 0) - 1 }))}
        className="h-6 w-6 border border-border text-sm hover:border-accent disabled:opacity-30"
      >
        −
      </button>
      <button
        type="button"
        aria-label="Aggiungi un punto"
        disabled={left <= 0 || (all[key] ?? 0) + (alloc[key] ?? 0) >= capOf(key)}
        onClick={() => setAlloc((a) => ({ ...a, [key]: (a[key] ?? 0) + 1 }))}
        className="h-6 w-6 border border-border text-sm hover:border-accent disabled:opacity-30"
      >
        +
      </button>
    </span>
  );

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("dragon_assign_points", { p_dragon: dragon.id, p_alloc: alloc });
    setBusy(false);
    if (error) return setError(error.message);
    setAlloc({});
    onSaved?.();
  }

  return (
    <div className="space-y-3 border border-[#c9a05a]/50 bg-[#c9a05a]/5 p-3">
      <p className="text-sm">
        Punti da distribuire: <strong className="text-[#e8cf9c]">{left}</strong> su {dragon.unspent_points}
        <span className="text-muted"> · in questa fase ogni caratteristica arriva al massimo a {statCap}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ValueList title="Caratteristiche" items={STATS} values={dragon.stats} extra={alloc} renderControl={control} />
        <ValueList title="Abilità" items={withStat(skills)} values={dragon.skills} extra={alloc} renderControl={control} />
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy || used === 0} className="btn px-4 py-1.5 text-sm">
          Conferma punti
        </button>
        {used > 0 && (
          <button type="button" onClick={() => setAlloc({})} className="text-sm text-muted hover:text-accent">
            Annulla
          </button>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function GrowBox({
  dragonId,
  cost,
  next,
  px,
  onSaved,
}: {
  dragonId: string;
  cost: number | null;
  next: string | null;
  px: number;
  onSaved?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!next || cost === null) return <p className="text-sm text-muted">Il drago è adulto: ha raggiunto l&apos;ultima fase di crescita.</p>;

  async function grow() {
    if (!window.confirm(`Spendere ${cost} PX per far crescere il drago a ${next}?`)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("dragon_grow", { p_dragon: dragonId });
    setBusy(false);
    if (error) return setError(error.message);
    onSaved?.();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
      <span>
        Prossima fase: <strong className="text-foreground">{next}</strong> · costo <strong>{cost} PX</strong> (ne hai {px})
      </span>
      <button type="button" onClick={grow} disabled={busy || px < cost} className="btn px-4 py-1.5 text-sm">
        Fai crescere
      </button>
      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}

function RenameField({ dragon, onSaved }: { dragon: Dragon; onSaved?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(dragon.name);
  const [busy, setBusy] = useState(false);
  const changed = name.trim() !== dragon.name;

  async function save() {
    setBusy(true);
    await supabase.from("dragons").update({ name: name.trim().slice(0, 60) }).eq("id", dragon.id);
    setBusy(false);
    onSaved?.();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dai un nome al tuo drago"
        maxLength={60}
        aria-label="Nome del drago"
        className="input w-64 py-1 font-serif text-lg text-accent"
      />
      {changed && (
        <button type="button" onClick={save} disabled={busy} className="btn px-3 py-1 text-sm">
          Salva nome
        </button>
      )}
    </div>
  );
}

function ImageField({ dragon, onSaved }: { dragon: Dragon; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(form: FormData) {
    setBusy(true);
    setError(null);
    form.set("id", dragon.id);
    const res = await saveDragonImage(form);
    setBusy(false);
    if (res.error) return setError(res.error);
    onSaved?.();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="cursor-pointer text-accent hover:underline">
        {busy ? "Caricamento..." : dragon.image_url ? "Cambia immagine" : "Carica un'immagine"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.set("image", file);
            send(form);
          }}
        />
      </label>
      {dragon.image_url && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const form = new FormData();
            form.set("remove", "1");
            send(form);
          }}
          className="text-muted hover:text-red-400"
        >
          Rimuovi
        </button>
      )}
      <span className="text-muted">PNG, JPG, WebP o GIF · max 1 MB</span>
      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}
