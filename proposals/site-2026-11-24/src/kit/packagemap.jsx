// PackageMap: the Packages workspace's diagram, two modes behind one toolbar.
//   tree     — V1's layer stack (package deps from pyproject), the view Zach loved ("I like it like a tree").
//   pipeline — packages joined producer -> consumer through the types they publicly produce / consume, one edge per
//              pair labelled with the type names; robot_msgs hidden (Zach: "Robot msgs is hidden in this case... its
//              the glue between everything").
// Toolbar = V1's checkbox row (image 203341: imports (not public) · package deps · agents) plus "group by layer"
// (Zach: "the option to like group by layer or turn of the layer grouping ... that can just be a check mark here")
// and "health". Layout and routing: ELK (layout.js). Toggles are remembered per viewer.
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ReactFlow, ReactFlowProvider, Controls, Handle, Position, BaseEdge, EdgeLabelRenderer, useReactFlow, MarkerType } from "@xyflow/react";
import { LAYER_LABEL } from "@shared/graph.js";
import { layoutPackages, roundedPath } from "./layout.js";
import { healthOf, HEALTH_LABEL, GLUE, usesOfPackageCounts } from "./model.js";
import { HealthDot } from "./health.jsx";
import { store } from "./directory.jsx";

const H = (p) => <Handle {...p} isConnectable={false} />;
const Hidden = () => (<><H type="target" position={Position.Top} id="t" /><H type="source" position={Position.Bottom} id="s" /></>);

const PkgNode = memo(function PkgNode({ data }) {
  const p = data.pkg;
  return (
    <div className={`k-pm-node layer-${p.layer} role-${p.role}${data.hot ? " k-hot" : ""}${data.dim ? " k-dim" : ""}${data.state ? " k-hs-" + data.state : ""}`}
      style={{ width: data.w, height: data.h }} title={`${p.id}: ${p.one_line}${data.healthTitle ? "\n" + data.healthTitle : ""}`} data-testid={"pm-node-" + p.id}>
      <Hidden />
      <div className="k-pm-node-top"><span className="k-pm-node-name">{p.id}</span>{data.state && <HealthDot state={data.state} />}</div>
      <div className="k-pm-node-sub">{data.sub}</div>
      {data.onOpen && <button className="k-pm-open nodrag" onClick={(e) => { e.stopPropagation(); data.onOpen(); }} data-testid={"pm-open-" + p.id}>open ↗</button>}
    </div>
  );
});
const AgentNode = memo(function AgentNode({ data }) {
  const a = data.agent;
  return (
    <div className={`k-pm-node k-pm-agent${data.hot ? " k-hot" : ""}${data.dim ? " k-dim" : ""}${data.state ? " k-hs-" + data.state : ""}`} style={{ width: data.w, height: data.h }} title={a.objective} data-testid={"pm-agent-" + a.id}>
      <Hidden />
      <div className="k-pm-node-top"><span className="k-pm-node-name k-sans">{a.name}</span>{data.state && <HealthDot state={data.state} />}</div>
      <div className="k-pm-node-sub">agent · builds on {(a.builds_on || []).length}</div>
    </div>
  );
});
const BandNode = memo(function BandNode({ data }) {
  return (
    <div className={`k-pm-band k-band-${data.key}${data.dim ? " k-dim" : ""}${data.labelTop ? " k-label-top" : ""}`} style={{ width: data.w, height: data.h }} title={data.blurb}>
      <div className="k-pm-band-head"><span className="k-pm-band-label">{data.label}</span><span className="k-pm-band-count">{data.count}</span></div>
    </div>
  );
});
const GroupNode = memo(function GroupNode({ data }) {
  return (
    <div className={`k-pm-group k-band-${data.key}`} style={{ width: data.w, height: data.h }} title={data.blurb}>
      <div className="k-pm-band-head"><span className="k-pm-band-label">{data.label}</span><span className="k-pm-band-count">{data.count}</span></div>
    </div>
  );
});

function ElkEdge({ id, data, style, markerEnd }) {
  const d = useMemo(() => roundedPath(data.points), [data.points]);
  const lb = data.labelBox;
  return (<>
    <BaseEdge id={id} path={d} style={style} markerEnd={markerEnd} interactionWidth={14} />
    {lb && data.label && <EdgeLabelRenderer>
      <div className={`k-pm-elabel k-ek-${data.kind}${data.hot ? " k-hot" : ""}${data.dim ? " k-dim" : ""} nodrag nopan`}
        style={{ transform: `translate(-50%, -50%) translate(${lb.x + lb.w / 2}px, ${lb.y + lb.h / 2}px)` }}
        title={`${data.source} → ${data.target}: ${data.names.join(", ")}`} data-testid={"pm-elabel-" + data.source + "-" + data.target}>
        {data.names.length === 1
          ? <button className="k-pm-elabel-t" onClick={(e) => { e.stopPropagation(); data.onOpenType?.(data.types[0]); }}>{data.label}</button>
          : <button className="k-pm-elabel-t" onClick={(e) => { e.stopPropagation(); data.onLabel?.(id); }} aria-expanded={data.open}>{data.label}</button>}
        {data.open && <div className="k-pm-elabel-list">{data.types.map((t, i) => (
          <button key={t} onClick={(e) => { e.stopPropagation(); data.onOpenType?.(t); }}>{data.names[i]}</button>))}</div>}
      </div>
    </EdgeLabelRenderer>}
  </>);
}

const nodeTypes = { kpkg: PkgNode, kagent: AgentNode, kband: BandNode, kgroup: GroupNode };
const edgeTypes = { kelk: ElkEdge };
const EDGE_COLOR = { flow: "#3567b5", imports: "#8a9099", dep: "#6b7280", extra: "#6b7280", builds: "#8b5cf6" };

export const PM_DEFAULTS = { mode: "tree", groupByLayer: true, deps: true, agents: false, imports: false, health: true };
// WHY per-mode defaults (kit check, 2026-11-24): with one shared default a first visitor's pipeline came up grouped by
// layer, where the forced layer order fights the type flow (about half the edges ran upward, some round the whole
// map); the ungrouped pipeline routes cleanly. Each mode keeps its own "group by layer" and "package deps" choice.
export const PM_MODE_DEFAULTS = { tree: { groupByLayer: true, deps: true }, pipeline: { groupByLayer: false, deps: false } };
const PER_MODE = ["groupByLayer", "deps"];
// Full options from a partial set: a mode's own defaults fill what is not given.
export function pmOptions(o = {}) {
  const mode = o.mode === "pipeline" ? "pipeline" : "tree";
  return { ...PM_DEFAULTS, ...PM_MODE_DEFAULTS[mode], ...o, mode };
}
// The options patch that switches to `mode`: that mode's last group-by-layer / package-deps choice (else its default);
// the current mode's choice is kept in `byMode` for the way back.
export function switchMode(opts, mode) {
  if (opts.mode === mode) return { mode };
  const byMode = { ...(opts.byMode || {}), [opts.mode]: Object.fromEntries(PER_MODE.map((k) => [k, opts[k]])) };
  return { mode, ...PM_MODE_DEFAULTS[mode], ...(byMode[mode] || {}), byMode };
}
// v2 key: the v1 key may hold a pipeline grouped by the old shared default.
const PM_KEY = "rsdk-kit-pm.v2";
function loadOpts() { try { return pmOptions(JSON.parse(store.get(PM_KEY) || "{}")); } catch { return pmOptions(); } }

// Toolbar: Tree | Pipeline, then V1's checkboxes plus group by layer and health.
export function PackageMapToolbar({ opts, set, children }) {
  const tree = opts.mode === "tree";
  return (
    <div className="k-pm-bar">
      <div className="k-seg" role="group" aria-label="Package view">
        <button className={"k-seg-btn" + (tree ? " on" : "")} aria-pressed={tree} onClick={() => set(switchMode(opts, "tree"))} data-testid="pm-mode-tree">Tree</button>
        <button className={"k-seg-btn" + (!tree ? " on" : "")} aria-pressed={!tree} onClick={() => set(switchMode(opts, "pipeline"))} data-testid="pm-mode-pipeline">Pipeline</button>
      </div>
      <label className={"k-check" + (tree ? " k-off" : "")} title={tree ? "Pipeline only: add packages that import a type without it being on their public API" : "Dashed: packages that import the type, not on their public API"}>
        <input type="checkbox" disabled={tree} checked={!tree && opts.imports} onChange={(e) => set({ imports: e.target.checked })} data-testid="pm-imports" /> imports (not public)
      </label>
      <label className="k-check"><input type="checkbox" checked={opts.deps} onChange={(e) => set({ deps: e.target.checked })} data-testid="pm-deps" /> package deps</label>
      <label className="k-check"><input type="checkbox" checked={opts.agents} onChange={(e) => set({ agents: e.target.checked })} data-testid="pm-agents" /> agents</label>
      <label className="k-check"><input type="checkbox" checked={opts.groupByLayer} onChange={(e) => set({ groupByLayer: e.target.checked })} data-testid="pm-group-by-layer" /> group by layer</label>
      <label className="k-check" title="Colour each package by its worst health check"><input type="checkbox" checked={opts.health} onChange={(e) => set({ health: e.target.checked })} data-testid="pm-health" /> health</label>
      {children}
    </div>
  );
}

// A canvas narrower than this is a phone: compact layout, readable zoom, native scrolling.
export const PM_NARROW = 560;
const PAD = 4;

function Inner({ graph, health, opts, selected, setSelected, onOpenPackage, onOpenType, onLayout, height, maxHeight, narrowMinZoom, narrowMaxHeight }) {
  const rf = useReactFlow();
  const box = useRef(null);
  const [width, setWidth] = useState(0);
  const [lay, setLay] = useState(null);
  const [err, setErr] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  const [openLabel, setOpenLabel] = useState(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth((w) => { const nw = Math.round(e.contentRect.width); return Math.abs(nw - w) > 30 ? nw : w; }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // WHY rows per band follow the canvas width: 8 leaves in one row fit a 1440 px screen at ~0.6 zoom (unreadable);
  // a phone gets two per row.
  const narrow = !!width && width < PM_NARROW;
  const perRow = narrow ? 2 : width && width < 980 ? 3 : 4;
  const compact = narrow;
  // WHY a readable zoom on a phone instead of fit-to-width (kit check, 2026-11-24): fitted into 358 px the map ran at
  // zoom 0.27-0.41, names 3-5 px tall. Narrow canvases keep zoom >= narrowMinZoom (0.75: names ~9.4 px, labels ~9 px),
  // grow to the layout's height, and scroll sideways inside themselves when the layout is wider (the pipeline);
  // "Whole map" flips back to fit-to-width for the overview.
  const [whole, setWhole] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const readable = narrow && narrowMinZoom > 0 && !whole;
  const key = `${opts.mode}|${opts.groupByLayer}|${opts.deps}|${opts.agents}|${opts.imports}|${perRow}|${compact}`;
  useEffect(() => {
    let live = true;
    layoutPackages(graph, opts.mode, { groupByLayer: opts.groupByLayer, deps: opts.deps, agents: opts.agents, imports: opts.imports, perRow, compact })
      .then((r) => { if (live) { setLay(r); setErr(null); setHoverEdge(null); setOpenLabel(null); onLayout?.(r); } }, (e) => { if (live) { setErr(e); console.warn("[kit] ELK layout failed:", e); } });
    return () => { live = false; };
  }, [graph, key]);
  // readable (narrow) geometry: the flow is drawn at `zoom` in an inner box of innerW x innerH that the canvas scrolls.
  const fitZ = lay && width ? (width - 2 * PAD) / lay.width : 1;
  const zoom = readable && lay ? Math.max(Math.min(fitZ, 1.2), narrowMinZoom) : null;
  const innerW = zoom ? Math.max(width, Math.ceil(lay.width * zoom + 2 * PAD)) : null;
  const innerH = zoom ? Math.ceil(lay.height * zoom + 2 * PAD) : null;
  const sideways = !!zoom && innerW > width;
  useEffect(() => {
    if (!lay) return;
    const t = setTimeout(() => {
      if (zoom) rf.setViewport({ x: Math.round((innerW - lay.width * zoom) / 2), y: PAD, zoom });
      else rf.fitView({ padding: 0.05, duration: 250 });
    }, 30);
    return () => clearTimeout(t);
  }, [lay, height, width, zoom, innerW]);
  // height="auto": as tall as the layout needs at this width (fit to width), within [320, maxHeight]; on a narrow
  // canvas at its readable zoom, as tall as the layout (at most narrowMaxHeight; beyond that it scrolls inside).
  // (+2: the canvas's own 1 px borders; the canvas is border-box)
  const h = height === "auto"
    ? (lay && width ? (zoom ? Math.min(narrowMaxHeight, innerH + 2 + (sideways ? 12 : 0)) : Math.round(Math.min(maxHeight, Math.max(320, (width * lay.height) / lay.width + 24)))) : 480)
    : height;
  // WHY overflow per axis: a box that can scroll even 2 px in a direction latches a phone swipe in that direction, so
  // a vertical swipe on a map that fits its height scrolled nothing (measured 2026-11-24); only an overflowing axis scrolls.
  const scrollStyle = zoom ? { overflowX: sideways ? "auto" : "hidden", overflowY: innerH + 2 > h ? "auto" : "hidden" } : undefined;
  const rfId = "k-pm" + useId().replace(/[^A-Za-z0-9_-]/g, "");

  const pkgCounts = useMemo(() => usesOfPackageCounts(graph), [graph]);
  // WHY check against the layout on screen: an edge hovered (or tapped) in one layout unmounts when the mode or a
  // toggle changes, so its mouseleave never fires; a stale id then dimmed every node and edge (seen on the phone's
  // pipeline, 2026-11-24). A selection the new layout lacks (robot_msgs in pipeline) is ignored the same way.
  const liveHover = lay && hoverEdge && lay.edges.some((e) => e.id === hoverEdge) ? hoverEdge : null;
  const liveSel = lay && selected && lay.nodes.some((n) => n.id === selected) ? selected : null;
  const focus = liveHover ? null : liveSel;
  const near = useMemo(() => {
    if (!lay || (!focus && !liveHover)) return null;
    const ns = new Set(), es = new Set();
    for (const e of lay.edges) {
      const hit = liveHover ? e.id === liveHover : e.sourceNode === focus || e.targetNode === focus;
      if (hit) { es.add(e.id); ns.add(e.sourceNode); ns.add(e.targetNode); }
    }
    if (focus) ns.add(focus);
    return { ns, es };
  }, [lay, focus, liveHover]);

  const nodes = useMemo(() => {
    if (!lay) return [];
    const out = [];
    for (const b of lay.bands) out.push({ id: b.id, type: "kband", position: { x: b.x, y: b.y }, data: { ...b }, draggable: false, selectable: false, zIndex: -2, style: { width: b.w, height: b.h } });
    for (const g of lay.groups) out.push({ id: g.id, type: "kgroup", position: { x: g.x, y: g.y }, data: { ...g }, draggable: false, selectable: false, zIndex: -2, style: { width: g.w, height: g.h } });
    for (const n of lay.nodes) {
      const m = opts.health ? healthOf(health, n.key) : null;
      const healthTitle = m ? `health: ${HEALTH_LABEL[m.state]}` + Object.entries(m.checks || {}).filter(([, c]) => ["fail", "warn"].includes(c.state)).map(([k, c]) => `\n· ${k}: ${c.detail}`).join("") : "";
      const dim = near ? !near.ns.has(n.id) : false, hot = selected === n.id;
      if (n.kind === "agent") {
        out.push({ id: n.id, type: "kagent", position: { x: n.x, y: n.y }, draggable: false, data: { agent: n.ref, w: n.w, h: n.h, state: m?.state, dim, hot }, style: { width: n.w, height: n.h } });
        continue;
      }
      const p = n.ref, c = pkgCounts[p.id] || {};
      const sub = lay.mode === "pipeline" ? `produces ${c.produces || 0} · consumes ${c.consumes || 0}` : `v${p.version} · ${LAYER_LABEL[p.layer] || p.layer}`;
      out.push({ id: n.id, type: "kpkg", position: { x: n.x, y: n.y }, draggable: false,
        data: { pkg: p, w: n.w, h: n.h, sub, state: m?.state, healthTitle, dim, hot, onOpen: hot && onOpenPackage ? () => onOpenPackage(p.id) : null },
        style: { width: n.w, height: n.h } });
    }
    return out;
  }, [lay, health, opts.health, near, selected, pkgCounts, onOpenPackage]);

  const edges = useMemo(() => {
    if (!lay) return [];
    return lay.edges.map((e) => {
      const hot = near ? near.es.has(e.id) : false, dim = near ? !hot : false;
      const color = EDGE_COLOR[e.kind] || "#8a9099";
      const style = { stroke: color, strokeWidth: hot ? 2.6 : e.kind === "flow" ? 1.8 : 1.5, opacity: dim ? 0.12 : e.kind === "dep" || e.kind === "extra" ? (lay.mode === "pipeline" ? 0.45 : 0.8) : 0.9 };
      if (e.kind === "extra" || e.kind === "imports") style.strokeDasharray = "6 5";
      if (e.kind === "builds") style.strokeDasharray = "2 4";
      return {
        id: e.id, source: e.sourceNode, target: e.targetNode, type: "kelk", zIndex: hot ? 5 : 1,
        style, markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        data: { ...e, hot, dim, open: openLabel === e.id, onLabel: (id) => setOpenLabel((o) => (o === id ? null : id)), onOpenType },
      };
    });
  }, [lay, near, openLabel, onOpenType]);

  return (
    <><div className={"k-pm-canvas" + (narrow ? " k-pm-narrow" : "") + (sideways ? " k-pm-sideways" : "") + (sideways && atEnd ? " k-pm-at-end" : "")} ref={box} style={{ height: h }} data-testid="pm-canvas"
      data-mode={lay?.mode} data-grouped={lay ? String(lay.bands.length + lay.groups.length > 0) : undefined} data-zoom={zoom ? zoom.toFixed(3) : undefined}>
      {err && <div className="k-pm-err">Layout failed: {String(err.message || err)}</div>}
      {!lay && !err && <div className="k-pm-wait">Laying out…</div>}
      <div className="k-pm-scroll" style={scrollStyle} data-testid="pm-scroll" onScroll={sideways ? (e) => { const el = e.currentTarget; setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2); } : undefined}>
        <div className="k-pm-flow" style={zoom ? { width: innerW, height: innerH } : undefined}>
          {/* WHY no drag/pinch on a narrow canvas: React Flow's pane is touch-action: none, so a finger on a phone-high
              map could not scroll the page; there the page and the inner box scroll natively instead. */}
          <ReactFlow id={rfId} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} preventScrolling={false} panOnScroll={false}
            panOnDrag={!narrow} zoomOnPinch={!narrow} zoomOnDoubleClick={!narrow}
            minZoom={0.15} maxZoom={2} proOptions={{ hideAttribution: true }}
            onNodeClick={(_, n) => { if (n.type === "kpkg" || n.type === "kagent") setSelected(selected === n.id ? null : n.id); }}
            onPaneClick={() => { setSelected(null); setOpenLabel(null); }}
            onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)} onEdgeMouseLeave={() => setHoverEdge(null)} onEdgeClick={(_, e) => setHoverEdge((h) => (h === e.id ? null : e.id))}>
            {!narrow && <Controls showInteractive={false} position="top-right" />}
          </ReactFlow>
        </div>
      </div>
    </div>
    {/* WHY under the canvas, not on it: inside, the toggle covered the top-right box of the pipeline. */}
    {narrow && narrowMinZoom > 0 && lay && <div className="k-pm-fitrow">
      <span className="k-faint">{whole ? "Whole map, fitted to the width." : sideways ? "Readable size: swipe the map sideways for the rest." : "Readable size."}</span>
      <button className="k-pm-fit" onClick={() => setWhole((w) => !w)} aria-pressed={whole} data-testid="pm-fit-toggle"
        title={whole ? "Back to a readable size" : "Fit the whole map into the width"}>{whole ? "Readable size" : "Whole map"}</button>
    </div>}
    </>
  );
}

// Props: graph, health, height = "auto" (fit the layout to the width, at most maxHeight = 720) or a number (px),
// narrowMinZoom = 0.75 (a canvas under PM_NARROW px keeps at least this zoom and scrolls; 0 = always fit to width),
// narrowMaxHeight = 1400 (its auto height cap),
// options/onOptions (optional: controlled { mode, groupByLayer, deps, agents, imports, health, byMode }; else
// remembered; a partial set is completed by pmOptions, so { mode: "pipeline" } is ungrouped),
// onOpenPackage(id), onOpenType(typeId), onSelect(pkgId|null), caption = true, toolbarExtra (node).
export function PackageMap({ graph, health, height = "auto", maxHeight = 720, narrowMinZoom = 0.75, narrowMaxHeight = 1400, options: optsProp, onOptions, onOpenPackage, onOpenType, onSelect, caption = true, toolbarExtra, className = "" }) {
  const [optsState, setOptsState] = useState(loadOpts);
  const opts = optsProp ? pmOptions(optsProp) : optsState;
  const set = useCallback((patch) => {
    if (onOptions) onOptions({ ...opts, ...patch });
    if (!optsProp) setOptsState((o) => { const n = { ...o, ...patch }; store.set(PM_KEY, JSON.stringify(n)); return n; });
  }, [opts, optsProp, onOptions]);
  const [selected, setSel] = useState(null);
  const setSelected = (id) => { setSel(id); onSelect?.(id ? id.replace(/^(pkg|agent):/, "") : null); };
  const [lay, setLay] = useState(null);
  useEffect(() => { setSel(null); }, [graph]);
  const hiddenTypes = graph.types.filter((t) => t.package === GLUE).length;
  return (
    <section className={"k-pm " + className} data-testid="package-map">
      <PackageMapToolbar opts={opts} set={set}>{toolbarExtra}</PackageMapToolbar>
      <ReactFlowProvider>
        <Inner graph={graph} health={health} opts={opts} selected={selected} setSelected={setSelected} onOpenPackage={onOpenPackage} onOpenType={onOpenType} onLayout={setLay}
          height={height} maxHeight={maxHeight} narrowMinZoom={narrowMinZoom} narrowMaxHeight={narrowMaxHeight} />
      </ReactFlowProvider>
      {caption && <div className="k-pm-cap">
        {opts.mode === "pipeline" ? <>
          <span><b>{GLUE} is hidden</b>: it defines the {hiddenTypes} types every edge carries — the glue between all of them. Each edge runs from the package that returns a type to the one that takes it as a parameter; the label names the types.</span>
          {lay?.isolated?.length > 0 && <span className="k-pm-iso">Share no public type with another package: {lay.isolated.map((id) => onOpenPackage
            ? <button key={id} className="k-chip" onClick={() => onOpenPackage(id)}><code>{id}</code></button> : <code key={id} className="k-chip">{id}</code>)}</span>}
        </> : <span>A package imports only from layers below it. Arrows point at what a package requires (pyproject); dashed = an optional extra{opts.agents ? "; dotted purple = an agent builds on it" : ""}.</span>}
        <span className="k-pm-legend">
          {opts.mode === "pipeline" && <span className="k-lg k-lg-flow">type flow</span>}
          {opts.mode === "pipeline" && opts.imports && <span className="k-lg k-lg-imports">imports (not public)</span>}
          {opts.deps && <span className="k-lg k-lg-dep">requires</span>}
          {opts.deps && <span className="k-lg k-lg-extra">optional extra</span>}
          {opts.agents && <span className="k-lg k-lg-builds">agent builds on</span>}
          {opts.health && health && <span className="k-lg-h"><HealthDot state="fail" /> failing <HealthDot state="warn" /> warning <HealthDot state="pass" /> passing</span>}
          {opts.health && !health && <span className="k-faint">health not recorded for this version</span>}
        </span>
      </div>}
    </section>
  );
}
