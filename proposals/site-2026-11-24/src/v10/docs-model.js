// V10 "Docs": the site as versioned docs. Every package, type and agent is a page with a stable URL; the directory is
// the docs sidebar. This file derives the sidebar tree and the page order (for Previous / Next) from the version's
// graph, so a version's sidebar holds exactly that version's pages (Docusaurus: each docs version has its own sidebar).
// Nothing here invents a page: every entry is a graph.json package, type or agent, or one of the site's workspaces.
import { LAYER_LABEL, layersOf, typeCounts, healthOf } from "@kit";

// The navbar's workspaces (gates look for data-ws="<id>"). Labels follow the brief: Types · Packages · Directory ·
// Health · Agents · Run · For coding agents.
export const NAV = [
  { id: "types", label: "Types" },
  { id: "packages", label: "Packages" },
  { id: "directory", label: "Directory" },
  { id: "health", label: "Health" },
  { id: "agents", label: "Agents" },
  { id: "run", label: "Run" },
  { id: "skill", label: "For coding agents" },
];

export const PAGE_LABEL = {
  overview: "Overview", types: "Types", packages: "Packages", directory: "Directory", health: "Health",
  agents: "Agents", run: "Pick and place run", skill: "For coding agents",
};

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const layerTitle = (l) => cap(LAYER_LABEL[l] || l);

// Types grouped by module, modules in name order, types by use count (most used first), like round-1 V2's rail.
export function typesByModule(graph) {
  const c = typeCounts(graph);
  const m = new Map();
  for (const t of graph.types) { if (!m.has(t.module)) m.set(t.module, []); m.get(t.module).push(t); }
  for (const list of m.values()) list.sort((a, b) => (c[b.id]?.total || 0) - (c[a.id]?.total || 0) || a.name.localeCompare(b.name));
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}

// The sidebar: [{ kind: "link" | "cat", key, ws, arg, label, items, mono, count, state }]. key = "<ws>/<arg>" for
// pages; categories with a ws are also links (Docusaurus' category index page).
export function sidebarTree(graph, health) {
  const c = typeCounts(graph);
  const pkgItem = (p) => ({ kind: "link", key: "packages/" + p.id, ws: "packages", arg: p.id, label: p.id, mono: true,
    state: health ? healthOf(health, p.id)?.state || "unknown" : null, viewer: p.role === "viewer" });
  return [
    { kind: "link", key: "overview/", ws: "overview", label: "Overview" },
    { kind: "cat", key: "packages/", id: "cat-packages", ws: "packages", label: "Packages", count: graph.packages.length,
      items: layersOf(graph).map((l) => ({ kind: "cat", key: "layer/" + l, id: "cat-layer-" + l, label: layerTitle(l),
        items: graph.packages.filter((p) => p.layer === l).map(pkgItem) })) },
    { kind: "cat", key: "types/", id: "cat-types", ws: "types", label: "Types", count: graph.types.length,
      items: typesByModule(graph).map(([mod, list]) => ({ kind: "cat", key: "module/" + mod, id: "cat-mod-" + mod, label: mod, mono: true,
        items: list.map((t) => ({ kind: "link", key: "types/" + typeKeyOf(graph, t), ws: "types", arg: typeKeyOf(graph, t), label: t.name, mono: true, count: c[t.id]?.total || 0 })) })) },
    { kind: "link", key: "directory/", ws: "directory", label: "Directory" },
    { kind: "link", key: "health/", ws: "health", label: "Health", health: true },
    { kind: "cat", key: "agents/", id: "cat-agents", ws: "agents", label: "Agents", count: (graph.agents || []).length,
      items: (graph.agents || []).map((a) => ({ kind: "link", key: "agents/" + a.id, ws: "agents", arg: a.id, label: a.name,
        state: health ? healthOf(health, a.id)?.state || null : null })) },
    { kind: "link", key: "run/", ws: "run", label: "Pick and place run" },
    { kind: "link", key: "skill/", ws: "skill", label: "For coding agents" },
  ];
}

// "JointTrajectory" when the short name is unique in this graph, else the full id (the kit's typeKey rule).
export function typeKeyOf(graph, t) {
  return graph.types.filter((x) => x.name === t.name).length > 1 ? t.id : t.name;
}

// Every page in sidebar order (pre-order: a category's own page before its children), for Previous / Next.
export function pageOrder(tree) {
  const out = [];
  const walk = (items) => {
    for (const it of items) {
      if (it.ws) out.push({ key: it.key, ws: it.ws, arg: it.arg ?? null, label: it.kind === "cat" && it.ws ? PAGE_LABEL[it.ws] || it.label : it.label });
      if (it.items) walk(it.items);
    }
  };
  walk(tree);
  return out;
}

// The category keys that must be open for `key` to show (its ancestors).
export function ancestorsOf(tree, key) {
  const path = [];
  const walk = (items, trail) => {
    for (const it of items) {
      if (it.key === key) { path.push(...trail); return true; }
      if (it.items && walk(it.items, [...trail, it.key])) return true;
    }
    return false;
  };
  walk(tree, []);
  return path;
}
