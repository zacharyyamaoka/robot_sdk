// Side-panel bodies, one per row kind: the row's facts, its neighbourhood graph, and the UseRows behind the graph.
import { useState } from "react";
import { UseRow, AgentCard, AGENT_RULE } from "@shared/parts.jsx";
import { LAYER_LABEL, LAYER_BLURB, USE_STATE_LABEL, KIND_LABEL, shortType, useState_, agentKpi } from "@shared/graph.js";
import { EgoGraph } from "./ego.jsx";

const group = (xs, f) => { const m = new Map(); for (const x of xs) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

function Chip({ to, onOpen, children, cls = "" }) {
  return <button className={"chip-link " + cls} onClick={() => onOpen(to)} data-testid={`link-${to}`}>{children}</button>;
}

function Tally({ rows }) {
  const kinds = group(rows, (u) => u.kind);
  const st = group(rows, useState_);
  return (
    <div className="tally">
      {["produces", "consumes", "imports"].filter((k) => kinds.has(k)).map((k) => <span key={k} className={"kind k-" + k}>{k} {kinds.get(k).length}</span>)}
      {["verified", "found", "missing"].filter((k) => st.has(k)).map((k) => <span key={k} className={"flag st-" + k}>{USE_STATE_LABEL[k]} {st.get(k).length}</span>)}
    </div>
  );
}

// UseRows grouped (by type for a package, by package for a type); first group open.
function UseGroups({ graph, rows, by, onOpen }) {
  const groups = [...group(rows, (u) => u[by]).entries()].sort((a, b) => b[1].length - a[1].length);
  const [limit, setLimit] = useState({});
  return (
    <div className="use-groups">
      {groups.map(([k, us], i) => (
        <details key={k} open={i === 0} className="use-group">
          <summary>
            <code>{by === "type" ? shortType(k) : k}</code>
            <span className="muted small">{us.length} use{us.length > 1 ? "s" : ""}</span>
            <Tally rows={us} />
            <button className="linkish small" onClick={(e) => { e.preventDefault(); onOpen((by === "type" ? "type:" : "pkg:") + k); }}>open row</button>
          </summary>
          {us.slice(0, limit[k] || 12).map((u, j) => <UseRow key={j} graph={graph} use={u} showPackage={by !== "package"} showType={by !== "type"} />)}
          {us.length > (limit[k] || 12) && <button className="linkish small" onClick={() => setLimit({ ...limit, [k]: us.length })}>show all {us.length}</button>}
        </details>
      ))}
    </div>
  );
}

export function PackagePanel({ m, row, onOpen, onUses, onReady }) {
  const p = row.pkg;
  const deps = m.depsOf(p.id), dependants = m.dependantsOf(p.id), agents = m.agentsOn(p.id);
  const uses = m.usesByPkg[p.id] || [];
  return (
    <>
      <header className="panel-head">
        <div className="eyebrow">package · {LAYER_LABEL[p.layer] || p.layer}</div>
        <h2><code>{p.id}</code>{p.role === "viewer" && <span className="badge viewer">viewer</span>}</h2>
        <p className="panel-lede">{p.one_line}</p>
        <div className="facts">
          <span className="tag">v{p.version}</span>
          <span className="tag">PyPI <code>{p.pypi}</code></span>
          <span className={"tag " + (p.lint === "pass" ? "ok" : p.lint === "fail" ? "bad" : "")} title={p.declaration ? `declared in ${p.declaration}` : "no declaration file"}>lint {p.lint}</span>
          <a href={p.repo_url} target="_blank" rel="noreferrer">repo ↗</a>
          {p.declaration && <a href={`${p.repo_url}/blob/main/${p.declaration}`} target="_blank" rel="noreferrer">{p.declaration} ↗</a>}
        </div>
        <p className="muted small layer-note">{LAYER_BLURB[p.layer]}</p>
      </header>
      <div className="kv">
        <div><span className="k">requires</span><span className="v">{deps.length ? deps.map((e) => <Chip key={e.id} to={"pkg:" + e.target} onOpen={onOpen}>{e.target}{!e.required && <i> extra: {e.extras.join(", ")}</i>}</Chip>) : <span className="muted">no robot-sdk package</span>}</span></div>
        <div><span className="k">required by</span><span className="v">{dependants.length ? dependants.map((e) => <Chip key={e.id} to={"pkg:" + e.source} onOpen={onOpen}>{e.source}{!e.required && <i> extra: {e.extras.join(", ")}</i>}</Chip>) : <span className="muted">nothing</span>}</span></div>
        {agents.length > 0 && <div><span className="k">agents on it</span><span className="v">{agents.map((a) => <Chip key={a.id} to={"agent:" + a.id} onOpen={onOpen} cls="agent">{a.name}</Chip>)}</span></div>}
      </div>
      <section className="panel-sec">
        <h3>Neighbourhood</h3>
        <EgoGraph model={m} root={"pkg:" + p.id} onOpen={onOpen} onReady={onReady} />
      </section>
      <section className="panel-sec">
        <h3>robot_msgs types it uses <span className="muted small">{uses.length} uses</span>
          {uses.length > 0 && <button className="linkish small" onClick={() => onUses({ package: [p.id] })} data-testid="panel-open-uses">open in Uses tab →</button>}</h3>
        {uses.length ? <><Tally rows={uses} /><UseGroups graph={m.graph} rows={uses} by="type" onOpen={onOpen} /></> : <p className="muted small">No robot_msgs type found in its code.</p>}
      </section>
    </>
  );
}

export function TypePanel({ m, row, onOpen, onUses, onReady }) {
  const t = row.type;
  const uses = m.usesByType[t.id] || [];
  const Col = ({ label, list, k }) => (
    <div className="pc-col"><div className={"kind k-" + k}>{label} {list.length}</div>
      {list.length ? list.map((id) => <Chip key={id} to={"pkg:" + id} onOpen={onOpen}>{id}</Chip>) : <span className="muted small">none</span>}</div>
  );
  return (
    <>
      <header className="panel-head">
        <div className="eyebrow">robot_msgs type · {t.module}</div>
        <h2><code>{t.name}</code></h2>
        <p className="panel-lede">{t.what}</p>
        <div className="facts">
          <span className="tag">{row.users.length} packages</span><span className="tag">{uses.length} uses</span>
          <span className="tag">{row.declared} declared</span>
          {t.docs_url && <a href={t.docs_url} target="_blank" rel="noreferrer">docs ↗</a>}
        </div>
      </header>
      <section className="panel-sec">
        <h3>Producers → {t.name} → consumers</h3>
        <EgoGraph model={m} root={"type:" + t.id} onOpen={onOpen} onReady={onReady} height={360} />
      </section>
      <div className="pc-cols">
        <Col label="produces" k="produces" list={row.producers} />
        <Col label="consumes" k="consumes" list={row.consumers} />
        <Col label="imports" k="imports" list={row.importers} />
      </div>
      <section className="panel-sec">
        <h3>Every use <span className="muted small">{uses.length}</span>
          {uses.length > 0 && <button className="linkish small" onClick={() => onUses({ type: [t.id] })} data-testid="panel-open-uses">filter the Uses tab to {t.name} →</button>}</h3>
        {uses.length ? <><Tally rows={uses} /><UseGroups graph={m.graph} rows={uses} by="package" onOpen={onOpen} /></> : <p className="muted small">No package uses this type yet.</p>}
      </section>
    </>
  );
}

export function UsePanel({ m, row, onOpen, onReady }) {
  const u = row.use;
  const st = row.state;
  const siblings = (m.usesByType[u.type] || []).filter((x) => x.package === u.package && x !== u);
  const STATE_WHY = {
    verified: "Listed in the package's robot-sdk.toml and found in the code by the scanner.",
    found: "Found in the code by the scanner; the package's robot-sdk.toml does not list this symbol yet.",
    missing: "Listed in robot-sdk.toml but not found in the code: a lint failure.",
  };
  return (
    <>
      <header className="panel-head">
        <div className="eyebrow">use · {KIND_LABEL[u.kind]}</div>
        <h2 className="use-title"><code>{u.package}</code> <span className={"kind k-" + u.kind}>{u.kind}</span> <code>{shortType(u.type)}</code></h2>
      </header>
      <div className="use-card"><UseRow graph={m.graph} use={u} /></div>
      <p className="muted small">{STATE_WHY[st]} {u.public ? "Reachable from the package's public API." : "Not on the public API (private module, or not in __all__)."}</p>
      <div className="kv">
        <div><span className="k">package</span><span className="v"><Chip to={"pkg:" + u.package} onOpen={onOpen}>{u.package}</Chip></span></div>
        <div><span className="k">type</span><span className="v"><Chip to={"type:" + u.type} onOpen={onOpen}>{shortType(u.type)}</Chip></span></div>
      </div>
      <section className="panel-sec">
        <h3>{shortType(u.type)}'s neighbourhood <span className="muted small">this use's edge is highlighted</span></h3>
        <EgoGraph model={m} root={"type:" + u.type} hot={["pkg:" + u.package]} onOpen={onOpen} onReady={onReady} />
      </section>
      {siblings.length > 0 && <section className="panel-sec">
        <h3>{u.package}'s other uses of {shortType(u.type)} <span className="muted small">{siblings.length}</span></h3>
        {siblings.map((x, i) => <UseRow key={i} graph={m.graph} use={x} showPackage={false} showType={false} />)}
      </section>}
    </>
  );
}

export function AgentPanel({ m, row, onOpen, onReady }) {
  const a = row.agent;
  return (
    <>
      <header className="panel-head">
        <div className="eyebrow">agent</div>
        <h2>{a.name}</h2>
      </header>
      <AgentCard agent={a} graph={m.graph} />
      <p className="muted small rule">{AGENT_RULE}</p>
      <section className="panel-sec">
        <h3>Packages it builds on</h3>
        <EgoGraph model={m} root={"agent:" + a.id} onOpen={onOpen} onReady={onReady} height={280} />
      </section>
    </>
  );
}

export function kpiText(row) { const k = agentKpi(row.agent); return k ? k.display : "—"; }
