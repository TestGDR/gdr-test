// Genera il foglio di pergamena della scheda del drago: carta chiara con
// incisioni circolari leggere (come una carta nautica), grana e bordi scuriti.
// Uso, dalla cartella del progetto:  node scripts/genera-scheda-drago.cjs
const path = require("path");
const sharp = require(path.resolve("node_modules/sharp"));

const W = 900;
const H = 1300;
const OUT = "public/images/scheda-drago.webp";

// incisioni: cerchi concentrici in alcuni punti e qualche raggio
function engravings() {
  let s = "";
  const centers = [
    [W * 0.5, H * 0.36, 26],
    [W * 0.08, H * 0.05, 10],
    [W * 0.92, H * 0.06, 10],
    [W * 0.15, H * 0.82, 14],
    [W * 0.86, H * 0.78, 14],
  ];
  for (const [cx, cy, n] of centers) {
    for (let i = 1; i <= n; i++) {
      s += `<circle cx="${cx}" cy="${cy}" r="${i * 26}" fill="none" stroke="#7a5a34" stroke-opacity="${(0.1 - i * 0.002).toFixed(3)}" stroke-width="1"/>`;
    }
    for (let a = 0; a < 360; a += 30) {
      const r = (a * Math.PI) / 180;
      s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(r) * n * 26}" y2="${cy + Math.sin(r) * n * 26}" stroke="#7a5a34" stroke-opacity=".05" stroke-width="1"/>`;
    }
  }
  return s;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <radialGradient id="b" cx="50%" cy="40%" r="80%">
    <stop offset="0" stop-color="#efe3c6"/><stop offset=".6" stop-color="#e2d0a8"/><stop offset="1" stop-color="#c7aa78"/>
  </radialGradient>
  <filter id="st" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.005" numOctaves="3" seed="21"/><feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.3 0 0 0 0 0.12 0 0 0 1.6 -0.8"/></filter>
  <filter id="gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.5" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.4 0 0 0 0 0.28 0 0 0 0 0.12 0 0 0 0.28 0"/></filter>
  <radialGradient id="burn" cx="50%" cy="50%" r="72%"><stop offset=".65" stop-color="#5a3812" stop-opacity="0"/><stop offset="1" stop-color="#3a2208" stop-opacity=".55"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#b)"/>
<rect width="${W}" height="${H}" filter="url(#st)" opacity=".35"/>
${engravings()}
<rect width="${W}" height="${H}" filter="url(#gr)"/>
<rect width="${W}" height="${H}" fill="url(#burn)"/>
</svg>`;

sharp(Buffer.from(svg))
  .webp({ quality: 82 })
  .toFile(OUT)
  .then((i) => console.log(OUT, Math.round(i.size / 1024), "KB"));
