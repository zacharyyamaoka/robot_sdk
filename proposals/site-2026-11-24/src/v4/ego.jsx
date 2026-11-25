// The row's neighbourhood as a React Flow graph: depth 1 around the selected row, "+" on any neighbour adds its own
// neighbours, "−" folds them away again. WHY a neighbourhood and not a poster: the catalog row is the primary object;
// the graph answers "what touches this?" for the row you are looking at (V4 thesis).
// Layout: dagre left-to-right on the flow of data: producers and dependencies left, consumers, dependants and agents
// right. Every edge comes from packages[].deps, uses[] (one edge per package/type/kind) or agents[].builds_on.
import { useEffect, useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, Handle, Position, useReactFlow, Controls } from "@xyflow/react";
import { PackageNode, TypeNode, AgentNode, edgeStyle, edgeMarker, Legend } from "@shared/parts.jsx";
import { dagreLayout } from "@shared/layout.js";
import { shortType } from "@shared/graph.js";

const SIZE = { pkg: [150, 44], type: [150, 38], agent: [180, 50], more: [180, 30] };
const SLOT = { produces: 1, consumes: 2, imports: 3, dep: 2, extra: 3, builds: 2 };
const DEFAULT_CAP = 10;

// neighbours of one node over the shown edge sets -> [{id, weight, edges}]; edge.from/to = the semantic arrow.
function neighbours(m, id, show) {
  const [kind, key] = id.split(/:(.*)/s);
  const out = new Map();
  const add = (nid, e, w = 1) => { const n = out.get(nid) || { id: nid, weight: 0, edges: [] }; n.weight += w; n.edges.push(e); out.set(nid, n); };
  if (kind === "pkg") {
    if (show.deps) {
      for (const e of m.depsOf(key)) add("pkg:" + e.target, { id: e.id, kind: e.required ? "dep" : "extra", from: id, to: "pkg:" + e.target, flow: ["pkg:" + e.target, id], extras: e.extras }, 3);
      for (const e of m.dependantsOf(key)) add("pkg:" + e.source, { id: e.id, kind: e.required ? "dep" : "extra", from: "pkg:" + e.source, to: id, flow: [id, "pkg:" + e.source], extras: e.extras }, 3);
    }
    if (show.types) for (const e of m.tEdges.filter((x) => x.package === key)) {
      const t = "type:" + e.type;
      add(t, { id: e.id, kind: e.kind, from: e.kind === "produces" ? id : t, to: e.kind === "produces" ? t : id, flow: e.kind === "produces" ? [id, t] : [t, id], rows: e.rows }, e.rows.length);
    }
    if (show.agents) for (const a of m.agentsOn(key)) add("agent:" + a.id, { id: `builds:${a.id}->${key}`, kind: "builds", from: "agent:" + a.id, to: id, flow: [id, "agent:" + a.id] }, 2);
  }
  if (kind === "type" && show.types) for (const e of m.tEdges.filter((x) => x.type === key)) {
    const p = "pkg:" + e.package;
    add(p, { id: e.id, kind: e.kind, from: e.kind === "produces" ? p : id, to: e.kind === "produces" ? id : p, flow: e.kind === "produces" ? [p, id] : [id, p], rows: e.rows }, e.rows.length);
  }
  if (kind === "agent") {
    const a = m.agentById[key];
    for (const p of a?.builds_on || []) add("pkg:" + p, { id: `builds:${key}->${p}`, kind: "builds", from: id, to: "pkg:" + p, flow: ["pkg:" + p, id] }, 2);
  }
  return [...out.values()].filter((n) => exists(m, n.id)).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}
function exists(m, id) {
  const [k, key] = id.split(/:(.*)/s);
  return k === "pkg" ? !!m.pkgById[key] : k === "type" ? !!m.typeById[key] : k === "agent" ? !!m.agentById[key] : false;
}

const SideHandles = () => (<>
  {[1, 2, 3].map((i) => <Handle key={"l" + i} type="target" position={Position.Left} id={"l" + i} isConnectable={false} style={{ top: `${i * 25}%` }} />)}
  {[1, 2, 3].map((i) => <Handle key={"r" + i} type="source" position={Position.Right} id={"r" + i} isConnectable={false} style={{ top: `${i * 25}%` }} />)}
</>);

function EgoNode({ data }) {
  const Inner = { pkg: PackageNode, type: TypeNode, agent: AgentNode }[data.inner];
  return (
    <div className={"ego-node" + (data.isRoot ? " root" : "")} data-testid={`ego-node-${data.nid}`}>
      <SideHandles />
      <Inner data={data.innerData} />
      {!data.isRoot && data.hidden > 0 && !data.expanded && (
        <button className="ego-btn nodrag" title={`show ${data.hidden} more neighbours of ${data.label}`} data-testid={`ego-expand-${data.nid}`}
          onClick={(e) => { e.stopPropagation(); data.onToggle(); }}>+{data.hidden}</button>)}
      {!data.isRoot && data.expanded && (
        <button className="ego-btn on nodrag" title={`fold ${data.label}'s neighbours`} data-testid={`ego-collapse-${data.nid}`}
          onClick={(e) => { e.stopPropagation(); data.onToggle(); }}>−</button>)}
    </div>
  );
}
function MoreNode({ data }) {
  return (
    <div className="ego-more nodrag" data-testid={`ego-more-${data.of}`} onClick={data.onMore} title="show the rest of these neighbours">
      <SideHandles />+{data.count} more of {data.label}
    </div>
  );
}
const nodeTypes = { ego: EgoNode, more: MoreNode };

// WHY focus: after "+", fitting all nodes shrinks labels below reading size; fit the node just expanded and its
// neighbours instead (the rest stays one pan or the fit button away).
function Fit({ sig, focus, onReady }) {
  const rf = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      rf.fitView({ padding: 0.12, maxZoom: 1.15, duration: 0, ...(focus ? { nodes: focus.map((x) => ({ id: x })), minZoom: 0.5 } : {}) });
      onReady?.();
    });
    return () => cancelAnimationFrame(id);
  }, [sig]);
  return null;
}

function Ego({ model, root, hot = [], onOpen, onReady, height = 440 }) {
  const [show, setShow] = useState({ deps: true, types: true, agents: true });
  const [expanded, setExpanded] = useState([root]);
  const [caps, setCaps] = useState({});
  const [hoverEdge, setHoverEdge] = useState(null);
  const [last, setLast] = useState(null);
  const hotSet = new Set(hot);

  const { nodes, edges, focus, counts } = useMemo(() => {
    const visible = new Map([[root, null]]);
    const more = [];
    const edgeMap = new Map();
    const exp = new Set(expanded);
    const queue = [root]; const done = new Set();
    while (queue.length) {
      const id = queue.shift(); if (done.has(id) || !exp.has(id)) continue; done.add(id);
      const nb = neighbours(model, id, show);
      const cap = caps[id] ?? (id === root ? DEFAULT_CAP + 2 : 8);
      for (const n of nb.slice(0, cap)) { if (!visible.has(n.id)) visible.set(n.id, id); for (const e of n.edges) edgeMap.set(e.id, e); if (exp.has(n.id)) queue.push(n.id); }
      // Neighbours already on the canvas for another reason still get their edge to this node.
      for (const n of nb.slice(cap)) if (visible.has(n.id)) for (const e of n.edges) edgeMap.set(e.id, e);
      if (nb.length > cap) more.push({ id: "more:" + id, of: id, count: nb.length - cap });
    }
    const hiddenOf = (id) => neighbours(model, id, show).filter((n) => !visible.has(n.id)).length;
    const label = (id) => { const [k, key] = id.split(/:(.*)/s); return k === "type" ? shortType(key) : k === "agent" ? model.agentById[key]?.name : key; };
    const list = [...visible.keys()].map((id) => {
      const k = id.split(":")[0];
      return { id, k, width: SIZE[k][0], height: SIZE[k][1] };
    });
    for (const mo of more) list.push({ id: mo.id, k: "more", width: SIZE.more[0], height: SIZE.more[1] });
    // Layout edges follow the data flow, one per node pair (produces wins, so a package that both produces and
    // consumes a type sits on the producer side and its consume edge runs back on its own handle slot).
    const pri = { produces: 0, dep: 1, extra: 1, builds: 2, consumes: 3, imports: 4 };
    const layoutPairs = new Map();
    for (const e of [...edgeMap.values()].sort((a, b) => pri[a.kind] - pri[b.kind])) {
      const pair = [e.from, e.to].sort().join("~");
      if (!layoutPairs.has(pair)) layoutPairs.set(pair, { source: e.flow[0], target: e.flow[1] });
    }
    const lay = [...layoutPairs.values()];
    for (const mo of more) lay.push({ source: mo.of, target: mo.id });
    const pos = dagreLayout(list, lay, { rankdir: "LR", nodesep: 10, ranksep: 44 });
    const nodes = list.map((n) => {
      const [k, key] = n.id.split(/:(.*)/s);
      if (k === "more") {
        const mo = more.find((x) => x.id === n.id);
        return { id: n.id, type: "more", position: pos.get(n.id), data: { of: mo.of, count: mo.count, label: label(mo.of), onMore: () => setCaps((c) => ({ ...c, [mo.of]: (c[mo.of] ?? (mo.of === root ? DEFAULT_CAP + 2 : 8)) + 10 })) } };
      }
      const obj = k === "pkg" ? model.pkgById[key] : k === "type" ? model.typeById[key] : model.agentById[key];
      const isExp = exp.has(n.id) && n.id !== root;
      let sub;
      if (k === "pkg") { const ks = [...edgeMap.values()].filter((e) => (e.from === n.id || e.to === n.id) && e.rows).map((e) => e.kind); sub = ks.length ? [...new Set(ks)].join(" + ") : undefined; }
      if (k === "type") sub = obj.module;
      const innerData = { pkg: obj, type: obj, agent: obj, hot: hotSet.has(n.id) || n.id === root, sub, badge: k === "pkg" && obj.role === "viewer" ? "viewer" : null };
      return { id: n.id, type: "ego", position: pos.get(n.id), data: { nid: n.id, inner: k, innerData, isRoot: n.id === root, expanded: isExp, hidden: isExp ? 0 : hiddenOf(n.id), label: label(n.id),
        onToggle: () => { const opening = !exp.has(n.id); setExpanded((x) => (x.includes(n.id) ? x.filter((y) => y !== n.id) : [...x, n.id])); setLast(opening ? n.id : null); } } };
    });
    const xOf = (id) => pos.get(id)?.x ?? 0;
    const edges = [...edgeMap.values()].map((e) => {
      const leftIsFrom = xOf(e.from) <= xOf(e.to);
      const [s, t] = leftIsFrom ? [e.from, e.to] : [e.to, e.from];
      const slot = SLOT[e.kind] || 2;
      const st = e.rows ? (e.rows.some((r) => r.declared && !r.verified) ? "missing" : undefined) : undefined;
      const hotE = hotSet.size > 0 && (hotSet.has(e.from) || e.from === root) && (hotSet.has(e.to) || e.to === root);
      const style = edgeStyle(e.kind, { hot: hotE, state: st });
      const marker = edgeMarker(e.kind);
      let label;
      if (hoverEdge === e.id) {
        const name = (id) => label_(model, id);
        label = e.rows ? `${name(e.kind === "produces" ? e.from : e.to)} ${e.kind} ${name(e.kind === "produces" ? e.to : e.from)} · ${e.rows.length} use${e.rows.length > 1 ? "s" : ""} · ${e.rows.filter((r) => r.declared).length} declared`
          : e.kind === "builds" ? `${name(e.from)} builds on ${name(e.to)}` : `${name(e.from)} requires ${name(e.to)}${e.extras?.length ? ` (extra: ${e.extras.join(", ")})` : ""}`;
      }
      return { id: e.id, source: s, target: t, sourceHandle: "r" + slot, targetHandle: "l" + slot, style, interactionWidth: 14,
        ...(leftIsFrom ? { markerEnd: marker } : { markerStart: marker }), label, labelStyle: { fontSize: 11, fill: "var(--ink)" },
        labelBgStyle: { fill: "var(--card)" }, labelBgPadding: [6, 3], labelBgBorderRadius: 5, zIndex: hoverEdge === e.id ? 10 : 0 };
    });
    for (const mo of more) edges.push({ id: "e:" + mo.id, source: mo.of, target: mo.id, sourceHandle: "r2", targetHandle: "l2", style: { stroke: "var(--line)", strokeDasharray: "2 3" } });
    const focus = last && visible.has(last) ? [last, ...neighbours(model, last, show).map((n) => n.id).filter((x) => visible.has(x)), ...more.filter((mo) => mo.of === last).map((mo) => mo.id)] : null;
    return { nodes, edges, focus, counts: { nodes: visible.size, edges: edgeMap.size } };
  }, [model, root, show, expanded, caps, hoverEdge, last, hot.join(",")]);

  const sig = nodes.map((n) => n.id).join(",");
  const kinds = new Set(edges.map((e) => e.id.split(":")[0]));
  return (
    <div className="ego">
      <div className="ego-bar">
        <span className="muted small">show</span>
        {[["deps", "deps"], ["types", "type uses"], ["agents", "agents"]].map(([k, l]) => (
          <button key={k} className={"btn sm" + (show[k] ? " on" : "")} aria-pressed={show[k]} data-testid={`ego-show-${k}`}
            onClick={() => setShow({ ...show, [k]: !show[k] })}>{l}</button>))}
        <span className="muted small ego-count">{counts.nodes} nodes · {counts.edges} edges</span>
        {expanded.length > 1 && <button className="linkish small" onClick={() => { setExpanded([root]); setLast(null); }} data-testid="ego-reset">fold all</button>}
      </div>
      <div className="ego-canvas" style={{ height }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false}
          elementsSelectable={false} proOptions={{ hideAttribution: true }} minZoom={0.2} maxZoom={2} fitView
          onNodeClick={(_, n) => n.type === "ego" && n.id !== root && onOpen?.(n.id)}
          onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)} onEdgeMouseLeave={() => setHoverEdge(null)}>
          <Controls showInteractive={false} position="bottom-right" />
          <Fit sig={sig} focus={focus} onReady={onReady} />
        </ReactFlow>
        {nodes.length === 1 && <div className="ego-empty muted small">No edges of the shown kinds.</div>}
      </div>
      <div className="ego-foot">
        <Legend items={["produces", "consumes", "imports", ...(kinds.has("dep") ? ["dep", "extra"] : []), ...(kinds.has("builds") ? ["builds"] : [])]} />
        <span className="muted small">Click a node to open its row · + adds its neighbours · hover an edge for its count</span>
      </div>
    </div>
  );
}
function label_(m, id) { const [k, key] = id.split(/:(.*)/s); return k === "type" ? shortType(key) : k === "agent" ? m.agentById[key]?.name : key; }

export function EgoGraph(props) {
  // key on root: a new row starts a fresh neighbourhood (expansions belong to the row that made them).
  return <ReactFlowProvider key={props.root}><Ego {...props} /></ReactFlowProvider>;
}
