// Tasse delle casate feudatarie alla casata regnante: stesso calcolo del
// database (migrazione 0064), per mostrarlo prima del 1 del mese.

export type TaxSettings = {
  ruling_house_id: string | null;
  small_pct: number;
  medium_pct: number;
  large_pct: number;
  per_structure_pct: number;
  max_pct: number;
};

type Amount = { resource_id: string; amount: number };
type FiefLike = { size: "piccolo" | "medio" | "grande"; fief_type_id: string | null; structures: { structure_type_id: string }[] };

// percentuale di un feudo: grandezza + una quota per struttura, fino al massimo
export function fiefTaxPct(f: FiefLike, s: TaxSettings) {
  const base = f.size === "grande" ? s.large_pct : f.size === "medio" ? s.medium_pct : s.small_pct;
  return Math.min(Number(s.max_pct), Number(base) + Number(s.per_structure_pct) * f.structures.length);
}

// tasse al mese di un elenco di feudi: risorsa -> quantita'
// (come nel database: ogni voce prodotta viene arrotondata per difetto)
export function fiefsTaxes(
  fiefs: FiefLike[],
  s: TaxSettings,
  fiefTypes: { id: string; incomes: Amount[] }[],
  structureTypes: { id: string; incomes: Amount[] }[],
) {
  const out: Record<string, number> = {};
  for (const f of fiefs) {
    const pct = fiefTaxPct(f, s);
    const rows = [
      ...(fiefTypes.find((t) => t.id === f.fief_type_id)?.incomes ?? []),
      ...f.structures.flatMap((st) => structureTypes.find((t) => t.id === st.structure_type_id)?.incomes ?? []),
    ];
    for (const r of rows) {
      const tax = Math.floor((r.amount * pct) / 100);
      if (tax > 0) out[r.resource_id] = (out[r.resource_id] ?? 0) + tax;
    }
  }
  return out;
}
