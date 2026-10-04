"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { saveSheetExtras } from "@/app/scheda/actions";
import DragonSection from "@/components/draghi/DragonSection";
import Modal from "@/components/ui/Modal";
import ModalButton from "@/components/ui/ModalButton";
import {
  ATTRIBUTES,
  ATTRIBUTE_MAX,
  REGIONS,
  SEXES,
  SOCIAL_CLASSES,
  labelOf,
} from "@/lib/character-creation";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import CreationWizard from "./CreationWizard";

// Apre la scheda del personaggio in una modale (dal nome o da un'icona)
export default function SheetButton({
  characterId,
  trigger,
  className = "font-serif text-accent hover:underline",
}: {
  characterId: string;
  trigger: ReactNode;
  className?: string;
}) {
  // Ogni apertura ricarica la scheda aggiornata dal database
  const [openCount, setOpenCount] = useState(0);

  return (
    <ModalButton
      label={trigger}
      title="Scheda personaggio"
      size="pg"
      className={className}
      onOpen={() => setOpenCount((c) => c + 1)}
    >
      {() =>
        openCount > 0 ? (
          <SheetContent key={openCount} characterId={characterId} />
        ) : null
      }
    </ModalButton>
  );
}

// Scheda di un personaggio qualsiasi aperta da codice (es. dall'anagrafica)
export function SheetModal({
  characterId,
  onClose,
}: {
  characterId: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={characterId !== null}
      onClose={onClose}
      title="Scheda personaggio"
      size="pg"
    >
      {characterId && (
        <SheetContent key={characterId} characterId={characterId} />
      )}
    </Modal>
  );
}

export function SheetContent({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [mode, setMode] = useState<"scheda" | "creazione">("scheda");

  const load = useCallback(
    () =>
      supabase
        .from("characters")
        .select(
          "*, house:houses(name, sigil_url), house_role:house_roles(name)",
        )
        .eq("id", characterId)
        .single<Character>()
        .then(({ data }) => setCharacter(data)),
    [supabase, characterId],
  );

  useEffect(() => {
    load();
    supabase.auth
      .getSession()
      .then(({ data }) => setViewerId(data.session?.user.id ?? null));
  }, [load, supabase]);

  if (!character)
    return <p className="p-5 text-center text-muted">Caricamento...</p>;
  // La scheda e' modificabile (creazione; prestavolto e immagine solo a PG attivo) solo dal proprietario
  const isOwn = viewerId !== null && viewerId === character.owner_id;

  if (mode === "creazione" && isOwn) {
    return (
      <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto p-5">
        <CreationWizard
          character={character}
          onExit={() => load().then(() => setMode("scheda"))}
          onCreated={() =>
            load().then(() => {
              setMode("scheda");
              router.refresh(); // aggiorna mappa e barra: il PG ora e' attivo
            })
          }
        />
      </div>
    );
  }

  return (
    <CharacterSheet
      character={character}
      isOwn={isOwn}
      onCreate={() => setMode("creazione")}
      onSaved={load}
    />
  );
}

type Tab =
  | "principale"
  | "dati"
  | "caratteristiche"
  | "aspetto"
  | "storia"
  | "draghi"
  | "opzioni";

const TABS: { id: Tab; label: string; ownOnly?: boolean }[] = [
  { id: "principale", label: "Principale" },
  { id: "dati", label: "Dati" },
  { id: "caratteristiche", label: "Caratteristiche" },
  { id: "aspetto", label: "Aspetto" },
  { id: "storia", label: "Storia" },
  { id: "draghi", label: "Draghi" },
  { id: "opzioni", label: "Opzioni", ownOnly: true },
];

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })
    : "—";

// Scheda: linguette a sinistra, pagina a destra. La prima pagina e' l'immagine lunga
function CharacterSheet({
  character,
  isOwn,
  onCreate,
  onSaved,
}: {
  character: Character;
  isOwn: boolean;
  onCreate: () => void;
  onSaved: () => void;
}) {
  const active = character.status === "attivo";
  const [tab, setTab] = useState<Tab>("principale");
  // finche' il PG non e' attivo c'e' solo la prima pagina
  const tabs = active
    ? TABS.filter((t) => !t.ownOnly || isOwn)
    : TABS.slice(0, 1);

  return (
    <div className="flex h-[calc(100dvh-4.5rem)] flex-col bg-[#0d0b0b] lg:h-[min(37.5rem,calc(100dvh-4.5rem))] lg:flex-row">
      <nav
        aria-label="Pagine della scheda"
        className="flex shrink-0 overflow-x-auto border-b border-border bg-black/50 lg:w-52 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <div className="hidden border-b border-border px-4 py-4 lg:block">
          <p className="font-serif text-base leading-tight text-accent">
            {character.name}
          </p>
          {character.house && (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              {character.house.sigil_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.house.sigil_url}
                  alt=""
                  className="h-5 w-5 object-contain"
                />
              )}
              Casata {character.house.name}
            </p>
          )}
        </div>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`shrink-0 border-b-2 px-4 py-3 text-left text-xs font-semibold tracking-[0.16em] whitespace-nowrap uppercase transition-colors lg:border-b-0 lg:border-l-2 ${
              tab === t.id
                ? "border-accent bg-blood/20 text-accent"
                : "border-transparent text-muted hover:bg-white/5 hover:text-foreground"
            } ${t.id === "opzioni" ? "lg:mt-auto lg:border-t lg:border-t-border" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mx-auto min-h-0 w-full max-w-[46.875rem] flex-1 overflow-y-auto">
        {tab === "principale" && (
          <CoverPage character={character} isOwn={isOwn} onCreate={onCreate} />
        )}
        {active && tab === "dati" && <DataPage character={character} />}
        {active && tab === "caratteristiche" && (
          <AttributesPage character={character} />
        )}
        {active && tab === "aspetto" && (
          <TextPage title="Aspetto" text={character.appearance} />
        )}
        {active && tab === "storia" && (
          <TextPage title="Storia" text={character.description} />
        )}
        {active && tab === "draghi" && (
          <div className="p-6">
            <DragonSection
              characterId={character.id}
              characterName={character.name}
              houseId={character.house_id ?? null}
              isOwn={isOwn}
            />
          </div>
        )}
        {active && isOwn && tab === "opzioni" && (
          <div className="p-6">
            <ExtrasForm character={character} onSaved={onSaved} />
          </div>
        )}
      </div>
    </div>
  );
}

// Prima pagina: l'immagine lunga a tutta pagina, con il nome in basso
function CoverPage({
  character,
  isOwn,
  onCreate,
}: {
  character: Character;
  isOwn: boolean;
  onCreate: () => void;
}) {
  const active = character.status === "attivo";
  const cover = active ? character.cover_url : null;

  if (!active)
    return (
      <div className="flex h-full min-h-80 flex-col items-center justify-center p-8 text-center">
        <p className="font-serif text-3xl text-foreground">{character.name}</p>
        {isOwn ? (
          <>
            <p className="mt-4 max-w-sm text-muted">
              Il tuo personaggio non è ancora stato creato: finché non lo
              completi puoi esplorare mappa e documentazione, ma non giocare
              nelle chat.
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="btn mt-6 px-10 py-3 text-lg tracking-[0.2em] uppercase"
            >
              {character.creation_step > 0 ? "Continua creazione" : "Crea PG"}
            </button>
          </>
        ) : (
          <p className="mt-4 text-muted">
            Questo personaggio non ha ancora completato la creazione.
          </p>
        )}
      </div>
    );

  return (
    <div className="relative h-full min-h-[24rem] overflow-hidden">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#2a1612_0%,#0d0b0b_70%)] p-8 text-center">
          <p className="max-w-md text-sm text-muted">
            {isOwn ? (
              <>
                Qui va la tua{" "}
                <strong className="text-accent">immagine lunga</strong>:
                sceglila nella linguetta{" "}
                <strong className="text-accent">Opzioni</strong>. Si adatta a
                ogni schermo, quindi tieni al centro la parte importante (misura
                consigliata: 750 × 600, in orizzontale).
              </>
            ) : (
              "Nessuna immagine per questo personaggio."
            )}
          </p>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 pt-16 pb-5 sm:px-8">
        <p className="font-serif text-3xl tracking-wide text-[#f3ead8] drop-shadow sm:text-4xl">
          {character.name}
        </p>
        {character.house && (
          <p className="mt-1 text-sm tracking-[0.18em] text-[#d8c39a] uppercase">
            Casata {character.house.name}
            {character.house_role && <> · {character.house_role.name}</>}
          </p>
        )}
      </div>
    </div>
  );
}

// Dati: ritratto a sinistra, intestazione col nome e i dati in griglia
function DataPage({ character }: { character: Character }) {
  return (
    <div className="flex flex-col gap-5 p-5 sm:flex-row">
      <div className="shrink-0 sm:w-44">
        {character.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.avatar_url}
            alt=""
            className="aspect-[3/4] w-full border-4 border-[#3a2c2a] object-cover"
          />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center border-4 border-[#3a2c2a] bg-black/40 font-serif text-6xl text-accent">
            {character.name[0]}
          </div>
        )}
        <dl className="mt-3 space-y-2 text-sm">
          <Field label="Creato il" value={date(character.activated_at)} />
          <Field label="Prestavolto" value={character.face_claim || "—"} />
        </dl>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="border-b-2 border-blood bg-blood/25 px-4 py-3 font-serif text-2xl tracking-wide text-[#f3ead8]">
          {character.name}
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-5 text-sm">
          <Field label="Sesso" value={labelOf(SEXES, character.sex)} />
          <Field
            label="Età"
            value={character.age ? `${character.age} anni` : "—"}
          />
          <Field label="Origine" value={labelOf(REGIONS, character.region)} />
          <Field
            label="Ceto"
            value={labelOf(SOCIAL_CLASSES, character.social_class)}
          />
          <Field label="Casata" value={character.house?.name ?? "—"} />
          <Field
            label="Ruolo di casata"
            value={character.house_role?.name ?? "—"}
          />
        </dl>
      </div>
    </div>
  );
}

// Caratteristiche: ragnatela e barre
function AttributesPage({ character }: { character: Character }) {
  const values = ATTRIBUTES.map((a) => character.attributes?.[a.id] ?? 0);
  const max = Math.max(ATTRIBUTE_MAX, ...values);
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <Radar
        labels={ATTRIBUTES.map((a) => a.label)}
        values={values}
        max={max}
      />
      <ul className="w-full min-w-0 flex-1 space-y-3">
        {ATTRIBUTES.map((a, i) => (
          <li key={a.id}>
            <p className="flex justify-between text-xs font-semibold tracking-[0.14em] text-muted uppercase">
              {a.label}
              <span className="text-base text-accent">{values[i] || "—"}</span>
            </p>
            <div className="mt-1 h-2 bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-blood to-accent"
                style={{ width: `${(values[i] / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Radar({
  labels,
  values,
  max,
}: {
  labels: string[];
  values: number[];
  max: number;
}) {
  const c = 130;
  const r = 90;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const poly = (f: (i: number) => number) =>
    labels.map((_, i) => pt(i, f(i)).join(",")).join(" ");
  return (
    <svg
      viewBox="-45 0 350 260"
      className="w-80 max-w-full shrink-0"
      role="img"
      aria-label="Caratteristiche"
    >
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={poly(() => k)} fill="none" stroke="#3a2c2a" />
      ))}
      {labels.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#3a2c2a" />;
      })}
      <polygon
        points={poly((i) => values[i] / max)}
        fill="rgba(226,98,45,0.35)"
        stroke="#e2622d"
        strokeWidth="2"
      />
      {labels.map((l, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text
            key={l}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-[#968d89] text-[9px] uppercase"
          >
            {l}{" "}
            <tspan className="fill-[#e2622d] font-bold">
              {values[i] || ""}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function TextPage({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="p-6">
      <h3 className="mb-4 border-b border-border pb-2 font-serif text-2xl text-accent">
        {title}
      </h3>
      <p className="leading-relaxed whitespace-pre-line">{text || "—"}</p>
    </div>
  );
}

// Opzioni: prestavolto, immagine e immagine lunga (solo il proprietario)
function ExtrasForm({
  character,
  onSaved,
}: {
  character: Character;
  onSaved: () => void;
}) {
  const [faceClaim, setFaceClaim] = useState(character.face_claim ?? "");
  const [avatar, setAvatar] = useState(character.avatar_url ?? "");
  const [cover, setCover] = useState(character.cover_url ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await saveSheetExtras(character.id, faceClaim, avatar, cover);
    setSaving(false);
    if (res.error) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: "Salvato." });
    onSaved();
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <h3 className="border-b border-border pb-2 font-serif text-2xl text-accent">
        Opzioni
      </h3>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Prestavolto (nome e cognome)
        </span>
        <input
          value={faceClaim}
          onChange={(e) => setFaceClaim(e.target.value)}
          maxLength={80}
          placeholder="Es. Emilia Clarke"
          className="input py-1.5"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Ritratto (indirizzo dell&apos;immagine)
        </span>
        <input
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://..."
          className="input py-1.5"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
          Immagine lunga della prima pagina (indirizzo)
        </span>
        <input
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          maxLength={1000}
          placeholder="https://..."
          className="input py-1.5"
        />
        <span className="mt-1 block text-xs text-muted">
          Riempie tutta la prima pagina e si adatta allo schermo: tieni al
          centro la parte importante. Misura consigliata 750 × 600, in
          orizzontale.
        </span>
      </label>
      {cover.startsWith("https://") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt="Anteprima dell'immagine lunga"
          className="aspect-[5/4] w-60 border border-border object-cover"
        />
      )}
      <div className="flex items-center gap-3">
        <button className="btn px-4 py-1.5 text-sm" disabled={saving}>
          {saving ? "Salvataggio..." : "Salva"}
        </button>
        {msg && (
          <span
            className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-semibold tracking-[0.14em] text-muted uppercase">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
