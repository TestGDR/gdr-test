"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { logout } from "@/app/(pubblico)/login/actions";
import GuideButton from "@/components/guide/GuideButton";
import ModalButton from "@/components/ui/ModalButton";
import SheetButton from "@/components/scheda/SheetButton";
import { AVAILABILITY_COOKIE, type Availability } from "@/lib/availability";
import { GAME_DATE } from "@/lib/game-config";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";
import defaultAreaImage from "../../../public/images/home-bg.jpg";
import {
  BookIcon,
  CastleIcon,
  ChevronIcon,
  FlameIcon,
  GearIcon,
  MapIcon,
  MenuIcon,
  PowerIcon,
  RefreshIcon,
  SheetIcon,
  TicketIcon,
  ToolsIcon,
  UsersIcon,
} from "./icons";
import MessagesModal, { Avatar, type Contact, type MessageKind } from "./MessagesModal";
import OnlineModal, { BubbleIcon } from "./OnlineModal";
import AvailabilityDot from "./AvailabilityDot";
import { usePresence, type OnlinePlayer } from "./presence";

// ---------------------------------------------------------------------
// Zona attuale (titolo in alto + riquadro in colonna sinistra):
// ogni pagina del gioco la imposta con <GameArea title="..." />
// ---------------------------------------------------------------------
type Area = { title: string; image?: string | null };
const AreaContext = createContext<(area: Area) => void>(() => {});

export function GameArea({ title, image }: Area) {
  const setArea = useContext(AreaContext);
  useEffect(() => setArea({ title, image }), [setArea, title, image]);
  return null;
}

type Props = {
  userId: string;
  displayName: string;
  character: MainCharacter | null;
  staffRole: { name: string; color: string } | null;
  statusText: string;
  initialAvailability: Availability;
  children: ReactNode;
};

export default function GameShell({
  userId,
  displayName,
  character,
  staffRole,
  statusText,
  initialAvailability,
  children,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [area, setArea] = useState<Area>({ title: "Westeros" });
  const [leftOpen, setLeftOpen] = useState(true); // desktop
  const [rightOpen, setRightOpen] = useState(true); // desktop
  const [drawerOpen, setDrawerOpen] = useState(false); // cellulare
  const [phrase, setPhrase] = useState(statusText);
  const [availability, setAvailability] = useState(initialAvailability);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [messages, setMessages] = useState<{
    open: boolean;
    kind: MessageKind;
    to: Contact | null;
    session: number;
  }>({ open: false, kind: "off", to: null, session: 0 });

  // Presenze: dove sono io e chi c'e' online
  const chatId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const online = usePresence({
    userId,
    characterId: character?.id ?? null,
    name: character?.name ?? displayName,
    avatar: character?.avatar_url ?? null,
    house: character?.house?.name ?? null,
    sigil: character?.house?.sigil_url ?? null,
    staffRole: staffRole?.name ?? null,
    staffColor: staffRole?.color ?? null,
    active: character?.status === "attivo",
    phrase,
    availability,
    place: chatId ? "chat" : "mappa",
    placeKey: chatId ? `chat:${chatId}` : "mappa",
    placeLabel: area.title,
  });

  const unread = useUnread(character?.id ?? null);

  function openMessages(kind: MessageKind, to: Contact | null = null) {
    setMessages((m) => ({ open: true, kind, to, session: m.session + 1 }));
  }

  // La disponibilita' resta salvata in un cookie (letto dal server al prossimo caricamento)
  function changeAvailability(value: Availability) {
    document.cookie = `${AVAILABILITY_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    setAvailability(value);
  }

  async function savePhrase(value: string) {
    await supabase.from("profiles").update({ status_text: value || null }).eq("id", userId);
    setPhrase(value);
  }

  return (
    <AreaContext.Provider value={setArea}>
      <div className="flex h-dvh flex-col overflow-hidden">
        {/* Barra in alto: titolo al centro, con due icone per lato sempre accanto a lui */}
        <header className="bar relative z-30 flex h-14 shrink-0 items-center justify-center border-b pr-2 pl-11 md:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Apri pannello"
            className={`${topBtn} absolute left-1 md:hidden`}
          >
            <MenuIcon />
          </button>

          <div className="flex items-center gap-0.5 sm:gap-2">
            <GuideButton
              book="ambientazione"
              label="Ambientazione"
              className={topBtn}
              trigger={
                <>
                  <CastleIcon />
                  <TopTip>Ambientazione</TopTip>
                </>
              }
            />
            <GuideButton
              book="manuale"
              label="Manuale di Gioco"
              className={topBtn}
              trigger={
                <>
                  <BookIcon />
                  <TopTip>Manuale di Gioco</TopTip>
                </>
              }
            />

            <h1 className="mx-1 flex items-center gap-3 font-serif text-sm tracking-[0.1em] whitespace-nowrap text-accent uppercase drop-shadow-[0_0_10px_rgba(226,98,45,0.35)] sm:mx-3 sm:text-xl sm:tracking-[0.2em] md:text-2xl">
              <span className="hidden text-blood md:inline">
                <FlameIcon />
              </span>
              Westeros GDR
              <span className="hidden text-blood md:inline">
                <FlameIcon />
              </span>
            </h1>

            <ComingSoonButton title="Utility giocatore" icon={<ToolsIcon />} />
            <ComingSoonButton title="Ticket" icon={<TicketIcon />} />
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          {/* Sfondo scuro */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,#1b1412_0%,#0b0a0a_70%)]" />

          {/* Colonna sinistra: desktop fissa e richiudibile, cellulare a scomparsa */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/70 md:hidden"
              onClick={() => setDrawerOpen(false)}
            />
          )}
          {/* Desktop: la larghezza si anima fino a zero; il contenuto ha larghezza fissa
              cosi' non si deforma durante la transizione */}
          <aside
            inert={!leftOpen}
            className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-panel transition-[translate,width,opacity,border-color] duration-300 ease-in-out motion-reduce:transition-none md:static md:z-auto md:shrink-0 md:translate-x-0 md:overflow-hidden md:bg-black/40 ${
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            } ${leftOpen ? "md:w-64 md:opacity-100" : "md:w-0 md:border-transparent md:opacity-0"}`}
          >
            <div className="h-full w-72 overflow-y-auto p-3 md:w-64">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Chiudi pannello"
              className="mb-2 ml-auto block text-muted hover:text-accent md:hidden"
            >
              ✕
            </button>
            <LeftColumn
              area={area}
              userId={userId}
              displayName={displayName}
              character={character}
              online={online}
              onChangeAvailability={changeAvailability}
              unread={unread.counts}
              onOpenMessages={openMessages}
              onOpenOnline={() => setOnlineOpen(true)}
            />
            </div>
          </aside>

          <EdgeToggle side="left" open={leftOpen} onClick={() => setLeftOpen((v) => !v)} />

          {/* Centro: mappa, luoghi e chat */}
          <main className="min-w-0 flex-1 overflow-y-auto p-3 pb-20 md:p-5 md:pb-5">{children}</main>

          <EdgeToggle side="right" open={rightOpen} onClick={() => setRightOpen((v) => !v)} />

          {/* Colonna destra: icone (in basso su cellulare) */}
          <nav
            aria-label="Menu di gioco"
            inert={!rightOpen}
            className={`fixed inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around gap-1 overflow-x-auto border-t border-blood/60 bg-black/90 px-2 transition-[width,opacity,border-color] duration-300 ease-in-out motion-reduce:transition-none md:static md:h-auto md:shrink-0 md:flex-col md:justify-start md:gap-2 md:border-t-0 md:border-l md:bg-black/40 md:px-0 md:py-4 ${
              rightOpen
                ? "md:w-24 md:overflow-visible md:border-border md:opacity-100"
                : "md:w-0 md:overflow-hidden md:border-transparent md:opacity-0"
            }`}
          >
            <RightRail characterId={character?.id ?? null} isStaff={staffRole !== null} />
          </nav>
        </div>
      </div>

      {/* Modali sempre disponibili nel gioco */}
      {character && (
        <MessagesModal
          kind={messages.kind}
          open={messages.open}
          onClose={() => setMessages((m) => ({ ...m, open: false }))}
          me={character}
          initialTo={messages.to}
          session={messages.session}
          onRead={unread.refresh}
        />
      )}
      <OnlineModal
        open={onlineOpen}
        onClose={() => setOnlineOpen(false)}
        online={online}
        myUserId={userId}
        phrase={phrase}
        onSavePhrase={savePhrase}
        onChangeAvailability={changeAvailability}
        onMessageOff={(to) => openMessages("off", to)}
      />
    </AreaContext.Provider>
  );
}

// Linguetta per aprire/chiudere una colonna (solo desktop)
function EdgeToggle({
  side,
  open,
  onClick,
}: {
  side: "left" | "right";
  open: boolean;
  onClick: () => void;
}) {
  // freccia verso la colonna quando e' chiusa, verso il centro quando e' aperta
  const pointsLeft = side === "left" ? open : !open;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${open ? "Chiudi" : "Apri"} colonna ${side === "left" ? "sinistra" : "destra"}`}
      className="hidden w-5 shrink-0 items-center justify-center self-center rounded-sm border border-border bg-panel py-4 text-muted hover:border-accent hover:text-accent md:flex"
    >
      <ChevronIcon left={pointsLeft} />
    </button>
  );
}

function LeftColumn({
  area,
  userId,
  displayName,
  character,
  online,
  unread,
  onOpenMessages,
  onOpenOnline,
  onChangeAvailability,
}: {
  area: Area;
  userId: string;
  displayName: string;
  character: MainCharacter | null;
  online: OnlinePlayer[];
  unread: Record<MessageKind, number>;
  onOpenMessages: (kind: MessageKind) => void;
  onOpenOnline: () => void;
  onChangeAvailability: (value: Availability) => void;
}) {
  // Chi e' nel mio stesso posto (stessa mappa o stessa lista)
  const me = online.find((p) => p.userId === userId);
  const here = me ? online.filter((p) => p.placeKey === me.placeKey) : [];

  return (
    <div className="space-y-3">
      {/* Zona attuale */}
      <div className="relative h-32 overflow-hidden rounded-md border border-border">
        {area.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={area.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <Image src={defaultAreaImage} alt="" fill sizes="256px" className="object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <p className="absolute inset-x-2 bottom-2 truncate font-serif text-sm text-foreground">
          {area.title}
        </p>
      </div>

      {/* Data di gioco */}
      <div className="rounded-md border border-border bg-black/40 px-3 py-2 text-center font-serif text-xs tracking-[0.15em] text-accent uppercase">
        {GAME_DATE}
      </div>

      {/* Personaggio + messaggi */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-black/40 p-3">
        {/* L'immagine apre la scheda */}
        {character ? (
          <SheetButton
            characterId={character.id}
            className="group relative shrink-0 rounded focus-visible:outline-none"
            trigger={
              <>
                <span className="block rounded ring-accent transition group-hover:ring-2 group-focus-visible:ring-2">
                  <Avatar name={character.name} url={character.avatar_url} size="h-14 w-14" />
                </span>
                {character.status !== "attivo" && (
                  <span className="absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-orange-300/70 bg-black text-[11px] text-orange-300">
                    ⧗
                  </span>
                )}
                <Balloon>
                  {character.status === "attivo" ? "Apri la scheda" : "Apri la scheda (PG non ancora attivo)"}
                </Balloon>
              </>
            }
          />
        ) : (
          <Avatar name={displayName} size="h-14 w-14" />
        )}
        {character && (
          <div className="flex gap-2">
            <MessageButton
              label="Missive (messaggi in gioco)"
              count={unread.missiva}
              onClick={() => onOpenMessages("missiva")}
            >
              <ScrollIcon />
            </MessageButton>
            <MessageButton
              label="Messaggi OFF (fuori gioco)"
              count={unread.off}
              onClick={() => onOpenMessages("off")}
            >
              <BubbleIcon />
            </MessageButton>
          </div>
        )}
      </div>

      {/* Presenti: totale (apre l'elenco esteso) + chi e' qui con me */}
      <div className="rounded-md border border-border bg-black/40 p-3">
        <button
          type="button"
          onClick={onOpenOnline}
          className="w-full text-center font-serif text-sm tracking-[0.15em] uppercase hover:text-accent"
          title="Apri l'elenco di tutti i presenti"
        >
          <span className="text-accent">{online.length}</span> present{online.length === 1 ? "e" : "i"} online
        </button>
        <h3 className="mt-3 truncate border-b border-border pb-1 text-xs font-semibold tracking-[0.15em] text-accent uppercase">
          {me?.place === "chat" ? me.placeLabel : `In mappa · ${area.title}`}
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {here.map((p) => (
            <li key={p.userId} className="flex items-center gap-2">
              <AvailabilityDot
                value={p.availability}
                onChange={p.userId === userId ? onChangeAvailability : undefined}
              />
              {p.sigil && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.sigil} alt="" title={`Casata ${p.house}`} className="h-4 w-4 shrink-0 object-contain" />
              )}
              <span className={`truncate ${p.userId === userId ? "text-accent" : ""}`}>{p.name}</span>
              {!p.active && <span title="Personaggio non ancora attivo" className="text-xs text-orange-300">⧗</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MessageButton({
  label,
  count,
  onClick,
  children,
}: {
  label: string;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  // Solo l'icona; il nome compare nel fumetto al passaggio del mouse (o al focus da tastiera)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label}: ${count} non letti` : label}
      className="group relative flex h-9 w-11 items-center justify-center rounded border border-border bg-background text-muted transition hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
    >
      {children}
      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-5 rounded-full bg-blood px-1.5 text-[11px] font-bold text-white shadow">
          {count}
        </span>
      )}
      <Balloon>{label}</Balloon>
    </button>
  );
}

// Fumetto sopra l'elemento al passaggio del mouse (il genitore deve avere "group relative")
function Balloon({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded border border-blood/60 bg-black/95 px-2 py-1 text-xs font-normal whitespace-nowrap text-foreground opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-blood/60 after:content-['']"
    >
      {children}
    </span>
  );
}

const ScrollIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 4h11v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1h11v1a3 3 0 0 0 3 3M8 4a3 3 0 0 0-3 3v9M11 8h5M11 12h5" />
  </svg>
);

// Messaggi non letti per tipo, aggiornati in tempo reale
function useUnread(characterId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [counts, setCounts] = useState<Record<MessageKind, number>>({ missiva: 0, off: 0 });

  const fetchCounts = useCallback(async (): Promise<Record<MessageKind, number>> => {
    const count = (kind: MessageKind) =>
      supabase
        .from("private_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", characterId)
        .eq("kind", kind)
        .is("read_at", null)
        .then(({ count }) => count ?? 0);
    const [missiva, off] = await Promise.all([count("missiva"), count("off")]);
    return { missiva, off };
  }, [supabase, characterId]);

  const refresh = useCallback(() => {
    fetchCounts().then(setCounts);
  }, [fetchCounts]);

  useEffect(() => {
    if (!characterId) return;
    fetchCounts().then(setCounts);
    const ch = supabase
      .channel(`unread:${characterId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${characterId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, characterId, fetchCounts, refresh]);

  return { counts, refresh };
}

// ---------------------------------------------------------------------
// Barra in alto: pulsanti a icona con fumetto sotto
// ---------------------------------------------------------------------
const topBtn =
  "group relative flex h-8 w-8 shrink-0 sm:h-10 sm:w-10 items-center justify-center rounded-md text-muted transition hover:bg-blood/25 hover:text-accent focus-visible:text-accent focus-visible:outline-none";

function TopTip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 hidden -translate-x-1/2 rounded border border-blood/60 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-foreground opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-b-blood/60 before:content-[''] md:block"
    >
      {children}
    </span>
  );
}

// Sezioni non ancora realizzate: l'icona c'e' gia', il contenuto arrivera'
function ComingSoonButton({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <ModalButton
      title={title}
      className={topBtn}
      label={
        <>
          {icon}
          <TopTip>{title}</TopTip>
        </>
      }
    >
      {() => (
        <p className="py-6 text-center text-muted">
          La sezione <strong className="text-accent">{title}</strong> è in preparazione.
        </p>
      )}
    </ModalButton>
  );
}

// ---------------------------------------------------------------------
// Colonna destra: icone di navigazione
// ---------------------------------------------------------------------
const railBtn =
  "group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-blood/25 hover:text-accent";

function Tip({ children }: { children: ReactNode }) {
  // Etichetta al passaggio del mouse (solo desktop)
  return (
    <span className="pointer-events-none absolute right-full z-50 mr-2 hidden rounded border border-border bg-panel px-2 py-1 text-xs whitespace-nowrap text-foreground opacity-0 transition group-hover:opacity-100 md:block">
      {children}
    </span>
  );
}

function RightRail({ characterId, isStaff }: { characterId: string | null; isStaff: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = (href: string) => (pathname.startsWith(href) ? "text-accent" : "");

  return (
    <>
      <div className="contents md:grid md:grid-cols-2 md:justify-items-center md:gap-2">
        <button type="button" onClick={() => router.refresh()} className={railBtn} aria-label="Aggiorna">
          <RefreshIcon />
          <Tip>Aggiorna</Tip>
        </button>
        <Link href="/mappa" className={`${railBtn} ${active("/mappa")}`} aria-label="Mappa">
          <MapIcon />
          <Tip>Mappa</Tip>
        </Link>
        {characterId && (
          <SheetButton
            characterId={characterId}
            className={railBtn}
            trigger={
              <>
                <SheetIcon />
                <Tip>Scheda personaggio</Tip>
              </>
            }
          />
        )}
        <Link href="/personaggi" className={`${railBtn} ${active("/personaggi")}`} aria-label="Personaggi">
          <UsersIcon />
          <Tip>Personaggi</Tip>
        </Link>
        {/* Pannelli di gestione: solo staff */}
        {isStaff && (
          <Link href="/gestione" className={`${railBtn} ${active("/gestione")}`} aria-label="Gestione">
            <GearIcon />
            <Tip>Gestione</Tip>
          </Link>
        )}
      </div>
      <form action={logout} className="md:mt-auto">
        <button className={`${railBtn} text-red-500 hover:text-red-400`} aria-label="Esci">
          <PowerIcon />
          <Tip>Esci</Tip>
        </button>
      </form>
    </>
  );
}
