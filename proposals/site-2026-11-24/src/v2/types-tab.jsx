// Types tab: rail of every robot_msgs type | the switchboard for one type | the rows behind the selection.
import { useEffect, useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import { byId, usesOfType, useState_, LAYER_LABEL, KIND_LABEL } from "@shared/graph.js";
import { UseRow, edgeStyle, edgeMarker, Legend, Install, LAYER_RULE, PkgLinks } from "@shared/parts.jsx";
import { KINDS, NODE_W, NODE_H, TYPE_W, TYPE_H, RING_W, RING_H, typeCounts, buildSwitchboard, filterRows, otherTypesOf, typeKey, layerIndex } from "./sw-model.js";
import { markReady, store, FitOnChange, useNarrow } from "./util.js";

const H = (p) => <Handle {...p} isConnectable={false} />;
function Handles() {
  return (<>
    <H type="target" position={Position.Top} id="t" /><H type="source" position={Position.Top} id="ts" />
    <H type="target" position={Position.Bottom} id="b" /><H type="source" position={Position.Bottom} id="bs" />
    <H type="target" position={Position.Left} id="l" /><H type="source" position={Position.Left} id="ls" />
    <H type="target" position={Position.Right} id="r" /><H type="source" position={Position.Right} id="rs" />
  </>);
}

function TypeCentre({ data }) {
  const t = data.type;
  return (
    <div className="sw-centre" data-testid="sw-type-centre" style={{ width: TYPE_W, height: TYPE_H }}>
      <Handles />
      <div className="sw-centre-mod">{t.module}</div>
      <div className="sw-centre-name">{t.name}</div>
      <div className="sw-centre-sub">{data.rows} rows shown · {data.pkgs} packages</div>
    </div>
  );
}

function PkgNode({ data }) {
  const p = data.pkg;
  return (
    <div className={`rf-pkg sw-pkg layer-${p.layer} role-${p.role} ${data.soft ? "soft" : ""} ${data.hot ? "hot" : ""}`}
      style={{ width: NODE_W, height: NODE_H }} data-testid={`sw-node-${data.col}-${p.id}`} title={p.one_line}>
      <Handles />
      <div className="rf-pkg-name">{p.id}</div>
      <div className="rf-pkg-sub">
        <span>{LAYER_LABEL[p.layer] || p.layer}{p.role === "viewer" ? " · viewer" : ""}</span>
        {data.extraImports > 0 && <span className="rf-badge" title="rows where this package also imports the type (not on its public API)">+{data.extraImports} imports</span>}
        {data.others > 0 && <button className="sw-ring-btn nodrag" data-testid={`sw-ring-${data.col}-${p.id}`}
          onClick={(e) => { e.stopPropagation(); data.onRing(); }} title="show the other types this package touches">
          {data.ringOpen ? "hide types" : `+${data.others} types`}</button>}
      </div>
    </div>
  );
}

function GroupNode({ data }) {
  return (
    <div className={`sw-group ${data.soft ? "soft" : ""} ${data.hot ? "hot" : ""}`} style={{ width: NODE_W, height: NODE_H }}
      data-testid={`sw-group-${data.col}-${data.layer}`} title="click to expand this layer">
      <Handles />
      <div className="sw-group-head"><b>{LAYER_LABEL[data.layer] || data.layer} · {data.members.length}</b><span className="sw-group-exp">expand</span></div>
      <div className="sw-group-members">{data.members.join(" · ")}</div>
    </div>
  );
}

function RingNode({ data }) {
  const rt = data.ring;
  return (
    <div className="sw-ringnode" style={{ width: RING_W, height: RING_H }} data-testid={`sw-ringtype-${rt.type.name}`} title={`open ${rt.type.name} in the switchboard`}>
      <Handles />
      <div className="sw-ringnode-name">{rt.type.name}</div>
      <div className="sw-ringnode-sub">{rt.kinds.map((k) => `${k} ${rt.counts[k]}`).join(" · ")}</div>
    </div>
  );
}

function SwEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (<>
    <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={18} />
    {data?.label != null && <EdgeLabelRenderer>
      <button className={`sw-elabel k-${data.kind} ${data.hot ? "hot" : ""} ${data.soft ? "soft" : ""} nodrag nopan`}
        style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }} data-testid={`sw-elabel-${data.testKey}`}
        title={`${data.label} ${data.kind} rows: click to list them`} onClick={(e) => { e.stopPropagation(); data.onClick(); }}>
        {data.label}
      </button>
    </EdgeLabelRenderer>}
  </>);
}

const nodeTypes = { type: TypeCentre, pkg: PkgNode, layergroup: GroupNode, ring: RingNode };
const edgeTypes = { sw: SwEdge };

function matchFocus(focus, pkgs, kind, layer) {
  if (!focus) return false;
  if (focus.layer) return layer === focus.layer && (!focus.kind || focus.kind === kind);
  return pkgs.includes(focus.pkg) && (!focus.kind || focus.kind === kind);
}

function Switchboard({ graph, type, rows, filters, focus, setFocus, ring, setRing, expanded, setExpanded, go }) {
  const vertical = useNarrow(); // WHY: on a phone the left/right columns would shrink to unreadable; stack them instead
  const pkgById = useMemo(() => byId(graph.packages), [graph]);
  const sb = useMemo(() => buildSwitchboard(type, {
    rows, pkgById, groupByLayer: filters.groupByLayer, expanded, ring, vertical,
    ringTypes: (p) => otherTypesOf(graph, p, type.id),
  }), [type, rows, filters.groupByLayer, expanded, ring, graph, vertical]);
  const others = useMemo(() => {
    const m = {}; for (const p of graph.packages) m[p.id] = otherTypesOf(graph, p.id, type.id).length; return m;
  }, [graph, type]);
  const pkgCount = new Set(rows.map((r) => r.package)).size;

  const nodes = sb.nodes.map((n) => {
    const base = { id: n.id, type: n.kind === "group" ? "layergroup" : n.kind, position: { x: n.x, y: n.y }, draggable: false, selectable: false, connectable: false };
    if (n.kind === "type") return { ...base, data: { type, rows: rows.length, pkgs: pkgCount } };
    if (n.kind === "ring") return { ...base, data: { ring: n.ring } };
    const kind = { prod: "produces", cons: "consumes", imp: "imports" }[n.col];
    const pkgs = n.members || [n.pkg];
    const hot = matchFocus(focus, pkgs, kind, n.layer) || (focus && !focus.kind && !focus.layer && pkgs.includes(focus.pkg));
    if (n.kind === "group") return { ...base, data: { col: n.col, layer: n.layer, members: n.members, hot, soft: focus && !hot } };
    return { ...base, data: { pkg: pkgById[n.pkg], col: n.col, extraImports: filters.show.imports ? n.extraImports : 0, hot, soft: focus && !hot,
      others: others[n.pkg] || 0, ringOpen: ring === n.id, onRing: () => setRing(ring === n.id ? null : n.id) } };
  });
  const edges = sb.edges.map((e) => {
    if (e.ring) return { id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
      style: { ...edgeStyle(e.kind), opacity: 0.45, strokeWidth: 1.3 }, selectable: false };
    const hot = matchFocus(focus, e.pkgs, e.kind, e.layer);
    const soft = !!focus && !hot;
    const onClick = () => setFocus(e.layer ? { layer: e.layer, kind: e.kind } : { pkg: e.pkgs[0], kind: e.kind });
    return { id: e.id, type: "sw", source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
      style: { ...edgeStyle(e.kind, { hot }), opacity: soft ? 0.25 : 0.95 }, markerEnd: edgeMarker(e.kind),
      data: { label: e.label, kind: e.kind, hot, soft, onClick, testKey: `${e.kind}-${e.layer || e.pkgs[0]}` } };
  });
  const layoutKey = sb.nodes.map((n) => n.id).join("|");

  const onNodeClick = (_, node) => {
    if (node.type === "type") setFocus(null);
    else if (node.type === "ring") go("types", typeKey(graph, node.data.ring.type));
    else if (node.type === "layergroup") setExpanded(new Set([...expanded, node.data.layer]));
    else if (node.type === "pkg") setFocus(focus && focus.pkg === node.data.pkg.id && !focus.kind ? null : { pkg: node.data.pkg.id });
  };

  return (
    <>
    <div className="sw-colheads" aria-hidden="true">
      {vertical ? <><span className="k-produces">↑ produced by (public return)</span><span className="k-consumes">↓ consumed by</span></> : <><span className="k-produces">← produced by (public return)</span><span className="k-imports">↓ imports only (not public)</span><span className="k-consumes">consumed by (public parameter) →</span></>}
    </div>
    <div className="sw-canvas" data-testid="sw-canvas">
      {rows.length === 0 && <div className="sw-empty">No rows match these filters. Turn a kind back on, or clear "public only" / "declared only".</div>}
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodeClick={onNodeClick}
        onEdgeClick={(_, e) => e.data?.onClick?.()} onPaneClick={() => setFocus(null)}
        fitView fitViewOptions={{ padding: 0.1, maxZoom: 1.1 }} minZoom={0.2} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false}
        onInit={(rf) => { setTimeout(() => { rf.fitView({ padding: 0.1, maxZoom: 1.1 }); requestAnimationFrame(markReady); }, 60); }}>
        <Background gap={22} size={1} color="var(--line)" />
        <Controls showInteractive={false} position="bottom-right" />
        <FitOnChange layoutKey={layoutKey} padding={0.1} maxZoom={1.1} />
      </ReactFlow>
    </div>
    </>
  );
}

function Rail({ graph, counts, current, go }) {
  const [q, setQ] = useState("");
  const max = Math.max(1, ...Object.values(counts).map((c) => c.total));
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const m = new Map();
    for (const t of graph.types) {
      if (ql && !(`${t.name} ${t.module} ${t.what || ""}`.toLowerCase().includes(ql))) continue;
      if (!m.has(t.module)) m.set(t.module, []);
      m.get(t.module).push(t);
    }
    for (const list of m.values()) list.sort((a, b) => (counts[b.id]?.total || 0) - (counts[a.id]?.total || 0) || a.name.localeCompare(b.name));
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [graph, q, counts]);
  return (
    <aside className="rail" data-testid="rail">
      <div className="rail-head">
        <input type="search" placeholder={`Search ${graph.types.length} types`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="type-search" />
        <div className="rail-legend"><i className="b-produces" />produces <i className="b-consumes" />consumes <i className="b-imports" />imports</div>
      </div>
      <div className="rail-list">
        {groups.map(([mod, list]) => (
          <div key={mod} className="rail-group">
            <div className="rail-mod">{mod}</div>
            {list.map((t) => {
              const c = counts[t.id] || { total: 0 };
              return (
                <button key={t.id} className={"rail-type" + (t.id === current.id ? " on" : "") + (c.total ? "" : " unused")}
                  onClick={() => go("types", typeKey(graph, t))} data-testid={`rail-type-${t.name}`} title={t.what || ""}>
                  <span className="rail-name">{t.name}</span>
                  <span className="rail-n">{c.total}</span>
                  <span className="rail-bar">
                    {KINDS.map((k) => c[k] ? <i key={k} className={"b-" + k} style={{ width: `${(c[k] / max) * 100}%` }} /> : null)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <p className="muted small" style={{ padding: "8px 12px" }}>No type matches “{q}”.</p>}
      </div>
    </aside>
  );
}

function RowsPanel({ graph, type, rows, focus, setFocus, pkgById, go }) {
  const shown = rows.filter((u) => {
    if (!focus) return true;
    if (focus.layer) return pkgById[u.package]?.layer === focus.layer && (!focus.kind || u.kind === focus.kind);
    return u.package === focus.pkg && (!focus.kind || u.kind === focus.kind);
  });
  const st = { verified: 0, found: 0, missing: 0 };
  for (const u of shown) st[useState_(u)]++;
  const byPkg = new Map();
  for (const u of shown) { if (!byPkg.has(u.package)) byPkg.set(u.package, []); byPkg.get(u.package).push(u); }
  const pkgs = [...byPkg].sort((a, b) => layerIndex(pkgById[a[0]]?.layer) - layerIndex(pkgById[b[0]]?.layer) || a[0].localeCompare(b[0]));
  const kOrder = { produces: 0, consumes: 1, imports: 2 };
  const label = focus ? (focus.layer ? `${LAYER_LABEL[focus.layer] || focus.layer} layer` : focus.pkg) + (focus.kind ? ` · ${focus.kind}` : "") : null;
  return (
    <aside className="rows" data-testid="rows-panel">
      <div className="rows-head">
        <div className="rows-title"><b>{shown.length}</b> {shown.length === 1 ? "row" : "rows"} behind <code>{type.name}</code></div>
        {label ? <button className="crumb" onClick={() => setFocus(null)} data-testid="clear-focus">{label} <span aria-hidden>×</span></button>
          : <div className="muted small">Click a package or an edge's count to narrow this list.</div>}
        <div className="rows-st">
          <span className="flag st-verified">{st.verified} declared + verified</span>
          <span className="flag st-found">{st.found} found, not declared</span>
          {st.missing > 0 && <span className="flag st-missing">{st.missing} lint fail</span>}
        </div>
      </div>
      <div className="rows-list">
        {pkgs.map(([p, list]) => {
          const kc = {}; for (const u of list) kc[u.kind] = (kc[u.kind] || 0) + 1;
          return (
            <section key={p} className="rows-pkg" data-testid={`rows-pkg-${p}`}>
              <div className="rows-pkg-head">
                <button className="rows-pkg-name" onClick={() => go("packages", p)} title="open this package in the Packages tab" data-testid={`rows-open-${p}`}><code>{p}</code></button>
                <span className="muted small">{LAYER_LABEL[pkgById[p]?.layer] || ""}</span>
                <span className="rows-kc">{KINDS.filter((k) => kc[k]).map((k) => <span key={k} className={"kind k-" + k}>{k} {kc[k]}</span>)}</span>
              </div>
              {pkgById[p] && <PkgLinks pkg={pkgById[p]} compact className="rows-links" />}
              {[...list].sort((a, b) => kOrder[a.kind] - kOrder[b.kind] || a.symbol.localeCompare(b.symbol)).map((u, i) => (
                <UseRow key={i} graph={graph} use={u} showPackage={false} showType={false} />
              ))}
            </section>
          );
        })}
        {shown.length === 0 && <p className="muted small">Nothing here with the current filters.</p>}
      </div>
    </aside>
  );
}

function Intro({ go }) {
  const [open, setOpen] = useState(() => store.get("rsdk-v2-intro") !== "closed");
  const toggle = () => { const v = !open; setOpen(v); store.set("rsdk-v2-intro", v ? "open" : "closed"); };
  if (!open) return <button className="intro-reopen btn ghost" onClick={toggle} data-testid="intro-toggle">What is robot-sdk?</button>;
  return (
    <section className="intro" data-testid="intro">
      <div className="intro-text">
        <p><b>Start from a type.</b> robot-sdk's packages meet only on robot_msgs types: pick one from the list to see who produces it, who consumes it, and where in the code. One install, versions pinned to a set known to work together.</p>
        <p className="intro-rule"><b>The layer rule.</b> {LAYER_RULE}</p>
      </div>
      <div className="intro-actions"><Install /><button className="btn" onClick={() => go("example")} data-testid="intro-run">See the real run →</button><button className="btn ghost" onClick={() => go("packages")} data-testid="intro-directory">Package directory →</button></div>
      <button className="intro-close" onClick={toggle} aria-label="hide the intro" data-testid="intro-toggle">×</button>
    </section>
  );
}

function TypeHeader({ graph, type, all }) {
  const owners = graph.packages.find((p) => p.id === type.package);
  const pk = { produces: new Set(), consumes: new Set(), imports: new Set() };
  for (const u of all) pk[u.kind].add(u.package);
  const verified = all.filter((u) => u.declared && u.verified).length;
  return (
    <div className="th" data-testid="type-header">
      <div className="th-main">
        <h1>{type.name}</h1>
        <code className="th-mod">{type.module}</code>
        {type.docs_url && <a href={type.docs_url} target="_blank" rel="noreferrer" className="small">docs ↗</a>}
        {owners && <a href={`${owners.repo_url}`} target="_blank" rel="noreferrer" className="small">defined in {owners.id} ↗</a>}
      </div>
      <p className="th-what">{type.what || "—"}</p>
      <div className="th-stats">
        <span><b>{all.length}</b> rows</span>
        <span className="k-produces"><b>{pk.produces.size}</b> produce</span>
        <span className="k-consumes"><b>{pk.consumes.size}</b> consume</span>
        <span className="k-imports"><b>{pk.imports.size}</b> import</span>
        <span><b>{verified}</b> of {all.length} declared + verified</span>
      </div>
    </div>
  );
}

function Toolbar({ filters, setFilters, layers, expanded, setExpanded }) {
  const chip = (key, label, on, onClick, cls = "") => (
    <button className={`chip ${cls} ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick} data-testid={`chip-${key}`}>{label}</button>
  );
  const toggleKind = (k) => setFilters({ ...filters, show: { ...filters.show, [k]: !filters.show[k] } });
  return (
    <div className="tb" data-testid="toolbar">
      <div className="tb-group">
        <span className="tb-label">show</span>
        {KINDS.map((k) => chip(k, k === "imports" ? "imports (not public)" : k, filters.show[k], () => toggleKind(k), "kc-" + k))}
      </div>
      <div className="tb-group">
        {chip("public", "public only", filters.publicOnly, () => setFilters({ ...filters, publicOnly: !filters.publicOnly }))}
        {chip("declared", "declared only", filters.declaredOnly, () => setFilters({ ...filters, declaredOnly: !filters.declaredOnly }))}
      </div>
      <div className="tb-group">
        {chip("group", "group by layer", filters.groupByLayer, () => { setFilters({ ...filters, groupByLayer: !filters.groupByLayer }); setExpanded(new Set()); })}
        {filters.groupByLayer && layers.map((l) => {
          const open = expanded.has(l);
          return <button key={l} className={`chip mini ${open ? "" : "on"}`} data-testid={`layer-chip-${l}`}
            onClick={() => { const s = new Set(expanded); open ? s.delete(l) : s.add(l); setExpanded(s); }}
            title={open ? "collapse this layer" : "expand this layer"}>{open ? "▾" : "▸"} {LAYER_LABEL[l] || l}</button>;
        })}
      </div>
    </div>
  );
}

export function TypesTab({ graph, type, go, filters, setFilters }) {
  const counts = useMemo(() => typeCounts(graph), [graph]);
  const pkgById = useMemo(() => byId(graph.packages), [graph]);
  const all = useMemo(() => usesOfType(graph, type.id), [graph, type]);
  const rows = useMemo(() => filterRows(all, filters), [all, filters]);
  const [focus, setFocus] = useState(null);
  const [ring, setRing] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  useEffect(() => { setFocus(null); setRing(null); }, [type.id]);
  const layers = [...new Set(rows.map((u) => pkgById[u.package]?.layer))].sort((a, b) => layerIndex(a) - layerIndex(b));
  return (
    <div className="types-tab">
      <Rail graph={graph} counts={counts} current={type} go={go} />
      <main className="centre">
        <Intro go={go} />
        <TypeHeader graph={graph} type={type} all={all} />
        <Toolbar filters={filters} setFilters={setFilters} layers={layers} expanded={expanded} setExpanded={setExpanded} />
        <ReactFlowProvider>
          <Switchboard graph={graph} type={type} rows={rows} filters={filters} focus={focus} setFocus={setFocus}
            ring={ring} setRing={setRing} expanded={expanded} setExpanded={setExpanded} go={go} />
        </ReactFlowProvider>
        <div className="centre-foot">
          <Legend items={["produces", "consumes", "imports"]} />
          <span className="muted small">Edge numbers = rows (one per symbol). Click a count, a package or a layer; <b>+N types</b> opens a package's other types.</span>
        </div>
      </main>
      <RowsPanel graph={graph} type={type} rows={rows} focus={focus} setFocus={setFocus} pkgById={pkgById} go={go} />
    </div>
  );
}
