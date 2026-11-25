// The right column of a GitHub repository page, re-cast for robot-sdk: "About" (the pitch, install, links, counts),
// "Releases" (the versions: Live, Latest release, snapshots; click switches), "Health" (the Languages bar re-used for
// pass/warn/fail, plus the top failures, each one click from its run). And, on the Packages workspace, the same
// column for one package: what it is, its checks, its types.
import { useState } from "react";
import { PITCH, LAYER_RULE, REPO_URL, CopyCode, PkgLinks, TypeLink, TypeText, healthOf, healthSummary, sortedMembers, fmtShortDate } from "@kit";
import { LAYER_LABEL, usesOfPackage, packageEdges } from "@shared/graph.js";
import { Icon, StatusIcon } from "./icons.jsx";
import { worstLine, memberChecks, CheckLine, HealthBar } from "./checks.jsx";

export const SITE_URL = "https://zacharyyamaoka.github.io/robot_sdk/";

export function SideSection({ title, count, countClass = "", action, children, testid }) {
  return (
    <section className="gh-side-sec" data-testid={testid}>
      <h2 className="gh-side-h">{title}{count != null && <span className={"gh-counter " + countClass}>{count}</span>}{action && <span className="gh-side-act">{action}</span>}</h2>
      {children}
    </section>
  );
}

// About: the README pitch, the live site link, install, the layers as topics, then GitHub's stat lines.
export function AboutBox({ graph, pick, href }) {
  return (
    <SideSection title="About" testid="v6-about">
      <p className="gh-about-desc" data-testid="pitch">{PITCH}</p>
      <a className="gh-about-site" href={SITE_URL} target="_blank" rel="noreferrer"><Icon name="link" /><b>zacharyyamaoka.github.io/robot_sdk</b></a>
      <div className="gh-about-install"><CopyCode text="pip install robot-sdk" /></div>
      <div className="gh-topics" aria-label="layers">
        {[...new Set(graph.packages.map((p) => p.layer))].map((l) => <a key={l} className="gh-topic" href={href("packages")} title={`the ${LAYER_LABEL[l] || l} layer on the package tree`}>{LAYER_LABEL[l] || l}</a>)}
      </div>
      <ul className="gh-about-lines">
        <li><a href={REPO_URL + "#readme"} target="_blank" rel="noreferrer"><Icon name="book" />Readme</a></li>
        {pick && <li><a href={href("run")} data-testid="pitch-run"><Icon name="play" />The real pick and place <span className="gh-muted">· {pick.stages.length} stages</span></a></li>}
        <li><a href={href("skill")}><Icon name="sparkle" />For coding agents <span className="gh-muted">· the skill</span></a></li>
        <li><a href={href("types")}><Icon name="type" /><b>{graph.types.length}</b> types</a></li>
        <li><a href={href("directory")}><Icon name="package" /><b>{graph.packages.length}</b> packages</a></li>
        <li><a href={href("agents")}><Icon name="agent" /><b>{(graph.agents || []).length}</b> agents</a></li>
        <li><span><Icon name="pulse" /><b>{graph.uses.length}</b> type uses <span className="gh-muted">found by the scan</span></span></li>
      </ul>
    </SideSection>
  );
}

// Releases: versions.json as GitHub's Releases box. Click a version to switch the whole site to it.
export function ReleasesBox({ site }) {
  const [all, setAll] = useState(false);
  const vs = site.versions;
  const channels = vs.filter((v) => v.kind !== "snapshot"), snaps = vs.filter((v) => v.kind === "snapshot");
  const shown = all ? snaps : snaps.slice(0, 2);
  const Row = (v) => {
    const on = v.id === site.versionId;
    const pill = v.kind === "live" ? <span className="gh-label gh-label-default">default</span> : v.kind === "release" ? <span className="gh-label gh-label-latest">Latest</span> : null;
    const when = v.published || v.generated;
    return (
      <li key={v.id}>
        <button className={"gh-rel" + (on ? " on" : "")} onClick={() => v.available && site.setVersion(v.id)} disabled={!v.available} aria-current={on ? "true" : undefined}
          title={v.available ? v.summary : v.reason} data-testid={"v6-rel-" + v.id}>
          <Icon name={v.kind === "live" ? "pulse" : "tag"} className={v.kind === "release" ? "gh-ic-latest" : ""} />
          <span className="gh-rel-main">
            <span className="gh-rel-name">{v.label}{pill}{on && <span className="gh-rel-on">✓ viewing</span>}</span>
            <span className="gh-rel-meta">{v.available ? (v.kind === "live" ? "every package at its main branch, hourly" : v.kind === "release" ? (v.summary || "").replace(/;.*$/, "") : `from main ${v.built_from || ""}`) : v.reason}{when && v.kind !== "snapshot" ? ` · ${fmtShortDate(when)}` : ""}</span>
          </span>
        </button>
      </li>
    );
  };
  return (
    <SideSection title="Releases" count={vs.length} testid="v6-releases">
      <ul className="gh-rels">{channels.map(Row)}{shown.map(Row)}</ul>
      {snaps.length > 2 && <button className="gh-linkbtn gh-small" onClick={() => setAll((x) => !x)} data-testid="v6-rel-more">{all ? "Fewer snapshots" : `+ ${snaps.length - 2} more snapshots`}</button>}
    </SideSection>
  );
}

// Health: the bar, then the failing members (or, with none failing, the warnings), each one click from its run.
export function HealthSide({ site, href, healthHref }) {
  const { health } = site;
  if (!health) return (
    <SideSection title="Health" testid="v6-side-health">
      <p className="gh-muted gh-small">{site.healthNote} The site never shows Live's checks under another version.</p>
      <button className="gh-btn gh-btn-sm" onClick={() => site.setVersion("live")}>Back to Live</button>
    </SideSection>
  );
  const s = healthSummary(health);
  const members = sortedMembers(health);
  const top = members.filter((m) => m.state === (s.fail ? "fail" : "warn")).slice(0, 5);
  const rest = members.filter((m) => m.state === (s.fail ? "fail" : "warn")).length - top.length;
  return (
    <SideSection title="Health" count={s.fail ? `${s.fail} failing` : null} countClass="gh-counter-danger" testid="v6-side-health"
      action={<a href={href("health")} className="gh-small">All checks</a>}>
      <HealthBar health={health} />
      <ul className="gh-side-fails">
        {top.map((m) => {
          const w = worstLine(health, m);
          return (
            <li key={m.id} data-testid={"v6-side-fail-" + m.id}>
              <StatusIcon state={m.state} />
              <a className="gh-side-fail-name" href={healthHref(m.id)}>{m.kind === "agent" ? m.id : <code>{m.id}</code>}</a>
              <span className="gh-muted gh-side-fail-why" title={w.text}>{w.check?.label || ""}</span>
              {w.url && <a className="gh-details" href={w.url} target="_blank" rel="noreferrer">Details</a>}
            </li>
          );
        })}
      </ul>
      {rest > 0 && <a className="gh-small" href={href("health")}>+ {rest} more</a>}
    </SideSection>
  );
}

// ---- one package, as the Packages workspace's right column ----------------------------------------------------------
function typesOf(graph, id) {
  const by = { produces: new Map(), consumes: new Map(), imports: new Map() };
  for (const u of usesOfPackage(graph, id)) by[u.kind].set(u.type, (by[u.kind].get(u.type) || 0) + 1);
  // a type both produced or consumed and imported shows only where it is public
  for (const t of [...by.imports.keys()]) if (by.produces.has(t) || by.consumes.has(t)) by.imports.delete(t);
  return by;
}

export function PackageSide({ site, id, onOpenType, onOpenPackage, healthHref, onBackToLive, onClose }) {
  const { graph, health } = site;
  const closeBtn = onClose && <button className="gh-iconbtn" onClick={onClose} aria-label="Close" title="Close (back to the whole map)" data-testid="v6-pkg-close"><Icon name="x" /></button>;
  if (!id) return (
    <SideSection title="About the map" testid="v6-pkg-side">
      <p className="gh-about-desc gh-small">{LAYER_RULE}</p>
      <p className="gh-muted gh-small">Click a package on the map for what it is, its checks and its types.</p>
      {health && <HealthBar health={health} />}
    </SideSection>
  );
  const p = graph.packages.find((x) => x.id === id);
  const a = !p && (graph.agents || []).find((x) => x.id === id);
  if (!p && !a) {
    const liveP = site.live.graph?.packages.find((x) => x.id === id);
    return (
      <SideSection title={<code>{id}</code>} testid="v6-pkg-side" action={closeBtn}>
        <div className="gh-flash gh-flash-warn" data-testid="v6-pkg-missing"><b>Not in {site.version?.label}.</b>{" "}
          {!liveP ? "No package by this id in this version." : site.version?.kind === "release" && site.version?.packages?.[id] === null
            ? <>Live has it at v{liveP.version}; it has no v* tag yet, so Latest release leaves it out.</> : <>Live has it at v{liveP.version}; this version does not list it.</>}</div>
        {!site.isLive && <button className="gh-btn gh-btn-sm" onClick={onBackToLive}>Back to Live</button>}
      </SideSection>
    );
  }
  const m = healthOf(health, id);
  const checks = m ? memberChecks(health, m) : [];
  const nFail = checks.filter((x) => x.r.state === "fail").length, nWarn = checks.filter((x) => x.r.state === "warn").length, nPass = checks.filter((x) => x.r.state === "pass").length;
  if (a) return (
    <SideSection title={a.name} testid="v6-pkg-side" action={closeBtn}>
      <p className="gh-about-desc">{a.objective}</p>
      <PkgLinks agent={a} />
      <h3 className="gh-side-h3">Builds on</h3>
      <div className="gh-chips">{(a.builds_on || []).map((b) => <button key={b} className="gh-chip" onClick={() => onOpenPackage(b)}><code>{b}</code></button>)}{!(a.builds_on || []).length && <span className="gh-faint gh-small">nothing yet</span>}</div>
    </SideSection>
  );
  const ty = typesOf(graph, id);
  const defines = graph.types.filter((t) => t.package === id);
  const deps = packageEdges(graph).filter((e) => e.source === id && e.known);
  const usedBy = packageEdges(graph).filter((e) => e.target === id && e.known);
  const TypeList = ({ map, kind }) => map.size ? (
    <div className={"gh-typelist k-" + kind}>{[...map].sort((x, y) => y[1] - x[1]).map(([t, n]) => <span key={t} className="gh-typechip"><TypeLink graph={graph} id={t} onOpen={onOpenType} />{n > 1 && <span className="gh-faint"> ×{n}</span>}</span>)}</div>
  ) : <p className="gh-faint gh-small">none</p>;
  return (
    <div className="gh-pkgside" data-testid="v6-pkg-side">
      <SideSection title={<><Icon name="package" /><code>{p.id}</code></>} action={closeBtn}>
        <div className="gh-pkg-meta">
          <span className="gh-label">v{p.version}</span>
          <span className="gh-label">{LAYER_LABEL[p.layer] || p.layer}</span>
          {p.role === "viewer" && <span className="gh-label gh-label-viewer">viewer</span>}
          {m && <a className={"gh-label gh-label-st gh-is-" + m.state} href={healthHref(p.id)}><StatusIcon state={m.state} size={12} />{m.state === "fail" ? "failing" : m.state === "warn" ? "warnings" : m.state}</a>}
        </div>
        <p className="gh-about-desc"><TypeText text={p.one_line} graph={graph} onOpenType={onOpenType} /></p>
        {p.use_when && <p className="gh-small gh-muted gh-usewhen"><b>Reach for it when:</b> <TypeText text={p.use_when.replace(/\*\*/g, "")} graph={graph} onOpenType={onOpenType} /></p>}
        <PkgLinks pkg={p} />
      </SideSection>
      <SideSection title="Checks" count={m ? (nFail ? `${nFail} failing` : nWarn ? `${nWarn} warning${nWarn > 1 ? "s" : ""}` : `${nPass} passing`) : null}
        countClass={nFail ? "gh-counter-danger" : nWarn ? "gh-counter-warn" : ""} testid="v6-pkg-checks">
        {m ? <ul className="gh-checklines gh-checklines-side">{checks.map((x) => <CheckLine key={x.id} check={x} r={x.r} testid={`v6-pkg-check-${x.id}`} />)}</ul>
          : <p className="gh-muted gh-small">{site.healthNote || "No health row for this package."}</p>}
      </SideSection>
      <SideSection title="Types" count={new Set([...ty.produces.keys(), ...ty.consumes.keys(), ...ty.imports.keys()]).size || null} testid="v6-pkg-types">
        {defines.length > 0 && <><h3 className="gh-side-h3">Defines {defines.length}</h3><div className="gh-typelist">{defines.map((t) => <span key={t.id} className="gh-typechip"><TypeLink graph={graph} id={t.id} onOpen={onOpenType} /></span>)}</div></>}
        <h3 className="gh-side-h3 k-c-prod">Returns <span className="gh-faint">public</span></h3><TypeList map={ty.produces} kind="produces" />
        <h3 className="gh-side-h3 k-c-cons">Takes <span className="gh-faint">public</span></h3><TypeList map={ty.consumes} kind="consumes" />
        {ty.imports.size > 0 && <><h3 className="gh-side-h3">Imports only <span className="gh-faint">not public</span></h3><TypeList map={ty.imports} kind="imports" /></>}
      </SideSection>
      <SideSection title="Dependencies" testid="v6-pkg-deps">
        <p className="gh-small"><span className="gh-muted">requires </span>{deps.length ? deps.map((e) => <button key={e.id} className="gh-chip" onClick={() => onOpenPackage(e.target)}><code>{e.target}</code>{!e.required && <span className="gh-faint"> [{e.extras.join(", ")}]</span>}</button>) : <span className="gh-faint">no robot-sdk package</span>}</p>
        <p className="gh-small"><span className="gh-muted">required by </span>{usedBy.length ? usedBy.map((e) => <button key={e.id} className="gh-chip" onClick={() => onOpenPackage(e.source)}><code>{e.source}</code></button>) : <span className="gh-faint">nothing</span>}</p>
      </SideSection>
    </div>
  );
}
