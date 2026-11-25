// V2 "Type Switchboard": pure derivations for the type-centred view. Everything comes from graph.uses rows; nothing
// here invents an edge. WHY a separate module: the switchboard layout is the variant's whole thesis ("the type is the
// API"), so its rules (which column a package lands in, how layers collapse) live in one readable place.
import { LAYER_ORDER, LAYER_LABEL } from "@shared/graph.js";

export const KINDS = ["produces", "consumes", "imports"];
export const NODE_W = 196, NODE_H = 56, TYPE_W = 224, TYPE_H = 84, RING_W = 176, RING_H = 36;
const GAP = 14, COL_DX = 150; // horizontal distance from the type node's edge to a column

export function layerIndex(l) { const i = LAYER_ORDER.indexOf(l); return i < 0 ? 99 : i; }

// Per-type counts across every row (unfiltered): for the rail's bars and for the default (most-used) type.
export function typeCounts(graph) {
  const out = {};
  for (const t of graph.types) out[t.id] = { produces: 0, consumes: 0, imports: 0, total: 0, pkgs: new Set() };
  for (const u of graph.uses) {
    const c = out[u.type] || (out[u.type] = { produces: 0, consumes: 0, imports: 0, total: 0, pkgs: new Set() });
    c[u.kind] = (c[u.kind] || 0) + 1; c.total++; c.pkgs.add(u.package);
  }
  return out;
}

export function mostUsedType(graph) {
  const c = typeCounts(graph);
  return [...graph.types].sort((a, b) => (c[b.id]?.total || 0) - (c[a.id]?.total || 0))[0];
}

// "JointTrajectory" or a full id -> type. Short names are used in URLs when unique.
export function resolveType(graph, key) {
  if (!key) return null;
  return graph.types.find((t) => t.id === key) || graph.types.find((t) => t.name === key) || null;
}
export function typeKey(graph, t) {
  return graph.types.filter((x) => x.name === t.name).length > 1 ? t.id : t.name;
}

export function filterRows(rows, f) {
  return rows.filter((u) => f.show[u.kind] && (!f.publicOnly || u.public) && (!f.declaredOnly || u.declared));
}

function stack(n, h, gap = GAP) { const total = n * h + Math.max(0, n - 1) * gap; return [...Array(n)].map((_, i) => -total / 2 + i * (h + gap)); }

// Build the switchboard: centre type, producers left, consumers right, import-only packages below.
// opts: { rows (already filtered), pkgById, groupByLayer, expanded:Set(layer), ring: nodeId|null, ringTypes(pkg)->[{type, kinds}] }
export function buildSwitchboard(type, opts) {
  const { rows, pkgById, groupByLayer, expanded, ring } = opts;
  const byPkg = new Map();
  for (const u of rows) {
    if (!byPkg.has(u.package)) byPkg.set(u.package, { produces: [], consumes: [], imports: [] });
    byPkg.get(u.package)[u.kind].push(u);
  }
  const order = (ids) => ids.sort((a, b) => layerIndex(pkgById[a]?.layer) - layerIndex(pkgById[b]?.layer) || a.localeCompare(b));
  const cols = {
    prod: order([...byPkg].filter(([, k]) => k.produces.length).map(([p]) => p)),
    cons: order([...byPkg].filter(([, k]) => k.consumes.length).map(([p]) => p)),
    imp: order([...byPkg].filter(([, k]) => !k.produces.length && !k.consumes.length && k.imports.length).map(([p]) => p)),
  };
  const colKind = { prod: "produces", cons: "consumes", imp: "imports" };

  // Column items: a package, or (group by layer) one node per collapsed layer.
  const items = {};
  for (const col of Object.keys(cols)) {
    const list = [];
    const seenLayer = new Map();
    for (const p of cols[col]) {
      const layer = pkgById[p]?.layer || "other";
      if (groupByLayer && !expanded.has(layer)) {
        if (!seenLayer.has(layer)) { const g = { kind: "group", col, layer, members: [] }; seenLayer.set(layer, g); list.push(g); }
        seenLayer.get(layer).members.push(p);
      } else list.push({ kind: "pkg", col, pkg: p });
    }
    items[col] = list;
  }
  const rowsOf = (col, pkgs) => pkgs.flatMap((p) => byPkg.get(p)[colKind[col]]);
  const importsOf = (pkgs) => pkgs.flatMap((p) => byPkg.get(p).imports);

  const nodes = [], edges = [];
  nodes.push({ id: "type", kind: "type", x: -TYPE_W / 2, y: -TYPE_H / 2, w: TYPE_W, h: TYPE_H });
  const grid = (list, top, perRow, gapX = 24, gapY = 18, dir = 1) => list.forEach((it, i) => {
    const r = Math.floor(i / perRow), inRow = Math.min(perRow, list.length - r * perRow), j = i % perRow;
    const total = inRow * NODE_W + (inRow - 1) * gapX;
    it.x = -total / 2 + j * (NODE_W + gapX); it.y = top + dir * r * (NODE_H + gapY);
  });
  if (opts.vertical) {
    // Phone: producers above, consumers below, import-only at the bottom (two per row), so the canvas is tall, not wide.
    const rowsP = Math.ceil(items.prod.length / 2);
    grid(items.prod, -TYPE_H / 2 - 90 - NODE_H, 2, 20, 16, -1);
    grid(items.cons, TYPE_H / 2 + 90, 2, 20, 16);
    const consBottom = TYPE_H / 2 + 90 + Math.ceil(items.cons.length / 2) * (NODE_H + 16);
    grid(items.imp, consBottom + 70, 2, 20, 16);
    void rowsP;
  } else {
    const colX = { prod: -TYPE_W / 2 - COL_DX - NODE_W, cons: TYPE_W / 2 + COL_DX };
    let colHalf = TYPE_H / 2;
    for (const col of ["prod", "cons"]) {
      const ys = stack(items[col].length, NODE_H);
      items[col].forEach((it, i) => { it.x = colX[col]; it.y = ys[i]; });
      if (ys.length) colHalf = Math.max(colHalf, -ys[0]);
    }
    // Import-only row(s) under everything, wrapped so 2x the packages stays readable.
    grid(items.imp, colHalf + 80, 4, 28, 22);
  }

  // Which node of a package carries its "+N imports" badge: the consumer node when it has one, else the producer one.
  const badgeCol = (p) => (cols.cons.includes(p) ? "cons" : "prod");
  for (const col of ["prod", "cons", "imp"]) {
    for (const it of items[col]) {
      const pkgs = it.kind === "group" ? it.members : [it.pkg];
      const id = it.kind === "group" ? `g:${col}:${it.layer}` : `p:${col}:${it.pkg}`;
      const kindRows = rowsOf(col, pkgs);
      const extraImports = col === "imp" ? [] : importsOf(pkgs.filter((p) => badgeCol(p) === col));
      nodes.push({ id, kind: it.kind, col, pkg: it.pkg, layer: it.kind === "group" ? it.layer : pkgById[it.pkg]?.layer,
        members: it.kind === "group" ? it.members : null, rows: kindRows.length, extraImports: extraImports.length,
        x: it.x, y: it.y, w: NODE_W, h: NODE_H });
      const k = colKind[col];
      const e = { id: `e:${id}`, kind: k, nodeId: id, pkgs, layer: it.kind === "group" ? it.layer : null, label: String(kindRows.length) };
      const v = opts.vertical;
      if (col === "prod") Object.assign(e, { source: id, target: "type", sourceHandle: v ? "bs" : "rs", targetHandle: v ? "t" : "l" });
      if (col === "cons") Object.assign(e, { source: "type", target: id, sourceHandle: v ? "bs" : "rs", targetHandle: v ? "t" : "l" });
      if (col === "imp") Object.assign(e, { source: "type", target: id, sourceHandle: v ? "rs" : "bs", targetHandle: v ? "r" : "t" });
      edges.push(e);
    }
  }

  // Second ring: the other types of one expanded package node, faded, so you can walk type -> package -> type.
  const ringNode = nodes.find((n) => n.id === ring && n.kind === "pkg");
  if (ringNode) {
    const list = opts.ringTypes(ringNode.pkg);
    if (ringNode.col === "imp" || opts.vertical) {
      const perR = opts.vertical ? 2 : 4;
      const baseY = opts.vertical ? Math.max(...nodes.map((n) => n.y + n.h)) + 60 : ringNode.y + NODE_H + 70;
      list.forEach((rt, i) => {
        const r = Math.floor(i / perR), inRow = Math.min(perR, list.length - r * perR), j = i % perR;
        const total = inRow * RING_W + (inRow - 1) * 14;
        nodes.push({ id: `r:${rt.type.id}`, kind: "ring", ring: rt, x: -total / 2 + j * (RING_W + 14), y: baseY + r * (RING_H + 12), w: RING_W, h: RING_H });
        edges.push({ id: `re:${rt.type.id}`, kind: rt.kinds[0], ring: true, source: ringNode.id, target: `r:${rt.type.id}`, sourceHandle: "bs", targetHandle: "t" });
      });
    } else {
      const left = ringNode.col === "prod";
      const ys = stack(list.length, RING_H, 10).map((y) => y + ringNode.y + NODE_H / 2);
      list.forEach((rt, i) => {
        nodes.push({ id: `r:${rt.type.id}`, kind: "ring", ring: rt, x: left ? ringNode.x - 120 - RING_W : ringNode.x + NODE_W + 120, y: ys[i], w: RING_W, h: RING_H });
        edges.push({ id: `re:${rt.type.id}`, kind: rt.kinds[0], ring: true, source: ringNode.id, target: `r:${rt.type.id}`,
          sourceHandle: left ? "ls" : "rs", targetHandle: left ? "r" : "l" });
      });
    }
  }
  return { nodes, edges, cols, byPkg, layerLabel: (l) => LAYER_LABEL[l] || l };
}

// The other types a package touches (all its rows, any kind), most-used first.
export function otherTypesOf(graph, pkg, exceptTypeId) {
  const m = new Map();
  for (const u of graph.uses) {
    if (u.package !== pkg || u.type === exceptTypeId) continue;
    if (!m.has(u.type)) m.set(u.type, { n: 0, kinds: {} });
    const e = m.get(u.type); e.n++; e.kinds[u.kind] = (e.kinds[u.kind] || 0) + 1;
  }
  const tById = Object.fromEntries(graph.types.map((t) => [t.id, t]));
  return [...m].map(([id, e]) => ({ type: tById[id] || { id, name: id.split(".").pop(), module: "" }, n: e.n, counts: e.kinds,
    kinds: KINDS.filter((k) => e.kinds[k]) })).sort((a, b) => b.n - a.n);
}
