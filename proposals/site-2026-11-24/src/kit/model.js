// Pure derivations the round-2 workspaces share: function signatures, type search, the package pipeline, health
// helpers and the version diff. Everything comes from a robot-sdk-graph/1 document (docs/graph-schema.md) or a
// robot-sdk-health/1 document (docs/site-data-schema.md); nothing here invents a package, type, edge or check.
import { LAYER_ORDER, byId, packageEdges, shortType } from "@shared/graph.js";

export { LAYER_ORDER, LAYER_LABEL, LAYER_BLURB, byId, shortType, packageEdges, typeEdges, layersOf } from "@shared/graph.js";

export const KINDS = ["produces", "consumes", "imports"];
export const GLUE = "robot_msgs"; // the vocabulary every package joins on; hidden in the pipeline (Zach: "its the glue")

export function layerIndex(l) { const i = LAYER_ORDER.indexOf(l); return i < 0 ? 99 : i; }

// Memoise per graph object: graphs are immutable once loaded, so a WeakMap keyed on the document is safe.
function memo(fn) {
  const cache = new WeakMap();
  return (graph) => {
    if (!graph || typeof graph !== "object") return fn(graph);
    if (!cache.has(graph)) cache.set(graph, fn(graph));
    return cache.get(graph);
  };
}

// ---- types -------------------------------------------------------------------------------------------------------
export const typeById = memo((graph) => byId(graph.types));

// "JointTrajectory" in URLs when the short name is unique, else the full id (same rule as round-1 V2's sw-model).
export function typeKey(graph, t) {
  if (!t) return "";
  return graph.types.filter((x) => x.name === t.name).length > 1 ? t.id : t.name;
}
export function resolveType(graph, key) {
  if (!key || !graph) return null;
  return graph.types.find((t) => t.id === key) || graph.types.find((t) => t.name === key)
    || graph.types.find((t) => t.name.toLowerCase() === String(key).toLowerCase()) || null;
}
export const typeCounts = memo((graph) => {
  const out = {};
  for (const t of graph.types) out[t.id] = { produces: 0, consumes: 0, imports: 0, total: 0, pkgs: new Set() };
  for (const u of graph.uses) {
    const c = out[u.type] || (out[u.type] = { produces: 0, consumes: 0, imports: 0, total: 0, pkgs: new Set() });
    c[u.kind] = (c[u.kind] || 0) + 1; c.total++; c.pkgs.add(u.package);
  }
  return out;
});
export const usesOfPackageCounts = memo((graph) => {
  const out = {};
  for (const u of graph.uses) { const c = (out[u.package] ||= { produces: 0, consumes: 0, imports: 0, total: 0 }); c[u.kind] = (c[u.kind] || 0) + 1; c.total++; }
  return out;
});
export function mostUsedType(graph) {
  const c = typeCounts(graph);
  return [...graph.types].sort((a, b) => (c[b.id]?.total || 0) - (c[a.id]?.total || 0) || a.name.localeCompare(b.name))[0] || null;
}

// ---- signatures: one per public symbol, from its use rows ---------------------------------------------------------
// "robot_controllers.core.Controller.tick" -> { module: "robot_controllers.core", name: "Controller.tick" }.
// WHY the first-capital rule: the graph stores dotted paths without saying where the module ends; a class name is the
// first CamelCase segment, and a plain function is the last segment.
export function splitSymbol(symbol) {
  const parts = String(symbol).split(".");
  let i = parts.findIndex((p, j) => j > 0 && /^[A-Z]/.test(p));
  if (i < 0) i = parts.length - 1;
  return { module: parts.slice(0, i).join("."), name: parts.slice(i).join(".") };
}

const lineOf = (where) => { const n = parseInt(String(where || "").split(":")[1], 10); return Number.isFinite(n) ? n : Infinity; };

// signatures(graph) -> [{ id, symbol, package, module, name, inputs:[typeId], outputs:[typeId], imports:[typeId],
//   where, rows, public, declared, verified }]. consumes = inputs (public parameters), produces = outputs (returns).
export const signatures = memo((graph) => {
  const m = new Map();
  for (const u of graph.uses) {
    const id = u.package + "|" + u.symbol;
    let s = m.get(id);
    if (!s) {
      const sp = splitSymbol(u.symbol);
      s = { id, symbol: u.symbol, package: u.package, module: sp.module, name: sp.name, inputs: [], outputs: [], imports: [], rows: [], where: u.where, public: false, declared: true, verified: true };
      m.set(id, s);
    }
    s.rows.push(u);
    const list = u.kind === "consumes" ? s.inputs : u.kind === "produces" ? s.outputs : s.imports;
    if (!list.includes(u.type)) list.push(u.type);
    if (lineOf(u.where) < lineOf(s.where)) s.where = u.where;
    s.public = s.public || !!u.public;
    s.declared = s.declared && !!u.declared;
    s.verified = s.verified && u.verified !== false;
  }
  return [...m.values()];
});

const sigOrder = (graph) => {
  const pk = byId(graph.packages);
  return (a, b) => layerIndex(pk[a.package]?.layer) - layerIndex(pk[b.package]?.layer) || a.package.localeCompare(b.package) || a.name.localeCompare(b.name);
};
// Functions that take the type (it is one of their public parameters) / return it.
export function consumersOf(graph, typeId) { return signatures(graph).filter((s) => s.inputs.includes(typeId)).sort(sigOrder(graph)); }
export function producersOf(graph, typeId) { return signatures(graph).filter((s) => s.outputs.includes(typeId)).sort(sigOrder(graph)); }
export function importersOf(graph, typeId) { return signatures(graph).filter((s) => s.imports.includes(typeId) && !s.inputs.includes(typeId) && !s.outputs.includes(typeId)).sort(sigOrder(graph)); }

// [[pkg, [sig…]], …] in the order given.
export function groupByPackage(sigs) {
  const m = new Map();
  for (const s of sigs) { if (!m.has(s.package)) m.set(s.package, []); m.get(s.package).push(s); }
  return [...m];
}

// "JointTrajectory, JointState → TrackingResult" (plain text, for titles and search results).
export function signatureText(graph, s) {
  const t = typeById(graph);
  const nm = (id) => t[id]?.name || shortType(id);
  return `${s.inputs.map(nm).join(", ")} → ${s.outputs.length ? s.outputs.map(nm).join(", ") : "·"}`;
}

// ---- type search ------------------------------------------------------------------------------------------------
const ARROW = /\s*(?:->|→|=>)\s*/;

// Types matching a free-text fragment, best first: exact name, then prefix, then substring, then module/description.
export function matchTypes(graph, text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return [];
  const c = typeCounts(graph);
  const score = (t) => {
    const n = t.name.toLowerCase();
    if (n === q || t.id.toLowerCase() === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    if (t.id.toLowerCase().includes(q)) return 3;
    if ((t.what || "").toLowerCase().includes(q)) return 4;
    return 9;
  };
  return graph.types.map((t) => ({ t, s: score(t) })).filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || (c[b.t.id]?.total || 0) - (c[a.t.id]?.total || 0) || a.t.name.localeCompare(b.t.name)).map((x) => x.t);
}
// Arrow queries resolve each side to the exact name when there is one, else to every match.
function sideTypes(graph, text) {
  const all = matchTypes(graph, text);
  const exact = all.filter((t) => t.name.toLowerCase() === text.trim().toLowerCase());
  return exact.length ? exact : all;
}

// typeSearch(graph, "JointTraj")              -> { kind: "types", types: [type…] }
// typeSearch(graph, "JointTrajectory ->")     -> { kind: "flow", from: [type…], to: null, functions: [sig…] } (what takes it)
// typeSearch(graph, "-> JointTrajectory")     -> { kind: "flow", from: null, to: [type…], functions } (where to get one)
// typeSearch(graph, "JointTrajectory -> ServoCommand") -> functions taking A and returning B, plus two-step chains
//   (f: A → X, g: X → B) when no single function does it.
export function typeSearch(graph, query) {
  const q = String(query || "").trim();
  if (!graph || !q) return { kind: "empty", query: q, types: [], functions: [], chains: [] };
  if (!ARROW.test(q)) return { kind: "types", query: q, types: matchTypes(graph, q), functions: [], chains: [] };
  const [l, r] = q.split(ARROW);
  const from = l.trim() ? sideTypes(graph, l) : null;
  const to = (r || "").trim() ? sideTypes(graph, r) : null;
  const fromIds = from && new Set(from.map((t) => t.id)), toIds = to && new Set(to.map((t) => t.id));
  const sigs = signatures(graph);
  const functions = sigs.filter((s) => (!fromIds || s.inputs.some((t) => fromIds.has(t))) && (!toIds || s.outputs.some((t) => toIds.has(t))))
    .filter(() => fromIds || toIds).sort(sigOrder(graph));
  let chains = [];
  if (fromIds && toIds && functions.length === 0) {
    const firsts = sigs.filter((s) => s.inputs.some((t) => fromIds.has(t)));
    for (const f of firsts) for (const mid of f.outputs) {
      if (fromIds.has(mid)) continue;
      for (const g of sigs) if (g !== f && g.inputs.includes(mid) && g.outputs.some((t) => toIds.has(t))) chains.push({ first: f, via: mid, second: g });
      if (chains.length > 40) break;
    }
    chains = chains.slice(0, 40);
  }
  return { kind: "flow", query: q, types: [], from, to, functions, chains, unresolved: (l.trim() && !from?.length) || ((r || "").trim() && !to?.length) };
}

// ---- the package pipeline: producer -> consumer through the types they publicly produce / consume ---------------------
// One edge per (producer, consumer) pair, labelled with the types it carries. The glue package (robot_msgs) is never a
// node. imports: true adds dashed edges producer -> package that only imports the type (not on its public API).
export function pipelineEdges(graph, { imports = false, hide = [GLUE] } = {}) {
  const hidden = new Set(hide);
  const prod = new Map(), cons = new Map(), imp = new Map();
  const add = (m, t, p) => { if (!m.has(t)) m.set(t, new Set()); m.get(t).add(p); };
  for (const u of graph.uses) {
    if (hidden.has(u.package)) continue;
    if (u.kind === "produces") add(prod, u.type, u.package);
    else if (u.kind === "consumes") add(cons, u.type, u.package);
    else if (u.kind === "imports") add(imp, u.type, u.package);
  }
  const edges = new Map();
  const put = (kind, a, b, t) => {
    const id = `${kind}:${a}->${b}`;
    if (!edges.has(id)) edges.set(id, { id, kind, source: a, target: b, types: [] });
    const e = edges.get(id);
    if (!e.types.includes(t)) e.types.push(t);
  };
  for (const [t, ps] of prod) {
    for (const a of ps) {
      for (const b of cons.get(t) || []) if (a !== b) put("flow", a, b, t);
      if (imports) for (const b of imp.get(t) || []) if (a !== b && !(cons.get(t) || new Set()).has(b)) put("imports", a, b, t);
    }
  }
  const tb = typeById(graph);
  const out = [...edges.values()];
  for (const e of out) e.types.sort((x, y) => (tb[x]?.name || x).localeCompare(tb[y]?.name || y));
  return out;
}

// ---- health (robot-sdk-health/1) --------------------------------------------------------------------------------
export const HEALTH_STATES = ["fail", "warn", "running", "unknown", "pass", "none"];
export const HEALTH_RANK = Object.fromEntries(HEALTH_STATES.map((s, i) => [s, i]));
export const HEALTH_LABEL = { fail: "failing", warn: "warning", running: "running", unknown: "unknown", pass: "passing", none: "n/a" };

export function healthOf(health, id) {
  if (!health || !id) return null;
  return (health.members || []).find((m) => m.id === id) || null;
}
export function healthState(health, id) { return healthOf(health, id)?.state || null; }

// Members sorted failing first (fail > warn > running > unknown > pass > none), graph order inside a state.
export function sortedMembers(health) {
  const ms = health?.members || [];
  return ms.map((m, i) => ({ m, i })).sort((a, b) => (HEALTH_RANK[a.m.state] ?? 9) - (HEALTH_RANK[b.m.state] ?? 9) || a.i - b.i).map((x) => x.m);
}
// The summary health.json carries, or one recomputed from members when it is missing.
export function healthSummary(health) {
  if (!health) return null;
  if (health.summary) return health.summary;
  const s = { pass: 0, warn: 0, fail: 0, unknown: 0 };
  for (const m of health.members || []) s[m.state] = (s[m.state] || 0) + 1;
  return s;
}
// "4 failing · 3 warnings · 9 passing" (zero parts dropped, failing first).
export function healthText(summary) {
  if (!summary) return "health not recorded";
  const parts = [];
  if (summary.fail) parts.push(`${summary.fail} failing`);
  if (summary.warn) parts.push(`${summary.warn} warning${summary.warn === 1 ? "" : "s"}`);
  if (summary.running) parts.push(`${summary.running} running`);
  if (summary.pass) parts.push(`${summary.pass} passing`);
  if (summary.unknown) parts.push(`${summary.unknown} unknown`);
  return parts.join(" · ") || "no members";
}

// ---- versions ---------------------------------------------------------------------------------------------------
const useKey = (u) => `${u.package}|${u.type}|${u.kind}|${u.symbol}`;

// How `other` differs from `live` (added = only in other, removed = only in live). Counts drive the banner.
export function diffGraphs(live, other) {
  if (!live || !other || live === other) return null;
  const setDiff = (a, b, key) => { const kb = new Set(b.map(key)); return a.filter((x) => !kb.has(key(x))); };
  const pa = byId(live.packages), pb = byId(other.packages);
  const changed = other.packages.filter((p) => pa[p.id] && pa[p.id].version !== p.version).map((p) => ({ id: p.id, live: pa[p.id].version, here: p.version }));
  const lintChanged = other.packages.filter((p) => pa[p.id] && pa[p.id].lint !== p.lint).map((p) => ({ id: p.id, live: pa[p.id].lint, here: p.lint }));
  const d = {
    packages: { added: setDiff(other.packages, live.packages, (p) => p.id).map((p) => p.id), removed: setDiff(live.packages, other.packages, (p) => p.id).map((p) => p.id), changed, lintChanged },
    types: { added: setDiff(other.types, live.types, (t) => t.id).map((t) => t.id), removed: setDiff(live.types, other.types, (t) => t.id).map((t) => t.id) },
    uses: { added: setDiff(other.uses, live.uses, useKey), removed: setDiff(live.uses, other.uses, useKey) },
    agents: { added: setDiff(other.agents || [], live.agents || [], (a) => a.id).map((a) => a.id), removed: setDiff(live.agents || [], other.agents || [], (a) => a.id).map((a) => a.id) },
    counts: {
      packages: [live.packages.length, other.packages.length], types: [live.types.length, other.types.length],
      uses: [live.uses.length, other.uses.length], agents: [(live.agents || []).length, (other.agents || []).length],
      deps: [packageEdges(live).length, packageEdges(other).length],
    },
  };
  void pb;
  d.same = !d.packages.added.length && !d.packages.removed.length && !changed.length && !d.types.added.length && !d.types.removed.length
    && !d.uses.added.length && !d.uses.removed.length && !d.agents.added.length && !d.agents.removed.length;
  return d;
}

// One line for the banner: "10 packages not in this version · 2 at another version · 136 fewer type uses".
export function diffText(d) {
  if (!d) return "";
  if (d.same) return "same packages, types and uses as Live";
  const parts = [];
  const n = (k, one, many = one + "s") => `${k} ${k === 1 ? one : many}`;
  if (d.packages.removed.length) parts.push(`${n(d.packages.removed.length, "package")} not in this version`);
  if (d.packages.added.length) parts.push(`${n(d.packages.added.length, "package")} only here`);
  if (d.packages.changed.length) parts.push(`${n(d.packages.changed.length, "package")} at another version`);
  const dt = d.counts.types[1] - d.counts.types[0];
  if (d.types.added.length || d.types.removed.length) parts.push(dt === 0 ? `${d.types.added.length} types swapped` : `${Math.abs(dt)} ${dt < 0 ? "fewer" : "more"} types`);
  const du = d.counts.uses[1] - d.counts.uses[0];
  if (d.uses.added.length || d.uses.removed.length) parts.push(du === 0 ? `${d.uses.added.length} type uses changed` : `${Math.abs(du)} ${du < 0 ? "fewer" : "more"} type uses`);
  return parts.join(" · ");
}

// The git ref a file:line from this graph should link to: main for Live; a release's tag; a snapshot's sha (its ref is
// "main", which has moved on since, so its line numbers would drift).
export function refFor(version, graph, pkgId) {
  if (!version || version.kind === "live") return "main";
  const p = version.packages?.[pkgId];
  const clean = (x) => (x && !/dirty/.test(x) ? x : null);
  if (p?.ref && p.ref !== "main") return p.ref;
  if (clean(p?.sha)) return p.sha;
  const src = graph?.sources?.[pkgId];
  if (src && !/dirty/.test(src)) return src;
  return "main";
}
export function sourceUrlAt(graph, pkgId, where, ref = "main") {
  const p = graph?.packages?.find((x) => x.id === pkgId);
  if (!p?.repo_url || !where) return null;
  const [path, lines] = String(where).split(":");
  let anchor = "";
  if (lines) { const [a, b] = lines.split("-"); anchor = `#L${a}` + (b ? `-L${b}` : ""); }
  return `${p.repo_url}/blob/${ref}/${path}${anchor}`;
}

export function fmtShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
