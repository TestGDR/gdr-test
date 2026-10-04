import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaxSettings } from "./taxes";

export type HouseTaxes = { settings: TaxSettings; rulerName: string | null; isRuler: boolean; received: Record<string, number> };

// Tasse di una casata: impostazioni, casata regnante e (se e' lei) quanto riceve ogni mese
export async function loadHouseTaxes(supabase: SupabaseClient, houseId: string): Promise<HouseTaxes | null> {
  const { data: settings } = await supabase
    .from("tax_settings")
    .select("ruling_house_id, small_pct, medium_pct, large_pct, per_structure_pct, max_pct")
    .maybeSingle();
  if (!settings) return null;
  const s = settings as TaxSettings;
  const isRuler = s.ruling_house_id === houseId;
  const [{ data: ruler }, { data: rows }] = await Promise.all([
    s.ruling_house_id ? supabase.from("houses").select("name").eq("id", s.ruling_house_id).maybeSingle() : Promise.resolve({ data: null }),
    isRuler ? supabase.rpc("monthly_taxes") : Promise.resolve({ data: [] }),
  ]);
  const received: Record<string, number> = {};
  for (const r of (rows ?? []) as { resource_id: string; amount: number }[]) received[r.resource_id] = (received[r.resource_id] ?? 0) + Number(r.amount);
  return { settings: s, rulerName: (ruler?.name as string | undefined) ?? null, isRuler, received };
}
