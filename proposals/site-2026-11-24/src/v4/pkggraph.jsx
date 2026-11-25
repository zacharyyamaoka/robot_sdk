// The catalog's Graph view of the Packages tab: the whole package dependency graph, layer-grouped (vocabulary at the
// bottom, then each layer above the one it may import, viewers and agents on top), filtered by the same facets as the
// table, each layer collapsible into one node whose edges are rerouted to it.
// Layout: dagre bottom-to-top over the requires edges, plus layout-only edges from every package of a layer to every
// package of the layer below, so each layer gets ranks of its own and its band box never overlaps another. Edges are
// drawn along dagre's own routed points (a custom edge), so a long edge runs between boxes instead of through them.
import { useEffect, useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, Controls, useReactFlow, BaseEdge } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { nodeTypes as sharedTypes, edgeStyle, edgeMarker, Legend } from "@shared/parts.jsx";
import { LAYER_LABEL, LAYER_BLURB } from "@shared/graph.js";

const W = 168, H = 48, PADX = 16, PADTOP = 30, PADBOT = 12;

function Fit({ sig, onReady }) {
  const rf = useReactFlow();
  useEffect(() => { const id = requestAnimationFrame(() => { rf.fitView({ padding: 0.04, maxZoom: 1.1 }); onReady?.(); }); return () => cancelAnimationFrame(id); }, [sig]);
  return null;
}

// Smooth path through dagre's points (quadratic midpoints).
function RoutedEdge({ id, data, style, markerEnd, label, labelStyle, labelBgStyle }) {
  const p = data.points;
  let d = `M ${p[0].x} ${p[0].y}`;
  if (p.length === 2) d += ` L ${p[1].x} ${p[1].y}`;
  else {
    for (let i = 1; i < p.length - 1; i++) { const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2; d += ` Q ${p[i].x} ${p[i].y} ${i === p.length - 2 ? p[i + 1].x : mx} ${i === p.length - 2 ? p[i + 1].y : my}`; }
  }
  const mid = p[Math.floor(p.length / 2)];
  return <BaseEdge id={id} path={d} style={style} markerEnd={markerEnd} label={label} labelX={mid.x} labelY={mid.y} labelStyle={labelStyle} labelBgStyle={labelBgStyle} interactionWidth={12} />;
}
const edgeTypes = { routed: RoutedEdge };

function Graph({ model, rows, selectedKey, onOpen, onReady }) {
  const [collapsed, setCollapsed] = useState([]);
  const [showAgents, setShowAgents] = useState(true);
  const [hover, setHover] = useState(null);
  const ids = new Set(rows.map((r) => r.id));

  const { nodes, edges, bands } = useMemo(() => {
    // bands in layer order; a viewer is drawn in the viewers band whatever its layer string says
    const layerOf = (p) => (p.role === "viewer" ? "viewers" : p.layer);
    const order = [...model.layers.filter((l) => l !== "viewers"), "viewers"];
    const bands = [];
    for (const l of order) {
      const members = model.graph.packages.filter((p) => layerOf(p) === l && ids.has(p.id)).map((p) => p.id);
      if (members.length) bands.push({ id: "layer:" + l, layer: l, label: LAYER_LABEL[l] || l, members });
    }
    const agents = showAgents ? (model.graph.agents || []).filter((a) => (a.builds_on || []).some((p) => ids.has(p))) : [];
    if (agents.length) bands.push({ id: "layer:agents", layer: "agents", label: "agents", members: agents.map((a) => "agent:" + a.id), agents: true });

    const unitOf = new Map(); // member id -> drawn id (itself, or its collapsed band)
    for (const b of bands) for (const m of b.members) unitOf.set(m, collapsed.includes(b.id) ? b.id : m);
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: "BT", nodesep: 22, ranksep: 58, edgesep: 12, marginx: 10, marginy: 10 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const b of bands) {
      if (collapsed.includes(b.id)) g.setNode(b.id, { width: Math.max(260, Math.min(620, b.members.join(" · ").length * 6.6 + 40)), height: 54 });
      else for (const m of b.members) g.setNode(m, { width: m.startsWith("agent:") ? 190 : W, height: H });
    }
    // real edges (dependency at the bottom: layout source = the dependency)
    const real = new Map();
    const addReal = (from, to, kind, raw) => {
      const s = unitOf.get(from), t = unitOf.get(to);
      if (!s || !t || s === t) return;
      const key = `${s}->${t}`;
      const prev = real.get(key);
      if (prev) { prev.n++; if (kind === "dep") prev.kind = "dep"; prev.raw.push(raw); return; }
      real.set(key, { key, s, t, kind, n: 1, raw: [raw] });
    };
    for (const e of model.depEdges) addReal(e.source, e.target, e.required ? "dep" : "extra", [e.source, e.target]);
    for (const a of agents) for (const p of a.builds_on || []) addReal("agent:" + a.id, p, "builds", ["agent:" + a.id, p]);
    for (const e of real.values()) g.setEdge(e.t, e.s, {}, e.key);
    // layout-only layer edges: every unit of band i+1 above every unit of band i
    const unitsOf = (b) => [...new Set(b.members.map((m) => unitOf.get(m)))];
    for (let i = 0; i + 1 < bands.length; i++) for (const lo of unitsOf(bands[i])) for (const hi of unitsOf(bands[i + 1])) if (!g.hasEdge(lo, hi)) g.setEdge(lo, hi, { weight: 0 }, `layer:${lo}->${hi}`);
    dagre.layout(g);

    const nodes = [], groups = [];
    for (const b of bands) {
      const isCol = collapsed.includes(b.id);
      const toggle = () => setCollapsed((c) => (c.includes(b.id) ? c.filter((x) => x !== b.id) : [...c, b.id]));
      const names = b.members.map((m) => (m.startsWith("agent:") ? model.agentById[m.slice(6)]?.name : m));
      const blurb = b.agents ? "build on packages; never imported" : (LAYER_BLURB[b.layer] || "").split(".")[0];
      if (isCol) {
        const n = g.node(b.id);
        groups.push({ id: b.id, type: "group", position: { x: n.x - n.width / 2, y: n.y - n.height / 2 }, style: { width: n.width, height: n.height }, draggable: false,
          data: { label: b.label, count: b.members.length, collapsed: true, members: names, onToggle: toggle } });
        continue;
      }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const m of b.members) {
        const n = g.node(m); const pos = { x: n.x - n.width / 2, y: n.y - n.height / 2 };
        x0 = Math.min(x0, pos.x); x1 = Math.max(x1, pos.x + n.width); y0 = Math.min(y0, pos.y); y1 = Math.max(y1, pos.y + n.height);
        if (m.startsWith("agent:")) nodes.push({ id: m, type: "agent", position: pos, data: { agent: model.agentById[m.slice(6)], dim: hover && !touches(hover, m) } });
        else { const pkg = model.pkgById[m]; nodes.push({ id: m, type: "pkg", position: pos, data: { pkg, hot: "pkg:" + m === selectedKey, dim: hover && !touches(hover, m), badge: pkg.role === "viewer" ? "viewer" : null, sub: `${LAYER_LABEL[pkg.layer] || pkg.layer} · v${pkg.version}` } }); }
      }
      const minW = Math.max(x1 - x0 + 2 * PADX, b.label.length * 8 + 130);
      const cx = (x0 + x1) / 2;
      groups.push({ id: b.id, type: "group", position: { x: cx - minW / 2, y: y0 - PADTOP }, style: { width: minW, height: y1 - y0 + PADTOP + PADBOT }, draggable: false, selectable: false,
        data: { label: b.label, count: b.members.length, collapsed: false, onToggle: toggle } });
    }
    const edges = [...real.values()].map((e) => {
      const pts = g.edge(e.t, e.s, e.key)?.points || [];
      const on = hover && (e.s === hover || e.t === hover || e.raw.some((r) => r.includes(hover)));
      // dagre ran dependency -> dependant; draw dependant -> dependency so the arrow lands on what is required
      return { id: e.key, source: e.s, target: e.t, type: "routed", data: { points: [...pts].reverse() }, style: edgeStyle(e.kind, { dim: hover && !on, hot: on }),
        markerEnd: edgeMarker(e.kind), label: e.n > 1 ? `${e.n} edges` : undefined, labelStyle: { fontSize: 11 }, labelBgStyle: { fill: "var(--card)" } };
    });
    return { nodes: [...groups, ...nodes], edges, bands };

    function touches(h, id) {
      if (h === id) return true;
      return [...real.values()].some((e) => e.raw.some(([a, b]) => (a === h && b === id) || (b === h && a === id)));
    }
  }, [model, rows, collapsed, showAgents, hover, selectedKey]);

  const allBands = bands.map((b) => b.id);
  return (
    <div className="pkg-graph">
      <div className="ego-bar">
        <span className="muted small">layers</span>
        {bands.map((b) => (
          <button key={b.id} className={"btn sm" + (collapsed.includes(b.id) ? "" : " on")} aria-pressed={!collapsed.includes(b.id)} data-testid={`layer-toggle-${b.layer}`}
            onClick={() => setCollapsed((c) => (c.includes(b.id) ? c.filter((x) => x !== b.id) : [...c, b.id]))}
            title={collapsed.includes(b.id) ? "expand this layer" : "collapse this layer"}>{collapsed.includes(b.id) ? "▸ " : ""}{b.label} <span className="bn">{b.members.length}</span></button>))}
        <button className="linkish small" onClick={() => setCollapsed(collapsed.length ? [] : allBands)} data-testid="layers-all">{collapsed.length ? "expand all" : "collapse all"}</button>
        <span className="sep" />
        <label className="small muted chk"><input type="checkbox" checked={showAgents} onChange={() => setShowAgents(!showAgents)} data-testid="graph-show-agents" /> show agents</label>
      </div>
      <div className="pkg-canvas">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={sharedTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
          proOptions={{ hideAttribution: true }} minZoom={0.2} maxZoom={2} fitView
          onNodeClick={(_, n) => { if (n.type === "pkg") onOpen("pkg:" + n.id); if (n.type === "agent") onOpen(n.id); }}
          onNodeMouseEnter={(_, n) => n.type !== "group" && setHover(n.id)} onNodeMouseLeave={() => setHover(null)}>
          <Controls showInteractive={false} position="bottom-right" />
          <Fit sig={nodes.map((n) => n.id).join(",") + collapsed.join(",")} onReady={onReady} />
        </ReactFlow>
      </div>
      <div className="ego-foot">
        <Legend items={["dep", "extra", "builds"]} />
        <span className="muted small">Arrows point at what a package requires (pyproject; dashed = an optional extra). Hover a package to trace it; click it to open its row.</span>
      </div>
    </div>
  );
}

export function PackageGraph(props) { return <ReactFlowProvider><Graph {...props} /></ReactFlowProvider>; }
