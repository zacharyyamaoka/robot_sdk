// Dashboard cards under the health map: agents, the last pick-and-place run, viewers, the skill for coding agents.
import { useEffect, useState } from "react";
import { AgentCard, AGENT_RULE, PLOTS, SkillBlock, Install } from "@shared/parts.jsx";
import { fmtDate } from "@shared/graph.js";
import { CovBar } from "./HealthMap.jsx";
import { pct } from "./derive.js";

export function AgentsCard({ graph, onSelect }) {
  const agents = graph.agents || [];
  return (
    <section className="v5-card" id="agents" data-testid="card-agents">
      <header><h2>Agents</h2><span className="muted small">{agents.length} · from each agent's status.json</span></header>
      <p className="muted small v5-rule">{AGENT_RULE}</p>
      {agents.length === 0 && <p className="muted">No agents in graph.json.</p>}
      {agents.map((a) => {
        const s = a.status || {};
        return (
          <div key={a.id} className="v5-agent">
            <AgentCard agent={a} graph={graph} compact />
            <div className="v5-agent-extra">
              {s.remit && <p className="small"><span className="muted">Remit:</span> {s.remit}</p>}
              {s.counter_kpi && <p className="small"><span className="muted">Counter-KPI:</span> {s.counter_kpi.name}: <b>{typeof s.counter_kpi.value === "number" ? s.counter_kpi.value.toFixed(4) : s.counter_kpi.value} {s.counter_kpi.unit}</b></p>}
              {s.todo && <>
                <div className="v5-todo-n small"><span><b>{s.todo.open}</b> open</span><span><b>{s.todo.done_7d}</b> done in 7 days</span>{s.blocked_on ? <span className="bad">blocked on {s.blocked_on}</span> : <span className="muted">not blocked</span>}</div>
                <ol className="v5-todo small">{(s.todo.top || []).map((t, i) => <li key={i} className="clamp3">{t}</li>)}</ol>
              </>}
            </div>
          </div>);
      })}
    </section>
  );
}

function Lightbox({ i, onClose, onStep }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onStep(1); if (e.key === "ArrowLeft") onStep(-1); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, onStep]);
  const p = PLOTS[i];
  return (
    <div className="v5-lightbox" onClick={onClose} data-testid="lightbox">
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={p.src} alt={p.title} />
        <figcaption><b>{p.title}.</b> {p.caption} <span className="tag warn-soft">simulated plant</span>
          <span className="v5-lb-nav"><button className="btn ghost" onClick={() => onStep(-1)}>←</button><button className="btn ghost" onClick={() => onStep(1)}>→</button><button className="btn" onClick={onClose}>close</button></span></figcaption>
      </figure>
    </div>
  );
}

export function LastRunCard({ pick, ps, onSelect }) {
  const [open, setOpen] = useState(null);
  const [stage, setStage] = useState(null);
  return (
    <section className="v5-card" id="run" data-testid="card-run">
      <header><h2>Last run: pick and place</h2><span className="muted small">{fmtDate(pick.run?.date)} · {pick.run?.runtime_s} s wall · MuJoCo {pick.run?.mujoco}</span></header>
      <p className="small v5-plant"><span className="tag warn-soft">simulated plant</span> {pick.plant}</p>
      <div className="v5-run-kpis">
        {ps.rms && <div><div className="v5-big">{ps.rms.value} <small>{ps.rms.unit}</small></div><div className="small muted">tool error RMS{ps.max ? ` · max ${ps.max.value} ${ps.max.unit}` : ""}</div></div>}
        {ps.verdict && <div><div className={"v5-big " + (ps.verdict === "FAIL" ? "warn" : "")}>{ps.verdict}</div><div className="small muted">{ps.check || "diagnostic"}: {ps.diagDetail}</div></div>}
      </div>
      <ol className="v5-stages">
        {pick.stages.map((s, i) => (
          <li key={i} className={stage === i ? "on" : ""} onClick={() => setStage(stage === i ? null : i)}>
            <span className="v5-stage-n">{i + 1}</span>
            <div><button className="v5-chip" onClick={(e) => { e.stopPropagation(); onSelect({ kind: "pkg", id: s.package, scroll: true }); }}>{s.package}</button>
              <span className="small muted v5-io">{s.input_type} → {s.output_type}</span>
              <div className="small">{s.one_line_result}</div>
              {stage === i && <code className="v5-call">{s.call}</code>}</div>
          </li>))}
      </ol>
      {pick.skipped?.length > 0 && <details className="small v5-skipped"><summary>Skipped on purpose ({pick.skipped.length})</summary><ul>{pick.skipped.map((s) => <li key={s.package}><code>{s.package}</code>: {s.why}</li>)}</ul></details>}
      <div className="v5-thumbs">
        {PLOTS.map((p, i) => <button key={i} className="v5-thumb" data-testid={`plot-${i}`} onClick={() => setOpen(i)}><img src={p.src} alt={p.title} /><span>{p.title}</span></button>)}
      </div>
      <p className="small muted v5-shas">Run built from {Object.entries(pick.run?.git || {}).map(([k, v]) => <code key={k} className={/dirty/.test(v) ? "dirty" : ""}>{k}@{v}</code>)}</p>
      {open != null && <Lightbox i={open} onClose={() => setOpen(null)} onStep={(s) => setOpen((open + s + PLOTS.length) % PLOTS.length)} />}
    </section>
  );
}

export function ViewersCard({ graph, d, onSelect }) {
  const viewers = graph.packages.filter((p) => p.role === "viewer");
  return (
    <section className="v5-card" id="viewers" data-testid="card-viewers">
      <header><h2>Viewers</h2><span className="muted small">{viewers.length} · views over robot_msgs data</span></header>
      {viewers.map((p) => {
        const cov = d.pkgCov[p.id];
        const dependants = d.dependants[p.id] || [];
        return (
          <div key={p.id} className="v5-viewer">
            <div className="v5-viewer-top"><button className="v5-chip viewer" onClick={() => onSelect({ kind: "pkg", id: p.id, scroll: true })}>{p.id}</button><span className="muted small">{p.version} · lint {p.lint}</span></div>
            <p className="small">{p.one_line}</p>
            {cov.total > 0 && <div className="v5-layercov"><CovBar cov={cov} thin /><span className="small muted">{cov.verified}/{cov.total} type uses declared ({pct(cov.verified, cov.total)}%)</span></div>}
            <p className="small">{dependants.length === 0 ? <><span className="v5-dot st-verified" /> Nothing depends on it, as the viewer rule requires.</> : <span className="bad">{dependants.length} packages depend on a viewer: {dependants.map((e) => e.source).join(", ")}</span>}</p>
            <a className="small" href={p.repo_url} target="_blank" rel="noreferrer">{p.repo_url.replace("https://", "")}</a>
          </div>);
      })}
    </section>
  );
}

export function SkillCard() {
  return (
    <section className="v5-card" id="skill" data-testid="card-skill">
      <header><h2>For coding agents</h2><span className="muted small">skill/SKILL.md</span></header>
      <SkillBlock />
      <div className="v5-install-line"><span className="muted small">or just the packages</span><Install /></div>
    </section>
  );
}
