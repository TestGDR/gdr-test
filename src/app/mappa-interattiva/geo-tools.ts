// Strumenti della mappa interattiva: costa presa dall'immagine, divisione
// delle aree con una linea, luogo dentro un'area.
// Coordinate della mappa: [y, x] con y che cresce verso l'alto (0 = fondo
// dell'immagine); l'immagine ha i pixel con y che cresce verso il basso.
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";
import type { Point } from "./map-types";

// Un'area puo' essere un poligono solo (Point[]) o piu' pezzi (Point[][], es. un regno con le isole)
export function ringsOf(geometry: Point | Point[] | Point[][]): Point[][] {
  const g = geometry as unknown[];
  if (!Array.isArray(g) || g.length === 0) return [];
  if (typeof g[0] === "number") return [];
  if (Array.isArray(g[0]) && typeof (g[0] as unknown[])[0] === "number") return [g as Point[]];
  return g as Point[][];
}
export const geometryOf = (rings: Point[][]): Point[] | Point[][] => (rings.length === 1 ? rings[0] : rings);

// Area di un anello (in pixel quadrati)
export function ringArea(r: Point[]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][1] + r[i][1]) * (r[j][0] - r[i][0]);
  return Math.abs(a / 2);
}

// Il punto e' dentro l'anello?
function inRing(p: Point, r: Point[]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [yi, xi] = r[i];
    const [yj, xj] = r[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const pointInArea = (p: Point, rings: Point[][]) => rings.some((r) => inRing(p, r));

// --- Divisione con una linea ---------------------------------------------
const toXY = (p: Point): [number, number] => [p[1], p[0]];
const toPt = (q: [number, number]): Point => [Math.round(q[1] * 10) / 10, Math.round(q[0] * 10) / 10];

// Divide l'area lungo la linea: restituisce i pezzi (anelli). Se la linea non
// la attraversa da un bordo all'altro, resta un pezzo solo.
export function splitArea(rings: Point[][], line: Point[]): Point[][] {
  const area: MultiPolygon = rings.map((r) => [r.map(toXY)] as Polygon);
  const hw = 0.35; // mezza larghezza del taglio (pixel): invisibile
  const cuts: Polygon[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toXY(line[i]);
    const [bx, by] = toXY(line[i + 1]);
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * hw;
    const ny = ((bx - ax) / len) * hw;
    const ex = ((bx - ax) / len) * hw;
    const ey = ((by - ay) / len) * hw;
    const ring: Ring = [
      [ax - ex + nx, ay - ey + ny],
      [bx + ex + nx, by + ey + ny],
      [bx + ex - nx, by + ey - ny],
      [ax - ex - nx, ay - ey - ny],
      [ax - ex + nx, ay - ey + ny],
    ];
    cuts.push([ring]);
  }
  if (!cuts.length) return rings;
  const cut = polygonClipping.union(cuts[0], ...cuts.slice(1));
  const pieces = polygonClipping.difference(area, cut);
  return pieces
    .map((poly) => poly[0].map(toPt)) // solo il contorno esterno di ogni pezzo
    .filter((r) => ringArea(r) > 4); // niente briciole
}

// --- Costa presa dall'immagine ("bacchetta") ----------------------------
// Clic sulla terra: si prende la zona di terra collegata al punto cliccato
// (tutto cio' che non ha il colore del mare) e se ne segue il contorno.
export async function traceLand(
  imageUrl: string,
  width: number,
  height: number,
  click: Point,
): Promise<{ ring: Point[] } | { error: string }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const ok = await new Promise<boolean>((res) => {
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = imageUrl;
  });
  if (!ok) return { error: "Non riesco a leggere l'immagine: il sito che la ospita non lo permette (prova a caricarla su imgur)." };

  // si lavora su una copia ridotta (al massimo ~2600 px di lato): piu' veloce
  const s = Math.max(1, Math.ceil(Math.max(width, height) / 2600));
  const W = Math.round(width / s);
  const H = Math.round(height / s);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { error: "Il browser non permette di leggere l'immagine." };
  ctx.drawImage(img, 0, 0, W, H);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return { error: "Non riesco a leggere i colori dell'immagine: il sito che la ospita non lo permette (prova a caricarla su imgur)." };
  }

  const at = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];

  // colore del mare: quello che sta piu' spesso vicino ai bordi dell'immagine
  const m = Math.round(Math.min(W, H) * 0.04);
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const sample = (x: number, y: number) => {
    const c = at(x, y);
    rs.push(c[0]);
    gs.push(c[1]);
    bs.push(c[2]);
  };
  for (let x = m; x < W - m; x += 3) {
    sample(x, m);
    sample(x, H - 1 - m);
  }
  for (let y = m; y < H - m; y += 3) {
    sample(m, y);
    sample(W - 1 - m, y);
  }
  const sea = [median(rs), median(gs), median(bs)];

  // colore della terra cliccata (media di un quadratino)
  const cx = Math.min(W - 1, Math.max(0, Math.round(click[1] / s)));
  const cy = Math.min(H - 1, Math.max(0, Math.round((height - click[0]) / s)));
  const acc = [0, 0, 0];
  let n = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = at(x, y);
      acc[0] += c[0];
      acc[1] += c[1];
      acc[2] += c[2];
      n++;
    }
  const land = acc.map((v) => v / n);
  const gap = dist(land, sea);
  if (gap < 25) return { error: "Qui il colore è quello del mare: clicca sulla terra." };
  const limit = gap * 0.45;

  // terra = tutto cio' che non somiglia al mare (anche fiumi, foreste e montagne disegnate);
  // una fascia sui bordi resta fuori, cosi' la cornice dell'immagine non si attacca alla terra
  const margin = Math.round(Math.min(W, H) * 0.02);
  const isLand = (x: number, y: number) =>
    x >= margin && y >= margin && x < W - margin && y < H - margin && dist(at(x, y), sea) > limit;
  if (!isLand(cx, cy)) return { error: "Qui il colore è quello del mare: clicca sulla terra." };

  // riempimento dal punto cliccato
  const mask = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  mask[cy * W + cx] = 1;
  queue[tail++] = cy * W + cx;
  while (head < tail) {
    const p = queue[head++];
    const x = p % W, y = (p - x) / W;
    const nb = [p - 1, p + 1, p - W, p + W];
    const ok4 = [x > 0, x < W - 1, y > 0, y < H - 1];
    for (let k = 0; k < 4; k++) {
      const q = nb[k];
      if (!ok4[k] || mask[q]) continue;
      const qx = q % W, qy = (q - qx) / W;
      if (isLand(qx, qy)) {
        mask[q] = 1;
        queue[tail++] = q;
      }
    }
  }

  // contorno esterno (Moore): si parte dal primo pixel in alto a sinistra
  let start = -1;
  for (let i = 0; i < W * H; i++)
    if (mask[i]) {
      start = i;
      break;
    }
  if (start < 0) return { error: "Non ho trovato terra qui." };
  const DX = [-1, -1, 0, 1, 1, 1, 0, -1]; // ovest, nord-ovest, nord, ... in senso orario
  const DY = [0, -1, -1, -1, 0, 1, 1, 1];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  const sx = start % W, sy = (start - sx) / W;
  const pts: [number, number][] = [[sx, sy]];
  let x = sx, y = sy, back = 0; // si arriva da ovest
  let second: [number, number] | null = null;
  for (let guard = 0; guard < W * H; guard++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      if (inside(x + DX[d], y + DY[d])) {
        found = d;
        break;
      }
    }
    if (found < 0) break; // un pixel solo
    const px = x + DX[(found + 7) % 8], py = y + DY[(found + 7) % 8]; // l'ultimo vicino fuori
    const nx = x + DX[found], ny = y + DY[found];
    if (x === sx && y === sy && second && nx === second[0] && ny === second[1]) break; // giro completo
    x = nx;
    y = ny;
    if (!second) second = [x, y];
    pts.push([x, y]);
    // nuova direzione di ritorno: da dove si guarda il vicino fuori
    const bx = px - x, by = py - y;
    back = DX.findIndex((v, i) => v === bx && DY[i] === by);
    if (back < 0) back = 0;
  }
  if (pts.length < 4) return { error: "La zona è troppo piccola." };

  // meno punti (il contorno resta fedele entro ~1,5 pixel della copia ridotta)
  const simple = simplify(pts, 1.2);
  const ring: Point[] = simple.map(([px, py]) => [
    Math.round((height - py * s) * 10) / 10,
    Math.round(px * s * 10) / 10,
  ]);
  return { ring };
}

// Douglas-Peucker senza ricorsione
function simplify(pts: [number, number][], tol: number) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    let far = -1, best = tol;
    for (let i = a + 1; i < b; i++) {
      // distanza dal segmento (non dalla retta: nei contorni chiusi gli estremi coincidono)
      const [px, py] = pts[i];
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2)) : 0;
      const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// L'area meno altre aree (es. il continente meno i regni gia' fatti): restano i pezzi liberi
export function subtractAreas(rings: Point[][], minus: Point[][]): Point[][] {
  if (!minus.length) return rings;
  const area: MultiPolygon = rings.map((r) => [r.map(toXY)] as Polygon);
  const holes: MultiPolygon = minus.map((r) => [r.map(toXY)] as Polygon);
  const out = polygonClipping.difference(area, holes);
  return out.map((poly) => poly[0].map(toPt)).filter((r) => ringArea(r) > 4);
}

// Allunga di poco i due capi della linea: finendo esattamente su un bordo, lo attraversa
export function extendLine(line: Point[], by: number): Point[] {
  if (line.length < 2) return line;
  const push = (a: Point, b: Point): Point => {
    const dy = a[0] - b[0], dx = a[1] - b[1];
    const len = Math.hypot(dy, dx) || 1;
    return [a[0] + (dy / len) * by, a[1] + (dx / len) * by];
  };
  return [push(line[0], line[1]), ...line, push(line[line.length - 1], line[line.length - 2])];
}

// Un punto che sta dentro l'anello (media dei vertici, o un vertice se la media cade fuori)
export function insidePoint(r: Point[]): Point {
  const c: Point = [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
  return pointInArea(c, [r]) ? c : r[Math.floor(r.length / 2)];
}
