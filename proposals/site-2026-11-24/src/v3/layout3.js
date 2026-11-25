// V3 "Canvas Map": one world, laid out from graph.json. WHY no hand-placed ids (criterion fr5): every region's size
// comes from its data, every region's position from the sizes of the regions before it, and the package layers are
// ranked bottom-up by dagre over the layer-to-layer imports. A regenerated graph.json (2x the packages) just grows the map.
import { dagreLayout } from "@shared/layout.js";
import { layersOf, packagesByLayer, packageEdges, typeEdges, LAYER_LABEL } from "@shared/graph.js";

export const SZ = {
  pkgW: 262, pkgH: 112, typeW: 230, typeH: 54, gap: 16, pad: 16, layerHead: 74, moduleHead: 34,
  regionHead: 78, regionPad: 30, regionGap: 120, stageW: 330, stageH: 320, stageGap: 96,
};

export const REGIONS = [
  { id: "what", title: "What it is", nav: "Overview" },
  { id: "packages", title: "Packages", nav: "Packages" },
  { id: "types", title: "robot_msgs types", nav: "Types" },
  { id: "pick", title: "Pick and place", nav: "Pick and place" },
  { id: "agents", title: "Agents", nav: "Agents" },
  { id: "skill", title: "For coding agents", nav: "For coding agents" },
];
// Region columns: the reading order of the map, left to right. Column 2 stacks the types under the packages because
// the types ARE the vocabulary layer opened up (robot_msgs sits at the bottom of the layer stack, right above them).
const COLUMNS = [["what", "skill"], ["packages", "types"], ["pick", "agents"]];

function grid(items, perRow, gap) {
  const cols = [], rows = [];
  items.forEach((it, i) => {
    const c = i % perRow, r = Math.floor(i / perRow);
    cols[c] = Math.max(cols[c] || 0, it.w); rows[r] = Math.max(rows[r] || 0, it.h);
  });
  const pos = new Map();
  items.forEach((it, i) => {
    const c = i % perRow, r = Math.floor(i / perRow);
    const x = cols.slice(0, c).reduce((a, b) => a + b + gap, 0);
    const y = rows.slice(0, r).reduce((a, b) => a + b + gap, 0);
    pos.set(it.id, { x, y });
  });
  const w = cols.reduce((a, b) => a + b, 0) + gap * Math.max(0, cols.length - 1);
  const h = rows.reduce((a, b) => a + b, 0) + gap * Math.max(0, rows.length - 1);
  return { pos, w, h };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function usesIndex(graph) {
  const byPkg = new Map(), byType = new Map();
  for (const u of graph.uses) {
    if (!byPkg.has(u.package)) byPkg.set(u.package, []);
    byPkg.get(u.package).push(u);
    if (!byType.has(u.type)) byType.set(u.type, []);
    byType.get(u.type).push(u);
  }
  return { byPkg, byType };
}

// Per package: one row per type it touches, with produces / consumes / imports counts (the in-place expansion).
export function pkgTypeSummary(graph, idx, pkgId) {
  const m = new Map();
  for (const u of idx.byPkg.get(pkgId) || []) {
    if (!m.has(u.type)) m.set(u.type, { type: u.type, produces: 0, consumes: 0, imports: 0, total: 0 });
    const r = m.get(u.type); r[u.kind] = (r[u.kind] || 0) + 1; r.total++;
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));
}

const expandedPkgH = (n) => SZ.pkgH + 30 + 23 * n;

export function buildLayout(graph, { collapsedLayers, collapsedRegions, expanded, mobile, pick }) {
  const idx = usesIndex(graph);
  const nodes = [];
  const regionBox = {}; // id -> {w, h, children: []}
  const layerOf = Object.fromEntries(graph.packages.map((p) => [p.id, p.layer]));

  // ---- What it is / For coding agents: text regions --------------------------------------------------------------
  const textW = mobile ? 344 : 660;
  regionBox.what = { w: textW + 2 * SZ.regionPad, h: SZ.regionHead + (mobile ? 1210 : 1130) + SZ.regionPad,
    children: [{ id: "text:what", type: "what", x: SZ.regionPad, y: SZ.regionHead, w: textW, h: mobile ? 1210 : 1130, data: {} }] };
  regionBox.skill = { w: textW + 2 * SZ.regionPad, h: SZ.regionHead + (mobile ? 560 : 560) + SZ.regionPad,
    children: [{ id: "text:skill", type: "skill", x: SZ.regionPad, y: SZ.regionHead, w: textW, h: 560, data: {} }] };

  // ---- Packages: nested layer groups ranked bottom-up by dagre -----------------------------------------------------
  {
    const byLayer = packagesByLayer(graph);
    const layers = layersOf(graph);
    const groups = [];
    for (const L of layers) {
      const pkgs = [...byLayer[L]].sort((a, b) => (idx.byPkg.get(b.id)?.length || 0) - (idx.byPkg.get(a.id)?.length || 0) || a.id.localeCompare(b.id));
      if (collapsedLayers.has(L)) {
        const w = 320, h = 70 + 24 * Math.ceil(pkgs.length / 2) + 44;
        groups.push({ L, pkgs, w, h, collapsed: true, kids: [] });
        continue;
      }
      const items = pkgs.map((p) => {
        const ex = expanded.has(p.id);
        const n = ex ? pkgTypeSummary(graph, idx, p.id).length : 0;
        return { id: p.id, w: ex ? 290 : SZ.pkgW, h: ex ? expandedPkgH(n) : SZ.pkgH, ex };
      });
      const perRow = clamp(Math.ceil(Math.sqrt(items.length)), 1, mobile ? 2 : 4);
      const g = grid(items, perRow, SZ.gap);
      groups.push({ L, pkgs, w: g.w + 2 * SZ.pad, h: SZ.layerHead + g.h + SZ.pad, collapsed: false,
        kids: items.map((it) => ({ ...it, x: SZ.pad + g.pos.get(it.id).x, y: SZ.layerHead + g.pos.get(it.id).y })) });
    }
    const lEdges = [];
    const seen = new Set();
    for (const e of packageEdges(graph)) {
      if (!e.known) continue;
      const a = layerOf[e.source], b = layerOf[e.target];
      if (a === b || seen.has(a + ">" + b)) continue;
      // dependency -> dependant, so with rankdir BT the vocabulary (the source of everything) sits at the bottom.
      seen.add(a + ">" + b); lEdges.push({ source: "layer:" + b, target: "layer:" + a });
    }
    const pos = dagreLayout(groups.map((g) => ({ id: "layer:" + g.L, width: g.w, height: g.h })), lEdges, { rankdir: "BT", nodesep: 30, ranksep: 64 });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of groups) { const p = pos.get("layer:" + g.L); minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + g.w); maxY = Math.max(maxY, p.y + g.h); }
    const children = [];
    for (const g of groups) {
      const p = pos.get("layer:" + g.L);
      children.push({ id: "layer:" + g.L, type: "layer", x: SZ.regionPad + p.x - minX, y: SZ.regionHead + p.y - minY, w: g.w, h: g.h,
        data: { layer: g.L, label: LAYER_LABEL[g.L] || g.L, members: g.pkgs.map((p) => p.id), collapsed: g.collapsed, viewer: g.L === "viewers" } });
      for (const k of g.kids) children.push({ id: "pkg:" + k.id, type: "pkg3", parent: "layer:" + g.L, x: k.x, y: k.y, w: k.w, h: k.h,
        data: { pkg: graph.packages.find((p) => p.id === k.id), expanded: k.ex } });
    }
    regionBox.packages = { w: maxX - minX + 2 * SZ.regionPad, h: SZ.regionHead + (maxY - minY) + SZ.regionPad, children };
  }

  // ---- Types: one group per robot_msgs module, shelf-packed to the packages' width ---------------------------------
  {
    const mods = new Map();
    for (const t of graph.types) { const m = t.module || t.package; if (!mods.has(m)) mods.set(m, []); mods.get(m).push(t); }
    const usesOf = (t) => idx.byType.get(t.id)?.length || 0;
    const modList = [...mods.entries()].map(([m, ts]) => ({ m, ts: ts.sort((a, b) => usesOf(b) - usesOf(a) || a.name.localeCompare(b.name)), uses: ts.reduce((a, t) => a + usesOf(t), 0) }))
      .sort((a, b) => b.uses - a.uses || a.m.localeCompare(b.m));
    const maxW = mobile ? 3 * SZ.typeW + 2 * SZ.gap + 2 * SZ.pad : Math.max(regionBox.packages.w - 2 * SZ.regionPad, 4 * (SZ.typeW + SZ.gap));
    let x = 0, y = 0, rowH = 0;
    const children = [];
    let w = 0;
    for (const md of modList) {
      const perRow = md.ts.length >= 7 ? 3 : md.ts.length >= 2 ? 2 : 1;
      const g = grid(md.ts.map((t) => ({ id: t.id, w: SZ.typeW, h: SZ.typeH })), perRow, 10);
      const gw = g.w + 2 * SZ.pad, gh = SZ.moduleHead + g.h + SZ.pad;
      if (x > 0 && x + gw > maxW) { x = 0; y += rowH + 18; rowH = 0; }
      children.push({ id: "module:" + md.m, type: "module", x: SZ.regionPad + x, y: SZ.regionHead + y, w: gw, h: gh, data: { label: md.m, count: md.ts.length, uses: md.uses } });
      for (const t of md.ts) {
        const p = g.pos.get(t.id);
        const rows = idx.byType.get(t.id) || [];
        children.push({ id: "type:" + t.id, type: "type3", parent: "module:" + md.m, x: SZ.pad + p.x, y: SZ.moduleHead + p.y, w: SZ.typeW, h: SZ.typeH,
          data: { type: t, uses: rows.length, pkgs: new Set(rows.map((r) => r.package)).size } });
      }
      x += gw + 18; rowH = Math.max(rowH, gh); w = Math.max(w, x - 18);
    }
    regionBox.types = { w: w + 2 * SZ.regionPad, h: SZ.regionHead + y + rowH + SZ.regionPad, children };
  }

  // ---- Pick and place: stages chained left to right, plots under them ---------------------------------------------
  {
    const children = [];
    const stages = pick?.stages || [];
    const perRow = mobile ? 1 : Math.max(1, stages.length);
    const noteH = 104;
    children.push({ id: "note:pick", type: "pickNote", x: SZ.regionPad, y: SZ.regionHead, w: 0, h: noteH, data: {} });
    const sy = SZ.regionHead + noteH + 24;
    stages.forEach((s, i) => {
      const c = i % perRow, r = Math.floor(i / perRow);
      children.push({ id: "stage:" + i, type: "stage", x: SZ.regionPad + c * (SZ.stageW + SZ.stageGap), y: sy + r * (SZ.stageH + 130), w: SZ.stageW, h: SZ.stageH, data: { stage: s, i, n: stages.length } });
    });
    const rowsUsed = Math.ceil(stages.length / perRow) || 1;
    const stagesW = Math.min(perRow, Math.max(1, stages.length)) * (SZ.stageW + SZ.stageGap) - SZ.stageGap;
    const innerW = Math.max(stagesW, mobile ? SZ.stageW : 900);
    children[0].w = innerW;
    const py = sy + rowsUsed * (SZ.stageH + 130) - 10;
    const plotCount = 3, aspect = [560 / 1200, 600 / 1200, 460 / 1200];
    const pw = mobile ? innerW : (innerW - (plotCount - 1) * 30) / plotCount;
    let plotsH = 0, yAcc = py;
    for (let i = 0; i < plotCount; i++) {
      const h = Math.round(pw * aspect[i]) + 70;
      children.push({ id: "plot:" + i, type: "plot", x: SZ.regionPad + (mobile ? 0 : i * (pw + 30)), y: mobile ? yAcc : py, w: pw, h, data: { i } });
      if (mobile) yAcc += h + 20; plotsH = Math.max(plotsH, h);
    }
    const bottom = mobile ? yAcc : py + plotsH;
    regionBox.pick = { w: innerW + 2 * SZ.regionPad, h: bottom + SZ.regionPad, children };
  }

  // ---- Agents ----------------------------------------------------------------------------------------------------
  {
    const agents = graph.agents || [];
    const children = [];
    const noteH = 220, aw = 440, ah = 660;
    const perRow = mobile ? 1 : clamp(agents.length, 1, 3);
    const innerW = Math.max(perRow * (aw + 24) - 24, aw);
    children.push({ id: "note:agents", type: "agentNote", x: SZ.regionPad, y: SZ.regionHead, w: innerW, h: noteH, data: {} });
    agents.forEach((a, i) => {
      const c = i % perRow, r = Math.floor(i / perRow);
      children.push({ id: "agent:" + a.id, type: "agent3", x: SZ.regionPad + c * (aw + 24), y: SZ.regionHead + noteH + 20 + r * (ah + 24), w: aw, h: ah, data: { agent: a } });
    });
    const rows = Math.max(1, Math.ceil(agents.length / perRow));
    regionBox.agents = { w: innerW + 2 * SZ.regionPad, h: SZ.regionHead + noteH + 20 + rows * (ah + 24) - 24 + SZ.regionPad, children };
  }

  // ---- Regions on the world: columns, each column a stack --------------------------------------------------------
  const COLLAPSED = { w: 360, h: 150 };
  const size = (id) => (collapsedRegions.has(id) ? COLLAPSED : regionBox[id]);
  const regionPos = {};
  const columns = mobile ? [["what", "packages", "types", "pick", "agents", "skill"]] : COLUMNS;
  let cx = 0;
  for (const col of columns) {
    let cy = 0, cw = 0;
    for (const id of col) { regionPos[id] = { x: cx, y: cy }; cy += size(id).h + (mobile ? 90 : SZ.regionGap * 0.8); cw = Math.max(cw, size(id).w); }
    cx += cw + SZ.regionGap;
  }
  // Agents sit in the far column on purpose: their builds-on edges cross the whole map to the packages.
  for (const R of REGIONS) {
    const s = size(R.id), p = regionPos[R.id];
    const collapsed = collapsedRegions.has(R.id);
    nodes.push({ id: "region:" + R.id, type: "region", position: p, width: s.w, height: s.h, data: { region: R.id, title: R.title, collapsed }, zIndex: -1, selectable: false });
    if (collapsed) continue;
    for (const c of regionBox[R.id].children) {
      nodes.push({ id: c.id, type: c.type, parentId: c.parent || "region:" + R.id, position: { x: c.x, y: c.y }, width: c.w, height: c.h, data: c.data, extent: undefined });
    }
  }
  // Parents before children (React Flow requires it): regions, then layer/module groups, then their members.
  const order = (n) => (n.type === "region" ? 0 : n.type === "layer" || n.type === "module" ? 1 : 2);
  nodes.sort((a, b) => order(a) - order(b));
  return { nodes, regionPos, regionBox, idx };
}

// Which visible node stands for a logical thing, given what is collapsed (edges aggregate onto it).
export function makeRep(graph, { collapsedLayers, collapsedRegions }) {
  const layerOf = Object.fromEntries(graph.packages.map((p) => [p.id, p.layer]));
  return {
    pkg: (id) => (collapsedRegions.has("packages") ? "region:packages" : collapsedLayers.has(layerOf[id]) ? "layer:" + layerOf[id] : "pkg:" + id),
    type: (id) => (collapsedRegions.has("types") ? "region:types" : "type:" + id),
    agent: (id) => (collapsedRegions.has("agents") ? "region:agents" : "agent:" + id),
  };
}

export { typeEdges, packageEdges };
