// V2 "Type Switchboard": the robot_msgs TYPE is the front door. Pick a type and the page re-centres on who produces
// it, who consumes it and where in the code. WHY: README's own rule, "the type is the API" — packages never import
// each other at the leaves, they meet on a type, so the type is the natural unit to ask questions about.
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "@shared/kit.css";
import "./v2.css";
import { useData, useHashRoute } from "@shared/data.js";
import { stats, byId, LAYER_LABEL } from "@shared/graph.js";
import { Provenance, Install, Plots, AgentCard, SkillBlock, PkgLinks, PITCH, AGENT_RULE, REPO_URL } from "@shared/parts.jsx";
import { TypesTab } from "./types-tab.jsx";
import { PackagesTab } from "./packages-tab.jsx";
import { mostUsedType, resolveType, typeKey } from "./sw-model.js";
import { markReady } from "./util.js";

const TABS = [["types", "Types"], ["packages", "Packages"], ["example", "Example"], ["agents", "Agents"], ["skill", "For coding agents"]];

function Header({ data, tab, go, s }) {
  const counts = { types: s.types, packages: s.packages, example: data.pick.stages.length, agents: s.agents };
  return (
    <header className="hdr">
      <div className="hdr-top">
        <a className="brand" href="#/types" onClick={(e) => { e.preventDefault(); go("types"); }}><span className="brand-mark" aria-hidden>◆</span>robot-sdk</a>
        <p className="hdr-pitch">{PITCH}</p>
        <div className="hdr-actions"><Install /><a className="btn ghost" href={REPO_URL} target="_blank" rel="noreferrer">GitHub ↗</a></div>
      </div>
      <div className="hdr-bottom">
        <nav className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={"tab" + (tab === id ? " on" : "")} onClick={() => go(id)} data-testid={`tab-${id}`}>
              {label}{counts[id] != null && <span className="tab-n">{counts[id]}</span>}
            </button>
          ))}
        </nav>
        <Provenance graph={data.graph} graphSource={data.graphSource} compact />
      </div>
    </header>
  );
}

// Find robot_msgs type names inside the run's free-text stage descriptions, so each one links into the switchboard.
// WHY the package guard: "robot_diagnostics Trajectory" is that package's own Trajectory, not robot_msgs' one.
function TypeText({ text, graph, go }) {
  const names = [...new Set(graph.types.map((t) => t.name))].sort((a, b) => b.length - a.length);
  const pkgIds = graph.packages.map((p) => p.id).filter((p) => p !== "robot_msgs");
  const re = new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
  const out = []; let last = 0, m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index);
    if (pkgIds.some((p) => before.endsWith(p + " ") || before.endsWith(p + "."))) continue;
    const t = graph.types.find((x) => x.name === m[1]);
    out.push(text.slice(last, m.index));
    out.push(<button key={m.index} className="tlink" onClick={() => go("types", typeKey(graph, t))} data-testid={`tp-type-${t.name}`} title={`${t.module}: who produces and consumes it`}>{m[1]}</button>);
    last = m.index + m[1].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

function ExampleTab({ data, go }) {
  const { pick, graph } = data;
  return (
    <div className="page" data-testid="example">
      <div className="page-head">
        <h1>{pick.title}</h1>
        <p><span className="tag warn-soft">simulated plant</span> {pick.plant}</p>
        <p className="muted small">Each stage is one robot-sdk package; what passes between them is a robot_msgs type. Click a type to see every other package that produces or consumes it.</p>
      </div>
      <ol className="tpath" data-testid="type-path">
        {pick.stages.map((st, i) => (
          <li key={i} className="tp-stage">
            <div className="tp-n">{i + 1}</div>
            <div className="tp-body">
              <div className="tp-pkgline"><button className="tp-pkg" onClick={() => go("packages", st.package)} data-testid={`tp-pkg-${i}`}><code>{st.package}</code></button>
                {graph.packages.find((p) => p.id === st.package) && <PkgLinks pkg={graph.packages.find((p) => p.id === st.package)} compact />}</div>
              <code className="tp-call">{st.call}</code>
              <div className="tp-io">
                <div><span className="tp-io-l">in</span><span><TypeText text={st.input_type} graph={graph} go={go} /></span></div>
                <div><span className="tp-io-l">out</span><span><TypeText text={st.output_type} graph={graph} go={go} /></span></div>
              </div>
              <div className="tp-result">{st.one_line_result}</div>
            </div>
          </li>
        ))}
      </ol>
      {pick.skipped?.length > 0 && <div className="tp-skipped"><b>Skipped on purpose.</b>
        <ul>{pick.skipped.map((s) => <li key={s.package}><code>{s.package}</code>: {s.why}</li>)}</ul></div>}
      <p className="muted small">Run {new Date(pick.run?.date).toLocaleString("en-CA")} · {pick.run?.runtime_s} s · MuJoCo {pick.run?.mujoco} · {Object.entries(pick.run?.git || {}).map(([k, v]) => `${k}@${v}`).join(" · ")}</p>
      <h2>Plots from the run <span className="tag warn-soft">simulated plant</span></h2>
      <Plots size="md" />
    </div>
  );
}

function AgentsTab({ data, go }) {
  const agents = data.graph.agents || [];
  return (
    <div className="page" data-testid="agents">
      <div className="page-head">
        <h1>Agents</h1>
        <p className="rule-callout">{AGENT_RULE}</p>
      </div>
      {agents.length === 0 && <p className="muted">No agents in graph.json yet.</p>}
      <div className="agents-grid">
        {agents.map((a) => (
          <div key={a.id} className="agent-wrap">
            <AgentCard agent={a} graph={data.graph} />
            <div className="agent-walk">
              <span className="muted small">builds on (open in Packages):</span>
              {(a.builds_on || []).map((p) => <button key={p} className="pill" onClick={() => go("packages", p)} data-testid={`agent-pkg-${p}`}>{p}</button>)}
            </div>
            <div className="agent-walk"><span className="muted small">this agent:</span><PkgLinks agent={a} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillTab() {
  return (
    <div className="page narrow" data-testid="skill">
      <div className="page-head"><h1>For coding agents</h1>
        <p className="muted">Hand the SDK to Claude Code or Codex. The skill indexes every package so a new robotics task is assembled from them, passing robot_msgs objects between packages — the same types this site is organised around.</p></div>
      <div className="card pad"><SkillBlock /></div>
      <div className="card pad" style={{ marginTop: 14 }}><b>Or just the packages</b><div style={{ marginTop: 8 }}><Install /></div></div>
    </div>
  );
}

const DEFAULT_FILTERS = { show: { produces: true, consumes: true, imports: true }, publicOnly: false, declaredOnly: false, groupByLayer: false };

function App() {
  const { data, error } = useData();
  const [route, go] = useHashRoute("types");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const tab = TABS.some(([id]) => id === route[0]) ? route[0] : "types";
  const s = useMemo(() => (data ? stats(data.graph) : null), [data]);
  useEffect(() => { if (data && !["types", "packages"].includes(tab)) markReady(); }, [data, tab]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  if (error) return <div className="page"><h1>Could not load graph.json</h1><p>{String(error)}</p></div>;
  if (!data) return <div className="loading">Loading graph.json…</div>;
  const g = data.graph;
  const type = (tab === "types" && resolveType(g, route[1])) || mostUsedType(g);
  return (
    <div className={"app tab-" + tab}>
      <Header data={data} tab={tab} go={go} s={s} />
      {tab === "types" && <TypesTab graph={g} type={type} go={go} filters={filters} setFilters={setFilters} />}
      {tab === "packages" && <PackagesTab graph={g} selected={route[1]} go={go} />}
      {tab === "example" && <ExampleTab data={data} go={go} />}
      {tab === "agents" && <AgentsTab data={data} go={go} />}
      {tab === "skill" && <SkillTab />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
