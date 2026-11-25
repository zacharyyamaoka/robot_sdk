// Packages tab: the package dependency graph in layer bands (vocabulary at the bottom, viewers and agents on top), each
// band collapsible to one node; the right panel walks a package back to the types it produces / consumes.
import { useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position } from "@xyflow/react";
import { byId, layersOf, packageEdges, usesOfPackage, neighbourhood, LAYER_LABEL, LAYER_BLURB, stats } from "@shared/graph.js";
import { nodeTypes as kitNodes, edgeStyle, edgeMarker, Legend, PkgLinks } from "@shared/parts.jsx";
import { dagreLayout, wrappedRows } from "@shared/layout.js";
import { KINDS, typeKey } from "./sw-model.js";
import { markReady, FitOnChange, useNarrow } from "./util.js";

// WHY a local band node (not the kit's GroupNode, not React Flow's built-in "group" type): the label sits in a left
// gutter so a band is one node-row tall, which keeps 8 bands readable at the hero viewport.
function BandNode({ data }) {
  if (data.collapsed) return (
    <div className="pk-band collapsed" data-testid={`band-${data.band}`} title="click to expand this layer">
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} /><Handle type="source" position={Position.Bottom} id="bs" isConnectable={false} />
      <div className="pk-band-head"><b>{data.label} · {data.count}</b><button className="chip mini nodrag" onClick={(e) => { e.stopPropagation(); data.onToggle(); }}>expand</button></div>
      <div className="pk-band-members">{data.members.join(" · ")}</div>
    </div>);
  return (
    <div className="pk-band" data-testid={`band-${data.band}`} style={{ "--lw": LABEL_W + "px" }}>
      <div className="pk-band-label"><b>{data.label} <span>{data.count}</span></b>
        <button className="chip mini nodrag" onClick={(e) => { e.stopPropagation(); data.onToggle(); }} data-testid={`band-collapse-${data.band}`}>collapse</button></div>
    </div>);
}
const pkNodeTypes = { ...kitNodes, band: BandNode };
const PW = 168, PH = 50, AW = 196, PADY = 10, ROW_GAP = 12, PER_ROW_WIDE = 5, GAP_X = 18, LABEL_W = 104, BAND_GAP = 10, COL_W = 260;

function layout(graph, { collapsed, showAgents, showExtras, narrow }) {
  const PER_ROW = narrow ? 2 : PER_ROW_WIDE;
  const layers = layersOf(graph).slice().reverse(); // top band first
  const bands = [...(showAgents && graph.agents?.length ? ["agents"] : []), ...layers];
  const members = Object.fromEntries(bands.map((b) => [b, b === "agents" ? graph.agents.map((a) => "agent:" + a.id)
    : graph.packages.filter((p) => p.layer === b).map((p) => "pkg:" + p.id)]));
  const deps = packageEdges(graph).filter((e) => e.known && (showExtras || e.required));
  const builds = showAgents ? (graph.agents || []).flatMap((a) => (a.builds_on || []).map((p) => ({ id: `b:${a.id}->${p}`, source: "agent:" + a.id, target: "pkg:" + p }))) : [];
  // x: the widest band is ordered by dagre (fewest crossings) and centred; every other package sits at the mean x of
  // its already-placed neighbours, then steps sideways off any edge that would run straight through it.
  // WHY not raw dagre x: dagre ranks by edges, not by layer, and spread this graph twice as wide as the canvas.
  const all = Object.values(members).flat();
  const wOf = (id) => (id.startsWith("agent:") ? AW : PW);
  const links = [...deps.map((e) => ["pkg:" + e.source, "pkg:" + e.target]), ...builds.map((e) => [e.source, e.target])];
  const pos = dagreLayout(all.map((id) => ({ id, width: wOf(id), height: PH })), links.map(([source, target]) => ({ source, target })), { rankdir: "TB", nodesep: 20 });
  const nb = (id) => links.flatMap(([u, v]) => (u === id ? [v] : v === id ? [u] : []));
  const place = {}; const bandRows = {};
  const centreOf = (id) => place[id] && place[id].x + wOf(id) / 2;
  const bandIdx = Object.fromEntries(bands.map((b, i) => [b, i]));
  const bandOf = {}; for (const b of bands) for (const id of members[b]) bandOf[id] = b;
  // Placement order: the widest band first, then whichever band has the most links into what is already placed.
  const bySize = [];
  { const left = new Set(bands);
    const widest = [...bands].sort((a, c) => members[c].length - members[a].length || bandIdx[a] - bandIdx[c])[0];
    bySize.push(widest); left.delete(widest);
    const placedSet = new Set(members[widest]);
    while (left.size) {
      const score = (b) => members[b].reduce((sm, id) => sm + nb(id).filter((x) => placedSet.has(x)).length, 0);
      const next = [...left].sort((a, c) => score(c) - score(a) || bandIdx[a] - bandIdx[c])[0];
      bySize.push(next); left.delete(next); members[next].forEach((id) => placedSet.add(id));
    } }
  const packRow = (ordered, wantX) => { // wantX: desired centre per id, packed left to right without overlap, centred on the wants
    let prev = -Infinity; const xs = [];
    for (const id of ordered) { const x = Math.max(wantX[id] - wOf(id) / 2, prev + GAP_X); xs.push(x); prev = x + wOf(id); }
    const shift = (ordered.reduce((sm, id) => sm + wantX[id], 0) - xs.reduce((sm, x, i) => sm + x + wOf(ordered[i]) / 2, 0)) / Math.max(1, ordered.length);
    ordered.forEach((id, i) => { place[id] = { x: xs[i] + shift, row: 0 }; });
  };
  for (const b of bySize) {
    const ids = members[b];
    if (ids.length > PER_ROW) {
      const ordered = [...ids].sort((a, c) => pos.get(a).x - pos.get(c).x);
      const rp = wrappedRows(ordered, { y: 0, width: PW, height: PH, gap: GAP_X, rowGap: ROW_GAP, perRow: PER_ROW, centerX: 0 });
      for (const id of ordered) place[id] = { x: rp.get(id).x, row: Math.round(rp.get(id).y / (PH + ROW_GAP)) };
      bandRows[b] = Math.ceil(ids.length / PER_ROW); continue;
    }
    bandRows[b] = 1;
    const want = {};
    ids.forEach((id, i) => {
      const xs = nb(id).map(centreOf).filter((x) => x != null);
      want[id] = xs.length ? xs.reduce((a2, c) => a2 + c, 0) / xs.length : 0;
    });
    if (b === bySize[0]) { const ordered = [...ids].sort((a2, c) => pos.get(a2).x - pos.get(c).x); const tot = ordered.length * (PW + GAP_X) - GAP_X;
      ordered.forEach((id, i) => { place[id] = { x: -tot / 2 + i * (wOf(id) + GAP_X), row: 0 }; }); continue; }
    packRow([...ids].sort((a2, c) => want[a2] - want[c]), want);
  }
  // Nudge small bands off straight-through edges (edges whose endpoints sit in bands on both sides of this one).
  for (const b of bands) {
    if (members[b].length > 3) continue;
    for (const id of members[b]) {
      const blocked = (cx) => links.some(([u, v]) => {
        if (u === id || v === id || !place[u] || !place[v]) return false;
        const iu = bandIdx[bandOf[u]], iv = bandIdx[bandOf[v]], ib = bandIdx[b];
        if (!((iu < ib && ib < iv) || (iv < ib && ib < iu))) return false;
        const t = (ib - iu) / (iv - iu); const ex = centreOf(u) + t * (centreOf(v) - centreOf(u));
        return Math.abs(ex - cx) < wOf(id) / 2 + 14;
      }) || members[b].some((o) => o !== id && place[o] && Math.abs(centreOf(o) - cx) < wOf(id) + GAP_X - 1);
      const c0 = centreOf(id);
      if (!blocked(c0)) continue;
      for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) { const c = c0 + k * (PW + GAP_X) * 0.6; if (!blocked(c)) { place[id].x = c - wOf(id) / 2; break; } }
    }
  }
  for (const b of bands) if (collapsed.has(b)) {
    const xs = members[b].map(centreOf);
    place[b] = { x: xs.reduce((a2, c) => a2 + c, 0) / xs.length - COL_W / 2 };
  }
  const xs = []; for (const b of bands) { if (collapsed.has(b)) xs.push([place[b].x, place[b].x + COL_W]); else for (const id of members[b]) xs.push([place[id].x, place[id].x + wOf(id)]); }
  const minX = Math.min(...xs.map((r) => r[0])) - LABEL_W - 16, maxX = Math.max(...xs.map((r) => r[1])) + 16;
  const nodes = [];
  const where = {}; // node id -> visible node id (collapsed bands swallow their members)
  let y = 0;
  for (const b of bands) {
    const isCol = collapsed.has(b);
    const h = isCol ? 62 : bandRows[b] * (PH + ROW_GAP) - ROW_GAP + 2 * PADY;
    const bandId = "band:" + b;
    const label = b === "agents" ? "agents" : LAYER_LABEL[b] || b;
    nodes.push({ id: bandId, type: "band", position: { x: isCol ? place[b].x : minX, y }, zIndex: isCol ? 1 : -1, selectable: false, draggable: false,
      style: { width: isCol ? COL_W : maxX - minX, height: h },
      data: { label, count: members[b].length, collapsed: isCol, members: members[b].map((m) => m.split(":")[1]), band: b, onToggle: null } });
    if (isCol) { for (const m of members[b]) where[m] = bandId; }
    else for (const m of members[b]) { where[m] = m; nodes.push({ id: m, position: { x: place[m].x, y: y + PADY + place[m].row * (PH + ROW_GAP) }, draggable: false }); }
    y += h + BAND_GAP;
  }
  const edges = [];
  const seen = new Map();
  const add = (src, tgt, kind, label, raw) => {
    const s = where[src], t = where[tgt];
    if (!s || !t || s === t) return;
    const key = `${s}|${t}|${kind}`;
    if (seen.has(key)) { const e = seen.get(key); e.n++; e.raw.push(raw); return; }
    const e = { id: key, source: s, target: t, kind, label, n: 1, raw: [raw] };
    seen.set(key, e); edges.push(e);
  };
  for (const e of deps) add("pkg:" + e.source, "pkg:" + e.target, e.required ? "dep" : "extra", e.required ? "" : e.extras.join(", "), e);
  for (const e of builds) add(e.source, e.target, "builds", "", e);
  return { nodes, edges, bands };
}

function PkgDetail({ graph, pkg, go }) {
  const uses = usesOfPackage(graph, pkg.id);
  const tById = byId(graph.types);
  const deps = packageEdges(graph).filter((e) => e.source === pkg.id && e.known);
  const dependants = packageEdges(graph).filter((e) => e.target === pkg.id);
  const agents = (graph.agents || []).filter((a) => (a.builds_on || []).includes(pkg.id));
  const byKind = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
  for (const u of uses) byKind[u.kind].set(u.type, (byKind[u.kind].get(u.type) || 0) + 1);
  return (
    <div className="pd" data-testid={`pkg-detail-${pkg.id}`}>
      <div className="pd-head">
        <h2><code>{pkg.id}</code></h2>
        <button className="crumb" onClick={() => go("packages")} data-testid="pkg-clear">clear ×</button>
      </div>
      <p className="pd-one">{pkg.one_line}</p>
      <div className="pd-tags">
        <span className={"tag" + (pkg.role === "viewer" ? " viewer" : "")}>{pkg.role}</span>
        <span className="tag">{LAYER_LABEL[pkg.layer] || pkg.layer}</span>
        <span className="tag">v{pkg.version}</span>
        <span className={"tag " + (pkg.lint === "pass" ? "ok" : pkg.lint === "fail" ? "bad" : "")}>lint {pkg.lint}</span>
        {pkg.declaration && <code className="small">{pkg.declaration}</code>}
      </div>
      <PkgLinks pkg={pkg} />
      <h3>Depends on</h3>
      {deps.length ? <div className="pd-list">{deps.map((e) => (
        <button key={e.id} className="pill" onClick={() => go("packages", e.target)} data-testid={`pd-dep-${e.target}`}>
          {e.target}{!e.required && <span className="muted"> · extra: {e.extras.join(", ")}</span>}</button>))}</div>
        : <p className="muted small">No robot-sdk packages (pyproject).</p>}
      <h3>Depended on by</h3>
      {dependants.length ? <div className="pd-list">{dependants.map((e) => (
        <button key={e.id} className="pill" onClick={() => go("packages", e.source)}>{e.source}{!e.required && <span className="muted"> · extra</span>}</button>))}</div>
        : <p className="muted small">Nothing in robot-sdk.</p>}
      {agents.length > 0 && <><h3>Agents that build on it</h3><div className="pd-list">{agents.map((a) => (
        <button key={a.id} className="pill agent" onClick={() => go("agents")}>{a.name}</button>))}</div></>}
      <h3>Types it touches <span className="muted small">({uses.length} rows)</span></h3>
      {KINDS.map((k) => byKind[k].size > 0 && (
        <div key={k} className="pd-kind">
          <span className={"kind k-" + k}>{k}</span>
          <div className="pd-list">{[...byKind[k]].sort((a, b) => b[1] - a[1]).map(([tid, n]) => {
            const t = tById[tid] || { name: tid.split(".").pop() };
            return <button key={tid} className={"pill type k-" + k} onClick={() => go("types", typeKey(graph, t))} data-testid={`pd-type-${k}-${t.name}`}>{t.name} <b>{n}</b></button>;
          })}</div>
        </div>
      ))}
      {uses.length === 0 && <p className="muted small">No robot_msgs type uses found by the scan.</p>}
    </div>
  );
}

// The directory (hard gate g5): every package, viewer and agent with its in-site drill-down first (the name opens it
// here: deps, dependants, types), then one click out to GitHub / Site (when it declares one) / PyPI / README.
function Overview({ graph, collapsed, toggle, go }) {
  const s = stats(graph);
  const agents = graph.agents || [];
  return (
    <div className="pd" data-testid="directory">
      <h2>Directory · {s.packages} packages in {layersOf(graph).length} layers</h2>
      <p className="muted small">{s.libraries} libraries and {s.viewers} viewer{s.viewers === 1 ? "" : "s"}; {s.depEdges} dependency edges from each pyproject. Click a name to open it here (deps and the types it produces or consumes); the chips go to its own pages.</p>
      <div className="ov-layers">
        {layersOf(graph).map((l) => {
          const ps = graph.packages.filter((p) => p.layer === l);
          return (
            <div key={l} className="ov-layer">
              <div className="ov-layer-head"><b>{LAYER_LABEL[l] || l}</b><span className="muted small">{ps.length}</span>
                <button className="chip mini" onClick={() => toggle(l)} data-testid={`band-toggle-${l}`}>{collapsed.has(l) ? "expand" : "collapse"}</button></div>
              <div className="muted small">{LAYER_BLURB[l] || ""}</div>
              {ps.map((p) => (
                <div key={p.id} className={"dir-row" + (p.role === "viewer" ? " viewer" : "")} data-testid={`dir-${p.id}`}>
                  <button className="dir-name" onClick={() => go("packages", p.id)} data-testid={`ov-pkg-${p.id}`}>{p.id}{p.role === "viewer" && <span className="tag viewer">viewer</span>}</button>
                  <div className="dir-one">{p.one_line}</div>
                  <PkgLinks pkg={p} compact />
                </div>
              ))}
            </div>
          );
        })}
        {agents.length > 0 && <div className="ov-layer agents">
          <div className="ov-layer-head"><b>agents</b><span className="muted small">{agents.length}</span></div>
          <div className="muted small">Agents build on packages; a package never imports an agent.</div>
          {agents.map((a) => (
            <div key={a.id} className="dir-row agent" data-testid={`dir-${a.id}`}>
              <button className="dir-name" onClick={() => go("agents")}>{a.name}</button>
              <div className="dir-one">{a.objective}</div>
              <PkgLinks agent={a} compact />
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}

export function PackagesTab({ graph, selected, go }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showAgents, setShowAgents] = useState(true);
  const [showExtras, setShowExtras] = useState(true);
  const toggle = (b) => { const s = new Set(collapsed); s.has(b) ? s.delete(b) : s.add(b); setCollapsed(s); };
  const narrow = useNarrow();
  const lay = useMemo(() => layout(graph, { collapsed, showAgents, showExtras, narrow }), [graph, collapsed, showAgents, showExtras, narrow]);
  const pkgById = byId(graph.packages), agentById = byId(graph.agents || []);
  const sel = selected && pkgById[selected] ? selected : null;
  const near = sel ? neighbourhood(graph, "pkg:" + sel) : null;
  const nodes = lay.nodes.map((n) => {
    if (n.type === "band") return { ...n, data: { ...n.data, onToggle: () => toggle(n.data.band) } };
    const [kind, id] = n.id.split(/:(.*)/s);
    const dim = near && !near.has(n.id);
    if (kind === "agent") return { ...n, type: "agent", data: { agent: agentById[id], dim } };
    return { ...n, type: "pkg", data: { pkg: pkgById[id], dim, hot: sel === id } };
  });
  const edges = lay.edges.map((e) => {
    const touches = sel && (e.source === "pkg:" + sel || e.target === "pkg:" + sel);
    return { id: e.id, source: e.source, target: e.target, sourceHandle: "bs", targetHandle: "t",
      label: e.label || (e.n > 1 ? `${e.n}` : undefined), labelStyle: { fontSize: 11, fill: "var(--muted)" },
      labelBgStyle: { fill: "var(--card)" }, labelBgPadding: [4, 2], labelBgBorderRadius: 4,
      style: edgeStyle(e.kind, { dim: !!sel && !touches, hot: touches }), markerEnd: edgeMarker(e.kind) };
  });
  const onNodeClick = (_, n) => {
    if (n.type === "band") { if (n.data.collapsed) toggle(n.data.band); return; }
    const [kind, id] = n.id.split(/:(.*)/s);
    if (kind === "pkg") go("packages", sel === id ? "" : id);
    if (kind === "agent") go("agents");
  };
  return (
    <div className="pk-tab">
      <main className="pk-centre">
        <div className="tb">
          <div className="tb-group"><span className="tb-label">show</span>
            <button className={`chip ${showAgents ? "on" : ""}`} onClick={() => setShowAgents(!showAgents)} data-testid="pk-agents">agents</button>
            <button className={`chip ${showExtras ? "on" : ""}`} onClick={() => setShowExtras(!showExtras)} data-testid="pk-extras">optional extras</button>
          </div>
          <div className="tb-group">
            <button className="chip" onClick={() => setCollapsed(new Set(layersOf(graph).filter((l) => l !== "vocabulary")))} data-testid="pk-collapse-all">collapse all but vocabulary</button>
            <button className="chip" onClick={() => setCollapsed(new Set())} data-testid="pk-expand-all">expand all</button>
          </div>
        </div>
        <div className="pk-canvas" data-testid="pk-canvas">
          <ReactFlowProvider>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={pkNodeTypes} onNodeClick={onNodeClick} onPaneClick={() => sel && go("packages")}
              fitView fitViewOptions={{ padding: 0.06 }} minZoom={0.2} nodesDraggable={false} nodesConnectable={false}
              onInit={(rf) => setTimeout(() => { rf.fitView({ padding: 0.06 }); requestAnimationFrame(markReady); }, 60)}>
              <Background gap={22} size={1} color="var(--line)" />
              <Controls showInteractive={false} position="bottom-right" />
              <FitOnChange layoutKey={nodes.map((n) => n.id).join("|")} padding={0.06} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        <div className="centre-foot"><Legend items={["dep", "extra", "builds"]} /><span className="muted small">Arrows point at the dependency. Bands are layers: a package imports only from bands below it.</span></div>
      </main>
      <aside className="rows">{sel ? <PkgDetail graph={graph} pkg={pkgById[sel]} go={go} /> : <Overview graph={graph} collapsed={collapsed} toggle={toggle} go={go} />}</aside>
    </div>
  );
}
