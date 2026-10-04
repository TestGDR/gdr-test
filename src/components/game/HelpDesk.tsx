"use client";

import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import RichEditor from "@/components/guide/RichEditor";
import { normalizeCharacterName } from "@/lib/character-name";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------
// Help Desk: ticket tra i giocatori e lo staff.
// Home (come funziona), Nuovo ticket, Archivio (sospesi e chiusi).
// A destra l'elenco dei ticket, con i filtri. Lo staff ("ticket.gestire")
// vede tutti i ticket, risponde e ne cambia lo stato.
// ---------------------------------------------------------------------

type Status = "attesa" | "in_carico" | "sospeso" | "chiuso";
type Section = { id: string; name: string; instructions: string };
type Ticket = {
  id: string;
  title: string;
  status: Status;
  created_at: string;
  last_message_at: string;
  last_author_name: string;
  opener_name: string;
  assigned_name: string | null;
  section_id: string | null;
  section: { name: string } | null;
  participants: { character: { name: string } | null }[];
};
type Message = { id: number; author_name: string; from_staff: boolean; body: string; created_at: string };

const TICKET_SELECT = `id, title, status, created_at, last_message_at, last_author_name, opener_name, assigned_name, section_id,
  section:ticket_sections(name), participants:ticket_participants(character:characters(name))`;

const STATUS_LABEL: Record<Status, string> = { attesa: "In attesa", in_carico: "Preso in carico", sospeso: "Sospeso", chiuso: "Chiuso" };
const STATUS_COLOR: Record<Status, string> = {
  attesa: "text-orange-300",
  in_carico: "text-green-400",
  sospeso: "text-sky-300",
  chiuso: "text-muted",
};
const OPEN: Status[] = ["attesa", "in_carico"];

const sanitize = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
const date = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} minut${min === 1 ? "o" : "i"} fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} or${h === 1 ? "a" : "e"} fa`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} giorn${d === 1 ? "o" : "i"} fa`;
  const m = Math.round(d / 30);
  return m <= 1 ? "circa un mese fa" : `circa ${m} mesi fa`;
}

type View = { page: "home" } | { page: "nuovo" } | { page: "archivio" } | { page: "ticket"; id: string; from: "aperti" | "archivio" };

export default function HelpDesk({ me, isStaff, onSeen }: { me: MainCharacter | null; isStaff: boolean; onSeen: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>({ page: "home" });
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<Section[]>([]);
  const [newSection, setNewSection] = useState(""); // sezione scelta nel nuovo ticket (istruzioni a destra)

  const load = useCallback(async () => {
    const [{ data }, { data: ids }] = await Promise.all([
      supabase.from("tickets").select(TICKET_SELECT).order("last_message_at", { ascending: false }).limit(500),
      supabase.rpc("ticket_unread_ids"),
    ]);
    return { list: (data ?? []) as unknown as Ticket[], unread: new Set(((ids ?? []) as string[]).map(String)) };
  }, [supabase]);
  const refresh = useCallback(() => {
    load().then(({ list, unread }) => {
      setTickets(list);
      setUnread(unread);
    });
  }, [load]);

  useEffect(() => {
    refresh();
    supabase
      .from("ticket_sections")
      .select("id, name, instructions")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setSections((data ?? []) as Section[]));
    const ch = supabase
      .channel(`helpdesk:${me?.id ?? "staff"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, me?.id, refresh]);

  const archive = view.page === "archivio" || (view.page === "ticket" && view.from === "archivio");
  const openTicket = (t: Ticket) => setView({ page: "ticket", id: t.id, from: OPEN.includes(t.status) ? "aperti" : "archivio" });

  return (
    <div className="flex h-full flex-col">
      {/* Menu in alto */}
      <nav className="flex shrink-0 flex-wrap justify-center gap-2 border-b border-border px-4 py-3">
        <NavButton active={view.page === "home"} onClick={() => setView({ page: "home" })} icon="⌂">
          Home
        </NavButton>
        <NavButton active={view.page === "nuovo"} onClick={() => setView({ page: "nuovo" })} icon="+">
          Nuovo ticket
        </NavButton>
        <NavButton active={archive} onClick={() => setView({ page: "archivio" })} icon="▤">
          Archivio
        </NavButton>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Centro */}
        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {view.page === "home" && <Home isStaff={isStaff} />}
          {view.page === "archivio" && (
            <p className="py-10 text-center text-muted">Scegli un ticket sospeso o chiuso dall&apos;elenco a destra.</p>
          )}
          {view.page === "nuovo" &&
            (me ? (
              <NewTicket
                me={me}
                sections={sections}
                section={newSection}
                onSection={setNewSection}
                onCreated={(id) => {
                  refresh();
                  setView({ page: "ticket", id, from: "aperti" });
                }}
              />
            ) : (
              <p className="py-10 text-center text-muted">Per aprire un ticket serve un personaggio.</p>
            ))}
          {view.page === "ticket" && (
            <TicketView
              key={view.id}
              ticket={tickets?.find((t) => t.id === view.id) ?? null}
              isStaff={isStaff}
              onRead={() => {
                setUnread((u) => {
                  const n = new Set(u);
                  n.delete(view.id);
                  return n;
                });
                onSeen();
              }}
            />
          )}
        </section>

        {/* Destra: elenco dei ticket o istruzioni della sezione */}
        <aside className="flex max-h-[45%] shrink-0 flex-col border-t border-border bg-black/30 md:max-h-none md:w-80 md:border-t-0 md:border-l">
          {view.page === "nuovo" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <h3 className="mb-3 text-center font-serif text-sm tracking-[0.15em] text-accent uppercase">Istruzioni sezione</h3>
              {sections.find((s) => s.id === newSection) ? (
                <p className="text-sm leading-relaxed whitespace-pre-line">{sections.find((s) => s.id === newSection)!.instructions}</p>
              ) : (
                <p className="text-center text-sm text-muted">Scegli una sezione per vedere le sue istruzioni.</p>
              )}
            </div>
          ) : (
            <TicketList
              key={archive ? "archivio" : "aperti"}
              title={archive ? "Ticket sospesi o chiusi" : "Ticket aperti"}
              statuses={archive ? ["sospeso", "chiuso"] : OPEN}
              tickets={tickets}
              unread={unread}
              sections={sections}
              selectedId={view.page === "ticket" ? view.id : null}
              onOpen={openTicket}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border px-3 py-1.5 text-xs tracking-[0.12em] uppercase transition ${
        active ? "border-accent bg-blood/30 text-accent" : "border-border bg-black/40 text-foreground hover:border-accent hover:text-accent"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      <span aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------
function Home({ isStaff }: { isStaff: boolean }) {
  return (
    <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed">
      <h2 className="text-center font-serif text-2xl tracking-[0.12em] text-accent uppercase">Utilizzo dell&apos;Help Desk</h2>
      <p>
        L&apos;Help Desk e i ticket servono a giocatori e staff per comunicare senza dimenticanze né messaggi persi, e a tenere uno storico
        ordinato delle richieste, così ogni informazione utile si ritrova quando serve.
      </p>
      <p>
        Per domande semplici o informazioni rapide puoi sempre scrivere un messaggio OFF a un membro dello staff collegato. Per richieste
        più complesse, e per tutto ciò che riguarda i personaggi e il gioco e ha bisogno di una conferma dello staff, usa sempre i ticket.
      </p>
      <h3 className="border-b border-accent/40 pb-1 font-serif text-lg text-accent">Come funzionano i ticket</h3>
      <p>
        <span className="text-accent">»</span> Clicca su <strong>Nuovo ticket</strong> nel menu in alto, scrivi un titolo che riassuma
        la richiesta in poche parole e scegli la sezione giusta: a destra compariranno le sue istruzioni. Puoi includere anche altri PG
        coinvolti. Appena inviato, il ticket è <em>in attesa</em>; diventa <em>preso in carico</em> quando un membro dello staff se ne
        occupa.
      </p>
      <p>
        <span className="text-accent">»</span> Quando lo staff risponde, l&apos;icona dei ticket lampeggia e ricevi un messaggio di
        SISTEMA nei messaggi OFF.
      </p>
      <p>
        <span className="text-accent">»</span> In <strong>Archivio</strong> trovi i ticket chiusi e quelli <em>sospesi</em> (per
        un&apos;assenza del giocatore o quando la richiesta va messa in pausa).
      </p>
      <p>
        <span className="text-accent">»</span> Abbi pazienza dopo aver inviato un ticket: lo staff cercherà di rispondere il prima
        possibile. Non sollecitare, a meno che non ci sia un&apos;urgenza di gioco.
      </p>
      {isStaff && (
        <p className="border border-[#d4a72c]/50 bg-[#d4a72c]/10 p-3 text-[#f0c75e]">
          Sei dello staff: vedi i ticket di tutti i giocatori. Aprendone uno puoi rispondere, prenderlo in carico, sospenderlo o chiuderlo.
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------
function TicketList({
  title,
  statuses,
  tickets,
  unread,
  sections,
  selectedId,
  onOpen,
}: {
  title: string;
  statuses: Status[];
  tickets: Ticket[] | null;
  unread: Set<string>;
  sections: Section[];
  selectedId: string | null;
  onOpen: (t: Ticket) => void;
}) {
  const [section, setSection] = useState("");
  const [status, setStatus] = useState("");
  const shown = (tickets ?? []).filter(
    (t) => statuses.includes(t.status) && (!section || t.section_id === section) && (!status || t.status === status),
  );
  return (
    <>
      <h3 className="shrink-0 pt-4 pb-2 text-center font-serif text-sm tracking-[0.15em] text-accent uppercase">{title}</h3>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {tickets === null && <li className="text-center text-sm text-muted">Caricamento...</li>}
        {tickets !== null && shown.length === 0 && <li className="py-4 text-center text-sm text-muted">Nessun ticket.</li>}
        {shown.map((t) => {
          const isNew = unread.has(t.id);
          const names = t.participants.map((p) => p.character?.name).filter(Boolean).join(", ") || t.opener_name;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpen(t)}
                className={`relative w-full border bg-[#14110f] px-3 pt-3 pb-2 text-left text-xs transition hover:border-accent ${
                  t.id === selectedId ? "border-accent" : isNew ? "border-[#d4a72c]" : "border-border"
                }`}
              >
                {t.section && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 border border-border bg-black px-2 text-[9px] tracking-[0.12em] text-muted uppercase">
                    {t.section.name}
                  </span>
                )}
                <span className="block text-center font-serif text-sm text-foreground uppercase">
                  {isNew && <span className="mr-1 text-[#f0c75e]" title="Da leggere">●</span>}
                  {t.title}
                </span>
                <span className="mt-1 block text-muted">
                  Aperto da <strong className="text-foreground">{names}</strong> il {date(t.created_at)} alle {time(t.created_at)}
                </span>
                <span className="block text-muted">
                  Ultima risposta <em>{ago(t.last_message_at)}</em>
                </span>
                <span className="block text-muted">
                  Di: <strong className="text-foreground">{t.last_author_name}</strong>
                </span>
                <span className={`mt-1 block text-right ${STATUS_COLOR[t.status]}`}>[{STATUS_LABEL[t.status]}]</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 space-y-1.5 border-t border-border p-3">
        <h4 className="text-center font-serif text-xs tracking-[0.15em] text-accent uppercase">Filtra ticket</h4>
        <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Sezione" className="input py-1 text-xs">
          <option value="">» Tutte le sezioni</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              » {s.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stato" className="input py-1 text-xs">
          <option value="">» Tutti</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              » {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
function NewTicket({
  me,
  sections,
  section,
  onSection,
  onCreated,
}: {
  me: MainCharacter;
  sections: Section[];
  section: string;
  onSection: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [others, setOthers] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!title.trim()) return setError("Scrivi un titolo.");
    if (!section) return setError("Scegli la sezione.");
    const clean = sanitize(body);
    if (!clean.replace(/<[^>]*>/g, "").trim()) return setError("Scrivi il testo del ticket.");
    setBusy(true);
    setError(null);
    // altri PG: nomi separati da virgola
    const ids: string[] = [];
    for (const raw of others.split(",").map((s) => s.trim()).filter(Boolean)) {
      const { data } = await supabase.from("characters").select("id").ilike("name", normalizeCharacterName(raw)).maybeSingle();
      if (!data) {
        setBusy(false);
        return setError(`Nessun personaggio di nome "${raw}".`);
      }
      if (data.id !== me.id) ids.push(data.id);
    }
    const { data, error } = await supabase.rpc("open_ticket", { p_character: me.id, p_title: title.trim(), p_section: section, p_body: clean, p_others: ids });
    setBusy(false);
    if (error || !data) return setError("Ticket non inviato.");
    onCreated(data as string);
  }

  const row = "grid items-center gap-2 sm:grid-cols-[8rem_1fr]";
  const label = "text-xs font-semibold tracking-[0.12em] uppercase sm:text-right";
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h2 className="mb-4 text-center font-serif text-2xl tracking-[0.12em] text-accent uppercase">Apri nuovo ticket</h2>
      <label className={row}>
        <span className={label}>Titolo</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Il titolo del tuo ticket" className="input py-1.5 text-sm" />
      </label>
      <label className={row}>
        <span className={label}>Includi altri PG</span>
        <input value={others} onChange={(e) => setOthers(e.target.value)} placeholder="Nomi dei personaggi, separati da una virgola" className="input py-1.5 text-sm" />
      </label>
      <label className={row}>
        <span className={label}>Sezione</span>
        <select value={section} onChange={(e) => onSection(e.target.value)} className="input py-1.5 text-sm">
          <option value="">Scegli la sezione del tuo ticket</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <RichEditor value={body} onChange={setBody} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="text-center">
        <button type="button" disabled={busy} onClick={send} className="btn px-10">
          Invia
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function TicketView({ ticket, isStaff, onRead }: { ticket: Ticket | null; isStaff: boolean; onRead: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState("");
  const [editorKey, setEditorKey] = useState(0); // svuota l'editor dopo l'invio
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const id = ticket?.id;

  const loadMessages = useCallback(
    (ticketId: string) =>
      supabase
        .from("ticket_messages")
        .select("id, author_name, from_staff, body, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at")
        .then(({ data }) => (data ?? []) as Message[]),
    [supabase],
  );

  // messaggi in tempo reale; aprire il ticket lo segna come letto
  useEffect(() => {
    if (!id) return;
    loadMessages(id).then(setMessages);
    supabase.rpc("mark_ticket_read", { p_ticket: id }).then(onRead);
    const ch = supabase
      .channel(`ticket:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` }, () => {
        loadMessages(id).then(setMessages);
        supabase.rpc("mark_ticket_read", { p_ticket: id }).then(onRead);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, id, loadMessages, onRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  if (!ticket) return <p className="py-10 text-center text-muted">Caricamento...</p>;

  async function send() {
    const clean = sanitize(reply);
    if (!clean.replace(/<[^>]*>/g, "").trim() || !ticket) return;
    setBusy(true);
    const { error } = await supabase.rpc("reply_ticket", { p_ticket: ticket.id, p_body: clean });
    setBusy(false);
    if (error) return setError("Risposta non inviata.");
    setError(null);
    setReply("");
    setEditorKey((k) => k + 1);
    loadMessages(ticket.id).then(setMessages);
  }

  async function setStatus(status: Status) {
    if (!ticket) return;
    const { error } = await supabase.rpc("set_ticket_status", { p_ticket: ticket.id, p_status: status });
    if (error) setError("Stato non cambiato.");
  }

  const closed = ticket.status === "chiuso";
  const names = ticket.participants.map((p) => p.character?.name).filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <header className="space-y-1 border-b border-border pb-3">
        <p className="text-center text-[10px] tracking-[0.15em] text-muted uppercase">{ticket.section?.name ?? "Senza sezione"}</p>
        <h2 className="text-center font-serif text-2xl text-accent">{ticket.title}</h2>
        <p className="text-center text-xs text-muted">
          Aperto da <strong className="text-foreground">{ticket.opener_name}</strong> il {date(ticket.created_at)} alle {time(ticket.created_at)}
          {names && names !== ticket.opener_name && <> · PG coinvolti: {names}</>}
        </p>
        <p className="text-center text-xs">
          <span className={STATUS_COLOR[ticket.status]}>{STATUS_LABEL[ticket.status]}</span>
          {ticket.assigned_name && <span className="text-muted"> · seguito da {ticket.assigned_name}</span>}
        </p>
        {isStaff && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {ticket.status !== "in_carico" && (
              <button type="button" onClick={() => setStatus("in_carico")} className="btn-ghost px-3 py-1 text-xs">
                {closed || ticket.status === "sospeso" ? "Riapri (in carico a me)" : "Prendi in carico"}
              </button>
            )}
            {ticket.status !== "sospeso" && !closed && (
              <button type="button" onClick={() => setStatus("sospeso")} className="btn-ghost px-3 py-1 text-xs">
                Sospendi
              </button>
            )}
            {!closed && (
              <button type="button" onClick={() => window.confirm("Chiudere il ticket?") && setStatus("chiuso")} className="btn-ghost border-red-900 px-3 py-1 text-xs text-red-400">
                Chiudi
              </button>
            )}
          </div>
        )}
      </header>

      {messages === null && <p className="text-sm text-muted">Caricamento...</p>}
      <div className="space-y-3">
        {messages?.map((m) => (
          <article key={m.id} className={`border-l-4 bg-[#14110f] ${m.from_staff ? "border-[#d4a72c]" : "border-[#4a7fa6]"}`}>
            <header className="flex flex-wrap items-baseline gap-x-2 border-b border-border/50 px-4 py-2">
              <span className={`text-xs font-bold tracking-wider uppercase ${m.from_staff ? "text-[#f0c75e]" : "text-[#8fb8d8]"}`}>{m.author_name}</span>
              {m.from_staff && <span className="border border-[#d4a72c]/60 px-1.5 text-[9px] tracking-widest text-[#f0c75e] uppercase">Staff</span>}
              <span className="ml-auto text-[11px] text-muted">
                {date(m.created_at)} {time(m.created_at)}
              </span>
            </header>
            <div className="guide-content px-4 py-3 text-sm" dangerouslySetInnerHTML={{ __html: sanitize(m.body) }} />
          </article>
        ))}
        <div ref={bottom} />
      </div>

      {closed && !isStaff ? (
        <p className="border-t border-border pt-3 text-center text-sm text-muted">
          Il ticket è chiuso. Se serve ancora qualcosa, apri un nuovo ticket.
        </p>
      ) : (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs tracking-[0.12em] text-muted uppercase">{isStaff ? "Rispondi come staff" : "Rispondi"}</p>
          <RichEditor key={editorKey} value={reply} onChange={setReply} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="text-center">
            <button type="button" disabled={busy} onClick={send} className="btn px-10">
              Invia risposta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
