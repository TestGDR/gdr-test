import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

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

const LIMIT = 500;

export default async function AccessiPage() {
  const { supabase, user } = await requireUser();

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") notFound();

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
      <h1 className="font-serif text-3xl text-accent">Registro accessi</h1>

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
