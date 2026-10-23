"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "./MessagesModal";

// ---------------------------------------------------------------------
// Missive (messaggi ON) come cartigli: ogni messaggio e' un foglio a se',
// sigillato. Chi lo riceve vede solo come e' arrivato (paggio, corvo,
// staffetta); il mittente si scopre aprendolo, e solo se ha firmato.
// Tempi e consegne li decide il database (vedi migrazione 0050).
// ---------------------------------------------------------------------

type Method = "paggio" | "corvo" | "staffetta";
type Inbox = {
  id: number;
  method: Method;
  delivered_at: string;
  opened: boolean;
  signed: boolean | null;
  sender_name: string | null;
  sender_id: string | null;
  body: string | null;
  from_name?: string | null; // luogo di partenza (dopo l'apertura)
  sender_house?: string | null; // casata del mittente (aperto e firmato)
  archived?: boolean;
};
type Sent = {
  id: number;
  recipient_name: string;
  method: Method;
  created_at: string;
  deliver_at: string;
  signed: boolean;
  body: string;
  to_name?: string | null; // luogo di arrivo
  recipient_house?: string | null;
  archived?: boolean;
};
type Opened = { id: number; method: Method; delivered_at: string; signed: boolean; sender_name: string | null; sender_id: string | null; body: string };
type Preview = { method: Method | null; minutes: number | null; risky: boolean; from_name: string | null }; // method null: nessuna strada

const BY: Record<Method, string> = { paggio: "un paggio", corvo: "un corvo", staffetta: "una staffetta" };
const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
function duration(min: number) {
  if (min < 60) return `${min} minuti`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} or${h === 1 ? "a" : "e"}${m ? ` e ${m} minuti` : ""}`;
}

type Tab = "ricevuti" | "inviati" | "scrivi" | "castello";
type Raven = {
  id: number;
  sender_name: string;
  recipient_name: string;
  signed: boolean;
  from_name: string | null;
  to_name: string | null;
  created_at: string;
  deliver_at: string;
  body: string;
  sender_house?: string | null;
  recipient_house?: string | null;
  archived?: boolean;
};

export default function Scrolls({
  me,
  initialTo,
  isAdmin,
  isStaff,
  onRead,
}: {
  me: MainCharacter;
  initialTo: Contact | null;
  isAdmin: boolean; // vede l'Archivio messaggi castello
  isStaff: boolean; // sceglie da dove parte il cartiglio ("Parti da")
  onRead: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>(initialTo ? "scrivi" : "ricevuti");
  const [to, setTo] = useState<Contact | null>(initialTo);
  const [inbox, setInbox] = useState<Inbox[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [place, setPlace] = useState<string | null>(null);

  const loadInbox = useCallback(
    () => supabase.rpc("scrolls_inbox", { p_character: me.id }).then(({ data }) => (data ?? []) as Inbox[]),
    [supabase, me.id],
  );
  const loadSent = useCallback(
    () => supabase.rpc("scrolls_sent", { p_character: me.id }).then(({ data }) => (data ?? []) as Sent[]),
    [supabase, me.id],
  );

  useEffect(() => {
    loadInbox().then(setInbox);
    loadSent().then(setSent);
    // dove si trova il PG
    supabase
      .rpc("character_location", { p_character: me.id })
      .then(({ data }) => (data ? supabase.from("locations").select("name").eq("id", data as string).maybeSingle() : null))
      .then((r) => setPlace((r?.data?.name as string | undefined) ?? null));
    // un cartiglio in arrivo: all'ora di consegna l'elenco si aggiorna
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ch = supabase
      .channel(`cartigli:${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scroll_notices", filter: `character_id=eq.${me.id}` }, (p) => {
        const wait = Math.max(0, Date.parse((p.new as { deliver_at: string }).deliver_at) - Date.now()) + 1500;
        timers.push(setTimeout(() => loadInbox().then(setInbox), wait));
      })
      .subscribe();
    return () => {
      timers.forEach(clearTimeout);
      supabase.removeChannel(ch);
    };
  }, [supabase, me.id, loadInbox, loadSent]);

  async function open(id: number) {
    const { data } = await supabase.rpc("open_scroll", { p_scroll: id });
    const s = (data as Opened[] | null)?.[0];
    if (!s) return;
    setOpened(s);
    setInbox((prev) =>
      prev?.map((x) => (x.id === id ? { ...x, opened: true, signed: s.signed, sender_name: s.sender_name, sender_id: s.sender_id, body: s.body } : x)) ?? prev,
    );
    loadInbox().then(setInbox);
    onRead();
  }

  // Elenco: gettare o archiviare piu' cartigli insieme
  async function discardMany(ids: number[]) {
    if (!ids.length || !window.confirm(`Gettare via ${ids.length === 1 ? "il cartiglio selezionato" : `i ${ids.length} cartigli selezionati`}? Non potrai più rileggerli.`)) return;
    await Promise.all(ids.map((id) => supabase.rpc("discard_scroll", { p_scroll: id })));
    setInbox((prev) => prev?.filter((x) => !ids.includes(x.id)) ?? prev);
    onRead();
  }
  async function discardSent(ids: number[]) {
    if (!ids.length || !window.confirm(`Gettare ${ids.length === 1 ? "la copia selezionata" : `le ${ids.length} copie selezionate`}?`)) return;
    await Promise.all(ids.map((id) => supabase.rpc("discard_scroll", { p_scroll: id })));
    setSent((prev) => prev?.filter((x) => !ids.includes(x.id)) ?? prev);
  }
  async function archiveSent(ids: number[], archived: boolean) {
    if (!ids.length) return;
    const { error } = await supabase.rpc("archive_sent_scrolls", { p_ids: ids, p_archived: archived });
    if (error) return window.alert("Per l'archivio va eseguita la migrazione 0162 in Supabase.");
    setSent((prev) => prev?.map((x) => (ids.includes(x.id) ? { ...x, archived } : x)) ?? prev);
  }
  async function archiveMany(ids: number[], archived: boolean) {
    if (!ids.length) return;
    const { error } = await supabase.rpc("archive_scrolls", { p_ids: ids, p_archived: archived });
    if (error) return window.alert("Per l'archivio va eseguita la migrazione 0161 in Supabase.");
    setInbox((prev) => prev?.map((x) => (ids.includes(x.id) ? { ...x, archived } : x)) ?? prev);
  }

  async function discard(id: number, from: "ricevuti" | "inviati") {
    if (!window.confirm("Gettare via questo cartiglio? Non potrai più rileggerlo.")) return;
    await supabase.rpc("discard_scroll", { p_scroll: id });
    if (from === "ricevuti") setInbox((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    else setSent((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    setOpened(null);
    onRead();
  }

  const sealed = inbox?.filter((s) => !s.opened).length ?? 0;

  return (
    <div className="scrolls-desk flex h-full flex-col">
      <nav className="missiva-nav flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
        <TabButton active={tab === "ricevuti"} onClick={() => (setTab("ricevuti"), setOpened(null))}>
          Cartigli ricevuti{sealed > 0 && <span className="ml-1.5 rounded-full bg-blood px-1.5 text-[0.625rem] text-white">{sealed}</span>}
        </TabButton>
        <TabButton active={tab === "inviati"} onClick={() => (setTab("inviati"), setOpened(null))}>
          Inviati
        </TabButton>
        <TabButton active={tab === "scrivi"} onClick={() => (setTab("scrivi"), setOpened(null))}>
          <QuillIcon />
          Scrivi un cartiglio
        </TabButton>
        {isAdmin && (
          <TabButton active={tab === "castello"} onClick={() => (setTab("castello"), setOpened(null))}>
            Archivio messaggi castello
          </TabButton>
        )}
        <span className="ml-auto text-xs text-[#c9b48a] italic">{place ? `Ti trovi a ${place}` : ""}</span>
      </nav>

      <div className="flex min-h-0 flex-1">
      {/* il corvo sullo scrittoio (solo schermi larghi) */}
      <div aria-hidden className="missiva-corvo hidden w-[250px] shrink-0 lg:block" />
      <div className={`min-h-0 flex-1 p-4 sm:p-6 ${tab !== "scrivi" && !opened ? "flex flex-col" : "overflow-y-auto"}`}>
        {opened ? (
          <OpenedScroll
            s={opened}
            onBack={() => setOpened(null)}
            onReply={
              opened.signed && opened.sender_id && opened.sender_name
                ? () => {
                    setTo({ id: opened.sender_id!, name: opened.sender_name! });
                    setOpened(null);
                    setTab("scrivi");
                  }
                : null
            }
            onDiscard={() => discard(opened.id, "ricevuti")}
          />
        ) : tab === "ricevuti" ? (
          <InboxList inbox={inbox} onOpen={open} onDiscard={discardMany} onArchive={archiveMany} />
        ) : tab === "castello" && isAdmin ? (
          <CastleArchive />
        ) : tab === "inviati" ? (
          <SentList sent={sent} onDiscard={discardSent} onArchive={archiveSent} />
        ) : me.status !== "attivo" ? (
          <p className="py-10 text-center text-[#c9b48a]">Le missive sono messaggi in gioco: potrai scriverle quando il tuo personaggio sarà attivo.</p>
        ) : (
          <WriteScroll
            key={to?.id ?? "nuovo"}
            me={me}
            initialTo={to}
            isStaff={isStaff}
            here={place}
            onSent={() => {
              loadSent().then(setSent);
              setTo(null);
              setTab("inviati");
            }}
          />
        )}
      </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`missiva-tab flex items-center gap-2 px-4 py-1.5 font-serif text-xs tracking-[0.1em] uppercase transition ${
        active ? "missiva-tab-attiva" : ""
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------
// Ricevuti, inviati e archivio del castello: stesso elenco con ricerca,
// filtri per persona e casata, selezione, pagine e archivio
type Row = {
  id: number;
  title: string;
  strong: boolean; // da leggere: evidenziato
  lines: ReactNode[];
  date: string;
  archived: boolean;
  search: string; // testo in cui cercare
  person: string | null; // per il filtro (mittente o destinatario)
  houses: string[];
  icon: ReactNode;
  body?: ReactNode; // se c'e', cliccando si apre sotto la riga
};
const PAGE = 5;
function MissiveList({
  rows,
  personLabel,
  special = [],
  onOpen,
  onDelete,
  deleteLabel = "Elimina selezionati",
  onArchive,
  empty,
}: {
  rows: Row[] | null;
  personLabel: string; // "Tutti i mittenti", "Tutti i destinatari"
  special?: { value: string; label: string; test: (r: Row) => boolean }[];
  onOpen?: (id: number) => void;
  onDelete: (ids: number[]) => void;
  deleteLabel?: string;
  onArchive: (ids: number[], archived: boolean) => void;
  empty: string;
}) {
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("");
  const [house, setHouse] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  if (rows === null) return <p className="text-center text-[#c9b48a]">Caricamento...</p>;
  const archivedCount = rows.filter((x) => x.archived).length;
  const people = [...new Set(rows.map((x) => x.person).filter((n): n is string => !!n))].sort();
  const houses = [...new Set(rows.flatMap((x) => x.houses))].sort();
  const q = query.trim().toLowerCase();
  const spec = special.find((x) => x.value === person);
  const list = rows.filter(
    (x) =>
      x.archived === showArchive &&
      (!q || x.search.toLowerCase().includes(q)) &&
      (!person || (spec ? spec.test(x) : x.person === person)) &&
      (!house || x.houses.includes(house)),
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = list.slice(current * PAGE, current * PAGE + PAGE);
  const sel = picked.filter((id) => list.some((x) => x.id === id));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <input
            value={query}
            onChange={(e) => (setQuery(e.target.value), setPage(0))}
            placeholder="Cerca per nome, luogo o testo..."
            className="missiva-input w-full py-1.5 pr-9 pl-3 text-sm"
          />
          <span aria-hidden className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[#c08a4e]">
            <SearchIcon />
          </span>
        </label>
        <select value={person} onChange={(e) => (setPerson(e.target.value), setPage(0))} className="missiva-input px-2 py-1.5 text-sm" aria-label={personLabel}>
          <option value="">{personLabel}</option>
          {special.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
          {people.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select value={house} onChange={(e) => (setHouse(e.target.value), setPage(0))} className="missiva-input px-2 py-1.5 text-sm" aria-label="Casata">
          <option value="">Tutte le casate</option>
          {houses.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => (setShowArchive((v) => !v), setPage(0), setPicked([]))}
          className={`missiva-tab px-3 py-1.5 font-serif text-xs tracking-[0.1em] uppercase ${showArchive ? "missiva-tab-attiva" : ""}`}
        >
          {showArchive ? "← Indietro" : `Archiviati (${archivedCount})`}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="py-10 text-center text-[#c9b48a] italic">
          {rows.length === 0 ? empty : showArchive ? "Nessun cartiglio archiviato." : "Nessun cartiglio trovato."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {shown.map((x) => (
            <li key={x.id} className={`missiva-riga-elenco ${x.strong ? "missiva-sigillata" : ""}`}>
              <div className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => (onOpen ? onOpen(x.id) : setOpenId(openId === x.id ? null : x.id))}
                  aria-expanded={onOpen ? undefined : openId === x.id}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="missiva-busta flex h-11 w-11 shrink-0 items-center justify-center rounded-full">{x.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-serif text-[0.9375rem] ${x.strong ? "font-semibold text-[#f6e6c8]" : "text-[#e6cdb0]"}`}>{x.title}</span>
                    {x.lines.map((l, i) => (
                      <span key={i} className="block truncate text-xs text-[#a08a64]">
                        {l}
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 self-start pt-0.5 text-right text-xs text-[#a08a64]">{x.date}</span>
                </button>
                <input
                  type="checkbox"
                  checked={sel.includes(x.id)}
                  onChange={() => toggle(x.id)}
                  aria-label="Seleziona il cartiglio"
                  className="h-4 w-4 shrink-0 accent-[#c08a4e]"
                />
              </div>
              {!onOpen && openId === x.id && x.body && (
                <div className="border-t border-[#c08a4e]/30 px-4 py-3 text-sm whitespace-pre-wrap text-[#e8d8b4] italic">{x.body}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#c08a4e]/30 pt-3">
        <button
          type="button"
          disabled={!sel.length}
          onClick={() => (onDelete(sel), setPicked([]))}
          className="missiva-tab flex items-center gap-2 px-3 py-1.5 font-serif text-xs tracking-[0.1em] text-[#e8a090] uppercase disabled:opacity-40"
        >
          <TrashIcon /> {deleteLabel}
        </button>
        {pages > 1 && (
          <nav aria-label="Pagine" className="flex items-center gap-1 font-serif text-sm text-[#e6cdb0]">
            <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="px-2 disabled:opacity-30" aria-label="Pagina precedente">
              ◂
            </button>
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                aria-current={i === current}
                className={`h-7 min-w-7 px-1.5 ${i === current ? "missiva-tab-attiva border" : "hover:text-[#f6e6c8]"}`}
              >
                {i + 1}
              </button>
            ))}
            <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="px-2 disabled:opacity-30" aria-label="Pagina successiva">
              ▸
            </button>
          </nav>
        )}
        <button
          type="button"
          disabled={!sel.length}
          onClick={() => (onArchive(sel, !showArchive), setPicked([]))}
          className="missiva-tab flex items-center gap-2 px-3 py-1.5 font-serif text-xs tracking-[0.1em] uppercase disabled:opacity-40"
        >
          <ArchiveBoxIcon /> {showArchive ? "Rimetti nell'elenco" : "Archivia selezionati"}
        </button>
      </div>
    </div>
  );
}

const firstLine = (t: string | null) => {
  const l = (t ?? "").split("\n")[0];
  return l.length > 70 ? l.slice(0, 70) + "…" : l || "(senza testo)";
};

// Ricevuti: i sigillati non dicono chi scrive ne' da dove
function InboxList({
  inbox,
  onOpen,
  onDiscard,
  onArchive,
}: {
  inbox: Inbox[] | null;
  onOpen: (id: number) => void;
  onDiscard: (ids: number[]) => void;
  onArchive: (ids: number[], archived: boolean) => void;
}) {
  const rows: Row[] | null =
    inbox?.map((x) => ({
      id: x.id,
      title: x.opened ? firstLine(x.body) : "Cartiglio sigillato",
      strong: !x.opened,
      lines: [
        <>
          Da: {x.opened ? (x.signed ? x.sender_name : "biglietto anonimo") : "?"}
          {x.sender_house ? ` · ${x.sender_house}` : ""}
        </>,
        x.opened ? <>Luogo: {x.from_name ?? "—"}</> : <>Consegnato da {BY[x.method]}</>,
      ],
      date: when(x.delivered_at),
      archived: !!x.archived,
      search: [x.sender_name, x.from_name, x.body].filter(Boolean).join(" "),
      person: x.sender_name,
      houses: x.sender_house ? [x.sender_house] : [],
      icon: <EnvelopeIcon open={x.opened} />,
    })) ?? null;
  return (
    <MissiveList
      rows={rows}
      personLabel="Tutti i mittenti"
      special={[
        { value: "@sigillati", label: "Ancora sigillati", test: (r) => r.strong },
        { value: "@anonimi", label: "Biglietti anonimi", test: (r) => !r.strong && !r.person },
      ]}
      onOpen={onOpen}
      onDelete={onDiscard}
      onArchive={onArchive}
      empty="Nessun cartiglio ti è stato consegnato."
    />
  );
}

// Inviati: chi scrive sa solo se il cartiglio e' ancora in viaggio
function SentList({
  sent,
  onDiscard,
  onArchive,
}: {
  sent: Sent[] | null;
  onDiscard: (ids: number[]) => void;
  onArchive: (ids: number[], archived: boolean) => void;
}) {
  const [now] = useState(() => Date.now());
  const rows: Row[] | null =
    sent?.map((x) => {
      const travelling = Date.parse(x.deliver_at) > now;
      return {
        id: x.id,
        title: firstLine(x.body),
        strong: false,
        lines: [
          <>
            A: {x.recipient_name}
            {x.recipient_house ? ` · ${x.recipient_house}` : ""}
            {x.signed ? "" : " · senza firma"}
          </>,
          <>
            Luogo: {x.to_name ?? "—"} ·{" "}
            {travelling ? (
              <span className="text-amber-200">
                in viaggio, arriva verso le {new Date(x.deliver_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <>consegnato da {BY[x.method]}</>
            )}
          </>,
        ],
        date: when(x.created_at),
        archived: !!x.archived,
        search: [x.recipient_name, x.to_name, x.body].filter(Boolean).join(" "),
        person: x.recipient_name,
        houses: x.recipient_house ? [x.recipient_house] : [],
        icon: <ScrollIcon />,
        body: x.body,
      };
    }) ?? null;
  return (
    <MissiveList
      rows={rows}
      personLabel="Tutti i destinatari"
      onDelete={onDiscard}
      deleteLabel="Getta selezionati"
      onArchive={onArchive}
      empty="Non hai ancora inviato cartigli."
    />
  );
}

// Archivio messaggi castello (chi ha il permesso): i corvi giunti ai castelli,
// letti dai castellani
function CastleArchive() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Raven[] | null>(null);
  useEffect(() => {
    supabase.rpc("castle_archive").then(({ data }) => setList((data ?? []) as Raven[]));
  }, [supabase]);
  async function update(ids: number[], archived: boolean, del = false) {
    if (!ids.length) return;
    if (del && !window.confirm(`Togliere ${ids.length === 1 ? "il corvo selezionato" : `i ${ids.length} corvi selezionati`} dall'archivio del castello? Il cartiglio resta a chi l'ha scritto e a chi l'ha ricevuto.`)) return;
    const { error } = await supabase.rpc("castle_archive_update", { p_ids: ids, p_archived: archived, p_delete: del });
    if (error) return window.alert("Per questa funzione va eseguita la migrazione 0162 in Supabase.");
    setList((prev) => (del ? prev?.filter((x) => !ids.includes(x.id)) : prev?.map((x) => (ids.includes(x.id) ? { ...x, archived } : x))) ?? prev);
  }
  const rows: Row[] | null =
    list?.map((r) => ({
      id: r.id,
      title: firstLine(r.body),
      strong: false,
      lines: [
        <>
          Da: {r.sender_name}
          {r.sender_house ? ` · ${r.sender_house}` : ""}
          {r.signed ? "" : " (non firmato)"} → {r.recipient_name}
          {r.recipient_house ? ` · ${r.recipient_house}` : ""}
        </>,
        <>
          Luogo: da {r.from_name ?? "?"} a {r.to_name ?? "?"}
        </>,
      ],
      date: when(r.deliver_at),
      archived: !!r.archived,
      search: [r.sender_name, r.recipient_name, r.from_name, r.to_name, r.body].filter(Boolean).join(" "),
      person: r.sender_name,
      houses: [r.sender_house, r.recipient_house].filter((h): h is string => !!h),
      icon: <MethodIcon method="corvo" size={20} />,
      body: r.body,
    })) ?? null;
  return (
    <MissiveList
      rows={rows}
      personLabel="Tutti i mittenti"
      onDelete={(ids) => update(ids, false, true)}
      onArchive={(ids, archived) => update(ids, archived)}
      empty="Nessun corvo nell'archivio."
    />
  );
}

function ScrollIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1Z" />
      <path d="M7 16V6a2 2 0 0 0-2-2M10 8h4M10 11h4M10 14h3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}
function EnvelopeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      {open ? (
        <>
          <path d="M3 10.5 12 4l9 6.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
          <path d="m3 10.5 9 6 9-6" />
        </>
      ) : (
        <>
          <rect x="3" y="5.5" width="18" height="13" rx="1" />
          <path d="m3.5 6.5 8.5 7 8.5-7" />
          <circle cx="12" cy="13.5" r="1.8" fill="#8e1d16" stroke="#8e1d16" />
        </>
      )}
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
    </svg>
  );
}
function ArchiveBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 5h17v4h-17zM5 9v10h14V9M10 13h4" />
    </svg>
  );
}

// Un cartiglio aperto: pergamena srotolata con il testo e la firma
function OpenedScroll({ s, onBack, onReply, onDiscard }: { s: Opened; onBack: () => void; onReply: (() => void) | null; onDiscard: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="flex items-center justify-center gap-1.5 text-xs text-[#c9b48a] italic">
        <MethodIcon method={s.method} />
        Consegnato da {BY[s.method]} il {when(s.delivered_at)}
      </p>
      <article className="unrolled-scroll px-10 py-12 sm:px-14">
        <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-[#2e2014] italic">{s.body}</p>
        <p className="mt-8 text-right font-serif text-[#5a1408]">
          {s.signed ? <>— {s.sender_name}</> : <span className="text-sm text-[#7a6248] italic">Nessuna firma</span>}
        </p>
      </article>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onBack} className="btn-ghost px-4 py-1.5 text-sm">
          ← Torna ai cartigli
        </button>
        {onReply && (
          <button type="button" onClick={onReply} className="btn px-4 py-1.5 text-sm">
            ✒ Rispondi
          </button>
        )}
        <button type="button" onClick={onDiscard} className="btn-ghost border-red-900 px-4 py-1.5 text-sm text-red-400 hover:border-red-500">
          Getta il cartiglio
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Scrivere: destinatario, come arrivera' e in quanto tempo, testo, firma
function WriteScroll({
  me,
  initialTo,
  isStaff,
  here,
  onSent,
}: {
  me: MainCharacter;
  initialTo: Contact | null;
  isStaff: boolean;
  here: string | null; // dove si trova il PG
  onSent: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(initialTo?.name ?? "");
  const [to, setTo] = useState<Contact | null>(initialTo);
  const [options, setOptions] = useState<Preview[] | null>(null); // mezzi possibili (vuoto: nessuna strada)
  const [method, setMethod] = useState<Method | null>(null); // mezzo scelto
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [signed, setSigned] = useState(true);
  // staff: luogo di partenza ("" = la propria posizione)
  const [origin, setOrigin] = useState("");
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!isStaff) return;
    supabase
      .from("locations")
      .select("id, name")
      .eq("in_game", true)
      .order("name")
      .then(({ data }) => setPlaces((data ?? []) as { id: string; name: string }[]));
  }, [supabase, isStaff]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // destinatario scelto: anteprima del viaggio
  useEffect(() => {
    if (!to) return;
    supabase
      .rpc("scroll_options", { p_from: me.id, p_to: to.id, p_from_location: origin || null })
      .then(({ data }) => {
        const list = (data as Preview[] | null) ?? [];
        setOptions(list);
        setMethod(list[0]?.method ?? null); // proposto per primo: paggio, poi corvo
      });
  }, [supabase, me.id, to, origin]);

  async function choose() {
    const n = normalizeCharacterName(name);
    if (validateCharacterName(n)) return setLookupError("Nome non valido.");
    const { data } = await supabase.from("characters").select("id, name").ilike("name", n).maybeSingle();
    if (!data) return setLookupError("Nessun personaggio con questo nome.");
    if (data.id === me.id) return setLookupError("Non puoi scrivere a te stesso.");
    setLookupError(null);
    setOptions(null);
    setTo({ id: data.id, name: data.name });
  }

  async function send() {
    if (!to || !body.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("send_scroll", {
      p_from: me.id,
      p_to: to.id,
      p_body: body.trim(),
      p_signed: signed,
      p_from_location: origin || null,
      p_method: method,
    });
    setBusy(false);
    if (error)
      return setError(
        error.message.includes("strada")
          ? "Nessuna strada per raggiungere il destinatario."
          : error.message.includes("mezzo")
            ? "Il mezzo scelto non può raggiungere il destinatario."
            : "Il cartiglio non è partito.",
      );
    onSent();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {isStaff && (
        <div className="space-y-1">
          <label htmlFor="cartiglio-da" className="missiva-etichetta block">
            Parti da (solo staff)
          </label>
          <select id="cartiglio-da" value={origin} onChange={(e) => setOrigin(e.target.value)} className="missiva-input w-full px-3 py-2 text-sm">
            <option value="">La mia posizione{here ? ` (${here})` : ""}</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="cartiglio-a" className="missiva-etichetta block">
          Destinatario
        </label>
        <div className="space-y-2">
          <input
            id="cartiglio-a"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTo(null);
              setOptions(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), choose())}
            onBlur={() => name.trim() && !to && choose()}
            placeholder="Nome del personaggio"
            className="missiva-input w-full px-3 py-2 text-sm"
          />
          {!to && (
            <button type="button" onClick={choose} className="missiva-tab px-5 py-1.5 font-serif text-xs tracking-[0.1em] uppercase">
              Scegli
            </button>
          )}
        </div>
        {lookupError && <p className="text-xs text-red-400">{lookupError}</p>}
      </div>

      {to && options && (
        <div className="space-y-2 border border-[#5a3d22] bg-[#24160d] px-3 py-2 text-sm text-[#e8d8b4]">
          {options.length === 0 ? (
            <p className="text-amber-200">Nessuna strada per raggiungere il destinatario: il cartiglio non può partire da qui.</p>
          ) : options[0].method === "paggio" ? (
            <p className="flex items-center gap-2">
              <span className="text-[#c9a45c]">
                <MethodIcon method="paggio" size={18} />
              </span>
              Vi trovate nello stesso luogo: un paggio lo consegnerà subito a mano.
            </p>
          ) : (
            <>
              <p className="text-xs tracking-[0.12em] text-[#c9b48a] uppercase">
                {options.length > 1 ? "Come lo mandi?" : "Come partirà"}
              </p>
              {options.map((o) => (
                <label
                  key={o.method}
                  className={`flex cursor-pointer items-start gap-2 border px-2 py-1.5 ${method === o.method ? "border-[#c9a45c] bg-[#3b2414]" : "border-transparent"}`}
                >
                  <input
                    type="radio"
                    name="mezzo"
                    checked={method === o.method}
                    onChange={() => setMethod(o.method)}
                    className="mt-1 accent-[#8b2a14]"
                  />
                  <span className="mt-0.5 text-[#c9a45c]">{o.method && <MethodIcon method={o.method} size={18} />}</span>
                  <span>
                    {o.method === "corvo" ? (
                      <>
                        <strong>Corvo</strong>{o.from_name ? ` da ${o.from_name}` : ""}: arriva in circa {duration(o.minutes ?? 0)}.
                        <span className="block text-xs text-[#a08a64]">
                          Veloce, ma all&apos;arrivo i castellani leggono il cartiglio per sapere a chi va.
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>Staffetta</strong>, a cavallo e per mare, di gran carriera: arriva in circa {duration(o.minutes ?? 0)}.
                        <span className="block text-xs text-[#a08a64]">Più lenta, ma passa di mano in mano senza castellani.</span>
                      </>
                    )}
                  </span>
                </label>
              ))}
              {options.some((o) => o.risky) && (
                <p className="text-xs text-amber-200">
                  Le strade fuori dalle terre sicure sono pericolose: il cartiglio potrebbe essere intercettato e non arrivare mai.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* riga dorata con la corona */}
      <div aria-hidden className="flex items-center gap-3 py-1 text-[#c08a4e]">
        <span className="missiva-riga h-px flex-1" />
        <CrownIcon />
        <span className="missiva-riga missiva-riga-dx h-px flex-1" />
      </div>

      <div className="missiva-pergamena">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={7}
          placeholder="Scrivi il tuo messaggio..."
          aria-label="Testo del cartiglio"
          className="w-full resize-none border-0 bg-transparent pr-[16%] text-[0.9375rem] leading-relaxed text-[#2e2014] italic placeholder:text-[#7a6248] focus:outline-none"
        />
        <p className="mt-1 text-right font-serif tracking-wide text-[#5a3a22] [font-variant:small-caps]">
          {signed ? <>— {me.name}</> : <span className="text-sm text-[#7a6248] italic">Nessuna firma</span>}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-[#e8d8b4]">
        <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} className="h-4 w-4 accent-[#8b2a14]" />
        Firma il cartiglio (senza firma è un biglietto anonimo)
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="text-center">
        <button
          type="button"
          disabled={busy || !to || !body.trim() || !options?.length || !method}
          onClick={send}
          className="missiva-sigilla inline-flex items-center gap-3 py-2 pr-10 pl-3 font-serif text-sm tracking-[0.12em] text-[#f6e6c8] uppercase"
        >
          <SealIcon />
          Sigilla e invia
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Paggio (mano), corvo (ali), staffetta (cavallo al galoppo, stilizzato)
function MethodIcon({ method, size = 14 }: { method: Method; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (method === "corvo")
    return (
      <svg {...p}>
        <path d="M2 10c4-1 6 0 8 2 1-3 4-5 8-5l3-2-1 4c0 4-3 7-7 8l-2 4-1-4c-3-1-6-3-8-7Z" />
        <path d="M17 8.5h.01" />
      </svg>
    );
  if (method === "staffetta")
    return (
      <svg {...p}>
        <path d="M4 17l2-5 5-2 4 1 3-3 2 1-1 3-3 1-1 4" />
        <path d="M6 12 4 9M11 10l1 7M15 15l2 3M7 17l-1 3" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10.5V4a1.5 1.5 0 0 1 3 0v7" />
      <path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15" />
    </svg>
  );
}

// Piuma per "Scrivi un cartiglio"
function QuillIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 3c-6 1-11 5-13 12l-1 3 3-1c7-2 11-7 12-13" />
      <path d="M6 18 3 21M9 15l4-4M11 9l4 1" />
    </svg>
  );
}

// Corona al centro della riga dorata
function CrownIcon() {
  return (
    <svg viewBox="0 0 28 22" width="26" height="20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      <path d="M4 17 2.5 6.5l6 5L14 3l5.5 8.5 6-5L24 17Z" fill="rgb(192 138 78 / 0.15)" />
      <path d="M4 20h20M4 17h20" />
      <circle cx="14" cy="3" r="1.2" fill="currentColor" />
      <circle cx="2.5" cy="6.5" r="1" fill="currentColor" />
      <circle cx="25.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

// Sigillo di ceralacca sul pulsante "Sigilla e invia"
function SealIcon() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
      <defs>
        <radialGradient id="ceralacca" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#c0392b" />
          <stop offset="0.7" stopColor="#7a1712" />
          <stop offset="1" stopColor="#4a0c08" />
        </radialGradient>
      </defs>
      <path d="M16 2c3 0 4 2 6.5 2.6S28 6 28.6 9.5 30 13 30 16s-1.4 4-1.4 6.5-2.2 3.6-5.1 4.7S19 30 16 30s-4.1-1.7-7-2.8-4.6-2.2-5.2-4.7S2 19 2 16s1.4-3.5 1.8-6.5S6.5 5.2 9.5 4.6 13 2 16 2Z" fill="url(#ceralacca)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#e8a090" strokeOpacity=".35" strokeWidth="1" />
      <path d="M11 19.5h10M11.5 19.5 10.5 13l3 2.5L16 11l2.5 4.5 3-2.5-1 6.5" fill="none" stroke="#f3c9b8" strokeOpacity=".75" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
