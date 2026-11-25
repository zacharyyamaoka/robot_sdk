// V4 "Catalog": every package, type, use and agent becomes a catalog row. Pure derivations over graph.json; nothing
// here names an id, a count or a position (criterion fr5: a regenerated graph.json needs no code change).
import { packageEdges, typeEdges, layersOf, useState_, shortType, LAYER_LABEL } from "@shared/graph.js";

const uniq = (xs) => [...new Set(xs)];
const group = (xs, f) => { const m = {}; for (const x of xs) (m[f(x)] ||= []).push(x); return m; };

export function useKey(u) { return `${u.package}|${u.type}|${u.kind}|${u.symbol}|${u.where}`; }

// Type "used by" bucket: how many distinct packages touch it.
function bucket(n) { return n === 0 ? "unused" : n === 1 ? "1 package" : n <= 3 ? "2-3 packages" : "4+ packages"; }
const BUCKET_ORDER = ["4+ packages", "2-3 packages", "1 package", "unused"];

export function buildModel(graph) {
  const pkgs = graph.packages, agents = graph.agents || [];
  const pkgById = Object.fromEntries(pkgs.map((p) => [p.id, p]));
  const typeById = Object.fromEntries(graph.types.map((t) => [t.id, t]));
  const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));
  const layers = layersOf(graph);
  const depEdges = packageEdges(graph).filter((e) => e.known);
  const tEdges = typeEdges(graph);
  const usesByPkg = group(graph.uses, (u) => u.package);
  const usesByType = group(graph.uses, (u) => u.type);
  const depsOf = (id) => depEdges.filter((e) => e.source === id);
  const dependantsOf = (id) => depEdges.filter((e) => e.target === id);
  const agentsOn = (id) => agents.filter((a) => (a.builds_on || []).includes(id));

  // WHY viewers last: Zach wants viewer packages first-class but they sit on top of the stack (nothing depends on one).
  const layerRank = (p) => (p.role === "viewer" ? 1000 : 0) + layers.indexOf(p.layer);

  const packageRows = pkgs.map((p) => ({
    key: "pkg:" + p.id, kind: "pkg", id: p.id, layer: p.layer, layerLabel: LAYER_LABEL[p.layer] || p.layer, role: p.role,
    one_line: p.one_line, version: p.version, deps: depsOf(p.id).length, usedBy: dependantsOf(p.id).length,
    uses: (usesByPkg[p.id] || []).length, types: uniq((usesByPkg[p.id] || []).map((u) => u.type)).length,
    lint: p.lint, layerRank: layerRank(p), pkg: p,
    text: [p.id, p.pypi, p.layer, p.role, p.one_line].join(" ").toLowerCase(),
  }));

  const typeRows = graph.types.map((t) => {
    const es = tEdges.filter((e) => e.type === t.id);
    const pk = (k) => uniq(es.filter((e) => e.kind === k).map((e) => e.package));
    const users = uniq(es.map((e) => e.package));
    const rows = usesByType[t.id] || [];
    return {
      key: "type:" + t.id, kind: "type", id: t.id, name: t.name, module: t.module, what: t.what,
      producers: pk("produces"), consumers: pk("consumes"), importers: pk("imports"), users,
      uses: rows.length, declared: rows.filter((u) => u.declared).length, bucket: bucket(users.length), type: t,
      text: [t.id, t.what].join(" ").toLowerCase(),
    };
  });

  const seen = new Map();
  const useRows = graph.uses.map((u) => {
    let k = useKey(u); const n = seen.get(k) || 0; seen.set(k, n + 1); if (n) k += "#" + n;
    return {
      key: "use:" + k, kind: "use", id: k, package: u.package, useKind: u.kind, type: u.type, typeName: shortType(u.type),
      symbol: u.symbol, public: u.public ? "public" : "internal", state: useState_(u), where: u.where, use: u,
      text: [u.package, u.type, u.symbol, u.where, u.kind].join(" ").toLowerCase(),
    };
  });

  const agentRows = agents.map((a) => ({
    key: "agent:" + a.id, kind: "agent", id: a.id, name: a.name, objective: a.objective,
    kpi: a.status?.kpi || null, status: a.status?.status || "no status.json", builds_on: a.builds_on || [], agent: a,
    text: [a.name, a.objective, ...(a.builds_on || [])].join(" ").toLowerCase(),
  }));

  // The most-used type: the default focus wherever one is needed (never a hard-coded name).
  const topType = [...typeRows].sort((a, b) => b.uses - a.uses)[0];

  return {
    graph, pkgById, typeById, agentById, layers, depEdges, tEdges, usesByPkg, usesByType, depsOf, dependantsOf, agentsOn,
    packageRows, typeRows, useRows, agentRows, topType, BUCKET_ORDER,
    rowByKey: Object.fromEntries([...packageRows, ...typeRows, ...useRows, ...agentRows].map((r) => [r.key, r])),
  };
}
