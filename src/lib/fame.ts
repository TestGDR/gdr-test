// Fama del personaggio: una sola scala da -100 a +100. Tutti partono da 0
// ("Sconosciuto"); salendo si diventa famosi nel bene, scendendo famigerati.
// La cambia solo lo staff, a mano, e non ha effetti sui tiri.

export const FAME_MIN = -100;
export const FAME_MAX = 100;

// dalla piu' alta alla piu' bassa: vale la prima fascia raggiunta
const TIERS: { from: number; title: string }[] = [
  { from: 76, title: "Leggendario" },
  { from: 51, title: "Celebre" },
  { from: 26, title: "Rispettato" },
  { from: 11, title: "Noto" },
  { from: -10, title: "Sconosciuto" },
  { from: -25, title: "Chiacchierato" },
  { from: -50, title: "Malvisto" },
  { from: -75, title: "Infame" },
  { from: -100, title: "Maledetto" },
];

export const fameTitle = (fame: number | null | undefined) =>
  (TIERS.find((t) => (fame ?? 0) >= t.from) ?? TIERS[TIERS.length - 1]).title;

// Colore del titolo: dorato nel bene, rosso nel male, grigio da sconosciuti
export const fameTone = (fame: number | null | undefined) =>
  (fame ?? 0) > 10 ? "text-accent" : (fame ?? 0) < -10 ? "text-red-400" : "text-muted";

export const signedFame = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// Le fasce, per spiegarle a chi assegna la fama
export const FAME_SCALE = [...TIERS].reverse().map((t, i, all) => ({
  title: t.title,
  from: t.from,
  to: all[i + 1] ? all[i + 1].from - 1 : FAME_MAX,
}));
