// V3 "Canvas Map": the whole site is one zoomable React Flow map. Packages, types, the pick-and-place run, the agents
// and the skill are regions of one canvas; the top bar flies the camera between them; nothing is on a separate page.
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlow, ReactFlowProvider, MiniMap, Controls, useReactFlow, useStore } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@shared/kit.css";
import "./v3.css";
import { useData } from "@shared/data.js";
import { packageEdges, typeEdges, neighbourhood, shortType, stats, useState_, LAYER_LABEL, KIND_LABEL, byId, fmtDate } from "@shared/graph.js";
import { edgeStyle, edgeMarker, UseRow, AgentCard, REPO_URL, CopyCode } from "@shared/parts.jsx";
import { buildLayout, makeRep, REGIONS } from "./layout3.js";
import { MapCtx, nodeTypes3, edgeTypes3, useTier } from "./nodes3.jsx";

const TOGGLES = [
  { key: "deps", label: "dependencies", lg: "dep", title: "package -> package, from pyproject (dashed: optional extra)" },
  { key: "produces", label: "produces", lg: "produces", title: "type uses: a public return" },
  { key: "consumes", label: "consumes", lg: "consumes", title: "type uses: a public parameter" },
  { key: "imports", label: "imports", lg: "imports", title: "type uses: imported, not on the public API" },
  { key: "agents", label: "agents", lg: "builds", title: "agent builds on package" },
  { key: "allTypes", label: "all type lines", lg: null, title: "draw every type use (faint) even when nothing is selected" },
  { key: "declaredOnly", label: "declared only", lg: null, title: "only uses listed in the package's robot-sdk.toml" },
];

// WHY a no-op: React Flow turns pointer events off on nodes that are neither selectable, draggable nor clickable;
// every node here has its own buttons and click targets.
const NOOP = () => {};

function useMobile() {
  const q = () => window.innerWidth < 760;
  const [m, setM] = useState(q);
  useEffect(() => { const on = () => setM(q()); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return m;
}

// The landing camera: "What it is" plus the package map, fitted, but never zoomed out past the point where the pitch
// stops being readable. WHY: with 2x the packages a plain fitView shrank the pitch to ~9 px; now the map runs off to the
// right instead (pan or use the minimap) and the left third always reads.
const MIN_LANDING_ZOOM = 0.52;
function overviewViewport(layout, mobile) {
  const W = window.innerWidth, H = window.innerHeight;
  const what = layout.regionPos.what, wb = layout.regionBox.what;
  if (mobile) { const z = (W - 20) / wb.w; return { x: 10 - what.x * z, y: 60 - what.y * z, zoom: z }; }
  const pk = layout.regionPos.packages, pb = layout.regionBox.packages;
  const x0 = Math.min(what.x, pk.x), y0 = Math.min(what.y, pk.y);
  const x1 = Math.max(what.x + wb.w, pk.x + pb.w), y1 = Math.max(what.y + wb.h, pk.y + pb.h);
  const z = Math.min(1, Math.max(MIN_LANDING_ZOOM, Math.min((W - 60) / (x1 - x0), (H - 84 - 76) / (y1 - y0))));
  return { x: 30 - x0 * z, y: 84 - y0 * z, zoom: z };
}

// ---- edges -------------------------------------------------------------------------------------------------------
function buildEdges(graph, pick, { toggles, rep, focus, expanded, tier, collapsedRegions, tEdges, pEdges }) {
  const out = [];
  const fType = focus?.kind === "type" ? focus.id : null;
  const fPkg = focus?.kind === "pkg" ? focus.id : null;
  const overview = !focus && expanded.size === 0;
  const labels = tier !== "far";

  // Type uses, aggregated onto whatever node currently stands for each end (a collapsed layer or region).
  const agg = new Map();
  for (const e of tEdges) {
    if (!toggles[e.kind]) continue;
    if (toggles.declaredOnly && !e.anyDeclared) continue;
    const on = e.type === fType || e.package === fPkg || expanded.has(e.package);
    if (!overview && !on) continue;
    if (overview && !toggles.allTypes) continue;
    const p = rep.pkg(e.package), t = rep.type(e.type);
    const key = `${p}|${t}|${e.kind}`;
    if (!agg.has(key)) agg.set(key, { p, t, kind: e.kind, rows: [], on, missing: false });
    const a = agg.get(key); a.rows.push(...e.rows); a.on = a.on || on;
    if (e.rows.some((r) => r.declared && !r.verified)) a.missing = true;
  }
  for (const [key, a] of agg) {
    const faint = overview;
    const produces = a.kind !== "consumes"; // produces / imports point package -> type; consumes points type -> package
    const style = edgeStyle(a.kind, { hot: !faint && !!fType, state: a.missing ? "missing" : undefined });
    if (faint) { style.opacity = 0.2; style.strokeWidth = 1.1; }
    const n = a.rows.length;
    out.push({
      id: "u:" + key, source: produces ? a.p : a.t, target: produces ? a.t : a.p,
      sourceHandle: a.kind === "produces" ? "kp" : a.kind === "imports" ? "ki" : "tc", targetHandle: a.kind === "produces" ? "tp" : a.kind === "imports" ? "ti" : "kc",
      style, markerEnd: faint ? undefined : edgeMarker(a.kind), zIndex: faint ? 1 : 6,
      // WHY no label: the counts sit on the package node itself (lit chips) and in the inspector; labels at the
      // type end of 6+ converging lines piled on top of each other.
      data: { kind: a.kind, rows: a.rows, title: `${a.p.split(":").pop()} ${a.kind} ${a.t.split(":").pop()}` },
    });
  }

  if (toggles.deps) {
    const d = new Map();
    for (const e of pEdges) {
      if (!e.known) continue;
      const s = rep.pkg(e.source), t = rep.pkg(e.target);
      if (s === t) continue;
      const key = `${s}|${t}|${e.required ? "r" : "x"}`;
      if (!d.has(key)) d.set(key, { s, t, required: e.required, extras: new Set(), n: 0, touch: false });
      const x = d.get(key); x.n++; e.extras.forEach((q) => x.extras.add(q));
      if (fPkg && (e.source === fPkg || e.target === fPkg)) x.touch = true;
    }
    for (const [key, x] of d) {
      const kind = x.required ? "dep" : "extra";
      const dim = (!!fType) || (!!fPkg && !x.touch) || focus?.kind === "agent";
      const style = edgeStyle(kind, { dim, hot: x.touch });
      out.push({ id: "d:" + key, source: x.s, target: x.t, sourceHandle: "bs", targetHandle: "t", style, markerEnd: edgeMarker(kind), zIndex: 4,
        label: labels && tier === "near" && !x.required ? [...x.extras].join(", ") + " extra" : labels && x.n > 1 ? `${x.n} deps` : undefined,
        labelStyle: { fontSize: 10.5, fill: "var(--muted)" }, labelBgStyle: { fill: "var(--card)" }, labelBgPadding: [3, 1], labelBgBorderRadius: 3,
        data: { dep: true } });
    }
  }

  if (toggles.agents) {
    const seen = new Set();
    for (const a of graph.agents || []) for (const p of a.builds_on || []) {
      const s = rep.agent(a.id), t = rep.pkg(p);
      if (s === t || seen.has(s + t)) continue; seen.add(s + t);
      const dim = !!fType || (!!fPkg && p !== fPkg);
      out.push({ id: `a:${s}|${t}`, source: s, target: t, sourceHandle: "ls", targetHandle: "r", style: { ...edgeStyle("builds", { dim }), strokeWidth: dim ? 1.6 : 2.6 },
        markerEnd: edgeMarker("builds"), zIndex: 7 });
    }
  }

  if (!collapsedRegions.has("pick")) {
    (pick?.stages || []).slice(0, -1).forEach((s, i) => {
      out.push({ id: `s:${i}`, type: "handover", source: "stage:" + i, target: "stage:" + (i + 1), sourceHandle: "rs", targetHandle: "l", zIndex: 6,
        style: { stroke: "var(--ink)", strokeWidth: 2.5 }, markerEnd: { type: "arrowclosed", color: "#6b7280", width: 14, height: 14 },
        data: { label: s.output_type, drop: 205 } });
    });
  }
  return out;
}

// ---- inspector ---------------------------------------------------------------------------------------------------
function Group({ graph, title, rows, open }) {
  return (
    <details className="v3-ins-group" open={open}>
      <summary>{title}</summary>
      {rows.map((u, i) => <UseRow key={i} graph={graph} use={u} showPackage={false} showType={false} />)}
    </details>
  );
}
function kindCounts(rows) {
  const c = { produces: 0, consumes: 0, imports: 0 };
  for (const r of rows) c[r.kind]++;
  return ["produces", "consumes", "imports"].filter((k) => c[k]).map((k) => `${k} ${c[k]}`).join(" · ");
}
function LintLine({ rows }) {
  const st = { verified: 0, found: 0, missing: 0 };
  for (const r of rows) st[useState_(r)]++;
  return (
    <div className="v3-ins-lint">
      <span className="flag st-verified">{st.verified} declared + verified</span>
      <span className="flag st-found">{st.found} found, not declared</span>
      <span className={"flag " + (st.missing ? "st-missing" : "")}>{st.missing} lint failures</span>
      <span className="flag">{rows.filter((r) => r.public).length} public</span>
    </div>
  );
}

function Inspector({ graph, focus, edgeSel, onClose, onSelect }) {
  if (edgeSel) {
    const byType = new Map();
    for (const r of edgeSel.rows) { const k = r.package + " · " + shortType(r.type); if (!byType.has(k)) byType.set(k, []); byType.get(k).push(r); }
    return (
      <aside className="v3-ins" data-testid="inspector">
        <div className="v3-ins-head"><div><div className="v3-ins-kicker">edge · {edgeSel.rows.length} use{edgeSel.rows.length === 1 ? "" : "s"}</div><h3>{edgeSel.title}</h3></div><button className="v3-x" onClick={onClose} aria-label="close">×</button></div>
        <LintLine rows={edgeSel.rows} />
        <div className="v3-ins-body">{[...byType].map(([k, rows], i) => <Group key={k} graph={graph} title={`${k} · ${kindCounts(rows)}`} rows={rows} open={i < 3} />)}</div>
      </aside>
    );
  }
  if (!focus) return null;
  if (focus.kind === "type") {
    const t = graph.types.find((x) => x.id === focus.id);
    const rows = graph.uses.filter((u) => u.type === focus.id);
    const byPkg = new Map();
    for (const r of rows) { if (!byPkg.has(r.package)) byPkg.set(r.package, []); byPkg.get(r.package).push(r); }
    const pk = [...byPkg].sort((a, b) => b[1].length - a[1].length);
    const kinds = ["produces", "consumes", "imports"].map((k) => [k, pk.filter(([, rs]) => rs.some((r) => r.kind === k)).map(([p, rs]) => [p, rs.filter((r) => r.kind === k).length])]);
    return (
      <aside className="v3-ins" data-testid="inspector">
        <div className="v3-ins-head"><div><div className="v3-ins-kicker">type · {t?.module}</div><h3>{t?.name || shortType(focus.id)}</h3></div><button className="v3-x" onClick={onClose} aria-label="close">×</button></div>
        {t?.what && <p className="v3-ins-what">{t.what} {t.docs_url && <a href={t.docs_url} target="_blank" rel="noreferrer">docs</a>}</p>}
        <div className="v3-ins-sum"><b>{rows.length}</b> uses in <b>{pk.length}</b> packages</div>
        <div className="v3-ins-kinds">
          {kinds.filter(([, l]) => l.length).map(([k, l]) => (
            <div key={k} className="v3-ins-kind"><span className={"kind k-" + k}>{KIND_LABEL[k]}</span>
              {l.map(([p, n]) => <button key={p} className="v3-chip" onClick={() => onSelect({ kind: "pkg", id: p })}>{p} <b>{n}</b></button>)}</div>))}
        </div>
        <LintLine rows={rows} />
        <div className="v3-ins-body">{pk.map(([p, rs], i) => <Group key={p} graph={graph} title={`${p} · ${kindCounts(rs)}`} rows={rs} open={i === 0} />)}</div>
      </aside>
    );
  }
  if (focus.kind === "pkg") {
    const p = graph.packages.find((x) => x.id === focus.id);
    if (!p) return null;
    const rows = graph.uses.filter((u) => u.package === p.id);
    const pe = packageEdges(graph);
    const deps = pe.filter((e) => e.source === p.id), dependants = pe.filter((e) => e.target === p.id);
    const agents = (graph.agents || []).filter((a) => (a.builds_on || []).includes(p.id));
    const byType = new Map();
    for (const r of rows) { if (!byType.has(r.type)) byType.set(r.type, []); byType.get(r.type).push(r); }
    const tl = [...byType].sort((a, b) => b[1].length - a[1].length);
    return (
      <aside className="v3-ins" data-testid="inspector">
        <div className="v3-ins-head"><div><div className="v3-ins-kicker">package · {LAYER_LABEL[p.layer] || p.layer}{p.role === "viewer" ? " · viewer" : ""} · v{p.version}</div><h3>{p.id}</h3></div><button className="v3-x" onClick={onClose} aria-label="close">×</button></div>
        <p className="v3-ins-what">{p.one_line}</p>
        <div className="v3-ins-meta">
          <a href={p.repo_url} target="_blank" rel="noreferrer">repo</a>
          <span>pip install {p.pypi}</span>
          <span className={"flag " + (p.lint === "pass" ? "st-verified" : p.lint === "fail" ? "st-missing" : "st-found")}>lint {p.lint}</span>
          <span className="faint">{p.declaration || "no declaration file"}</span>
        </div>
        <div className="v3-ins-deps">
          <div><span className="muted">depends on</span> {deps.length ? deps.map((e) => <button key={e.id} className="v3-chip" onClick={() => onSelect({ kind: "pkg", id: e.target })}>{e.target}{!e.required && <i> ({e.extras.join(", ")} extra)</i>}</button>) : <span className="faint">nothing in robot-sdk</span>}</div>
          <div><span className="muted">used by</span> {dependants.length ? dependants.map((e) => <button key={e.id} className="v3-chip" onClick={() => onSelect({ kind: "pkg", id: e.source })}>{e.source}{!e.required && <i> ({e.extras.join(", ")} extra)</i>}</button>) : <span className="faint">no package</span>}</div>
          {agents.length > 0 && <div><span className="muted">agents building on it</span> {agents.map((a) => <button key={a.id} className="v3-chip agent" onClick={() => onSelect({ kind: "agent", id: a.id })}>{a.name}</button>)}</div>}
        </div>
        <div className="v3-ins-sum"><b>{rows.length}</b> uses of <b>{tl.length}</b> robot_msgs types</div>
        {rows.length > 0 && <LintLine rows={rows} />}
        <div className="v3-ins-body">{tl.map(([t, rs], i) => <Group key={t} graph={graph} title={`${shortType(t)} · ${kindCounts(rs)}`} rows={rs.map((r) => r)} open={i === 0} />)}</div>
      </aside>
    );
  }
  if (focus.kind === "agent") {
    const a = (graph.agents || []).find((x) => x.id === focus.id);
    if (!a) return null;
    return (
      <aside className="v3-ins" data-testid="inspector">
        <div className="v3-ins-head"><div><div className="v3-ins-kicker">agent</div><h3>{a.name}</h3></div><button className="v3-x" onClick={onClose} aria-label="close">×</button></div>
        <div className="v3-ins-body"><AgentCard agent={a} graph={graph} /></div>
      </aside>
    );
  }
  return null;
}

// ---- the map -----------------------------------------------------------------------------------------------------
function MapView({ data }) {
  const { graph, pick, graphSource } = data;
  const mobile = useMobile();
  const rf = useReactFlow();
  const tier = useTier();
  const [collapsedLayers, setCL] = useState(() => new Set());
  const [collapsedRegions, setCR] = useState(() => new Set());
  const [expanded, setEx] = useState(() => new Set());
  const [focus, setFocus] = useState(null);
  const [edgeSel, setEdgeSel] = useState(null);
  const [toggles, setToggles] = useState({ deps: true, produces: true, consumes: true, imports: true, agents: true, declaredOnly: false, allTypes: false });
  const [menu, setMenu] = useState(false);
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth >= 1000);

  const tEdges = useMemo(() => typeEdges(graph), [graph]);
  const pEdges = useMemo(() => packageEdges(graph), [graph]);
  const layout = useMemo(() => buildLayout(graph, { collapsedLayers, collapsedRegions, expanded, mobile, pick }), [graph, collapsedLayers, collapsedRegions, expanded, mobile, pick]);
  const rep = useMemo(() => makeRep(graph, { collapsedLayers, collapsedRegions }), [graph, collapsedLayers, collapsedRegions]);
  const edges = useMemo(() => buildEdges(graph, pick, { toggles, rep, focus, expanded, tier, collapsedRegions, tEdges, pEdges }),
    [graph, pick, toggles, rep, focus, expanded, tier, collapsedRegions, tEdges, pEdges]);

  // Default call-to-action from the data: the most-used type (today JointTrajectory).
  const topType = useMemo(() => {
    const c = new Map(); for (const u of graph.uses) c.set(u.type, (c.get(u.type) || 0) + 1);
    const [id, n] = [...c].sort((a, b) => b[1] - a[1])[0] || [];
    const t = graph.types.find((x) => x.id === id);
    return t ? { id, name: t.name, n } : null;
  }, [graph]);

  const nbr = useMemo(() => (focus ? neighbourhood(graph, focus.kind + ":" + focus.id) : null), [graph, focus]);
  const layerOf = useMemo(() => Object.fromEntries(graph.packages.map((p) => [p.id, p.layer])), [graph]);
  const litFor = useCallback((pkgId) => {
    if (focus?.kind !== "type") return null;
    const rs = graph.uses.filter((u) => u.type === focus.id && u.package === pkgId);
    if (!rs.length) return null;
    const c = { produces: 0, consumes: 0, imports: 0 }; rs.forEach((r) => c[r.kind]++);
    return c;
  }, [graph, focus]);

  const padRight = !mobile && (focus || edgeSel) ? "460px" : "30px";
  const pad = useCallback((right) => mobile ? { top: "64px", left: "12px", right: "12px", bottom: "40%" } : { top: "84px", left: "30px", right: right || "30px", bottom: "110px" }, [mobile]);

  const fitIds = useCallback((ids, opts = {}) => {
    const nodes = ids.filter(Boolean).map((id) => ({ id }));
    window.requestAnimationFrame(() => rf.fitView({ nodes, duration: opts.duration ?? 800, padding: pad(opts.right), maxZoom: opts.maxZoom ?? 1.25 }));
  }, [rf, pad]);

  const fly = useCallback((region) => {
    setMenu(false);
    if (region === "what") {
      rf.setViewport(overviewViewport(layout, mobile), { duration: 700 }); return;
    }
    if (region === "agents") {
      const pk = [...new Set((graph.agents || []).flatMap((a) => a.builds_on || []))].map(rep.pkg);
      return fitIds(["region:agents", ...pk], { maxZoom: 0.9 });
    }
    fitIds(["region:" + region], { maxZoom: 1.0 });
  }, [fitIds, graph, rep, mobile, layout, rf]);

  const select = useCallback((sel, opts = {}) => {
    setEdgeSel(null);
    setFocus((prev) => (prev && sel && prev.kind === sel.kind && prev.id === sel.id && !opts.fly ? null : sel));
    if (opts.fly && sel) {
      if (sel.kind === "type") {
        const pk = [...new Set(graph.uses.filter((u) => u.type === sel.id).map((u) => rep.pkg(u.package)))];
        fitIds([rep.type(sel.id), ...pk], { right: mobile ? "12px" : "460px" });
      } else if (sel.kind === "pkg") fitIds([rep.pkg(sel.id)], { right: mobile ? "12px" : "460px", maxZoom: 1.1 });
    }
  }, [graph, rep, fitIds, mobile]);

  // Collapsing or expanding re-lays the map out; keep what you were looking at in view.
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) { firstLayout.current = false; return; }
    if (!focus) return;
    const t = setTimeout(() => {
      if (focus.kind === "type") {
        const pk = [...new Set(graph.uses.filter((u) => u.type === focus.id).map((u) => rep.pkg(u.package)))];
        fitIds([rep.type(focus.id), ...pk], { right: mobile ? "12px" : "460px", duration: 600 });
      } else if (focus.kind === "pkg") fitIds([rep.pkg(focus.id)], { right: mobile ? "12px" : "460px", maxZoom: 1.1, duration: 600 });
    }, 60);
    return () => clearTimeout(t);
  }, [collapsedLayers, collapsedRegions]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSet = (setter) => (key) => setter((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleLayer = useCallback(toggleSet(setCL), []);
  const toggleRegion = useCallback(toggleSet(setCR), []);
  const toggleExpand = useCallback((id) => {
    setEx((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setFocus({ kind: "pkg", id }); setEdgeSel(null);
  }, []);

  const ctx = useMemo(() => ({
    graph, pick, graphSource, idx: layout.idx, topType, select, fly, toggleLayer, toggleRegion, toggleExpand, litFor,
    nodeState: (id) => (!focus ? "" : id === focus.kind + ":" + focus.id ? "hot" : nbr.has(id) ? "lit" : "dim"),
    dimLayer: (L) => !!focus && !graph.packages.some((p) => p.layer === L && nbr.has("pkg:" + p.id)),
    hotLayer: (L) => !!focus && collapsedLayers.has(L) && graph.packages.some((p) => p.layer === L && nbr.has("pkg:" + p.id)),
    dimModule: (m) => focus?.kind === "type" && !graph.types.some((t) => t.module === m && nbr.has("type:" + t.id)),
    dimRegion: () => false,
  }), [graph, pick, graphSource, layout, topType, select, fly, toggleLayer, toggleRegion, toggleExpand, litFor, focus, nbr, collapsedLayers]);

  const onInit = useCallback((inst) => {
    inst.setViewport(overviewViewport(layout, mobile));
    setTimeout(() => { document.documentElement.dataset.ready = "1"; }, 120);
  }, [mobile, layout]);

  useEffect(() => {
    const on = (e) => { if (e.key === "Escape") { setFocus(null); setEdgeSel(null); setMenu(false); } };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, []);

  const s = stats(graph);
  return (
    <MapCtx.Provider value={ctx}>
      <div className={"v3-app" + (mobile ? " mobile" : "")}>
        <header className="v3-bar">
          <a className="v3-brand" href={REPO_URL} target="_blank" rel="noreferrer"><span className="v3-logo" />robot-sdk</a>
          {!mobile && <code className="v3-bar-install" title="click to copy" onClick={() => navigator.clipboard?.writeText("pip install robot-sdk")}>pip install robot-sdk</code>}
          {!mobile && <span className="v3-bar-stamp" title={Object.entries(graph.sources || {}).map(([k, v]) => `${k}@${v}`).join("\n")}>
            <span className="dot" />graph.json · {fmtDate(graph.generated)} · {Object.keys(graph.sources || {}).length} source commits · {graphSource}</span>}
          {!mobile && <nav className="v3-nav">{REGIONS.map((R) => <button key={R.id} className="v3-navbtn" data-testid={`fly-${R.id}`} onClick={() => fly(R.id)}>{R.nav}</button>)}</nav>}
          {mobile && <button className="v3-navbtn v3-menu-btn" data-testid="menu" onClick={() => setMenu((x) => !x)}>{menu ? "Close" : "Menu"}</button>}
          {mobile && menu && <nav className="v3-menu">{REGIONS.map((R) => <button key={R.id} className="v3-navbtn" data-testid={`fly-${R.id}`} onClick={() => fly(R.id)}>{R.nav}</button>)}
            <code className="v3-bar-install">pip install robot-sdk</code></nav>}
        </header>
        <div className="v3-canvas">
          <ReactFlow nodes={layout.nodes} edges={edges} nodeTypes={nodeTypes3} edgeTypes={edgeTypes3} onInit={onInit}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.06} maxZoom={2.2}
            onNodeClick={NOOP}
            onPaneClick={() => { setFocus(null); setEdgeSel(null); }}
            onEdgeClick={(e, edge) => { if (edge.data?.rows) setEdgeSel({ rows: edge.data.rows, title: edge.data.title }); }}
            colorMode="system" proOptions={{ hideAttribution: false }} attributionPosition="bottom-right">
            {!mobile && <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={2}
              nodeColor={(n) => (n.type === "region" ? "transparent" : n.type === "pkg3" ? "#6b7280" : n.type === "type3" ? "#3567b5" : n.type === "agent3" ? "#8b5cf6" : n.type === "stage" ? "#2f7d55" : "#d8d3c8")}
              nodeStrokeColor={(n) => (n.type === "region" ? "#b9b2a3" : "transparent")} maskColor="rgba(120,120,120,.12)" />}
            {!mobile && <Controls position="bottom-right" showInteractive={false} className="v3-controls" />}
          </ReactFlow>
        </div>
        <Inspector graph={graph} focus={focus} edgeSel={edgeSel} onClose={() => { setFocus(null); setEdgeSel(null); }} onSelect={(sel) => select(sel, { fly: true })} />
        {!(mobile && (focus || edgeSel)) && <div className={"v3-layers" + (legendOpen ? " open" : "")} data-testid="layers-panel">
          <button className="v3-layers-head" data-testid="layers-toggle" onClick={() => setLegendOpen((x) => !x)} title="show / hide kinds of lines">Layers {legendOpen ? "▾" : "▸"}</button>
          {legendOpen && <>
            {TOGGLES.map((t) => (
              <label key={t.key} className={"v3-tg" + (toggles[t.key] ? " on" : "")} title={t.title} data-testid={`tg-${t.key}`}>
                <input type="checkbox" checked={toggles[t.key]} onChange={() => setToggles((x) => ({ ...x, [t.key]: !x[t.key] }))} />
                {t.lg && <span className={"v3-sw lg-" + t.lg} />}<span>{t.label}</span>
              </label>))}
            <span className="v3-sep" />
            <button className="v3-mini" data-testid="collapse-all" onClick={() => setCL(new Set(graph.packages.map((p) => p.layer)))}>collapse layers</button>
            <button className="v3-mini" data-testid="expand-all" onClick={() => { setCL(new Set()); setCR(new Set()); }}>expand all</button>
          </>}
        </div>}
      </div>
    </MapCtx.Provider>
  );
}

function App() {
  const { data, error } = useData();
  if (error) return <div className="v3-loading">Could not load graph.json: {String(error.message || error)}</div>;
  if (!data) return <div className="v3-loading">Loading the map…</div>;
  return <ReactFlowProvider><MapView data={data} /></ReactFlowProvider>;
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
