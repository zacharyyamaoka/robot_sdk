// Round-1 content blocks, adapted for workspaces: the pitch + install, the real pick-and-place run, the agents, and
// "For coding agents". Text and numbers come from README.md (PITCH), pick_and_place.json and graph.json only.
import { PITCH, PITCH_2, LAYER_RULE, AGENT_RULE, REPO_URL, SKILL_URL, Install, CopyCode, SkillBlock, Plots, PLOTS, PkgLinks } from "@shared/parts.jsx";
import { fmtDate } from "@shared/graph.js";
import { TypeText } from "./types.jsx";
import { HealthDot, HealthInline } from "./health.jsx";
import { healthOf } from "./model.js";

export { PITCH, PITCH_2, LAYER_RULE, AGENT_RULE, REPO_URL, SKILL_URL, Install, CopyCode, SkillBlock, Plots, PLOTS, PkgLinks };

// An agent's card from its status.json (ai-team-status/1). Same look as round 1's shared AgentCard, but a KPI whose
// value is not measured yet says so (round 1 printed "null h" for the Robot SDK Agent).
export function AgentCard({ agent, compact = false }) {
  const s = agent.status || {};
  const k = s.kpi || null;
  const v = k == null || k.value == null ? null : typeof k.value === "number" ? (Math.abs(k.value) < 1 ? k.value.toFixed(3) : k.value.toFixed(1)) : String(k.value);
  return (
    <div className="agent-card k-agent-card">
      <div className="agent-head">
        <b>{agent.name}</b>
        {s.status && <span className={"tag status-" + s.status}>{s.status}</span>}
        {k?.on_track != null && <span className={"tag " + (k.on_track ? "ok" : "bad")}>{k.on_track ? "on track" : "off track"}</span>}
      </div>
      <p className="agent-objective">{agent.objective || agent.one_line}</p>
      {k && <div className="agent-kpi">
        {v != null ? <div className="kpi-value">{v} <small>{k.unit}</small></div> : <div className="kpi-value k-kpi-none">not measured yet</div>}
        <div className="kpi-name">{k.name}</div>
        {(k.level || k.level_name) && <div className="kpi-sub">{[k.level, k.level_name].filter(Boolean).join(" · ")}</div>}
        {k.next_gate && <div className="kpi-sub">next gate: {k.next_gate}</div>}
      </div>}
      {!compact && s.todo && <div className="agent-todo">
        <div className="muted small">to-do: {s.todo.open} open · {s.todo.done_7d} done in 7 days{s.blocked_on ? ` · blocked on ${s.blocked_on}` : ""}</div>
        {s.todo.top?.[0] && <p className="small clamp3">Next: {s.todo.top[0]}</p>}
      </div>}
      <div className="agent-links">
        {agent.repo_url && <a href={agent.repo_url} target="_blank" rel="noreferrer">repo</a>}
        {s.links?.report && agent.repo_url && <a href={`${agent.repo_url}/blob/main/${s.links.report}`} target="_blank" rel="noreferrer">{s.links.report}</a>}
        {s.updated_t && <span className="muted small">status.json updated {fmtDate(new Date(s.updated_t * 1000).toISOString())}</span>}
      </div>
    </div>
  );
}

// What robot-sdk is, pip install, and the way to the run (criterion fr6). compact: one line + install.
export function Pitch({ compact = false, onOpenRun, onOpenTypes, className = "" }) {
  return (
    <section className={"k-pitch" + (compact ? " k-compact" : "") + " " + className} data-testid="pitch">
      {!compact && <div className="k-eyebrow">Robotics backend in plain Python</div>}
      <p className="k-pitch-main">{PITCH}</p>
      {!compact && <p className="k-muted k-small">{PITCH_2}</p>}
      <div className="k-pitch-actions">
        <Install />
        {onOpenRun && <button className="k-btn" onClick={onOpenRun} data-testid="pitch-run">See it pick and place →</button>}
        {onOpenTypes && <button className="k-btn k-btn-ghost" onClick={onOpenTypes}>Browse by type →</button>}
      </div>
    </section>
  );
}

// The real run: each stage is one call into one package; the types between them are links. Plots below.
// Props: pick (pick_and_place.json), graph, health, onOpenType(key), onOpenPackage(id), plots = true.
export function RunPanel({ pick, graph, health, onOpenType, onOpenPackage, plots = true, className = "" }) {
  if (!pick) return <p className="k-muted">pick_and_place.json is not available.</p>;
  const pk = Object.fromEntries(graph.packages.map((p) => [p.id, p]));
  return (
    <section className={"k-run " + className} data-testid="run-panel">
      <div className="k-run-head">
        <h3>{pick.title}</h3>
        <p><span className="k-tag k-tag-warn">simulated plant</span> <span className="k-muted k-small">{pick.plant}</span></p>
        <p className="k-muted k-small">Each stage is one robot-sdk package; what passes between them is a robot_msgs type. Click a type to see every other function that takes or returns it.</p>
      </div>
      <ol className="k-run-stages">
        {pick.stages.map((st, i) => (
          <li key={i} className="k-run-stage">
            <div className="k-run-n">{i + 1}</div>
            <div className="k-run-body">
              <div className="k-run-pkg">
                {health && <HealthDot state={healthOf(health, st.package)?.state || "unknown"} />}
                {onOpenPackage && pk[st.package] ? <button className="k-linkish" onClick={() => onOpenPackage(st.package)}><code>{st.package}</code></button> : <code>{st.package}</code>}
                {pk[st.package] ? <PkgLinks pkg={pk[st.package]} compact /> : <span className="k-faint k-small">not in this version</span>}
              </div>
              <code className="k-run-call">{st.call}</code>
              <div className="k-run-io">
                <div><span className="k-run-l">in</span><span><TypeText text={st.input_type} graph={graph} onOpenType={onOpenType} /></span></div>
                <div><span className="k-run-l">out</span><span><TypeText text={st.output_type} graph={graph} onOpenType={onOpenType} /></span></div>
              </div>
              <div className="k-run-result">{st.one_line_result}</div>
            </div>
          </li>
        ))}
      </ol>
      {pick.skipped?.length > 0 && <details className="k-run-skipped"><summary>Skipped on purpose ({pick.skipped.length})</summary>
        <ul>{pick.skipped.map((s) => <li key={s.package}><code>{s.package}</code>: {s.why}</li>)}</ul></details>}
      <p className="k-faint k-small">Run {fmtDate(pick.run?.date)} · {pick.run?.runtime_s} s · MuJoCo {pick.run?.mujoco} · {Object.entries(pick.run?.git || {}).map(([k, v]) => `${k}@${v}`).join(" · ")}</p>
      {plots && <><h4 className="k-run-h">Plots from the run <span className="k-tag k-tag-warn">simulated plant</span></h4><Plots size="md" /></>}
    </section>
  );
}

// The agents (graph.agents): KPI card, health, what each builds on (links into Packages), its own links.
export function AgentsPanel({ graph, health, onOpenPackage, compact = false, className = "" }) {
  const agents = graph.agents || [];
  return (
    <section className={"k-agents " + className} data-testid="agents-panel">
      <p className="k-rule">{AGENT_RULE}</p>
      {!agents.length && <p className="k-muted">No agents in this version's graph.</p>}
      <div className="k-agents-grid">
        {agents.map((a) => (
          <div key={a.id} className="k-agent-wrap" data-testid={"agent-" + a.id}>
            <AgentCard agent={a} compact={compact} />
            {health && healthOf(health, a.id) && <div className="k-agent-line"><span className="k-muted k-small">health</span><HealthInline health={health} id={a.id} max={3} /></div>}
            <div className="k-agent-line"><span className="k-muted k-small">builds on</span>
              {(a.builds_on || []).map((p) => onOpenPackage ? <button key={p} className="k-chip" onClick={() => onOpenPackage(p)}><code>{p}</code></button> : <code key={p} className="k-chip">{p}</code>)}
              {!(a.builds_on || []).length && <span className="k-faint k-small">nothing yet</span>}</div>
            <div className="k-agent-line"><span className="k-muted k-small">this agent</span><PkgLinks agent={a} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

// For coding agents: the skill, then plain pip.
export function SkillPanel({ className = "" }) {
  return (
    <section className={"k-skill " + className} data-testid="skill-panel">
      <p className="k-muted">Hand the SDK to Claude Code or Codex. The skill indexes every package so a new robotics task is assembled from them, passing robot_msgs objects between packages — the same types this site is organised around.</p>
      <div className="k-skill-card"><SkillBlock /></div>
      <div className="k-skill-card"><b>Or just the packages</b><div className="k-skill-pip"><Install /></div></div>
      <p className="k-faint k-small"><a href={REPO_URL} target="_blank" rel="noreferrer">robot_sdk on GitHub</a> · <a href={SKILL_URL} target="_blank" rel="noreferrer">skill/SKILL.md</a></p>
    </section>
  );
}
