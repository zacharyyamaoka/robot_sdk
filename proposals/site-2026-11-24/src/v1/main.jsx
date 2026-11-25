// V1 "Layer Atlas": a scroll landing page whose hero is the layer stack as one foldable React Flow diagram.
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlow, ReactFlowProvider, Controls, Handle, Position, useReactFlow, BaseEdge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@shared/kit.css";
import "./v1.css";
import { useData } from "@shared/data.js";
import {
  byId, layersOf, packageEdges, packagesByLayer, stats, shortType, useState_, KIND_LABEL, LAYER_BLURB, LAYER_LABEL,
} from "@shared/graph.js";
import {
  PackageNode, TypeNode, AgentNode, Provenance, UseRow, PickPlaceStages, Plots, AgentCard, SkillBlock, Install, Legend, PkgLinks,
  PITCH, PITCH_2, LAYER_RULE, AGENT_RULE, REPO_URL,
} from "@shared/parts.jsx";
import { buildStack, bestPerRow, defaultTypeIds, typeRanking, routedPath, MARKER_KINDS, TYPES_DEFAULT } from "./stack.js";

const NAV = [["stack", "Stack"], ["types", "Types"], ["viewers", "Viewers"], ["example", "Example"], ["agents", "Agents"], ["skill", "For coding agents"]];
const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// ---- React Flow node types (bands and the "+N more" chip are local; packages/types/agents are the shared ones)
const H = (p) => <Handle {...p} isConnectable={false} />;
function BandHandles() {
  return (<><H type="target" position={Position.Top} id="t" /><H type="source" position={Position.Top} id="ts" />
    <H type="target" position={Position.Bottom} id="b" /><H type="source" position={Position.Bottom} id="bs" /></>);
}
function BandNode({ data }) {
  return (
    <div className={`v1-band band-${data.kind} band-key-${data.key} ${data.collapsed ? "collapsed" : ""} ${data.dim ? "dim" : ""} ${data.hot ? "hot" : ""}`} title={data.blurb}>
      <BandHandles />
      <div className="v1-band-head">
        <div className="v1-band-title"><span className="v1-band-label">{data.label}</span><span className="v1-band-count">{data.count}</span></div>
        <button className="v1-band-toggle nodrag" data-testid={`band-toggle-${data.key}`} aria-expanded={!data.collapsed}
          onClick={(e) => { e.stopPropagation(); data.onToggle(data.key); }}>{data.collapsed ? "▸ expand" : "▾ collapse"}</button>
      </div>
      {data.collapsed && data.members && <div className="v1-band-members">{data.members.join(" · ")}</div>}
    </div>
  );
}
function MoreNode({ data }) {
  return (
    <button className={`v1-more nodrag ${data.dim ? "dim" : ""}`} data-testid={data.kind === "more" ? "types-more" : "types-less"}
      onClick={(e) => { e.stopPropagation(); data.onMore(data.kind === "more"); }}>
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} /><Handle type="source" position={Position.Top} id="ts" isConnectable={false} />
      {data.kind === "more" ? <><b>+{data.count} more</b><span>types, edges merged here</span></> : <><b>show top {TYPES_DEFAULT}</b><span>fold the rest again</span></>}
    </button>
  );
}
const nodeTypes = { pkg: PackageNode, type: TypeNode, agent: AgentNode, band: BandNode, more: MoreNode };
function RoutedEdge({ sourceX, sourceY, targetX, targetY, data, style, markerEnd, label, labelStyle, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth }) {
  const { d, labelX, labelY } = routedPath({ sourceX, sourceY, targetX, targetY, points: data?.points || [], up: data?.up, arc: data?.arc, dx: data?.dx, sx: data?.sx, tx: data?.tx, labelAt: data?.labelAt, labelDy: data?.labelDy });
  return <BaseEdge path={d} style={style} markerEnd={markerEnd} label={label} labelX={labelX} labelY={labelY} labelStyle={labelStyle}
    labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding} labelBgBorderRadius={labelBgBorderRadius} interactionWidth={interactionWidth} />;
}
const edgeTypes = { routed: RoutedEdge };

function Markers() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>{MARKER_KINDS.map((k) => (
        <marker key={k} id={`v1-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className={`v1-mk v1-mk-${k}`} />
        </marker>))}</defs>
    </svg>
  );
}

// ---- the diagram
function StackDiagram({ graph, view, setView, selected, select }) {
  const rf = useReactFlow();
  const [hoverEdge, setHoverEdge] = useState(null);
  const ready = useRef(false);
  const onToggle = useCallback((key) => setView((v) => { const c = new Set(v.collapsed); c.has(key) ? c.delete(key) : c.add(key); return { ...v, collapsed: c }; }), [setView]);
  const onMore = useCallback((all) => setView((v) => ({ ...v, allTypes: all })), [setView]);
  const [box, setBox] = useState(null);
  const boxRef = useRef(null);
  useEffect(() => {
    const el = boxRef.current?.closest(".v1-canvas"); if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox((b) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      return b && Math.abs(b.w - w) < 40 && Math.abs(b.h - h) < 40 ? b : { w, h };
    }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // WHY collapsed is left out: folding a band must not re-wrap the others (the reader keeps their place).
  const layoutKey = `${view.lens}|${view.showImports}|${view.allTypes}|${view.showAgents}|${view.showDeps}`;
  const perRow = useMemo(() => bestPerRow(graph, { ...view, collapsed: new Set() }, box?.w, box?.h), [graph, layoutKey, box]);
  const built = useMemo(() => buildStack(graph, { ...view, selected, hoverEdge, ...perRow }), [graph, view, selected, hoverEdge, perRow]);
  const nodes = useMemo(() => built.nodes.map((n) => n.type === "band" ? { ...n, data: { ...n.data, onToggle } } : n.type === "more" ? { ...n, data: { ...n.data, onMore } } : n), [built, onToggle, onMore]);
  const structure = `${view.lens}|${view.showImports}|${view.allTypes}|${[...view.collapsed].sort()}|${view.showAgents}|${perRow.perRow}.${perRow.typesPerRow}|${box?.w}x${box?.h}`;
  const [inited, setInited] = useState(false);
  useEffect(() => {
    if (!inited || !box) return;
    const first = !ready.current;
    const t = setTimeout(() => {
      rf.fitView({ padding: 0.06, duration: first ? 0 : 350 });
      // The recorder waits for this: data loaded, layout sized to its box, fitted.
      if (first) requestAnimationFrame(() => { ready.current = true; document.documentElement.dataset.ready = "1"; });
    }, 30);
    return () => clearTimeout(t);
  }, [structure, inited]);
  return (<>
    <span ref={boxRef} hidden />
    <ReactFlow
      nodes={nodes} edges={built.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnScroll={false} zoomOnScroll={false} preventScrolling={false}
      minZoom={0.2} maxZoom={2} fitView fitViewOptions={{ padding: 0.06 }} proOptions={{ hideAttribution: true }}
      onInit={(inst) => { inst.fitView({ padding: 0.06 }); setInited(true); }}
      onNodeClick={(_, n) => {
        if (n.type === "pkg" || n.type === "type" || n.type === "agent") select(n.id === selected ? null : n.id);
      }}
      onPaneClick={() => select(null)}
      onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)} onEdgeMouseLeave={() => setHoverEdge(null)}
      // WHY an edge click handler: React Flow drops pointer events on edges that are neither selectable nor clickable,
      // which also killed hover labels; a tap shows the label on touch screens.
      onEdgeClick={(_, e) => setHoverEdge(e.id)}
    >
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  </>);
}

function Toolbar({ graph, view, setView }) {
  const set = (patch) => setView((v) => ({ ...v, ...patch }));
  const bandKeys = [...layersOf(graph), ...(view.lens === "types" ? ["types"] : []), ...(view.showAgents ? ["agents"] : [])];
  const allCollapsed = bandKeys.every((k) => view.collapsed.has(k));
  return (
    <div className="v1-toolbar">
      <div className="v1-seg" role="group" aria-label="Lens">
        <button className="btn" aria-pressed={view.lens === "packages"} data-testid="lens-packages" onClick={() => set({ lens: "packages", showDeps: true })}>Packages</button>
        <button className="btn" aria-pressed={view.lens === "types"} data-testid="lens-types" onClick={() => set({ lens: "types", showDeps: false })}>Packages + types</button>
      </div>
      <label className={"v1-check" + (view.lens !== "types" ? " off" : "")} title="Uses that are not on the package's public API">
        <input type="checkbox" data-testid="toggle-imports" disabled={view.lens !== "types"} checked={view.showImports} onChange={(e) => set({ showImports: e.target.checked })} /> imports (not public)
      </label>
      <label className="v1-check"><input type="checkbox" data-testid="toggle-deps" checked={view.showDeps} onChange={(e) => set({ showDeps: e.target.checked })} /> package deps</label>
      <label className="v1-check"><input type="checkbox" data-testid="toggle-agents" checked={view.showAgents} onChange={(e) => set({ showAgents: e.target.checked })} /> agents</label>
      <span className="v1-spacer" />
      {view.lens === "types" && <span className="muted small v1-hide-sm">{view.allTypes ? graph.types.length : defaultTypeIds(graph, view.showImports).length} of {graph.types.length} types shown</span>}
      <button className="btn" data-testid="collapse-all" onClick={() => set({ collapsed: allCollapsed ? new Set() : new Set(bandKeys) })}>{allCollapsed ? "Expand all" : "Collapse all"}</button>
    </div>
  );
}

// ---- inspector
function Counts({ rows }) {
  const by = { produces: 0, consumes: 0, imports: 0 };
  for (const r of rows) by[r.kind] = (by[r.kind] || 0) + 1;
  const ok = rows.filter((r) => useState_(r) === "verified").length;
  return (<>
    {["produces", "consumes", "imports"].map((k) => <td key={k} className={"num k-" + k}>{by[k] || <span className="faint">·</span>}</td>)}
    <td className="num"><span className={ok === rows.length ? "ok" : "faint"}>{ok}/{rows.length}</span></td>
  </>);
}

function UseGroups({ graph, rows, showPackage, showType, testid }) {
  const kinds = ["produces", "consumes", "imports"].filter((k) => rows.some((r) => r.kind === k));
  return kinds.map((k, i) => {
    const list = rows.filter((r) => r.kind === k).sort((a, b) => a.package.localeCompare(b.package) || a.where.localeCompare(b.where));
    return (
      <details key={k} className="v1-usegroup" open={i === 0 || list.length <= 6} data-testid={`${testid}-${k}`}>
        <summary><span className={"kind k-" + k}>{KIND_LABEL[k]}</span> <b>{list.length}</b> <span className="muted small">{list.filter((r) => useState_(r) === "verified").length} declared + verified</span></summary>
        {list.map((u, j) => <UseRow key={j} graph={graph} use={u} showPackage={showPackage} showType={showType} />)}
      </details>
    );
  });
}

function TypeInspector({ graph, typeId, select }) {
  const t = graph.types.find((x) => x.id === typeId);
  const rows = graph.uses.filter((u) => u.type === typeId);
  const pkgs = [...new Set(rows.map((r) => r.package))].sort((a, b) => rows.filter((r) => r.package === b).length - rows.filter((r) => r.package === a).length);
  if (!t) return null;
  return (
    <div className="v1-insp-body" data-testid="inspector-type">
      <div className="v1-insp-eyebrow">robot_msgs type · {t.module}</div>
      <h3>{t.name}</h3>
      <p className="muted">{t.what}{t.docs_url && <> · <a href={t.docs_url} target="_blank" rel="noreferrer">docs</a></>}</p>
      <p className="small"><b>{rows.length}</b> uses in <b>{pkgs.length}</b> packages. Rows are packages; click one to focus it.</p>
      {pkgs.length > 0 && <table className="v1-who">
        <thead><tr><th>package</th><th className="k-produces">prod.</th><th className="k-consumes">cons.</th><th className="k-imports">imp.</th><th title="declared in robot-sdk.toml and found in the code by the scanner">decl.+ver.</th></tr></thead>
        <tbody>{pkgs.map((p) => <tr key={p} onClick={() => select("pkg:" + p)} data-testid={`who-${p}`}><td><code>{p}</code></td><Counts rows={rows.filter((r) => r.package === p)} /></tr>)}</tbody>
      </table>}
      <UseGroups graph={graph} rows={rows} showPackage showType={false} testid="type-uses" />
    </div>
  );
}

function PackageInspector({ graph, pkgId, select }) {
  const p = graph.packages.find((x) => x.id === pkgId);
  const deps = packageEdges(graph);
  const rows = graph.uses.filter((u) => u.package === pkgId);
  if (!p) return null;
  const out = deps.filter((e) => e.source === pkgId), inn = deps.filter((e) => e.target === pkgId);
  const agents = (graph.agents || []).filter((a) => (a.builds_on || []).includes(pkgId));
  const types = [...new Set(rows.map((r) => r.type))].sort((a, b) => rows.filter((r) => r.type === b).length - rows.filter((r) => r.type === a).length);
  const chip = (id, extra) => <button key={id + (extra || "")} className="v1-chip" onClick={() => select("pkg:" + id)}><code>{id}</code>{extra && <span className="v1-chip-x">{extra}</span>}</button>;
  return (
    <div className="v1-insp-body" data-testid="inspector-package">
      <div className="v1-insp-eyebrow">{LAYER_LABEL[p.layer] || p.layer} · {p.role}</div>
      <h3><code className="v1-h3code">{p.id}</code></h3>
      <p className="muted">{p.one_line}</p>
      <div className="v1-meta">
        <span className="tag">v{p.version}</span>
        <span className={"tag " + (p.lint === "pass" ? "ok" : p.lint === "fail" ? "bad" : "")}>lint {p.lint}</span>
      </div>
      <PkgLinks pkg={p} />
      <div className="v1-deps">
        <div><span className="muted small">requires</span> {out.filter((e) => e.required).map((e) => chip(e.target)) }{!out.some((e) => e.required) && <span className="faint small">nothing in robot-sdk</span>}</div>
        {out.some((e) => !e.required) && <div><span className="muted small">optional extras</span> {out.filter((e) => !e.required).map((e) => chip(e.target, "[" + e.extras.join(", ") + "]"))}</div>}
        <div><span className="muted small">required by</span> {inn.map((e) => chip(e.source, e.required ? null : "extra"))}{!inn.length && <span className="faint small">nothing</span>}</div>
        {agents.length > 0 && <div><span className="muted small">agents building on it</span> {agents.map((a) => <span key={a.id} className="v1-chip agent">{a.name}</span>)}</div>}
      </div>
      {types.length > 0 ? <>
        <p className="small"><b>{rows.length}</b> uses of <b>{types.length}</b> robot_msgs types. Click a row to focus the type.</p>
        <table className="v1-who">
          <thead><tr><th>type</th><th className="k-produces">prod.</th><th className="k-consumes">cons.</th><th className="k-imports">imp.</th><th title="declared in robot-sdk.toml and found in the code by the scanner">decl.+ver.</th></tr></thead>
          <tbody>{types.map((t) => <tr key={t} onClick={() => select("type:" + t)}><td><code>{shortType(t)}</code></td><Counts rows={rows.filter((r) => r.type === t)} /></tr>)}</tbody>
        </table>
        <UseGroups graph={graph} rows={rows} showPackage={false} showType testid="pkg-uses" />
      </> : <p className="small muted">No robot_msgs type uses found in its code.</p>}
    </div>
  );
}

function AgentInspector({ graph, agentId }) {
  const a = (graph.agents || []).find((x) => "agent:" + x.id === agentId || x.id === agentId);
  return a ? <div className="v1-insp-body"><div className="v1-insp-eyebrow">agent</div><AgentCard agent={a} graph={graph} compact /><PkgLinks agent={a} /></div> : null;
}

function DefaultInspector({ graph, st }) {
  return (
    <div className="v1-insp-body" data-testid="inspector-empty">
      <div className="v1-insp-eyebrow">How to read the stack</div>
      <p className="v1-rule">{LAYER_RULE}</p>
      <div className="v1-stats">
        <div><b>{st.libraries}</b><span>libraries</span></div>
        <div><b>{st.viewers}</b><span>{st.viewers === 1 ? "viewer" : "viewers"}</span></div>
        <div><b>{st.types}</b><span>robot_msgs types</span></div>
        <div><b>{st.uses}</b><span>type uses</span></div>
        <div><b>{st.declared}</b><span>declared</span></div>
        <div><b>{st.depEdges}</b><span>package deps</span></div>
      </div>
      <Legend items={["dep", "extra", "produces", "consumes", "imports", "builds"]} />
      <ul className="v1-hints small muted">
        <li><b>Click</b> a package or type for its uses with file:line; click empty canvas to clear.</li>
        <li><b>Packages + types</b> adds the type band; arrows show who produces and who consumes.</li>
        <li><b>Collapse</b> a band to fold it into one node; its edges re-route to it with a count.</li>
        <li><b>Hover</b> an edge for its name, extras and counts.</li>
      </ul>
    </div>
  );
}

function Inspector({ graph, selected, select, st }) {
  const [kind, key] = selected ? selected.split(/:(.*)/s) : [null, null];
  return (
    <aside className="v1-inspector" data-testid="inspector">
      {selected && <button className="v1-insp-close" data-testid="inspector-clear" onClick={() => select(null)} aria-label="Clear">×</button>}
      {kind === "type" ? <TypeInspector graph={graph} typeId={key} select={select} />
        : kind === "pkg" ? <PackageInspector graph={graph} pkgId={key} select={select} />
        : kind === "agent" ? <AgentInspector graph={graph} agentId={key} />
        : <DefaultInspector graph={graph} st={st} />}
    </aside>
  );
}

// ---- page sections
function PackageCard({ graph, p, onFocus }) {
  const uses = graph.uses.filter((u) => u.package === p.id);
  const prod = uses.filter((u) => u.kind === "produces").length, cons = uses.filter((u) => u.kind === "consumes").length;
  return (
    <div className={"v1-pcard role-" + p.role} data-testid={`card-${p.id}`}>
      <div className="v1-pcard-head"><code className="v1-pcard-name">{p.id}</code><span className="tag">v{p.version}</span>
        <span className={"tag " + (p.lint === "pass" ? "ok" : p.lint === "fail" ? "bad" : "")} title={p.declaration ? `declaration: ${p.declaration}` : "no declaration file"}>lint {p.lint}</span></div>
      <p>{p.one_line}</p>
      <div className="v1-pcard-foot">
        <span className="muted small">{uses.length ? <><span className="k-produces">{prod} produce</span> · <span className="k-consumes">{cons} consume</span> · {uses.length - prod - cons} import</> : "no type uses"}</span>
      </div>
      {/* WHY drill-down first (Zach, gate g5): in-site types & uses before the package's own GitHub / site / PyPI / README. */}
      <div className="v1-pcard-links">
        <button className="btn v1-mini v1-drill" data-testid={`drill-${p.id}`} onClick={() => onFocus("pkg:" + p.id)}>types &amp; uses ↑</button>
        <PkgLinks pkg={p} />
      </div>
    </div>
  );
}

function Layers({ graph, onFocus }) {
  const by = packagesByLayer(graph);
  return (
    <div className="v1-layers">
      {layersOf(graph).map((l) => (
        <div key={l} className={"v1-layer-row layer-" + l}>
          <div className="v1-layer-side">
            <div className="v1-layer-name">{LAYER_LABEL[l] || l}</div>
            <p className="small muted">{LAYER_BLURB[l] || ""}</p>
            {l === "viewers" && <span className="tag v1-viewer-tag">first-class: views over robot_msgs data</span>}
          </div>
          <div className="v1-layer-cards">{by[l].map((p) => <PackageCard key={p.id} graph={graph} p={p} onFocus={onFocus} />)}</div>
        </div>
      ))}
    </div>
  );
}

function TypeIndex({ graph, onFocus }) {
  const ranking = typeRanking(graph);
  const types = byId(graph.types);
  const max = Math.max(1, ...ranking.map((r) => r.count));
  return (
    <div className="v1-typeindex">
      {ranking.map(({ id, count }) => {
        const t = types[id]; const rows = graph.uses.filter((u) => u.type === id);
        const pk = (k) => new Set(rows.filter((r) => r.kind === k).map((r) => r.package)).size;
        return (
          <button key={id} className="v1-trow" onClick={() => onFocus("type:" + id)} data-testid={`typeindex-${t.name}`}>
            <code className="v1-trow-name">{t.name}</code>
            <span className="v1-trow-what muted small">{t.what}</span>
            <span className="v1-trow-bar"><i style={{ width: `${(count / max) * 100}%` }} /></span>
            <span className="v1-trow-nums small"><b>{count}</b> uses · <span className="k-produces">{pk("produces")} prod.</span> · <span className="k-consumes">{pk("consumes")} cons.</span> · {pk("imports")} imp.</span>
          </button>
        );
      })}
    </div>
  );
}

function App() {
  const { data, error } = useData();
  const [view, setView] = useState({ lens: "packages", showImports: false, showDeps: true, showAgents: false, allTypes: false, collapsed: new Set() });
  const [selected, setSelected] = useState(null);
  const [stage, setStage] = useState(null);
  if (error) return <div className="v1-error">Could not load graph.json: {String(error)}</div>;
  if (!data) return <div className="v1-loading">Loading robot-sdk graph…</div>;
  const { graph, graphSource, pick } = data;
  const st = stats(graph);
  const select = (id) => {
    // A focus request from below the fold: open the right lens and unfold whatever hides the target.
    if (id?.startsWith("type:")) {
      setView((v) => { const shown = defaultTypeIds(graph, v.showImports).map((t) => "type:" + t); const c = new Set(v.collapsed); c.delete("types"); return { ...v, lens: "types", showDeps: v.lens === "types" ? v.showDeps : false, collapsed: c, allTypes: v.allTypes || !shown.includes(id) }; });
    }
    if (id?.startsWith("pkg:")) {
      const layer = graph.packages.find((p) => "pkg:" + p.id === id)?.layer;
      setView((v) => { if (!v.collapsed.has(layer)) return v; const c = new Set(v.collapsed); c.delete(layer); return { ...v, collapsed: c }; });
    }
    setSelected(id);
  };
  const focusFromPage = (id) => { select(id); scrollToId("stack"); };
  const viewers = graph.packages.filter((p) => p.role === "viewer");
  return (
    <>
      <Markers />
      <nav className="v1-nav">
        <a className="v1-brand" href="#top">robot-sdk</a>
        <div className="v1-nav-links">{NAV.map(([id, label]) => <a key={id} href={"#" + id} data-testid={`nav-${id}`} onClick={(e) => { e.preventDefault(); scrollToId(id); }}>{label}</a>)}</div>
        <a className="v1-nav-gh" href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <header className="v1-hero" id="top">
        <div className="v1-hero-title">
          <div className="v1-eyebrow">Robotics backend in plain Python</div>
          <h1>robot-sdk</h1>
        </div>
        <div className="v1-hero-pitch">
          <p className="v1-pitch">{PITCH}</p>
          <p className="muted small">{PITCH_2}</p>
          <div className="v1-hero-actions"><Install /><a className="btn" href="#example" onClick={(e) => { e.preventDefault(); scrollToId("example"); }} data-testid="hero-example">See it pick and place ↓</a></div>
        </div>
      </header>
      <section className="v1-stackframe" id="stack" aria-label="The layer stack">
        <Toolbar graph={graph} view={view} setView={setView} />
        <div className="v1-stackgrid">
          <div className="v1-canvas" data-testid="stack-canvas">
            <ReactFlowProvider><StackDiagram graph={graph} view={view} setView={setView} selected={selected} select={select} /></ReactFlowProvider>
          </div>
          <Inspector graph={graph} selected={selected} select={select} st={st} />
        </div>
      </section>

      <main className="v1-main">
        <section className="v1-sec" id="layers">
          <div className="v1-sec-head"><h2>The layers</h2><p className="muted">{LAYER_RULE}</p></div>
          <Layers graph={graph} onFocus={focusFromPage} />
        </section>

        <section className="v1-sec" id="types">
          <div className="v1-sec-head"><h2>robot_msgs types</h2>
            <p className="muted">The vocabulary every package joins on: {st.types} types, {st.uses} uses found in code ({st.public} on a public API, {st.declared} declared and lint-verified). Click a type to focus it in the stack.</p></div>
          <TypeIndex graph={graph} onFocus={focusFromPage} />
        </section>

        {viewers.length > 0 && <section className="v1-sec v1-viewers-callout" id="viewers">
          <div className="v1-sec-head"><h2>Viewers</h2><p className="muted">{LAYER_BLURB.viewers} {viewers.map((v) => v.id).join(", ")} {viewers.length === 1 ? "is" : "are"} first-class packages with their own repo, version and lint, listed in the viewers row above.</p></div>
          <div className="v1-layer-cards">{viewers.map((p) => <PackageCard key={p.id} graph={graph} p={p} onFocus={focusFromPage} />)}</div>
        </section>}

        <section className="v1-sec" id="example">
          <div className="v1-sec-head"><h2>Pick and place, assembled</h2>
            <p className="muted">{pick.title}. Every stage is one call into one package, passing robot_msgs objects along. The plant is a <b>simulation</b> (MuJoCo), not hardware.</p></div>
          <div className="v1-pp">
            <PickPlaceStages pick={pick} onStage={(i) => setStage(i === stage ? null : i)} active={stage} />
            <Plots size="lg" />
          </div>
        </section>

        <section className="v1-sec" id="agents">
          <div className="v1-sec-head"><h2>Agents</h2><p className="muted">{AGENT_RULE}</p></div>
          <div className="v1-agents">{(graph.agents || []).map((a) => (
            <div key={a.id} className="v1-agent-wrap">
              <AgentCard agent={a} graph={graph} />
              <div className="v1-pcard-links">
                <button className="btn v1-mini v1-drill" data-testid={`drill-agent-${a.id}`} onClick={() => { setView((v) => ({ ...v, showAgents: true })); select("agent:" + a.id); scrollToId("stack"); }}>in the stack ↑</button>
                <PkgLinks agent={a} />
              </div>
            </div>))}</div>
        </section>

        <section className="v1-sec" id="skill">
          <div className="v1-sec-head"><h2>For coding agents</h2><p className="muted">Hand the SDK to Claude Code or Codex as a skill.</p></div>
          <div className="card v1-skill"><SkillBlock /></div>
        </section>
      </main>
      <footer className="v1-foot">
        <Provenance graph={graph} graphSource={graphSource} />
        <div className="small muted">Every edge on this page comes from site/data/graph.json, generated from the code by tools/sdk_graph. <a href={REPO_URL} target="_blank" rel="noreferrer">robot_sdk on GitHub</a> · <a href={`${REPO_URL}/blob/main/docs/graph-schema.md`} target="_blank" rel="noreferrer">graph schema</a></div>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
