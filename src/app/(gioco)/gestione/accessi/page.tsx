import { GameArea } from "@/components/game/GameShell";
import Link from "next/link";
import { requirePermission } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { judge, LEVEL_ORDER, type Level, type Verdict } from "@/lib/inactivity";

type AccessRow = {
  id: number;
  user_id: string | null;
  event: string;
  ip: string;
  user_agent: string | null;
  country: string | null;
  is_vpn: boolean | null;
  vpn_type: string | null;
  provider: string | null;
  risk: number | null;
  created_at: string;
  profile: { username: string | null } | null;
};

type ActivityRow = {
  character_id: string;
  name: string;
  status: string;
  activated_at: string | null;
  last_entry: string | null;
  last_chat_action: string | null;
  verdict: Verdict;
};

// Colori e nomi dei livelli del regolamento
const LEVELS: Record<Level, { label: string; cls: string }> = {
  cancellare: { label: "Da cancellare", cls: "border-red-500/60 bg-red-900/40 text-red-200" },
  desimbolo: { label: "Da desimbolare", cls: "border-orange-500/60 bg-orange-900/40 text-orange-200" },
  attenzione: { label: "In scadenza", cls: "border-amber-400/60 bg-amber-900/30 text-amber-200" },
  nuovo: { label: "Nuovi", cls: "border-sky-500/50 bg-sky-900/30 text-sky-200" },
  assente: { label: "In assenza", cls: "border-violet-400/50 bg-violet-900/30 text-violet-200" },
  ok: { label: "In regola", cls: "border-emerald-500/50 bg-emerald-900/30 text-emerald-200" },
};

const LIMIT = 500;

const TABS = [
  ["accessi", "Accessi"],
  ["attivita", "Attività dei personaggi"],
] as const;

const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export default async function AccessiPage({ searchParams }: PageProps<"/gestione/accessi">) {
  const { supabase } = await requirePermission("gestione.accessi");
  const view = (await searchParams).vista === "attivita" ? "attivita" : "accessi";

  const header = (
    <>
      <GameArea title="Registro accessi" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="font-serif text-3xl text-accent">Registro accessi</h1>
      <nav className="flex gap-1 border-b border-border">
        {TABS.map(([id, label]) => (
          <Link
            key={id}
            href={id === "accessi" ? "/gestione/accessi" : "/gestione/accessi?vista=attivita"}
            aria-current={view === id ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-xs tracking-[0.12em] uppercase transition ${
              view === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );

  if (view === "attivita") {
    // dati per il regolamento: iscrizione, PNG (esclusi) e assenze
    const db = createAdminClient() ?? supabase;
    const [{ data, error }, { data: chars }, { data: absences }] = await Promise.all([
      supabase.rpc("staff_character_activity"),
      db.from("characters").select("id, is_npc, created_at"),
      db.from("absences").select("character_id, from_date, to_date"),
    ]);
    const info = new Map((chars ?? []).map((c) => [c.id as string, c as { is_npc: boolean; created_at: string }]));
    const now = new Date();
    const rows = ((data ?? []) as Omit<ActivityRow, "verdict">[])
      .filter((r) => !info.get(r.character_id)?.is_npc)
      .map((r) => ({
        ...r,
        verdict: judge(
          {
            ...r,
            created_at: info.get(r.character_id)?.created_at ?? null,
            absences: (absences ?? []).filter((a) => a.character_id === r.character_id),
          },
          now,
        ),
      }))
      .sort(
        (a, b) =>
          LEVEL_ORDER.indexOf(a.verdict.level) - LEVEL_ORDER.indexOf(b.verdict.level) ||
          (a.verdict.deadline?.getTime() ?? 0) - (b.verdict.deadline?.getTime() ?? 0),
      );
    return (
      <div className="space-y-6">
        {header}
        <CharacterActivity rows={rows} failed={!!error} />
      </div>
    );
  }

  const { data } = await supabase
    .from("access_logs")
    .select("*, profile:profiles(username)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  const rows = (data ?? []) as AccessRow[];

  // IP usati da piu' account diversi: possibili multi-account
  const accountsByIp = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const name = r.profile?.username ?? r.user_id.slice(0, 8);
    if (!accountsByIp.has(r.ip)) accountsByIp.set(r.ip, new Set());
    accountsByIp.get(r.ip)!.add(name);
  }
  const sharedIps = [...accountsByIp].filter(([, names]) => names.size > 1);

  return (
    <div className="space-y-8">
      {header}

      <section className="panel">
        <h2 className="mb-3 font-serif text-xl">IP condivisi da più account</h2>
        {sharedIps.length === 0 ? (
          <p className="text-sm text-muted">Nessun IP condiviso negli ultimi {LIMIT} accessi.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {sharedIps.map(([ip, names]) => (
              <li key={ip}>
                <code className="text-accent">{ip}</code> → {[...names].join(", ")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel text-muted">
            <tr>
              <th className="p-2">Data</th>
              <th className="p-2">Account</th>
              <th className="p-2">Evento</th>
              <th className="p-2">IP</th>
              <th className="p-2">Paese</th>
              <th className="p-2">VPN / Proxy</th>
              <th className="p-2">Provider</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="whitespace-nowrap p-2">
                  {new Date(r.created_at).toLocaleString("it-IT")}
                </td>
                <td className="p-2">{r.profile?.username ?? "—"}</td>
                <td className="p-2">{r.event}</td>
                <td className="p-2 font-mono">{r.ip}</td>
                <td className="p-2">{r.country ?? "—"}</td>
                <td className="p-2">
                  <VpnBadge row={r} />
                </td>
                <td className="p-2 text-muted">{r.provider ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-muted">Nessun accesso registrato.</p>}
      </section>
    </div>
  );
}

function VpnBadge({ row }: { row: AccessRow }) {
  if (row.is_vpn === null) return <span className="text-muted">non verificato</span>;
  if (!row.is_vpn) return <span className="text-green-400">No</span>;
  return (
    <span className="rounded bg-red-500/20 px-2 py-0.5 font-semibold text-red-300">
      {row.vpn_type ?? "Sì"}
      {row.risk !== null && ` · rischio ${row.risk}`}
    </span>
  );
}

// Personaggi: data di creazione (approvazione), ultimo ingresso in land, ultima azione in chat
function CharacterActivity({ rows, failed }: { rows: ActivityRow[]; failed: boolean }) {
  if (failed) return <p className="text-red-400">Impossibile caricare le attività dei personaggi.</p>;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {LEVEL_ORDER.map((l) => (
          <span key={l} className={`rounded border px-3 py-1.5 text-sm ${LEVELS[l].cls}`}>
            {LEVELS[l].label}: <strong>{rows.filter((r) => r.verdict.level === l).length}</strong>
          </span>
        ))}
      </div>
      <p className="text-sm text-muted">
        <strong className="text-foreground">Situazione</strong>: secondo il regolamento sull&apos;inattività. Conta solo
        l&apos;ultima azione in chat, non i login: in approvazione o approvato senza giocare, 7 giorni; giocante, almeno una
        giocata a settimana (altrimenti desimbolo) e cancellazione dopo un mese; dopo un&apos;assenza, 7 giorni per
        rientrare. I PNG non sono contati. Ticket senza risposta e comunicazioni alla Gestione vanno controllati a mano.
      </p>
      <p className="text-sm text-muted">
        <strong className="text-foreground">Ultimo login</strong>: l&apos;ultima volta che il giocatore è entrato in land.{" "}
        <strong className="text-foreground">Ultima azione</strong>: l&apos;ultima azione scritta in una chat di gioco.{" "}
        <strong className="text-foreground">Creazione</strong>: il giorno in cui il personaggio è stato approvato e ha potuto giocare.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel text-muted">
            <tr>
              <th className="p-2">Personaggio</th>
              <th className="p-2">Situazione</th>
              <th className="p-2">Creazione</th>
              <th className="p-2">Ultimo login</th>
              <th className="p-2">Ultima azione</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.character_id} className="border-t border-border">
                <td className="p-2 font-serif">{r.name}</td>
                <td className="p-2">
                  <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs ${LEVELS[r.verdict.level].cls}`}>
                    {r.verdict.label}
                  </span>
                  {r.verdict.detail && <span className="mt-0.5 block text-xs text-muted">{r.verdict.detail}</span>}
                </td>
                <td className="whitespace-nowrap p-2">
                  {r.status === "attivo" ? (
                    (dateTime(r.activated_at) ?? "—")
                  ) : (
                    <span className="text-amber-200">non ancora approvato</span>
                  )}
                </td>
                <td className="whitespace-nowrap p-2">{dateTime(r.last_entry) ?? <span className="text-muted">mai</span>}</td>
                <td className="whitespace-nowrap p-2">{dateTime(r.last_chat_action) ?? <span className="text-muted">nessuna</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-muted">Nessun personaggio.</p>}
      </div>
    </section>
  );
}
