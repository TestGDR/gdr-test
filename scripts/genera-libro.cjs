// Genera le due pagine del libro di Manuale e Ambientazione: pergamena
// stropicciata agli angoli, bordi frastagliati (sfondo trasparente), bordo
// scurito che segue il frastaglio, ombra verso il dorso e ombra sotto.
// Uso, dalla cartella del progetto:  node scripts/genera-libro.cjs
const path = require("path");
const sharp = require(path.resolve("node_modules/sharp"));

// Colori della carta: centro, meta', bordi
const AMBIENTAZIONE = ["#f4e9cd", "#e7d4aa", "#d2b580"];
const MANUALE = ["#eedb9f", "#dfc17f", "#c7a25e"]; // giallo un po' piu' scuro

const PAGES = [
  { file: "public/images/pagina-sinistra.webp", W: 640, H: 1400, seed: 4, spine: "right", colors: AMBIENTAZIONE },
  { file: "public/images/pagina-destra.webp", W: 1640, H: 1300, seed: 9, spine: "left", colors: AMBIENTAZIONE },
  { file: "public/images/manuale-sinistra.webp", W: 640, H: 1400, seed: 5, spine: "right", colors: MANUALE },
  { file: "public/images/manuale-destra.webp", W: 1640, H: 1300, seed: 12, spine: "left", colors: MANUALE },
];
const M = 22; // margine trasparente intorno alla carta (per frastaglio e ombra)

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

const svg = (W, H, body, defs = "") =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${defs}</defs>${body}</svg>`);

// Forma della pagina: rettangolo con i bordi spostati dal rumore (frastagliati)
function shapeDefs(seed) {
  return `<filter id="torn" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="${seed}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
}

// Carta: colore, macchie, grana, rughe e pieghe agli angoli, bordi bruciati
async function paper(W, H, seed, spine, colors) {
  const rnd = rng(seed);
  const base = svg(
    W,
    H,
    `<rect width="${W}" height="${H}" fill="url(#b)"/><rect width="${W}" height="${H}" filter="url(#st)" opacity=".3"/><rect width="${W}" height="${H}" filter="url(#gr)"/>`,
    `<radialGradient id="b" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${colors[0]}"/><stop offset=".6" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></radialGradient>
     <filter id="st" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="${seed + 7}"/><feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.3 0 0 0 0 0.12 0 0 0 1.6 -0.78"/></filter>
     <filter id="gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85 0.4" numOctaves="3" seed="${seed + 3}"/><feColorMatrix values="0 0 0 0 0.4 0 0 0 0 0.28 0 0 0 0 0.12 0 0 0 0.3 0"/></filter>`,
  );

  const corner = (cx, cy) =>
    `<radialGradient id="c${cx}${cy}" cx="${cx}" cy="${cy}" r="0.5"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  const wrinkles = svg(
    W,
    H,
    `<rect width="${W}" height="${H}" fill="#fff"/><g mask="url(#m)"><rect width="${W}" height="${H}" filter="url(#w)"/></g>`,
    `<filter id="w" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.006 0.009" numOctaves="4" seed="${seed}"/>
       <feDiffuseLighting surfaceScale="12" lighting-color="#fff"><feDistantLight azimuth="235" elevation="45"/></feDiffuseLighting>
       <feColorMatrix values="0.5 0 0 0 0.5  0.47 0 0 0 0.47  0.4 0 0 0 0.42  0 0 0 1 0"/></filter>
     ${corner(0, 0)}${corner(1, 0)}${corner(0, 1)}${corner(1, 1)}
     <mask id="m"><rect width="${W}" height="${H}" fill="#000"/><rect width="${W}" height="${H}" fill="url(#c00)"/><rect width="${W}" height="${H}" fill="url(#c10)"/><rect width="${W}" height="${H}" fill="url(#c01)"/><rect width="${W}" height="${H}" fill="url(#c11)"/></mask>`,
  );

  // pieghe che attraversano gli angoli: ombra dal lato dell'angolo, luce dal lato della pagina
  let folds = "";
  for (const [x0, y0, sx, sy] of [
    [M, M, 1, 1],
    [W - M, M, -1, 1],
    [M, H - M, 1, -1],
    [W - M, H - M, -1, -1],
  ]) {
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const dist = 40 + rnd() * 200;
      const ax = x0 + sx * dist * (0.6 + rnd() * 0.9);
      const by = y0 + sy * dist * (0.6 + rnd() * 0.9);
      const mx = (ax + x0) / 2 + (rnd() - 0.5) * 30;
      const my = (y0 + by) / 2 + (rnd() - 0.5) * 30;
      const d = `M${ax.toFixed(1)} ${y0} L${mx.toFixed(1)} ${my.toFixed(1)} L${x0} ${by.toFixed(1)}`;
      const op = 0.18 + rnd() * 0.22;
      folds += `<path d="${d}" stroke="#4a2e0e" stroke-opacity="${op.toFixed(2)}" stroke-width="4" fill="none"/>`;
      folds += `<path d="${d}" transform="translate(${sx * 3} ${sy * 3})" stroke="#fff8e6" stroke-opacity="${(op * 0.9).toFixed(2)}" stroke-width="2.5" fill="none"/>`;
    }
  }
  const creases = svg(W, H, `<g filter="url(#bl)" stroke-linejoin="round" stroke-linecap="round">${folds}</g>`, `<filter id="bl"><feGaussianBlur stdDeviation="1.8"/></filter>`);

  // bordo scurito che segue il frastaglio + ombra verso il dorso
  const sx = spine === "left" ? 0 : 1;
  const edge = svg(
    W,
    H,
    `<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="#5a3510" stroke-width="26" filter="url(#e)" opacity=".55"/>
     <rect width="${W}" height="${H}" fill="url(#sp)"/>`,
    `${shapeDefs(seed)}<filter id="e" x="-5%" y="-5%" width="110%" height="110%">
       <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="${seed}" result="n"/>
       <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" result="d"/>
       <feGaussianBlur in="d" stdDeviation="9"/></filter>
     <linearGradient id="sp" x1="${sx}" y1="0" x2="${1 - sx}" y2="0">
       <stop offset="0" stop-color="#3a2208" stop-opacity=".55"/><stop offset="${spine === "left" ? 0.06 : 0.14}" stop-color="#3a2208" stop-opacity="0"/></linearGradient>`,
  );

  const png = (b) => sharp(b).png().toBuffer();
  const [b, w, c, e] = await Promise.all([png(base), png(wrinkles), png(creases), png(edge)]);
  return sharp(b)
    .composite([
      { input: w, blend: "multiply" },
      { input: c, blend: "over" },
      { input: e, blend: "over" },
    ])
    .png()
    .toBuffer();
}

async function page({ file, W, H, seed, spine, colors }) {
  // maschera frastagliata (bianco = carta)
  const mask = await sharp(
    svg(W, H, `<rect width="${W}" height="${H}" fill="#000"/><rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="#fff" filter="url(#torn)"/>`, shapeDefs(seed)),
  )
    .greyscale()
    .png()
    .toBuffer();

  const paperRgb = await sharp(await paper(W, H, seed, spine, colors)).removeAlpha().toBuffer();
  const maskRaw = await sharp(mask).extractChannel(0).toBuffer();
  const cut = await sharp(paperRgb).joinChannel(maskRaw).png().toBuffer();

  // ombra morbida sotto la pagina
  const shadowAlpha = await sharp(mask).extractChannel(0).blur(7).linear(0.55, 0).toBuffer();
  const shadow = await sharp({ create: { width: W, height: H, channels: 3, background: "#000" } })
    .joinChannel(shadowAlpha)
    .png()
    .toBuffer();

  const info = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: shadow, left: 3, top: 5 },
      { input: cut, left: 0, top: 0 },
    ])
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(file);
  console.log(file, Math.round(info.size / 1024), "KB");
}

(async () => {
  for (const p of PAGES) await page(p);
})();
