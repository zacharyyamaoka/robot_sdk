// The Types switchboard on a phone: the kit lays round-1 V2's switchboard out again, without forking it.
// WHY (kit check, 2026-11-25): V2's phone layout (src/v2/sw-model.js, `vertical`) puts packages two per row and draws
// every edge as a bezier between fixed handles, so the edges to a second row ran straight through the first row's boxes
// (JointTrajectory at 390 px: 6 edges through packages they do not connect; JointState: 1), their count labels sat
// under those boxes, and the zoom controls covered robot_diagnostics' arrowhead. V2 is imported unchanged (a round-1
// folder; criterion "build on V2"), so this is geometry only: TypeWorkspace reads V2's nodes from the DOM, this module
// places them again and routes every edge through gaps that hold no box, and a scoped <style> overrides the node
// positions, the edge paths (CSS `d`) and the label positions. V2 keeps its state, clicks, focus/hover styling and rows
// panel. Above 640 px (V2's own breakpoint) nothing here applies: desktop is V2 exactly.
//
// The layout: producers above the type, consumers below it, import-only packages below those, two boxes per row with a
// central gap between them. The gap carries one trunk per kind; each edge leaves its trunk in the gap next to its own
// row and runs to the middle of its box, with its count on that branch (never on a box). A lone box in the outermost
// row is centred (its edge drops straight down the gap); any other lone box takes the left column so the gap stays
// open. "+N types" (V2's second ring) adds rows beyond the parent's side; their edges leave the parent at its inner
// side and follow their own trunk.
import { roundedPath } from "./layout.js";

export const SW_NARROW_QUERY = "(max-width: 640px)"; // V2's useNarrow breakpoint (src/v2/util.js)
// GX central gap · GY gap between rows (holds a branch and its label) · D gap between the type and its first row ·
// SECTION gap before import-only / ring rows · STEP between trunks · PAD around the drawing · STRIP kept free at the
// bottom of the canvas for the zoom controls and the attribution · MAX_ZOOM as V2's fit.
export const SWN = { GX: 40, GY: 34, D: 40, SECTION: 42, STEP: 10, PAD: 12, STRIP: 40, MAX_ZOOM: 1.1, MIN_H: 220, MAX_H: 1100 };
// V2's own fit (types-tab.jsx: fitView padding 0.1, maxZoom 1.1; ReactFlow minZoom 0.2).
const V2_FIT = { padding: 0.1, maxZoom: 1.1, minZoom: 0.2 };

const KIND = { prod: "produces", cons: "consumes", imp: "imports" };
const colOf = (id) => (id === "type" ? "type" : id.startsWith("r:") ? "ring" : id.split(":")[1]);
// V2's label test id: sw-elabel-<kind>-<pkg | layer> (types-tab.jsx SwEdge, testKey).
const labelIdOf = (nodeId) => `sw-elabel-${KIND[colOf(nodeId)]}-${nodeId.split(":").slice(2).join(":")}`;

function dedupe(points) {
  const out = [];
  for (const p of points) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > 0.01) out.push(p);
  return out;
}

// list: [{ id, w, h }] in V2's node order (type, producers, consumers, import-only, ring); ids as V2 makes them:
// "type", "p:<col>:<pkg>", "g:<col>:<layer>", "r:<typeId>". ringParent: the node whose "+N types" ring is open.
// Returns { nodes: { id: { x, y, w, h } }, edges: [{ id, points, kind, label: { id, x, y } | null }], box } in kit
// space (the type node centred on 0,0), or null without a type node.
export function narrowLayout(list, ringParent = null) {
  const { GX, GY, D, SECTION, STEP } = SWN;
  const byId = Object.fromEntries(list.map((n) => [n.id, n]));
  const t = byId.type;
  if (!t) return null;
  const items = { prod: [], cons: [], imp: [], ring: [] };
  for (const n of list) { const c = colOf(n.id); if (items[c]) items[c].push(n); }
  const parentCol = ringParent && byId[ringParent] ? colOf(ringParent) : null;
  const ringSide = items.ring.length && parentCol ? (parentCol === "prod" ? "up" : "down") : null;
  const sections = { up: [["produces", items.prod]], down: [["consumes", items.cons], ["imports", items.imp]] };
  if (ringSide) sections[ringSide].push(["ring", items.ring]);

  const pos = { type: { x: -t.w / 2, y: -t.h / 2, w: t.w, h: t.h } };
  const rowOf = {};
  const trunk = {};
  for (const side of ["up", "down"]) {
    const dir = side === "up" ? -1 : 1;
    const rows = [];
    for (const [kind, l] of sections[side]) for (let i = 0; i < l.length; i += 2) rows.push({ kind, nodes: l.slice(i, i + 2) });
    const lastMain = rows.filter((r) => r.kind !== "ring").length - 1;
    let edge = (dir * t.h) / 2; // outer face of what is placed so far
    rows.forEach((r, i) => {
      const gap = i === 0 ? D : r.kind !== rows[i - 1].kind ? SECTION : GY;
      const h = Math.max(...r.nodes.map((n) => n.h));
      const near = edge + dir * gap; // the row's face toward the type
      const branchY = edge + (dir * gap) / 2;
      // A lone box is centred only where nothing lies beyond it on this side (the gap must stay open for trunks).
      const lone = r.nodes.length === 1;
      const centred = lone && (r.kind === "ring" ? i === rows.length - 1
        : i === lastMain && (ringSide !== side || r.nodes[0].id === ringParent));
      r.nodes.forEach((n, j) => {
        const x = centred ? -n.w / 2 : j === 0 ? -GX / 2 - n.w : GX / 2;
        const y = dir > 0 ? near : near - n.h;
        pos[n.id] = { x, y, w: n.w, h: n.h };
        rowOf[n.id] = { side, branchY, centred };
      });
      edge = near + dir * h;
    });
    const kinds = (side === "up" ? ["produces", "ring"] : ["consumes", "ring", "imports"])
      .filter((k) => rows.some((r) => r.kind === k));
    trunk[side] = Object.fromEntries(kinds.map((k, i) => [k, (i - (kinds.length - 1) / 2) * STEP]));
  }

  const edges = [];
  const STRAIGHT = 16; // a box this close to its trunk is reached straight down the gap
  for (const n of [...items.prod, ...items.cons, ...items.imp]) {
    const kind = KIND[colOf(n.id)];
    const { side, branchY } = rowOf[n.id];
    const p = pos[n.id], tx = trunk[side][kind];
    const cx = p.x + p.w / 2;
    const face = side === "up" ? p.y + p.h : p.y;
    const typeFace = side === "up" ? -t.h / 2 : t.h / 2;
    let pts, label;
    if (Math.abs(cx - tx) < STRAIGHT) {
      pts = [{ x: tx, y: face }, { x: tx, y: typeFace }];
      label = { x: tx, y: branchY };
    } else {
      pts = [{ x: cx, y: face }, { x: cx, y: branchY }, { x: tx, y: branchY }, { x: tx, y: typeFace }];
      label = { x: (cx + tx) / 2, y: branchY };
    }
    if (kind !== "produces") pts.reverse(); // V2's direction: producer -> type -> consumer / importer
    edges.push({ id: "e:" + n.id, kind, points: dedupe(pts), label: { id: labelIdOf(n.id), ...label } });
  }
  if (ringSide && pos[ringParent]) {
    const P = pos[ringParent], tx = trunk[ringSide].ring;
    const pc = rowOf[ringParent]?.centred;
    for (const r of items.ring) {
      const p = pos[r.id], { branchY } = rowOf[r.id];
      const cx = p.x + p.w / 2;
      const face = ringSide === "down" ? p.y : p.y + p.h;
      const head = pc
        ? [{ x: tx, y: ringSide === "down" ? P.y + P.h : P.y }]
        : [{ x: P.x < 0 ? P.x + P.w : P.x, y: P.y + P.h / 2 }, { x: tx, y: P.y + P.h / 2 }];
      const tail = Math.abs(cx - tx) < STRAIGHT ? [{ x: tx, y: face }] : [{ x: tx, y: branchY }, { x: cx, y: branchY }, { x: cx, y: face }];
      edges.push({ id: "re:" + r.id.slice(2), kind: "ring", points: dedupe([...head, ...tail]), label: null });
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of Object.values(pos)) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { nodes: pos, edges, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// The pane height that shows `lay` at its width-fitted zoom with the bottom strip free (px, without borders).
export function narrowHeight(lay, paneW) {
  const { PAD, STRIP, MAX_ZOOM, MIN_H, MAX_H } = SWN;
  if (!lay) return MIN_H;
  const z = Math.min(MAX_ZOOM, (paneW - 2 * PAD) / lay.box.w);
  return Math.round(Math.min(MAX_H, Math.max(MIN_H, z * lay.box.h + 2 * PAD + STRIP)));
}

// React Flow's fitView of V2's own boxes (getViewportForBounds with a numeric padding): the viewport V2 is shown at.
export function v2Fit(v2Nodes, paneW, paneH) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of v2Nodes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  const pad = (v) => 2 * Math.floor((v - v / (1 + V2_FIT.padding)) * 0.5);
  const z = Math.min(Math.max(Math.min((paneW - pad(paneW)) / (x1 - x0), (paneH - pad(paneH)) / (y1 - y0)), V2_FIT.minZoom), V2_FIT.maxZoom);
  return { zoom: z, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

const n2 = (v) => Math.round(v * 100) / 100;
const n4 = (v) => Math.round(v * 10000) / 10000;

// The scoped CSS that draws `lay` in V2's flow coordinates. V2's viewport stays V2's (its own fit, zoom buttons and
// panning keep working); each kit position is mapped into it so that, at V2's fit, the kit layout is fitted to the
// pane above the controls strip: q = c2 + s (x - ck) + offset, s = kit zoom / V2 zoom (nodes and labels scale by s).
// sel: the TypeWorkspace root selector. Returns { css, zoom, scale }.
export function narrowCss(sel, lay, v2Nodes, paneW, paneH) {
  const { PAD, STRIP, MAX_ZOOM } = SWN;
  const fit = v2Fit(v2Nodes, paneW, paneH);
  const availW = paneW - 2 * PAD, availH = paneH - STRIP - 2 * PAD;
  const zoom = Math.min(MAX_ZOOM, availW / lay.box.w, availH / lay.box.h);
  const s = zoom / fit.zoom;
  const ckx = lay.box.x + lay.box.w / 2, cky = lay.box.y + lay.box.h / 2;
  const offY = (PAD + availH / 2 - paneH / 2) / fit.zoom;
  const map = (x, y) => ({ x: fit.cx + s * (x - ckx), y: fit.cy + s * (y - cky) + offY });
  const out = [];
  for (const [id, b] of Object.entries(lay.nodes)) {
    const q = map(b.x, b.y);
    out.push(`${sel} .react-flow__node[data-id="${id}"]{transform:translate(${n2(q.x)}px,${n2(q.y)}px) scale(${n4(s)})!important;transform-origin:0 0!important}`);
  }
  for (const e of lay.edges) {
    const d = roundedPath(e.points.map((p) => map(p.x, p.y)), 8 * s).replace(/(\d+\.\d{3})\d+/g, "$1");
    out.push(`${sel} .react-flow__edge[data-id="${e.id}"] path{d:path("${d}")!important}`);
    if (e.label) {
      const q = map(e.label.x, e.label.y);
      out.push(`${sel} .sw-elabel[data-testid="${e.label.id}"]{transform:translate(${n2(q.x)}px,${n2(q.y)}px) scale(${n4(s)}) translate(-50%,-50%)!important;transform-origin:0 0!important}`);
    }
  }
  return { css: out.join("\n"), zoom, scale: s };
}
