// The one selection every V7 lens shows. A selection is a type (JointTrajectory), a package (robot_controllers) or an
// agent, resolved against the version on screen. lensOf() says which packages it touches and how (returns / takes /
// imports / defines), and lensCss() paints that onto the kit's own components (package map, switchboard, health board,
// directory) through their data-testids.
// WHY CSS and not props: the kit's PackageMap, HealthBoard and Directory take no "highlight these" prop, and V2's
// switchboard is imported unchanged; scoped rules keep the kit untouched (listed under KIT ISSUES in the hand-off).
import { resolveType, typeKey, packageEdges, pipelineEdges, GLUE, HEALTH_RANK } from "@kit";

export function resolveSel(graph, key, liveGraph) {
  if (!key || !graph) return null;
  if (graph.packages.some((p) => p.id === key)) return { kind: "package", id: key, key, label: key };
  const a = (graph.agents || []).find((x) => x.id === key);
  if (a) return { kind: "agent", id: key, key, label: a.name };
  const t = resolveType(graph, key);
  if (t) return { kind: "type", id: t.id, key: typeKey(graph, t), label: t.name, type: t };
  // Not in this version: keep it, say so (a type or package can be missing from Latest release).
  if (liveGraph?.packages?.some((p) => p.id === key)) return { kind: "package", id: key, key, label: key, missing: true };
  const lt = liveGraph && resolveType(liveGraph, key);
  if (lt) return { kind: "type", id: lt.id, key, label: lt.name, missing: true };
  return null;
}

// -> { role: { pkgId: "returns" | "takes" | "both" | "imports" | "defines" | "self" | "near" }, pkgs: Set, edges: Set }
export function lensOf(graph, sel) {
  const role = {}, edges = new Set();
  if (!graph || !sel || sel.missing) return { role, pkgs: new Set(), edges, counts: {} };
  if (sel.kind === "type") {
    const k = {};
    for (const u of graph.uses) if (u.type === sel.id) (k[u.package] ||= new Set()).add(u.kind);
    for (const [p, s] of Object.entries(k)) {
      role[p] = s.has("produces") && s.has("consumes") ? "both" : s.has("produces") ? "returns" : s.has("consumes") ? "takes" : "imports";
    }
    if (sel.type?.package && !role[sel.type.package]) role[sel.type.package] = "defines";
    for (const e of pipelineEdges(graph, { imports: true })) if (e.types.includes(sel.id)) edges.add(e.id);
    for (const e of packageEdges(graph)) if (role[e.source] && role[e.target]) edges.add(e.id);
  } else if (sel.kind === "package") {
    role[sel.id] = "self";
    for (const e of packageEdges(graph)) {
      if (e.source === sel.id || e.target === sel.id) { edges.add(e.id); const o = e.source === sel.id ? e.target : e.source; role[o] ||= "near"; }
    }
    for (const e of pipelineEdges(graph, { imports: true })) if (e.source === sel.id || e.target === sel.id) { edges.add(e.id); role[e.source === sel.id ? e.target : e.source] ||= "near"; }
    for (const a of graph.agents || []) if ((a.builds_on || []).includes(sel.id)) edges.add(`builds:${a.id}->${sel.id}`);
  } else if (sel.kind === "agent") {
    const a = (graph.agents || []).find((x) => x.id === sel.id);
    for (const p of a?.builds_on || []) { role[p] = "near"; edges.add(`builds:${sel.id}->${p}`); }
  }
  const counts = {};
  for (const r of Object.values(role)) counts[r] = (counts[r] || 0) + 1;
  return { role, pkgs: new Set(Object.keys(role)), edges, counts };
}

export const ROLE_LABEL = { returns: "returns", takes: "takes", both: "returns · takes", imports: "imports", defines: "defines", self: "selected", near: "linked" };

const q = (s) => String(s).replace(/["\\]/g, "\\$&");

// Scoped CSS for the lens. Scope = the editor area (.v7-ed), so the explorer and panels style themselves in React.
export function lensCss(sel, lens) {
  if (!sel || sel.missing) return "";
  const out = [];
  const S = ".v7-ed";
  // package map (kit PackageMap): dim what the selection does not touch, ring what it does, tag each with its role
  out.push(`${S} .k-pm .k-pm-node{opacity:.3}`);
  out.push(`${S} .k-pm .react-flow__edge{opacity:.14}`);
  out.push(`${S} .k-pm .k-pm-elabel{opacity:.22}`);
  for (const [p, r] of Object.entries(lens.role)) {
    const n = `${S} .k-pm [data-testid="pm-node-${q(p)}"]`;
    out.push(`${n}{opacity:1;outline:3px solid var(--v7-sel);outline-offset:2px}`);
    if (r === "near") out.push(`${n}{outline-style:dashed;outline-width:2px}`);
    out.push(`${n}::before{content:"${ROLE_LABEL[r]}";position:absolute;top:-10px;right:8px;z-index:3;font:600 11px/16px var(--sans);padding:0 7px;border-radius:99px;color:#fff;background:var(--v7-role-${r})}`);
    // V2 switchboard nodes carry sw-node-<col>-<pkg>; a package selection rings its node there too
    if (r === "self") out.push(`${S} .k-types .sw-pkg[data-testid$="-${q(p)}"]{outline:2px solid var(--v7-sel);outline-offset:3px}`);
    // health board rows and directory cards/rows
    out.push(`${S} [data-testid="health-row-${q(p)}"] > *{background:var(--v7-sel-soft)}`);
    out.push(`${S} [data-testid="health-row-${q(p)}"] > th{box-shadow:inset 3px 0 0 var(--v7-sel)}`);
    out.push(`${S} [data-testid="dir-card-${q(p)}"]{outline:2px solid var(--v7-sel);outline-offset:1px}`);
    out.push(`${S} [data-testid="dir-row-${q(p)}"]{background:var(--v7-sel-soft);box-shadow:inset 3px 0 0 var(--v7-sel)}`);
  }
  for (const e of lens.edges) {
    out.push(`${S} .k-pm .react-flow__edge[data-id="${q(e)}"]{opacity:1}`);
    const m = /^(?:flow|imports):(.+)->(.+)$/.exec(e);
    if (m) out.push(`${S} .k-pm [data-testid="pm-elabel-${q(m[1])}-${q(m[2])}"]{opacity:1}`);
  }
  if (sel.kind === "agent") {
    out.push(`${S} [data-testid="agent-${q(sel.id)}"] .agent-card{outline:2px solid var(--v7-sel);outline-offset:2px}`);
    out.push(`${S} [data-testid="dir-agent-${q(sel.id)}"]{outline:2px solid var(--v7-sel);outline-offset:1px}`);
    out.push(`${S} [data-testid="health-row-${q(sel.id)}"] > *{background:var(--v7-sel-soft)}`);
    out.push(`${S} [data-testid="pm-agent-${q(sel.id)}"]{opacity:1;outline:2px solid var(--v7-sel);outline-offset:2px}`);
  }
  return out.join("\n");
}

// ---- Problems: every failing / warning / unknown check, one row each (VS Code's Problems list) ------------------------
export function problemsOf(health) {
  if (!health) return [];
  const checks = health.checks || [];
  const rows = [];
  for (const m of health.members || []) {
    for (const c of checks) {
      const x = m.checks?.[c.id];
      if (!x || !["fail", "warn", "unknown", "running"].includes(x.state)) continue;
      rows.push({ member: m.id, kind: m.kind || "package", memberState: m.state, check: c, state: x.state, detail: x.detail || x.state, url: x.url || null, failures: x.failures || [], c: x });
    }
  }
  return rows;
}
export function problemCounts(rows) {
  const n = { fail: 0, warn: 0, info: 0 };
  for (const r of rows) r.state === "fail" ? n.fail++ : r.state === "warn" ? n.warn++ : n.info++;
  return n;
}
export function groupProblems(rows) {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.member)) m.set(r.member, []); m.get(r.member).push(r); }
  const rank = (s) => HEALTH_RANK[s] ?? 9;
  return [...m].map(([id, list]) => [id, list.sort((a, b) => rank(a.state) - rank(b.state))])
    .sort((a, b) => rank(a[1][0].memberState) - rank(b[1][0].memberState) || (a[1][0].kind === "agent") - (b[1][0].kind === "agent"));
}

// What kind of evidence a check's url points at, for the link text.
export function evidenceLabel(checkId, url) {
  if (!url) return null;
  if (/\/actions\/runs\//.test(url)) return "CI run";
  if (/pypi\.org/.test(url)) return "PyPI";
  if (/robot-sdk\.toml/.test(url)) return "robot-sdk.toml";
  if (/github\.com/.test(url)) return checkId === "upstream" ? "repo" : "GitHub";
  return "evidence";
}
