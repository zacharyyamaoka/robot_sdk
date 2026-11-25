// Pure derivations over a robot-sdk-graph/1 document (docs/graph-schema.md). Nothing here invents a relationship:
// every edge returned comes from packages[].deps, uses[] or agents[].builds_on.

export const LAYER_ORDER = ["vocabulary", "models", "leaf", "comms", "outer", "checks", "viewers"];
export const LAYER_LABEL = {
  vocabulary: "vocabulary", models: "models", leaf: "leaves", comms: "comms", outer: "outer API", checks: "checks", viewers: "viewers",
};
export const LAYER_BLURB = {
  vocabulary: "The standard types every package joins on. Strict semver, additive only.",
  models: "Generic physical models by part type. Imports robot_msgs + numpy only.",
  leaf: "Independent capabilities. Leaves never import each other.",
  comms: "Components, ports and systems over dora.",
  outer: "The one-call API over a whole robot. May import everything below.",
  checks: "Diagnostics: a metric plus a threshold, over metrics and twins.",
  viewers: "Views over robot_msgs data. Nothing depends on a viewer.",
};
export const KIND_LABEL = { consumes: "consumes", produces: "produces", imports: "imports (not public)" };

export function layersOf(graph) {
  const seen = new Set(graph.packages.map((p) => p.layer));
  return [...LAYER_ORDER.filter((l) => seen.has(l)), ...[...seen].filter((l) => !LAYER_ORDER.includes(l))];
}

export function packagesByLayer(graph) {
  const out = {};
  for (const l of layersOf(graph)) out[l] = graph.packages.filter((p) => p.layer === l);
  return out;
}

export function byId(list) { return Object.fromEntries(list.map((x) => [x.id, x])); }

// Package -> package dependency edges from pyproject (robot-sdk packages only). Self-edges (robot_msgs' own extra) dropped.
export function packageEdges(graph) {
  const ids = new Set(graph.packages.map((p) => p.id));
  const out = [];
  for (const p of graph.packages) {
    for (const d of p.deps?.required || []) if (d !== p.id) out.push({ id: `dep:${p.id}->${d}`, source: p.id, target: d, required: true, extras: [], known: ids.has(d) });
    for (const [extra, list] of Object.entries(p.deps?.extras || {})) {
      for (const d of list) {
        if (d === p.id) continue;
        const prev = out.find((e) => e.source === p.id && e.target === d);
        if (prev) { if (!prev.required) prev.extras.push(extra); continue; }
        out.push({ id: `dep:${p.id}->${d}`, source: p.id, target: d, required: false, extras: [extra], known: ids.has(d) });
      }
    }
  }
  return out;
}

// One edge per (package, type, kind), carrying every row (symbol, where, public, declared, verified) behind it.
export function typeEdges(graph) {
  const map = new Map();
  for (const u of graph.uses) {
    const key = `${u.package}|${u.type}|${u.kind}`;
    if (!map.has(key)) map.set(key, { id: `use:${key}`, package: u.package, type: u.type, kind: u.kind, rows: [] });
    map.get(key).rows.push(u);
  }
  return [...map.values()].map((e) => ({
    ...e,
    public: e.rows.some((r) => r.public),
    declared: e.rows.every((r) => r.declared),
    anyDeclared: e.rows.some((r) => r.declared),
    verified: e.rows.every((r) => r.verified),
  }));
}

export function usesOfType(graph, typeId) { return graph.uses.filter((u) => u.type === typeId); }
export function usesOfPackage(graph, pkgId) { return graph.uses.filter((u) => u.package === pkgId); }

// Lint state of one use row: "verified" (declared and found), "found" (found in code, not declared yet),
// "missing" (declared but not found: a lint failure).
export function useState_(u) {
  if (u.declared && u.verified) return "verified";
  if (u.declared && !u.verified) return "missing";
  return "found";
}
export const USE_STATE_LABEL = { verified: "declared + verified", found: "found in code, not declared", missing: "declared, not found (lint fail)" };

export function stats(graph) {
  const uses = graph.uses;
  const lint = { pass: 0, fail: 0, undeclared: 0 };
  for (const p of graph.packages) lint[p.lint] = (lint[p.lint] || 0) + 1;
  return {
    packages: graph.packages.length,
    libraries: graph.packages.filter((p) => p.role !== "viewer").length,
    viewers: graph.packages.filter((p) => p.role === "viewer").length,
    types: graph.types.length,
    typesUsed: new Set(uses.map((u) => u.type)).size,
    uses: uses.length,
    public: uses.filter((u) => u.public).length,
    declared: uses.filter((u) => u.declared).length,
    verified: uses.filter((u) => u.verified).length,
    lintFailures: uses.filter((u) => u.declared && !u.verified).length,
    lint,
    agents: (graph.agents || []).length,
    depEdges: packageEdges(graph).length,
  };
}

// "src/x.py:31-33" -> GitHub blob URL with line anchors; "README.md:23" too.
export function sourceUrl(graph, pkgId, where) {
  const p = graph.packages.find((x) => x.id === pkgId);
  if (!p?.repo_url || !where) return null;
  const [path, lines] = where.split(":");
  let anchor = "";
  if (lines) { const [a, b] = lines.split("-"); anchor = `#L${a}` + (b ? `-L${b}` : ""); }
  return `${p.repo_url}/blob/main/${path}${anchor}`;
}

export function shortType(id) { return String(id).split(".").pop(); }

export function provenance(graph) {
  const src = graph.sources || {};
  const seed = typeof src.seed === "string";
  const shas = Object.entries(src).filter(([k]) => k !== "seed");
  return { generated: graph.generated, seed, seedNote: seed ? src.seed : null, shas, schema: graph.schema };
}

export function fmtDate(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Agent status.json (ai-team-status/1) helpers.
export function agentKpi(agent) {
  const k = agent.status?.kpi;
  if (!k) return null;
  const v = typeof k.value === "number" ? (Math.abs(k.value) < 1 ? k.value.toFixed(3) : k.value.toFixed(1)) : String(k.value);
  return { ...k, display: `${v} ${k.unit || ""}`.trim() };
}

// Neighbourhood of a node id ("pkg:x" | "type:y" | "agent:z") over all three edge sets, for focus/dimming.
export function neighbourhood(graph, id) {
  const set = new Set([id]);
  const [kind, key] = id.split(/:(.*)/s);
  if (kind === "type") for (const e of typeEdges(graph)) { if (e.type === key) set.add("pkg:" + e.package); }
  if (kind === "pkg") {
    for (const e of typeEdges(graph)) if (e.package === key) set.add("type:" + e.type);
    for (const e of packageEdges(graph)) { if (e.source === key) set.add("pkg:" + e.target); if (e.target === key) set.add("pkg:" + e.source); }
    for (const a of graph.agents || []) if ((a.builds_on || []).includes(key)) set.add("agent:" + a.id);
    for (const t of graph.types) if (t.package === key) set.add("type:" + t.id);
  }
  if (kind === "agent") { const a = (graph.agents || []).find((x) => x.id === key); for (const p of a?.builds_on || []) set.add("pkg:" + p); }
  return set;
}

// Directory links (hard gate g5, Zach 2026-11-24: robot-sdk is "a directory and entry point" to every tool).
// WHY no per-package URLs here: each package describes itself in its own robot-sdk.toml (`links`, additive in
// graph.json); the hub only aggregates. Fallbacks come from fields every package already has.
export function packageLinks(pkg) {
  const l = pkg?.links || {};
  const github = l.github || pkg?.repo_url || null;
  return {
    github,
    site: l.site || null,
    pypi: l.pypi || (pkg?.pypi ? `https://pypi.org/project/${pkg.pypi}/` : null),
    readme: l.readme || (github ? `${github}#readme` : null),
    docs: l.docs && l.docs !== l.site ? l.docs : null,
  };
}
export function agentLinks(agent) {
  const l = agent?.links || {};
  const github = l.github || agent?.repo_url || agent?.status?.links?.repo || null;
  return { github, site: l.site || null, pypi: null, readme: github ? `${github}#readme` : null, docs: l.docs || null };
}
