// V9 Buildfarm: one package (or agent) as a build-farm job page — its checks at the focused version with one click
// to each piece of evidence, its version and type uses across versions, its public type API (every type a link) and
// its dependencies. Opened from the Health matrix, the Types answer, the directory and the package tree.
import { useMemo, useState } from "react";
import {
  HealthDot, healthOf, HEALTH_LABEL, HEALTH_RANK, shortCheck, LAYER_LABEL, PkgLinks, TypeLink, BranchIcon, typeById,
  shortType, AgentCard, TypeText,
} from "@kit";
import { versionColumns, useVersionDocs, memberAt, differsFromLive, colSub } from "./matrix.jsx";

const KIND_HEAD = { consumes: ["Takes", "public parameter"], produces: ["Returns", "public return"], imports: ["Imports", "not on its public API"] };

function TypeApi({ graph, id, onOpenType }) {
  const [more, setMore] = useState({});
  const by = useMemo(() => {
    const out = { consumes: new Map(), produces: new Map(), imports: new Map() };
    for (const u of graph.uses) if (u.package === id) out[u.kind]?.set(u.type, (out[u.kind].get(u.type) || 0) + 1);
    return out;
  }, [graph, id]);
  const total = graph.uses.filter((u) => u.package === id).length;
  const defines = graph.types.filter((t) => t.package === id);
  return (
    <div className="v9-api" data-testid="pkg-type-api">
      {defines.length > 0 && <div className="v9-api-row"><div className="v9-api-k">Defines <span className="k-faint">{defines.length}</span></div>
        <div className="v9-api-v">{defines.slice(0, more.defines ? 99 : 14).map((t) => <TypeLink key={t.id} graph={graph} id={t.id} onOpen={onOpenType} className="v9-tchip" />)}
          {defines.length > 14 && <button className="k-more" onClick={() => setMore({ ...more, defines: !more.defines })}>{more.defines ? "fewer" : `+${defines.length - 14} more`}</button>}</div></div>}
      {!total && !defines.length && <p className="k-muted k-small">No type uses in this version.</p>}
      {["consumes", "produces", "imports"].map((k) => {
        const list = [...by[k].entries()].sort((a, b) => b[1] - a[1] || shortType(a[0]).localeCompare(shortType(b[0])));
        if (!list.length) return null;
        const shown = more[k] ? list : list.slice(0, 8);
        return (
          <div key={k} className="v9-api-row">
            <div className={"v9-api-k v9-k-" + k}>{KIND_HEAD[k][0]} <span className="k-faint">{KIND_HEAD[k][1]}</span></div>
            <div className="v9-api-v">
              {shown.map(([t, n]) => <span key={t} className="v9-tchip-wrap"><TypeLink graph={graph} id={t} onOpen={onOpenType} className="v9-tchip" /><span className="v9-tn">×{n}</span></span>)}
              {list.length > 8 && <button className="k-more" onClick={() => setMore({ ...more, [k]: !more[k] })}>{more[k] ? "fewer" : `+${list.length - 8} more`}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChecksList({ health, id, label }) {
  const m = healthOf(health, id);
  if (!health) return <p className="v9-norec-p">Health was not recorded for {label}. The site never shows Live's checks under another version.</p>;
  if (!m) return <p className="k-muted k-small">No health row for {id} at {label}.</p>;
  return (
    <ul className="v9-jobs" data-testid="pkg-checks">
      {(health.checks || []).map((ck) => {
        const c = m.checks?.[ck.id];
        if (!c) return null;
        const body = <>
          <HealthDot state={c.state} />
          <span className="v9-job-l">{ck.label}</span>
          <span className={"v9-job-s v9-st-" + c.state}>{shortCheck(ck.id, c)}</span>
          <span className="v9-job-d">{c.detail || HEALTH_LABEL[c.state]}</span>
          {c.url ? <span className="v9-job-go">evidence ↗</span> : <span className="v9-job-go k-faint" />}
        </>;
        return <li key={ck.id} className={"v9-job v9-job-" + c.state}>
          {c.url ? <a href={c.url} target="_blank" rel="noreferrer" title={ck.what} data-testid={`pkg-check-${ck.id}`}>{body}</a> : <div title={ck.what} data-testid={`pkg-check-${ck.id}`}>{body}</div>}
          {(c.failures || []).length > 0 && <ul className="v9-x-fails">{c.failures.map((f, i) => <li key={i}><code>{typeof f === "string" ? f : JSON.stringify(f)}</code></li>)}</ul>}
        </li>;
      })}
    </ul>
  );
}

function AcrossRow({ site, id, kind }) {
  const cols = versionColumns(site);
  const docs = useVersionDocs(site, cols);
  const liveCol = cols[0];
  const liveAt = memberAt(docs[liveCol.id], liveCol, id, kind);
  return (
    <div className="v9-across" data-testid="pkg-across">
      {cols.map((c) => {
        const at = memberAt(docs[c.id], c, id, kind);
        const diff = c.id !== liveCol.id && differsFromLive(at, liveAt);
        return (
          <button key={c.id} className={"v9-acr" + (c.id === site.versionId ? " v9-focus" : "") + (diff ? " v9-diff" : "")} onClick={() => site.setVersion(c.id)} disabled={!c.available}
            title={c.available ? `focus ${c.label}` : c.reason} data-testid={"pkg-ver-" + c.id}>
            <span className="v9-acr-h">{c.id === site.versionId && <span className="v9-focus-dot" aria-hidden />}{c.label}</span>
            <span className="v9-acr-s">{colSub(c, docs[c.id])}</span>
            {at.status !== "ok" ? <span className="k-faint">{at.status === "loading" ? "loading…" : "not loaded"}</span>
              : at.present ? <span className="v9-acr-v">{at.recorded ? <HealthDot state={at.health?.state || "none"} /> : <span className="v9-dot-nr" />}
                {kind === "agent" ? <span>builds on {at.label.replace("on ", "")}</span> : <><code>{at.version}</code>{at.uses != null && <span className="k-muted"> · {at.uses} uses</span>}</>}</span>
              : <span className="v9-acr-v k-faint">{c.kind === "release" ? "not tagged" : "not in this version"}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Props: site, id, onOpenType(key), onOpenPackage(id), onClose()
export function PackagePage({ site, id, onOpenType, onOpenPackage, onClose }) {
  const { graph, health } = site;
  const live = site.live.graph;
  const pkg = graph.packages.find((p) => p.id === id);
  const agent = (graph.agents || []).find((a) => a.id === id);
  const livePkg = live.packages.find((p) => p.id === id);
  const liveAgent = (live.agents || []).find((a) => a.id === id);
  const kind = agent || liveAgent ? "agent" : "package";
  const label = site.version?.label;
  const any = pkg || agent || livePkg || liveAgent;
  if (!any) return <div className="v9-pkg" data-testid="pkg-page"><p className="k-muted">No package or agent called <code>{id}</code>.</p><button className="k-btn" onClick={onClose}>All packages</button></div>;
  const m = healthOf(health, id);
  const here = pkg || agent;
  const usedBy = pkg ? graph.packages.filter((p) => [...(p.deps?.required || []), ...Object.values(p.deps?.extras || {}).flat()].includes(id) && p.id !== id).map((p) => p.id) : [];
  const deps = pkg ? [...new Set([...(pkg.deps?.required || []), ...Object.values(pkg.deps?.extras || {}).flat()])].filter((d) => d !== id) : [];
  const show = here || livePkg || liveAgent;
  return (
    <article className="v9-pkg" data-testid="pkg-page">
      <div className="v9-pkg-top">
        <button className="v9-back" onClick={onClose} data-testid="pkg-close">← all packages</button>
      </div>
      <header className="v9-pkg-h">
        <div className="v9-pkg-title">
          <HealthDot state={m?.state || (health ? "none" : "unknown")} />
          {kind === "agent" ? <h2 className="v9-sans">{show.name}</h2> : <h2><code>{id}</code></h2>}
          {pkg && <span className="k-tag">v{pkg.version}</span>}
          {pkg && <span className="k-tag">{LAYER_LABEL[pkg.layer] || pkg.layer}</span>}
          {pkg?.role === "viewer" && <span className="k-tag k-tag-viewer">viewer</span>}
          {kind === "agent" && <span className="k-tag">agent</span>}
          {m && <span className={"v9-st v9-st-" + m.state}>{HEALTH_LABEL[m.state]}</span>}
        </div>
        <p className="v9-pkg-one">{show.one_line || show.objective}</p>
        {kind === "agent" ? <PkgLinks agent={show} /> : <PkgLinks pkg={show} />}
      </header>

      {!here && <div className="v9-pkg-absent" data-testid="pkg-absent">
        <BranchIcon /> <span><b>{id}</b> is not in <b>{label}</b>{site.version?.kind === "release" ? " — it has no v* tag yet" : ""}. Live has {livePkg ? <code>{livePkg.version}</code> : "it"}.</span>
        <button className="k-btn" onClick={() => site.setVersion("live")}>Show Live</button>
      </div>}

      <div className="v9-pkg-cols">
        <div className="v9-pkg-col">
          <section className="v9-pkg-s">
            <h3>Checks <span className="v9-at">@ <BranchIcon size={11} /> {label}</span>{m && <span className="k-faint v9-gen"> · worst: {HEALTH_LABEL[m.state]}</span>}</h3>
            {here ? <ChecksList health={health} id={id} label={label} /> : <p className="k-muted k-small">Nothing to check: not in this version.</p>}
          </section>
          <section className="v9-pkg-s">
            <h3>Across versions <span className="k-faint v9-gen">· version · type uses · click one to focus it</span></h3>
            <AcrossRow site={site} id={id} kind={kind} />
          </section>
        </div>
        <div className="v9-pkg-col">
          {kind === "package" && pkg && <section className="v9-pkg-s">
            <h3>Type API <span className="k-faint v9-gen">· {graph.uses.filter((u) => u.package === id).length} type uses at {label}</span></h3>
            <TypeApi graph={graph} id={id} onOpenType={onOpenType} />
          </section>}
          {kind === "package" && pkg && (deps.length > 0 || usedBy.length > 0) && <section className="v9-pkg-s v9-pkg-deps">
            <h3>Dependencies <span className="k-faint v9-gen">· pyproject, robot-sdk packages only</span></h3>
            {deps.length > 0 && <div><span className="v9-api-k">Requires</span>{deps.map((d) => <button key={d} className="k-chip" onClick={() => onOpenPackage(d)}><HealthDot state={healthOf(health, d)?.state || "unknown"} /><code>{d}</code></button>)}</div>}
            {usedBy.length > 0 && <div><span className="v9-api-k">Required by</span>{usedBy.map((d) => <button key={d} className="k-chip" onClick={() => onOpenPackage(d)}><HealthDot state={healthOf(health, d)?.state || "unknown"} /><code>{d}</code></button>)}</div>}
          </section>}
          {kind === "agent" && agent && <section className="v9-pkg-s">
            <h3>Builds on</h3>
            <div>{(agent.builds_on || []).map((d) => <button key={d} className="k-chip" onClick={() => onOpenPackage(d)}><HealthDot state={healthOf(health, d)?.state || "unknown"} /><code>{d}</code></button>)}</div>
            <div className="v9-agent-card"><AgentCard agent={agent} compact /></div>
          </section>}
          {(show.summary || show.use_when) && <section className="v9-pkg-s v9-pkg-about">
            <h3>About <span className="k-faint v9-gen">· from its robot-sdk.toml</span></h3>
            {show.summary && <p><TypeText text={show.summary} graph={graph} onOpenType={onOpenType} /></p>}
            {show.use_when && <p><b>Reach for it when</b> <TypeText text={show.use_when} graph={graph} onOpenType={onOpenType} /></p>}
          </section>}
        </div>
      </div>
    </article>
  );
}

// The Packages workspace's right column when nothing is selected: every package as a build job, failing first.
export function PackageQueue({ site, onOpenPackage }) {
  const { graph, health } = site;
  const list = [...graph.packages.map((p, i) => ({ p, i }))].sort((a, b) => (HEALTH_RANK[healthOf(health, a.p.id)?.state] ?? 9) - (HEALTH_RANK[healthOf(health, b.p.id)?.state] ?? 9) || a.i - b.i);
  return (
    <div className="v9-queue" data-testid="pkg-queue">
      <h3>Jobs by health <span className="k-faint v9-gen">· every package at {site.version?.label}, failing first · click one for its checks, versions and type API</span></h3>
      <ul>
        {list.map(({ p }) => {
          const m = healthOf(health, p.id);
          const bad = m ? (health.checks || []).filter((c) => ["fail", "warn"].includes(m.checks?.[c.id]?.state)) : [];
          return (
            <li key={p.id}>
              <button className="v9-q-row" onClick={() => onOpenPackage(p.id)} data-testid={"queue-" + p.id}>
                <HealthDot state={m?.state || (health ? "none" : "unknown")} />
                <code>{p.id}</code>
                <span className="k-grow" />
                <span className="v9-q-bad">{bad.slice(0, 2).map((c) => <span key={c.id} className={"v9-st-" + m.checks[c.id].state}>{c.label.toLowerCase()}</span>)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { typeById };
