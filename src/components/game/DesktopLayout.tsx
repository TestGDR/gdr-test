"use client";

// =====================================================================
// Grafica del gioco su computer: barra in alto a schede, colonna sinistra
// (personaggio e menu) e colonna destra (localita' e presenti).
// Il cellulare usa ancora la disposizione di GameShell.
// =====================================================================

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { deriveStats, type Stats } from "@/lib/rules/engine";
import { RULES } from "@/lib/rules/config";
import { currentHp } from "@/lib/rules/hp";

// Voce del menu a elenco (colonne): icona di bronzo e nome
export const listBtn =
  "group relative flex w-full items-center gap-3 px-2 py-[2px] text-left bg-[length:100%_100%] bg-no-repeat pl-3 text-[#d4b394] transition hover:bg-[url('/images/ui/interno/voce-attiva.png')] hover:text-[#f3e2cc] focus-visible:bg-[url('/images/ui/interno/voce-attiva.png')] focus-visible:outline-none [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:drop-shadow-[0_1px_1px_#000]";
export function ListCaption({ children }: { children: ReactNode }) {
  return <span className="truncate [font-family:var(--font-lora)] text-[0.8125rem] text-[#b8bec0] [text-shadow:0_1px_2px_#000] group-hover:text-[#e4e8e9]">{children}</span>;
}

// Pannello con la cornice di bronzo e, se c'e', il titolo in testa
export function Pannello({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pannello-bronzo ${className}`}>
      {title && <h2 className="titolo-bronzo mb-1">{title}</h2>}
      {children}
    </section>
  );
}

// Scheda della barra in alto: icona sopra, nome sotto; quella attiva ha lo stendardo rosso
export const tabBtn =
  "group relative flex h-[70px] w-[92px] shrink-0 flex-col items-center justify-center gap-1 text-[#d4b394] transition hover:text-[#f3e2cc] focus-visible:outline-none [&>svg]:h-5 [&>svg]:w-5 [&>svg]:drop-shadow-[0_2px_2px_#000]";
export function TabLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-serif text-[0.625rem] tracking-[0.06em] whitespace-nowrap text-[#b8bec0] uppercase [text-shadow:0_1px_2px_#000] group-hover:text-[#e4e8e9]">
      {children}
    </span>
  );
}
export function TabBanner() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/ui/interno/stendardo.png"
      alt=""
      aria-hidden
      width={60}
      height={80}
      className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[80px] w-[60px] max-w-none -translate-x-1/2 drop-shadow-[0_4px_8px_rgb(0_0_0/0.8)]"
    />
  );
}
export function TabDivider() {
  return <span aria-hidden className="h-11 w-px shrink-0 bg-gradient-to-b from-transparent via-[#c08a4e]/55 to-transparent" />;
}

// Mappa: scheda-collegamento della barra in alto
export function MapTab({ active, icon }: { active: boolean; icon: ReactNode }) {
  return (
    <Link href="/mappa" className={tabBtn} aria-current={active ? "page" : undefined}>
      {active && <TabBanner />}
      {icon}
      <TabLabel>Mappa</TabLabel>
    </Link>
  );
}

// Dati del personaggio per la colonna sinistra: posizione, PF e PX
export function useCharacterStatus(characterId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<{ place: string | null; hp: number; maxHp: number; px: number } | null>(null);
  useEffect(() => {
    if (!characterId) return;
    let alive = true;
    (async () => {
      const [{ data: c }, { data: loc }, { data: tr }] = await Promise.all([
        supabase
          .from("characters")
          .select("attributes, px, px_half, hp_current, hp_updated_at, dead_at, dying_since, stabilized_at")
          .eq("id", characterId)
          .maybeSingle(),
        supabase.rpc("character_location", { p_character: characterId }),
        supabase.from("character_traits").select("trait:traits(modifiers)").eq("character_id", characterId),
      ]);
      if (!c || !alive) return;
      const attrs = (c.attributes ?? {}) as Record<string, number>;
      const stats = Object.fromEntries(RULES.stats.map((s) => [s.id, Number(attrs[s.id]) || RULES.statMin])) as Stats;
      const hpBonus = ((tr ?? []) as unknown as { trait: { modifiers: { target: string; value: number }[] } | null }[]).reduce(
        (a, o) => a + (o.trait?.modifiers ?? []).filter((m) => m.target === "hp").reduce((x, m) => x + m.value, 0),
        0,
      );
      const d = deriveStats(stats, hpBonus);
      const hp = currentHp(c, d.hp, d.rec, Date.now());
      const place = loc ? (((await supabase.from("locations").select("name").eq("id", loc as string).maybeSingle()).data?.name as string | undefined) ?? null) : null;
      if (alive) setStatus({ place, hp, maxHp: d.hp, px: Number(c.px ?? 0) + (c.px_half ? 0.5 : 0) });
    })();
    return () => {
      alive = false;
    };
  }, [supabase, characterId]);
  return status;
}

// Barra dei PF
export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="relative h-3 overflow-hidden rounded-full border border-[#7a5530] bg-black/70 shadow-[inset_0_1px_3px_#000]" role="meter" aria-label="Punti ferita" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp}>
      <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-b from-[#e7c08b] via-[#c48b4d] to-[#8a5a2b]" style={{ width: `${pct}%` }} />
    </div>
  );
}
