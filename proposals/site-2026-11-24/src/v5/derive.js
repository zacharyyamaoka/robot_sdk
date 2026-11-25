// V5 "Commit Dashboard": health numbers derived from graph.json + pick_and_place.json. Nothing here is hard-coded to an
// id or a count; a regenerated graph.json changes every number on the page with no code change (criterion fr5).
import { layersOf, packageEdges, typeEdges, useState_, stats } from "@shared/graph.js";

// Coverage of a list of use rows: declared+verified ("verified"), found in code but not declared ("found"),
// declared but not found by the scanner ("missing", a lint failure).
export function coverage(rows) {
  const c = { total: rows.length, verified: 0, found: 0, missing: 0 };
  for (const u of rows) c[useState_(u)]++;
  c.gaps = c.found + c.missing;
  return c;
}

export function derive(graph) {
  const layers = layersOf(graph);
  const layerIdx = Object.fromEntries(layers.map((l, i) => [l, i]));
  const pkgIdx = Object.fromEntries(graph.packages.map((p) => [p.id, p]));
  const deps = packageEdges(graph);
  const tEdges = typeEdges(graph);
  const usesByPkg = {}, usesByType = {};
  for (const p of graph.packages) usesByPkg[p.id] = [];
  for (const t of graph.types) usesByType[t.id] = [];
  for (const u of graph.uses) {
    (usesByPkg[u.package] ||= []).push(u);
    (usesByType[u.type] ||= []).push(u);
  }
  const pkgCov = Object.fromEntries(Object.entries(usesByPkg).map(([k, v]) => [k, coverage(v)]));
  const typeCov = Object.fromEntries(Object.entries(usesByType).map(([k, v]) => [k, coverage(v)]));
  const typesByUse = [...graph.types].sort((a, b) => (usesByType[b.id]?.length || 0) - (usesByType[a.id]?.length || 0) || a.name.localeCompare(b.name));
  const dependants = {};
  for (const e of deps) (dependants[e.target] ||= []).push(e);
  // Layer rule, measured: every pyproject dependency must point to a lower layer, and nothing may depend on a viewer.
  const ruleBreaks = deps.filter((e) => {
    const s = pkgIdx[e.source], t = pkgIdx[e.target];
    if (!s || !t) return false;
    if (t.role === "viewer") return true;
    return layerIdx[t.layer] >= layerIdx[s.layer];
  });
  const typePkgs = {};
  for (const e of tEdges) (typePkgs[e.type] ||= new Set()).add(e.package);
  return { layers, layerIdx, pkgIdx, deps, tEdges, usesByPkg, usesByType, pkgCov, typeCov, typesByUse, dependants, ruleBreaks, typePkgs, stats: stats(graph), total: coverage(graph.uses) };
}

// The last pick-and-place run, read from its stage results (the stage text is the only place the numbers live).
export function pickSummary(pick) {
  const stages = pick?.stages || [];
  const metrics = stages.find((s) => /metrics/.test(s.package)) || null;
  const diag = stages.find((s) => /diagnostics/.test(s.package)) || null;
  const rms = metrics?.one_line_result.match(/RMS\s+([\d.]+)\s*(mm|m|deg)/i);
  const max = metrics?.one_line_result.match(/max\s+([\d.]+)\s*(mm|m|deg)/i);
  const verdict = diag?.one_line_result.match(/^\s*(PASS|FAIL|WARN|OK|ERROR)\b/i)?.[1]?.toUpperCase() || null;
  const diagDetail = diag ? diag.one_line_result.replace(/^\s*(PASS|FAIL|WARN|OK|ERROR)\s*:?\s*/i, "") : null;
  const check = diag?.call.match(/evaluate\("([^"]+)"/)?.[1] || null;
  return {
    rms: rms ? { value: rms[1], unit: rms[2] } : null,
    max: max ? { value: max[1], unit: max[2] } : null,
    verdict, diagDetail, check,
    simulated: /simulated|mujoco/i.test(pick?.plant || ""),
    date: pick?.run?.date, stages: stages.length,
  };
}

export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
