import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AccessEvent = "iscrizione" | "login" | "accesso";

// Cookie che ricorda "utente|ip" dell'ultimo accesso registrato,
// cosi' il proxy registra un nuovo accesso solo quando l'IP cambia.
export const ACCESS_COOKIE = "gdr_access";

// Una verifica VPN resta valida per 7 giorni
const CHECK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type IpInfo = {
  country: string | null;
  is_vpn: boolean;
  vpn_type: string | null;
  provider: string | null;
  risk: number | null;
};

// IP reale del client. Su Vercel x-real-ip / x-forwarded-for sono impostati
// dalla piattaforma e non possono essere falsificati dal browser.
export function getClientIp(headers: Headers): string | null {
  const ip =
    headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return ip || null;
}

function isPrivateIp(ip: string) {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("::ffff:127.")
  );
}

// Interroga proxycheck.io (piano gratuito: ~100 richieste/giorno senza chiave,
// 1000/giorno con chiave gratuita in PROXYCHECK_API_KEY)
async function lookupIp(ip: string): Promise<(IpInfo & { raw: unknown }) | null> {
  const key = process.env.PROXYCHECK_API_KEY?.trim();
  const url = `https://proxycheck.io/v3/${encodeURIComponent(ip)}${key ? `?key=${key}` : ""}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.[ip];
    if (json?.status !== "ok" || !data) return null;

    const d = data.detections ?? {};
    const vpnType = d.tor ? "TOR" : d.vpn ? "VPN" : d.proxy ? "Proxy" : d.hosting ? "Hosting" : null;
    return {
      country: data.location?.country_code ?? null,
      // Hosting = IP di un datacenter: spesso VPN/server, raramente una persona a casa
      is_vpn: Boolean(d.vpn || d.proxy || d.tor || d.hosting),
      vpn_type: vpnType,
      provider: data.network?.provider ?? null,
      risk: typeof d.risk === "number" ? d.risk : null,
      raw: data,
    };
  } catch {
    return null;
  }
}

async function checkIp(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  ip: string,
): Promise<IpInfo | null> {
  if (isPrivateIp(ip)) return null;

  const { data: cached } = await admin
    .from("ip_checks")
    .select("country, is_vpn, vpn_type, provider, risk, checked_at")
    .eq("ip", ip)
    .maybeSingle();
  if (cached && Date.now() - new Date(cached.checked_at).getTime() < CHECK_TTL_MS) {
    return cached;
  }

  const info = await lookupIp(ip);
  if (!info) return null;
  await admin.from("ip_checks").upsert({ ip, ...info, checked_at: new Date().toISOString() });
  return info;
}

// Registra un accesso. Non lancia mai errori: un problema nel registro
// non deve impedire all'utente di giocare.
export async function logAccess(params: {
  userId: string;
  event: AccessEvent;
  ip: string | null;
  userAgent: string | null;
}) {
  const { userId, event, ip, userAgent } = params;
  if (!ip) return;

  const admin = createAdminClient();
  if (!admin) {
    console.warn("SUPABASE_SECRET_KEY mancante: registro accessi disattivato");
    return;
  }

  try {
    const info = await checkIp(admin, ip);
    const { error } = await admin.from("access_logs").insert({
      user_id: userId,
      event,
      ip,
      user_agent: userAgent?.slice(0, 500) ?? null,
      country: info?.country ?? null,
      is_vpn: info ? info.is_vpn : null,
      vpn_type: info?.vpn_type ?? null,
      provider: info?.provider ?? null,
      risk: info?.risk ?? null,
    });
    if (error) console.error("Registro accessi:", error.message);
  } catch (e) {
    console.error("Registro accessi:", e);
  }
}
