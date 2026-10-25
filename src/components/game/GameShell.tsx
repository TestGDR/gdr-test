"use client";

import Image from "next/image";
import PrefetchLink from "@/components/ui/PrefetchLink";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  Fragment,
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
import GameDateLabel from "./GameDateLabel";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";
import { everyEvenInBackground, playEvent, playMessageChime } from "@/lib/notify-sound";
import { applyPrefs, cachedPrefs, loadPrefs } from "@/lib/prefs";
import { isDue, markDone } from "@/lib/throttle";
import defaultAreaImage from "../../../public/images/home-bg.jpg";
import {
  BookIcon,
  CompassIcon,
  FiefIcon,
  MarketIcon,
  ForumIcon,
  GossipIcon,
  CalendarIcon,
  FaqIcon,
  SpyIcon,
  CastleIcon,
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
import NewsBook from "./NewsBook";
import PlayRequestsPanel, { usePlayRequestsUnseen } from "./PlayRequests";
import AbsencesPanel from "./AbsencesPanel";
import CalendarPanel, { useEventsUnseen } from "./CalendarPanel";
import FaqPanel from "./FaqPanel";
import SpiesPanel from "./SpiesPanel";
import TravelPanel from "./TravelPanel";
import FiefsPanel from "@/components/houses/FiefsPanel";
import MarketPanel from "./MarketPanel";
import GossipPanel, { useGossipPending } from "./GossipPanel";
import { useIdleLogout } from "./idle-logout";
import Forum from "@/components/forum/Forum";
import { ForumUnreadContext, useForumUnread } from "@/components/forum/forum-data";
import { HighlightsModal, useForumHighlights } from "@/components/forum/ForumHighlights";
import { useNewsUnseen } from "./news-unseen";
import Tickets from "./Tickets";
import MessagesModal, { Avatar, type Contact, type MessageKind } from "./MessagesModal";
import OnlineModal, { BubbleIcon } from "./OnlineModal";
import UtilityButton from "./UtilityPanel";
import GameArchive from "./GameArchive";
import AvailabilityDot from "./AvailabilityDot";
import { QuestContext, useQuestMode } from "./quest";
import { usePresence, type OnlinePlayer } from "./presence";
import { setInvisible } from "@/app/(gioco)/chat/presence-actions";
import SalaryCollector from "./SalaryCollector";
import WeatherView from "./WeatherView";
import DragonPanel from "@/components/draghi/DragonPanel";
import Modal from "@/components/ui/Modal";
import { HOUSE_BANNERS } from "@/lib/house-banners";
import { HpBar, ListCaption, MapTab, Pannello, TabDivider, TabLabel, listBtn, tabBtn, useCharacterStatus } from "./DesktopLayout";

// ---------------------------------------------------------------------
// Zona attuale (titolo in alto + riquadro in colonna sinistra):
// ogni pagina del gioco la imposta con <GameArea title="..." />
// ---------------------------------------------------------------------
type Area = { title: string; image?: string | null; description?: string | null; weatherRegionId?: string | null };
const AreaContext = createContext<(area: Area) => void>(() => {});
// Notizie ON / OFF nuove, non ancora viste: l'icona cambia colore
const NewsUnseenContext = createContext<{ on: boolean; off: boolean }>({ on: false, off: false });
// ricerche di gioco ancora aperte (anche gia' lette): la voce resta evidenziata
const PlayRequestsActiveContext = createContext(0);
// Eventi creati dopo l'ultima apertura del calendario: l'icona si accende
const EventsUnseenContext = createContext(false);
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
  canHighlightForum: boolean; // segnala i post a tutti
  canReviewGossip: boolean; // approva i pettegolezzi
  hasDragon: boolean; // cavalca un drago: vede "Il mio drago"
  canInvisible: boolean; // ha il permesso dell'invisibilita'
  initialInvisible: boolean; // e' invisibile adesso
  children: ReactNode;
};

// Pannelli aperti dalla barra di destra (o dal menu del cellulare)
type Panel = "notizie-on" | "notizie-off" | "ricerca" | "assenze" | "viaggio" | "feudi" | "mercato" | "forum" | "voci" | "calendario" | "faq" | "spie";
const PANEL_TITLE: Record<Panel, string> = {
  "notizie-on": "Notizie ON",
  "notizie-off": "Notizie OFF",
  ricerca: "Ricerca gioco",
  assenze: "Assenze",
  viaggio: "Viaggio",
  feudi: "Feudi e risorse della casata",
  mercato: "Mercato",
  forum: "Forum",
  voci: "Voci e pettegolezzi",
  calendario: "Calendario degli eventi",
  faq: "FAQ",
  spie: "Spie",
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
  canHighlightForum,
  canReviewGossip,
  hasDragon,
  canInvisible,
  initialInvisible,
  children,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const inChat = pathname.startsWith("/chat/"); // cellulare: la chat occupa tutto lo schermo
  const [area, setArea] = useState<Area>({ title: "Westeros" });
  // su computer le colonne restano sempre aperte
  const leftOpen = true;
  const rightOpen = true;
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
  const router = useRouter();
  const [invisible, setInvisibleState] = useState(!!(canInvisible && initialInvisible));
  async function toggleInvisible(on: boolean) {
    const res = await setInvisible(on);
    if (res.error) return;
    setInvisibleState(on);
    router.refresh(); // la chat aperta si ricarica con le nuove regole
  }
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
  }, invisible); // invisibile: niente annuncio in tempo reale (lo vede solo chi ha il permesso)

  // PG in attesa di approvazione: quando arriva il messaggio di SISTEMA (approvato)
  // la pagina rilegge il personaggio, cosi' gli altri lo vedono subito attivo e con lo stemma
  const pendingId = character && character.status !== "attivo" ? character.id : null;
  useEffect(() => {
    if (!pendingId) return;
    const ch = supabase
      .channel(`approvazione:${pendingId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_messages", filter: `character_id=eq.${pendingId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, pendingId, router]);

  const unread = useUnread(character?.id ?? null);
  // Gravidanze: controllo giornaliero dei sintomi (e parto) al primo accesso del giorno
  const tickId = character?.status === "attivo" ? character.id : null;
  // non a ogni caricamento di pagina: al massimo una volta ogni mezz'ora
  useEffect(() => {
    const pregnancy = `gravidanza:${tickId}`;
    if (tickId && isDue(pregnancy))
      supabase.rpc("pregnancy_tick", { p_character: tickId }).then(({ error }) => !error && markDone(pregnancy));
    // compleanni: eta' aggiornate
    if (isDue("eta")) supabase.rpc("refresh_ages").then(({ error }) => !error && markDone("eta"));
  }, [supabase, tickId]);
  // Pannelli aperti (anche piu' d'uno insieme): 0 = chiuso; a ogni apertura il numero sale e il pannello si ricarica
  const [panels, setPanels] = useState<Partial<Record<Panel, number>>>({});
  const panelOpen = (p: Panel) => (panels[p] ?? 0) > 0;
  const playRequests = usePlayRequestsUnseen(userId, panelOpen("ricerca"));
  const tickets = useTicketUnread(userId);
  const [ticketsOpen, setTicketsOpen] = useState(0); // 0 = chiuso; a ogni apertura si ricarica
  // dalla scheda di un PG: Missiva OFF / Missiva ON verso di lui
  const sheetActions = useMemo(() => ({ message: (kind: MessageKind, to: Contact) => openMessages(kind, to) }), []);
  // Preferenze dell'account (suoni, grandezza del testo, colori della chat):
  // subito quelle salvate nel browser, poi quelle del database
  useEffect(() => {
    const cached = cachedPrefs();
    if (cached) applyPrefs(cached);
    loadPrefs(supabase, userId).then(applyPrefs);
  }, [supabase, userId]);
  const idle = useIdleLogout(); // uscita automatica dopo 60 minuti di inattivita'
  const forumUnread = useForumUnread(userId);
  const highlights = useForumHighlights(userId); // post segnalati dallo staff non ancora visti
  const [forumTarget, setForumTarget] = useState<{ thread: string } | null>(null);
  const gossipPending = useGossipPending(canReviewGossip, panelOpen("voci")); // pettegolezzi da approvare // discussioni con interventi nuovi: l'icona del forum si accende
  // Avviso a schermo quando arriva una risposta a un ticket: resta finche' non lo si chiude
  const [ticketSeenCount, setTicketSeenCount] = useState(tickets.count);
  const [ticketToast, setTicketToast] = useState(false);
  if (tickets.count !== ticketSeenCount) {
    setTicketSeenCount(tickets.count);
    if (tickets.count > ticketSeenCount) setTicketToast(true);
    else if (tickets.count === 0) setTicketToast(false);
  }
  const ticketCtx = useMemo(() => ({ count: tickets.count, open: () => setTicketsOpen((n) => n + 1) }), [tickets.count]);
  const news = useNewsUnseen(userId, panelOpen("notizie-on") ? "on" : panelOpen("notizie-off") ? "off" : null);
  const events = useEventsUnseen(userId, panelOpen("calendario"));
  const openPanel = (p: Panel) => {
    setPanels((x) => ({ ...x, [p]: (x[p] ?? 0) + 1 }));
    setDrawerOpen(false); // su cellulare il menu si richiude: resta la finestra
    if (p === "notizie-on") news.markSeen("on");
    if (p === "notizie-off") news.markSeen("off");
  };

  function openMessages(kind: MessageKind, to: Contact | null = null) {
    setMessages((m) => ({ open: true, kind, to, session: m.session + 1 }));
  }

  // La disponibilita' resta salvata in un cookie (letto dal server al prossimo caricamento)
  // Quest Mode dello staff (menu della disponibilita')
  const quest = useQuestMode(userId);

  function changeAvailability(value: Availability) {
    document.cookie = `${AVAILABILITY_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    setAvailability(value);
  }

  async function savePhrase(value: string) {
    await supabase.from("profiles").update({ status_text: value || null }).eq("id", userId);
    setPhrase(value);
  }

  return (
    <QuestContext.Provider value={quest}>
    <AreaContext.Provider value={setArea}>
      <NewsUnseenContext.Provider value={news.unseen}>
      <PlayRequestsActiveContext.Provider value={playRequests.active}>
      <EventsUnseenContext.Provider value={events.unseen}>
      <TicketContext.Provider value={ticketCtx}>
      <ForumUnreadContext.Provider value={forumUnread.count}>
      <GossipPendingContext.Provider value={gossipPending}>
      <SheetActionsContext.Provider value={sheetActions}>
      <div className="flex h-dvh flex-col overflow-hidden lg:bg-[#0a0908] lg:bg-[url('/images/ui/interno/sfondo-4.webp')] lg:bg-repeat">
        {/* Barra in alto: titolo al centro, con due icone per lato sempre accanto a lui.
            Cellulare: al posto del titolo l'immagine del personaggio, a destra missive e OFF */}
        <DesktopTopBar
          pathname={pathname}
          canManage={canManage}
          canEditDocs={canEditDocs}
          hasCharacter={!!character}
          unread={unread.counts}
          onOpenMessages={openMessages}
        />
        <header className="relative z-30 flex min-h-14 shrink-0 items-center py-2.5 justify-center border-b border-border bg-black/85 pr-2 pl-11 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={playRequests.count > 0 ? "Apri pannello: nuove richieste di gioco" : news.unseen.on || news.unseen.off ? "Apri pannello: notizie nuove" : "Apri pannello"}
            className={`${menuBtn} absolute left-2 lg:hidden ${playRequests.count > 0 ? "blink-call" : news.unseen.on || news.unseen.off ? "news-new" : ""}`}
          >
            <MenuIcon />
          </button>

          <div className="flex items-center gap-0.5 sm:gap-2 lg:gap-12">
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
                  <TopTip>Manuale</TopTip>
                </>
              }
            />

            <h1 className="mx-3 hidden shrink-0 lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-westeros.webp" alt="Westeros GDR" width={200} height={30} className="block w-[200px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" />
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
                    <TopTip>Utility</TopTip>
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
          <TopActions canManage={canManage} />
        </header>

        <div className="relative flex min-h-0 flex-1">
          {/* Sfondo: pietra scura (cellulare; sul computer la texture della pagina) */}
          <div className="stone-bg pointer-events-none absolute inset-0 -z-10 lg:hidden" />

          {/* Computer: colonna sinistra (personaggio e menu) */}
          <DesktopLeft
            character={character}
            displayName={displayName}
            onOpenPanel={openPanel}
            onOpenDragon={character && hasDragon ? () => setDragonOpen((n) => n + 1) : null}
            newRequests={playRequests.count}
            inHouse={!!character?.house}
          />

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
            className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-panel transition-[translate,width,opacity,border-color] duration-300 ease-in-out motion-reduce:transition-none lg:hidden ${
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
                  onOpenDragon={character && hasDragon ? () => setDragonOpen((n) => n + 1) : null}
                  onOpenPanel={openPanel}
                  newRequests={playRequests.count}
                  inHouse={!!character?.house}
                />
              }
            />
            </div>
          </aside>

          {/* Centro: mappa, luoghi e chat */}
          <main className={`min-w-0 flex-1 overflow-y-auto lg:px-4 lg:py-4 ${inChat ? "flex flex-col p-0" : "p-3 pb-20"}`}>{children}</main>

          {/* Computer: colonna destra (localita' e presenti) */}
          <DesktopRight
            area={area}
            userId={userId}
            online={online}
            onOpenOnline={() => setOnlineOpen(true)}
            onChangeAvailability={changeAvailability}
            onOpenSheet={setSheetId}
          />

          {/* Colonna destra: icone (in basso su cellulare) */}
          <nav
            aria-label="Menu di gioco"
            inert={!rightOpen}
            className={`${inChat ? "max-lg:hidden " : ""}fixed inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around gap-1 overflow-x-auto border-t border-blood/60 bg-black/90 px-2 transition-[width,opacity,border-color] duration-300 ease-in-out motion-reduce:transition-none lg:hidden ${
              rightOpen
                ? "lg:w-40 lg:overflow-visible lg:border-border lg:opacity-100"
                : "lg:w-0 lg:overflow-hidden lg:border-transparent lg:opacity-0"
            }`}
          >
            <RightRail
              onOpenDragon={character && hasDragon ? () => setDragonOpen((n) => n + 1) : null}
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
      <SalaryCollector userId={userId} />
      {ticketToast && (
        <div
          role="alert"
          className="fixed top-16 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] lg:right-40 border border-accent/60 bg-panel px-4 py-3 shadow-2xl shadow-black"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-2xl">📜</span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-serif text-accent">Ticket</p>
              <p className="text-muted">
                {tickets.count === 1 ? "C'è un ticket con una risposta da leggere." : `Ci sono ${tickets.count} ticket con risposte da leggere.`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTicketToast(false);
                  setTicketsOpen((n) => n + 1);
                }}
                className="btn mt-2 px-3 py-1 text-xs"
              >
                Apri i ticket
              </button>
            </div>
            <button type="button" onClick={() => setTicketToast(false)} aria-label="Chiudi l'avviso" className="text-muted hover:text-accent">
              ✕
            </button>
          </div>
        </div>
      )}
      <Modal open={ticketsOpen > 0} onClose={() => setTicketsOpen(0)} title="Ticket" size="xl">
        {ticketsOpen > 0 && <Tickets key={ticketsOpen} me={character} isStaff={canManageTickets} isAdmin={canTicketCategories} onSeen={tickets.refresh} />}
      </Modal>
      {character && (
        <Modal open={dragonOpen > 0} onClose={() => setDragonOpen(0)} title="Il mio drago" size="sheet">
          {dragonOpen > 0 && <DragonPanel key={dragonOpen} characterId={character.id} />}
        </Modal>
      )}
      {(Object.keys(PANEL_TITLE) as Panel[]).map((panel) => {
        const panelSession = panels[panel] ?? 0;
        return (
      <Modal
        // ogni pannello ha la sua finestra; riaprendolo dall'icona riparte (anche se era ridotto a icona)
        key={`${panel}-${panelSession}`}
        open={panelSession > 0}
        onClose={() => setPanels((x) => ({ ...x, [panel]: 0 }))}
        title={PANEL_TITLE[panel]}
        size={
          panel === "ricerca" || panel === "assenze" || panel === "viaggio" || panel === "spie"
            ? "panel"
            : panel === "faq"
              ? "faq"
            : panel === "voci"
              ? "panel600"
              : panel === "notizie-on" || panel === "notizie-off" || panel === "forum"
                ? "xl"
                : "lg"
        }
      >
        {/* il contenuto esiste solo a finestra aperta (anche ridotta a icona): un pannello
            chiuso non carica dati e non apre collegamenti in tempo reale */}
        {panelSession > 0 && (
          <>
        {panel === "notizie-on" && <NewsBook key={panelSession} canWrite={canWriteNewsOn} />}
        {panel === "notizie-off" && <NewsBook key={panelSession} kind="off" canWrite={canWriteNewsOff} />}
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
        {panel === "voci" && <GossipPanel key={panelSession} character={character} canReview={canReviewGossip} />}
        {panel === "forum" && (
          <Forum
            key={panelSession}
            userId={userId}
            canModerate={canModerateForum}
            canManage={canManageForum}
            canHighlight={canHighlightForum}
            openThreadId={forumTarget?.thread}
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
        {panel === "calendario" && (
          <CalendarPanel
            key={panelSession}
            userId={userId}
            character={character && character.status === "attivo" ? { id: character.id, name: character.name } : null}
            onSeen={events.clear}
          />
        )}
        {panel === "faq" && <FaqPanel key={panelSession} canEdit={canEditDocs} />}
        {panel === "spie" &&
          (character && character.status === "attivo" ? (
            <SpiesPanel key={panelSession} characterId={character.id} />
          ) : (
            <p className="py-6 text-center text-muted">Per avere delle spie serve un personaggio attivo.</p>
          ))}
          </>
        )}
      </Modal>
        );
      })}
      <OnlineModal
        invisible={canInvisible ? invisible : null}
        onToggleInvisible={toggleInvisible}
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
      {idle.minutesLeft !== null && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[70] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-3 border border-accent/60 bg-panel px-4 py-3 text-sm shadow-2xl shadow-black"
        >
          <span className="min-w-0 flex-1">
            Nessuna attività da quasi un&apos;ora: tra{" "}
            <strong className="text-accent">
              {idle.minutesLeft} {idle.minutesLeft === 1 ? "minuto" : "minuti"}
            </strong>{" "}
            la sessione verrà chiusa.
          </span>
          <button type="button" onClick={idle.stay} className="btn px-3 py-1.5 text-xs">
            Continua a giocare
          </button>
        </div>
      )}
      <HighlightsModal
        items={highlights.items}
        onRead={(h) => {
          highlights.markSeen([h.post_id]);
          setForumTarget({ thread: h.thread_id });
          openPanel("forum");
        }}
        onClose={() => highlights.markSeen(highlights.items.map((h) => h.post_id))}
      />
      </GossipPendingContext.Provider>
      </ForumUnreadContext.Provider>
      </TicketContext.Provider>
      </EventsUnseenContext.Provider>
      </PlayRequestsActiveContext.Provider>
      </NewsUnseenContext.Provider>
    </AreaContext.Provider>
    </QuestContext.Provider>
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
        <GameDateLabel />
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
      {/* Pannello ornato (immagine): altezza fissa, con tanti presenti l elenco scorre dentro */}
      <div className="ornate-panel relative hidden h-[300px] flex-col lg:flex">
        {/* il totale sta scritto nella testata, sopra il divisorio */}
        <button
          type="button"
          onClick={onOpenOnline}
          className="ornate-panel-count flex items-center justify-center font-serif text-xs font-semibold tracking-[0.14em] whitespace-nowrap text-[#ecdcb4] uppercase hover:text-white"
          title="Apri l&apos;elenco di tutti i presenti"
        >
          {online.length} present{online.length === 1 ? "e" : "i"} online
        </button>
        {/* in una chat: il nome del luogo (sulla mappa non serve) */}
        {me?.place === "chat" && (
          <h3 className="mb-2 shrink-0 truncate border-b border-border pb-1 text-xs font-semibold tracking-[0.15em] text-accent uppercase">
            <PrefetchLink href={`/chat/${me.placeKey.replace(/^chat:/, "")}`} className="hover:underline" title={`Vai in ${me.placeLabel}`}>
              {me.placeLabel}
            </PrefetchLink>
          </h3>
        )}
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-1 text-sm [text-shadow:0_2px_2px_#000,0_0_6px_#000,0_0_10px_rgb(0_0_0/0.8)]">
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
                className="font-name truncate text-left text-[0.8125rem] hover:underline disabled:no-underline"
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
  bronze,
}: {
  character: MainCharacter | null;
  displayName: string;
  size: string;
  balloon?: boolean;
  small?: boolean; // cornice sottile (barra in alto del cellulare)
  medieval?: boolean; // cornice di ferro con piastre chiodate
  bronze?: boolean; // cornice di bronzo con i gigli agli angoli (computer)
}) {
  const frame = bronze
    ? "cornice-ritratto"
    : medieval
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
  "group relative flex h-14 w-full flex-col items-center justify-center gap-1.5 text-muted transition hover:text-accent";
// nome piccolo sotto le icone del menu del cellulare
function Caption({ children }: { children: ReactNode }) {
  return <span className="block text-center text-[0.625rem] leading-tight tracking-wide text-muted group-hover:text-accent">{children}</span>;
}
// nomi corti dei pannelli, sotto le icone
const PANEL_SHORT: Record<Panel, string> = {
  "notizie-on": "Notizie ON",
  "notizie-off": "Notizie OFF",
  ricerca: "Ricerca",
  assenze: "Assenze",
  viaggio: "Viaggio",
  feudi: "Feudi",
  mercato: "Mercato",
  forum: "Forum",
  voci: "Voci",
  calendario: "Calendario",
  faq: "FAQ",
  spie: "Spie",
};

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
    <div className="space-y-3">
    {/* come la barra del computer: titolo, poi le icone per categoria, centrate */}
    <p className="text-center font-serif text-sm tracking-[0.25em] text-accent uppercase">Menu</p>
    <RailRule />
    <div className="grid grid-cols-4 gap-x-1 gap-y-2">
      {/* Gestione: la vedono solo moderatori e admin */}
      {canManage && <ManageButton canManage className={`${drawerBtn} ${goldGear}`} caption="Gestione" />}
      <UtilityButton
        className={drawerBtn}
        trigger={
          <>
            <ToolsIcon />
            <Caption>Utility</Caption>
          </>
        }
      />
      <TicketButton className={drawerBtn} caption="Ticket" />
      <button type="button" onClick={onOpenOnline} className={drawerBtn} aria-label={`${onlineCount} presenti online: apri l'elenco`}>
        <UsersIcon />
        <Caption>Presenti</Caption>
        <span className="absolute -top-1 right-1 min-w-5 rounded-full bg-blood px-1.5 text-center text-[0.6875rem] font-bold text-white shadow">
          {onlineCount}
        </span>
      </button>
    </div>
    <RailRule />
    {/* stessi pannelli della barra di destra del computer, divisi in zona ON e zona OFF, quattro per riga */}
    <p className="text-center text-[0.625rem] font-semibold tracking-[0.3em] text-[#c9a45c] uppercase">On game</p>
    <div className="grid grid-cols-4 gap-x-1 gap-y-3">
      {zonePanels(ZONE_ON, inHouse).map((p) => (
        <PanelButton key={p.id} panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={drawerBtn} caption={PANEL_SHORT[p.id]} />
      ))}
      {onOpenDragon && (
        <button type="button" onClick={onOpenDragon} className={drawerBtn} aria-label="Il mio drago">
          <DragonIcon />
          <Caption>Drago</Caption>
        </button>
      )}
    </div>
    <RailRule />
    <p className="text-center text-[0.625rem] font-semibold tracking-[0.3em] text-[#c9a45c] uppercase">Off game</p>
    <div className="grid grid-cols-4 gap-x-1 gap-y-3">
      {zonePanels(ZONE_OFF, inHouse).map((p) => (
        <PanelButton key={p.id} panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={drawerBtn} caption={PANEL_SHORT[p.id]} />
      ))}
    </div>
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

  // Avviso sonoro: subito quando arriva un messaggio (il suono scelto per le missive
  // o per gli OFF), poi ogni 15 secondi finche' resta qualcosa da leggere.
  // Suona anche con la scheda in secondo piano.
  const total = counts.missiva + counts.off;
  const previous = useRef({ missiva: 0, off: 0 });
  useEffect(() => {
    if (counts.missiva > previous.current.missiva) playEvent("missiva");
    else if (counts.off > previous.current.off) playEvent("off");
    previous.current = { missiva: counts.missiva, off: counts.off };
    if (counts.missiva + counts.off === 0) return;
    return everyEvenInBackground(() => playEvent(counts.missiva > 0 ? "missiva" : "off"), 15_000);
  }, [counts.missiva, counts.off]);

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

// Ogni icona sta in un rombo scuro con le punte a tacca (immagine PNG); su computer sotto c'e' il nome
const topBtn =
  "group relative isolate flex h-9 w-9 shrink-0 sm:h-11 sm:w-11 lg:h-12 lg:w-12 items-center justify-center text-[#e2c99a] transition hover:text-accent focus-visible:text-accent focus-visible:outline-none [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-[1.125rem] sm:[&_svg]:w-[1.125rem] before:absolute before:inset-0 before:-z-10 before:bg-[url('/images/ui/rombo-scuro.png')] before:bg-contain before:bg-center before:bg-no-repeat before:drop-shadow-[0_2px_5px_rgb(0_0_0/0.8)] before:transition hover:before:brightness-150";
// Pulsante del menu (cellulare): senza rombo
const menuBtn =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-blood/25 hover:text-accent";

function TopTip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute top-full left-1/2 mt-0.5 hidden -translate-x-1/2 font-serif text-[0.625rem] leading-none tracking-[0.14em] whitespace-nowrap text-muted uppercase transition group-hover:text-accent group-focus-visible:text-accent lg:block">
      {children}
    </span>
  );
}

// Ticket: apre la finestra dei ticket; lampeggia finche' ci sono risposte (o, per lo staff, richieste) da leggere
function TicketButton({ className, tip, caption }: { className: string; tip?: boolean; caption?: string }) {
  const { count, open } = useContext(TicketContext);
  const label = count > 0 ? `Ticket: ${count} da leggere` : "Ticket";
  return (
    <button type="button" onClick={open} className={`${className} ${count > 0 ? "blink-call" : ""}`} aria-label={label}>
      <TicketIcon />
      {caption && <Caption>{caption}</Caption>}
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">{count}</span>
      )}
      {tip && <TopTip>Ticket</TopTip>}
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
  "group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-blood/25 hover:text-accent lg:h-auto lg:min-h-12 lg:w-full lg:flex-col lg:justify-start lg:gap-1 lg:py-1.5";
// nome sotto l'icona, solo nella barra del computer
function RailCaption({ children }: { children: ReactNode }) {
  return <span className="hidden lg:contents"><Caption>{children}</Caption></span>;
}

// Notizie, ricerca gioco e assenze: per tutti i giocatori
const PANEL_ICONS: { id: Panel; icon: ReactNode }[] = [
  // ON game
  { id: "notizie-on", icon: <ScrollIcon /> },
  { id: "voci", icon: <GossipIcon /> },
  { id: "viaggio", icon: <CompassIcon /> },
  { id: "feudi", icon: <FiefIcon /> },
  { id: "mercato", icon: <MarketIcon /> },
  { id: "spie", icon: <SpyIcon /> },
  // OFF game
  { id: "notizie-off", icon: <HornIcon /> },
  { id: "forum", icon: <ForumIcon /> },
  { id: "ricerca", icon: <SwordsIcon /> },
  { id: "assenze", icon: <HourglassIcon /> },
  { id: "calendario", icon: <CalendarIcon /> },
  { id: "faq", icon: <FaqIcon /> },
];
// Feudi: solo per chi appartiene a una casata
// Pettegolezzi in attesa (per chi li approva): l'icona Voci si accende
const GossipPendingContext = createContext(0);

const panelsFor = (inHouse: boolean) => PANEL_ICONS.filter((p) => p.id !== "feudi" || inHouse);

// Le icone dei pannelli divise in due zone: quello che riguarda il gioco (ON)
// e quello che riguarda i giocatori e la comunita' (OFF)
const ZONE_ON: Panel[] = ["notizie-on", "voci", "viaggio", "feudi", "mercato", "spie"];
const ZONE_OFF: Panel[] = ["notizie-off", "forum", "ricerca", "assenze", "calendario", "faq"];
const zonePanels = (zone: Panel[], inHouse: boolean) => {
  const icons = panelsFor(inHouse);
  return zone.flatMap((id) => icons.filter((p) => p.id === id));
};

// Titolino di una zona della barra (solo computer)
function RailZone({ children }: { children: ReactNode }) {
  return (
    <p className="col-span-full mt-1 w-full text-center text-[0.625rem] font-semibold tracking-[0.3em] text-[#c9a45c] uppercase max-lg:hidden">
      {children}
    </p>
  );
}

// Aggiorna, Gestione (solo moderatori e admin) ed Esci: in alto a destra, su computer
function TopActions({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const inPlace = pathname.startsWith("/chat/") || pathname === "/mappa";
  const btn =
    "group flex w-14 flex-col items-center gap-0.5 rounded-md py-1 text-muted transition hover:bg-blood/25 hover:text-accent";
  return (
    <div className="absolute top-1/2 right-3 hidden -translate-y-1/2 items-start gap-1 lg:flex">
      <button
        type="button"
        onClick={() => (inPlace ? window.location.reload() : router.push("/mappa"))}
        className={btn}
        aria-label={pathname.startsWith("/chat/") ? "Aggiorna la chat" : "Torna alla mappa e aggiorna"}
        title={pathname.startsWith("/chat/") ? "Aggiorna la chat" : "Torna alla mappa e aggiorna"}
      >
        <RefreshIcon />
        <Caption>Aggiorna</Caption>
      </button>
      {canManage && <ManageButton canManage className={`${btn} ${goldGear}`} caption="Gestione" />}
      <form action={logout}>
        <button className={`${btn} text-red-500 hover:text-red-400`} aria-label="Esci" title="Esci">
          <PowerIcon />
          <Caption>Esci</Caption>
        </button>
      </form>
    </div>
  );
}

// Riga dorata che sfuma ai lati, tra una categoria e l'altra
function RailRule({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`col-span-full my-1 h-px w-full bg-gradient-to-r from-transparent via-[#c9a45c]/70 to-transparent ${className}`} />;
}

// Gestione: per moderatori e admin porta ai pannelli; agli altri dice che
// non hanno i permessi
function ManageButton({ canManage, className, caption }: { canManage: boolean; className: string; caption?: string }) {
  const [denied, setDenied] = useState(false);
  if (canManage)
    return (
      <Link href="/gestione" className={className} aria-label="Gestione">
        <GearIcon />
        {caption && <Caption>{caption}</Caption>}
      </Link>
    );
  return (
    <>
      <button type="button" onClick={() => setDenied(true)} className={className} aria-label="Gestione">
        <GearIcon />
        {caption && <Caption>{caption}</Caption>}
      </button>
      <Modal open={denied} onClose={() => setDenied(false)} title="Gestione" size="md">
        <p className="py-4 text-center font-serif text-lg text-[#d8c39a]">Non hai i permessi per accedere qui.</p>
      </Modal>
    </>
  );
}
const panelLabel = (p: Panel, newRequests: number, newNews: boolean) =>
  p === "forum" && newNews
    ? "Forum: interventi nuovi"
    : p === "voci" && newNews
    ? "Voci e pettegolezzi: da approvare"
    : p === "calendario" && newNews
    ? "Calendario: eventi nuovi"
    : p === "ricerca" && newRequests > 0
    ? `Ricerca gioco: ${newRequests} ${newRequests === 1 ? "richiesta nuova" : "richieste nuove"}`
    : p === "ricerca" && newNews
    ? "Ricerca gioco: ci sono ricerche aperte"
    : newNews
      ? `${PANEL_TITLE[p]}: notizie nuove`
      : PANEL_TITLE[p];

function PanelButton({
  panel,
  icon,
  newRequests,
  onOpen,
  className,
  caption,
  list = false,
}: {
  panel: Panel;
  icon: ReactNode;
  newRequests: number;
  onOpen: (p: Panel) => void;
  className: string;
  caption?: string; // nome sotto l'icona (menu del cellulare)
  list?: boolean; // nelle colonne del computer: nome accanto all'icona
}) {
  const calling = panel === "ricerca" && newRequests > 0; // lampeggia finche' non si apre
  const unseen = useContext(NewsUnseenContext);
  const forumNew = useContext(ForumUnreadContext);
  const gossipNew = useContext(GossipPendingContext);
  const eventsNew = useContext(EventsUnseenContext);
  const requestsOpen = useContext(PlayRequestsActiveContext);
  const newNews =
    (panel === "ricerca" && requestsOpen > 0) || // dorata finche' ci sono ricerche aperte
    (panel === "calendario" && eventsNew) ||
    (panel === "notizie-on" && unseen.on) ||
    (panel === "notizie-off" && unseen.off) ||
    (panel === "forum" && forumNew > 0) ||
    (panel === "voci" && gossipNew > 0); // dorata finche' non si apre
  return (
    <button
      type="button"
      onClick={() => onOpen(panel)}
      className={`${className} ${calling ? "blink-call" : newNews ? "news-new" : ""}`}
      aria-label={panelLabel(panel, newRequests, newNews)}
    >
      {icon}
      {caption && (list ? <ListCaption>{caption}</ListCaption> : <Caption>{caption}</Caption>)}
      {calling && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">
          {newRequests}
        </span>
      )}
      {/* Forum: quante discussioni hanno risposte nuove */}
      {panel === "voci" && gossipNew > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">
          {gossipNew}
        </span>
      )}
      {panel === "forum" && forumNew > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-blood px-1 text-center text-[0.625rem] font-bold text-white shadow">
          {forumNew}
        </span>
      )}
    </button>
  );
}

// Rotella della Gestione: dorata
const goldGear =
  "text-[#d4a72c] drop-shadow-[0_0_4px_rgb(212_167_44/0.45)] hover:text-[#f0c75e] hover:drop-shadow-[0_0_6px_rgb(240_199_94/0.7)]";

function RightRail({
  onOpenDragon,
  onOpenPanel,
  newRequests,
  inHouse,
}: {
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
      <div className="contents lg:grid lg:w-40 lg:grid-cols-3 lg:items-start lg:justify-items-center lg:gap-x-1 lg:gap-y-2 lg:px-2">
        {/* titolo della barra (solo computer) */}
        <p className="col-span-full mb-1 w-full text-center font-serif text-sm tracking-[0.25em] text-accent uppercase max-lg:hidden">Menu</p>
        <RailRule className="max-lg:hidden" />
        {/* Aggiorna ed Esci: su computer stanno in alto a destra; qui restano per il cellulare */}
        <button
          type="button"
          onClick={() => {
            if (pathname.startsWith("/chat/") || pathname === "/mappa") window.location.reload();
            else router.push("/mappa");
          }}
          className={`${railBtn} lg:hidden`}
          aria-label={pathname.startsWith("/chat/") ? "Aggiorna la chat" : "Torna alla mappa e aggiorna"}
        >
          <RefreshIcon />
        </button>

        {/* Zona ON game: il mondo di gioco */}
        <RailZone>On game</RailZone>
        <Link href="/mappa" className={`${railBtn} ${active("/mappa")}`} aria-label="Mappa">
          <MapIcon />
          <RailCaption>Mappa</RailCaption>
        </Link>
        {zonePanels(ZONE_ON, inHouse).map((p) => (
          <PanelButton key={p.id} panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={`${railBtn} max-lg:hidden`} caption={PANEL_SHORT[p.id]} />
        ))}
        {/* Il mio drago: solo per chi cavalca un drago */}
        {onOpenDragon && (
          <button type="button" onClick={onOpenDragon} className={`${railBtn} max-lg:hidden`} aria-label="Il mio drago">
            <DragonIcon />
            <RailCaption>Drago</RailCaption>
          </button>
        )}

        {/* Zona OFF game: giocatori e comunita' */}
        <div aria-hidden className="col-span-full h-1 max-lg:hidden" />
        <RailRule className="max-lg:hidden" />
        <RailZone>Off game</RailZone>
        {zonePanels(ZONE_OFF, inHouse).map((p) => (
          <PanelButton key={p.id} panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={`${railBtn} max-lg:hidden`} caption={PANEL_SHORT[p.id]} />
        ))}
      </div>
      <form action={logout} className="lg:hidden">
        <button className={`${railBtn} text-red-500 hover:text-red-400`} aria-label="Esci">
          <PowerIcon />
        </button>
      </form>
    </>
  );
}

// =====================================================================
// Computer: barra in alto a schede, colonne laterali
// =====================================================================
function DesktopTopBar({
  pathname,
  canManage,
  canEditDocs,
  hasCharacter,
  unread,
  onOpenMessages,
}: {
  pathname: string;
  canManage: boolean;
  canEditDocs: boolean;
  hasCharacter: boolean;
  unread: Record<MessageKind, number>;
  onOpenMessages: (kind: MessageKind) => void;
}) {
  const router = useRouter();
  const inPlace = pathname.startsWith("/chat/") || pathname === "/mappa";
  const badge = (n: number) =>
    n > 0 && <span className="absolute top-3 right-5 min-w-5 rounded-full bg-blood px-1.5 text-center text-[0.6875rem] font-bold text-white shadow">{n}</span>;
  const action =
    "group flex flex-1 items-center justify-center px-1.5 py-1 text-[#d4b394] transition hover:text-[#f3e2cc] [&_svg]:h-5 [&_svg]:w-5";
  return (
    <header className="relative z-30 hidden h-[70px] shrink-0 items-stretch bg-black/40 shadow-[0_6px_18px_rgb(0_0_0/0.7)] lg:flex">
      {/* linea in fondo alla barra (immagine che si ripete) */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-[5px] -z-20 h-3 bg-[url('/images/ui/interno/linea-top.png')] bg-repeat-x" />
      {/* logo */}
      <h1 className="flex w-64 shrink-0 items-center justify-center px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-westeros-trono-icone.png" alt="Westeros GDR" width={1200} height={434} className="h-[58px] w-auto drop-shadow-[0_3px_8px_rgb(0_0_0/0.9)]" />
      </h1>
      {/* schede */}
      <nav aria-label="Menu principale" className="flex min-w-0 flex-1 items-center justify-center">
        <MapTab active={pathname.startsWith("/mappa")} icon={<CompassIcon />} />
        <TabDivider />
        {hasCharacter && (
          <>
            <button type="button" className={tabBtn} onClick={() => onOpenMessages("missiva")} aria-label={unread.missiva > 0 ? `Missive: ${unread.missiva} non lette` : "Missive"}>
              <QuillIcon />
              <TabLabel>Missive</TabLabel>
              {badge(unread.missiva)}
            </button>
            <TabDivider />
            <button type="button" className={tabBtn} onClick={() => onOpenMessages("off")} aria-label={unread.off > 0 ? `Messaggi OFF: ${unread.off} non letti` : "Messaggi OFF"}>
              <BubbleIcon />
              <TabLabel>Messaggi</TabLabel>
              {badge(unread.off)}
            </button>
            <TabDivider />
          </>
        )}
        <GuideButton
          book="ambientazione"
          label="Ambientazione"
          canEdit={canEditDocs}
          className={tabBtn}
          trigger={
            <>
              <CastleIcon />
              <TabLabel>Ambient</TabLabel>
            </>
          }
        />
        <TabDivider />
        <GuideButton
          book="manuale"
          label="Manuale di Gioco"
          canEdit={canEditDocs}
          className={tabBtn}
          trigger={
            <>
              <BookIcon />
              <TabLabel>Guide</TabLabel>
            </>
          }
        />
      </nav>
      {/* castello e comandi */}
      <div className="relative w-[300px] shrink-0 overflow-hidden border-l border-[#7a5530]/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/ui/interno/castello-sx.webp" alt="" aria-hidden width={324} height={115} className="absolute inset-0 h-full w-full object-cover object-bottom" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />
        <div className="absolute right-0 bottom-0 flex h-[44px] w-[190px] items-center justify-end bg-[url('/images/ui/interno/targa-comandi.png')] bg-[length:100%_100%] bg-no-repeat pr-2 pl-7 [&>*+*]:border-l [&>*+*]:border-[#7a5530]/60">
          <button
            type="button"
            onClick={() => (inPlace ? window.location.reload() : router.push("/mappa"))}
            className={action}
            title={pathname.startsWith("/chat/") ? "Aggiorna la chat" : "Torna alla mappa e aggiorna"}
          >
            <RefreshIcon />
            <span className="sr-only">Aggiorna</span>
          </button>
          {canManage && (
            <Link href="/gestione" className={action} title="Gestione">
              <GearIcon />
              <span className="sr-only">Gestione</span>
            </Link>
          )}
          <form action={logout} className="flex flex-1 justify-center">
            <button className={action} title="Esci">
              <PowerIcon />
              <span className="sr-only">Esci</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

// Ticket come scheda della barra in alto: lampeggia finche' ci sono risposte da leggere
function TicketTab({ list = false }: { list?: boolean }) {
  const { count, open } = useContext(TicketContext);
  return (
    <button type="button" onClick={open} className={`${list ? listBtn : tabBtn} ${count > 0 ? "blink-call" : ""}`} aria-label={count > 0 ? `Ticket: ${count} da leggere` : "Ticket"}>
      <TicketIcon />
      {list ? <ListCaption>Ticket</ListCaption> : <TabLabel>Ticket</TabLabel>}
      {count > 0 && (
        <span className={`${list ? "ml-auto" : "absolute top-3 right-5"} min-w-5 rounded-full bg-blood px-1.5 text-center text-[0.6875rem] font-bold text-white shadow`}>{count}</span>
      )}
    </button>
  );
}

function DesktopLeft({
  character,
  displayName,
  onOpenPanel,
  onOpenDragon,
  newRequests,
  inHouse,
}: {
  character: MainCharacter | null;
  displayName: string;
  onOpenPanel: (p: Panel) => void;
  onOpenDragon: (() => void) | null;
  newRequests: number;
  inHouse: boolean;
}) {
  const status = useCharacterStatus(character?.id ?? null);
  const offPanels = zonePanels(ZONE_OFF, inHouse);
  const gamePanels: Panel[] = ["viaggio", "feudi", "mercato", "spie", "voci", "notizie-on"];
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-2 overflow-hidden p-2 lg:flex">
      {/* personaggio */}
      <Pannello>
        <div className="flex gap-3">
          <CharacterPicture character={character} displayName={displayName} size="h-[95px] w-[86px]" bronze />
          <div className="relative min-w-0 flex-1 pt-1">
            {character?.house && HOUSE_BANNERS.has(character.house.name.toLowerCase()) ? (
              // stendardo della casata, appeso al centro sopra il nome
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/images/casate/stendardo-${character.house.name.toLowerCase()}.png`}
                alt={`Casata ${character.house.name}`}
                title={`Casata ${character.house.name}`}
                className="mx-auto -mt-3 mb-1 block h-[62px] w-auto drop-shadow-[0_3px_4px_#000]"
              />
            ) : character?.house?.sigil_url && (
              <span className="pennone-casata absolute -top-4 right-0 flex h-12 w-8 items-start justify-center pt-1.5" title={`Casata ${character.house.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={character.house.sigil_url} alt={`Casata ${character.house.name}`} className="h-5 w-5 object-contain" />
              </span>
            )}
            {status?.place && (
              <p className={`${character?.house && HOUSE_BANNERS.has(character.house.name.toLowerCase()) ? "mt-1" : "mt-5 pr-7"} text-[0.6875rem] leading-snug text-[#b39a82]`}>
                Posizione:
                <span className="block text-[#b8bec0]">{status.place}</span>
              </p>
            )}
          </div>
        </div>
        {status && (
          <div className="mt-2 space-y-1">
            <HpBar hp={status.hp} maxHp={status.maxHp} />
            <p className="flex justify-between font-serif text-[0.6875rem] text-[#b8bec0]">
              <span>PF: {status.hp}/{status.maxHp}</span>
              <span>PX: {status.px.toLocaleString("it-IT")}</span>
            </p>
          </div>
        )}
      </Pannello>

      {/* menu del gioco */}
      <Pannello title="Menu gioco">
        <ul>
          {character && (
            <li>
              <SheetButton
                characterId={character.id}
                className={listBtn}
                trigger={
                  <>
                    <UsersIcon />
                    <ListCaption>Scheda personaggio</ListCaption>
                  </>
                }
              />
            </li>
          )}
          {zonePanels(gamePanels, inHouse).map((p) => (
            <li key={p.id}>
              <PanelButton panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={listBtn} caption={SIDE_NAMES[p.id]} list />
            </li>
          ))}
          {onOpenDragon && (
            <li>
              <button type="button" onClick={onOpenDragon} className={listBtn}>
                <DragonIcon />
                <ListCaption>Il mio drago</ListCaption>
              </button>
            </li>
          )}
        </ul>
      </Pannello>

      {/* fuori gioco */}
      <Pannello title="Area off game">
        <ul>
          {offPanels.filter((p) => p.id === "notizie-off").map((p) => (
  <li key={p.id}>
                <PanelButton panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={listBtn} caption={SIDE_NAMES[p.id]} list />
              </li>
          ))}
          {offPanels.filter((p) => p.id === "forum").map((p) => (
  <li key={p.id}>
                <PanelButton panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={listBtn} caption={SIDE_NAMES[p.id]} list />
              </li>
          ))}
          <li>
            <TicketTab list />
          </li>
          {offPanels.filter((p) => p.id === "ricerca").map((p) => (
  <li key={p.id}>
                <PanelButton panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={listBtn} caption={SIDE_NAMES[p.id]} list />
              </li>
          ))}
          {offPanels.filter((p) => p.id === "assenze").map((p) => (
  <li key={p.id}>
                <PanelButton panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={listBtn} caption={SIDE_NAMES[p.id]} list />
              </li>
          ))}
          <li>
            <UtilityButton
              mode="utility"
              className={listBtn}
              trigger={
                <>
                  <ToolsIcon />
                  <ListCaption>Utility</ListCaption>
                </>
              }
            />
          </li>
          {offPanels.filter((p) => p.id === "faq").map((p) => (
  <li key={p.id}>
                <PanelButton panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={listBtn} caption={SIDE_NAMES[p.id]} list />
              </li>
          ))}
          <li>
            <ModalButton
              title="Archivio giocate"
              size="xl"
              className={listBtn}
              label={
                <>
                  <ArchiveIcon />
                  <ListCaption>Archivio giocate</ListCaption>
                </>
              }
            >
              {() => <GameArchive />}
            </ModalButton>
          </li>
          {offPanels.filter((p) => p.id === "calendario").map((p) => (
  <li key={p.id}>
                <PanelButton panel={p.id} icon={p.icon} newRequests={newRequests} onOpen={onOpenPanel} className={listBtn} caption={SIDE_NAMES[p.id]} list />
              </li>
          ))}
        </ul>
      </Pannello>
    </aside>
  );
}

function DesktopRight({
  area,
  userId,
  online,
  onOpenOnline,
  onChangeAvailability,
  onOpenSheet,
}: {
  area: Area;
  userId: string;
  online: OnlinePlayer[];
  onOpenOnline: () => void;
  onChangeAvailability: (value: Availability) => void;
  onOpenSheet: (characterId: string) => void;
}) {
  const me = online.find((p) => p.userId === userId);
  const here = me ? online.filter((p) => p.placeKey === me.placeKey) : [];
  const action = "flex w-full items-center gap-3 bg-[url('/images/ui/interno/pulsante.png')] bg-[length:100%_100%] bg-no-repeat px-3 py-2 text-left text-[#d4b394] transition hover:brightness-125 hover:text-[#f3e2cc] [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0";
  return (
    <aside className="relative isolate hidden w-72 shrink-0 flex-col gap-2 overflow-hidden pt-[44px] pr-[26px] pb-[70px] pl-[18px] lg:flex">
      {/* sfondo di pietra: testa e coda fisse, il corpo si ripete per tutta l'altezza */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/ui/interno/col-dx-testa.webp" alt="" width={439} height={69} className="block h-auto w-full shrink-0" />
        <div className="min-h-0 flex-1 bg-[url('/images/ui/interno/col-dx-corpo.webp')] bg-[length:100%_auto] bg-repeat-y" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/ui/interno/col-dx-coda.webp" alt="" width={439} height={148} className="block h-auto w-full shrink-0" />
      </div>
      <Pannello>
        <div className="relative h-24 overflow-hidden border border-[#7a5530]/80 shadow-[inset_0_0_12px_rgb(0_0_0/0.8)]">
          {area.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={area.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <Image src={defaultAreaImage} alt="" fill sizes="256px" className="object-cover" />
          )}
        </div>
        <h3 className="mt-2 border-b border-[#7a5530]/60 pb-1 font-serif text-[0.9375rem] text-[#b8bec0] [text-shadow:0_1px_2px_#000]">{area.title}</h3>
        <div className="mt-2 flex justify-center">
          <div className="parchment px-5 py-1.5 text-center font-serif text-[0.6875rem] font-semibold tracking-[0.06em] whitespace-nowrap uppercase">
            <GameDateLabel />
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <ModalButton
            title={area.title}
            size="lg"
            className={action}
            label={
              <>
                <InfoIcon />
                <ListCaption>Scheda luogo</ListCaption>
              </>
            }
          >
            {() => <PlaceInfo area={area} />}
          </ModalButton>
          <button type="button" onClick={onOpenOnline} className={action}>
            <UsersIcon />
            <ListCaption>Presenti online</ListCaption>
            <span className="ml-auto rounded-full bg-[#c08a4e]/80 px-2 text-xs font-semibold text-black">{online.length}</span>
          </button>
          <ModalButton
            title="Meteo"
            size="lg"
            className={action}
            label={
              <>
                <WeatherIcon />
                <ListCaption>Meteo</ListCaption>
              </>
            }
          >
            {() => <WeatherView regionId={area.weatherRegionId ?? null} />}
          </ModalButton>
          <UtilityButton
            mode="servizi"
            className={action}
            trigger={
              <>
                <KeyIcon />
                <ListCaption>Locande e servizi</ListCaption>
              </>
            }
          />
        </div>
      </Pannello>

      {/* chi e' qui con me */}
      <Pannello title={me?.place === "chat" ? `Presenti in ${me.placeLabel}` : "Presenti sulla mappa"} className="flex min-h-0 flex-1 flex-col">
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
          {here.map((p) => (
            <li
              key={p.userId}
              className={`flex items-center gap-2 ${p.live ? "" : "opacity-50"}`}
              title={p.live ? undefined : "Connessione momentaneamente persa: resta nell'elenco per qualche minuto"}
            >
              <AvailabilityDot value={p.availability} onChange={p.userId === userId ? onChangeAvailability : undefined} />
              {p.sigil && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.sigil} alt="" title={`Casata ${p.house}`} className="h-4 w-4 shrink-0 object-contain" />
              )}
              {/* invisibile (lo vede solo lo staff col permesso): nome grigio scuro */}
              <button
                type="button"
                onClick={() => p.characterId && onOpenSheet(p.characterId)}
                disabled={!p.characterId}
                title={p.invisible ? `${p.name} · invisibile ai giocatori` : p.characterId ? `Apri la scheda di ${p.name}` : undefined}
                className={`font-name truncate text-left text-[0.8125rem] hover:underline disabled:no-underline ${p.invisible ? "text-[#5f5f5f] italic" : "text-[#b8bec0]"}`}
              >
                {p.name}
              </button>
              {!p.active && <span title="Personaggio non ancora attivo" className="text-xs text-amber-200">⧗</span>}
            </li>
          ))}
          {here.length === 0 && <li className="text-xs text-muted">Nessuno.</li>}
        </ul>
      </Pannello>
    </aside>
  );
}

const KeyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12 L20 3 M17 6 l3 3 M14 9 l2 2" />
  </svg>
);

// nomi delle voci nelle colonne del computer

const SIDE_NAMES: Record<Panel, string> = {
  viaggio: "Viaggio",
  feudi: "Feudi e possedimenti",
  mercato: "Mercato",
  spie: "Spie",
  voci: "Voci e pettegolezzi",
  "notizie-on": "Notizie ON",
  "notizie-off": "Notizie OFF",
  forum: "Forum",
  ricerca: "Ricerca gioco",
  assenze: "Assenze",
  calendario: "Calendario",
  faq: "FAQ",
};


const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 15h6M9 18h4" />
  </svg>
);
