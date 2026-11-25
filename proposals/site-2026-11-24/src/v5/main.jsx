// V5 "Commit Dashboard": the landing page is the SDK's health check at this commit. One calm verdict computed from
// graph.json first, KPI tiles, then the health map (package graph coloured by declared coverage and lint state) with a
// drawer, then agents / last run / viewers / skill cards.
// WHY (Zach, Daily Note 2026-11-24): "I like the landing page kinda is like almost like this dashboard tied to the commit."
// WHY calm: a use found in code but not declared yet is neutral ("not declared yet"), never red; red is only for a
// declared use the scanner did not find (a lint failure) or a package whose lint is "fail" (memory: calm UI).
import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@shared/kit.css";
import "./v5.css";
import { useData, useHashRoute } from "@shared/data.js";
import { provenance, fmtDate, agentKpi, shortType, layersOf } from "@shared/graph.js";
import { PITCH, PITCH_2, REPO_URL, Install, Legend } from "@shared/parts.jsx";
import { derive, pickSummary, pct, plural } from "./derive.js";
import { HealthMap, CovBar } from "./HealthMap.jsx";
import { Drawer } from "./Drawer.jsx";
import { AgentsCard, LastRunCard, ViewersCard, SkillCard } from "./Cards.jsx";

const TOP_N = 8;
const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function CommitStrip({ graph, graphSource }) {
  const p = provenance(graph);
  const shas = p.shas;
  const own = shas.find(([k]) => k === "robot_sdk");
  const rest = shas.filter(([k]) => k !== "robot_sdk");
  const dirty = shas.filter(([, v]) => /dirty/.test(String(v))).length;
  return (
    <div className="v5-commit card" data-testid="commit-strip">
      <div className="v5-commit-row">
        <span className={"v5-dot " + (p.seed ? "st-seed" : "st-verified")} />
        <b>{p.seed ? "Seed data" : "Generated"}</b>
        <span className="muted">{p.seed ? "hand-converted, awaiting tools/sdk_graph" : "by tools/sdk_graph from the code"}</span>
        <span className="tag">{graphSource}</span>
      </div>
      <dl className="v5-commit-dl">
        <div><dt>generated</dt><dd>{fmtDate(p.generated)}</dd></div>
        {own && <div><dt>commit</dt><dd><code>robot_sdk@{String(own[1]).replace("-dirty", "")}</code>{/dirty/.test(own[1]) && <span className="v5-dirty" title="uncommitted changes in what the scan reads"> + local changes</span>}</dd></div>}
        <div><dt>schema</dt><dd><code>{p.schema}</code></dd></div>
      </dl>
      {!p.seed && <details className="v5-commit-shas">
        <summary>{plural(rest.length, "source checkout")}{dirty ? <span className="muted"> · {dirty} with local changes</span> : null}</summary>
        <div className="v5-shalist">{rest.map(([k, v]) => <code key={k} className={/dirty/.test(String(v)) ? "dirty" : ""} title={/dirty/.test(String(v)) ? "uncommitted changes in what the scan reads" : ""}>{k}@{String(v).replace("-dirty", "")}{/dirty/.test(String(v)) ? "*" : ""}</code>)}</div>
        {dirty > 0 && <div className="muted small">* uncommitted changes in src/, pyproject, robot-sdk.toml, status.json or README at scan time</div>}
      </details>}
    </div>
  );
}

function Verdict({ graph, d, ps }) {
  const s = d.stats, t = d.total;
  const lintFail = s.lint.fail || 0, undecl = s.lint.undeclared || 0;
  const lintPhrase = lintFail ? `${lintFail} failing lint` : undecl ? `${s.packages - undecl} lint-pass, ${undecl} without a declaration` : "all lint-pass";
  const bad = lintFail > 0 || t.missing > 0;
  return (
    <div className={"v5-verdict" + (bad ? " bad" : "")} data-testid="verdict">
      <span className={"v5-dot big " + (bad ? "st-missing" : "st-verified")} />
      <p>
        <b>{s.packages} packages, {lintPhrase}.</b>{" "}
        {t.verified} of {t.total} type uses declared and verified; {t.found} found in code, not declared yet;{" "}
        {t.missing ? <span className="bad">{plural(t.missing, "lint failure")}</span> : "0 lint failures"}.
        <span className="muted"> {d.ruleBreaks.length ? <span className="bad">{plural(d.ruleBreaks.length, "dependency")} break the layer rule.</span> : `Every dependency points down the stack.`}</span>
      </p>
    </div>
  );
}

function Tile({ label, value, sub, children, onClick, testid, tone }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={"v5-tile" + (tone ? " " + tone : "") + (onClick ? " clickable" : "")} onClick={onClick} data-testid={testid}>
      <div className="v5-tile-label">{label}</div>
      <div className="v5-tile-value">{value}</div>
      {children}
      {sub && <div className="v5-tile-sub">{sub}</div>}
    </Tag>
  );
}

function Share({ label, n, of, cls }) {
  return (
    <div className="v5-share">
      <div className="v5-share-top"><span>{label}</span><b>{pct(n, of)}%</b></div>
      <div className="v5-sharebar"><span className={cls} style={{ width: `${pct(n, of)}%` }} /></div>
    </div>
  );
}

function Tiles({ graph, d, ps, onSelect, setMode }) {
  const s = d.stats;
  const top = d.typesByUse[0];
  const agent = (graph.agents || [])[0];
  const k = agent ? agentKpi(agent) : null;
  const lintFail = s.lint.fail || 0;
  return (
    <div className="v5-tiles">
      <Tile label="Packages" value={s.packages} testid="tile-packages" onClick={() => scrollTo("map")}
        sub={`${s.libraries} libraries · ${s.viewers} viewer${s.viewers === 1 ? "" : "s"} · ${layersOf(graph).length} layers`} />
      <Tile label="Types joined on" value={<>{s.typesUsed}<small> / {s.types}</small></>} testid="tile-types"
        onClick={top ? () => onSelect({ kind: "type", id: top.id, scroll: true }) : undefined}
        sub={top ? <>top: <code>{top.name}</code> · {d.usesByType[top.id].length}</> : "no types"} />
      <Tile label="Type uses" value={s.uses} testid="tile-uses" onClick={() => setMode({ onlyGaps: true })}>
        <Share label="declared + verified" n={d.total.verified} of={s.uses} cls="verified" />
        <Share label="on the public API" n={s.public} of={s.uses} cls="public" />
      </Tile>
      <Tile label="Lint" value={<>{s.lint.pass || 0}<small> pass</small></>} tone={lintFail ? "bad" : ""} testid="tile-lint"
        sub={<>{lintFail ? <span className="bad">{lintFail} fail</span> : "0 fail"} · {s.lint.undeclared || 0} undeclared</>} />
      {agent && <Tile label={`Agents · ${s.agents}`} value={k ? k.display : agent.name} testid="tile-agent" onClick={() => scrollTo("agents")}
        sub={<>{k ? <>{k.on_track ? "on track" : <span className="bad">off track</span>} · </> : null}{agent.name}</>} />}
      {ps && <Tile label="Last run · pick and place" value={ps.rms ? <>{ps.rms.value}<small> {ps.rms.unit} RMS</small></> : `${ps.stages} stages`} testid="tile-run" onClick={() => scrollTo("run")}
        sub={<><span className="tag warn-soft">simulated</span> {ps.verdict ? <>stop check <b className={ps.verdict === "FAIL" ? "warnt" : ""}>{ps.verdict}</b></> : null}</>} />}
    </div>
  );
}

function Toggle({ on, onClick, children, testid, title }) {
  return <button className={"btn v5-toggle" + (on ? " on" : "")} aria-pressed={on} onClick={onClick} data-testid={testid} title={title}>{children}</button>;
}

function App() {
  const { data, error } = useData();
  const [route, go] = useHashRoute("");
  const [showTypes, setShowTypes] = useState(false);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [showImports, setShowImports] = useState(true);
  const [showAgents, setShowAgents] = useState(true);
  const [allTypes, setAllTypes] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [filter, setFilter] = useState(null);

  const d = useMemo(() => (data ? derive(data.graph) : null), [data]);
  const ps = useMemo(() => (data ? pickSummary(data.pick) : null), [data]);
  const sel = useMemo(() => {
    if (!d || !route[0]) return null;
    if (route[0] === "pkg" && d.pkgIdx[route[1]]) return { kind: "pkg", id: route[1], typeFilter: route[2] || filter || undefined };
    if (route[0] === "type" && data.graph.types.some((t) => t.id === route[1])) return { kind: "type", id: route[1] };
    return null;
  }, [route, d, filter]);
  useEffect(() => { if (sel?.kind === "type") setShowTypes(true); }, [sel?.kind, sel?.id]);

  const onSelect = useCallback((s) => {
    if (!s) { history.replaceState(null, "", location.pathname + location.search); window.dispatchEvent(new HashChangeEvent("hashchange")); return; }
    setFilter(s.typeFilter || null);
    go(s.kind, s.id, s.typeFilter);
    // Picked from outside the map (a tile, a card, a chip below): bring the map and its drawer into view.
    if (s.scroll) scrollTo("map");
  }, [go]);
  const toggleLayer = useCallback((l) => setCollapsed((c) => { const n = new Set(c); n.has(l) ? n.delete(l) : n.add(l); return n; }), []);
  const setMode = useCallback((m) => { if (m.onlyGaps) setOnlyGaps(true); scrollTo("map"); }, []);

  const opts = useMemo(() => ({ showTypes, onlyGaps, showImports, showAgents, allTypes, topN: TOP_N, collapsed, sel, drawerOpen: !!sel,
    onToggleLayer: toggleLayer, onToggleTypes: () => setAllTypes((a) => !a) }), [showTypes, onlyGaps, showImports, showAgents, allTypes, collapsed, sel, toggleLayer]);

  if (error) return <div className="v5-wrap"><p className="bad">Could not load graph.json: {String(error)}</p></div>;
  if (!data || !d) return <div className="v5-wrap v5-loading muted">Loading the graph…</div>;
  const g = data.graph;
  const nImports = d.tEdges.filter((e) => e.kind === "imports").length;
  const usedTypes = d.typesByUse.filter((t) => d.usesByType[t.id]?.length).length;

  return (
    <>
      <nav className="v5-nav">
        <div className="v5-wrap v5-nav-in">
          <a className="v5-logo" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span className="v5-logo-mark" />robot-sdk</a>
          <div className="v5-nav-links">
            <button onClick={() => scrollTo("map")}>Health map</button>
            <button onClick={() => scrollTo("agents")}>Agents</button>
            <button onClick={() => scrollTo("run")}>Pick and place</button>
            <button onClick={() => scrollTo("viewers")}>Viewers</button>
            <button onClick={() => scrollTo("skill")}>For coding agents</button>
            <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </nav>
      <main className="v5-wrap">
        <header className="v5-hero">
          <div className="v5-hero-text">
            <div className="v5-titlerow"><h1>robot-sdk</h1><Install /></div>
            <p className="v5-pitch">{PITCH}</p>
            <p className="muted small v5-pitch2">{PITCH_2}</p>
          </div>
          <CommitStrip graph={g} graphSource={data.graphSource} />
        </header>

        <Verdict graph={g} d={d} ps={ps} />
        <Tiles graph={g} d={d} ps={ps} onSelect={onSelect} setMode={setMode} />

        <section id="map" className="v5-mapsec">
          <div className="v5-maphead">
            <h2>Health map</h2>
            <p className="muted small">Packages by layer, bottom to top; an arrow points at what a package needs. Bars: the share of its robot_msgs uses declared in robot-sdk.toml and verified by the linter.</p>
          </div>
          <div className="v5-maptools">
            <div className="v5-toolbar" role="toolbar">
              <Toggle on={showTypes} onClick={() => setShowTypes(!showTypes)} testid="toggle-types" title="Overlay the robot_msgs types with produce / consume edges">Type edges</Toggle>
              <Toggle on={onlyGaps} onClick={() => setOnlyGaps(!onlyGaps)} testid="toggle-gaps" title="Dim everything already declared and verified">Only gaps</Toggle>
              <Toggle on={showImports} onClick={() => setShowImports(!showImports)} testid="toggle-imports" title="Show uses that are not on the public API">imports · {nImports}</Toggle>
              <Toggle on={showAgents} onClick={() => setShowAgents(!showAgents)} testid="toggle-agents">Agents</Toggle>
              {showTypes && <button className="btn ghost" onClick={() => setAllTypes(!allTypes)} data-testid="toggle-alltypes">{allTypes ? `top ${Math.min(TOP_N, usedTypes)} types only` : `show all ${g.types.length} types`}</button>}
              {collapsed.size > 0 && <button className="btn ghost" data-testid="expand-all" onClick={() => setCollapsed(new Set())}>expand all</button>}
            </div>
            <div className="v5-maplegend">
                <Legend items={showTypes ? ["produces", "consumes", ...(showImports ? ["imports"] : []), "dep", "extra", ...(showAgents ? ["builds"] : [])] : ["dep", "extra", ...(showAgents ? ["builds"] : [])]} />
                <div className="v5-barlegend small"><span><i className="seg verified" />declared + verified</span><span><i className="seg found" />found, not declared yet</span><span><i className="seg missing" />declared, not found</span></div>
              </div>
          </div>
          <div className={"v5-mapgrid" + (sel ? " has-sel" : "")}>
            <div className={"v5-canvas" + (onlyGaps ? " v5-gaps" : "")} data-testid="health-map">
              <ReactFlowProvider>
                <HealthMap graph={g} d={d} opts={opts} onSelect={onSelect} onReady={() => { document.documentElement.dataset.ready = "1"; }} />
              </ReactFlowProvider>

            </div>
            <Drawer graph={g} d={d} sel={sel} onSelect={onSelect} collapsed={collapsed} onToggleLayer={toggleLayer} />
          </div>
        </section>

        <div className="v5-cards">
          <AgentsCard graph={g} onSelect={onSelect} />
          <LastRunCard pick={data.pick} ps={ps} onSelect={onSelect} />
          <ViewersCard graph={g} d={d} onSelect={onSelect} />
          <SkillCard />
        </div>

        <footer className="v5-foot small muted">
          <span>robot-sdk · every number on this page is computed from graph.json ({g.schema}, generated {fmtDate(g.generated)}) and pick_and_place.json.</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer">github.com/zacharyyamaoka/robot_sdk</a>
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
