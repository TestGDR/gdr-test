// Introiti e mantenimento dei tipi di feudo: stesso calcolo del database
// (public.fief_production, migrazione 0155), per mostrarli prima del 1 del mese.
// - i valori scritti nel tipo sono quelli del feudo piccolo; medio e grande
//   li moltiplicano (Gestione -> Economia -> Tipi di feudo)
// - il secondo tipo del feudo conta in parte (di base a meta')

export type Amount = { resource_id: string; amount: number };
export type EconomySettings = {
  medium_factor: number;
  large_factor: number;
  secondary_factor: number;
};
export const DEFAULT_ECONOMY: EconomySettings = {
  medium_factor: 1.5,
  large_factor: 2,
  secondary_factor: 0.5,
};

type Size = "piccolo" | "medio" | "grande";
type FiefLike = {
  size: Size;
  fief_type_id: string | null;
  fief_type2_id?: string | null;
};
type TypeLike = { id: string; incomes: Amount[]; upkeep?: Amount[] };

export const sizeFactor = (size: Size, s: EconomySettings) =>
  size === "grande"
    ? Number(s.large_factor)
    : size === "medio"
      ? Number(s.medium_factor)
      : 1;

// come round() di Postgres sui numeri positivi
const round = (n: number) => Math.round(n);

// Righe del mese dei tipi del feudo (una per risorsa e per tipo, come nel database)
export function fiefTypeRows(
  f: FiefLike,
  types: TypeLike[],
  s: EconomySettings = DEFAULT_ECONOMY,
) {
  const sf = sizeFactor(f.size, s);
  const main = types.find((t) => t.id === f.fief_type_id);
  const second =
    f.fief_type2_id && f.fief_type2_id !== f.fief_type_id
      ? types.find((t) => t.id === f.fief_type2_id)
      : undefined;
  const scale = (list: Amount[] | undefined, k: number) =>
    (list ?? [])
      .map((a) => ({ resource_id: a.resource_id, amount: round(a.amount * k) }))
      .filter((a) => a.amount > 0);
  const sec = sf * Number(s.secondary_factor);
  return {
    incomes: [...scale(main?.incomes, sf), ...scale(second?.incomes, sec)],
    upkeep: [...scale(main?.upkeep, sf), ...scale(second?.upkeep, sec)],
  };
}

// Le stesse righe sommate per risorsa
export function sumAmounts(list: Amount[]) {
  const m = new Map<string, number>();
  for (const a of list) m.set(a.resource_id, (m.get(a.resource_id) ?? 0) + a.amount);
  return [...m].map(([resource_id, amount]) => ({ resource_id, amount }));
}
