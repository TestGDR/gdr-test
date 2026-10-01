"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { logout } from "@/app/(pubblico)/login/actions";
import GuideButton from "@/components/guide/GuideButton";
import SheetButton from "@/components/scheda/SheetButton";
import { GAME_DATE } from "@/lib/game-config";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";
import defaultAreaImage from "../../../public/images/home-bg.jpg";
import {
  BookIcon,
  CastleIcon,
  ChevronIcon,
  EyeIcon,
  FlameIcon,
  MapIcon,
  MenuIcon,
  PowerIcon,
  RefreshIcon,
  SheetIcon,
  UsersIcon,
} from "./icons";

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
  isAdmin: boolean;
  children: ReactNode;
};

export default function GameShell({ userId, displayName, character, isAdmin, children }: Props) {
  const [area, setArea] = useState<Area>({ title: "Westeros" });
  const [leftOpen, setLeftOpen] = useState(true); // desktop
  const [rightOpen, setRightOpen] = useState(true); // desktop
  const [drawerOpen, setDrawerOpen] = useState(false); // cellulare

  return (
    <AreaContext.Provider value={setArea}>
      <div className="flex h-dvh flex-col overflow-hidden">
        {/* Barra in alto: zona attuale */}
        <header className="bar relative flex h-14 shrink-0 items-center justify-center border-b px-12">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Apri pannello"
            className="absolute left-3 text-muted hover:text-accent md:hidden"
          >
            <MenuIcon />
          </button>
          <h1 className="flex items-center gap-3 truncate font-serif text-lg tracking-[0.2em] text-accent uppercase drop-shadow-[0_0_10px_rgba(226,98,45,0.35)] md:text-2xl">
            <span className="hidden text-blood sm:inline">
              <FlameIcon />
            </span>
            <span className="truncate">{area.title}</span>
            <span className="hidden text-blood sm:inline">
              <FlameIcon />
            </span>
          </h1>
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
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-border bg-panel p-3 transition-transform md:static md:z-auto md:w-64 md:shrink-0 md:translate-x-0 md:bg-black/40 ${
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            } ${leftOpen ? "md:block" : "md:hidden"}`}
          >
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
            />
          </aside>

          <EdgeToggle side="left" open={leftOpen} onClick={() => setLeftOpen((v) => !v)} />

          {/* Centro: mappa, luoghi e chat */}
          <main className="min-w-0 flex-1 overflow-y-auto p-3 pb-20 md:p-5 md:pb-5">{children}</main>

          <EdgeToggle side="right" open={rightOpen} onClick={() => setRightOpen((v) => !v)} />

          {/* Colonna destra: icone (in basso su cellulare) */}
          <nav
            aria-label="Menu di gioco"
            className={`fixed inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around gap-1 overflow-x-auto border-t border-blood/60 bg-black/90 px-2 md:static md:h-auto md:w-14 md:shrink-0 md:flex-col md:justify-start md:gap-2 md:border-t-0 md:border-l md:border-border md:bg-black/40 md:px-0 md:py-4 ${
              rightOpen ? "" : "md:hidden"
            }`}
          >
            <RightRail characterId={character?.id ?? null} isAdmin={isAdmin} />
          </nav>
        </div>
      </div>
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
}: {
  area: Area;
  userId: string;
  displayName: string;
  character: MainCharacter | null;
}) {
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

      {/* Personaggio */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-black/40 p-3">
        {character?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-blood/60 bg-background font-serif text-2xl text-accent">
            {(character?.name ?? displayName)[0]}
          </div>
        )}
        <div className="min-w-0">
          {character ? (
            <SheetButton
              characterId={character.id}
              trigger={<span className="block truncate">{character.name}</span>}
              className="max-w-full text-left font-serif text-accent hover:underline"
            />
          ) : (
            <p className="truncate font-serif text-accent">{displayName}</p>
          )}
          <p className={`text-xs ${character?.status === "attivo" ? "text-green-400" : "text-orange-300"}`}>
            {character?.status === "attivo" ? "Attivo" : "Non attivo"}
          </p>
        </div>
      </div>

      <OnlineList userId={userId} name={character?.name ?? displayName} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Chi e' online: presenza in tempo reale (Supabase Realtime)
// ---------------------------------------------------------------------
type Presence = { name: string; place: "mappa" | "chat" };

function OnlineList({ userId, name }: { userId: string; name: string }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const place: Presence["place"] = pathname.startsWith("/chat") ? "chat" : "mappa";
  const [online, setOnline] = useState<Presence[]>([]);
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase.channel("online", { config: { presence: { key: userId } } });
    ch.on("presence", { event: "sync" }, () => {
      // Una voce per utente (piu' schede aperte contano una volta sola)
      const state = ch.presenceState<Presence>();
      setOnline(Object.values(state).map((entries) => entries[entries.length - 1]));
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") setChannel(ch);
    });
    return () => {
      setChannel(null);
      supabase.removeChannel(ch);
    };
  }, [supabase, userId]);

  // Aggiorna dove mi trovo quando cambio pagina
  useEffect(() => {
    channel?.track({ name, place });
  }, [channel, name, place]);

  const onMap = online.filter((p) => p.place === "mappa").sort((a, b) => a.name.localeCompare(b.name));
  const elsewhere = online.length - onMap.length;

  return (
    <div className="rounded-md border border-border bg-black/40 p-3">
      <h2 className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.15em] text-accent uppercase">
        <MapIcon /> Sulla mappa
        <span className="rounded-full border border-accent px-1.5 text-[10px]">{onMap.length}</span>
      </h2>
      <ul className="space-y-1 text-sm">
        {onMap.map((p) => (
          <li key={p.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {p.name}
          </li>
        ))}
      </ul>
      {elsewhere > 0 && (
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
          +{elsewhere} online nelle chat
        </p>
      )}
    </div>
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
    <span className="pointer-events-none absolute right-12 hidden rounded border border-border bg-panel px-2 py-1 text-xs whitespace-nowrap text-foreground opacity-0 transition group-hover:opacity-100 md:block">
      {children}
    </span>
  );
}

function RightRail({ characterId, isAdmin }: { characterId: string | null; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = (href: string) => (pathname.startsWith(href) ? "text-accent" : "");

  return (
    <>
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
      <GuideButton
        book="manuale"
        label="Manuale di Gioco"
        className={railBtn}
        trigger={
          <>
            <BookIcon />
            <Tip>Manuale di Gioco</Tip>
          </>
        }
      />
      <GuideButton
        book="ambientazione"
        label="Ambientazione"
        className={railBtn}
        trigger={
          <>
            <CastleIcon />
            <Tip>Ambientazione</Tip>
          </>
        }
      />
      <Link href="/personaggi" className={`${railBtn} ${active("/personaggi")}`} aria-label="Personaggi">
        <UsersIcon />
        <Tip>Personaggi</Tip>
      </Link>
      {isAdmin && (
        <Link href="/admin/accessi" className={`${railBtn} ${active("/admin")}`} aria-label="Registro accessi">
          <EyeIcon />
          <Tip>Registro accessi</Tip>
        </Link>
      )}
      <form action={logout} className="md:mt-auto">
        <button className={`${railBtn} text-red-500 hover:text-red-400`} aria-label="Esci">
          <PowerIcon />
          <Tip>Esci</Tip>
        </button>
      </form>
    </>
  );
}
