// Content blocks every variant may use, so the five differ in structure and interaction, not in how well the same
// facts were typeset (babble: comparable fidelity). All text and numbers come from graph.json, pick_and_place.json,
// README.md or skill/SKILL.md.
import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import toolPath from "@repo/site/media/pick_and_place_tool_path.png";
import joints from "@repo/site/media/pick_and_place_joints.png";
import trackingError from "@repo/site/media/pick_and_place_tracking_error.png";
import { packageLinks, agentLinks, agentKpi, fmtDate, provenance, sourceUrl, shortType, useState_, USE_STATE_LABEL, KIND_LABEL, LAYER_LABEL } from "./graph.js";

export const PLOTS = [
  { src: toolPath, title: "Tool path", caption: "Commanded vs simulated tool path, 1.077 m over 5.35 s." },
  { src: joints, title: "Joints", caption: "Six joint angles, target vs simulated, in degrees." },
  { src: trackingError, title: "Tracking error", caption: "Tool error over time: RMS 9.15 mm, max 12.28 mm." },
];

// From README.md (robot_sdk), verbatim.
export const PITCH = "A generic, unbranded robotics backend in plain Python: messages, models, controllers, reach, thermal limits, trajectories and sim-to-real calibration.";
export const PITCH_2 = "One install for all of the robot-* packages, with versions pinned to a set known to work together. Each package keeps its own repo, its own PyPI name and its own release schedule.";
export const LAYER_RULE = "A package imports only from layers below it. Leaves never import each other: when one needs another's behaviour it takes a Protocol or a function as an argument. The type is the API.";
export const AGENT_RULE = "An agent imports packages; a package never imports an agent. A building block that wins in an agent's search moves into its package by a PR there.";
export const SKILL_URL = "https://github.com/zacharyyamaoka/robot_sdk/blob/main/skill/SKILL.md";
export const REPO_URL = "https://github.com/zacharyyamaoka/robot_sdk";

export function CopyCode({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copy-code">
      {label && <span className="copy-label">{label}</span>}
      <pre><code>{text}</code></pre>
      <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}>{done ? "Copied" : "Copy"}</button>
    </div>
  );
}

export function Install() { return <CopyCode text="pip install robot-sdk" />; }

export function SkillBlock({ compact = false }) {
  return (
    <div className="skill-block">
      {!compact && <p>An agent skill (Claude Code / Codex format): an index of every package and what it's for, so a coding agent assembles new robotics work from these packages instead of rewriting it. Its rule: <b>assemble, don't rewrite</b>.</p>}
      <CopyCode label="Claude Code" text={"git clone https://github.com/zacharyyamaoka/robot_sdk && ln -s \"$PWD/robot_sdk/skill\" ~/.claude/skills/robot-sdk"} />
      {!compact && <ol className="skill-steps">
        <li>Match the task to packages (most tasks touch two to four).</li>
        <li>Read each matching package's README before writing code.</li>
        <li>Assemble: pass robot_msgs objects between packages.</li>
        <li>Missing piece? Add it to the package where it belongs, not a one-off copy.</li>
        <li>Say what you reused.</li>
      </ol>}
      <a href={SKILL_URL} target="_blank" rel="noreferrer">skill/SKILL.md on GitHub</a>
    </div>
  );
}

export function Provenance({ graph, graphSource, compact = false }) {
  const p = provenance(graph);
  return (
    <div className={"provenance" + (compact ? " compact" : "")} title={p.seedNote || ""}>
      <span className="dot" data-seed={p.seed ? "1" : "0"} />
      <span>graph.json <b>{p.schema}</b> · generated {fmtDate(p.generated)}</span>
      {p.seed ? <span className="tag warn-soft">seed: hand-converted, awaiting tools/sdk_graph</span>
        : <span className="shas">{p.shas.slice(0, compact ? 3 : 20).map(([k, v]) => <code key={k}>{k}@{String(v).slice(0, 12)}</code>)}{compact && p.shas.length > 3 ? ` +${p.shas.length - 3}` : ""}</span>}
      <span className="tag">{graphSource}</span>
    </div>
  );
}

export function UseRow({ graph, use, showPackage = true, showType = true }) {
  const st = useState_(use);
  const url = sourceUrl(graph, use.package, use.where);
  return (
    <div className="use-row">
      <div className="use-head">
        {showPackage && <code className="pkg-name">{use.package}</code>}
        <span className={"kind k-" + use.kind}>{KIND_LABEL[use.kind] || use.kind}</span>
        {showType && <code className="type-name">{shortType(use.type)}</code>}
      </div>
      <div className="use-symbol">{use.symbol}</div>
      <div className="use-flags">
        <span className={"flag " + (use.public ? "on" : "off")}>{use.public ? "public API" : "internal"}</span>
        <span className={"flag st-" + st}>{USE_STATE_LABEL[st]}</span>
        {url ? <a className="where" href={url} target="_blank" rel="noreferrer">{use.where}</a> : <code className="where">{use.where}</code>}
      </div>
    </div>
  );
}

export function PickPlaceStages({ pick, onStage, active }) {
  return (
    <div className="pp">
      <p className="pp-plant"><span className="tag warn-soft">simulated plant</span> {pick.plant}</p>
      <ol className="pp-stages">
        {pick.stages.map((s, i) => (
          <li key={i} className={active === i ? "on" : ""} onClick={onStage ? () => onStage(i) : undefined} style={onStage ? { cursor: "pointer" } : null}>
            <div className="pp-pkg"><code>{s.package}</code></div>
            <div className="pp-call"><code>{s.call}</code></div>
            <div className="pp-io"><span>{s.input_type}</span><span className="arrow">→</span><span>{s.output_type}</span></div>
            <div className="pp-result">{s.one_line_result}</div>
          </li>
        ))}
      </ol>
      {pick.skipped?.length > 0 && <details className="pp-skipped"><summary>Skipped on purpose ({pick.skipped.length})</summary>
        <ul>{pick.skipped.map((s) => <li key={s.package}><code>{s.package}</code>: {s.why}</li>)}</ul></details>}
      <p className="pp-run muted">Run {fmtDate(pick.run?.date)} · {pick.run?.runtime_s} s · MuJoCo {pick.run?.mujoco} · {Object.entries(pick.run?.git || {}).map(([k, v]) => `${k}@${v}`).join(" · ")}</p>
    </div>
  );
}

export function Plots({ which = [0, 1, 2], size = "md" }) {
  return (
    <div className={"plots plots-" + size}>
      {which.map((i) => (
        <figure key={i}><img src={PLOTS[i].src} alt={PLOTS[i].title} loading="eager" /><figcaption><b>{PLOTS[i].title}.</b> {PLOTS[i].caption}</figcaption></figure>
      ))}
    </div>
  );
}

export function AgentCard({ agent, graph, compact = false }) {
  const k = agentKpi(agent);
  const s = agent.status || {};
  return (
    <div className="agent-card">
      <div className="agent-head">
        <b>{agent.name}</b>
        {s.status && <span className={"tag status-" + s.status}>{s.status}</span>}
        {k?.on_track != null && <span className={"tag " + (k.on_track ? "ok" : "bad")}>{k.on_track ? "on track" : "off track"}</span>}
      </div>
      <p className="agent-objective">{agent.objective}</p>
      {k && <div className="agent-kpi">
        <div className="kpi-value">{k.display}</div>
        <div className="kpi-name">{k.name}</div>
        <div className="kpi-sub">{k.level} · {k.level_name}</div>
        {k.next_gate && <div className="kpi-sub">next gate: {k.next_gate}</div>}
      </div>}
      <div className="agent-builds">builds on {(agent.builds_on || []).map((p) => <code key={p}>{p}</code>)}</div>
      {!compact && s.todo && <div className="agent-todo">
        <div className="muted small">to-do: {s.todo.open} open · {s.todo.done_7d} done in 7 days</div>
        {s.todo.top?.[0] && <p className="small clamp3">Next: {s.todo.top[0]}</p>}
      </div>}
      <div className="agent-links">
        <a href={agent.repo_url} target="_blank" rel="noreferrer">repo</a>
        {s.links?.report && <a href={`${agent.repo_url}/blob/main/${s.links.report}`} target="_blank" rel="noreferrer">{s.links.report}</a>}
        {s.updated_t && <span className="muted small">status.json updated {fmtDate(new Date(s.updated_t * 1000).toISOString())}</span>}
      </div>
    </div>
  );
}

// ---- React Flow nodes ------------------------------------------------------------------------------------------
const H = (props) => <Handle {...props} isConnectable={false} />;
function Handles() {
  return (<>
    <H type="target" position={Position.Top} id="t" /><H type="source" position={Position.Top} id="ts" />
    <H type="target" position={Position.Bottom} id="b" /><H type="source" position={Position.Bottom} id="bs" />
    <H type="target" position={Position.Left} id="l" /><H type="source" position={Position.Left} id="ls" />
    <H type="target" position={Position.Right} id="r" /><H type="source" position={Position.Right} id="rs" />
  </>);
}

export function PackageNode({ data }) {
  const p = data.pkg;
  return (
    <div className={`rf-pkg layer-${p.layer} role-${p.role} ${data.dim ? "dim" : ""} ${data.hot ? "hot" : ""}`}>
      <Handles />
      <div className="rf-pkg-name">{p.id}</div>
      <div className="rf-pkg-sub">{data.sub ?? LAYER_LABEL[p.layer] ?? p.layer}{data.badge ? <span className="rf-badge">{data.badge}</span> : null}</div>
    </div>
  );
}

export function TypeNode({ data }) {
  const t = data.type;
  return (
    <div className={`rf-type ${data.dim ? "dim" : ""} ${data.hot ? "hot" : ""}`}>
      <Handles />
      <div className="rf-type-name">{t.name}</div>
      {data.sub && <div className="rf-type-sub">{data.sub}</div>}
    </div>
  );
}

export function AgentNode({ data }) {
  const a = data.agent;
  const k = agentKpi(a);
  return (
    <div className={`rf-agent ${data.dim ? "dim" : ""}`}>
      <Handles />
      <div className="rf-agent-name">{a.name}</div>
      <div className="rf-agent-sub">agent{k ? ` · ${k.display}` : ""}</div>
    </div>
  );
}

// Group / layer container: a labelled band with a collapse toggle.
export function GroupNode({ data }) {
  return (
    <div className={`rf-group ${data.collapsed ? "collapsed" : ""}`} style={{ width: "100%", height: "100%" }}>
      <Handles />
      <div className="rf-group-head">
        <span className="rf-group-label">{data.label}</span>
        {data.count != null && <span className="rf-group-count">{data.count}</span>}
        {data.onToggle && <button className="rf-group-toggle nodrag" onClick={(e) => { e.stopPropagation(); data.onToggle(); }}>{data.collapsed ? "expand" : "collapse"}</button>}
      </div>
      {data.collapsed && data.members && <div className="rf-group-members">{data.members.join(" · ")}</div>}
    </div>
  );
}

export const nodeTypes = { pkg: PackageNode, type: TypeNode, agent: AgentNode, group: GroupNode };

// Edge look by meaning; one vocabulary across all five variants.
export function edgeStyle(kind, { dim = false, hot = false, state } = {}) {
  const color = { produces: "var(--produce)", consumes: "var(--consume)", imports: "var(--muted)", dep: "var(--dep)", extra: "var(--dep)", builds: "var(--agent)" }[kind] || "var(--muted)";
  const style = { stroke: color, strokeWidth: hot ? 3 : 1.8, opacity: dim ? 0.12 : 0.9 };
  if (kind === "extra" || kind === "imports") style.strokeDasharray = "6 5";
  if (kind === "builds") style.strokeDasharray = "2 4";
  if (state === "missing") { style.stroke = "var(--bad)"; style.strokeDasharray = "3 3"; }
  return style;
}
export function edgeMarker(kind) {
  const color = { produces: "#2f7d55", consumes: "#3567b5", imports: "#8a9099", dep: "#6b7280", extra: "#6b7280", builds: "#8b5cf6" }[kind] || "#8a9099";
  return { type: "arrowclosed", color, width: 16, height: 16 };
}

export function Legend({ items = ["produces", "consumes", "dep", "extra", "builds"] }) {
  const label = { produces: "produces (public return)", consumes: "consumes (public parameter)", imports: "imports (not public)", dep: "requires (pyproject)", extra: "optional extra", builds: "agent builds on" };
  return <div className="legend">{items.map((k) => <span key={k} className={"lg lg-" + k}>{label[k]}</span>)}</div>;
}

// One-click external links for a package (or agent): GitHub · its own site (only when it has one) · PyPI · README · docs.
// Put the in-site drill-down first and these after it (Zach: drill down here, then out to the package's own pages).
export function PkgLinks({ pkg, agent, compact = false, className = "" }) {
  const L = agent ? agentLinks(agent) : packageLinks(pkg);
  const items = [["github", "GitHub"], ["site", "Site"], ["pypi", "PyPI"], ["readme", "README"], ["docs", "Docs"]].filter(([k]) => L[k]);
  const stop = (e) => e.stopPropagation();
  return (
    <span className={"pkg-links " + (compact ? "compact " : "") + className} data-testid={"links-" + (agent ? agent.id : pkg?.id)}>
      {items.map(([k, label]) => (
        <a key={k} className={"pl pl-" + k + " nodrag"} href={L[k]} target="_blank" rel="noreferrer" onClick={stop} onPointerDown={stop} title={label + ": " + L[k]}>{label}{compact ? "" : " ↗"}</a>
      ))}
    </span>
  );
}
