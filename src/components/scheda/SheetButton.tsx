"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { saveSheetFields, type SheetFields } from "@/app/scheda/actions";
import DragonSection from "@/components/draghi/DragonSection";
import RichEditor from "@/components/guide/RichEditor";
import Modal from "@/components/ui/Modal";
import ModalButton from "@/components/ui/ModalButton";
import {
  ATTRIBUTES,
  ATTRIBUTE_MAX,
  SEXES,
  TEXT_MAX,
  labelOf,
  type CreationData,
} from "@/lib/character-creation";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import CreationWizard from "./CreationWizard";
import Affections from "./Affections";
import { cleanPlayerHtml } from "./player-html";
import { useSheetActions } from "./sheet-actions";
import SheetHtml, { SHEET_HTML_MAX } from "./SheetHtml";

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
  // bozza della creazione: caricata quando si apre la procedura guidata
  const [draft, setDraft] = useState<CreationData | null>(null);

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

  async function startCreation() {
    const { data } = await supabase
      .from("character_drafts")
      .select("data")
      .eq("character_id", characterId)
      .maybeSingle();
    setDraft((data?.data as CreationData | undefined) ?? {});
  }

  if (!character)
    return <p className="p-5 text-center text-muted">Caricamento...</p>;
  // La scheda e' modificabile solo dal proprietario
  const isOwn = viewerId !== null && viewerId === character.owner_id;

  if (draft && isOwn) {
    return (
      <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto p-5">
        <CreationWizard
          character={character}
          initialData={draft}
          onExit={() => load().then(() => setDraft(null))}
          onCreated={() =>
            load().then(() => {
              setDraft(null);
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
      onCreate={startCreation}
      onSaved={load}
    />
  );
}

type Tab =
  | "principale"
  | "dati"
  | "sisache"
  | "affetti"
  | "caratteristiche"
  | "aspetto"
  | "storia"
  | "draghi";

const TABS: { id: Tab; label: string }[] = [
  { id: "principale", label: "Principale" },
  { id: "dati", label: "Dati" },
  { id: "sisache", label: "Si sa che" },
  { id: "affetti", label: "Affetti" },
  { id: "caratteristiche", label: "Caratteristiche" },
  { id: "aspetto", label: "Aspetto" },
  { id: "storia", label: "Storia" },
  { id: "draghi", label: "Draghi" },
];

type SheetInfo = {
  last_entry: string | null;
  last_chat_action: string | null;
  can_write_fate: boolean;
  can_read_story: boolean;
};

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })
    : "—";

const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// Scheda: linguette a sinistra, pagina a destra (750 x 600). Ogni pagina che il
// proprietario puo' cambiare ha la sua pennina
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
  const supabase = useMemo(() => createClient(), []);
  const active = character.status === "attivo";
  const [tab, setTab] = useState<Tab>("principale");
  const [info, setInfo] = useState<SheetInfo | null>(null);
  const [otherSheet, setOtherSheet] = useState<string | null>(null); // scheda di un PG degli Affetti
  // finche' il PG non e' attivo c'e' solo la prima pagina
  const tabs = active ? TABS : TABS.slice(0, 1);

  useEffect(() => {
    if (!active) return;
    supabase
      .rpc("character_sheet_info", { p_character: character.id })
      .then(({ data }) =>
        setInfo(((data as SheetInfo[] | null) ?? [])[0] ?? null),
      );
  }, [supabase, character.id, active]);

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
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mx-auto min-h-0 w-full max-w-[46.875rem] flex-1 overflow-y-auto">
        {tab === "principale" && (
          <CoverPage
            key={character.id}
            character={character}
            isOwn={isOwn}
            onCreate={onCreate}
            onSaved={onSaved}
          />
        )}
        {active && tab === "dati" && (
          <DataPage
            character={character}
            isOwn={isOwn}
            info={info}
            onSaved={onSaved}
          />
        )}
        {active && tab === "sisache" && (
          <RichSection
            title="Si sa che"
            empty="Ancora niente: qui va ciò che si sa in giro di questo personaggio."
            hint="Le nozioni di base che chiunque può sapere del tuo personaggio: fama, voci, mestiere, aspetto riconoscibile."
            value={character.known_html ?? ""}
            field="knownHtml"
            character={character}
            isOwn={isOwn}
            onSaved={onSaved}
          />
        )}
        {active && tab === "affetti" && (
          <Affections
            characterId={character.id}
            isOwn={isOwn}
            onOpenSheet={setOtherSheet}
            pen={(onEdit, label) => <Pen onClick={onEdit} label={label} />}
          />
        )}
        {active && tab === "caratteristiche" && (
          <AttributesPage character={character} />
        )}
        {active && tab === "aspetto" && (
          <AppearancePage
            character={character}
            isOwn={isOwn}
            onSaved={onSaved}
          />
        )}
        {active && tab === "storia" && (
          <StoryPage character={character} info={info} />
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
      </div>
      <SheetModal
        characterId={otherSheet}
        onClose={() => setOtherSheet(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Pezzi comuni: titolo con pennina, salvataggio di una sezione
// ---------------------------------------------------------------------
function PageTitle({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <h3 className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2 font-serif text-2xl text-accent">
      {title}
      {onEdit && <Pen onClick={onEdit} label={`Modifica: ${title}`} />}
    </h3>
  );
}

function Pen({
  onClick,
  label,
  className = "",
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-black/60 text-muted transition hover:border-accent hover:text-accent ${className}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
      </svg>
    </button>
  );
}

// Salva i campi di una sezione e torna alla lettura
function useSectionSave(
  character: Character,
  onSaved: () => void,
  onDone: () => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(fields: SheetFields) {
    setBusy(true);
    setError(null);
    const res = await saveSheetFields(character.id, fields);
    setBusy(false);
    if (res.error) return setError(res.error);
    onSaved();
    onDone();
  }
  return { busy, error, save };
}

function EditButtons({
  busy,
  error,
  onSave,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="btn px-4 py-1.5 text-sm"
        >
          {busy ? "Salvataggio..." : "Salva"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="btn-ghost px-4 py-1.5 text-sm"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Principale: la pagina in HTML del giocatore oppure l'immagine lunga
// ---------------------------------------------------------------------
function CoverPage({
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
  const [editing, setEditing] = useState(false);
  // computer: quella orizzontale; cellulare (sotto i 1024px): quella verticale.
  // Se ne manca una si usa l'altra
  const cover = active
    ? character.cover_url || character.cover_mobile_url
    : null;
  const coverMobile = active ? character.cover_mobile_url : null;

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

  if (editing)
    return (
      <CoverEditor
        character={character}
        onSaved={onSaved}
        onDone={() => setEditing(false)}
      />
    );

  const pen = isOwn && (
    <Pen
      onClick={() => setEditing(true)}
      label="Modifica la pagina principale"
      className="absolute top-3 right-3 z-10"
    />
  );

  if (character.sheet_html?.trim())
    return (
      <div className="relative h-full min-h-[24rem]">
        <SheetHtml
          html={character.sheet_html}
          title={`Pagina principale di ${character.name}`}
        />
        {pen}
      </div>
    );

  return (
    <div className="relative h-full min-h-[24rem] overflow-hidden">
      {cover ? (
        <picture>
          {coverMobile && (
            <source media="(max-width: 1023.98px)" srcSet={coverMobile} />
          )}
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#2a1612_0%,#0d0b0b_70%)] p-8 text-center">
          <p className="max-w-md text-sm text-muted">
            {isOwn ? (
              <>
                Questa pagina è tua: con la{" "}
                <strong className="text-accent">pennina</strong> in alto a
                destra puoi metterci la tua{" "}
                <strong className="text-accent">immagine lunga</strong> (750 ×
                600, in orizzontale) oppure scriverla in{" "}
                <strong className="text-accent">HTML e CSS</strong>.
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
      {pen}
    </div>
  );
}

function CoverEditor({
  character,
  onSaved,
  onDone,
}: {
  character: Character;
  onSaved: () => void;
  onDone: () => void;
}) {
  const [cover, setCover] = useState(character.cover_url ?? "");
  const [coverMobile, setCoverMobile] = useState(
    character.cover_mobile_url ?? "",
  );
  const [html, setHtml] = useState(character.sheet_html ?? "");
  const [preview, setPreview] = useState(false);
  const { busy, error, save } = useSectionSave(character, onSaved, onDone);

  return (
    <div className="space-y-4 p-6">
      <PageTitle title="Pagina principale" />
      <ImageField
        label="Immagine lunga da computer"
        size="750 × 600"
        hint="Orizzontale. Riempie tutta la pagina principale vista dal computer: tieni al centro la parte importante."
        value={cover}
        onChange={setCover}
        frame="aspect-[5/4] w-60"
      />
      <ImageField
        label="Immagine lunga da cellulare"
        size="450 × 800"
        hint="Verticale (per più nitidezza anche 900 × 1600). È la pagina principale vista dal telefono; se la lasci vuota si usa quella da computer tagliata al centro."
        value={coverMobile}
        onChange={setCoverMobile}
        frame="aspect-[9/16] w-28"
      />
      <div className="space-y-2 border border-border/60 bg-black/30 p-3">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs tracking-wider text-muted uppercase">
          Pagina principale in HTML e CSS
          <strong className="text-sm tracking-normal text-accent normal-case">
            750 × 600 px
          </strong>
        </p>
        <p className="text-xs text-muted">
          Facoltativa: se la scrivi, nella pagina principale si vede questa al
          posto dell&apos;immagine lunga. Puoi usare HTML, CSS (anche dentro
          &lt;style&gt;), immagini https e i font di Google. Script, moduli,
          iframe e tutto ciò che può danneggiare il sito vengono tolti, e la
          pagina resta chiusa nel suo riquadro. Pensala per 750 × 600 sul
          computer; sul telefono è stretta e alta.
        </p>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          maxLength={SHEET_HTML_MAX}
          rows={8}
          spellCheck={false}
          placeholder={
            "<style>\n  h1 { color: #c9a45c; }\n</style>\n<h1>Il mio personaggio</h1>"
          }
          aria-label="Pagina principale in HTML e CSS"
          className="input resize-y font-mono text-xs"
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>
            {html.length.toLocaleString("it-IT")} /{" "}
            {SHEET_HTML_MAX.toLocaleString("it-IT")} caratteri
          </span>
          {html.trim() && (
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="hover:text-accent"
            >
              {preview ? "Nascondi anteprima" : "Mostra anteprima"}
            </button>
          )}
        </div>
        {preview && html.trim() && (
          <div className="aspect-[5/4] w-full border border-border">
            <SheetHtml html={html} title="Anteprima della pagina principale" />
          </div>
        )}
      </div>
      <EditButtons
        busy={busy}
        error={error}
        onSave={() =>
          save({
            coverUrl: cover,
            coverMobileUrl: coverMobile,
            sheetHtml: html,
          })
        }
        onCancel={onDone}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Dati: tutta l'anagrafica, i pulsanti per scrivere al PG e le Note del Fato
// ---------------------------------------------------------------------
function DataPage({
  character,
  isOwn,
  info,
  onSaved,
}: {
  character: Character;
  isOwn: boolean;
  info: SheetInfo | null;
  onSaved: () => void;
}) {
  const actions = useSheetActions();
  const [editing, setEditing] = useState(false);
  const contact = {
    id: character.id,
    name: character.name,
    avatar: character.avatar_url,
  };

  if (editing)
    return (
      <DataEditor
        character={character}
        onSaved={onSaved}
        onDone={() => setEditing(false)}
      />
    );

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0 sm:w-44">
          {character.portrait_url || character.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.portrait_url || character.avatar_url!}
              alt=""
              className="aspect-[3/4] w-full border-4 border-[#3a2c2a] object-cover"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center border-4 border-[#3a2c2a] bg-black/40 font-serif text-6xl text-accent">
              {character.name[0]}
            </div>
          )}
          {actions && !isOwn && (
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => actions.message("off", contact)}
                className="btn-ghost px-3 py-1.5 text-xs tracking-[0.14em] uppercase"
              >
                Missiva OFF
              </button>
              <button
                type="button"
                onClick={() => actions.message("missiva", contact)}
                className="btn px-3 py-1.5 text-xs tracking-[0.14em] uppercase"
              >
                Missiva ON
              </button>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center justify-between gap-3 border-b-2 border-blood bg-blood/25 px-4 py-3 font-serif text-2xl tracking-wide text-[#f3ead8]">
            {character.house
              ? `${character.name} ${character.house.name}`
              : character.name}
            {isOwn && (
              <Pen
                onClick={() => setEditing(true)}
                label="Modifica: prestavolto e immagini"
              />
            )}
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-5 text-sm">
            <Field label="Nome" value={character.name} />
            <Field label="Cognome" value={character.house?.name ?? "—"} />
            <Field label="Sesso" value={labelOf(SEXES, character.sex)} />
            <Field
              label="Età"
              value={character.age ? `${character.age} anni` : "—"}
            />
            <Field label="Casata" value={character.house?.name ?? "—"} />
            <Field
              label="Ruolo in casata"
              value={character.house_role?.name ?? "—"}
            />
            <Field label="Creazione" value={date(character.activated_at)} />
            <Field label="Prestavolto" value={character.face_claim || "—"} />
            <Field
              label="Ultimo login"
              value={info ? dateTime(info.last_entry) : "..."}
            />
            <Field
              label="Ultima azione"
              value={info ? dateTime(info.last_chat_action) : "..."}
            />
          </dl>
        </div>
      </div>
      <FateNotes
        character={character}
        canWrite={!!info?.can_write_fate}
        onSaved={onSaved}
      />
    </div>
  );
}

function DataEditor({
  character,
  onSaved,
  onDone,
}: {
  character: Character;
  onSaved: () => void;
  onDone: () => void;
}) {
  const [faceClaim, setFaceClaim] = useState(character.face_claim ?? "");
  const [avatar, setAvatar] = useState(character.avatar_url ?? "");
  const [portrait, setPortrait] = useState(character.portrait_url ?? "");
  const { busy, error, save } = useSectionSave(character, onSaved, onDone);

  return (
    <div className="space-y-4 p-6">
      <PageTitle title="Dati" />
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
      <ImageField
        label="Immagine di chat"
        size="100 × 100"
        hint="Quadrata. È l'immagine piccola che appare a sinistra vicino ai messaggi, negli OFF e negli elenchi dei presenti."
        value={avatar}
        onChange={setAvatar}
        frame="aspect-square w-[100px]"
      />
      <ImageField
        label="Ritratto della scheda"
        size="300 × 400"
        hint="Verticale. Appare in questa pagina Dati; se lo lasci vuoto si usa l'immagine di chat."
        value={portrait}
        onChange={setPortrait}
        frame="aspect-[3/4] w-[100px]"
      />
      <p className="text-xs text-muted">
        Nome, sesso, età e casata non si cambiano da qui: per correzioni apri un
        ticket.
      </p>
      <EditButtons
        busy={busy}
        error={error}
        onSave={() =>
          save({ faceClaim, avatarUrl: avatar, portraitUrl: portrait })
        }
        onCancel={onDone}
      />
    </div>
  );
}

// Note del Fato: le leggono tutti, le scrive solo chi ha il permesso "schede.note_fato"
function FateNotes({
  character,
  canWrite,
  onSaved,
}: {
  character: Character;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(character.fate_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("set_fate_notes", {
      p_character: character.id,
      p_text: text,
    });
    setBusy(false);
    if (error) return setError("Note del Fato non salvate.");
    setEditing(false);
    onSaved();
  }

  return (
    <section className="border border-[#5a3d22] bg-[#1a120c] px-4 py-3">
      <h4 className="flex items-center justify-between gap-2 font-serif text-lg text-[#d8c39a]">
        Note del Fato
        {canWrite && !editing && (
          <Pen
            onClick={() => setEditing(true)}
            label="Modifica le Note del Fato"
          />
        )}
      </h4>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            rows={5}
            className="input resize-y text-sm"
          />
          <EditButtons
            busy={busy}
            error={error}
            onSave={save}
            onCancel={() => {
              setEditing(false);
              setText(character.fate_notes ?? "");
            }}
          />
        </div>
      ) : (
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-[#e8d8b4]">
          {character.fate_notes || (
            <span className="text-muted">Nessuna nota.</span>
          )}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// "Si sa che" e "Affetti": testo libero del giocatore con l'editor
// ---------------------------------------------------------------------
function RichSection({
  title,
  empty,
  hint,
  value,
  field,
  character,
  isOwn,
  onSaved,
}: {
  title: string;
  empty: string;
  hint: string;
  value: string;
  field: "knownHtml";
  character: Character;
  isOwn: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const { busy, error, save } = useSectionSave(character, onSaved, () =>
    setEditing(false),
  );
  const clean = useMemo(() => cleanPlayerHtml(value), [value]);

  if (editing)
    return (
      <div className="space-y-3 p-6">
        <PageTitle title={title} />
        <p className="text-xs text-muted">{hint}</p>
        <RichEditor value={draft} onChange={setDraft} />
        <p className="text-xs text-muted">
          {draft.length.toLocaleString("it-IT")} / 20.000 caratteri
        </p>
        <EditButtons
          busy={busy}
          error={error}
          onSave={() => save({ [field]: draft })}
          onCancel={() => {
            setEditing(false);
            setDraft(value);
          }}
        />
      </div>
    );

  return (
    <div className="p-6">
      <PageTitle
        title={title}
        onEdit={isOwn ? () => setEditing(true) : undefined}
      />
      {clean.trim() ? (
        // contain: paint tiene dentro la pagina anche gli stili scritti dal giocatore
        <div
          className="guide-content overflow-hidden [contain:paint]"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      ) : (
        <p className="text-muted">{empty}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Aspetto: il giocatore lo aggiorna (cicatrici, capelli tagliati...)
// ---------------------------------------------------------------------
function AppearancePage({
  character,
  isOwn,
  onSaved,
}: {
  character: Character;
  isOwn: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(character.appearance ?? "");
  const { busy, error, save } = useSectionSave(character, onSaved, () =>
    setEditing(false),
  );

  return (
    <div className="p-6">
      <PageTitle
        title="Aspetto"
        onEdit={isOwn && !editing ? () => setEditing(true) : undefined}
      />
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={TEXT_MAX}
            rows={10}
            className="input resize-y"
          />
          <EditButtons
            busy={busy}
            error={error}
            onSave={() => save({ appearance: text })}
            onCancel={() => {
              setEditing(false);
              setText(character.appearance ?? "");
            }}
          />
        </div>
      ) : (
        <p className="leading-relaxed whitespace-pre-line">
          {character.appearance || "—"}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Storia: il background della creazione. La leggono solo master, moderatori
// e admin (permesso "schede.storia"); non si modifica piu'
// ---------------------------------------------------------------------
function StoryPage({
  character,
  info,
}: {
  character: Character;
  info: SheetInfo | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [story, setStory] = useState<string | null>(null);
  const canRead = !!info?.can_read_story;

  useEffect(() => {
    if (!canRead) return;
    supabase
      .from("character_backgrounds")
      .select("body")
      .eq("character_id", character.id)
      .maybeSingle()
      .then(({ data }) => setStory((data?.body as string | undefined) ?? ""));
  }, [supabase, character.id, canRead]);

  return (
    <div className="p-6">
      <PageTitle title="Storia" />
      {info === null ? (
        <p className="text-muted">Caricamento...</p>
      ) : !canRead ? (
        <p className="flex min-h-48 items-center justify-center text-center font-serif text-lg text-[#d8c39a]">
          Non hai i permessi per leggere.
        </p>
      ) : story === null ? (
        <p className="text-muted">Caricamento...</p>
      ) : (
        <>
          <p className="leading-relaxed whitespace-pre-line">{story || "—"}</p>
          <p className="mt-4 text-xs text-muted">
            Background scritto alla creazione del personaggio: non si modifica
            più.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Caratteristiche: ragnatela e barre
// ---------------------------------------------------------------------
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
        fill="rgba(201,164,92,0.35)"
        stroke="#c9a45c"
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
            <tspan className="fill-[#c9a45c] font-bold">
              {values[i] || ""}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

// Campo di un'immagine: titolo con la misura, indirizzo e riquadro in
// proporzione (vuoto mostra la misura, pieno l'anteprima)
function ImageField({
  label,
  size,
  hint,
  value,
  onChange,
  frame,
}: {
  label: string;
  size: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  frame: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 border border-border/60 bg-black/30 p-3">
      <div
        className={`${frame} flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-accent/50 bg-black/40`}
      >
        {value.startsWith("https://") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={`Anteprima: ${label}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-center font-serif text-sm text-accent">
            {size}
            <span className="block text-[0.65rem] text-muted">pixel</span>
          </span>
        )}
      </div>
      <label className="block min-w-48 flex-1">
        <span className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs tracking-wider text-muted uppercase">
          {label}
          <strong className="text-sm tracking-normal text-accent normal-case">
            {size} px
          </strong>
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={1000}
          placeholder="https://..."
          className="input py-1.5"
        />
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      </label>
    </div>
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
