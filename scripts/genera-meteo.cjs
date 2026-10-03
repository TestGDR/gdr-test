// Genera le regioni climatiche di Westeros e i "semi" (modelli di giornata)
// per ogni regione e stagione, e li scrive in SQL.
// Uso, dalla cartella del progetto:  node scripts/genera-meteo.cjs > semi.sql
//
// Ogni seme ha 4 fasce (notte, mattina, pomeriggio, sera) con condizione e
// temperatura. Le temperature partono dalla minima notturna e dalla massima
// pomeridiana della regione in quella stagione, ritoccate dal tipo di giornata
// (una notte serena e' piu' fredda, una giornata coperta ha escursione minore...).

const SEASONS = ["inverno", "primavera", "estate", "autunno"];

// Tipi di giornata: condizione delle 4 fasce e ritocchi su minima e massima
const TEMPLATES = {
  sereno: { name: "Giornata serena", conds: ["sereno", "sereno", "sereno", "sereno"], dMin: -2, dMax: 1 },
  velato: { name: "Cielo velato", conds: ["poco_nuvoloso", "poco_nuvoloso", "nuvoloso", "poco_nuvoloso"], dMin: 0, dMax: 0 },
  nebbia: { name: "Nebbia mattutina", conds: ["nebbia", "nebbia", "poco_nuvoloso", "poco_nuvoloso"], dMin: 0, dMax: -1 },
  coperto: { name: "Cielo coperto", conds: ["nuvoloso", "nuvoloso", "nuvoloso", "nuvoloso"], dMin: 1, dMax: -2 },
  pioggia_pom: { name: "Pioggia pomeridiana", conds: ["poco_nuvoloso", "nuvoloso", "pioggia", "pioggerella"], dMin: 0, dMax: -2 },
  piovosa: { name: "Giornata piovosa", conds: ["pioggia", "pioggia", "pioggerella", "pioggia"], dMin: 1, dMax: -4 },
  temporale: { name: "Temporale estivo", conds: ["poco_nuvoloso", "sereno", "temporale", "nuvoloso"], dMin: 1, dMax: 1 },
  ventosa: { name: "Giornata ventosa", conds: ["vento", "vento", "vento", "poco_nuvoloso"], dMin: -1, dMax: -2 },
  burrasca: { name: "Burrasca", conds: ["vento", "pioggia", "burrasca", "pioggia"], dMin: 0, dMax: -3 },
  neve_leggera: { name: "Neve leggera", conds: ["nuvoloso", "nevischio", "neve", "nuvoloso"], dMin: 0, dMax: -1 },
  nevicata: { name: "Nevicata", conds: ["neve", "neve", "neve", "nevischio"], dMin: 1, dMax: -2 },
  bufera: { name: "Bufera di neve", conds: ["neve", "bufera", "bufera", "neve"], dMin: -2, dMax: -4 },
  gelo: { name: "Gelo sereno", conds: ["sereno", "sereno", "sereno", "sereno"], dMin: -5, dMax: -2 },
  afa: { name: "Calura", conds: ["sereno", "sereno", "afa", "sereno"], dMin: 2, dMax: 3 },
  sabbia: { name: "Tempesta di sabbia", conds: ["vento", "tempesta_sabbia", "tempesta_sabbia", "vento"], dMin: 0, dMax: 0 },
};

// Frequenza dei tipi di giornata per modello climatico e stagione
const CLIMATES = {
  temperato: {
    label: "Temperato",
    inverno: { sereno: 15, velato: 15, nebbia: 15, coperto: 20, piovosa: 15, pioggia_pom: 10, ventosa: 5, neve_leggera: 5 },
    primavera: { sereno: 25, velato: 25, pioggia_pom: 20, piovosa: 10, nebbia: 10, ventosa: 10 },
    estate: { sereno: 40, velato: 15, temporale: 15, afa: 20, pioggia_pom: 10 },
    autunno: { sereno: 15, velato: 20, nebbia: 15, coperto: 15, piovosa: 15, pioggia_pom: 10, ventosa: 10 },
  },
  mediterraneo: {
    label: "Mediterraneo",
    inverno: { sereno: 25, velato: 20, nebbia: 15, coperto: 15, piovosa: 15, pioggia_pom: 10 },
    primavera: { sereno: 40, velato: 25, pioggia_pom: 20, ventosa: 15 },
    estate: { sereno: 45, afa: 35, temporale: 15, velato: 5 },
    autunno: { sereno: 25, velato: 25, nebbia: 15, piovosa: 15, pioggia_pom: 20 },
  },
  desertico: {
    label: "Desertico",
    inverno: { sereno: 50, velato: 20, ventosa: 15, sabbia: 10, pioggia_pom: 5 },
    primavera: { sereno: 55, afa: 15, ventosa: 15, sabbia: 15 },
    estate: { afa: 55, sereno: 30, sabbia: 15 },
    autunno: { sereno: 50, afa: 15, ventosa: 15, sabbia: 15, velato: 5 },
  },
  continentale: {
    label: "Continentale",
    inverno: { coperto: 20, nebbia: 20, neve_leggera: 15, nevicata: 10, gelo: 15, velato: 10, piovosa: 10 },
    primavera: { sereno: 20, velato: 20, pioggia_pom: 25, piovosa: 20, nebbia: 15 },
    estate: { sereno: 35, velato: 15, temporale: 25, afa: 15, pioggia_pom: 10 },
    autunno: { nebbia: 25, coperto: 20, piovosa: 20, velato: 15, sereno: 10, ventosa: 10 },
  },
  montano: {
    label: "Montano",
    inverno: { nevicata: 25, neve_leggera: 20, gelo: 20, bufera: 10, coperto: 15, sereno: 10 },
    primavera: { velato: 25, pioggia_pom: 25, sereno: 20, neve_leggera: 10, nebbia: 10, ventosa: 10 },
    estate: { sereno: 35, temporale: 25, velato: 20, pioggia_pom: 15, ventosa: 5 },
    autunno: { nebbia: 20, coperto: 20, velato: 15, piovosa: 15, neve_leggera: 15, ventosa: 15 },
  },
  oceanico: {
    label: "Oceanico tempestoso",
    inverno: { burrasca: 25, piovosa: 25, coperto: 20, ventosa: 20, nebbia: 10 },
    primavera: { piovosa: 25, ventosa: 20, velato: 20, burrasca: 15, pioggia_pom: 10, sereno: 10 },
    estate: { velato: 25, sereno: 20, temporale: 15, pioggia_pom: 20, burrasca: 10, ventosa: 10 },
    autunno: { burrasca: 30, piovosa: 25, ventosa: 20, coperto: 15, nebbia: 10 },
  },
  subartico: {
    label: "Subartico",
    inverno: { nevicata: 25, bufera: 15, gelo: 25, neve_leggera: 20, coperto: 15 },
    primavera: { neve_leggera: 20, coperto: 20, piovosa: 15, velato: 20, sereno: 15, nebbia: 10 },
    estate: { sereno: 25, velato: 25, pioggia_pom: 20, piovosa: 15, nebbia: 15 },
    autunno: { coperto: 25, neve_leggera: 20, piovosa: 20, nebbia: 15, gelo: 10, ventosa: 10 },
  },
  polare: {
    label: "Polare",
    inverno: { bufera: 35, nevicata: 30, gelo: 25, coperto: 10 },
    primavera: { nevicata: 25, gelo: 25, neve_leggera: 25, bufera: 15, sereno: 10 },
    estate: { neve_leggera: 25, coperto: 25, gelo: 15, sereno: 20, nebbia: 15 },
    autunno: { nevicata: 30, bufera: 25, gelo: 25, coperto: 20 },
  },
};

// Regioni: modello climatico e [minima notturna, massima pomeridiana] per stagione (gradi)
const REGIONS = [
  {
    slug: "terre_corona", name: "Terre della Corona", climate: "temperato", sort: 0,
    description: "Le terre attorno ad Approdo del Re e alla Baia delle Acque Nere: colline, boschi e coste riparate.",
    model: "Clima temperato marittimo: inverni miti e umidi, nebbie sulla baia, estati calde con qualche temporale.",
    temps: { inverno: [2, 10], primavera: [8, 18], estate: [17, 29], autunno: [9, 18] },
  },
  {
    slug: "terre_fiumi", name: "Terre dei Fiumi", climate: "continentale", sort: 1,
    description: "Pianure fertili solcate dal Tridente, paludi e boschi lungo i fiumi.",
    model: "Clima continentale umido: inverni freddi con nebbie e neve, estati calde e temporalesche, molta pioggia in autunno.",
    temps: { inverno: [-2, 6], primavera: [6, 16], estate: [14, 27], autunno: [6, 15] },
  },
  {
    slug: "occidente", name: "Occidente", climate: "temperato", sort: 2,
    description: "Colline e miniere d'oro dei Lannister, affacciate sul Mare del Tramonto.",
    model: "Clima temperato atlantico: piogge portate dal mare, inverni miti, estati calde e ventilate.",
    temps: { inverno: [1, 9], primavera: [7, 17], estate: [15, 27], autunno: [8, 16] },
  },
  {
    slug: "altopiano", name: "Altopiano", climate: "mediterraneo", sort: 3,
    description: "Le terre più fertili dei Sette Regni: vigneti, frutteti e campi dorati.",
    model: "Clima mediterraneo: inverni dolci e piovosi, primavere luminose, estati lunghe, calde e asciutte.",
    temps: { inverno: [4, 13], primavera: [10, 21], estate: [18, 32], autunno: [11, 21] },
  },
  {
    slug: "terre_tempesta", name: "Terre della Tempesta", climate: "oceanico", sort: 4,
    description: "Coste frastagliate, foreste piovose e la Baia dei Naufragi, flagellate dalle tempeste del Mare Stretto.",
    model: "Clima oceanico tempestoso: burrasche frequenti, piogge abbondanti tutto l'anno, inverni miti ma ventosi.",
    temps: { inverno: [3, 10], primavera: [9, 17], estate: [17, 27], autunno: [10, 17] },
  },
  {
    slug: "valle_arryn", name: "Valle di Arryn", climate: "montano", sort: 5,
    description: "Le Montagne della Luna e la valle protetta dal Nido dell'Aquila.",
    model: "Clima montano: inverni nevosi e gelidi sulle vette, estati fresche con temporali improvvisi, venti in quota.",
    temps: { inverno: [-6, 3], primavera: [3, 13], estate: [11, 23], autunno: [3, 12] },
  },
  {
    slug: "nord", name: "Nord", climate: "subartico", sort: 6,
    description: "Il regno più vasto: foreste di pini, brughiere e lande gelide fino alla Barriera.",
    model: "Clima subartico: inverni lunghissimi di neve e gelo, estati brevi e fresche, nebbie e piogge fredde.",
    temps: { inverno: [-14, -4], primavera: [-2, 9], estate: [6, 18], autunno: [-3, 7] },
  },
  {
    slug: "dorne", name: "Dorne", climate: "desertico", sort: 7,
    description: "Deserti di sabbia rossa, montagne aspre e oasi lungo il fiume Sangueverde.",
    model: "Clima desertico caldo: sole quasi costante, calura estrema d'estate, notti fresche e tempeste di sabbia.",
    temps: { inverno: [8, 18], primavera: [15, 28], estate: [24, 40], autunno: [16, 29] },
  },
  {
    slug: "isole_ferro", name: "Isole di Ferro", climate: "oceanico", sort: 8,
    description: "Isole rocciose e brulle battute dal mare, patria degli uomini di ferro.",
    model: "Clima oceanico freddo: cielo grigio, vento costante, piogge e burrasche marine per gran parte dell'anno.",
    temps: { inverno: [0, 6], primavera: [4, 11], estate: [10, 17], autunno: [5, 11] },
  },
  {
    slug: "oltre_barriera", name: "Oltre la Barriera", climate: "polare", sort: 9,
    description: "La Foresta Stregata e i ghiacci del Nord Remoto, dove vivono i bruti.",
    model: "Clima polare: gelo quasi perenne, bufere di neve, estati brevissime appena sopra lo zero.",
    temps: { inverno: [-25, -12], primavera: [-10, 0], estate: [-2, 10], autunno: [-12, -2] },
  },
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lines = [];

lines.push("-- Regioni climatiche (attiva solo quella della mappa in uso)");
lines.push("insert into public.weather_regions (slug, name, description, climate, active, sort_order) values");
lines.push(
  REGIONS.map(
    (r) => `  (${q(r.slug)}, ${q(r.name)}, ${q(r.description)}, ${q(`${CLIMATES[r.climate].label}. ${r.model}`)}, ${r.slug === "terre_corona"}, ${r.sort})`,
  ).join(",\n") + ";",
);
lines.push("");
lines.push("-- Semi: un modello di giornata per ogni tipo, con il suo peso, per regione e stagione");
const rows = [];
for (const r of REGIONS) {
  for (const season of SEASONS) {
    const [tmin, tmax] = r.temps[season];
    let order = 0;
    for (const [tpl, weight] of Object.entries(CLIMATES[r.climate][season])) {
      const t = TEMPLATES[tpl];
      const lo = tmin + t.dMin;
      const hi = Math.max(lo + 1, tmax + t.dMax);
      // notte = minima, mattina e sera intermedie, pomeriggio = massima
      const temps = [lo, Math.round(lo + (hi - lo) * 0.45), hi, Math.round(lo + (hi - lo) * 0.6)];
      const periods = t.conds.map((cond, i) => ({ cond, temp: temps[i] }));
      rows.push(
        `  ((select id from public.weather_regions where slug = ${q(r.slug)}), ${q(season)}, ${q(t.name)}, ${weight}, ${q(JSON.stringify(periods))}::jsonb, ${order++})`,
      );
    }
  }
}
lines.push("insert into public.weather_seeds (region_id, season, name, weight, periods, sort_order) values");
lines.push(rows.join(",\n") + ";");
process.stdout.write(lines.join("\n") + "\n");
