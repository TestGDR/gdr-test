// Genera una pagina di pergamena stropicciata agli angoli (sfondo del libro di
// Manuale e Ambientazione). Uso, dalla cartella del progetto:
//   node scripts/genera-pagina.cjs public/images/pagina-sinistra.jpg . 4 600 1400
//   node scripts/genera-pagina.cjs public/images/pagina-destra.jpg . 9 1600 1300
// (file, cartella del progetto, numero per pieghe diverse, larghezza, altezza)
const sharp = require(require("path").resolve(process.argv[3]) + "/node_modules/sharp");
const out = process.argv[2];
const seed = Number(process.argv[4] || 4);
const W = Number(process.argv[5] || 1000), H = Number(process.argv[6] || 1400);
let s = seed * 9301 + 49297;
const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <radialGradient id="b" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f4e9cd"/><stop offset=".6" stop-color="#e7d4aa"/><stop offset="1" stop-color="#cdb07c"/></radialGradient>
  <filter id="st" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="${seed + 7}"/><feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.3 0 0 0 0 0.12 0 0 0 1.6 -0.78"/></filter>
  <filter id="gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85 0.4" numOctaves="3" seed="${seed + 3}"/><feColorMatrix values="0 0 0 0 0.4 0 0 0 0 0.28 0 0 0 0 0.12 0 0 0 0.3 0"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#b)"/><rect width="${W}" height="${H}" filter="url(#st)" opacity=".3"/><rect width="${W}" height="${H}" filter="url(#gr)"/></svg>`;

// rughe ampie (luce radente sul rumore), visibili solo verso gli angoli
const corner = (cx, cy) => `<radialGradient id="c${cx}${cy}" cx="${cx}" cy="${cy}" r="0.5"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
const wrinkles = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <filter id="w" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.006 0.009" numOctaves="4" seed="${seed}"/>
    <feDiffuseLighting surfaceScale="12" lighting-color="#fff"><feDistantLight azimuth="235" elevation="45"/></feDiffuseLighting>
    <feColorMatrix values="0.5 0 0 0 0.5  0.47 0 0 0 0.47  0.4 0 0 0 0.42  0 0 0 1 0"/></filter>
  ${corner(0, 0)}${corner(1, 0)}${corner(0, 1)}${corner(1, 1)}
  <mask id="m"><rect width="${W}" height="${H}" fill="#000"/>
    <rect width="${W}" height="${H}" fill="url(#c00)"/><rect width="${W}" height="${H}" fill="url(#c10)"/><rect width="${W}" height="${H}" fill="url(#c01)"/><rect width="${W}" height="${H}" fill="url(#c11)"/></mask>
</defs>
<rect width="${W}" height="${H}" fill="#fff"/>
<g mask="url(#m)"><rect width="${W}" height="${H}" filter="url(#w)"/></g></svg>`;

// pieghe nette che partono dagli angoli: ombra + filo di luce accanto
function creases() {
  // pieghe che attraversano l'angolo (perpendicolari alla diagonale), quasi dritte
  let paths = "";
  const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
  for (const [x0, y0, sx, sy] of corners) {
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const dist = 40 + rnd() * 200; // distanza dall'angolo
      // estremi sui due bordi dell'angolo, con un po' di variazione
      const ax = x0 + sx * dist * (0.6 + rnd() * 0.9), ay = y0;
      const bx = x0, by = y0 + sy * dist * (0.6 + rnd() * 0.9);
      const mx = (ax + bx) / 2 + (rnd() - 0.5) * 30, my = (ay + by) / 2 + (rnd() - 0.5) * 30;
      const d = `M${ax.toFixed(1)} ${ay.toFixed(1)} L${mx.toFixed(1)} ${my.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`;
      const op = 0.18 + rnd() * 0.22;
      // ombra dal lato dell'angolo, luce dal lato della pagina
      paths += `<path d="${d}" stroke="#4a2e0e" stroke-opacity="${op.toFixed(2)}" stroke-width="4" fill="none"/>`;
      paths += `<path d="${d}" transform="translate(${(sx * 3).toFixed(1)} ${(sy * 3).toFixed(1)})" stroke="#fff8e6" stroke-opacity="${(op * 0.9).toFixed(2)}" stroke-width="2.5" fill="none"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="bl"><feGaussianBlur stdDeviation="1.8"/></filter></defs><g filter="url(#bl)" stroke-linejoin="round" stroke-linecap="round">${paths}</g></svg>`;
}

const burn = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
<radialGradient id="r" cx="50%" cy="50%" r="72%"><stop offset=".6" stop-color="#5a3812" stop-opacity="0"/><stop offset=".9" stop-color="#5a3812" stop-opacity=".3"/><stop offset="1" stop-color="#3a2208" stop-opacity=".7"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#r)"/></svg>`;

(async () => {
  const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();
  const [b, w, c, r] = await Promise.all([png(base), png(wrinkles), png(creases()), png(burn)]);
  const info = await sharp(b)
    .composite([
      { input: w, blend: "multiply" },
      { input: c, blend: "over" },
      { input: r, blend: "over" },
    ])
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  console.log(out, info.size);
})();
