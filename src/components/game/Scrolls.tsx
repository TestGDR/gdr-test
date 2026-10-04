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
type Inbox = { id: number; method: Method; delivered_at: string; opened: boolean; signed: boolean | null; sender_name: string | null; sender_id: string | null; body: string | null };
type Sent = { id: number; recipient_name: string; method: Method; created_at: string; deliver_at: string; signed: boolean; body: string };
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
type Raven = { id: number; sender_name: string; recipient_name: string; signed: boolean; from_name: string | null; to_name: string | null; created_at: string; deliver_at: string; body: string };

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
    onRead();
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
      <nav className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#5a3d22] px-4 py-3">
        <TabButton active={tab === "ricevuti"} onClick={() => (setTab("ricevuti"), setOpened(null))}>
          Cartigli ricevuti{sealed > 0 && <span className="ml-1.5 rounded-full bg-blood px-1.5 text-[0.625rem] text-white">{sealed}</span>}
        </TabButton>
        <TabButton active={tab === "inviati"} onClick={() => (setTab("inviati"), setOpened(null))}>
          Inviati
        </TabButton>
        <TabButton active={tab === "scrivi"} onClick={() => (setTab("scrivi"), setOpened(null))}>
          ✒ Scrivi un cartiglio
        </TabButton>
        {isAdmin && (
          <TabButton active={tab === "castello"} onClick={() => (setTab("castello"), setOpened(null))}>
            Archivio messaggi castello
          </TabButton>
        )}
        <span className="ml-auto text-xs text-[#c9b48a] italic">{place ? `Ti trovi a ${place}` : ""}</span>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
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
          <InboxGrid inbox={inbox} onOpen={open} />
        ) : tab === "castello" && isAdmin ? (
          <CastleArchive />
        ) : tab === "inviati" ? (
          <SentList sent={sent} onDiscard={(id) => discard(id, "inviati")} />
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
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center border px-3 py-1.5 font-serif text-xs tracking-[0.1em] uppercase transition ${
        active ? "border-[#c9a45c] bg-[#3b2414] text-[#f0dcae]" : "border-[#5a3d22] text-[#c9b48a] hover:border-[#c9a45c] hover:text-[#f0dcae]"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------
// Ricevuti: cartigli arrotolati; quelli chiusi hanno il sigillo intatto
function InboxGrid({ inbox, onOpen }: { inbox: Inbox[] | null; onOpen: (id: number) => void }) {
  if (inbox === null) return <p className="text-center text-[#c9b48a]">Caricamento...</p>;
  if (inbox.length === 0) return <p className="py-10 text-center text-[#c9b48a] italic">Nessun cartiglio ti è stato consegnato.</p>;
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {inbox.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onOpen(s.id)}
            className={`group flex w-full flex-col items-center gap-2 border p-3 text-center transition hover:border-[#c9a45c] hover:bg-[#2a1a10] ${
              s.opened ? "border-[#3d2a18] bg-black/20" : "border-[#7a5a30] bg-[#24160d]"
            }`}
          >
            <ScrollArt sealed={!s.opened} />
            <span className={`font-serif text-sm ${s.opened ? "text-[#c9b48a]" : "text-[#f0dcae]"}`}>
              {s.opened ? (s.signed ? `Da ${s.sender_name}` : "Biglietto anonimo") : "Cartiglio sigillato"}
            </span>
            <span className="flex items-center gap-1 text-[0.6875rem] text-[#a08a64]">
              <MethodIcon method={s.method} />
              Consegnato da {BY[s.method]}
            </span>
            <span className="text-[0.625rem] text-[#8a7656]">{when(s.delivered_at)}</span>
          </button>
        </li>
      ))}
    </ul>
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
// Archivio messaggi castello (solo admin): i cartigli giunti con i corvi,
// letti dai castellani all'arrivo
function CastleArchive() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Raven[] | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    supabase.rpc("castle_archive").then(({ data }) => setList((data ?? []) as Raven[]));
  }, [supabase]);
  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (r) => !q || [r.sender_name, r.recipient_name, r.from_name, r.to_name, r.body].some((t) => t?.toLowerCase().includes(q)),
  );
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p className="text-center text-sm text-[#c9b48a] italic">
        Ogni corvo che arriva a un castello viene letto dai castellani: qui trovi tutti i cartigli giunti in volo. Li vedono solo gli admin.
      </p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome, luogo o testo" className="input py-1.5" />
      {list === null && <p className="text-center text-[#c9b48a]">Caricamento...</p>}
      {list !== null && shown.length === 0 && <p className="py-6 text-center text-[#c9b48a] italic">Nessun corvo nell&apos;archivio.</p>}
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.id} className="border border-[#5a3d22] bg-[#24160d]">
            <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
              <span className="text-[#c9a45c]">
                <MethodIcon method="corvo" size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[#f0dcae]">
                  {r.sender_name}
                  {!r.signed && <span className="text-xs text-[#a08a64] italic"> (non firmato)</span>} → {r.recipient_name}
                </span>
                <span className="block text-[0.6875rem] text-[#a08a64]">
                  Da {r.from_name ?? "?"} a {r.to_name ?? "?"} · giunto il {when(r.deliver_at)}
                </span>
              </span>
            </button>
            {openId === r.id && (
              <p className="border-t border-[#5a3d22] px-4 py-3 text-sm whitespace-pre-wrap text-[#e8d8b4] italic">{r.body}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Inviati: il mittente sa solo se il cartiglio e' ancora in viaggio
function SentList({ sent, onDiscard }: { sent: Sent[] | null; onDiscard: (id: number) => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  if (sent === null) return <p className="text-center text-[#c9b48a]">Caricamento...</p>;
  if (sent.length === 0) return <p className="py-10 text-center text-[#c9b48a] italic">Non hai ancora inviato cartigli.</p>;
  return (
    <ul className="mx-auto max-w-3xl space-y-2">
      {sent.map((s) => {
        const travelling = Date.parse(s.deliver_at) > now;
        return (
          <li key={s.id} className="border border-[#5a3d22] bg-[#24160d]">
            <button type="button" onClick={() => setOpenId(openId === s.id ? null : s.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
              <span className="text-[#c9a45c]">
                <MethodIcon method={s.method} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[#f0dcae]">A {s.recipient_name}</span>
                <span className="block text-[0.6875rem] text-[#a08a64]">
                  Affidato a {BY[s.method]} il {when(s.created_at)} · {s.signed ? "firmato" : "senza firma"}
                </span>
              </span>
              <span className={`shrink-0 text-xs ${travelling ? "text-orange-300" : "text-[#a08a64]"}`}>
                {travelling ? `In viaggio · arriva verso le ${new Date(s.deliver_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "Consegnato"}
              </span>
            </button>
            {openId === s.id && (
              <div className="space-y-2 border-t border-[#5a3d22] px-4 py-3">
                <p className="text-sm whitespace-pre-wrap text-[#e8d8b4] italic">{s.body}</p>
                <div className="text-right">
                  <button type="button" onClick={() => onDiscard(s.id)} className="text-xs text-red-400 hover:text-red-300">
                    Getta la copia
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
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
  const [preview, setPreview] = useState<Preview | null>(null);
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
      .rpc("scroll_preview", { p_from: me.id, p_to: to.id, p_from_location: origin || null })
      .then(({ data }) => setPreview(((data as Preview[] | null) ?? [])[0] ?? null));
  }, [supabase, me.id, to, origin]);

  async function choose() {
    const n = normalizeCharacterName(name);
    if (validateCharacterName(n)) return setLookupError("Nome non valido.");
    const { data } = await supabase.from("characters").select("id, name").ilike("name", n).maybeSingle();
    if (!data) return setLookupError("Nessun personaggio con questo nome.");
    if (data.id === me.id) return setLookupError("Non puoi scrivere a te stesso.");
    setLookupError(null);
    setPreview(null);
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
    });
    setBusy(false);
    if (error) return setError(error.message.includes("strada") ? "Nessuna strada per raggiungere il destinatario." : "Il cartiglio non è partito.");
    onSent();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {isStaff && (
        <div className="space-y-1">
          <label htmlFor="cartiglio-da" className="block font-serif text-xs tracking-[0.12em] text-[#c9b48a] uppercase">
            Parti da (solo staff)
          </label>
          <select id="cartiglio-da" value={origin} onChange={(e) => setOrigin(e.target.value)} className="input py-1.5">
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
        <label htmlFor="cartiglio-a" className="block font-serif text-xs tracking-[0.12em] text-[#c9b48a] uppercase">
          Destinatario
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="cartiglio-a"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTo(null);
              setPreview(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), choose())}
            onBlur={() => name.trim() && !to && choose()}
            placeholder="Nome del personaggio"
            className="input py-1.5"
          />
          {!to && (
            <button type="button" onClick={choose} className="btn-ghost shrink-0 px-3 py-1.5 text-sm">
              Scegli
            </button>
          )}
        </div>
        {lookupError && <p className="text-xs text-red-400">{lookupError}</p>}
      </div>

      {to && preview && (
        <p className="flex items-start gap-2 border border-[#5a3d22] bg-[#24160d] px-3 py-2 text-sm text-[#e8d8b4]">
          <span className="mt-0.5 text-[#c9a45c]">{preview.method && <MethodIcon method={preview.method} size={18} />}</span>
          <span>
            {preview.method === null ? (
              <span className="text-orange-300">Nessuna strada per raggiungere il destinatario: il cartiglio non può partire da qui.</span>
            ) : preview.method === "paggio" ? (
              <>Vi trovate nello stesso luogo: un paggio lo consegnerà subito a mano.</>
            ) : preview.method === "corvo" ? (
              <>
                Partirà un corvo{preview.from_name ? ` da ${preview.from_name}` : ""}: arriverà in circa {duration(preview.minutes ?? 0)}.
              </>
            ) : (
              <>
                Servirà una staffetta, a cavallo e per mare, di gran carriera: arriverà in circa {duration(preview.minutes ?? 0)}.
              </>
            )}
            {preview.risky && preview.method && preview.method !== "paggio" && (
              <span className="mt-1 block text-xs text-orange-300">
                Le strade fuori dalle terre sicure sono pericolose: il cartiglio potrebbe essere intercettato e non arrivare mai.
              </span>
            )}
          </span>
        </p>
      )}

      <div className="unrolled-scroll px-8 py-10">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={9}
          placeholder="Scrivi il tuo messaggio..."
          aria-label="Testo del cartiglio"
          className="w-full resize-none border-0 bg-transparent text-[0.9375rem] leading-relaxed text-[#2e2014] italic placeholder:text-[#8a7656] focus:outline-none"
        />
        <p className="mt-2 text-right font-serif text-[#5a1408]">{signed ? <>— {me.name}</> : <span className="text-sm text-[#7a6248] italic">Nessuna firma</span>}</p>
      </div>

      <label className="flex items-center gap-2 text-sm text-[#e8d8b4]">
        <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} className="h-4 w-4 accent-[#8b2a14]" />
        Firma il cartiglio (senza firma è un biglietto anonimo)
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="text-center">
        <button type="button" disabled={busy || !to || !body.trim() || preview?.method === null} onClick={send} className="btn px-8">
          Sigilla e invia
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Cartiglio arrotolato con sigillo di ceralacca (intatto o spezzato)
function ScrollArt({ sealed }: { sealed: boolean }) {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" aria-hidden className="drop-shadow-[0_3px_4px_rgb(0_0_0/0.7)]">
      <defs>
        <linearGradient id="carta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2e3bd" />
          <stop offset=".5" stopColor="#dcc28f" />
          <stop offset="1" stopColor="#b8975f" />
        </linearGradient>
      </defs>
      {/* rotolo */}
      <rect x="10" y="18" width="76" height="28" rx="3" fill="url(#carta)" />
      <ellipse cx="10" cy="32" rx="6" ry="14" fill="#c9ab74" />
      <ellipse cx="10" cy="32" rx="3" ry="9" fill="#8a6a3e" />
      <ellipse cx="86" cy="32" rx="6" ry="14" fill="#e6d2a4" />
      {/* nastro */}
      <rect x="44" y="18" width="8" height="28" fill="#6e1a10" />
      {sealed ? (
        <>
          <circle cx="48" cy="32" r="10" fill="#8b1a10" />
          <circle cx="48" cy="32" r="7" fill="none" stroke="#5c0f08" strokeWidth="1.5" />
          <path d="M44 32h8M48 28v8" stroke="#c9483a" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M39 26a10 10 0 0 1 8-4l-2 9z" fill="#8b1a10" />
          <path d="M57 38a10 10 0 0 1-8 4l2-9z" fill="#8b1a10" />
        </>
      )}
    </svg>
  );
}

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
