// Casate con lo stendardo disegnato (public/images/casate/stendardo-<nome>.png)
export const HOUSE_BANNERS = new Set(["blackfyre", "brightfyre", "celtigar", "darklyn", "staunton", "thaerion", "velaryon", "vhassar"]);

// Indirizzo dello stendardo della casata, oppure null se non c'e'
export function houseBanner(name: string | null | undefined) {
  const key = (name ?? "").toLowerCase();
  return HOUSE_BANNERS.has(key) ? `/images/casate/stendardo-${key}.png` : null;
}
