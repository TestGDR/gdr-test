// =====================================================================
// Qualita' degli oggetti per tipo e danno contro le armature
// (Gestione -> Oggetti -> Qualita' e Danni e armature, migrazione 0154).
// Modulo puro: lo usano il combattimento (server), la scheda, il mercato
// e il pannello di gestione.
// =====================================================================

export type DamageType = "taglio" | "perforante" | "contundente";
export type BonusField =
  "hit" | "damage" | "pierce" | "aff" | "sp" | "parry" | "encumbrance";

export const BONUS_LABEL: Record<BonusField, string> = {
  hit: "colpire",
  damage: "danno",
  pierce: "perforazione",
  aff: "AFF",
  sp: "SP",
  parry: "parata",
  encumbrance: "ingombro in meno",
};

// Ogni tipo di oggetto ha solo i bonus che hanno senso per lui
export const ITEM_CLASSES = [
  {
    id: "taglio",
    label: "Armi da taglio",
    fields: ["hit", "damage", "aff"],
  },
  {
    id: "perforante",
    label: "Armi perforanti (e affondi)",
    fields: ["hit", "damage", "pierce", "aff"],
  },
  {
    id: "contundente",
    label: "Armi contundenti",
    fields: ["hit", "damage", "aff"],
  },
  { id: "scudo", label: "Scudi", fields: ["parry", "aff"] },
  {
    id: "imbottito",
    label: "Armature imbottite",
    fields: ["sp", "encumbrance"],
  },
  {
    id: "cuoio-bollito",
    label: "Armature di cuoio bollito",
    fields: ["sp", "encumbrance"],
  },
  {
    id: "brigantina",
    label: "Armature a brigantina",
    fields: ["sp", "encumbrance"],
  },
  {
    id: "maglia",
    label: "Armature di maglia",
    fields: ["sp", "encumbrance"],
  },
  {
    id: "piastre",
    label: "Armature a piastre",
    fields: ["sp", "encumbrance"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  fields: readonly BonusField[];
}[];
export type ItemClass = (typeof ITEM_CLASSES)[number]["id"];

// Come colpisce un'arma con quel tipo di danno (scelta nell'attacco)
export const DAMAGE_STYLE: Record<DamageType, string> = {
  taglio: "di taglio",
  perforante: "in affondo",
  contundente: "d'impatto",
};

export type Bonus = Record<BonusField, number>;
export const NO_QUALITY_BONUS: Bonus = {
  hit: 0,
  damage: 0,
  pierce: 0,
  aff: 0,
  sp: 0,
  parry: 0,
  encumbrance: 0,
};

export type QualityBonusRow = Bonus & {
  quality_id: string;
  item_class: string;
};
export type MaterialModRow = {
  damage_type: string;
  material: string;
  factor: number;
};

type ItemLike = {
  kind?: string | null;
  damage_type?: string | null;
  material?: string | null;
};

// Classe dell'oggetto per i bonus; per le armi conta il tipo di danno usato
export function itemClass(item: ItemLike, damageType?: string | null) {
  const id =
    item.kind === "arma"
      ? (damageType ?? item.damage_type)
      : item.kind === "scudo"
        ? "scudo"
        : item.kind === "armatura"
          ? item.material
          : null;
  return ITEM_CLASSES.find((c) => c.id === id) ?? null;
}

// Bonus della qualita' per quell'oggetto: solo quelli del suo tipo
export function qualityBonus(
  item: ItemLike,
  qualityId: string | null | undefined,
  rows: readonly QualityBonusRow[],
  damageType?: string | null,
): Bonus {
  const cls = itemClass(item, damageType);
  if (!cls || !qualityId) return NO_QUALITY_BONUS;
  const row = rows.find(
    (r) => r.quality_id === qualityId && r.item_class === cls.id,
  );
  if (!row) return NO_QUALITY_BONUS;
  const out = { ...NO_QUALITY_BONUS };
  for (const f of cls.fields as readonly BonusField[])
    out[f] = Number(row[f]) || 0;
  return out;
}

// Per durability(): AFF e SP in piu' (l'AFF di un'arma segue il suo tipo di danno principale)
export const durabilityBonus = (b: Bonus) => ({
  aff_bonus: b.aff,
  sp_bonus: b.sp,
});

// "+1 colpire, +2 AFF": i bonus non nulli di un livello, da mostrare
export function bonusText(b: Bonus) {
  return (Object.keys(BONUS_LABEL) as BonusField[])
    .filter((k) => b[k])
    .map((k) => `+${b[k]} ${BONUS_LABEL[k]}`)
    .join(", ");
}

// Moltiplicatore del danno di quel tipo contro quel materiale (1 se manca)
export function materialFactor(
  damageType: string | null | undefined,
  material: string | null | undefined,
  rows: readonly MaterialModRow[],
) {
  if (!damageType || !material) return 1;
  const r = rows.find(
    (x) => x.damage_type === damageType && x.material === material,
  );
  return r ? Number(r.factor) : 1;
}

// Tipi di danno di un'arma: il principale e, se c'e', il secondo
export function damageTypesOf(item: {
  damage_type?: string | null;
  damage_type_alt?: string | null;
}) {
  return [item.damage_type, item.damage_type_alt].filter(
    (t, i, all): t is DamageType => !!t && all.indexOf(t) === i,
  );
}
