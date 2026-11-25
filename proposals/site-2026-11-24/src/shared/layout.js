// Automatic layout for the React Flow views. WHY: graph.json is generated and will grow; no variant hand-places a node
// by id (criterion fr5). dagre (layered, Sugiyama) is small enough to ship inside a landing page.
import dagre from "@dagrejs/dagre";

// nodes: [{id, width, height, rank?}], edges: [{source, target}] -> Map(id -> {x, y}) (top-left corners)
// rankdir: "BT" puts sources at the bottom (vocabulary at the bottom, dependants above), "LR" left to right.
export function dagreLayout(nodes, edges, { rankdir = "BT", nodesep = 24, ranksep = 60, align } = {}) {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir, nodesep, ranksep, marginx: 10, marginy: 10, ...(align ? { align } : {}) });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height, ...(n.rank != null ? { rank: n.rank } : {}) });
  let i = 0;
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) g.setEdge(e.source, e.target, { minlen: e.minlen || 1 }, "e" + i++);
  dagre.layout(g);
  return new Map(nodes.map((n) => { const p = g.node(n.id); return [n.id, { x: p.x - n.width / 2, y: p.y - n.height / 2 }]; }));
}

// Rows of fixed-size boxes, centred: for band layouts (types in a row, packages in a layer).
export function rowPositions(ids, { y = 0, width = 168, gap = 20, centerX = 0 } = {}) {
  const total = ids.length * width + Math.max(0, ids.length - 1) * gap;
  const left = centerX - total / 2;
  return new Map(ids.map((id, i) => [id, { x: left + i * (width + gap), y }]));
}

// Wrap a long row into several rows of at most `perRow` boxes (keeps 2x the packages readable).
export function wrappedRows(ids, { y = 0, width = 168, height = 52, gap = 20, rowGap = 16, perRow = 7, centerX = 0 } = {}) {
  const out = new Map();
  for (let r = 0; r * perRow < ids.length; r++) {
    const row = ids.slice(r * perRow, (r + 1) * perRow);
    for (const [id, p] of rowPositions(row, { y: y + r * (height + rowGap), width, gap, centerX })) out.set(id, p);
  }
  return out;
}

// Order items in a row by the barycentre of their neighbours' x (one sweep), to cut crossings in band layouts.
export function barycentreOrder(ids, neighboursOf, xOf) {
  const score = (id) => {
    const xs = neighboursOf(id).map(xOf).filter((x) => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity;
  };
  return [...ids].sort((a, b) => score(a) - score(b));
}
