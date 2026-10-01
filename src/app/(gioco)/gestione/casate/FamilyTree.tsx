"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GAME_YEAR } from "@/lib/game-config";
import {
  RELATION_KINDS,
  lifeLabel,
  type FamilyMember,
  type FamilyRelation,
  type House,
  type HouseNpc,
  type LifeDates,
} from "@/lib/houses";

// =====================================================================
// Struttura dell'albero (chi sta accanto a chi, figli di quale coppia)
// =====================================================================
export type MemberLink = { image: string | null; externalHouse: House | null; life: LifeDates };

export type Tree = {
  byId: Map<string, FamilyMember>;
  roots: FamilyMember[];
  parentsOf: (m: FamilyMember) => string[];
  childrenOf: (nodeId: string) => FamilyMember[];
  besideOf: (nodeId: string) => FamilyMember[]; // coniugi disegnati accanto al membro
  relationsOf: (memberId: string) => { relation: FamilyRelation; other: FamilyMember }[];
  linkOf: (member: FamilyMember) => MemberLink;
};

export const byOrder = (a: FamilyMember, b: FamilyMember) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

// Chi entra in famiglia per matrimonio (nessun genitore nell'albero) viene disegnato
// accanto al coniuge invece che come capostipite separato.
export function buildTree(
  family: FamilyMember[],
  relations: FamilyRelation[],
  npcs: HouseNpc[],
  houses: House[],
  houseId: string,
): Tree {
  const byId = new Map(family.map((f) => [f.id, f]));
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const houseById = new Map(houses.map((h) => [h.id, h]));
  const parentsOf = (m: FamilyMember) => [m.parent_id, m.parent2_id].filter((p): p is string => !!p && byId.has(p));
  const hasParents = (m: FamilyMember) => parentsOf(m).length > 0;
  // nell'ordine in cui i rapporti sono stati inseriti (primo matrimonio, secondo...)
  const relationsOf = (id: string) =>
    relations
      .filter((r) => r.member_a === id || r.member_b === id)
      .map((r) => ({ relation: r, other: byId.get(r.member_a === id ? r.member_b : r.member_a) }))
      .filter((x): x is { relation: FamilyRelation; other: FamilyMember } => !!x.other);

  const host = new Map<string, string>(); // membro disegnato accanto -> membro principale
  for (const m of [...family].sort(byOrder)) {
    if (hasParents(m)) continue;
    const partners = relationsOf(m.id).map((x) => x.other);
    const withParents = partners.find(hasParents);
    const earlierRootless = partners.find((p) => !hasParents(p) && !host.has(p.id) && byOrder(p, m) < 0);
    const target = withParents ?? earlierRootless;
    if (target) host.set(m.id, target.id);
  }
  const nodeOf = (id: string) => host.get(id) ?? id;

  return {
    byId,
    roots: family.filter((m) => !host.has(m.id) && !hasParents(m)).sort(byOrder),
    parentsOf,
    childrenOf: (nodeId) =>
      family.filter((c) => !host.has(c.id) && hasParents(c) && nodeOf(parentsOf(c)[0]) === nodeId).sort(byOrder),
    besideOf: (nodeId) => {
      const order = relationsOf(nodeId).map((x) => x.other.id);
      return family.filter((m) => host.get(m.id) === nodeId).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    },
    relationsOf,
    linkOf: (m) => {
      const npc = m.npc_id ? npcById.get(m.npc_id) : undefined;
      const external = npc && npc.house_id !== houseId ? (houseById.get(npc.house_id) ?? null) : null;
      // Nascita, morte e "deceduto" dei membri collegati vengono dalla scheda del PNG
      const life: LifeDates = npc
        ? { birth_year: npc.birth_year, death_year: npc.death_year, deceased: npc.deceased }
        : { birth_year: m.birth_year, death_year: m.death_year, deceased: m.deceased };
      return { image: npc?.image_url ?? null, externalHouse: external, life };
    },
  };
}

// =====================================================================
// Disposizione automatica
// =====================================================================
const W = 168; // larghezza carta
const H = 128; // altezza carta
const SPOUSE_GAP = 56; // spazio tra coniugi (ci sta il medaglione del rapporto)
const SIB_GAP = 40; // spazio tra famiglie affiancate
const ROW_GAP = 96; // spazio tra generazioni
const PAD = 32;

type Pos = { x: number; y: number };
type Cluster = { main: string; order: string[] }; // persone affiancate, da sinistra a destra

function autoLayout(tree: Tree) {
  const pos = new Map<string, Pos>();
  const clusters: Cluster[] = [];
  const widths = new Map<string, number>();

  // Chi ha piu' coniugi sta al centro: il primo a sinistra, il secondo a destra, e cosi' via
  const orderOf = (mainId: string) => {
    const left: string[] = [];
    const right: string[] = [];
    tree.besideOf(mainId).forEach((s, i) => (i % 2 === 0 ? left : right).push(s.id));
    return [...left.reverse(), mainId, ...right];
  };

  // Figli in ordine di coppia: quelli del coniuge a sinistra a sinistra, ecc.
  const kidsOf = (mainId: string) => {
    const order = orderOf(mainId);
    const keyOf = (c: FamilyMember) => {
      const partner = tree.parentsOf(c).find((p) => p !== mainId && order.includes(p));
      return order.indexOf(partner ?? mainId);
    };
    return tree.childrenOf(mainId).sort((a, b) => keyOf(a) - keyOf(b) || byOrder(a, b));
  };

  const clusterWidth = (mainId: string) => {
    const n = orderOf(mainId).length;
    return n * W + (n - 1) * SPOUSE_GAP;
  };

  const measure = (mainId: string): number => {
    const kids = kidsOf(mainId);
    const kidsWidth = kids.reduce((sum, k) => sum + measure(k.id), 0) + Math.max(0, kids.length - 1) * SIB_GAP;
    const width = Math.max(clusterWidth(mainId), kidsWidth);
    widths.set(mainId, width);
    return width;
  };

  const place = (mainId: string, left: number, row: number) => {
    const width = widths.get(mainId)!;
    const order = orderOf(mainId);
    const y = PAD + row * (H + ROW_GAP);
    let x = left + (width - clusterWidth(mainId)) / 2;
    for (const id of order) {
      pos.set(id, { x, y });
      x += W + SPOUSE_GAP;
    }
    clusters.push({ main: mainId, order });

    const kids = kidsOf(mainId);
    const kidsWidth = kids.reduce((sum, k) => sum + widths.get(k.id)!, 0) + Math.max(0, kids.length - 1) * SIB_GAP;
    let kx = left + (width - kidsWidth) / 2;
    for (const k of kids) {
      place(k.id, kx, row + 1);
      kx += widths.get(k.id)! + SIB_GAP;
    }
  };

  let left = PAD;
  for (const root of tree.roots) {
    measure(root.id);
    place(root.id, left, 0);
    left += widths.get(root.id)! + SIB_GAP * 2;
  }
  return { pos, clusters };
}

// =====================================================================
// Disegno: carte posizionate + linee in SVG
// =====================================================================
export function FamilyCanvas({
  tree,
  family,
  selectedId,
  onSelect,
  onMove,
}: {
  tree: Tree;
  family: FamilyMember[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  // Posizioni trascinate in questa sessione (prima che arrivino dal server)
  const [moved, setMoved] = useState<Record<string, Pos>>({});
  const drag = useRef<{ id: string; startX: number; startY: number; base: Pos; moving: boolean } | null>(null);

  const { pos: auto, clusters } = autoLayout(tree);
  const posOf = (id: string): Pos => {
    if (moved[id]) return moved[id];
    const m = tree.byId.get(id);
    if (m && m.pos_x !== null && m.pos_y !== null) return { x: m.pos_x, y: m.pos_y };
    return auto.get(id) ?? { x: PAD, y: PAD };
  };

  const ids = family.map((f) => f.id).filter((id) => auto.has(id) || moved[id] || tree.byId.get(id)?.pos_x !== null);
  const width = Math.max(600, ...ids.map((id) => posOf(id).x + W + PAD));
  const height = Math.max(240, ...ids.map((id) => posOf(id).y + H + PAD));

  // --- Linee -----------------------------------------------------------
  const center = (id: string) => ({ x: posOf(id).x + W / 2, y: posOf(id).y + H / 2 });
  const lines: { d: string; dashed?: boolean }[] = [];
  const medallions: { x: number; y: number; symbol: string; title: string }[] = [];
  const unionPoint = new Map<string, Pos>(); // "a|b" -> punto da cui scendono i figli della coppia
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const drawnPairs = new Set<string>();

  for (const { main, order } of clusters) {
    for (const spouse of order) {
      if (spouse === main) continue;
      const rel = tree.relationsOf(main).find((x) => x.other.id === spouse)?.relation;
      const kind = rel ? RELATION_KINDS[rel.kind] : RELATION_KINDS.matrimonio;
      const [l, r] = posOf(spouse).x < posOf(main).x ? [spouse, main] : [main, spouse];
      const adjacent = Math.abs(order.indexOf(spouse) - order.indexOf(main)) === 1;
      let point: Pos;
      if (adjacent) {
        // legame diritto tra i due lati affacciati
        const a = { x: posOf(l).x + W, y: center(l).y };
        const b = { x: posOf(r).x, y: center(r).y };
        lines.push({ d: `M${a.x},${a.y} L${b.x},${b.y}` });
        point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      } else {
        // coniuge non vicino (terzo matrimonio e oltre): arco sopra le carte
        const top = Math.min(posOf(l).y, posOf(r).y) - 22;
        const a = center(l);
        const b = center(r);
        lines.push({ d: `M${a.x},${posOf(l).y} V${top} H${b.x} V${posOf(r).y}` });
        point = { x: (a.x + b.x) / 2, y: top };
      }
      unionPoint.set(pairKey(main, spouse), point);
      drawnPairs.add(pairKey(main, spouse));
      medallions.push({ ...point, symbol: kind.symbol, title: kind.label + (rel?.note ? ` — ${rel.note}` : "") });
    }
  }

  // Rapporti tra persone di rami diversi: linea tratteggiata
  for (const m of family) {
    for (const { relation, other } of tree.relationsOf(m.id)) {
      const key = pairKey(m.id, other.id);
      if (drawnPairs.has(key) || !auto.has(m.id) || !auto.has(other.id)) continue;
      drawnPairs.add(key);
      const a = center(m.id);
      const b = center(other.id);
      lines.push({ d: `M${a.x},${a.y} L${b.x},${b.y}`, dashed: true });
      const kind = RELATION_KINDS[relation.kind];
      medallions.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, symbol: kind.symbol, title: kind.label + (relation.note ? ` — ${relation.note}` : "") });
    }
  }

  // Figli: dalla coppia giusta (o dal solo genitore) fino alla carta del figlio
  for (const child of family) {
    const parents = tree.parentsOf(child);
    if (parents.length === 0 || !auto.has(child.id)) continue;
    const union = parents.length === 2 ? unionPoint.get(pairKey(parents[0], parents[1])) : undefined;
    const parent = parents[0];
    const origin = union ?? { x: center(parent).x, y: posOf(parent).y + H };
    const target = { x: center(child.id).x, y: posOf(child.id).y };
    const busY = Math.max(origin.y + 16, target.y - ROW_GAP / 2);
    lines.push({ d: `M${origin.x},${origin.y} V${busY} H${target.x} V${target.y}` });
  }

  // --- Trascinamento -----------------------------------------------------
  function down(e: ReactPointerEvent, id: string) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, startX: e.clientX, startY: e.clientY, base: posOf(id), moving: false };
  }
  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moving && Math.hypot(dx, dy) < 5) return; // sotto i 5px e' un clic
    d.moving = true;
    const snap = (v: number) => Math.max(0, Math.round(v / 8) * 8);
    setMoved((prev) => ({ ...prev, [d.id]: { x: snap(d.base.x + dx), y: snap(d.base.y + dy) } }));
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moving) return onSelect(d.id);
    const p = moved[d.id];
    if (p) onMove(d.id, p.x, p.y);
  }

  return (
    <div className="relative" style={{ width, height }}>
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
        {lines.map((l, i) => (
          <path
            key={i}
            d={l.d}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity={l.dashed ? 0.55 : 0.7}
            strokeWidth={1.5}
            strokeDasharray={l.dashed ? "6 5" : undefined}
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {medallions.map((m, i) => (
        <span
          key={i}
          title={m.title}
          className="absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent/70 bg-black text-sm text-accent shadow-[0_0_10px_rgba(226,98,45,0.35)]"
          style={{ left: m.x, top: m.y }}
        >
          {m.symbol}
        </span>
      ))}

      {family
        .filter((f) => auto.has(f.id) || moved[f.id])
        .map((f) => {
          const p = posOf(f.id);
          return (
            <div
              key={f.id}
              onPointerDown={(e) => down(e, f.id)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => (drag.current = null)}
              className="absolute z-20 cursor-grab touch-none select-none active:cursor-grabbing"
              style={{ left: p.x, top: p.y, width: W, height: H }}
            >
              <MemberCard member={f} link={tree.linkOf(f)} selected={f.id === selectedId} />
            </div>
          );
        })}
    </div>
  );
}

// Carta di una persona (dimensione fissa, per una disposizione ordinata)
function MemberCard({ member, link, selected }: { member: FamilyMember; link: MemberLink; selected: boolean }) {
  const life = lifeLabel(link.life, GAME_YEAR);
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center rounded-lg border bg-gradient-to-b from-panel to-black px-2.5 text-center shadow-lg shadow-black/60 transition hover:border-accent ${
        selected ? "border-accent ring-2 ring-accent/40" : link.externalHouse ? "border-sky-700/70" : "border-border"
      } ${link.life.deceased ? "opacity-70 grayscale-[40%]" : ""}`}
    >
      {link.externalHouse && (
        <span className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-sky-700/70 bg-black px-2 py-0.5 text-[10px] whitespace-nowrap text-sky-200">
          {link.externalHouse.sigil_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.externalHouse.sigil_url} alt="" className="h-3.5 w-3.5 object-contain" />
          )}
          {link.externalHouse.name}
        </span>
      )}
      {link.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={link.image}
          alt=""
          draggable={false}
          className={`mb-1 h-10 w-10 rounded-full border-2 object-cover ${link.life.deceased ? "border-muted/50" : "border-accent/70"}`}
        />
      ) : (
        <span
          className={`mb-1 flex h-9 w-9 items-center justify-center rounded-full border-2 font-serif ${
            link.life.deceased ? "border-muted/50 text-muted" : "border-accent/70 bg-blood/20 text-accent"
          }`}
        >
          {member.name[0]}
        </span>
      )}
      <span className="line-clamp-2 font-serif text-sm leading-tight text-foreground">
        {member.name}
        {link.life.deceased && <span className="ml-1 text-muted">†</span>}
      </span>
      {life && <span className="mt-0.5 text-[10px] leading-tight text-foreground/70">{life}</span>}
      {member.note && <span className="line-clamp-1 text-[11px] leading-tight text-accent/80 italic">{member.note}</span>}
      {member.spouse && <span className="line-clamp-1 text-[10px] leading-tight text-muted">⚭ {member.spouse}</span>}
    </div>
  );
}
