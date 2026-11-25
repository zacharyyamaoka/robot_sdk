// V3 node components. Semantic zoom: every node reads the camera's zoom tier and shows more as you zoom in
// (far: names only; mid: + layer / use counts; near: + one_line, version, lint). WHY: the brief's "must not open as an
// unreadable hairball" — at map scale only names are drawn, and they are drawn large.
import { createContext, useContext } from "react";
import { Handle, Position, useStore } from "@xyflow/react";
import { LAYER_BLURB, shortType, stats, agentKpi, fmtDate } from "@shared/graph.js";
import { PITCH, PITCH_2, LAYER_RULE, AGENT_RULE, REPO_URL, Install, SkillBlock, Provenance, AgentCard, PLOTS, PkgLinks } from "@shared/parts.jsx";
import { pkgTypeSummary } from "./layout3.js";

export const MapCtx = createContext(null);
export const useMap = () => useContext(MapCtx);

const tierOf = (z) => (z < 0.72 ? "far" : z < 1.2 ? "mid" : "near");
export const useTier = () => useStore((s) => tierOf(s.transform[2]));
const useZoom = () => useStore((s) => Math.round(s.transform[2] * 50) / 50);

const H = (p) => <Handle {...p} isConnectable={false} />;
function Handles() {
  return (<>
    <H type="target" position={Position.Top} id="t" /><H type="source" position={Position.Top} id="ts" />
    <H type="target" position={Position.Bottom} id="b" /><H type="source" position={Position.Bottom} id="bs" />
    <H type="target" position={Position.Left} id="l" /><H type="source" position={Position.Left} id="ls" />
    <H type="target" position={Position.Right} id="r" /><H type="source" position={Position.Right} id="rs" />
    {/* type-use ports: produces / consumes / imports leave a package at different points so the three never overlap */}
    <H type="source" position={Position.Bottom} id="kp" style={{ left: "30%" }} /><H type="target" position={Position.Bottom} id="kc" style={{ left: "70%" }} />
    <H type="source" position={Position.Bottom} id="ki" style={{ left: "50%" }} />
    <H type="target" position={Position.Top} id="tp" style={{ left: "30%" }} /><H type="source" position={Position.Top} id="tc" style={{ left: "70%" }} />
    <H type="target" position={Position.Top} id="ti" style={{ left: "50%" }} />
  </>);
}

const SUMMARY = {
  what: (g) => "pitch · install · the layer rule",
  packages: (g, s) => `${s.packages} packages in ${new Set(g.packages.map((p) => p.layer)).size} layers · ${s.depEdges} dependency edges`,
  types: (g, s) => `${s.types} types · ${s.uses} uses · ${g.uses.filter((u) => u.declared && u.verified).length} declared + verified`,
  pick: (g, s, pick) => `${pick?.stages?.length || 0} stages · 3 plots · simulated plant (MuJoCo)`,
  agents: (g, s) => `${s.agents} agent${s.agents === 1 ? "" : "s"} · builds on ${new Set((g.agents || []).flatMap((a) => a.builds_on || [])).size} packages`,
  skill: () => "the robot-sdk skill and its install line",
};

export function RegionNode({ data }) {
  const m = useMap();
  const z = useZoom();
  const s = stats(m.graph);
  // Title stays readable from far away: it grows as the camera zooms out (counter-scaled), capped.
  const fs = Math.min(110, Math.max(26, 17 / Math.max(z, 0.05)));
  return (
    <div className={`v3-region r-${data.region} ${data.collapsed ? "collapsed" : ""} ${m.dimRegion(data.region) ? "dim" : ""}`}>
      <Handles />
      <div className="v3-region-head">
        <span className="v3-region-title" style={{ fontSize: fs }}>{data.title}</span>
        <button className="v3-mini nodrag" data-testid={`toggle-region-${data.region}`}
          onClick={(e) => { e.stopPropagation(); m.toggleRegion(data.region); }}>{data.collapsed ? "expand" : "collapse"}</button>
      </div>
      {(data.collapsed || z < 0.3) && <div className="v3-region-sum" style={{ fontSize: data.collapsed ? 15 : Math.min(40, 13 / Math.max(z, 0.05)) }}>{SUMMARY[data.region](m.graph, s, m.pick)}</div>}
    </div>
  );
}

export function LayerNode({ data }) {
  const m = useMap();
  const tier = useTier();
  const hot = m.hotLayer(data.layer);
  const lit = data.collapsed ? data.members.map(m.litFor).filter(Boolean).reduce((a, c) => ({ produces: a.produces + c.produces, consumes: a.consumes + c.consumes, imports: a.imports + c.imports }), { produces: 0, consumes: 0, imports: 0 }) : null;
  const anyLit = lit && (lit.produces || lit.consumes || lit.imports);
  return (
    <div className={`v3-layer t-${tier} ${data.viewer ? "viewer" : ""} ${data.collapsed ? "collapsed" : ""} ${m.dimLayer(data.layer) ? "dim" : ""} ${hot ? "hot" : ""}`}
      onClick={data.collapsed ? (e) => { e.stopPropagation(); m.toggleLayer(data.layer); } : undefined}>
      <Handles />
      <div className="v3-layer-head">
        <span className="v3-layer-label">{data.label}</span>
        <span className="v3-count">{data.members.length}</span>
        <button className="v3-mini nodrag" data-testid={`toggle-layer-${data.layer}`}
          onClick={(e) => { e.stopPropagation(); m.toggleLayer(data.layer); }}>{data.collapsed ? "expand" : "collapse"}</button>
      </div>
      {!data.collapsed && <div className="v3-layer-blurb">{LAYER_BLURB[data.layer] || ""}</div>}
      {data.collapsed && <div className="v3-layer-members">{data.members.join(" · ")}</div>}
      {data.collapsed && anyLit && <div className="v3-lit v3-layer-lit">{["produces", "consumes", "imports"].filter((k) => lit[k]).map((k) => <span key={k} className={"kind k-" + k}>{k} {lit[k]}</span>)}</div>}
    </div>
  );
}

export function Pkg3({ data }) {
  const m = useMap();
  const tier = useTier();
  const p = data.pkg;
  const n = m.idx.byPkg.get(p.id)?.length || 0;
  const rows = data.expanded ? pkgTypeSummary(m.graph, m.idx, p.id) : null;
  const st = m.nodeState("pkg:" + p.id);
  const lit = m.litFor(p.id);
  const defines = m.graph.types.filter((t) => t.package === p.id).length;
  return (
    <div className={`v3-pkg layer-${p.layer} role-${p.role} t-${tier} ${st}`} data-testid={`pkg-${p.id}`}
      onClick={(e) => { e.stopPropagation(); m.select({ kind: "pkg", id: p.id }); }}>
      <Handles />
      <div className="v3-pkg-top">
        <span className="v3-pkg-name" title={p.id}>{p.id}</span>
        <span className={`v3-lint l-${p.lint}`} title={`lint: ${p.lint}`} />
        {tier === "far" && n > 0 && <button className="v3-mini v3-far-expand nodrag" data-testid={`expand-pkg-${p.id}`} title={data.expanded ? "fold the type list" : "list its types in place"}
          onClick={(e) => { e.stopPropagation(); m.toggleExpand(p.id); }}>{data.expanded ? "▴" : "▾"}</button>}
      </div>
      {tier !== "far" && <div className="v3-pkg-sub">
        {p.role === "viewer" && <span className="v3-viewer-tag">viewer</span>}
        <span>{defines ? `defines ${defines} types` : `${n} uses`}</span><span className="faint">· v{p.version}</span>
        <button className="v3-mini nodrag" data-testid={`expand-pkg-${p.id}`} disabled={n === 0}
          onClick={(e) => { e.stopPropagation(); m.toggleExpand(p.id); }}>{data.expanded ? "fold" : "types ▾"}</button>
      </div>}
      {/* Directory (gate g5): every package card carries its own way out, one click from the map. The in-site
          drill-down (types ▾ above, the inspector on click) comes first; these chips come after it. */}
      <PkgLinks pkg={p} compact={tier === "far"} className="v3-pkg-links" />
      {lit && <div className="v3-lit">{["produces", "consumes", "imports"].filter((k) => lit[k]).map((k) => <span key={k} className={"kind k-" + k}>{k} {lit[k]}</span>)}</div>}
      {tier === "near" && !data.expanded && !lit && <div className="v3-pkg-line">{p.one_line}</div>}
      {data.expanded && <div className="v3-pkg-types">
        <div className="v3-pkg-types-head"><span>{rows.length} types</span><span className="k-p">prod</span><span className="k-c">cons</span><span className="k-i">imp</span></div>
        {rows.map((r) => (
          <div key={r.type} className="v3-pkg-trow nodrag" onClick={(e) => { e.stopPropagation(); m.select({ kind: "type", id: r.type }); }}>
            <code>{shortType(r.type)}</code><span className="k-p">{r.produces || ""}</span><span className="k-c">{r.consumes || ""}</span><span className="k-i">{r.imports || ""}</span>
          </div>))}
      </div>}
    </div>
  );
}

export function ModuleNode({ data }) {
  const tier = useTier();
  const m = useMap();
  return (
    <div className={`v3-module ${m.dimModule(data.label) ? "dim" : ""}`}>
      <Handles />
      <div className="v3-module-head"><span>{data.label}</span>{tier !== "far" && <span className="faint">{data.uses} uses</span>}</div>
    </div>
  );
}

export function Type3({ data }) {
  const m = useMap();
  const tier = useTier();
  const t = data.type;
  const st = m.nodeState("type:" + t.id);
  return (
    <div className={`v3-type t-${tier} ${st}`} data-testid={`type-${t.name}`} title={t.what || t.id}
      onClick={(e) => { e.stopPropagation(); m.select({ kind: "type", id: t.id }); }}>
      <Handles />
      <div className="v3-type-name">{t.name}</div>
      {tier !== "far" && <div className="v3-type-sub">{data.uses} uses · {data.pkgs} pkg{data.pkgs === 1 ? "" : "s"}</div>}
    </div>
  );
}

export function WhatNode() {
  const m = useMap();
  const s = stats(m.graph);
  const top = m.topType;
  const verified = m.graph.uses.filter((u) => u.declared && u.verified).length;
  return (
    <div className="v3-what nodrag-text">
      <div className="v3-kicker">robot-sdk · plain-Python robotics backend</div>
      <h1>The robot-* packages, as one map.</h1>
      <p className="v3-pitch">{PITCH}</p>
      <p>{PITCH_2}</p>
      <div className="nodrag"><Install /></div>
      <div className="v3-rule"><b>The layer rule.</b> {LAYER_RULE}</div>
      <div className="v3-stats">
        <span><b>{s.libraries}</b> libraries</span><span><b>{s.viewers}</b> viewer{s.viewers === 1 ? "" : "s"}</span>
        <span><b>{s.types}</b> robot_msgs types</span><span><b>{s.uses}</b> type uses</span>
        <span><b>{verified}</b> declared + verified</span><span><b>{s.agents}</b> agent{s.agents === 1 ? "" : "s"}</span>
      </div>
      <div className="v3-cta nodrag">
        {top && <button className="btn on" data-testid="cta-top-type" onClick={() => m.select({ kind: "type", id: top.id }, { fly: true })}>
          Who uses {top.name}? <span className="v3-cta-sub">most-used type · {top.n} uses</span></button>}
        <button className="btn" data-testid="cta-pick" onClick={() => m.fly("pick")}>The pick-and-place run →</button>
        <button className="btn" data-testid="cta-agents" onClick={() => m.fly("agents")}>Agents →</button>
      </div>
      <p className="v3-hint">This page is one map. Scroll or pinch to zoom, drag to pan, click any package or type. Every box and line is generated from the code (graph.json).</p>
      <div className="nodrag"><Provenance graph={m.graph} graphSource={m.graphSource} compact /></div>
    </div>
  );
}

export function SkillNode() {
  return (
    <div className="v3-text v3-skill nodrag">
      <h3>Hand the SDK to a coding agent</h3>
      <SkillBlock />
    </div>
  );
}

export function PickNote() {
  const m = useMap();
  const pick = m.pick;
  return (
    <div className="v3-text v3-note">
      <div className="v3-note-row"><span className="tag warn-soft">simulated plant</span> <span>{pick.plant}</span></div>
      <div className="small muted">{pick.title}. Each stage is one call into one package; the line between two stages is the type handed over. Skipped on purpose: {(pick.skipped || []).map((s) => <span key={s.package} title={s.why}><code>{s.package}</code> </span>)}</div>
      <div className="small faint">Run {fmtDate(pick.run?.date)} · {pick.run?.runtime_s} s · MuJoCo {pick.run?.mujoco}</div>
    </div>
  );
}

export function StageNode({ data }) {
  const m = useMap();
  const tier = useTier();
  const s = data.stage;
  return (
    <div className={`v3-stage t-${tier}`} data-testid={`stage-${data.i}`}>
      <Handles />
      <div className="v3-stage-top"><span className="v3-stage-n">{data.i + 1}</span>
        <button className="v3-linklike nodrag" onClick={(e) => { e.stopPropagation(); m.select({ kind: "pkg", id: s.package }, { fly: true }); }} title="show this package on the map">{s.package}</button></div>
      <div className="v3-stage-io"><span>{s.input_type}</span><span className="faint">→</span><b>{s.output_type}</b></div>
      <div className="v3-stage-res">{s.one_line_result}</div>
      <code className="v3-stage-call" title={s.call}>{s.call}</code>
    </div>
  );
}

export function PlotNode({ data }) {
  const p = PLOTS[data.i];
  return (
    <figure className="v3-plot">
      <img src={p.src} alt={p.title} draggable={false} />
      <figcaption><b>{p.title}.</b> {p.caption} <span className="tag warn-soft">simulated</span></figcaption>
    </figure>
  );
}

export function AgentNote() {
  return <div className="v3-text v3-note"><b>Agents build packages; packages never import agents.</b> <span className="muted">{AGENT_RULE}</span> <span className="faint">The dotted purple lines run from each agent to the packages it builds on.</span></div>;
}

export function Agent3({ data }) {
  const m = useMap();
  const st = m.nodeState("agent:" + data.agent.id);
  return (
    <div className={`v3-agent ${st}`} data-testid={`agent-${data.agent.id}`} onClick={(e) => { e.stopPropagation(); m.select({ kind: "agent", id: data.agent.id }); }}>
      <Handles />
      <div className="v3-agent-links nodrag"><button className="v3-mini" onClick={(e) => { e.stopPropagation(); m.select({ kind: "agent", id: data.agent.id }); }}>details</button><PkgLinks agent={data.agent} /></div>
      <AgentCard agent={data.agent} graph={m.graph} />
    </div>
  );
}

export const nodeTypes3 = {
  region: RegionNode, layer: LayerNode, pkg3: Pkg3, module: ModuleNode, type3: Type3, what: WhatNode, skill: SkillNode,
  pickNote: PickNote, stage: StageNode, plot: PlotNode, agentNote: AgentNote, agent3: Agent3,
};

// Pick-and-place hand-over: the arrow between two stages, with the type it carries written under the stage row
// (the gap between stages is too narrow for "robot_reach.ReachMap"; a dotted drop line ties label to arrow).
import { BaseEdge, EdgeLabelRenderer, getStraightPath } from "@xyflow/react";
export function HandoverEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, data }) {
  const [path, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const drop = data?.drop || 200;
  return (<>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
    <path d={`M ${lx} ${ly + 6} L ${lx} ${ly + drop - 4}`} stroke="var(--faint)" strokeDasharray="2 4" fill="none" />
    <EdgeLabelRenderer>
      <div className="v3-handover nodrag nopan" style={{ transform: `translate(-50%, 0) translate(${lx}px, ${ly + drop}px)` }}>{data?.label}</div>
    </EdgeLabelRenderer>
  </>);
}
export const edgeTypes3 = { handover: HandoverEdge };
