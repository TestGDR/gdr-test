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
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { logout } from "@/app/(pubblico)/login/actions";
import GuideButton from "@/components/guide/GuideButton";
import ModalButton from "@/components/ui/ModalButton";
import SheetButton, { SheetModal } from "@/components/scheda/SheetButton";
import { SheetActionsContext } from "@/components/scheda/sheet-actions";
import { AVAILABILITY_COOKIE, type Availability } from "@/lib/availability";
import { GAME_DATE } from "@/lib/game-config";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";
import { everyEvenInBackground, playMessageChime } from "@/lib/notify-sound";
import defaultAreaImage from "../../../public/images/home-bg.jpg";
import {
  BookIcon,
  CompassIcon,
  FiefIcon,
  MarketIcon,
  ForumIcon,
  CastleIcon,
  ChevronIcon,
  DragonIcon,
  GearIcon,
  HornIcon,
  HourglassIcon,
  InfoIcon,
  MapIcon,
  MenuIcon,
  PowerIcon,
  RefreshIcon,
  ScrollIcon,
  SwordsIcon,
  TicketIcon,
  ToolsIcon,
  UsersIcon,
  WeatherIcon,
} from "./icons";
import NewsPanel from "./NewsPanel";
import NewsBook from "./NewsBook";
import PlayRequestsPanel, { usePlayRequestsUnseen } from "./PlayRequests";
import AbsencesPanel from "./AbsencesPanel";
import TravelPanel from "./TravelPanel";
import FiefsPanel from "@/components/houses/FiefsPanel";
import MarketPanel from "./MarketPanel";
import Forum from "@/components/forum/Forum";
import { ForumUnreadContext, useForumUnread } from "@/components/forum/forum-data";
import { useNewsUnseen } from "./news-unseen";
import Tickets from "./Tickets";
import MessagesModal, { Avatar, type Contact, type MessageKind } from "./MessagesModal";
import OnlineModal, { BubbleIcon } from "./OnlineModal";
import UtilityButton from "./UtilityPanel";
import AvailabilityDot from "./AvailabilityDot";
import { usePresence, type OnlinePlayer } from "./presence";
import SalaryCollector from "./SalaryCollector";
import WeatherView from "./WeatherView";
import DragonPanel from "@/components/draghi/DragonPanel";
import Modal from "@/components/ui/Modal";

// ---------------------------------------------------------------------
// Zona attuale (titolo in alto + riquadro in colonna sinistra):
// ogni pagina del gioco la imposta con <GameArea title="..." />
// ---------------------------------------------------------------------
type Area = { title: string; image?: string | null; description?: string | null; weatherRegionId?: string | null };
const AreaContext = createContext<(area: Area) => void>(() => {});
// Notizie ON / OFF nuove, non ancora viste: l'icona cambia colore
const NewsUnseenContext = createContext<{ on: boolean; off: boolean }>({ on: false, off: false });
// Ticket: quanti da leggere e come aprire la finestra dei ticket
const TicketContext = createContext<{ count: number; open: () => void }>({ count: 0, open: () => {} });

export function GameArea({ title, image, description, weatherRegionId }: Area) {
  const setArea = useContext(AreaContext);
  useEffect(() => setArea({ title, image, description, weatherRegionId }), [setArea, title, image, description, weatherRegionId]);
  return null;
}

type Props = {
  userId: string;
  displayName: string;
  character: MainCharacter | null;
  staffRole: { name: string; color: string } | null;
  statusText: string;
  initialAvailability: Availability;
  canEditDocs: boolean; // puo' modificare Manuale e Ambientazione
  canManage: boolean; // vede la rotella della Gestione (moderatori e admin)
  canWriteNewsOn: boolean; // scrive le Notizie ON (admin, master, moderatori)
  canWriteNewsOff: boolean; // scrive le Notizie OFF
  canBroadcast: boolean; // scrive i messaggi OFF a tutti
  canModerate: boolean; // toglie le richieste di gioco altrui
  canManageUsers: boolean; // toglie le assenze altrui
  canManageTickets: boolean; // staff dei ticket: vede e gestisce tutti i ticket
  canTicketCategories: boolean; // gestisce le categorie dei ticket
  canCastleArchive: boolean; // legge l'Archivio messaggi castello
  canChooseOrigin: boolean; // sceglie da dove parte un cartiglio
  canModerateForum: boolean; // modera il forum
  canManageForum: boolean; // categorie e sezioni del forum
  children: ReactNode;
};

// Pannelli aperti dalla barra di destra (o dal menu del cellulare)
type Panel = "notizie-on" | "notizie-off" | "ricerca" | "assenze" | "viaggio" | "feudi" | "mercato" | "forum";
const PANEL_TITLE: Record<Panel, string> = {
  "notizie-on": "Notizie ON",
  "notizie-off": "Notizie OFF",
  ricerca: "Ricerca gioco",
  assenze: "Assenze",
  viaggio: "Viaggio",
  feudi: "Feudi e risorse della casata",
  mercato: "Mercato",
  forum: "Forum",
};

export default function GameShell({
  userId,
  displayName,
  character,
  staffRole,
  statusText,
  initialAvailability,
  canEditDocs,
  canManage,
  canWriteNewsOn,
  canWriteNewsOff,
  canBroadcast,
  canModerate,
  canManageUsers,
  canManageTickets,
  canTicketCategories,
  canCastleArchive,
  canChooseOrigin,
  canModerateForum,
  canManageForum,
  children,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [area, setArea] = useState<Area>({ title: "Westeros" });
  const [leftOpen, setLeftOpen] = useState(true); // desktop
  const [rightOpen, setRightOpen] = useState(true); // desktop
  const [drawerOpen, setDrawerOpen] = useState(false); // cellulare
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (pathname !== drawerPath) {
    // cambiando pagina il pannello del cellulare si richiude
    setDrawerPath(pathname);
    setDrawerOpen(false);
  }
  const [phrase, setPhrase] = useState(statusText);
  const [availability, setAvailability] = useState(initialAvailability);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [dragonOpen, setDragonOpen] = useState(0); // 0 = chiuso; a ogni apertura cambia e ricarica i dati
  const [sheetId, setSheetId] = useState<string | null>(null); // scheda aperta dalla lista dei presenti
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
  const [panel, setPanel] = useState<Panel | null>(null);
  const playRequests = usePlayRequestsUnseen(userId, panel === "ricerca");
  const tickets = useTicketUnread(userId);
  const [ticketsOpen, setTicketsOpen] = useState(0); // 0 = chiuso; a ogni apertura si ricarica
  // dalla scheda di un PG: Missiva OFF / Missiva ON verso di lui
  const sheetActions = useMemo(() => ({ message: (kind: MessageKind, to: Contact) => openMessages(kind, to) }), []);
  const forumUnread = useForumUnread(userId); // discussioni con interventi nuovi: l'icona del forum si accende
  const ticketCtx = useMemo(() => ({ count: tickets.count, open: () => setTicketsOpen((n) => n + 1) }), [tickets.count]);
  const news = useNewsUnseen(userId, panel === "notizie-on" ? "on" : panel === "notizie-off" ? "off" : null);
  const [panelSession, setPanelSession] = useState(0); // a ogni apertura il pannello si ricarica
  const openPanel = (p: Panel) => {
    setPanel(p);
    setPanelSession((n) => n + 1);
    if (p === "notizie-on") news.markSeen("on");
    if (p === "notizie-off") news.markSeen("off");
  };

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
      <NewsUnseenContext.Provider value={news.unseen}>
      <TicketContext.Provider value={ticketCtx}>
      <ForumUnreadContext.Provider value={forumUnread.count}>
      <SheetActionsContext.Provider value={sheetActions}>
      <div className="flex h-dvh flex-col overflow-hidden">
        {/* Barra in alto: titolo al centro, con due icone per lato sempre accanto a lui.
            Cellulare: al posto del titolo l'immagine del personaggio, a destra missive e OFF */}
        <header className="relative z-30 flex h-14 shrink-0 items-center justify-center border-b border-border bg-black/85 pr-2 pl-11 backdrop-blur-sm lg:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={playRequests.count > 0 ? "Apri pannello: nuove richieste di gioco" : news.unseen.on || news.unseen.off ? "Apri pannello: notizie nuove" : "Apri pannello"}
            className={`${menuBtn} absolute left-2 lg:hidden ${playRequests.count > 0 ? "blink-call" : news.unseen.on || news.unseen.off ? "news-new" : ""}`}
          >
            <MenuIcon />
          </button>

          <div className="flex items-center gap-0.5 sm:gap-2">
            <GuideButton
              book="ambientazione"
              label="Ambientazione"
              canEdit={canEditDocs}
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
              canEdit={canEditDocs}
              className={topBtn}
              trigger={
                <>
                  <BookIcon />
                  <TopTip>Manuale di Gioco</TopTip>
                </>
              }
            />

            <h1 className="mx-1 hidden items-center gap-3 font-serif text-sm tracking-[0.1em] whitespace-nowrap text-accent uppercase drop-shadow-[0_0_10px_rgba(201,164,92,0.35)] sm:mx-3 sm:text-xl sm:tracking-[0.2em] lg:flex lg:text-2xl">
              Westeros GDR
            </h1>

            <span className="mx-2 lg:hidden">
              <CharacterPicture character={character} displayName={displayName} size="h-9 w-9" small medieval />
            </span>

            <span className="hidden lg:contents">
              <UtilityButton
                className={topBtn}
                trigger={
                  <>
                    <ToolsIcon />
                    <TopTip>Utility giocatore</TopTip>
                  </>
                }
              />
              <TicketButton className={topBtn} tip />
            </span>

            {character && (
              <span className="contents lg:hidden">
                <TopMessageButton label="Missive" count={unread.counts.missiva} onClick={() => openMessages("missiva")}>
                  <QuillIcon />
                </TopMessageButton>
                <TopMessageButton label="Messaggi OFF" count={unread.counts.off} onClick={() => openMessages("off")}>
                  <BubbleIcon />
                </TopMessageButton>
              </span>
            )}
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          {/* Sfondo: pietra scura */}
          <div className="stone-bg pointer-events-none absolute inset-0 -z-10" />

          {/* Colonna sinistra: desktop fissa e richiudibile, cellulare a scomparsa */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/70 lg:hidden"
              onClick={() => setDrawerOpen(false)}
            />
          )}
          {/* Desktop: la larghezza si anima fino a zero; il contenuto ha larghezza fissa
              cosi' non si deforma durante la transizione */}
          <aside
            inert={!leftOpen}
            className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-panel transition-[translate,width,opacity,border-color] duration-300 ease-in-out motion-reduce:transition-none lg:static lg:z-auto lg:shrink-0 lg:translate-x-0 lg:overflow-hidden lg:bg-black/40 ${
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            } ${leftOpen ? "lg:w-64 lg:opacity-100" : "lg:w-0 lg:border-transparent lg:opacity-0"}`}
          >
            <div className="h-full w-72 overflow-y-auto p-3 lg:w-64">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Chiudi pannello"
              className="mb-2 ml-auto block text-muted hover:text-accent lg:hidden"
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
              onOpenSheet={setSheetId}
              mobileTools={
                <MobileTools
                  canManage={canManage}
                  onlineCount={online.length}
                  onOpenOnline={() => setOnlineOpen(true)}
                  onOpenDragon={character ? () => setDragonOpen((n) => n + 1) : null}
                  onOpenPanel={openPanel}
                  newRequests={playRequests.count}
                  inHouse={!!character?.house}
                />
              }
            />
            </div>
          </aside>

          <EdgeToggle side="left" open={leftOpen} onClick={() => setLeftOpen((v) => !v)} />

          {/* Centro: mappa, luoghi e chat */}
          <main className="min-w-0 flex-1 overflow-y-auto p-3 pb-20 lg:p-5 lg:pb-5">{children}</main>

          <EdgeToggle side="right" open={rightOpen} onClick={() => setRightOpen((v) => !v)} />

          {/* Colonna destra: icone (in basso su cellulare) */}
          <nav
            aria-label="Menu di gioco"
            inert={!rightOpen}
            className={`fixed inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around gap-1 overflow-x-auto border-t border-blood/60 bg-black/90 px-2 transition-[width,opacity,border-color] duration-300 ease-in-out motion-reduce:transition-none lg:static lg:h-auto lg:shrink-0 lg:flex-col lg:justify-start lg:gap-2 lg:border-t-0 lg:border-l lg:bg-black/40 lg:px-0 lg:py-4 ${
              rightOpen
                ? "lg:w-24 lg:overflow-visible lg:border-border lg:opacity-100"
                : "lg:w-0 lg:overflow-hidden lg:border-transparent lg:opacity-0"
            }`}
          >
            <RightRail
              canManage={canManage}
              onOpenDragon={character ? () => setDragonOpen((n) => n + 1) : null}
              onOpenPanel={openPanel}
              newRequests={playRequests.count}
              inHouse={!!character?.house}
            />
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
          canBroadcast={canBroadcast}
          isAdmin={canCastleArchive}
          isStaff={canChooseOrigin}
        />
      )}
      <SheetModal characterId={sheetId} onClose={() => setSheetId(null)} />
      <SalaryCollector />
      <Modal open={ticketsOpen > 0} onClose={() => setTicketsOpen(0)} title="Ticket" size="xl">
        {ticketsOpen > 0 && <Tickets key={ticketsOpen} me={character} isStaff={canManageTickets} isAdmin={canTicketCategories} onSeen={tickets.refresh} />}
      </Modal>
      {character && (
        <Modal open={dragonOpen > 0} onClose={() => setDragonOpen(0)} title="Il mio drago" size="sheet">
          {dragonOpen > 0 && <DragonPanel key={dragonOpen} characterId={character.id} />}
        </Modal>
      )}
      <Modal open={panel !== null} onClose={() => setPanel(null)} title={panel ? PANEL_TITLE[panel] : ""}
        size={panel === "ricerca" || panel === "assenze" || panel === "viaggio" ? "panel" : panel === "notizie-on" || panel === "forum" ? "xl" : "lg"}
      >
        {panel === "notizie-on" && <NewsBook key={panelSession} canWrite={canWriteNewsOn} />}
        {panel === "notizie-off" && <NewsPanel key={panelSession} kind="off" canWrite={canWriteNewsOff} />}
        {panel === "ricerca" && (
          <PlayRequestsPanel
            key={panelSession}
            userId={userId}
            character={character}
            canModerate={canModerate}
            onMessageOff={(to) => openMessages("off", to)}
            onSeen={playRequests.markSeen}
          />
        )}
        {panel === "feudi" && character && <FiefsPanel key={panelSession} characterId={character.id} />}
        {panel === "mercato" && <MarketPanel key={panelSession} character={character} />}
        {panel === "forum" && (
          <Forum
            key={panelSession}
            userId={userId}
            canModerate={canModerateForum}
            canManage={canManageForum}
            onUnreadChanged={forumUnread.refresh}
          />
        )}
        {panel === "viaggio" &&
          (character ? (
            <TravelPanel key={panelSession} me={character} />
          ) : (
            <p className="py-6 text-center text-muted">Per viaggiare serve un personaggio.</p>
          ))}
        {panel === "assenze" && (
          <AbsencesPanel key={panelSession} userId={userId} character={character} canManage={canManageUsers} />
        )}
      </Modal>
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
      </SheetActionsContext.Provider>
      </ForumUnreadContext.Provider>
      </TicketContext.Provider>
      </NewsUnseenContext.Provider>
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
      className="hidden w-5 shrink-0 items-center justify-center self-center rounded-sm border border-border bg-panel py-4 text-muted hover:border-accent hover:text-accent lg:flex"
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
  onOpenSheet,
  mobileTools,
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
  onOpenSheet: (characterId: string) => void;
  mobileTools: ReactNode;
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
        {/* Meteo e info luogo: quadratini neri a destra, al centro in verticale */}
        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 flex-col gap-1.5">
          <ModalButton
            title="Meteo"
            size="lg"
            className={areaBtn}
            label={
              <>
                <WeatherIcon />
                <span className="sr-only">Meteo</span>
                <Balloon>Meteo</Balloon>
              </>
            }
          >
            {() => <WeatherView regionId={area.weatherRegionId ?? null} />}
          </ModalButton>
          <ModalButton
            title={area.title}
            size="lg"
            className={areaBtn}
            label={
              <>
                <InfoIcon />
                <span className="sr-only">Info luogo</span>
                <Balloon>Info luogo</Balloon>
              </>
            }
          >
            {() => <PlaceInfo area={area} />}
          </ModalButton>
        </div>
      </div>

      {/* Data di gioco */}
      <div className="parchment mx-auto px-6 py-1.5 text-center [font-family:Verdana,Geneva,Tahoma,sans-serif] text-[0.625rem] font-bold tracking-[0.04em] whitespace-nowrap uppercase">
        {GAME_DATE}
      </div>

      {/* Cellulare: gestione, utility, ticket e presenti (il personaggio e' nella barra in alto) */}
      <div className="lg:hidden">{mobileTools}</div>

      {/* Personaggio + messaggi (computer) */}
      <div className="hidden items-center py-1 lg:flex">
        {/* L'immagine apre la scheda */}
        <CharacterPicture character={character} displayName={displayName} size="h-[4.5rem] w-[4.5rem]" balloon medieval />
        {character && (
          // Missive e OFF davanti a uno stendardo che esce dalla cornice del ritratto
          <div className="relative -ml-1 flex flex-1 items-center justify-center gap-3 py-3 pr-3 pl-2">
            <BannerArt />
            <MessageButton
              label="Missive (messaggi in gioco)"
              count={unread.missiva}
              onClick={() => onOpenMessages("missiva")}
            >
              <QuillIcon />
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

      {/* Presenti: totale (apre l'elenco esteso) + chi e' qui con me.
          Solo computer: su cellulare c'e' l'icona dei presenti nel pannello */}
      <div className="hidden rounded-md border border-border bg-black/40 p-3 lg:block">
        <button
          type="button"
          onClick={onOpenOnline}
          className="w-full text-center font-serif text-sm tracking-[0.15em] uppercase hover:text-accent"
          title="Apri l'elenco di tutti i presenti"
        >
          <span className="text-accent">{online.length}</span> present{online.length === 1 ? "e" : "i"} online
        </button>
        <h3 className="mt-3 truncate border-b border-border pb-1 text-xs font-semibold tracking-[0.15em] text-accent uppercase">
          {me?.place === "chat" ? (
            <Link href={`/chat/${me.placeKey.replace(/^chat:/, "")}`} className="hover:underline" title={`Vai in ${me.placeLabel}`}>
              {me.placeLabel}
            </Link>
          ) : (
            "Mappa"
          )}
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {here.map((p) => (
            <li
              key={p.userId}
              className={`flex items-center gap-2 ${p.live ? "" : "opacity-50"}`}
              title={p.live ? undefined : "Connessione momentaneamente persa: resta nell'elenco per qualche minuto"}
            >
              <AvailabilityDot
                value={p.availability}
                onChange={p.userId === userId ? onChangeAvailability : undefined}
              />
              {p.sigil && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.sigil} alt="" title={`Casata ${p.house}`} className="h-4 w-4 shrink-0 object-contain" />
              )}
              {/* Il nome apre la scheda del personaggio */}
              <button
                type="button"
                onClick={() => p.characterId && onOpenSheet(p.characterId)}
                disabled={!p.characterId}
                title={p.characterId ? `Apri la scheda di ${p.name}` : undefined}
                className={`font-name truncate text-left hover:underline disabled:no-underline ${p.userId === userId ? "text-accent" : ""}`}
              >
                {p.name}
              </button>
              {!p.active && <span title="Personaggio non ancora attivo" className="text-xs text-amber-200">⧗</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Immagine quadrata del personaggio: apre la scheda
function CharacterPicture({
  character,
  displayName,
  size,
  balloon,
  small,
  medieval,
}: {
  character: MainCharacter | null;
  displayName: string;
  size: string;
  balloon?: boolean;
  small?: boolean; // cornice sottile (barra in alto del cellulare)
  medieval?: boolean; // cornice di ferro con piastre chiodate
}) {
  const frame = medieval
    ? `frame-medieval ${small ? "frame-medieval-sm" : ""} block`
    : `frame-gold ${small ? "frame-gold-sm" : ""} block`;
  if (!character)
    return (
      <span className={frame}>
        <Avatar name={displayName} size={size} bare />
      </span>
    );
  return (
    <SheetButton
      characterId={character.id}
      className={`group relative block shrink-0 rounded focus-visible:outline-none ${medieval ? "z-20" : ""}`}
      trigger={
        <>
          {/* Immagine dentro la cornice dorata; al passaggio si illumina */}
          <span className={`${frame} transition group-hover:brightness-125 group-focus-visible:brightness-125`}>
            <Avatar name={character.name} url={character.avatar_url} size={size} bare />
          </span>
          {character.status !== "attivo" && (
            <span className="absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-amber-200/70 bg-black text-[0.6875rem] text-amber-200">
              ⧗
            </span>
          )}
          {balloon && (
            <Balloon>{character.status === "attivo" ? "Apri la scheda" : "Apri la scheda (PG non ancora attivo)"}</Balloon>
          )}
        </>
      }
    />
  );
}

// Cellulare: icone del pannello a scomparsa
const drawerBtn =
  "group relative flex h-12 w-full items-center justify-center text-muted transition hover:text-accent";

function MobileTools({
  canManage,
  onlineCount,
  onOpenOnline,
  onOpenDragon,
  onOpenPanel,
  newRequests,
  inHouse,
}: {
  canManage: boolean;
  onlineCount: number;
  onOpenOnline: () => void;
  onOpenDragon: (() => void) | null;
  onOpenPanel: (p: Panel) => void;
  newRequests: number;
  inHouse: boolean; // appartiene a una casata: vede i Feudi
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {canManage && (
        <Link href="/gestione" className={`${drawerBtn} ${goldGear}`} aria-label="Gestione">
          <GearIcon />
        </Link>
      )}
      <UtilityButton
        className={drawerBtn}
        trigger={
          <>
            <ToolsIcon />
            <span className="sr-only">Utility giocatore</span>
          </>
        }
      />
      <TicketButton className={drawerBtn} />
      {onOpenDragon && (
        <button type="button" onClick={onOpenDragon} className={drawerBtn} aria-label="Il mio drago">
          <DragonIcon />
        </button>
      )}
      <button type="button" onClick={onOpenOnline} className={drawerBtn} aria-label={`${onlineCount} presenti online: apri l'elenco`}>
        <UsersIcon />
        <span className="absolute -top-2 -right-1 min-w-5 rounded-full bg-blood px-1.5 text-center text-[0.6875rem] font-bold text-white shadow">
          {onlineCount}
        </span>
      </button>
      {panelsFor(inHouse).map((p) => (
        <PanelButton key={p.id} panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={drawerBtn} />
      ))}
    </div>
  );
}

// Cellulare: missive e OFF nella barra in alto
function TopMessageButton({ label, count, onClick, children }: { label: string; count: number; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={count > 0 ? `${label}: ${count} non letti` : label} className={`${topBtn} ${count > 0 ? "message-glow" : ""}`}>
      {children}
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">{count}</span>
      )}
    </button>
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
      className={`group relative z-10 flex h-9 w-9 items-center justify-center text-[#e2c99a] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] transition hover:text-accent focus-visible:text-accent focus-visible:outline-none ${count > 0 ? "message-glow" : ""}`}
    >
      {children}
      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-5 rounded-full bg-blood px-1.5 text-[0.6875rem] font-bold text-white shadow">
          {count}
        </span>
      )}
      <Balloon>{label}</Balloon>
    </button>
  );
}

// Stendardo di stoffa rosso scuro con coda a rondine, attaccato alla cornice del ritratto
function BannerArt() {
  return (
    <svg
      viewBox="0 0 120 52"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_3px_6px_rgba(0,0,0,0.8)]"
      aria-hidden
    >
      <defs>
        <linearGradient id="banner-cloth" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5e1611" />
          <stop offset=".18" stopColor="#3d0d0a" />
          <stop offset=".38" stopColor="#62180f" />
          <stop offset=".6" stopColor="#3a0c09" />
          <stop offset=".8" stopColor="#5a150f" />
          <stop offset="1" stopColor="#300a07" />
        </linearGradient>
        <linearGradient id="banner-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".45" />
        </linearGradient>
      </defs>
      {/* stoffa con coda a rondine */}
      <path d="M0 7 H116 L104 26 L116 45 H0 Z" fill="url(#banner-cloth)" />
      <path d="M0 7 H116 L104 26 L116 45 H0 Z" fill="url(#banner-shade)" />
    </svg>
  );
}

// Fumetto sopra l'elemento al passaggio del mouse (o al focus da tastiera).
// Si disegna direttamente nella pagina, sopra a tutto: le colonne con lo
// scorrimento non lo tagliano piu'. Basta metterlo dentro l'elemento.
function Balloon({ children }: { children: ReactNode }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const anchor = marker.current?.parentElement;
    if (!anchor) return;
    const show = () => {
      const r = anchor.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    };
    const hide = () => setPos(null);
    anchor.addEventListener("mouseenter", show);
    anchor.addEventListener("mouseleave", hide);
    anchor.addEventListener("focusin", show);
    anchor.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      anchor.removeEventListener("mouseenter", show);
      anchor.removeEventListener("mouseleave", hide);
      anchor.removeEventListener("focusin", show);
      anchor.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  return (
    <span ref={marker} hidden>
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
            className="pointer-events-none fixed z-[80] -mt-2 -translate-x-1/2 -translate-y-full border border-blood/60 bg-black/95 px-2 py-1 text-xs font-normal whitespace-nowrap text-foreground shadow-lg after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-blood/60 after:content-['']"
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}

// Missive (messaggi in gioco): piuma d'oca
const QuillIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20.5 3.5C14 3.5 8.5 7.5 7 14l-1.5 1.5" />
    <path d="M20.5 3.5c0 6.5-4 12-10.5 13.5L8.5 18.5" />
    <path d="M10 13.5l3.5-3.5M12.5 15.5l3-3M9 11l2.5-2.5" />
    <path d="M7 14l3.5 3.5M3.5 20.5l4-4" />
  </svg>
);

// Messaggi non letti per tipo, aggiornati in tempo reale
function useUnread(characterId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname(); // cambiando pagina il titolo torna quello di base: si rimette il numero
  const [counts, setCounts] = useState<Record<MessageKind, number>>({ missiva: 0, off: 0 });
  const nextDelivery = useRef<string | null>(null); // prossimo cartiglio in arrivo

  const fetchCounts = useCallback(async (): Promise<Record<MessageKind, number>> => {
    const count = (kind: MessageKind) =>
      supabase
        .from("private_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", characterId)
        .eq("kind", kind)
        .is("read_at", null)
        .then(({ count }) => count ?? 0);
    const [scrolls, off, offShared] = await Promise.all([
      // missive: cartigli gia' consegnati e ancora sigillati; prossima consegna in arrivo
      supabase
        .rpc("scrolls_unread", { p_character: characterId })
        .then(({ data }) => ((data as { unread: number; next_delivery: string | null }[] | null) ?? [])[0] ?? { unread: 0, next_delivery: null }),
      count("off"),
      supabase.rpc("off_unread", { p_character: characterId }).then(({ data }) => (data as number | null) ?? 0),
    ]);
    nextDelivery.current = scrolls.next_delivery;
    return { missiva: scrolls.unread, off: off + offShared };
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
      // letto da un altro dispositivo o da un'altra scheda
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "private_messages", filter: `recipient_id=eq.${characterId}` },
        () => refresh(),
      )
      // gruppi e messaggi a tutti
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_group_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_group_members" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_broadcasts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "system_messages", filter: `character_id=eq.${characterId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcast_reads", filter: `character_id=eq.${characterId}` }, () => refresh())
      // un cartiglio e' partito per me: si conta all'ora di consegna
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scroll_notices", filter: `character_id=eq.${characterId}` }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, characterId, fetchCounts, refresh]);

  // Cartiglio in arrivo: all'ora di consegna l'icona delle missive si accende
  const [deliveryTick, setDeliveryTick] = useState(0);
  useEffect(() => {
    const next = nextDelivery.current;
    if (!next) return;
    const wait = Math.max(0, Date.parse(next) - Date.now()) + 1500;
    const timer = setTimeout(() => fetchCounts().then((c) => (setCounts(c), setDeliveryTick((t) => t + 1))), Math.min(wait, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [counts, deliveryTick, fetchCounts]);

  // Avviso sonoro: subito quando arriva un messaggio, poi ogni 15 secondi finche' resta
  // qualcosa da leggere. Suona anche con la scheda in secondo piano.
  const total = counts.missiva + counts.off;
  const previous = useRef(0);
  useEffect(() => {
    if (total > previous.current) playMessageChime();
    previous.current = total;
    if (total === 0) return;
    return everyEvenInBackground(playMessageChime, 15_000);
  }, [total]);

  // Numero dei non letti nel titolo della scheda, es. "(2) Westeros GDR"
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = total > 0 ? `(${total}) ${base}` : base;
  }, [total, pathname]);

  return { counts, refresh };
}

// ---------------------------------------------------------------------
// Barra in alto: pulsanti a icona con fumetto sotto
// ---------------------------------------------------------------------
// Pulsanti piccoli sull'immagine del luogo: quadratini neri
const areaBtn =
  "group relative flex h-7 w-7 items-center justify-center bg-black/85 text-[#e2c99a] shadow-[0_2px_6px_rgb(0_0_0/0.8)] transition hover:text-accent focus-visible:text-accent focus-visible:outline-none [&_svg]:h-4 [&_svg]:w-4";

// Info luogo: immagine, nome e descrizione della zona in cui ci si trova
function PlaceInfo({ area }: { area: Area }) {
  return (
    <div className="space-y-4">
      {area.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={area.image} alt="" className="max-h-64 w-full object-cover" />
      )}
      <h3 className="font-serif text-2xl text-accent">{area.title}</h3>
      {area.description ? (
        <p className="text-sm leading-relaxed whitespace-pre-line">{area.description}</p>
      ) : (
        <p className="text-sm text-muted">Nessuna descrizione per questo luogo.</p>
      )}
    </div>
  );
}

// Ogni icona sta in un rombo rosso scuro, stoffa come lo stendardo dei messaggi (senza bordo)
const topBtn =
  "group relative isolate flex h-9 w-9 shrink-0 sm:h-11 sm:w-11 items-center justify-center text-[#e2c99a] transition hover:text-accent focus-visible:text-accent focus-visible:outline-none [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-[1.125rem] sm:[&_svg]:w-[1.125rem] before:absolute before:inset-[16%] before:-z-10 before:rotate-45 before:bg-[linear-gradient(135deg,#62180f_0%,#3d0d0a_35%,#5a150f_65%,#300a07_100%)] before:shadow-[0_2px_6px_rgb(0_0_0/0.7)] before:transition hover:before:brightness-125";
// Pulsante del menu (cellulare): senza rombo
const menuBtn =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-blood/25 hover:text-accent";

function TopTip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 hidden -translate-x-1/2 rounded border border-blood/60 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-foreground opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-b-blood/60 before:content-[''] lg:block"
    >
      {children}
    </span>
  );
}

// Ticket: apre la finestra dei ticket; lampeggia finche' ci sono risposte (o, per lo staff, richieste) da leggere
function TicketButton({ className, tip }: { className: string; tip?: boolean }) {
  const { count, open } = useContext(TicketContext);
  const label = count > 0 ? `Ticket: ${count} da leggere` : "Ticket";
  return (
    <button type="button" onClick={open} className={`${className} ${count > 0 ? "blink-call" : ""}`} aria-label={label}>
      <TicketIcon />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">{count}</span>
      )}
      {tip && <TopTip>{label}</TopTip>}
    </button>
  );
}

function useTicketUnread(userId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);
  const fetchCount = useCallback(
    () => supabase.rpc("ticket_unread_ids").then(({ data }) => ((data as unknown[] | null) ?? []).length),
    [supabase],
  );
  const refresh = useCallback(() => {
    fetchCount().then(setCount);
  }, [fetchCount]);
  useEffect(() => {
    fetchCount().then(setCount);
    const ch = supabase
      .channel(`ticket-da-leggere:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, fetchCount, refresh]);

  // risposta nuova a un ticket: suona (l'icona lampeggia finche' non si apre il ticket)
  const previous = useRef(0);
  useEffect(() => {
    if (count > previous.current) playMessageChime();
    previous.current = count;
  }, [count]);

  return { count, refresh };
}

// ---------------------------------------------------------------------
// Colonna destra: icone di navigazione
// ---------------------------------------------------------------------
const railBtn =
  "group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-blood/25 hover:text-accent";

function Tip({ children }: { children: ReactNode }) {
  // Etichetta al passaggio del mouse (solo desktop)
  return (
    <span className="pointer-events-none absolute right-full z-50 mr-2 hidden rounded border border-border bg-panel px-2 py-1 text-xs whitespace-nowrap text-foreground opacity-0 transition group-hover:opacity-100 lg:block">
      {children}
    </span>
  );
}

// Notizie, ricerca gioco e assenze: per tutti i giocatori
const PANEL_ICONS: { id: Panel; icon: ReactNode }[] = [
  { id: "notizie-on", icon: <ScrollIcon /> },
  { id: "notizie-off", icon: <HornIcon /> },
  { id: "ricerca", icon: <SwordsIcon /> },
  { id: "assenze", icon: <HourglassIcon /> },
  { id: "viaggio", icon: <CompassIcon /> },
  { id: "feudi", icon: <FiefIcon /> },
  { id: "mercato", icon: <MarketIcon /> },
  { id: "forum", icon: <ForumIcon /> },
];
// Feudi: solo per chi appartiene a una casata
const panelsFor = (inHouse: boolean) => PANEL_ICONS.filter((p) => p.id !== "feudi" || inHouse);
const panelLabel = (p: Panel, newRequests: number, newNews: boolean) =>
  p === "forum" && newNews
    ? "Forum: interventi nuovi"
    : p === "ricerca" && newRequests > 0
    ? `Ricerca gioco: ${newRequests} ${newRequests === 1 ? "richiesta nuova" : "richieste nuove"}`
    : newNews
      ? `${PANEL_TITLE[p]}: notizie nuove`
      : PANEL_TITLE[p];

function PanelButton({
  panel,
  icon,
  newRequests,
  onOpen,
  className,
  tip,
}: {
  panel: Panel;
  icon: ReactNode;
  newRequests: number;
  onOpen: (p: Panel) => void;
  className: string;
  tip?: boolean;
}) {
  const calling = panel === "ricerca" && newRequests > 0; // lampeggia finche' non si apre
  const unseen = useContext(NewsUnseenContext);
  const forumNew = useContext(ForumUnreadContext);
  const newNews =
    (panel === "notizie-on" && unseen.on) || (panel === "notizie-off" && unseen.off) || (panel === "forum" && forumNew > 0); // dorata finche' non si apre
  return (
    <button
      type="button"
      onClick={() => onOpen(panel)}
      className={`${className} ${calling ? "blink-call" : newNews ? "news-new" : ""}`}
      aria-label={panelLabel(panel, newRequests, newNews)}
    >
      {icon}
      {calling && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">
          {newRequests}
        </span>
      )}
      {/* Forum: quante discussioni hanno risposte nuove */}
      {panel === "forum" && forumNew > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">
          {forumNew}
        </span>
      )}
      {tip && <Tip>{panelLabel(panel, newRequests, newNews)}</Tip>}
    </button>
  );
}

// Rotella della Gestione: dorata
const goldGear =
  "text-[#d4a72c] drop-shadow-[0_0_4px_rgb(212_167_44/0.45)] hover:text-[#f0c75e] hover:drop-shadow-[0_0_6px_rgb(240_199_94/0.7)]";

function RightRail({
  canManage,
  onOpenDragon,
  onOpenPanel,
  newRequests,
  inHouse,
}: {
  canManage: boolean;
  onOpenDragon: (() => void) | null;
  onOpenPanel: (p: Panel) => void;
  newRequests: number;
  inHouse: boolean; // appartiene a una casata: vede i Feudi
}) {
  const router = useRouter();
  const pathname = usePathname();
  const active = (href: string) => (pathname.startsWith(href) ? "text-accent" : "");

  return (
    <>
      <div className="contents lg:grid lg:grid-cols-2 lg:justify-items-center lg:gap-2">
        {/* In chat: resta e aggiorna i messaggi. Altrove: torna alla mappa aggiornata */}
        <button
          type="button"
          onClick={() => {
            if (pathname.startsWith("/chat/") || pathname === "/mappa") router.refresh();
            else router.push("/mappa");
          }}
          className={railBtn}
          aria-label={pathname.startsWith("/chat/") ? "Aggiorna la chat" : "Torna alla mappa e aggiorna"}
        >
          <RefreshIcon />
          <Tip>{pathname.startsWith("/chat/") ? "Aggiorna la chat" : "Torna alla mappa e aggiorna"}</Tip>
        </button>
        <Link href="/mappa" className={`${railBtn} ${active("/mappa")}`} aria-label="Mappa">
          <MapIcon />
          <Tip>Mappa</Tip>
        </Link>
        {/* Il mio drago (su cellulare sta nel menu dell'hamburger) */}
        {onOpenDragon && (
          <button type="button" onClick={onOpenDragon} className={`${railBtn} max-lg:hidden`} aria-label="Il mio drago">
            <DragonIcon />
            <Tip>Il mio drago</Tip>
          </button>
        )}
        {/* Pannelli di gestione: solo moderatori e admin (su cellulare stanno nel pannello) */}
        {canManage && (
          <Link href="/gestione" className={`${railBtn} ${goldGear} max-lg:hidden`} aria-label="Gestione">
            <GearIcon />
            <Tip>Gestione</Tip>
          </Link>
        )}
        {/* Notizie, ricerca gioco e assenze (su cellulare stanno nel menu dell'hamburger) */}
        {panelsFor(inHouse).map((p) => (
          <PanelButton
            key={p.id}
            panel={p.id}
            icon={p.icon}
            newRequests={newRequests}
            onOpen={onOpenPanel}
            className={`${railBtn} max-lg:hidden`}
            tip
          />
        ))}
      </div>
      <form action={logout} className="lg:mt-auto">
        <button className={`${railBtn} text-red-500 hover:text-red-400`} aria-label="Esci">
          <PowerIcon />
          <Tip>Esci</Tip>
        </button>
      </form>
    </>
  );
}
