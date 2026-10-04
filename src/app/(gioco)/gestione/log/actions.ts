"use server";

import { getStaffContext } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

// Ricerca nei log: chat di gioco (permesso chat.log), missive e OFF (messaggi.log).
// Si legge con il client del server: i messaggi privati non sono visibili allo staff con le regole normali.

export type LogKind = "chat" | "missiva" | "off";
export type LogFilters = {
  kind: LogKind;
  roomId?: string; // solo chat
  character?: string; // chat: chi scrive; missive/OFF: uno dei due
  other?: string; // missive/OFF: l'altro personaggio della conversazione
  from?: string; // data e ora italiane "AAAA-MM-GGTHH:MM"
  to?: string;
  text?: string;
};
export type LogRow = {
  id: number;
  at: string;
  place: string; // chat: "Luogo · Chat"; missive/OFF: "Mittente → Destinatario"
  author: string;
  tag: string; // chat: tipo di messaggio; missive/OFF: letto / non letto
  text: string;
};

const SHOW = 500; // risultati mostrati a schermo
const MAX_DOWNLOAD = 100_000;
const PAGE = 1000;

async function authorized(kind: LogKind) {
  const ctx = await getStaffContext();
  if (!ctx.permissions.has(kind === "chat" ? "chat.log" : "messaggi.log")) return null;
  return createAdminClient();
}

// Data e ora italiane -> istante esatto (ora legale compresa)
function romeToIso(local: string) {
  const guess = new Date(`${local.length === 16 ? local + ":00" : local}Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (shown.getTime() - utc.getTime())).toISOString();
}

// testo cercato alla lettera (niente caratteri jolly)
const like = (s: string) => `%${s.trim().replace(/[\\%_]/g, (c) => "\\" + c)}%`;

const KIND_LABEL: Record<string, string> = { azione: "azione", fuori_gioco: "fuori gioco", master: "master" };

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type ChatRaw = {
  id: number;
  created_at: string;
  character_name: string;
  kind: string;
  content: string;
  room: { name: string; location: { name: string } | null } | null;
};
type PrivateRaw = {
  id: number;
  created_at: string;
  body: string;
  read_at: string | null;
  sender: { name: string } | null;
  recipient: { name: string } | null;
};

// Missive: cartigli (con il mezzo di consegna e le intercettazioni)
type ScrollRaw = {
  id: number;
  created_at: string;
  deliver_at: string;
  body: string;
  read_at: string | null;
  sender_name: string;
  recipient_name: string;
  method: string;
  signed: boolean;
  intercepted: boolean;
};

async function characterIds(admin: Admin, name: string) {
  const { data } = await admin.from("characters").select("id").ilike("name", like(name)).limit(50);
  return (data ?? []).map((c) => c.id as string);
}

// Costruisce la ricerca (dentro un oggetto, altrimenti "await" la eseguirebbe subito);
// null = nessun risultato possibile (es. personaggio inesistente)
async function buildQuery(admin: Admin, f: LogFilters, withCount: boolean) {
  const from = f.from ? romeToIso(f.from) : null;
  const to = f.to ? romeToIso(f.to) : null;
  const opts = withCount ? { count: "exact" as const } : undefined;

  if (f.kind === "chat") {
    let q = admin
      .from("messages")
      .select("id, created_at, character_name, kind, content, room:rooms(name, location:locations(name))", opts);
    if (f.roomId) q = q.eq("room_id", f.roomId);
    if (f.character?.trim()) q = q.ilike("character_name", like(f.character));
    if (f.text?.trim()) q = q.ilike("content", like(f.text));
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    return { q };
  }

  if (f.kind === "missiva") {
    let q = admin
      .from("scrolls")
      .select("id, created_at, deliver_at, body, read_at, sender_name, recipient_name, method, signed, intercepted", opts);
    if (f.character?.trim()) {
      const a = await characterIds(admin, f.character);
      if (a.length === 0) return null;
      if (f.other?.trim()) {
        const b = await characterIds(admin, f.other);
        if (b.length === 0) return null;
        const A = a.join(","), B = b.join(",");
        q = q.or(`and(sender_id.in.(${A}),recipient_id.in.(${B})),and(sender_id.in.(${B}),recipient_id.in.(${A}))`);
      } else {
        q = q.or(`sender_id.in.(${a.join(",")}),recipient_id.in.(${a.join(",")})`);
      }
    }
    if (f.text?.trim()) q = q.ilike("body", like(f.text));
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    return { q };
  }

  let q = admin
    .from("private_messages")
    .select(
      "id, created_at, body, read_at, sender:characters!private_messages_sender_id_fkey(name), recipient:characters!private_messages_recipient_id_fkey(name)",
      opts,
    )
    .eq("kind", f.kind);
  if (f.character?.trim()) {
    const a = await characterIds(admin, f.character);
    if (a.length === 0) return null;
    if (f.other?.trim()) {
      // conversazione tra i due, in entrambe le direzioni
      const b = await characterIds(admin, f.other);
      if (b.length === 0) return null;
      const A = a.join(","), B = b.join(",");
      q = q.or(`and(sender_id.in.(${A}),recipient_id.in.(${B})),and(sender_id.in.(${B}),recipient_id.in.(${A}))`);
    } else {
      q = q.or(`sender_id.in.(${a.join(",")}),recipient_id.in.(${a.join(",")})`);
    }
  }
  if (f.text?.trim()) q = q.ilike("body", like(f.text));
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  return { q };
}

function toRows(kind: LogKind, data: unknown[]): LogRow[] {
  if (kind === "chat")
    return (data as ChatRaw[]).map((m) => ({
      id: m.id,
      at: m.created_at,
      place: m.room ? `${m.room.location?.name ?? ""} · ${m.room.name}` : "chat eliminata",
      author: m.character_name,
      tag: KIND_LABEL[m.kind] ?? m.kind,
      text: m.content,
    }));
  if (kind === "missiva")
    return (data as ScrollRaw[]).map((m) => ({
      id: m.id,
      at: m.created_at,
      place: `${m.sender_name} → ${m.recipient_name}`,
      author: m.sender_name,
      tag: [
        m.method,
        m.signed ? null : "senza firma",
        m.intercepted ? "INTERCETTATO" : Date.parse(m.deliver_at) > Date.now() ? "in viaggio" : m.read_at ? "aperto" : "sigillato",
      ]
        .filter(Boolean)
        .join(" · "),
      text: m.body,
    }));
  return (data as PrivateRaw[]).map((m) => ({
    id: m.id,
    at: m.created_at,
    place: `${m.sender?.name ?? "?"} → ${m.recipient?.name ?? "?"}`,
    author: m.sender?.name ?? "?",
    tag: m.read_at ? "letto" : "non letto",
    text: m.body,
  }));
}

// Ricerca: gli ultimi 500 risultati, in ordine di tempo, e il totale
export async function searchLogs(f: LogFilters): Promise<{ error?: string; rows?: LogRow[]; total?: number }> {
  const admin = await authorized(f.kind);
  if (!admin) return { error: "Non hai il permesso di vedere questi log." };
  const built = await buildQuery(admin, f, true);
  if (!built) return { rows: [], total: 0 };
  const { data, count, error } = await built.q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(SHOW);
  if (error) return { error: "Ricerca non riuscita." };
  return { rows: toRows(f.kind, data ?? []).reverse(), total: count ?? 0 };
}

// Scarica tutto cio' che corrisponde alla ricerca (fino a 100.000 messaggi)
export async function downloadLogs(f: LogFilters, format: "txt" | "csv"): Promise<{ error?: string; content?: string; count?: number }> {
  const admin = await authorized(f.kind);
  if (!admin) return { error: "Non hai il permesso di scaricare questi log." };
  const rows: LogRow[] = [];
  for (let start = 0; start < MAX_DOWNLOAD; start += PAGE) {
    const built = await buildQuery(admin, f, false);
    if (!built) break;
    const { data, error } = await built.q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) return { error: "Scaricamento non riuscito." };
    rows.push(...toRows(f.kind, data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  if (format === "csv") {
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const head = f.kind === "chat" ? ["Data", "Chat", "Personaggio", "Tipo", "Messaggio"] : ["Data", "Mittente → Destinatario", "Stato", "Messaggio"];
    const lines = rows.map((r) =>
      (f.kind === "chat" ? [when(r.at), r.place, r.author, r.tag, r.text] : [when(r.at), r.place, r.tag, r.text]).map(cell).join(";"),
    );
    // BOM: Excel riconosce le lettere accentate
    return { content: "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n"), count: rows.length };
  }

  const lines = rows.map((r) =>
    f.kind === "chat"
      ? `[${when(r.at)}] ${r.place} — ${r.author}${r.tag === "azione" ? "" : ` (${r.tag})`}:\n${r.text}\n`
      : `[${when(r.at)}] ${r.place}:\n${r.text}\n`,
  );
  return { content: lines.join("\n"), count: rows.length };
}
