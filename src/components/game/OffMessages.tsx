"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { normalizeCharacterName, validateCharacterName } from "@/lib/character-name";
import type { MainCharacter } from "@/lib/main-character";
import { createClient } from "@/lib/supabase/client";
import { Avatar, type Contact } from "./MessagesModal";

// ---------------------------------------------------------------------
// Messaggi OFF come una chat: conversazioni a due, gruppi e messaggi a
// tutti, tutto in tempo reale. Spunte: ✓ inviato, ✓✓ letto.
// ---------------------------------------------------------------------

type Person = { name: string; avatar_url: string | null } | null;
type Dm = {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender: Person;
  recipient: Person;
};
type Member = { character_id: string; last_read_at: string; character: Person };
type Group = { id: string; name: string; created_by: string | null; members: Member[] };
type GroupMsg = { id: number; group_id: string; sender_id: string; body: string; created_at: string; sender: Person };
type Broadcast = { id: number; sender_id: string | null; body: string; created_at: string; sender: Person };
type SystemMsg = { id: number; body: string; created_at: string; read_at: string | null };

// Riga dell'elenco delle conversazioni
type Conversation = {
  key: string; // "dm:<personaggio>", "group:<id>", "global"
  name: string;
  avatar?: string | null;
  kind: "dm" | "group" | "global" | "system";
  lastBody?: string;
  lastAt?: string;
  unread: number;
};

const DM_SELECT = `id, sender_id, recipient_id, body, created_at, read_at,
  sender:characters!private_messages_sender_id_fkey(name, avatar_url),
  recipient:characters!private_messages_recipient_id_fkey(name, avatar_url)`;
const GROUP_MSG_SELECT = "id, group_id, sender_id, body, created_at, sender:characters(name, avatar_url)";
const BROADCAST_SELECT = "id, sender_id, body, created_at, sender:characters(name, avatar_url)";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Oggi";
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}
function listTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? hhmm(iso) : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

export default function OffMessages({
  me,
  initialTo,
  canBroadcast,
  onRead,
}: {
  me: MainCharacter;
  initialTo: Contact | null;
  canBroadcast: boolean;
  onRead: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [dms, setDms] = useState<Dm[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMsgs, setGroupMsgs] = useState<GroupMsg[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [broadcastRead, setBroadcastRead] = useState<string | null>(null);
  const [systemMsgs, setSystemMsgs] = useState<SystemMsg[]>([]); // dal SISTEMA, sola lettura
  const [hidden, setHidden] = useState<Record<string, string>>({}); // conversazione -> cancellata fino a quest'ora
  const [extra, setExtra] = useState<Contact[]>(initialTo ? [initialTo] : []);
  const [active, setActive] = useState<string | null>(initialTo ? `dm:${initialTo.id}` : null);
  const [panel, setPanel] = useState<"none" | "new-group" | "members">("none");

  // ----- caricamento -----
  const loadDms = useCallback(
    () =>
      supabase
        .from("private_messages")
        .select(DM_SELECT)
        .eq("kind", "off")
        .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
        .order("created_at", { ascending: false })
        .limit(1000)
        .then(({ data }) => ((data ?? []) as unknown as Dm[]).reverse()),
    [supabase, me.id],
  );
  const loadGroups = useCallback(async () => {
    const { data: mine } = await supabase.from("off_group_members").select("group_id").eq("character_id", me.id);
    const ids = (mine ?? []).map((m) => m.group_id as string);
    if (ids.length === 0) return { groups: [] as Group[], msgs: [] as GroupMsg[] };
    const [{ data: g }, { data: msgs }] = await Promise.all([
      supabase
        .from("off_groups")
        .select("id, name, created_by, members:off_group_members(character_id, last_read_at, character:characters(name, avatar_url))")
        .in("id", ids),
      supabase.from("off_group_messages").select(GROUP_MSG_SELECT).in("group_id", ids).order("created_at", { ascending: false }).limit(1000),
    ]);
    return { groups: (g ?? []) as unknown as Group[], msgs: ((msgs ?? []) as unknown as GroupMsg[]).reverse() };
  }, [supabase, me.id]);
  const loadBroadcasts = useCallback(async () => {
    const [{ data: b }, { data: r }] = await Promise.all([
      supabase.from("off_broadcasts").select(BROADCAST_SELECT).order("created_at", { ascending: false }).limit(200),
      supabase.from("off_broadcast_reads").select("last_read_at").eq("character_id", me.id).maybeSingle(),
    ]);
    return { list: ((b ?? []) as unknown as Broadcast[]).reverse(), read: (r?.last_read_at as string | undefined) ?? null };
  }, [supabase, me.id]);

  const refreshGroups = useCallback(() => {
    loadGroups().then(({ groups, msgs }) => {
      setGroups(groups);
      setGroupMsgs(msgs);
    });
  }, [loadGroups]);

  useEffect(() => {
    loadDms().then(setDms);
    refreshGroups();
    loadBroadcasts().then(({ list, read }) => {
      setBroadcasts(list);
      setBroadcastRead(read);
    });
    supabase
      .from("system_messages")
      .select("id, body, created_at, read_at")
      .eq("character_id", me.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setSystemMsgs(((data ?? []) as SystemMsg[]).reverse()));
    supabase
      .from("off_hidden")
      .select("conv_key, hidden_at")
      .eq("character_id", me.id)
      .then(({ data }) => setHidden(Object.fromEntries((data ?? []).map((h) => [h.conv_key as string, h.hidden_at as string]))));
  }, [supabase, me.id, loadDms, refreshGroups, loadBroadcasts]);

  // ----- tempo reale -----
  useEffect(() => {
    const ch = supabase
      .channel(`off-chat:${me.id}`)
      // messaggio ricevuto
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${me.id}` }, async (p) => {
        if ((p.new as { kind: string }).kind !== "off") return;
        const { data } = await supabase.from("private_messages").select(DM_SELECT).eq("id", (p.new as Dm).id).single();
        if (data) setDms((prev) => (prev?.some((m) => m.id === (data as unknown as Dm).id) ? prev : [...(prev ?? []), data as unknown as Dm]));
      })
      // l'altro ha letto un mio messaggio: ✓✓
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter: `sender_id=eq.${me.id}` }, (p) => {
        const row = p.new as Dm;
        setDms((prev) => prev?.map((m) => (m.id === row.id ? { ...m, read_at: row.read_at } : m)) ?? prev);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "off_group_messages" }, async (p) => {
        const { data } = await supabase.from("off_group_messages").select(GROUP_MSG_SELECT).eq("id", (p.new as GroupMsg).id).maybeSingle();
        if (data) setGroupMsgs((prev) => (prev.some((m) => m.id === (data as unknown as GroupMsg).id) ? prev : [...prev, data as unknown as GroupMsg]));
      })
      // aggiunto o tolto da un gruppo, membri cambiati
      .on("postgres_changes", { event: "*", schema: "public", table: "off_group_members" }, () => refreshGroups())
      .on("postgres_changes", { event: "*", schema: "public", table: "off_broadcasts" }, () =>
        loadBroadcasts().then(({ list }) => setBroadcasts(list)),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_messages", filter: `character_id=eq.${me.id}` }, (p) => {
        const row = p.new as SystemMsg;
        setSystemMsgs((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, me.id, refreshGroups, loadBroadcasts]);

  // ----- conversazioni (senza i messaggi di quelle cancellate) -----
  const shownDms = useMemo(
    () =>
      (dms ?? []).filter((m) => {
        const other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
        const until = hidden[`dm:${other}`];
        return !until || m.created_at > until;
      }),
    [dms, hidden, me.id],
  );
  const shownBroadcasts = useMemo(
    () => broadcasts.filter((b) => !hidden.global || b.created_at > hidden.global),
    [broadcasts, hidden],
  );
  const conversations = useMemo(() => {
    const out: Conversation[] = [];
    if (systemMsgs.length > 0) {
      const last = systemMsgs.at(-1);
      out.push({
        key: "system",
        name: "SISTEMA",
        kind: "system",
        lastBody: last?.body,
        lastAt: last?.created_at,
        unread: systemMsgs.filter((m) => !m.read_at).length,
      });
    }
    if (shownBroadcasts.length > 0 || canBroadcast) {
      const last = shownBroadcasts.at(-1);
      out.push({
        key: "global",
        name: "Messaggi a tutti",
        kind: "global",
        lastBody: last?.body,
        lastAt: last?.created_at,
        unread: shownBroadcasts.filter((b) => b.sender_id !== me.id && broadcastRead !== null && b.created_at > broadcastRead).length,
      });
    }
    for (const g of groups) {
      const msgs = groupMsgs.filter((m) => m.group_id === g.id);
      const myRead = g.members.find((m) => m.character_id === me.id)?.last_read_at ?? "";
      const last = msgs.at(-1);
      out.push({
        key: `group:${g.id}`,
        name: g.name,
        kind: "group",
        lastBody: last ? `${last.sender_id === me.id ? "Tu" : (last.sender?.name ?? "?")}: ${last.body}` : "Gruppo creato",
        lastAt: last?.created_at,
        unread: msgs.filter((m) => m.sender_id !== me.id && m.created_at > myRead).length,
      });
    }
    const people = new Map<string, Conversation>();
    for (const c of extra) people.set(c.id, { key: `dm:${c.id}`, name: c.name, avatar: c.avatar, kind: "dm", unread: 0 });
    for (const m of shownDms) {
      const mine = m.sender_id === me.id;
      const otherId = mine ? m.recipient_id : m.sender_id;
      const other = mine ? m.recipient : m.sender;
      const entry = people.get(otherId) ?? { key: `dm:${otherId}`, name: other?.name ?? "?", avatar: other?.avatar_url, kind: "dm" as const, unread: 0 };
      entry.lastBody = (mine ? "Tu: " : "") + m.body;
      entry.lastAt = m.created_at;
      if (!mine && !m.read_at) entry.unread++;
      people.set(otherId, entry);
    }
    out.push(...people.values());
    // le piu' recenti in alto; SISTEMA e messaggi a tutti restano primi
    const pinned = (c: Conversation) => (c.kind === "system" ? 0 : c.kind === "global" ? 1 : 2);
    return out.sort((a, b) => pinned(a) - pinned(b) || (b.lastAt ?? "9").localeCompare(a.lastAt ?? "9"));
  }, [systemMsgs, shownBroadcasts, broadcastRead, groups, groupMsgs, shownDms, extra, me.id, canBroadcast]);

  const current = conversations.find((c) => c.key === active) ?? null;
  const activeGroup = current?.kind === "group" ? groups.find((g) => `group:${g.id}` === active) ?? null : null;
  const dmId = current?.kind === "dm" ? current.key.slice(3) : null;

  // ----- segna come letto la conversazione aperta -----
  const unreadHere = current?.unread ?? 0;
  const marking = useRef(""); // evita di salvare due volte lo stesso "letto"
  useEffect(() => {
    if (!current || unreadHere === 0) return;
    const mark = `${current.key}:${current.lastAt}`;
    if (marking.current === mark) return;
    marking.current = mark;
    if (current.kind === "dm" && dmId) {
      const now = new Date().toISOString();
      supabase
        .from("private_messages")
        .update({ read_at: now })
        .eq("kind", "off")
        .eq("recipient_id", me.id)
        .eq("sender_id", dmId)
        .is("read_at", null)
        .then(() => {
          setDms((prev) => prev?.map((m) => (m.sender_id === dmId && m.recipient_id === me.id && !m.read_at ? { ...m, read_at: now } : m)) ?? prev);
          onRead();
        });
    } else if (current.kind === "group" && activeGroup) {
      // segno = ora dell'ultimo messaggio (orologio del database)
      const last = groupMsgs.filter((m) => m.group_id === activeGroup.id).at(-1)?.created_at;
      if (!last) return;
      supabase
        .from("off_group_members")
        .update({ last_read_at: last })
        .eq("group_id", activeGroup.id)
        .eq("character_id", me.id)
        .then(() => {
          setGroups((prev) =>
            prev.map((g) =>
              g.id === activeGroup.id ? { ...g, members: g.members.map((m) => (m.character_id === me.id ? { ...m, last_read_at: last } : m)) } : g,
            ),
          );
          onRead();
        });
    } else if (current.kind === "global") {
      const last = broadcasts.at(-1)?.created_at;
      if (!last) return;
      supabase
        .from("off_broadcast_reads")
        .upsert({ character_id: me.id, last_read_at: last })
        .then(() => {
          setBroadcastRead(last);
          onRead();
        });
    } else if (current.kind === "system") {
      const now = new Date().toISOString();
      supabase
        .from("system_messages")
        .update({ read_at: now })
        .eq("character_id", me.id)
        .is("read_at", null)
        .then(() => {
          setSystemMsgs((prev) => prev.map((m) => (m.read_at ? m : { ...m, read_at: now })));
          onRead();
        });
    }
  }, [supabase, current, unreadHere, dmId, activeGroup, groupMsgs, broadcasts, me.id, onRead]);

  // ----- messaggi della conversazione aperta -----
  type Bubble = { id: string; mine: boolean; author?: string; body: string; at: string; status?: "sent" | "read" };
  const bubbles: Bubble[] = useMemo(() => {
    if (!current) return [];
    if (current.kind === "dm")
      return shownDms
        .filter((m) => (m.sender_id === dmId && m.recipient_id === me.id) || (m.sender_id === me.id && m.recipient_id === dmId))
        .map((m) => ({ id: `d${m.id}`, mine: m.sender_id === me.id, body: m.body, at: m.created_at, status: m.read_at ? "read" : "sent" }));
    if (current.kind === "group")
      return groupMsgs
        .filter((m) => `group:${m.group_id}` === current.key)
        .map((m) => ({ id: `g${m.id}`, mine: m.sender_id === me.id, author: m.sender?.name ?? "?", body: m.body, at: m.created_at }));
    if (current.kind === "system")
      return systemMsgs.map((m) => ({ id: `s${m.id}`, mine: false, author: "SISTEMA", body: m.body, at: m.created_at }));
    return shownBroadcasts.map((b) => ({ id: `b${b.id}`, mine: b.sender_id === me.id, author: b.sender?.name ?? "Staff", body: b.body, at: b.created_at }));
  }, [current, shownDms, dmId, groupMsgs, shownBroadcasts, systemMsgs, me.id]);

  async function send(body: string) {
    if (!current) return "Nessuna conversazione.";
    if (current.kind === "dm" && dmId) {
      const { data, error } = await supabase
        .from("private_messages")
        .insert({ kind: "off", sender_id: me.id, recipient_id: dmId, body })
        .select(DM_SELECT)
        .single();
      if (error) return "Invio non riuscito.";
      setDms((prev) => [...(prev ?? []), data as unknown as Dm]);
    } else if (current.kind === "group" && activeGroup) {
      const { data, error } = await supabase
        .from("off_group_messages")
        .insert({ group_id: activeGroup.id, sender_id: me.id, body })
        .select(GROUP_MSG_SELECT)
        .single();
      if (error) return "Invio non riuscito.";
      const msg = data as unknown as GroupMsg;
      setGroupMsgs((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } else if (current.kind === "global") {
      const { error } = await supabase.from("off_broadcasts").insert({ sender_id: me.id, body });
      if (error) return "Invio non riuscito.";
      loadBroadcasts().then(({ list }) => setBroadcasts(list));
    }
    return null;
  }

  async function findCharacter(raw: string): Promise<Contact | string> {
    const name = normalizeCharacterName(raw);
    if (validateCharacterName(name)) return `"${raw.trim()}": nome non valido.`;
    const { data } = await supabase.from("characters").select("id, name, avatar_url").ilike("name", name).maybeSingle();
    if (!data) return `Nessun personaggio di nome "${name}".`;
    return { id: data.id, name: data.name, avatar: data.avatar_url };
  }

  async function openByName(raw: string) {
    const c = await findCharacter(raw);
    if (typeof c === "string") return c;
    if (c.id === me.id) return "Non puoi scrivere a te stesso.";
    setExtra((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
    setActive(`dm:${c.id}`);
    setPanel("none");
    return null;
  }

  async function createGroup(name: string, memberNames: string[]) {
    const ids: string[] = [];
    for (const n of memberNames) {
      const c = await findCharacter(n);
      if (typeof c === "string") return c;
      if (c.id !== me.id) ids.push(c.id);
    }
    if (ids.length === 0) return "Aggiungi almeno un altro personaggio.";
    const { data, error } = await supabase.rpc("create_off_group", { p_character: me.id, p_name: name, p_members: ids });
    if (error) return "Gruppo non creato.";
    const { groups, msgs } = await loadGroups();
    setGroups(groups);
    setGroupMsgs(msgs);
    setActive(`group:${data}`);
    setPanel("none");
    return null;
  }

  async function addMember(raw: string) {
    if (!activeGroup) return null;
    const c = await findCharacter(raw);
    if (typeof c === "string") return c;
    const { error } = await supabase.rpc("add_off_group_member", { p_group: activeGroup.id, p_character: c.id });
    if (error) return "Membro non aggiunto.";
    refreshGroups();
    return null;
  }

  // Cancella la conversazione dal mio elenco (l'altro la conserva). Il segno e'
  // l'ora dell'ultimo messaggio (orologio del database): i messaggi nuovi la fanno ricomparire
  async function deleteConversation(c: Conversation) {
    if (c.kind === "group") return leaveGroup(c.key.slice(6), c.name);
    const question =
      c.kind === "system"
        ? "Eliminare tutti i messaggi di SISTEMA?"
        : c.kind === "global"
          ? "Cancellare i messaggi a tutti dal tuo elenco?"
          : `Cancellare la conversazione con ${c.name}? Per ${c.name} resterà com'è.`;
    if (!window.confirm(question)) return;
    if (c.kind === "system") {
      await supabase.from("system_messages").delete().eq("character_id", me.id);
      setSystemMsgs([]);
    } else {
      const otherId = c.kind === "dm" ? c.key.slice(3) : null;
      const last = (otherId ? shownDms.filter((m) => m.sender_id === otherId || m.recipient_id === otherId) : shownBroadcasts).at(-1)?.created_at;
      if (last) {
        // i non letti di quella conversazione diventano letti
        if (otherId)
          await supabase.from("private_messages").update({ read_at: new Date().toISOString() }).eq("kind", "off").eq("recipient_id", me.id).eq("sender_id", otherId).is("read_at", null);
        else await supabase.from("off_broadcast_reads").upsert({ character_id: me.id, last_read_at: last });
        await supabase.from("off_hidden").upsert({ character_id: me.id, conv_key: c.key, hidden_at: last });
        setHidden((h) => ({ ...h, [c.key]: last }));
        if (!otherId) setBroadcastRead(last);
      }
      if (otherId) setExtra((prev) => prev.filter((x) => x.id !== otherId));
    }
    if (active === c.key) setActive(null);
    onRead();
  }

  async function leaveGroup(groupId: string, name: string) {
    if (!window.confirm(`Uscire dal gruppo "${name}"? Non riceverai più i suoi messaggi.`)) return;
    await supabase.rpc("remove_off_group_member", { p_group: groupId, p_character: me.id });
    if (active === `group:${groupId}`) {
      setActive(null);
      setPanel("none");
    }
    refreshGroups();
    onRead();
  }

  async function deleteGroup(groupId: string, name: string) {
    if (!window.confirm(`Eliminare il gruppo "${name}" per tutti i membri, con tutti i suoi messaggi?`)) return;
    await supabase.rpc("delete_off_group", { p_group: groupId });
    if (active === `group:${groupId}`) {
      setActive(null);
      setPanel("none");
    }
    refreshGroups();
    onRead();
  }

  async function removeMember(characterId: string) {
    if (!activeGroup) return;
    const leaving = characterId === me.id;
    if (!window.confirm(leaving ? `Uscire dal gruppo "${activeGroup.name}"?` : "Togliere questo personaggio dal gruppo?")) return;
    await supabase.rpc("remove_off_group_member", { p_group: activeGroup.id, p_character: characterId });
    if (leaving) {
      setActive(null);
      setPanel("none");
    }
    refreshGroups();
  }

  const isOwner = activeGroup?.created_by === me.id;
  const canWriteHere = current?.kind === "system" ? false : current?.kind !== "global" || canBroadcast;

  return (
    <div className="flex h-full">
      {/* Conversazioni */}
      <aside className={`w-full flex-col border-border md:flex md:w-80 md:shrink-0 md:border-r ${active || panel === "new-group" ? "hidden" : "flex"}`}>
        <NameForm label="Nuovo messaggio a" button="Apri" onSubmit={openByName} />
        <div className="border-b border-border px-3 pb-3">
          <button type="button" onClick={() => (setPanel("new-group"), setActive(null))} className="btn-ghost w-full py-1.5 text-sm">
            + Nuovo gruppo
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {dms === null && <li className="p-3 text-sm text-muted">Caricamento...</li>}
          {dms !== null && conversations.length === 0 && <li className="p-3 text-sm text-muted">Nessuna conversazione.</li>}
          {conversations.map((c) => (
            <li key={c.key} className={`flex items-stretch border-b border-border/60 transition hover:bg-blood/15 ${c.key === active ? "bg-blood/25" : ""}`}>
              <button
                type="button"
                onClick={() => (setActive(c.key), setPanel("none"))}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left"
              >
                <ConversationIcon c={c} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`flex-1 truncate font-serif ${c.kind === "global" || c.kind === "system" ? "text-[#f0c75e]" : "text-accent"}`}>{c.name}</span>
                    <span className={`shrink-0 text-[10px] ${c.unread ? "text-green-400" : "text-muted"}`}>{listTime(c.lastAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-xs ${c.unread ? "text-foreground" : "text-muted"}`}>
                      {c.lastBody ?? (c.kind === "global" ? "Messaggi dello staff a tutti i giocatori" : "Nuova conversazione")}
                    </span>
                    {c.unread > 0 && <span className="min-w-5 rounded-full bg-green-600 px-1.5 text-center text-[11px] font-bold text-white">{c.unread}</span>}
                  </span>
                </span>
              </button>
              <RowActions
                c={c}
                isGroupOwner={c.kind === "group" && groups.find((g) => `group:${g.id}` === c.key)?.created_by === me.id}
                onDelete={() => deleteConversation(c)}
                onLeave={() => leaveGroup(c.key.slice(6), c.name)}
                onDeleteGroup={() => deleteGroup(c.key.slice(6), c.name)}
              />
            </li>
          ))}
        </ul>
      </aside>

      {/* Destra: conversazione aperta o nuovo gruppo */}
      <section className={`min-w-0 flex-1 flex-col ${active || panel === "new-group" ? "flex" : "hidden md:flex"}`}>
        {panel === "new-group" ? (
          <NewGroup onCreate={createGroup} onCancel={() => setPanel("none")} />
        ) : !current ? (
          <p className="m-auto p-6 text-center text-muted">Scegli una conversazione, scrivi il nome di un personaggio o crea un gruppo.</p>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <button type="button" onClick={() => (setActive(null), setPanel("none"))} className="text-muted hover:text-accent md:hidden" aria-label="Torna alle conversazioni">
                ←
              </button>
              <ConversationIcon c={current} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-serif text-lg text-accent">{current.name}</h3>
                {activeGroup && (
                  <button type="button" onClick={() => setPanel(panel === "members" ? "none" : "members")} className="block truncate text-xs text-muted hover:text-accent">
                    {activeGroup.members.map((m) => (m.character_id === me.id ? "Tu" : m.character?.name)).join(", ")}
                  </button>
                )}
                {current.kind === "global" && <p className="text-xs text-muted">Arrivano a tutti i giocatori, collegati e non</p>}
                {current.kind === "system" && <p className="text-xs text-muted">Avvisi automatici del gioco</p>}
              </div>
              {activeGroup && (
                <button type="button" onClick={() => setPanel(panel === "members" ? "none" : "members")} className="btn-ghost px-3 py-1 text-xs">
                  Membri ({activeGroup.members.length})
                </button>
              )}
            </header>

            {panel === "members" && activeGroup ? (
              <Members group={activeGroup} meId={me.id} isOwner={isOwner} onAdd={addMember} onRemove={removeMember} onClose={() => setPanel("none")} />
            ) : (
              <>
                <Thread bubbles={bubbles} showAuthors={current.kind !== "dm"} />
                {canWriteHere ? (
                  <Composer key={current.key} onSend={send} placeholder={current.kind === "global" ? "Scrivi un messaggio a tutti i giocatori..." : "Scrivi un messaggio..."} />
                ) : (
                  <p className="border-t border-border p-3 text-center text-sm text-muted">
                    {current.kind === "system" ? "Ai messaggi di SISTEMA non si può rispondere." : "Solo lo staff può scrivere a tutti i giocatori."}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Icone a destra di ogni conversazione: cestino; nei gruppi "esci" (e per chi
// l'ha creato "elimina il gruppo per tutti")
const rowBtn = "flex h-8 w-7 items-center justify-center text-muted transition hover:text-accent";

function RowActions({
  c,
  isGroupOwner,
  onDelete,
  onLeave,
  onDeleteGroup,
}: {
  c: Conversation;
  isGroupOwner: boolean;
  onDelete: () => void;
  onLeave: () => void;
  onDeleteGroup: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 pr-1.5 pl-1">
      {c.kind === "group" ? (
        <>
          <button type="button" onClick={onLeave} className={rowBtn} title="Esci dal gruppo" aria-label={`Esci dal gruppo ${c.name}`}>
            <LeaveIcon />
          </button>
          {isGroupOwner && (
            <button type="button" onClick={onDeleteGroup} className={`${rowBtn} hover:text-red-400`} title="Elimina il gruppo per tutti" aria-label={`Elimina il gruppo ${c.name}`}>
              <TrashIcon />
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={onDelete}
          className={`${rowBtn} hover:text-red-400`}
          title={c.kind === "system" ? "Elimina i messaggi di sistema" : "Cancella la conversazione"}
          aria-label={`Cancella la conversazione ${c.name}`}
        >
          <TrashIcon />
        </button>
      )}
    </span>
  );
}

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm3.5 0v8H15v-8h-1.5Z" />
  </svg>
);

// persona che esce da una porta
const LeaveIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 4H5v16h5" />
    <path d="M14 8l4 4-4 4M18 12H9" />
  </svg>
);

function ConversationIcon({ c }: { c: Conversation }) {
  if (c.kind === "dm") return <Avatar name={c.name} url={c.avatar} />;
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${
        c.kind === "global" || c.kind === "system" ? "border-[#d4a72c]/70 text-[#f0c75e]" : "border-blood/60 text-accent"
      } bg-background`}
      aria-hidden
    >
      {c.kind === "system" ? (
        // sigillo di ceralacca
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.5 14.2 4l2.6-.2.9 2.5 2.3 1.2-.4 2.6L21 12l-1.4 1.9.4 2.6-2.3 1.2-.9 2.5-2.6-.2L12 21.5 9.8 20l-2.6.2-.9-2.5L4 16.5l.4-2.6L3 12l1.4-1.9L4 7.5l2.3-1.2.9-2.5 2.6.2Z" />
          <path d="m8.5 12 2.4 2.4 4.6-4.8" />
        </svg>
      ) : c.kind === "global" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10v4h3l8 5V5L6 10H3Z" />
          <path d="M17.5 9a4 4 0 0 1 0 6M20 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.2a5 5 0 0 1 5.5 4.8" />
        </svg>
      )}
    </span>
  );
}

function Thread({ bubbles, showAuthors }: { bubbles: { id: string; mine: boolean; author?: string; body: string; at: string; status?: "sent" | "read" }[]; showAuthors: boolean }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [bubbles.length]);
  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
      {bubbles.length === 0 && <p className="text-center text-sm text-muted">Nessun messaggio.</p>}
      {bubbles.map((b, i) => {
        const prev = bubbles[i - 1];
        const newDay = !prev || dayLabel(prev.at) !== dayLabel(b.at);
        const sameAuthor = prev && !newDay && prev.mine === b.mine && prev.author === b.author;
        return (
          <Fragment key={b.id}>
            {newDay && (
              <p className="py-2 text-center">
                <span className="bg-black/60 px-3 py-0.5 text-[11px] text-muted capitalize">{dayLabel(b.at)}</span>
              </p>
            )}
            <div className={`flex ${b.mine ? "justify-end" : "justify-start"} ${sameAuthor ? "" : "pt-1"}`}>
              <div className={`max-w-[80%] border px-3 py-1.5 ${b.mine ? "border-blood/50 bg-blood/25" : "border-border bg-background"}`}>
                {showAuthors && !b.mine && !sameAuthor && <p className="text-xs font-semibold text-accent">{b.author}</p>}
                <p className="text-sm break-words whitespace-pre-wrap">{b.body}</p>
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted">
                  {hhmm(b.at)}
                  {b.mine && b.status && (
                    <span className={b.status === "read" ? "text-sky-400" : ""} title={b.status === "read" ? "Letto" : "Inviato"}>
                      {b.status === "read" ? "✓✓" : "✓"}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </Fragment>
        );
      })}
      <div ref={bottom} />
    </div>
  );
}

function Composer({ onSend, placeholder }: { onSend: (body: string) => Promise<string | null>; placeholder: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const err = await onSend(body);
    setSending(false);
    setError(err);
    if (!err) setText("");
  }
  return (
    <form onSubmit={submit} className="border-t border-border p-3">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={placeholder}
          className="input flex-1 resize-none"
          autoFocus
        />
        <button className="btn self-end" disabled={sending || !text.trim()}>
          Invia
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </form>
  );
}

function NameForm({ label, button, onSubmit }: { label: string; button: string; onSubmit: (name: string) => Promise<string | null> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const err = await onSubmit(value);
        setError(err);
        if (!err) setValue("");
      }}
      className="p-3"
    >
      <label className="mb-1 block text-xs tracking-wider text-muted uppercase">{label}</label>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Nome del personaggio" className="input py-1.5 text-sm" />
        <button className="btn px-3 py-1.5 text-sm">{button}</button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </form>
  );
}

function NewGroup({ onCreate, onCancel }: { onCreate: (name: string, members: string[]) => Promise<string | null>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await onCreate(
          name,
          members.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        );
        setBusy(false);
        setError(err);
      }}
      className="space-y-3 overflow-y-auto p-5"
    >
      <h3 className="font-serif text-xl text-accent">Nuovo gruppo</h3>
      <Labeled label="Nome del gruppo">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Es. Giocata al Nido dell'Aquila" className="input py-1.5" />
      </Labeled>
      <Labeled label="Membri">
        <textarea
          value={members}
          onChange={(e) => setMembers(e.target.value)}
          rows={3}
          placeholder="Nomi dei personaggi, separati da una virgola"
          className="input resize-none py-1.5"
        />
      </Labeled>
      <p className="text-xs text-muted">Tu sei sempre nel gruppo. Potrai aggiungere e togliere persone anche dopo.</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !name.trim() || !members.trim()} className="btn px-4 py-1.5 text-sm">
          Crea il gruppo
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1.5 text-sm">
          Annulla
        </button>
      </div>
    </form>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs tracking-wider text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

function Members({
  group,
  meId,
  isOwner,
  onAdd,
  onRemove,
  onClose,
}: {
  group: Group;
  meId: string;
  isOwner: boolean;
  onAdd: (name: string) => Promise<string | null>;
  onRemove: (characterId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {isOwner && <NameForm label="Aggiungi al gruppo" button="Aggiungi" onSubmit={onAdd} />}
      <ul className="divide-y divide-border/60 border-y border-border/60">
        {group.members.map((m) => (
          <li key={m.character_id} className="flex items-center gap-3 px-4 py-2">
            <Avatar name={m.character?.name ?? "?"} url={m.character?.avatar_url} />
            <span className="flex-1 font-serif">
              {m.character_id === meId ? "Tu" : m.character?.name}
              {m.character_id === group.created_by && <span className="ml-2 text-xs text-[#e2c99a]">ha creato il gruppo</span>}
            </span>
            {isOwner && m.character_id !== meId && (
              <button type="button" onClick={() => onRemove(m.character_id)} className="text-xs text-red-400 hover:text-red-300">
                Togli
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 p-4">
        <button type="button" onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm">
          Torna ai messaggi
        </button>
        <button type="button" onClick={() => onRemove(meId)} className="btn-ghost border-red-900 px-3 py-1.5 text-sm text-red-400 hover:border-red-500">
          Esci dal gruppo
        </button>
      </div>
    </div>
  );
}
