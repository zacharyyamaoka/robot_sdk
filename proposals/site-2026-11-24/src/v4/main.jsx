// V4 "Catalog": Zach's standard catalog view as the landing page (Daily Note 2026-11-24: "basically like our standard
// catalog view I think on the landing page almost... the population ids become the rows in the catalog.. data-ui").
// Every package, type, use and agent is a row you filter; the graph is the neighbourhood of the row you selected.
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "@shared/kit.css";
import "./style.css";
import { useData, useHashRoute } from "@shared/data.js";
import { stats, LAYER_LABEL, LAYER_BLURB, LAYER_ORDER, USE_STATE_LABEL, shortType, sourceUrl, agentKpi } from "@shared/graph.js";
import { PITCH, PITCH_2, LAYER_RULE, AGENT_RULE, REPO_URL, Install, SkillBlock, Provenance, PickPlaceStages, Plots, PkgLinks } from "@shared/parts.jsx";
import { buildModel } from "./model.js";
import { FacetRail, Table, applyFacets } from "./catalog.jsx";
import { PackagePanel, TypePanel, UsePanel, AgentPanel } from "./panels.jsx";
import { PackageGraph } from "./pkggraph.jsx";

const TABS = [
  { id: "packages", label: "Packages" }, { id: "types", label: "Types" }, { id: "uses", label: "Uses" },
  { id: "agents", label: "Agents" }, { id: "example", label: "Example" }, { id: "skill", label: "For coding agents" },
];
const TAB_OF = { pkg: "packages", type: "types", use: "uses", agent: "agents" };
const markReady = () => { document.documentElement.dataset.ready = "1"; };

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

function names(list, max = 2) {
  if (!list.length) return <span className="faint">0</span>;
  if (max === 0) return <span className="names" title={list.join(", ")}><b>{list.length}</b></span>;
  return <span className="names" title={list.join(", ")}><b>{list.length}</b> <span className="muted">{list.slice(0, max).join(", ")}{list.length > max ? ` +${list.length - max}` : ""}</span></span>;
}

// g5 (Zach): robot-sdk is a directory. Every package/viewer/agent row carries its own links, one click from the
// table: the in-site drill-down ("Open", which bubbles to the row click) first, then GitHub · Site · PyPI · README.
function LinksCell({ pkg, agent }) {
  return <span className="links-cell"><button className="open-btn" data-testid={"open-" + (agent ? agent.id : pkg.id)} title="types, uses and neighbourhood">Open ›</button>{agent ? <PkgLinks agent={agent} compact /> : <PkgLinks pkg={pkg} compact />}</span>;
}

function specs(m) {
  const layerIdx = (l) => { const i = m.layers.indexOf(l); return i < 0 ? 99 : i; };
  return {
    packages: {
      rows: m.packageRows, defaultSort: { key: "layer", dir: "asc" },
      facets: [
        { key: "layer", label: "Layer", value: (r) => r.layer, order: (vs) => vs.sort((a, b) => layerIdx(a) - layerIdx(b)), labelOf: (v) => LAYER_LABEL[v] || v, title: (v) => LAYER_BLURB[v] },
        { key: "role", label: "Role", value: (r) => r.role, className: (v) => (v === "viewer" ? "is-viewer" : "") },
        { key: "lint", label: "Lint", value: (r) => r.lint, className: (v) => "lint-" + v },
      ],
      columns: [
        { key: "id", label: "Package", width: 190, render: (r) => <span className="cell-id"><code>{r.id}</code>{r.role === "viewer" && <span className="badge viewer">viewer</span>}</span> },
        { key: "layer", label: "Layer", width: 104, sort: (r) => r.layerRank * 1000 + 0, render: (r) => <span className={"layer-pill l-" + r.layer}>{r.layerLabel}</span> },
        { key: "role", label: "Role", width: 70, hideWithPanel: true },
        { key: "one_line", label: "What it is", cls: "ellip", hideWithPanel: true },
        { key: "version", label: "Version", width: 70, cls: "mono", hideWithPanel: true },
        { key: "deps", label: "Deps", width: 54, num: true, defaultDir: "desc", title: "robot-sdk packages it requires (pyproject, extras included)" },
        { key: "uses", label: "Uses", width: 56, num: true, defaultDir: "desc", title: "robot_msgs type uses found in its code" },
        { key: "lint", label: "Lint", width: 64, render: (r) => <span className={"lint lint-" + r.lint}>{r.lint}</span> },
        { key: "links", label: "Links", width: 304, sort: (r) => r.id, cls: "links-td", render: (r) => <LinksCell pkg={r.pkg} /> },
      ],
      groupBy: (r, sort) => (sort.key === "layer" ? { id: r.role === "viewer" ? "~viewer" : r.layer, label: r.role === "viewer" ? "viewers" : r.layerLabel, blurb: LAYER_BLURB[r.role === "viewer" ? "viewers" : r.layer] } : null),
    },
    types: {
      rows: m.typeRows, defaultSort: { key: "uses", dir: "desc" },
      facets: [
        { key: "module", label: "Module", value: (r) => r.module },
        { key: "bucket", label: "Used by", value: (r) => r.bucket, order: (vs) => vs.sort((a, b) => m.BUCKET_ORDER.indexOf(a) - m.BUCKET_ORDER.indexOf(b)) },
        { key: "as", label: "Used as", value: (r) => [...(r.producers.length ? ["produced"] : []), ...(r.consumers.length ? ["consumed"] : []), ...(r.importers.length ? ["imported only"] : [])] },
      ],
      columns: [
        { key: "name", label: "Type", width: 180, render: (r) => <code className="strong">{r.name}</code> },
        { key: "module", label: "Module", width: 170, cls: "mono small-cell", hideWithPanel: true },
        { key: "what", label: "What", cls: "ellip", hideWithPanel: true },
        { key: "producers", label: "Producers", width: 150, sort: (r) => r.producers.length, defaultDir: "desc", render: (r) => names(r.producers, 1) },
        { key: "consumers", label: "Consumers", width: 150, sort: (r) => r.consumers.length, defaultDir: "desc", render: (r) => names(r.consumers, 1) },
        { key: "importers", label: "Importers", width: 80, sort: (r) => r.importers.length, defaultDir: "desc", render: (r) => names(r.importers, 0) },
        { key: "uses", label: "Uses", width: 62, num: true, defaultDir: "desc" },
      ],
    },
    uses: {
      rows: m.useRows, defaultSort: { key: "package", dir: "asc" }, pageSize: 50,
      facets: [
        { key: "type", label: "Type", value: (r) => r.type, labelOf: shortType, limit: 6 },
        { key: "state", label: "Declared / verified", value: (r) => r.state, labelOf: (v) => USE_STATE_LABEL[v] || v, className: (v) => "st-" + v, order: (vs) => vs.sort((a, b) => ["verified", "found", "missing"].indexOf(a) - ["verified", "found", "missing"].indexOf(b)) },
        { key: "kind", label: "Kind", value: (r) => r.useKind, className: (v) => "kf-" + v },
        { key: "public", label: "Public", value: (r) => r.public },
        { key: "package", label: "Package", value: (r) => r.package, limit: 5 },
      ],
      columns: [
        { key: "package", label: "Package", width: 160, foldConst: true, render: (r) => <code>{r.package}</code> },
        { key: "useKind", label: "Kind", width: 100, foldConst: true, render: (r) => <span className={"kind k-" + r.useKind}>{r.useKind}</span> },
        { key: "typeName", label: "Type", width: 170, foldConst: true, render: (r) => <code className="strong">{r.typeName}</code> },
        { key: "symbol", label: "Symbol", cls: "ellip mono small-cell", hideWithPanel: true },
        { key: "public", label: "Public", width: 76 },
        { key: "state", label: "State", width: 146, sort: (r) => ["verified", "found", "missing"].indexOf(r.state), render: (r) => <span className={"flag st-" + r.state}>{r.state === "verified" ? "declared + verified" : r.state === "found" ? "found, not declared" : "declared, not found"}</span> },
        { key: "where", label: "file:line", cls: "ellip", render: (r) => {
          // WHY the tail: the line number is the part a reader needs; the full path is the title and the row's panel.
          const url = sourceUrl(m.graph, r.package, r.where); const parts = r.where.split("/"); const short = parts.length > 1 ? "…/" + parts.pop() : r.where; // explicit ellipsis
          return url ? <a href={url} target="_blank" rel="noreferrer" className="where" title={r.where} onClick={(e) => e.stopPropagation()}>{short}</a> : <code title={r.where}>{short}</code>; } },
      ],
    },
    agents: {
      rows: m.agentRows, defaultSort: { key: "name", dir: "asc" },
      facets: [
        { key: "status", label: "Status", value: (r) => r.status },
        { key: "builds_on", label: "Builds on", value: (r) => r.builds_on },
      ],
      columns: [
        { key: "name", label: "Agent", width: 210, render: (r) => <b>{r.name}</b> },
        { key: "objective", label: "Objective", cls: "ellip", hideWithPanel: true },
        { key: "kpi", label: "KPI", width: 200, hideWithPanel: true, sort: (r) => r.kpi?.value ?? 0, render: (r) => { const k = agentKpi(r.agent); return k ? <span title={k.name}><b>{k.display}</b> <span className="muted small">{k.name.split(" ")[0]}</span></span> : <span className="faint">no status.json</span>; } },
        { key: "status", label: "Status", width: 90, render: (r) => <span className={"tag status-" + r.status}>{r.status}</span> },
        { key: "links", label: "Links", width: 230, sort: (r) => r.id, cls: "links-td", render: (r) => <LinksCell agent={r.agent} /> },
        { key: "builds_on", label: "Builds on", width: 280, cls: "wrap", sort: (r) => r.builds_on.length, render: (r) => <span className="chips">{r.builds_on.map((p) => <code key={p}>{p}</code>)}</span> },
      ],
    },
  };
}

function TabHeader({ tab, m, s, pkgView, setPkgView }) {
  const T = {
    packages: ["Packages by layer", LAYER_RULE],
    types: ["robot_msgs types", `The types every package joins on. Producers return one from the public API, consumers take one as a parameter, importers use it internally. ${s.typesUsed} of ${s.types} are used.`],
    uses: ["Every use of a type", `One row per package, type, kind and symbol, found by an ast scan of the code. ${s.declared} of ${s.uses} are declared in a package's robot-sdk.toml; the rest were found in code but not declared yet.`],
    agents: ["Agents", AGENT_RULE],
  }[tab];
  return (
    <div className="tab-head">
      <div><h2>{T[0]}</h2><p className="muted">{T[1]}</p></div>
      {tab === "packages" && <div className="seg" role="group" aria-label="view">
        <button className={pkgView === "table" ? "on" : ""} onClick={() => setPkgView("table")} data-testid="pkg-view-table">Table</button>
        <button className={pkgView === "graph" ? "on" : ""} onClick={() => setPkgView("graph")} data-testid="pkg-view-graph">Graph</button>
      </div>}
    </div>
  );
}

function SidePanel({ m, rowKey, onClose, onOpen, onUses, width, setWidth }) {
  const row = m.rowByKey[rowKey];
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo?.(0, 0); }, [rowKey]);
  useEffect(() => { const on = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [onClose]);
  const drag = (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    const move = (ev) => setWidth(Math.max(380, Math.min(Math.min(980, window.innerWidth - 420), w0 + (x0 - ev.clientX))));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  if (!row) return <aside className="panel" ref={ref}><div className="panel-body"><p className="muted">This row is not in the current graph.json.</p><button className="btn" onClick={onClose}>Close</button></div></aside>;
  const P = { pkg: PackagePanel, type: TypePanel, use: UsePanel, agent: AgentPanel }[row.kind];
  return (
    <aside className="panel" ref={ref} data-testid="side-panel">
      <div className="panel-grip" onPointerDown={drag} title="drag to resize" />
      <div className="panel-top"><span className="muted small">{row.kind === "pkg" ? "package" : row.kind} row</span>
        <button className="btn ghost sm" onClick={onClose} data-testid="panel-close" aria-label="close panel">✕ Close</button></div>
      <div className="panel-body"><P m={m} row={row} onOpen={onOpen} onUses={onUses} onReady={markReady} /></div>
    </aside>
  );
}

function CatalogTab({ tab, m, spec, filters, setFilters, search, setSearch, sort, setSort, selectedKey, onRow, pkgView, onOpen, panelOpen }) {
  const [railOpen, setRailOpen] = useState(false);
  const q = search.trim().toLowerCase();
  const rows = applyFacets(spec.rows, spec.facets, filters).filter((r) => !q || q.split(/\s+/).every((w) => r.text.includes(w)));
  const nSel = Object.values(filters).reduce((a, v) => a + (v?.length || 0), 0);
  const graphMode = tab === "packages" && pkgView === "graph";
  return (
    <div className="cat">
      <FacetRail rows={spec.rows} facets={spec.facets} filters={filters} setFilters={setFilters} tabId={tab} open={railOpen} />
      <div className="cat-main">
        <div className="toolbar">
          <button className="btn rail-toggle" onClick={() => setRailOpen(!railOpen)} data-testid={`rail-toggle-${tab}`}>Filters{nSel ? ` (${nSel})` : ""}</button>
          <input className="search" type="search" placeholder={`Search ${tab}…`} value={search} onChange={(e) => setSearch(e.target.value)} data-testid={`search-${tab}`} />
          <span className="count" data-testid={`count-${tab}`}><b>{rows.length}</b> of {spec.rows.length}</span>
          {nSel > 0 && <button className="linkish small" onClick={() => setFilters({})} data-testid={`clear-all-${tab}`}>clear filters</button>}
        </div>
        {nSel > 0 && <div className="pills">{spec.facets.flatMap((f) => (filters[f.key] || []).map((v) => (
          <button key={f.key + v} className="pill" onClick={() => setFilters({ ...filters, [f.key]: filters[f.key].filter((x) => x !== v) })}>
            {f.label}: {f.labelOf ? f.labelOf(v) : v} ✕</button>)))}</div>}
        {graphMode ? <PackageGraph model={m} rows={rows} selectedKey={selectedKey} onOpen={onOpen} onReady={markReady} />
          : <Table key={tab} tabId={tab} rows={rows} columns={spec.columns} sort={sort} setSort={setSort} selectedKey={selectedKey} onRow={onRow}
            groupBy={spec.groupBy ? (r) => spec.groupBy(r, sort) : null} pageSize={spec.pageSize} panelOpen={panelOpen} />}
        {!panelOpen && !graphMode && rows.length > 0 && <p className="hint muted small">Click a row to open its details and neighbourhood graph.</p>}
      </div>
    </div>
  );
}

function Example({ pick, onOpen }) {
  const [active, setActive] = useState(null);
  return (
    <div className="example">
      <div className="tab-head"><div><h2>{pick.title}</h2>
        <p className="muted">Each stage is one call into one package, passing robot_msgs objects along. Click a stage to open its package row.</p></div></div>
      <div className="ex-grid">
        <div data-testid="example-stages"><PickPlaceStages pick={pick} active={active} onStage={(i) => { setActive(i); onOpen("pkg:" + pick.stages[i].package); }} /></div>
        <Plots size="lg" />
      </div>
    </div>
  );
}

function Skill() {
  return (
    <div className="skill">
      <div className="tab-head"><div><h2>For coding agents</h2><p className="muted">{PITCH_2}</p></div></div>
      <div className="skill-grid">
        <div className="card pad"><h3>Install the library</h3><Install /><p className="muted small">Or one package at a time: every package keeps its own PyPI name (see the Packages tab).</p></div>
        <div className="card pad"><h3>Hand the skill to your agent</h3><SkillBlock /></div>
      </div>
    </div>
  );
}

function App() {
  const { data, error } = useData();
  const [route, go] = useHashRoute("packages");
  const [filters, setFiltersAll] = useState({ packages: {}, types: {}, uses: {}, agents: {} });
  const [search, setSearchAll] = useState({ packages: "", types: "", uses: "", agents: "" });
  const [sorts, setSorts] = useState({});
  const [pkgView, setPkgView] = useState("table");
  const [panelW, setPanelW_] = useState(() => lsGet("robot-sdk-v4/panel-w", 560));
  const setPanelW = (w) => { setPanelW_(w); lsSet("robot-sdk-v4/panel-w", w); };
  const m = useMemo(() => (data ? buildModel(data.graph) : null), [data]);
  const S = useMemo(() => (m ? specs(m) : null), [m]);
  const s = useMemo(() => (data ? stats(data.graph) : null), [data]);

  useEffect(() => { if (m) requestAnimationFrame(() => requestAnimationFrame(markReady)); }, [m]);
  if (error) return <div className="boot">Could not load graph.json: {String(error.message || error)}</div>;
  if (!m) return <div className="boot muted">Loading the robot-sdk graph…</div>;

  const tab = TABS.some((t) => t.id === route[0]) ? route[0] : "packages";
  const selectedKey = route[1] || null;
  const onOpen = (key) => go(TAB_OF[key.split(":")[0]] || tab, key);
  const onUses = (f) => { setFiltersAll((x) => ({ ...x, uses: f })); go("uses"); };
  const spec = S[tab];
  const panelOpen = !!(spec && selectedKey && m.rowByKey[selectedKey]?.kind && TAB_OF[m.rowByKey[selectedKey].kind] === tab) || (spec && selectedKey);
  const chip = (n, label, to, f, testid) => (
    <a className="count-chip" href={"#/" + to} data-testid={testid} onClick={(e) => { e.preventDefault(); if (f) setFiltersAll((x) => ({ ...x, [to]: f })); else if (to === "packages") setFiltersAll((x) => ({ ...x, packages: {} })); go(to); }}>
      <b>{n}</b><span>{label}</span></a>);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/packages" onClick={(e) => { e.preventDefault(); go("packages"); }}><span className="logo">◆</span> robot-sdk</a>
        <Provenance graph={data.graph} graphSource={data.graphSource} compact />
        <a className="gh" href={REPO_URL} target="_blank" rel="noreferrer">GitHub ↗</a>
      </header>
      <section className="hero">
        <div className="hero-text">
          <h1>robot-sdk</h1>
          <p className="pitch">{PITCH}</p>
          <div className="hero-actions"><Install />
            <a className="btn" href="#/example" onClick={(e) => { e.preventDefault(); go("example"); }} data-testid="hero-example">See the pick-and-place run →</a></div>
        </div>
        <nav className="counts" aria-label="catalog">
          {chip(s.packages, "packages", "packages", null, "chip-packages")}
          {chip(s.viewers, s.viewers === 1 ? "viewer" : "viewers", "packages", { role: ["viewer"] }, "chip-viewers")}
          {chip(s.types, "types", "types", null, "chip-types")}
          {chip(s.uses, "uses", "uses", null, "chip-uses")}
          {chip(s.agents, s.agents === 1 ? "agent" : "agents", "agents", null, "chip-agents")}
        </nav>
      </section>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <a key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} href={"#/" + t.id} data-testid={`tab-${t.id}`}
            onClick={(e) => { e.preventDefault(); go(t.id); }}>{t.label}
            {S[t.id] && <span className="tab-n">{S[t.id].rows.length}</span>}</a>))}
      </nav>
      <main className={"work" + (spec && panelOpen ? " with-panel" : "")} style={{ "--pw": panelW + "px" }}>
        {spec ? (
          <>
            <div className="work-main">
              <TabHeader tab={tab} m={m} s={s} pkgView={pkgView} setPkgView={setPkgView} />
              <CatalogTab tab={tab} m={m} spec={spec} filters={filters[tab]} setFilters={(f) => setFiltersAll((x) => ({ ...x, [tab]: f }))}
                search={search[tab]} setSearch={(v) => setSearchAll((x) => ({ ...x, [tab]: v }))}
                sort={sorts[tab] || spec.defaultSort} setSort={(v) => setSorts((x) => ({ ...x, [tab]: v }))}
                selectedKey={selectedKey} onRow={(r) => go(tab, r.key)} pkgView={pkgView} onOpen={onOpen} panelOpen={panelOpen} />
            </div>
            {panelOpen && <SidePanel m={m} rowKey={selectedKey} onClose={() => go(tab)} onOpen={onOpen} onUses={onUses} width={panelW} setWidth={setPanelW} />}
          </>
        ) : tab === "example" ? <Example pick={data.pick} onOpen={onOpen} /> : <Skill />}
      </main>
      <footer className="foot muted small">
        <span>Every row and edge is generated from code by <code>tools/sdk_graph</code> into <code>site/data/graph.json</code>; nothing is hand-drawn.</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">{REPO_URL.replace("https://", "")}</a>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
