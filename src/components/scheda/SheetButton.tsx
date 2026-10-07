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
import { dragonName, type Dragon } from "@/lib/dragons";
import RichEditor from "@/components/guide/RichEditor";
import Modal from "@/components/ui/Modal";
import ModalButton from "@/components/ui/ModalButton";
import {
  ATTRIBUTES,
  SEXES,
  TEXT_MAX,
  labelOf,
  type CreationData,
} from "@/lib/character-creation";
import { formatBirth, validBirth } from "@/lib/game-date";
import { RULES } from "@/lib/rules/config";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import CreationWizard from "./CreationWizard";
import Affections from "./Affections";
import Equipment from "./Equipment";
import { maritalLabel, VISIBLE_MARKS_MAX } from "@/lib/marital";
import { PaperRow, PaperSheet } from "./PaperSheet";
import BirthPicker from "./BirthPicker";
import { CustomFieldRows } from "./CustomFields";
import PregnancyRow from "./Pregnancy";
import { DerivedPanel, SkillsPage, TraitsPage } from "./RulesPages";
import SheetManage from "./SheetManage";
import SheetOptions from "./SheetOptions";
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
  const [name, setName] = useState("");

  return (
    <ModalButton
      label={trigger}
      title={sheetTitle(name)}
      size="pg"
      className={className}
      onOpen={() => setOpenCount((c) => c + 1)}
    >
      {() =>
        openCount > 0 ? (
          <SheetContent key={openCount} characterId={characterId} onName={setName} />
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
  const [name, setName] = useState("");
  return (
    <Modal
      open={characterId !== null}
      onClose={onClose}
      title={sheetTitle(name)}
      size="pg"
    >
      {characterId && (
        <SheetContent key={characterId} characterId={characterId} onName={setName} />
      )}
    </Modal>
  );
}

// Titolo della finestra: "Scheda" e nome e cognome del PG
const sheetTitle = (name: string) => (name ? `Scheda · ${name}` : "Scheda");
const fullNameOf = (c: Character) => (c.house ? `${c.name} ${c.house.name}` : c.name);

export function SheetContent({
  characterId,
  onName,
}: {
  characterId: string;
  onName?: (name: string) => void;
}) {
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
        .then(({ data }) => {
          setCharacter(data);
          if (data) onName?.(fullNameOf(data));
        }),
    [supabase, characterId, onName],
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
  | "abilita"
  | "tratti"
  | "aspetto"
  | "storia"
  | "equipaggiamento"
  | "opzioni" // icona in fondo, solo sulla propria scheda
  | "gestisci"; // icona in fondo: admin (o proprietario con la scheda sbloccata)

const TABS: { id: Tab; label: string }[] = [
  { id: "principale", label: "Principale" },
  { id: "dati", label: "Dati" },
  { id: "sisache", label: "Si sa che" },
  { id: "affetti", label: "Affetti" },
  { id: "caratteristiche", label: "Caratteristiche" },
  { id: "abilita", label: "Abilità" },
  { id: "tratti", label: "Tratti" },
  { id: "aspetto", label: "Aspetto" },
  { id: "storia", label: "Storia" },
  { id: "equipaggiamento", label: "Equipaggiamento" },
];

type SheetInfo = {
  last_entry: string | null;
  last_chat_action: string | null;
  can_write_fate: boolean;
  can_read_story: boolean;
  is_admin: boolean; // vede "Sblocca"
};

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
  // Gestisci: l'admin sempre, il proprietario solo con la scheda sbloccata
  // pennine di Abilita' e Tratti: admin e chi ha "schede.abilita" (es. moderatori)
  const [canRules, setCanRules] = useState(false);
  useEffect(() => {
    if (!active) return;
    supabase.rpc("can_manage_rules").then(({ data }) => setCanRules(data === true));
  }, [supabase, active]);
  const canManage = active && (!!info?.is_admin || (isOwn && !!character.sheet_unlocks?.includes("scheda")));
  // l'admin modifica le sezioni degli altri come se la scheda fosse sua
  const canEdit = isOwn || (active && !!info?.is_admin);

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
        <div className="hidden justify-center border-b border-border py-4 lg:flex">
          {character.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.avatar_url}
              alt={character.name}
              className="h-[100px] w-[100px] border-2 border-[#3a2c2a] object-cover"
            />
          ) : (
            <div className="flex h-[100px] w-[100px] items-center justify-center border-2 border-[#3a2c2a] bg-black/40 font-serif text-4xl text-accent">
              {character.name[0]}
            </div>
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
        {/* In fondo: Opzioni (propria scheda) e Gestisci (admin) */}
        {(canManage || (active && isOwn)) && (
          <div className="ml-auto flex shrink-0 items-center gap-1 px-2 lg:mt-auto lg:ml-0 lg:justify-center lg:border-t lg:border-border lg:py-3">
            {active && isOwn && (
              <BottomIcon label="Opzioni" active={tab === "opzioni"} onClick={() => setTab("opzioni")}>
                <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
                <circle cx="16" cy="6" r="2" />
                <circle cx="10" cy="12" r="2" />
                <circle cx="18" cy="18" r="2" />
              </BottomIcon>
            )}
            {canManage && (
              <BottomIcon label={info?.is_admin ? "Gestisci" : "Modifica scheda"} active={tab === "gestisci"} onClick={() => setTab("gestisci")}>
                <path d="M14.5 5.5a4 4 0 0 0 5 5L12 18a2.1 2.1 0 0 1-3-3l7.5-7.5" />
                <path d="M4 20l3-3" />
              </BottomIcon>
            )}
          </div>
        )}
      </nav>

      <div className="mx-auto min-h-0 w-full max-w-[46.875rem] flex-1 overflow-y-auto">
        {tab === "principale" && (
          <CoverPage
            key={character.id}
            character={character}
            isOwn={canEdit}
            onCreate={onCreate}
            onSaved={onSaved}
          />
        )}
        {active && tab === "dati" && (
          <DataPage
            character={character}
            isOwn={isOwn}
            canEdit={canEdit}
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
            isOwn={canEdit}
            onSaved={onSaved}
          />
        )}
        {active && tab === "affetti" && (
          <Affections
            characterId={character.id}
            isOwn={canEdit}
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
            isOwn={canEdit}
            onSaved={onSaved}
          />
        )}
        {active && tab === "storia" && (
          <StoryPage character={character} info={info} isOwn={isOwn} />
        )}
        {active && isOwn && tab === "opzioni" && <SheetOptions />}
        {canManage && tab === "gestisci" && <SheetManage character={character} isAdmin={!!info?.is_admin} onSaved={onSaved} />}
        {active && tab === "abilita" && <SkillsPage character={character} isOwn={isOwn} canEdit={canRules} onSaved={onSaved} />}
        {active && tab === "tratti" && <TraitsPage character={character} canEdit={canRules} onSaved={onSaved} />}
        {active && tab === "equipaggiamento" && (
          <Equipment characterId={character.id} isOwn={canEdit} />
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
  canEdit,
  info,
  onSaved,
}: {
  character: Character;
  isOwn: boolean;
  canEdit: boolean; // proprietario o admin
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
        isAdmin={!!info?.is_admin}
        onSaved={onSaved}
        onDone={() => setEditing(false)}
      />
    );

  const fullName = fullNameOf(character);

  return (
    <div className="space-y-6 p-5">
      <PaperSheet
        title={fullName}
        centered
        ribbon={
          character.house?.sigil_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.house.sigil_url} alt="" className="h-7 w-7 object-contain drop-shadow" />
          ) : (
            <span className="font-serif text-lg text-[#f0dcb4]">{character.name[0]}</span>
          )
        }
        titleAction={
          canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Modifica i dati"
              aria-label="Modifica i dati"
              className="shrink-0 p-1 text-[#7a1d16]/70 transition hover:text-[#7a1d16]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
              </svg>
            </button>
          )
        }
      >
        <div className="grid gap-x-6 sm:grid-cols-2">
          <PaperRow label="Sesso" value={labelOf(SEXES, character.sex)} />
          <PaperRow
            label="Età"
            value={
              character.age
                ? `${character.age} anni${character.birth_day && character.birth_month ? ` · nato il ${formatBirth(character.birth_day, character.birth_month, character.birth_year)}` : ""}`
                : "—"
            }
          />
          <PaperRow label="Casata" value={character.house?.name ?? "—"} />
          <PaperRow label="Ruolo in casata" value={character.house_role?.name ?? "—"} />
          <PaperRow label="Stato civile" value={<MaritalValue character={character} />} />
          <PaperRow label="Altezza" value={character.height || "—"} />
          <PaperRow label="Colore occhi" value={character.eye_color || "—"} />
          <PaperRow label="Colore capelli" value={character.hair_color || "—"} />
          <DragonField character={character} isOwn={isOwn} />
          {character.sex === "donna" && <PregnancyRow character={character} isOwn={isOwn} />}
        </div>
        <PaperRow label="Segni visibili" value={<span className="whitespace-normal">{character.visible_marks || "—"}</span>} />
        <CustomFieldRows character={character} />
      </PaperSheet>
      {actions && !isOwn && (
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => actions.message("off", contact)}
            className="btn-ghost px-5 py-1.5 text-xs tracking-[0.14em] uppercase"
          >
            Missiva OFF
          </button>
          <button
            type="button"
            onClick={() => actions.message("missiva", contact)}
            className="btn px-5 py-1.5 text-xs tracking-[0.14em] uppercase"
          >
            Missiva ON
          </button>
        </div>
      )}
      <FateNotes character={character} canWrite={!!info?.can_write_fate} onSaved={onSaved} />
    </div>
  );
}

function DataEditor({
  character,
  isAdmin,
  onSaved,
  onDone,
}: {
  character: Character;
  isAdmin: boolean;
  onSaved: () => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  // il prestavolto si sceglie una volta sola: poi lo cambia solo l'admin da Gestisci
  const locked = !!character.face_claim && !isAdmin;
  const [faceClaim, setFaceClaim] = useState(isAdmin ? (character.face_claim ?? "") : "");
  const [taken, setTaken] = useState<{ claim: string; by: boolean } | null>(null);
  const [avatar, setAvatar] = useState(character.avatar_url ?? "");
  const [looks, setLooks] = useState({
    height: character.height ?? "",
    eyeColor: character.eye_color ?? "",
    hairColor: character.hair_color ?? "",
    visibleMarks: character.visible_marks ?? "",
  });
  const { busy, error, save } = useSectionSave(character, onSaved, onDone);
  const claim = faceClaim.trim().replace(/\s+/g, " ");

  // controllo mentre si scrive: il prestavolto e' gia' di un altro PG?
  useEffect(() => {
    if (locked || claim.length < 3) return;
    const t = setTimeout(() => {
      supabase
        .from("characters")
        .select("id")
        .ilike("face_claim", claim.replace(/[\\%_]/g, "\\$&"))
        .neq("id", character.id)
        .limit(1)
        .then(({ data }) => setTaken({ claim, by: (data ?? []).length > 0 }));
    }, 400);
    return () => clearTimeout(t);
  }, [supabase, locked, claim, character.id]);
  const checked = taken?.claim === claim ? taken : null;

  // data di nascita: chi non l'ha ancora (PG creati prima) la indica una volta
  const needsBirth = !character.birth_year && !!character.age;
  const [birth, setBirth] = useState<{ day?: number; month?: number }>({});
  const [birthError, setBirthError] = useState<string | null>(null);

  async function saveAll() {
    if (!locked && claim && checked?.by) return;
    setBirthError(null);
    if (needsBirth && (birth.day || birth.month)) {
      if (!validBirth(birth.day, birth.month)) return setBirthError("Scegli un giorno e una luna validi.");
      const { error: e } = await supabase.rpc("set_birthday", { p_character: character.id, p_day: birth.day, p_month: birth.month });
      if (e) return setBirthError(e.message.length < 140 ? e.message : "Data di nascita non salvata.");
    }
    save(locked || !claim ? { avatarUrl: avatar, ...looks } : { faceClaim: claim, avatarUrl: avatar, ...looks });
  }

  return (
    <div className="space-y-4 p-6">
      <PageTitle title="Dati" />
      {locked ? (
        <div>
          <p className="mb-1 text-xs tracking-wider text-muted uppercase">Prestavolto</p>
          <p className="font-serif text-lg">{character.face_claim}</p>
          <p className="text-xs text-muted">Il prestavolto non si cambia più: può modificarlo solo l&apos;admin da Gestisci.</p>
        </div>
      ) : (
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Prestavolto (nome e cognome)</span>
          <input
            value={faceClaim}
            onChange={(e) => setFaceClaim(e.target.value)}
            maxLength={80}
            placeholder="Es. Emilia Clarke"
            className="input py-1.5"
          />
          {claim.length >= 3 && (
            <span className={`mt-1 block text-xs ${!checked ? "text-muted" : checked.by ? "text-red-400" : "text-green-400"}`}>
              {!checked ? "Controllo..." : checked.by ? "Questo prestavolto è già usato da un altro personaggio." : "Prestavolto libero."}
            </span>
          )}
          {!isAdmin && (
            <span className="mt-1 block text-xs text-[#f0c75e]">
              Attenzione: una volta salvato il prestavolto non si può più cambiare.
            </span>
          )}
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["height", "Altezza", 30, "Es. 1,80 m"],
            ["eyeColor", "Colore occhi", 40, "Es. grigi"],
            ["hairColor", "Colore capelli", 40, "Es. castano scuro"],
          ] as const
        ).map(([key, label, max, placeholder]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs tracking-wider text-muted uppercase">{label}</span>
            <input
              value={looks[key]}
              onChange={(e) => setLooks((x) => ({ ...x, [key]: e.target.value }))}
              maxLength={max}
              placeholder={placeholder}
              className="input py-1.5"
            />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Segni visibili</span>
        <textarea
          value={looks.visibleMarks}
          onChange={(e) => setLooks((x) => ({ ...x, visibleMarks: e.target.value }))}
          maxLength={VISIBLE_MARKS_MAX}
          rows={3}
          placeholder="Cicatrici, tatuaggi, voglie... ciò che chiunque può notare."
          className="input resize-y text-sm"
        />
        <span className={`text-xs ${looks.visibleMarks.length >= VISIBLE_MARKS_MAX ? "text-red-400" : "text-muted"}`}>
          {looks.visibleMarks.length} / {VISIBLE_MARKS_MAX} caratteri
        </span>
      </label>
      {needsBirth && (
        <div>
          <p className="mb-1 text-xs tracking-wider text-muted uppercase">Data di nascita</p>
          <BirthPicker value={birth} onChange={setBirth} />
          <p className="mt-1 text-xs text-[#f0c75e]">
            Giorno e luna di nascita: al compleanno l&apos;età cresce di un anno. Si indica una volta sola (poi la cambia
            solo l&apos;admin).
          </p>
        </div>
      )}
      <ImageField
        label="Immagine di chat"
        size="100 × 100"
        hint="Quadrata. È l'immagine piccola che appare in questa scheda, a sinistra vicino ai messaggi, negli OFF e negli elenchi dei presenti."
        value={avatar}
        onChange={setAvatar}
        frame="aspect-square w-[100px]"
      />
      <EditButtons busy={busy} error={birthError ?? error} onSave={saveAll} onCancel={onDone} />
    </div>
  );
}

// Stato civile, con il PG o il PNG per sposati e fidanzati ufficialmente
function MaritalValue({ character }: { character: Character }) {
  const supabase = useMemo(() => createClient(), []);
  const [partner, setPartner] = useState<{ id: string; name: string } | null>(null);
  const partnerId = character.partner_character_id;

  useEffect(() => {
    if (!partnerId) return;
    supabase
      .from("characters")
      .select("name, house:houses(name)")
      .eq("id", partnerId)
      .maybeSingle<{ name: string; house: { name: string } | null }>()
      .then(({ data }) =>
        setPartner(data ? { id: partnerId, name: data.house ? `${data.name} ${data.house.name}` : data.name } : null),
      );
  }, [supabase, partnerId]);

  const [open, setOpen] = useState<string | null>(null);
  const label = maritalLabel(character.marital_status, character.sex, true);
  const withName = character.marital_status === "sposato" || character.marital_status === "fidanzato";
  if (!withName) return <>{label}</>;
  return (
    <span className="whitespace-normal">
      {label}
      {partnerId ? (
        <>
          {" con "}
          <button
            type="button"
            onClick={() => setOpen(partnerId)}
            title="Apri la scheda"
            className="font-semibold text-[#7a1d16] underline-offset-2 hover:underline"
          >
            {partner?.id === partnerId ? partner.name : "..."}
          </button>
          <SheetModal characterId={open} onClose={() => setOpen(null)} />
        </>
      ) : (
        character.partner_npc && <> con {character.partner_npc} (PNG)</>
      )}
    </span>
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

  // Pannello di ferro scuro: titolo al centro, riga e testo delle note.
  // La pennina in alto a destra la vede solo chi puo' scriverle (permesso
  // "schede.note_fato": admin e moderatori)
  return (
    <section className="iron-panel relative p-4">
      {canWrite && !editing && (
        <Pen onClick={() => setEditing(true)} label="Modifica le Note del Fato" className="absolute top-3 right-3" />
      )}
      <div className="min-w-0">
        <h4 className="px-10 text-center font-serif text-2xl leading-tight text-[#efe6d6]">Note del Fato</h4>
        <div className="my-3 h-px bg-gradient-to-r from-transparent via-[#6b625a] to-transparent" />
        {editing ? (
          <div className="space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={5} className="input resize-y text-sm" />
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
          <p className="text-sm leading-relaxed whitespace-pre-line text-[#e4dccf]">
            {character.fate_notes || <span className="text-[#8d847a] italic">Nessuna nota.</span>}
          </p>
        )}
      </div>
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
// Storia: il background della creazione. La leggono il proprietario e chi ha
// "schede.storia" (admin, moderatori, master); gli altri leggono che non hanno
// i permessi. Si modifica solo da Gestisci
// ---------------------------------------------------------------------
function StoryPage({ character, info, isOwn }: { character: Character; info: SheetInfo | null; isOwn: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [story, setStory] = useState<{ body: string; submitted_at: string | null; approved_at: string | null } | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canRead = !!info?.can_read_story || isOwn;

  const load = useCallback(
    () =>
      supabase
        .from("character_backgrounds")
        .select("body, submitted_at, approved_at")
        .eq("character_id", character.id)
        .maybeSingle()
        .then(({ data }) =>
          setStory({
            body: (data?.body as string | undefined) ?? "",
            submitted_at: (data?.submitted_at as string | null) ?? null,
            approved_at: (data?.approved_at as string | null) ?? null,
          }),
        ),
    [supabase, character.id],
  );

  useEffect(() => {
    if (!canRead) return;
    load();
    supabase.rpc("can_approve_story").then(({ data }) => setCanApprove(data === true));
  }, [supabase, canRead, load]);

  const approved = !!story?.approved_at;
  const submitted = !!story?.submitted_at; // inviata: la proprietaria non la modifica piu'
  const canEdit = isOwn && !submitted;

  async function submit() {
    if (!window.confirm("Mandare la storia in approvazione? Dopo non potrai più modificarla, a meno che lo staff non la sblocchi.")) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("submit_my_story", { p_character: character.id });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message.length < 140 ? error.message : "Invio non riuscito." });
    setMsg({ ok: true, text: "Storia inviata in approvazione." });
    load();
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("save_my_story", { p_character: character.id, p_body: text });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message.length < 140 ? error.message : "Storia non salvata." });
    setEditing(false);
    setMsg({ ok: true, text: "Storia salvata." });
    load();
  }

  async function approve(on: boolean) {
    if (!window.confirm(on ? "Approvare la storia?" : "Sbloccare la storia? Torna in bozza e il giocatore può correggerla.")) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("approve_story", { p_character: character.id, p_on: on });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message.length < 140 ? error.message : "Operazione non riuscita." });
    setMsg({ ok: true, text: on ? "Storia approvata." : "Storia sbloccata." });
    load();
  }

  return (
    <div className="p-6">
      <PageTitle
        title="Storia"
        onEdit={canEdit && !editing ? () => (setText(story?.body ?? ""), setEditing(true)) : undefined}
      />
      {info === null && !isOwn ? (
        <p className="text-muted">Caricamento...</p>
      ) : !canRead ? (
        <p className="flex min-h-48 items-center justify-center text-center font-serif text-lg text-[#d8c39a]">
          Non hai i permessi per leggere.
        </p>
      ) : story === null ? (
        <p className="text-muted">Caricamento...</p>
      ) : (
        <>
          <p
            className={`mb-4 border px-3 py-2 text-sm ${
              approved
                ? "border-green-700/50 bg-green-900/15 text-green-300"
                : submitted
                  ? "border-sky-700/50 bg-sky-900/15 text-sky-300"
                  : "border-[#d4a72c]/40 bg-[#d4a72c]/5 text-[#f0c75e]"
            }`}
          >
            {approved
              ? `Storia approvata il ${new Date(story.approved_at!).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}.`
              : submitted
                ? isOwn
                  ? "Inviata in approvazione: non puoi più modificarla. Per correggerla chiedi allo staff di sbloccarla."
                  : "Inviata in approvazione."
                : isOwn
                  ? "Bozza: scrivila e correggila con la pennina, poi mandala in approvazione. Dopo l'invio non si modifica più."
                  : "Bozza: non ancora inviata in approvazione."}
          </p>
          {editing ? (
            <div className="space-y-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={14} className="input resize-y text-sm" />
              <p className="text-xs text-muted">{text.length} / 4.000 caratteri</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={save} className="btn px-4 py-1.5 text-sm">
                  {busy ? "Salvataggio..." : "Salva"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-4 py-1.5 text-sm">
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <p className="leading-relaxed whitespace-pre-line">
              {story.body || <span className="text-muted italic">{isOwn ? "Non hai ancora scritto la storia: usa la pennina." : "Storia non ancora scritta."}</span>}
            </p>
          )}
          {canEdit && !editing && story.body.trim() && (
            <div className="mt-5 border-t border-border pt-3">
              <button type="button" disabled={busy} onClick={submit} className="btn px-4 py-1.5 text-sm">
                Manda in approvazione
              </button>
            </div>
          )}
          {canApprove && !editing && submitted && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-3">
              {!approved && (
                <button type="button" disabled={busy} onClick={() => approve(true)} className="btn px-4 py-1.5 text-sm">
                  Approva la storia
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => approve(false)} className="btn-ghost px-4 py-1.5 text-sm">
                Sblocca la storia
              </button>
            </div>
          )}
          {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
          <p className="mt-4 text-xs text-muted">La storia la leggono solo il proprietario e lo staff.</p>
        </>
      )}
    </div>
  );
}

// Icona in fondo alle linguette (Opzioni, Gestisci)
function BottomIcon({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 w-10 items-center justify-center border transition ${
        active ? "border-accent bg-blood/20 text-accent" : "border-border text-muted hover:border-accent/60 hover:text-accent"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

// Drago del PG tra i dati: il nome apre la scheda del drago in una finestra
// sopra quella del personaggio (il proprietario la apre anche senza drago,
// per vedere le uova della casata)
function DragonField({
  character,
  isOwn,
}: {
  character: Character;
  isOwn: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [dragon, setDragon] = useState<Dragon | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("dragons")
      .select("*")
      .eq("rider_id", character.id)
      .maybeSingle()
      .then(({ data }) => setDragon((data as Dragon | null) ?? null));
  }, [supabase, character.id]);

  if (dragon === undefined) return <PaperRow label="Drago" value="..." />;
  if (!dragon && !isOwn) return <PaperRow label="Drago" value="—" />;

  return (
    <>
      <PaperRow
        label="Drago"
        value={
          <button type="button" onClick={() => setOpen(true)} className="font-semibold text-[#7a1d16] underline-offset-2 hover:underline">
            {dragon ? dragonName(dragon) : "Nessuno · uova della casata"}
          </button>
        }
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={dragon ? `Drago di ${character.name}` : "Draghi"}
        size="lg"
      >
        <DragonSection
          characterId={character.id}
          characterName={character.name}
          houseId={character.house_id ?? null}
          isOwn={isOwn}
        />
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------
// Caratteristiche: ragnatela e barre
// ---------------------------------------------------------------------
function AttributesPage({ character }: { character: Character }) {
  const values = ATTRIBUTES.map((a) => Number(character.attributes?.[a.id]) || 0);
  const max = Math.max(RULES.statMax, ...values);
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <h3 className="w-full border-b border-border pb-2 font-serif text-2xl text-accent">Caratteristiche</h3>
      <Radar
        labels={ATTRIBUTES.map((a) => a.code)}
        values={values}
        max={max}
      />
      <ul className="w-full min-w-0 flex-1 space-y-3">
        {ATTRIBUTES.map((a, i) => (
          <li key={a.id}>
            <p className="flex justify-between text-xs font-semibold tracking-[0.14em] text-muted uppercase" title={a.description}>
              {a.code} · {a.label}
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
      <DerivedPanel character={character} />
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
