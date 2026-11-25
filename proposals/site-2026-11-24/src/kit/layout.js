// ELK layouts for the Packages workspace (tree and pipeline), with orthogonal edge routing.
// WHY ELK (Zach, 2026-11-24, on round-1 V1's stack: "you can really use like the [ELK] plugin to do this routing"):
// ELK layered routes every edge orthogonally through the gaps between boxes and, with inline labels, puts each
// pipeline label ON its own edge — round 1's hand-rolled routing drew ten curves into robot_msgs.
// Both modes run top to bottom (direction DOWN). WHY: the left-to-right pipeline came out 2093 x 383 px (unreadable
// once fitted into a ~1100 x 640 canvas); top to bottom it is 913 x 682 (measured 2026-11-24 on the live graph.json).
// Group by layer (both modes): ELK partitions, one per layer, viewers on top and vocabulary at the bottom, drawn as
// full-width bands behind the rows — the look Zach loved in V1 (image 203022). A layer with more than `perRow`
// packages becomes several rows inside its band. Off: a plain layered tree (no partitions, Coffman-Graham layering
// bounded to perRow + 1 boxes per row). Pipeline also offers grouping: "boxes" (ELK compound nodes).
// Nothing is placed by id: graph.json is regenerated hourly and will grow.
import ELK from "elkjs/lib/elk.bundled.js";
import { LAYER_ORDER, LAYER_LABEL, LAYER_BLURB, layersOf, packageEdges } from "@shared/graph.js";
import { pipelineEdges, typeById, GLUE } from "./model.js";

export const PM = { NODE_W: 182, NODE_H: 50, AGENT_W: 196, GUTTER: 128, BAND_PAD: 12, LABEL_H: 18, CHAR_W: 6.6, LABEL_H_COMPACT: 20, CHAR_W_COMPACT: 7.2 };

let elk = null;
const getElk = () => (elk ||= new ELK());

const BASE = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.json.shapeCoords": "ROOT",
  "elk.json.edgeCoords": "ROOT",
  "elk.spacing.nodeNode": "20",
  "elk.spacing.edgeNode": "14",
  "elk.spacing.edgeEdge": "9",
  "elk.layered.spacing.edgeNodeBetweenLayers": "16",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "9",
  "elk.padding": "[top=16,left=16,bottom=16,right=16]",
};

// compact (a canvas under 560 px, i.e. a phone). WHY: fitted into a 358 px canvas the desktop recipe (network-simplex
// placement spreads boxes sideways to straighten edges) came out 955-1271 px wide, zoom 0.27-0.41, package names
// 3-5 px tall (kit check, 2026-11-24). SIMPLE placement packs each row, rows hold perRow (2) boxes, spacing is
// tighter: the tree is 462 px wide and fits a phone at zoom 0.77; the pipeline (its labels take room) ~700 px.
const COMPACT = {
  "elk.layered.nodePlacement.strategy": "SIMPLE",
  "elk.spacing.nodeNode": "14",
  "elk.spacing.edgeNode": "8",
  "elk.spacing.edgeEdge": "6",
  "elk.padding": "[top=10,left=6,bottom=10,right=6]",
};

function sectionPoints(e) {
  const pts = [];
  for (const s of e.sections || []) {
    if (!pts.length) pts.push(s.startPoint);
    for (const b of s.bendPoints || []) pts.push(b);
    pts.push(s.endPoint);
  }
  return pts.map((p) => ({ x: p.x, y: p.y }));
}

// Band order top -> bottom: agents, viewers … vocabulary (LAYER_ORDER is bottom -> top).
function bandKeysOf(graph, members, showAgents) {
  const top = [...layersOf(graph)].reverse();
  return [...(showAgents ? ["agents"] : []), ...top].filter((k) => (members[k] || []).length);
}

// Partition index per node id, one partition per row of a band; rows hold at most perRow boxes. Inside a band the
// boxes that more packages depend on go in the upper row, nearer the bands that point at them.
function partitions(bandKeys, members, perRow, indeg) {
  const partOf = new Map(), bandOf = new Map();
  let part = 0;
  for (const key of bandKeys) {
    const list = [...(members[key] || [])].sort((a, b) => (indeg.get(b) || 0) - (indeg.get(a) || 0));
    const per = key === "agents" ? Math.max(perRow, 4) : perRow;
    for (let i = 0; i < list.length; i += per) {
      for (const n of list.slice(i, i + per)) { partOf.set(n, part); bandOf.set(n, key); }
      part++;
    }
  }
  return { partOf, bandOf };
}

function bandsFrom(nodes, bandKeys, width, compact) {
  const out = [];
  for (const key of bandKeys) {
    const ns = nodes.filter((n) => n.band === key);
    if (!ns.length) continue;
    // compact (phone): no label gutter on the left; the label sits in a strip on top of the band instead.
    const y0 = Math.min(...ns.map((n) => n.y)) - PM.BAND_PAD - (compact ? 18 : 0), y1 = Math.max(...ns.map((n) => n.y + n.h)) + PM.BAND_PAD;
    out.push({
      id: "band:" + key, key, label: key === "agents" ? "agents" : LAYER_LABEL[key] || key,
      blurb: key === "agents" ? "Agents build on packages; a package never imports an agent." : LAYER_BLURB[key] || "",
      count: ns.length, x: 4, y: y0, w: width - 8, h: y1 - y0, labelTop: !!compact,
    });
  }
  return out;
}

async function run(graph, { children, edges, meta, options, grouped, bandKeys, bandOf, groupInfo = {}, compact = false }) {
  const root = { id: "root", layoutOptions: options, children, edges };
  const out = await getElk().layout(root);
  const dx = grouped === "bands" && !compact ? PM.GUTTER : 0; // room on the left for the band labels
  const nodes = [], groups = [];
  const walk = (list) => {
    for (const c of list || []) {
      if (c.id.startsWith("grp:")) {
        const gi = groupInfo[c.id];
        groups.push({ id: c.id, key: gi.layer, label: LAYER_LABEL[gi.layer] || gi.layer, blurb: LAYER_BLURB[gi.layer] || "", count: gi.count, x: c.x + dx, y: c.y, w: c.width, h: c.height });
        walk(c.children);
        continue;
      }
      const isAgent = c.id.startsWith("agent:");
      const key = c.id.replace(/^(pkg|agent):/, "");
      nodes.push({ id: c.id, key, kind: isAgent ? "agent" : "pkg", ref: isAgent ? graph.agents.find((a) => a.id === key) : graph.packages.find((p) => p.id === key),
        x: c.x + dx, y: c.y, w: c.width, h: c.height, band: bandOf?.get(c.id) || null });
    }
  };
  walk(out.children);
  // With INCLUDE_CHILDREN ELK may file an edge under a compound node; collect them from every level.
  const all = [];
  const collect = (n) => { for (const e of n.edges || []) all.push(e); for (const c of n.children || []) collect(c); };
  collect(out);
  const edgesOut = all.map((e) => {
    const l = (e.labels || [])[0];
    return {
      id: e.id, ...meta[e.id], sourceNode: e.sources[0], targetNode: e.targets[0],
      points: sectionPoints(e).map((p) => ({ x: p.x + dx, y: p.y })),
      labelBox: l && l.x != null ? { x: l.x + dx, y: l.y, w: l.width, h: l.height } : null,
    };
  });
  const width = out.width + dx;
  const bands = grouped === "bands" ? bandsFrom(nodes, bandKeys, width, compact) : [];
  // WHY (kit check, 2026-11-25): on a phone (compact) a band's label strip sits 18 px above its first row, so the top
  // band began above y = 0 ("viewers" was drawn under the toolbar) and the bottom band ran past the layout's height.
  // Everything moves down until the topmost box (band, group, node, label) starts at TOP, and the height covers the
  // lowest one. The desktop layouts already start inside ELK's padding: they are left as they are.
  const TOP = 4;
  const boxes = [...bands, ...groups, ...nodes, ...edgesOut.map((e) => e.labelBox).filter(Boolean)];
  const minY = Math.min(...boxes.map((b) => b.y)), maxY = Math.max(...boxes.map((b) => b.y + (b.h ?? 0)));
  const dy = boxes.length && minY < TOP ? TOP - minY : 0;
  if (dy) {
    for (const b of [...bands, ...groups, ...nodes]) b.y += dy;
    for (const e of edgesOut) { e.points = e.points.map((p) => ({ x: p.x, y: p.y + dy })); if (e.labelBox) e.labelBox = { ...e.labelBox, y: e.labelBox.y + dy }; }
  }
  const height = Math.max(out.height + dy, boxes.length ? maxY + dy + TOP : 0);
  return { nodes, edges: edgesOut, groups, bands, width, height };
}

// ---- tree: package deps (pyproject), dependants above their dependencies -------------------------------------------
// opts: { groupByLayer = true, deps = true, agents = false, perRow = 4, compact = false (phone: band labels on top), elkOptions }
export async function layoutTree(graph, { groupByLayer = true, deps = true, agents = false, perRow = 4, compact = false, elkOptions = {} } = {}) {
  const { NODE_W, NODE_H, AGENT_W } = PM;
  const showAgents = agents && (graph.agents || []).length > 0;
  const ids = new Set(graph.packages.map((p) => p.id));
  const members = {};
  for (const p of graph.packages) (members[p.layer] ||= []).push("pkg:" + p.id);
  if (showAgents) members.agents = graph.agents.map((a) => "agent:" + a.id);
  const bandKeys = bandKeysOf(graph, members, showAgents);

  const edges = [], meta = {};
  const add = (id, s, t, k) => { edges.push({ id, sources: [s], targets: [t] }); meta[id] = k; };
  if (deps) for (const e of packageEdges(graph)) {
    if (e.known && ids.has(e.target)) add(e.id, "pkg:" + e.source, "pkg:" + e.target, { kind: e.required ? "dep" : "extra", extras: e.extras, source: e.source, target: e.target });
  }
  if (showAgents) for (const a of graph.agents) for (const p of a.builds_on || []) if (ids.has(p)) add(`builds:${a.id}->${p}`, "agent:" + a.id, "pkg:" + p, { kind: "builds", source: a.id, target: p });
  const indeg = new Map();
  for (const e of edges) indeg.set(e.targets[0], (indeg.get(e.targets[0]) || 0) + 1);
  const { partOf, bandOf } = partitions(bandKeys, members, perRow, indeg);

  const children = [];
  for (const key of bandKeys) for (const n of members[key]) {
    children.push({ id: n, width: n.startsWith("agent:") ? AGENT_W : NODE_W, height: NODE_H,
      layoutOptions: groupByLayer ? { "elk.partitioning.partition": String(partOf.get(n)) } : {} });
  }
  const options = {
    ...BASE,
    ...(compact ? COMPACT : {}),
    "elk.layered.spacing.nodeNodeBetweenLayers": groupByLayer ? "60" : "52",
    ...(groupByLayer ? { "elk.partitioning.activate": "true" } : {
      "elk.layered.layering.strategy": "COFFMAN_GRAHAM",
      "elk.layered.layering.coffmanGraham.layerBound": String(compact ? perRow : perRow + 1),
    }),
    ...elkOptions,
  };
  const r = await run(graph, { children, edges, meta, options, grouped: groupByLayer ? "bands" : null, bandKeys, bandOf, compact });
  return { mode: "tree", ...r, isolated: [], hidden: [] };
}

// ---- pipeline: producer -> consumer through the types they publicly produce / consume --------------------------------
// Two names when they fit in maxChars, else the first and "+N". WHY no "(N)" after it: "JointLimits +2 (3)" counted
// the same types twice (kit check, 2026-11-24); the full list is one click away (and in the label's title).
export function pipelineLabel(graph, typeIds, { maxChars = 34 } = {}) {
  const tb = typeById(graph);
  const names = typeIds.map((t) => tb[t]?.name || String(t).split(".").pop());
  const two = names.slice(0, 2).join(", ");
  const text = names.length === 1 ? names[0] : names.length === 2 && two.length <= maxChars ? two : `${names[0]} +${names.length - 1}`;
  return { names, text };
}

// opts: { groupByLayer = false, grouping = "bands" | "boxes", imports = false, deps = false, agents = false,
//         showIsolated = false, perRow = 4, compact = false, elkOptions }
export async function layoutPipeline(graph, { groupByLayer = false, grouping = "bands", imports = false, deps = false, agents = false, showIsolated = false, perRow = 4, compact = false, elkOptions = {} } = {}) {
  const { NODE_W, NODE_H, AGENT_W } = PM;
  // compact labels are set 12 px (not 11) so they still read at the phone's zoom; their boxes are sized to match.
  const LABEL_H = compact ? PM.LABEL_H_COMPACT : PM.LABEL_H, CHAR_W = compact ? PM.CHAR_W_COMPACT : PM.CHAR_W;
  const flow = pipelineEdges(graph, { imports });
  const connected = new Set(flow.flatMap((e) => [e.source, e.target]));
  const allPkgs = graph.packages.filter((p) => p.id !== GLUE);
  // WHY isolated packages leave the canvas by default: a package that shares no public type with another one has no
  // place in a producer -> consumer pipeline; laid out, they formed a row as wide as the pipeline itself. They are
  // returned in `isolated` so the view can list them beside it.
  const isolated = allPkgs.filter((p) => !connected.has(p.id)).map((p) => p.id);
  const pkgs = showIsolated ? allPkgs : allPkgs.filter((p) => connected.has(p.id));
  const ids = new Set(pkgs.map((p) => p.id));
  const showAgents = agents && (graph.agents || []).length > 0;

  const edges = [], meta = {};
  for (const e of flow) {
    const lab = pipelineLabel(graph, e.types, { maxChars: compact ? 22 : 34 });
    edges.push({ id: e.id, sources: ["pkg:" + e.source], targets: ["pkg:" + e.target],
      labels: [{ id: e.id + ":l", text: lab.text, width: Math.ceil(lab.text.length * CHAR_W) + 16, height: LABEL_H, layoutOptions: { "elk.edgeLabels.inline": "true" } }] });
    meta[e.id] = { kind: e.kind, types: e.types, names: lab.names, label: lab.text, source: e.source, target: e.target };
  }
  if (deps) for (const e of packageEdges(graph)) {
    if (!e.known || !ids.has(e.source) || !ids.has(e.target)) continue;
    edges.push({ id: e.id, sources: ["pkg:" + e.source], targets: ["pkg:" + e.target] });
    meta[e.id] = { kind: e.required ? "dep" : "extra", extras: e.extras, source: e.source, target: e.target };
  }
  const agentIds = showAgents ? graph.agents.filter((a) => (a.builds_on || []).some((p) => ids.has(p))).map((a) => a.id) : [];
  for (const aid of agentIds) for (const p of graph.agents.find((a) => a.id === aid).builds_on || []) if (ids.has(p)) {
    const id = `builds:${aid}->${p}`;
    edges.push({ id, sources: ["agent:" + aid], targets: ["pkg:" + p] });
    meta[id] = { kind: "builds", source: aid, target: p };
  }

  const leaf = (p, extra = {}) => ({ id: "pkg:" + p.id, width: NODE_W, height: NODE_H, ...extra });
  const agentNodes = agentIds.map((a) => ({ id: "agent:" + a, width: AGENT_W, height: NODE_H }));
  const options = {
    ...BASE,
    ...(compact ? COMPACT : {}),
    "elk.layered.spacing.nodeNodeBetweenLayers": "38",
    "elk.spacing.edgeLabel": "3",
    "elk.edgeLabels.placement": "CENTER",
    "elk.separateConnectedComponents": "true",
    "elk.spacing.componentComponent": "36",
    ...elkOptions,
  };

  if (groupByLayer && grouping === "boxes") {
    const groupInfo = {}, children = [];
    for (const l of [...LAYER_ORDER, ...layersOf(graph).filter((x) => !LAYER_ORDER.includes(x))].reverse()) {
      const ps = pkgs.filter((p) => p.layer === l);
      if (!ps.length) continue;
      groupInfo["grp:" + l] = { layer: l, count: ps.length };
      children.push({ id: "grp:" + l, layoutOptions: { "elk.padding": "[top=34,left=12,bottom=12,right=12]" }, children: ps.map((p) => leaf(p)) });
    }
    children.push(...agentNodes);
    const r = await run(graph, { children, edges, meta, options: { ...options, "elk.hierarchyHandling": "INCLUDE_CHILDREN" }, grouped: "boxes", groupInfo });
    return { mode: "pipeline", ...r, isolated, hidden: [GLUE] };
  }

  const members = {};
  for (const p of pkgs) (members[p.layer] ||= []).push("pkg:" + p.id);
  if (agentIds.length) members.agents = agentIds.map((a) => "agent:" + a);
  const bandKeys = bandKeysOf(graph, members, agentIds.length > 0);
  const indeg = new Map();
  for (const e of edges) indeg.set(e.targets[0], (indeg.get(e.targets[0]) || 0) + 1);
  const { partOf, bandOf } = partitions(bandKeys, members, perRow, indeg);
  const children = [];
  for (const key of bandKeys) for (const n of members[key]) {
    children.push({ id: n, width: n.startsWith("agent:") ? AGENT_W : NODE_W, height: NODE_H,
      layoutOptions: groupByLayer ? { "elk.partitioning.partition": String(partOf.get(n)) } : {} });
  }
  const r = await run(graph, { children, edges, meta, bandKeys, bandOf, compact, grouped: groupByLayer ? "bands" : null,
    options: { ...options, ...(groupByLayer ? { "elk.partitioning.activate": "true", "elk.layered.spacing.nodeNodeBetweenLayers": "56" } : {}) } });
  return { mode: "pipeline", ...r, isolated, hidden: [GLUE] };
}

export function layoutPackages(graph, mode, opts) {
  return mode === "pipeline" ? layoutPipeline(graph, opts) : layoutTree(graph, opts);
}

// Rounded orthogonal path through ELK's points.
export function roundedPath(points, r = 7) {
  if (!points?.length) return "";
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i], prev = points[i - 1], next = points[i + 1];
    if (!next) { d += ` L${p.x},${p.y}`; break; }
    const l1 = Math.hypot(p.x - prev.x, p.y - prev.y), l2 = Math.hypot(next.x - p.x, next.y - p.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) { d += ` L${p.x},${p.y}`; continue; }
    const ax = p.x - ((p.x - prev.x) / l1) * rr, ay = p.y - ((p.y - prev.y) / l1) * rr;
    const bx = p.x + ((next.x - p.x) / l2) * rr, by = p.y + ((next.y - p.y) / l2) * rr;
    d += ` L${ax},${ay} Q${p.x},${p.y} ${bx},${by}`;
  }
  return d;
}
