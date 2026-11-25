// The health map: the package dependency graph in layer bands (vocabulary at the bottom), each package showing how much
// of its type use is declared and lint-verified. Type edges, imports and agents overlay on demand; any layer collapses
// to one aggregate node. WHY bands + dagre: graph.json is regenerated and will grow, so nothing is placed by id —
// dagre orders packages inside a layer to cut crossings, the layer decides the band (Zach's layer rule), and a band
// wraps past PER_ROW so twice the packages still read.
import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Handle, Position, Controls, useReactFlow, useNodesState, useEdgesState } from "@xyflow/react";
import { dagreLayout, barycentreOrder } from "@shared/layout.js";
import { edgeStyle, edgeMarker } from "@shared/parts.jsx";
import { LAYER_LABEL, agentKpi } from "@shared/graph.js";
import { coverage, pct } from "./derive.js";

const PKG_W = 196, PKG_H = 54, TYPE_W = 160, TYPE_H = 46, AGG_W = 220, AGG_H = 66, AGENT_W = 200, AGENT_H = 54;
const GAP_X = 18, ROW_GAP = 12, PAD_Y = 10, GUTTER = 150, BAND_GAP = 6;

const H = (p) => <Handle {...p} isConnectable={false} />;
function Handles() {
  return (<>
    <H type="target" position={Position.Top} id="t" /><H type="source" position={Position.Top} id="ts" />
    <H type="target" position={Position.Bottom} id="b" /><H type="source" position={Position.Bottom} id="bs" />
  </>);
}

export function CovBar({ cov, thin = false }) {
  if (!cov || !cov.total) return <div className={"v5-bar empty" + (thin ? " thin" : "")} />;
  return (
    <div className={"v5-bar" + (thin ? " thin" : "")} title={`${cov.verified} declared + verified · ${cov.found} found in code, not declared · ${cov.missing} declared, not found`}>
      <span className="seg verified" style={{ width: `${(100 * cov.verified) / cov.total}%` }} />
      <span className="seg missing" style={{ width: `${(100 * cov.missing) / cov.total}%` }} />
      <span className="seg found" style={{ width: `${(100 * cov.found) / cov.total}%` }} />
    </div>
  );
}

function LintMark({ lint }) {
  if (lint === "pass") return <span className="v5-lint pass" title="robot-sdk.toml matches the code">lint pass</span>;
  if (lint === "fail") return <span className="v5-lint fail" title="the declaration names a use the scanner did not find">lint fail</span>;
  return <span className="v5-lint none" title="no robot-sdk.toml yet">no declaration</span>;
}

function PkgNode({ data }) {
  const { pkg: p, cov, gapsMode, typesDefined } = data;
  return (
    <div className={`v5-node v5-pkg role-${p.role} ${data.dim ? "dim" : ""} ${data.hot ? "hot" : ""} ${data.sel ? "sel" : ""}`} data-testid={`node-${p.id}`}
      title={`${p.id} ${p.version} · ${LAYER_LABEL[p.layer] || p.layer}${p.role === "viewer" ? " · viewer" : ""} · lint ${p.lint}`}>
      <Handles />
      {data.focus ? <>
        <div className="v5-node-top"><span className="v5-node-name">{p.id}</span><span className="v5-node-n" title="declared + verified / uses of this type"><b>{data.focus.cov.verified}</b>/{data.focus.cov.total}</span></div>
        <div className="v5-node-row"><span className="v5-kinds">{data.focus.kinds.map((k) => <span key={k} className={"v5-k k-" + k}>{k}</span>)}</span><CovBar cov={data.focus.cov} /></div>
      </> : <>
      <div className="v5-node-top"><span className="v5-node-name">{p.id}</span><LintMark lint={p.lint} /></div>
      {cov.total ? <div className="v5-node-row"><CovBar cov={cov} />{gapsMode
          ? <span className="v5-node-n"><b>{cov.gaps}</b> gaps{cov.missing ? <span className="bad"> · {cov.missing} fail</span> : null}</span>
          : <span className="v5-node-n"><b>{cov.verified}</b>/{cov.total}</span>}</div>
        : <div className="v5-node-n muted">{typesDefined ? `defines ${typesDefined} types` : "no type uses found"}</div>}
      </>}
    </div>
  );
}

function TypeNodeV5({ data }) {
  const { type: t, cov, pkgs, gapsMode } = data;
  return (
    <div className={`v5-node v5-type ${data.dim ? "dim" : ""} ${data.hot ? "hot" : ""} ${data.sel ? "sel" : ""}`} data-testid={`type-${t.name}`}
      title={`${t.name}: ${cov.total} uses in ${pkgs} packages, ${cov.verified} declared + verified`}>
      <Handles />
      <div className="v5-node-name">{t.name}</div>
      <div className="v5-node-row"><CovBar cov={cov} thin /><span className="v5-node-n">{gapsMode ? <><b>{cov.gaps}</b> gaps</> : <><b>{cov.verified}</b>/{cov.total}</>}</span></div>
    </div>
  );
}

function AggNode({ data }) {
  return (
    <div className={`v5-node v5-agg ${data.dim ? "dim" : ""} ${data.hot ? "hot" : ""}`} data-testid={`agg-${data.layer}`} title={"click to expand: " + data.members.join(", ")}>
      <Handles />
      <div className="v5-node-top"><span className="v5-node-name">{data.label} · {data.members.length}</span><span className="v5-lint none">collapsed</span></div>
      <div className="v5-agg-members">{data.members.join(" · ")}</div>
      <div className="v5-node-row"><CovBar cov={data.cov} /><span className="v5-node-n">{data.cov.total ? <><b>{data.cov.verified}</b>/{data.cov.total}</> : "no uses"}</span></div>
    </div>
  );
}

function AgentNodeV5({ data }) {
  const a = data.agent, k = agentKpi(a);
  return (
    <div className={`v5-node v5-agentnode ${data.dim ? "dim" : ""} ${data.hot ? "hot" : ""}`} title={a.objective}>
      <Handles />
      <div className="v5-node-name sans">{a.name}</div>
      <div className="v5-node-n">{k ? <><b>{k.display}</b> · {k.on_track ? "on track" : "off track"}</> : `agent · builds on ${(a.builds_on || []).length}`}</div>
    </div>
  );
}

function BandNode({ data }) {
  return (
    <div className={`v5-band band-${data.kind} ${data.collapsed ? "collapsed" : ""}`} style={{ width: "100%", height: "100%" }}>
      <div className="v5-band-gutter">
        <div className="v5-band-label">{data.label}</div>
        <div className="v5-band-count">{data.countText}{data.cov && data.cov.total > 0 ? ` · ${pct(data.cov.verified, data.cov.total)}% declared` : ""}</div>
        {data.onToggle && <button className="v5-band-btn nodrag" data-testid={data.testid} onClick={(e) => { e.stopPropagation(); data.onToggle(); }}>{data.toggleText}</button>}
      </div>
    </div>
  );
}

const nodeTypes = { pkg: PkgNode, type: TypeNodeV5, agg: AggNode, agent: AgentNodeV5, band: BandNode };

// ---- layout ------------------------------------------------------------------------------------------------------
function rowsOf(ids, per) { const out = []; for (let i = 0; i < ids.length; i += per) out.push(ids.slice(i, i + per)); return out; }

export function buildMap(graph, d, opts) {
  const { showTypes, onlyGaps, showImports, showAgents, allTypes, topN, collapsed, sel, onToggleLayer, onToggleTypes } = opts;
  const pkgs = graph.packages;
  const vis = (id) => { const p = d.pkgIdx[id]; return p && collapsed.has(p.layer) ? "agg:" + p.layer : "pkg:" + id; };

  // dagre (bottom-to-top, ranks forced apart by layer) gives each package an x; the layer gives its band.
  const order = dagreLayout(
    pkgs.map((p) => ({ id: p.id, width: PKG_W, height: PKG_H })),
    [...d.deps.filter((e) => d.pkgIdx[e.target]).map((e) => ({ source: e.target, target: e.source, minlen: Math.max(1, d.layerIdx[d.pkgIdx[e.source].layer] - d.layerIdx[d.pkgIdx[e.target].layer]) }))],
    { rankdir: "BT", nodesep: 20, ranksep: 40 },
  );
  const xOf = (id) => order.get(id)?.x ?? 0;
  const dxs = pkgs.map((p) => xOf(p.id)), dMin = Math.min(...dxs), dMax = Math.max(...dxs);
  const dagX = (id) => (dMax > dMin ? (xOf(id) - dMin) / (dMax - dMin) : 0.5); // 0..1 across dagre's width

  // Visible types: the most-used N (or all), plus the selected type.
  let types = [];
  if (showTypes) {
    types = (allTypes ? d.typesByUse : d.typesByUse.filter((t) => d.usesByType[t.id]?.length).slice(0, topN));
    if (sel?.kind === "type" && !types.some((t) => t.id === sel.id)) types = [...types, d.typesByUse.find((t) => t.id === sel.id)].filter(Boolean);
  }
  const typeIds = new Set(types.map((t) => t.id));

  // Bands, top of the screen first: agents, then the layers from the top of the stack down, types just above vocabulary.
  const bands = [];
  if (showAgents && graph.agents?.length) bands.push({ kind: "agents", key: "agents", label: "agents", items: [...graph.agents].map((a) => ({ id: "agent:" + a.id, w: AGENT_W, h: AGENT_H, a })) });
  const layersTopDown = [...d.layers].reverse();
  for (const l of layersTopDown) {
    const members = pkgs.filter((p) => p.layer === l).sort((a, b) => xOf(a.id) - xOf(b.id));
    if (l === d.layers[0] && showTypes) {
      bands.push({ kind: "types", key: "types", label: "types", items: types.map((t) => ({ id: "type:" + t.id, w: TYPE_W, h: TYPE_H, t })) });
    }
    if (collapsed.has(l)) bands.push({ kind: "layer", key: l, layer: l, label: LAYER_LABEL[l] || l, members, items: [{ id: "agg:" + l, w: AGG_W, h: AGG_H, agg: true, members }] });
    else bands.push({ kind: "layer", key: l, layer: l, label: LAYER_LABEL[l] || l, members, items: members.map((p) => ({ id: "pkg:" + p.id, w: PKG_W, h: PKG_H, p })) });
  }

  // Rows per band: pick the row length that makes the whole map largest in the canvas (fits 2x the packages too).
  const geometry = (per) => {
    let w = 0, h = 0;
    for (const b of bands) {
      const p = b.kind === "types" ? Math.max(per, Math.round(per * PKG_W / TYPE_W)) : per;
      const n = b.items.length, rows = Math.max(1, Math.ceil(n / p));
      const rowLen = Math.min(n, p);
      const iw = b.items[0]?.w || PKG_W, ih = Math.max(...b.items.map((it) => it.h), 40);
      w = Math.max(w, rowLen * iw + (rowLen - 1) * GAP_X);
      h += PAD_Y * 2 + rows * ih + (rows - 1) * ROW_GAP + BAND_GAP;
    }
    return { w: w + GUTTER + 32, h };
  };
  const maxItems = Math.max(...bands.map((b) => b.items.length), 1);
  let per = maxItems, best = -1;
  const W = opts.size?.w || 1000, Hh = opts.size?.h || 640;
  for (let k = Math.min(3, maxItems); k <= maxItems; k++) {
    const g = geometry(k), sc = Math.min(W / g.w, Hh / g.h);
    if (sc > best + 0.01) { best = sc; per = k; }
  }
  const perOf = (b) => (b.kind === "types" ? Math.max(per, Math.round(per * PKG_W / TYPE_W)) : per);
  const place = (band) => {
    band.rows = rowsOf(band.items, perOf(band));
    band.rowW = band.rows.map((r) => r.reduce((s, it) => s + it.w, 0) + GAP_X * (r.length - 1));
  };
  for (const b of bands) if (b.kind === "layer") place(b);
  let contentW = Math.max(...bands.filter((b) => b.rows).flatMap((b) => b.rowW), 400);
  const cx = GUTTER + 16 + contentW / 2;
  const roughX = new Map();
  for (const b of bands.filter((b) => b.rows)) b.rows.forEach((r, ri) => { let x = cx - b.rowW[ri] / 2; for (const it of r) { roughX.set(it.id, x + it.w / 2); x += it.w + GAP_X; } });
  const neighbours = (id) => {
    if (id.startsWith("type:")) { const t = id.slice(5); return [...(d.typePkgs[t] || [])].map(vis); }
    if (id.startsWith("agent:")) { const a = graph.agents.find((x) => "agent:" + x.id === id); return (a?.builds_on || []).map(vis); }
    return [];
  };
  for (const b of bands) if (b.kind === "types" || b.kind === "agents") {
    const ids = barycentreOrder(b.items.map((it) => it.id), neighbours, (n) => roughX.get(n));
    b.items = ids.map((id) => b.items.find((it) => it.id === id));
    place(b);
  }
  contentW = Math.max(...bands.flatMap((b) => b.rowW), 400);
  const cx2 = GUTTER + 16 + contentW / 2;
  const bandW = GUTTER + 32 + contentW;

  const nodes = [];
  const pos = new Map();
  let y = 0;
  const bandNodes = [];
  for (const b of bands) {
    const rowH = Math.max(...b.items.map((it) => it.h), 40);
    const rows = Math.max(1, b.rows.length);
    const h = PAD_Y * 2 + rows * rowH + (rows - 1) * ROW_GAP;
    if (b.kind === "layer" && b.rows.length === 1) {
      // One row: keep dagre's horizontal placement (scaled into the band) so long edges run beside nodes, not through them.
      const items = b.rows[0];
      const want = items.map((it) => (it.agg ? it.members.reduce((s, m) => s + dagX(m.id), 0) / it.members.length : dagX(it.p.id)));
      const left = GUTTER + 16, right = GUTTER + 16 + contentW;
      const xs = items.map((it, i) => left + it.w / 2 + want[i] * Math.max(0, contentW - it.w) - it.w / 2);
      for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + items[i - 1].w + GAP_X);
      const over = xs.length ? xs[xs.length - 1] + items[items.length - 1].w - right : 0;
      if (over > 0) for (let i = xs.length - 1; i >= 0; i--) { xs[i] -= over; if (i > 0 && xs[i] - items[i - 1].w - GAP_X < xs[i - 1]) xs[i - 1] = xs[i] - items[i - 1].w - GAP_X; }
      items.forEach((it, i) => pos.set(it.id, { x: xs[i], y: y + PAD_Y + (rowH - it.h) / 2 }));
    } else b.rows.forEach((r, ri) => {
      let x = cx2 - b.rowW[ri] / 2;
      for (const it of r) { pos.set(it.id, { x, y: y + PAD_Y + ri * (rowH + ROW_GAP) + (rowH - it.h) / 2 }); x += it.w + GAP_X; }
    });
    let data;
    if (b.kind === "layer") {
      const cov = coverage(b.members.flatMap((p) => d.usesByPkg[p.id] || []));
      data = { kind: "layer", label: b.label, countText: `${b.members.length} pkg${b.members.length === 1 ? "" : "s"}`, cov, collapsed: collapsed.has(b.layer),
        onToggle: () => onToggleLayer(b.layer), toggleText: collapsed.has(b.layer) ? "expand" : "collapse", testid: `band-toggle-${b.layer}` };
    } else if (b.kind === "types") {
      const used = d.typesByUse.filter((t) => d.usesByType[t.id]?.length).length;
      data = { kind: "types", label: "robot_msgs types", countText: `${types.length} of ${graph.types.length} shown`, onToggle: onToggleTypes,
        toggleText: allTypes ? `top ${Math.min(topN, used)} only` : `show all ${graph.types.length}`, testid: "band-toggle-types" };
    } else data = { kind: "agents", label: "agents", countText: `${b.items.length} · build packages` };
    bandNodes.push({ id: "band:" + b.key, type: "band", position: { x: 0, y }, data, style: { width: bandW, height: h }, width: bandW, height: h,
      selectable: false, draggable: false, focusable: false, zIndex: -1 });
    y += h + BAND_GAP;
  }

  // ---- edges ----
  const depMap = new Map();
  for (const e of d.deps) {
    if (!d.pkgIdx[e.target]) continue;
    const s = vis(e.source), t = vis(e.target);
    if (s === t) continue;
    const k = s + ">" + t;
    const prev = depMap.get(k);
    if (prev) { prev.required ||= e.required; prev.extras.push(...e.extras); prev.n++; } else depMap.set(k, { s, t, required: e.required, extras: [...e.extras], n: 1 });
  }
  const useMap = new Map();
  if (showTypes) for (const e of d.tEdges) {
    if (!typeIds.has(e.type)) continue;
    if (e.kind === "imports" && !showImports) continue;
    const p = vis(e.package), k = `${p}|${e.type}|${e.kind}`;
    const prev = useMap.get(k);
    if (prev) prev.rows.push(...e.rows); else useMap.set(k, { p, type: e.type, kind: e.kind, rows: [...e.rows], pkgIds: new Set() });
    useMap.get(k).pkgIds.add(e.package);
  }
  const agentEdges = [];
  if (showAgents) for (const a of graph.agents || []) for (const b of a.builds_on || []) if (d.pkgIdx[b]) agentEdges.push({ s: "agent:" + a.id, t: vis(b) });

  // ---- focus (selection) and gaps ----
  let neigh = null, hotEdge = () => false;
  if (sel?.kind === "type") {
    const tid = "type:" + sel.id;
    neigh = new Set([tid]);
    for (const e of d.tEdges) if (e.type === sel.id && (showImports || e.kind !== "imports")) neigh.add(vis(e.package));
    hotEdge = (e) => e.data?.type === sel.id;
  } else if (sel?.kind === "pkg") {
    const pid = vis(sel.id);
    neigh = new Set([pid]);
    for (const v of depMap.values()) { if (v.s === pid) neigh.add(v.t); if (v.t === pid) neigh.add(v.s); }
    for (const v of useMap.values()) if (v.p === pid) neigh.add("type:" + v.type);
    for (const v of agentEdges) if (v.t === pid) neigh.add(v.s);
    hotEdge = (e) => e.source === pid || e.target === pid;
  }

  const covOfNode = (id) => {
    if (id.startsWith("pkg:")) return d.pkgCov[id.slice(4)];
    if (id.startsWith("type:")) return d.typeCov[id.slice(5)];
    if (id.startsWith("agg:")) return coverage(pkgs.filter((p) => p.layer === id.slice(4)).flatMap((p) => d.usesByPkg[p.id] || []));
    return null;
  };
  const gapDim = (id) => onlyGaps && !(covOfNode(id)?.gaps > 0);

  for (const b of bands) for (const it of b.items) {
    const p0 = pos.get(it.id);
    const dim = (neigh && !neigh.has(it.id)) || gapDim(it.id);
    const hot = neigh && neigh.has(it.id) && it.id !== (sel?.kind === "type" ? "type:" + sel.id : sel ? vis(sel.id) : null);
    const isSel = sel && (it.id === "type:" + sel.id || it.id === "pkg:" + sel.id);
    let focus = null;
    if (it.p && sel?.kind === "type") {
      const rows = (d.usesByPkg[it.p.id] || []).filter((u) => u.type === sel.id && (showImports || u.kind !== "imports"));
      if (rows.length) focus = { cov: coverage(rows), kinds: ["produces", "consumes", "imports"].filter((k) => rows.some((u) => u.kind === k)) };
    }
    if (it.p) nodes.push({ id: it.id, type: "pkg", position: p0, data: { pkg: it.p, cov: d.pkgCov[it.p.id], gapsMode: onlyGaps, dim, hot, sel: isSel, focus,
      typesDefined: graph.types.filter((t) => t.package === it.p.id).length }, draggable: false });
    else if (it.t) nodes.push({ id: it.id, type: "type", position: p0, data: { type: it.t, cov: d.typeCov[it.t.id], pkgs: d.typePkgs[it.t.id]?.size || 0, gapsMode: onlyGaps, dim, hot, sel: isSel }, draggable: false });
    else if (it.agg) nodes.push({ id: it.id, type: "agg", position: p0, data: { layer: b.layer, label: b.label, members: it.members.map((m) => m.id), cov: covOfNode(it.id), dim, hot }, draggable: false });
    else if (it.a) nodes.push({ id: it.id, type: "agent", position: p0, data: { agent: it.a, dim: (neigh && !neigh.has(it.id)) || onlyGaps, hot }, draggable: false });
  }

  const edges = [];
  const fadeDeps = showTypes && !sel;
  for (const [k, v] of depMap) {
    const kind = v.required ? "dep" : "extra";
    const e = { id: "dep:" + k, source: v.s, target: v.t, sourceHandle: "bs", targetHandle: "t", data: { kind } };
    const hot = sel?.kind === "pkg" && hotEdge(e);
    const dim = (sel && !hot) || onlyGaps;
    const style = edgeStyle(kind, { dim, hot });
    if (fadeDeps && !dim) style.opacity = 0.3;
    edges.push({ ...e, style, markerEnd: edgeMarker(kind), label: v.required ? undefined : v.extras.length ? `[${[...new Set(v.extras)].join(", ")}]` : undefined,
      labelStyle: { fontSize: 10, fill: "var(--muted)" }, labelBgStyle: { fill: "var(--card)" }, labelShowBg: true, selectable: false });
  }
  for (const [k, v] of useMap) {
    const tid = "type:" + v.type;
    const cov = coverage(v.rows);
    const produces = v.kind === "produces";
    const e = produces ? { source: v.p, target: tid, sourceHandle: "bs", targetHandle: "t" } : { source: tid, target: v.p, sourceHandle: "ts", targetHandle: "b" };
    const full = { id: "use:" + k, ...e, data: { type: v.type, kind: v.kind, pkg: [...v.pkgIds][0], cov } };
    const hot = sel ? hotEdge(full) : false;
    const dim = (sel && !hot) || (onlyGaps && cov.gaps === 0);
    const style = edgeStyle(v.kind, { dim, hot, state: cov.missing ? "missing" : undefined });
    style.strokeWidth = (hot ? 1.2 : 0) + 1.3 + Math.min(3, Math.log2(v.rows.length + 1) * 0.7);
    edges.push({ ...full, style, markerEnd: edgeMarker(v.kind), interactionWidth: 14,
    });
  }
  for (const v of agentEdges) {
    const e = { id: `builds:${v.s}>${v.t}`, source: v.s, target: v.t, sourceHandle: "bs", targetHandle: "t" };
    const hot = sel?.kind === "pkg" && hotEdge(e);
    edges.push({ ...e, style: edgeStyle("builds", { dim: (sel && !hot) || onlyGaps, hot }), markerEnd: edgeMarker("builds"), selectable: false });
  }
  return { nodes: [...bandNodes, ...nodes], edges, neigh, layoutKey: bands.map((b) => b.key + b.items.length).join("|") + "/" + per };
}

// ---- component -------------------------------------------------------------------------------------------------
export function HealthMap({ graph, d, opts, onSelect, onReady }) {
  const [size, setSize] = useState(null);
  const boxRef = useRef(null);
  useEffect(() => {
    const el = boxRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      // Round so a scrollbar or a pixel of jitter does not re-layout.
      setSize((s) => (s && Math.abs(s.w - r.width) < 24 && Math.abs(s.h - r.height) < 24 ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const built = useMemo(() => (size ? buildMap(graph, d, { ...opts, size }) : { nodes: [], edges: [], neigh: null, layoutKey: "" }), [graph, d, opts, size]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const rf = useReactFlow();
  const readyRef = useRef(false);
  const fitKey = built.layoutKey + "|" + (size ? size.w + "x" + size.h : "") + "|" + (opts.sel ? opts.sel.kind + opts.sel.id : "") + "|" + opts.drawerOpen;

  useEffect(() => { setNodes(built.nodes); setEdges(built.edges); }, [built]);
  useEffect(() => {
    if (!nodes.length) return;
    const t = setTimeout(() => {
      const focus = built.neigh ? nodes.filter((n) => built.neigh.has(n.id)).map((n) => ({ id: n.id })) : undefined;
      rf.fitView({ padding: 0.1, duration: readyRef.current ? 380 : 0, maxZoom: 1.05, ...(focus ? { nodes: focus } : {}) }).then?.(() => {});
      if (!readyRef.current) { readyRef.current = true; requestAnimationFrame(() => requestAnimationFrame(() => onReady?.())); }
    }, readyRef.current ? 40 : 120);
    return () => clearTimeout(t);
  }, [fitKey, nodes.length > 0]);

  return (<>
    <span ref={boxRef} hidden />
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodeTypes={nodeTypes}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.15} maxZoom={2}
      proOptions={{ hideAttribution: true }} panOnScroll={false} zoomOnScroll={false} zoomOnPinch preventScrolling={false}
      onNodeClick={(_, n) => {
        if (n.type === "pkg") onSelect({ kind: "pkg", id: n.id.slice(4) });
        else if (n.type === "type") onSelect({ kind: "type", id: n.id.slice(5) });
        else if (n.type === "agg") opts.onToggleLayer(n.data.layer);
        else if (n.type === "agent") document.getElementById("agents")?.scrollIntoView({ behavior: "smooth" });
      }}
      onEdgeClick={(_, e) => { if (e.data?.type && e.data.pkg) onSelect({ kind: "pkg", id: e.data.pkg, typeFilter: e.data.type }); }}
      onPaneClick={() => opts.sel && onSelect(null)}>
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  </>);
}
