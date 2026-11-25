// V8 result list, Hoogle style: one row per symbol — `name :: Inputs → Outputs` on the first line (each type a link),
// then the "from" line (package + health, the fully-qualified symbol, kind badges, file:line). Left column = Hoogle's
// package facets (+ only / − not), then the types these results mention, then the query syntax.
import { useMemo, useState } from "react";
import { TypeLink, HealthDot, PkgLinks, healthOf, typeById, shortType, typeCounts, consumersOf, producersOf, LAYER_LABEL, typeKey } from "@kit";
import { scopeQuery } from "./search.js";

const LIMIT = 12;

// "JointTrajectory, JointLimits → TrajectoryResult": each type a link (the focus type bold, still a link).
// A side with no robot-sdk type shows "·" (titled), the same convention as the kit's signatureText.
export function Sig({ graph, sig, focus, onOpenType }) {
  const list = (ids) => ids.length
    ? ids.map((id, i) => <span key={id}>{i ? ", " : ""}<TypeLink graph={graph} id={id} onOpen={onOpenType} bold={focus && focus.includes(id)} /></span>)
    : <span className="v8-none" title="no robot-sdk type on this side">·</span>;
  return <span className="v8-sig">{list(sig.inputs)}<span className="v8-arrow"> → </span>{list(sig.outputs)}</span>;
}

export function PkgChip({ id, health, onOpenPackage, missing }) {
  const m = health ? healthOf(health, id) : null;
  return (
    <a className={"v8-pkg" + (missing ? " v8-pkg-x" : "")} href={"#/packages/" + id} data-testid={"res-pkg-" + id}
      onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); onOpenPackage(id); }}
      title={m ? `${id}: ${m.state} — open its package page` : `${id} — open its package page`}>
      {health && <HealthDot state={m?.state || "unknown"} />}{id}
    </a>
  );
}

function Badges({ sig }) {
  const missing = sig.rows.some((r) => r.declared && !r.verified);
  const anyDecl = sig.rows.some((r) => r.declared);
  return (
    <span className="v8-badges">
      <span className={"v8-b" + (sig.public ? " v8-b-pub" : "")} title={sig.public ? "reachable from the package's public API" : "not on the public API"}>{sig.public ? "public" : "internal"}</span>
      {missing ? <span className="v8-b v8-b-bad" title="declared in robot-sdk.toml but not found in the code (a lint failure)">declared, not found</span>
        : sig.declared ? <span className="v8-b v8-b-ok" title="listed in the package's robot-sdk.toml and found in the code">declared + verified</span>
        : anyDecl ? <span className="v8-b" title="some of its type uses are declared in robot-sdk.toml">partly declared</span>
        : <span className="v8-b v8-b-faint" title="found in the code by the scanner, not listed in robot-sdk.toml">found, not declared</span>}
    </span>
  );
}

function FnRow({ graph, item, health, focus, sourceUrl, onOpenType, onOpenPackage, ghost, versionLabel }) {
  const s = item.sig;
  const url = sourceUrl(s.package, s.where);
  const file = s.where ? s.where.split("/").pop() : "";
  return (
    <li className={"v8-res" + (ghost ? " v8-ghost" : "")} data-v8-row="" data-testid={(ghost ? "ghost-" : "res-") + s.package + "-" + s.name}>
      <div className="v8-ans">
        {url ? <a className="v8-name" href={url} target="_blank" rel="noreferrer" data-v8-open="" title={`${s.symbol} — ${s.package}/${s.where} on GitHub`}>{s.name}</a>
          : <span className="v8-name" data-v8-open="">{s.name}</span>}
        <span className="v8-dc"> :: </span>
        <Sig graph={graph} sig={s} focus={focus} onOpenType={onOpenType} />
      </div>
      <div className="v8-from">
        <PkgChip id={s.package} health={ghost ? null : health} onOpenPackage={onOpenPackage} />
        <code className="v8-fq" title={s.symbol}>{s.symbol}</code>
        <Badges sig={s} />
        {url ? <a className="v8-where" href={url} target="_blank" rel="noreferrer" title={`${s.package}/${s.where}`}>{file}</a> : <code className="v8-where">{file}</code>}
      </div>
      {ghost && <div className="v8-ann v8-ann-ghost">not in {versionLabel} — new on Live</div>}
      {!ghost && item.only && <div className="v8-ann v8-ann-only">only in {versionLabel} — not on Live any more</div>}
      {!ghost && item.liveSig && <div className="v8-ann">on Live: <code>{item.liveSig}</code></div>}
      {!ghost && !item.liveSig && item.liveWhere && <div className="v8-ann v8-ann-soft">moved on Live to {item.liveWhere.split("/").pop()}</div>}
    </li>
  );
}

function TypeRow({ graph, item, onOpenType, ghost, versionLabel }) {
  const t = item.type, c = typeCounts(graph)[t.id] || {};
  return (
    <li className={"v8-res" + (ghost ? " v8-ghost" : "")} data-v8-row="" data-testid={"res-type-" + t.name}>
      <div className="v8-ans"><span className="v8-kw">type </span><TypeLink graph={graph} id={t.id} onOpen={onOpenType} className="v8-name v8-tname" bold><span data-v8-open="">{t.name}</span></TypeLink></div>
      <div className="v8-from"><span className="v8-pkg v8-pkg-plain">{t.package}</span><code className="v8-fq">{t.id}</code>
        <span className="v8-counts"><b>{c.consumes || 0}</b> take it · <b>{c.produces || 0}</b> return it · {c.imports || 0} import</span></div>
      {t.what && <div className="v8-doc">{t.what}</div>}
      {item.only && <div className="v8-ann v8-ann-only">only in {versionLabel}</div>}
      {ghost && <div className="v8-ann v8-ann-ghost">not in {versionLabel} — new on Live</div>}
    </li>
  );
}

function PkgRow({ graph, item, health, onOpenPackage, ghost, versionLabel }) {
  const p = item.pkgDoc;
  return (
    <li className={"v8-res" + (ghost ? " v8-ghost" : "")} data-v8-row="" data-testid={"res-package-" + p.id}>
      <div className="v8-ans"><span className="v8-kw">package </span>
        <a className="v8-name" href={"#/packages/" + p.id} data-v8-open="" onClick={(e) => { e.preventDefault(); onOpenPackage(p.id); }}>{p.id}</a>
        <span className="v8-ver">v{p.version}</span></div>
      <div className="v8-from"><PkgChip id={p.id} health={ghost ? null : health} onOpenPackage={onOpenPackage} /><span className="v8-layer">{LAYER_LABEL[p.layer] || p.layer}</span><PkgLinks pkg={p} compact /></div>
      <div className="v8-doc">{p.one_line}</div>
      {ghost && <div className="v8-ann v8-ann-ghost">not in {versionLabel}</div>}
    </li>
  );
}

function ChainRow({ graph, item, health, sourceUrl, onOpenType, onOpenPackage }) {
  const { first, via, second } = item.chain;
  const link = (s) => { const u = sourceUrl(s.package, s.where); return u ? <a className="v8-name" href={u} target="_blank" rel="noreferrer" title={s.symbol}>{s.name}</a> : <span className="v8-name">{s.name}</span>; };
  return (
    <li className="v8-res" data-v8-row="">
      <div className="v8-ans"><span data-v8-open="">{link(first)}</span><span className="v8-dc"> → </span><TypeLink graph={graph} id={via} onOpen={onOpenType} /><span className="v8-dc"> → </span>{link(second)}</div>
      <div className="v8-from"><PkgChip id={first.package} health={health} onOpenPackage={onOpenPackage} /><span className="v8-dc">then</span><PkgChip id={second.package} health={health} onOpenPackage={onOpenPackage} /></div>
    </li>
  );
}

function Row(props) {
  const k = props.item.kind;
  if (k === "fn") return <FnRow {...props} />;
  if (k === "type") return <TypeRow {...props} />;
  if (k === "pkg") return <PkgRow {...props} />;
  return <ChainRow {...props} />;
}

const pkgCount = (items) => new Set(items.map((i) => i.pkg)).size;

function sectionTitle(sec, res, graph, onOpenType) {
  const T = (t) => <TypeLink key={t.id} graph={graph} id={t.id} onOpen={onOpenType} />;
  const names = (ts) => (ts || []).map((t, i) => <span key={t.id}>{i ? " | " : ""}{T(t)}</span>);
  switch (sec.role) {
    case "takes": return <>Takes {res.type ? T(res.type) : names(res.from)} <span className="v8-sh-sub">public parameter</span></>;
    case "returns": return <>Returns {res.type ? T(res.type) : names(res.to)} <span className="v8-sh-sub">where to get one</span></>;
    case "imports": return <>Imports it <span className="v8-sh-sub">used inside, not on the public API</span></>;
    case "both": return <>Takes {names(res.from)}, returns {names(res.to)}</>;
    case "chains": return <>Two steps <span className="v8-sh-sub">no single function does it</span></>;
    case "api": return <>Public API of <code>{res.pkgDoc?.id || res.include.join(", ")}</code> <span className="v8-sh-sub">every symbol with a robot-sdk type</span></>;
    case "types": return <>Types</>;
    case "packages": return <>Packages</>;
    case "functions": return <>Functions <span className="v8-sh-sub">by name</span></>;
    default: return sec.id;
  }
}

function Section({ sec, res, graph, liveGraph, health, sourceUrl, liveSourceUrl, onOpenType, onOpenPackage, versionLabel }) {
  const [all, setAll] = useState(false);
  // WHY open by default: the per-row "not in this version" is the point of looking at another version; a few are shown,
  // the rest one click away.
  const [ghostsOpen, setGhostsOpen] = useState(true);
  const [ghostsAll, setGhostsAll] = useState(false);
  const focus = res.type ? [res.type.id] : [...(res.from || []), ...(res.to || [])].map((t) => t.id);
  const shown = all ? sec.items : sec.items.slice(0, LIMIT);
  const ghosts = sec.ghosts || [];
  const fnLike = sec.items.length && (sec.items[0].kind === "fn" || sec.items[0].kind === "chain");
  const common = { graph, health, sourceUrl, onOpenType, onOpenPackage, focus, versionLabel };
  // An empty group says nothing the summary has not said: "imports" (rare) and an A -> B with its fallback line.
  if (!sec.items.length && !ghosts.length && (sec.role === "imports" || (sec.role === "both" && res.fallback))) return null;
  return (
    <section className={"v8-sec v8-sec-" + sec.role} data-testid={"sec-" + sec.id}>
      <h3 className="v8-sh">
        <span className="v8-sh-t">{sectionTitle(sec, res, graph, onOpenType)}</span>
        <span className="v8-sh-n">{sec.items.length}{fnLike ? ` in ${pkgCount(sec.items)} package${pkgCount(sec.items) === 1 ? "" : "s"}` : ""}{sec.all > sec.items.length ? <span className="v8-faint"> · {sec.all - sec.items.length} scoped out</span> : null}</span>
      </h3>
      {sec.items.length > 0 ? <ul className="v8-list">{shown.map((it) => <Row key={it.key} item={it} {...common} />)}</ul>
        : <p className="v8-empty">{ghosts.length ? `None in ${versionLabel}.` : "None in this version."}</p>}
      {sec.items.length > LIMIT && <button className="v8-more" onClick={() => setAll((x) => !x)} data-testid={"more-" + sec.id}>{all ? "Show fewer" : `Show all ${sec.items.length}`}</button>}
      {ghosts.length > 0 && <div className="v8-ghosts">
        <button className="v8-ghost-toggle" onClick={() => setGhostsOpen((x) => !x)} aria-expanded={ghostsOpen} data-testid={"ghosts-" + sec.id}>
          <span className="v8-ann-dot" />{ghosts.length} more on Live {ghosts.length === 1 ? "is" : "are"} not in {versionLabel}
          <span className="v8-faint"> — {[...new Set(ghosts.map((g) => g.pkg))].join(", ")}</span><span className="v8-caret">{ghostsOpen ? "▴" : "▾"}</span>
        </button>
        {ghostsOpen && <ul className="v8-list">{(ghostsAll ? ghosts : ghosts.slice(0, 4)).map((it) => <Row key={it.key} item={it} {...common} graph={liveGraph} sourceUrl={liveSourceUrl} ghost />)}</ul>}
        {ghostsOpen && ghosts.length > 4 && <button className="v8-more" onClick={() => setGhostsAll((x) => !x)}>{ghostsAll ? "Show fewer" : `Show all ${ghosts.length} not in ${versionLabel}`}</button>}
      </div>}
    </section>
  );
}

// The type card Hoogle puts first for an exact match: what the type is, where it lives, its counts, and the way into
// the Types workspace (the switchboard).
function TypeCard({ res, graph, onOpenType, onSearch }) {
  const t = res.type;
  const cons = res.typeMissing ? [] : consumersOf(graph, t.id), prod = res.typeMissing ? [] : producersOf(graph, t.id);
  return (
    <div className="v8-card" data-testid="type-card">
      <div className="v8-ans v8-card-ans"><span className="v8-kw">type </span><b className="v8-card-name">{t.name}</b>
        <code className="v8-fq">{t.id}</code>{t.docs_url && <a className="v8-ext" href={t.docs_url} target="_blank" rel="noreferrer">docs ↗</a>}</div>
      {t.what && <div className="v8-doc">{t.what}</div>}
      {res.typeMissing ? <div className="v8-ann v8-ann-ghost">{t.name} is not in this version — the rows below are Live's.</div>
        : <div className="v8-card-acts">
          <button className="v8-btn v8-btn-primary" onClick={() => onOpenType(typeKey(graph, t))} data-testid="open-in-types">Open the {t.name} switchboard →</button>
          <button className="v8-btn" onClick={() => onSearch(t.name + " ->")}>{t.name} -&gt; <span className="v8-faint">{cons.length}</span></button>
          <button className="v8-btn" onClick={() => onSearch("-> " + t.name)}>-&gt; {t.name} <span className="v8-faint">{prod.length}</span></button>
        </div>}
    </div>
  );
}

function PackageCard({ res, graph, health, onOpenPackage }) {
  const p = res.pkgDoc, m = healthOf(health, p.id);
  return (
    <div className="v8-card" data-testid="package-card">
      <div className="v8-ans v8-card-ans"><span className="v8-kw">package </span><b className="v8-card-name">{p.id}</b><span className="v8-ver">v{p.version}</span><span className="v8-layer">{LAYER_LABEL[p.layer] || p.layer}</span>
        {m && <span className={"v8-hstate v8-st-" + m.state}><HealthDot state={m.state} /> {m.state === "fail" ? "failing" : m.state === "warn" ? "warnings" : m.state}</span>}</div>
      <div className="v8-doc">{p.one_line}</div>
      <div className="v8-card-acts"><button className="v8-btn v8-btn-primary" onClick={() => onOpenPackage(p.id)}>Package page: health and pipeline →</button><PkgLinks pkg={p} compact /></div>
    </div>
  );
}

// The summary line under the query: counts, and for an arrow query the opposite question one click away.
function Summary({ res, graph, onOpenType, onSearch }) {
  if (res.kind === "flow") {
    const T = (ts) => (ts || []).map((t, i) => <span key={t.id}>{i ? " | " : ""}<TypeLink graph={graph} id={t.id} onOpen={onOpenType} /></span>);
    const n = res.sections[0]?.items.length || 0;
    const other = res.from && !res.to ? res.from : res.to && !res.from ? res.to : null;
    const opp = other && other.length === 1 && !res.fromMissing && !res.toMissing ? (res.from && !res.to ? producersOf(graph, other[0].id) : consumersOf(graph, other[0].id)) : null;
    return (
      <div className="v8-summary" data-testid="result-summary">
        {res.from && !res.to && <><b>{n}</b> function{n === 1 ? "" : "s"} take {T(res.from)}</>}
        {res.to && !res.from && <><b>{n}</b> function{n === 1 ? "" : "s"} return {T(res.to)}</>}
        {res.from && res.to && <><b>{n}</b> function{n === 1 ? "" : "s"} take {T(res.from)} and return {T(res.to)}</>}
        {opp && <span className="v8-opp"> · {res.from && !res.to ? "Where to get one: " : "What takes it: "}
          <button className="v8-qlink" onClick={() => onSearch(res.from && !res.to ? "-> " + other[0].name : other[0].name + " ->")} data-testid="opposite-query">
            {res.from && !res.to ? `-> ${other[0].name}` : `${other[0].name} ->`}</button> <span className="v8-faint">({opp.length} in {[...new Set(opp.map((s) => s.package))].join(", ")})</span></span>}
        {res.fallback && <div className="v8-fallback">No public function takes {T(res.from)} and returns {T(res.to)}, and no two-step chain does.
          {" "}<button className="v8-qlink" onClick={() => onSearch(res.leftText + " ->")}>{res.leftText} -&gt;</button> has {res.fallback.takeA};
          {" "}<button className="v8-qlink" onClick={() => onSearch("-> " + res.rightText)}>-&gt; {res.rightText}</button> has {res.fallback.giveB}.</div>}
        {res.unresolvedText && <div className="v8-fallback">{res.unresolvedText}</div>}
      </div>
    );
  }
  if (res.kind === "name") return <div className="v8-summary" data-testid="result-summary"><b>{res.total}</b> results for <code>{res.core}</code></div>;
  return null;
}

export function Facets({ res, graph, health, q, pkgIds, onSearch, onOpenType }) {
  const mentioned = useMemo(() => {
    const c = new Map();
    for (const sec of res.sections) for (const it of sec.items) if (it.kind === "fn") for (const id of [...it.sig.inputs, ...it.sig.outputs]) c.set(id, (c.get(id) || 0) + 1);
    const focus = new Set([res.type?.id, ...(res.from || []).map((t) => t.id), ...(res.to || []).map((t) => t.id)]);
    return [...c].filter(([id]) => !focus.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [res]);
  const tb = typeById(graph);
  return (
    <aside className="v8-facets" data-testid="facets">
      {res.facets.length > 0 && <div className="v8-fac">
        <h4>Packages</h4>
        <ul>{res.facets.map((f) => {
          const on = res.include.includes(f.id), off = res.exclude.includes(f.id);
          const m = health ? healthOf(health, f.id) : null;
          return (
            <li key={f.id} className={(on ? "v8-on" : "") + (off ? " v8-off" : "")}>
              <button className="v8-fac-plus" title={on ? "remove this scope" : `only ${f.id} (+${f.id})`} onClick={() => onSearch(scopeQuery(q, pkgIds, f.id, on ? null : "+"))} data-testid={"facet-" + f.id}>
                {health && <HealthDot state={m?.state || "unknown"} />}<span className="v8-fac-name">{f.id}</span></button>
              <span className="v8-fac-n">{f.n}</span>
              <button className="v8-fac-minus" title={off ? "include it again" : `not ${f.id} (-${f.id})`} onClick={() => onSearch(scopeQuery(q, pkgIds, f.id, off ? null : "-"))} aria-label={(off ? "include " : "exclude ") + f.id}>{off ? "+" : "−"}</button>
            </li>
          );
        })}</ul>
      </div>}
      {mentioned.length > 0 && <div className="v8-fac">
        <h4>Types in these results</h4>
        <div className="v8-fac-types">{mentioned.map(([id, n]) => <span key={id} className="v8-fac-type"><TypeLink graph={graph} id={id} onOpen={onOpenType}>{tb[id]?.name || shortType(id)}</TypeLink><span className="v8-faint"> {n}</span></span>)}</div>
      </div>}
      <div className="v8-fac v8-syntax">
        <h4>Search syntax</h4>
        <dl>
          <dt>T -&gt;</dt><dd>what takes a T</dd>
          <dt>-&gt; T</dt><dd>where to get a T</dd>
          <dt>A -&gt; B</dt><dd>what turns A into B</dd>
          <dt>+pkg -pkg</dt><dd>only / not that package</dd>
          <dt><kbd>/</kbd></dt><dd>focus the search box</dd>
          <dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></dt><dd>move, open a row</dd>
        </dl>
        <p>T, A, B: a type name, e.g. JointState.</p>
      </div>
    </aside>
  );
}

// Props: res (annotated search result), graph, liveGraph, health, sourceUrl, liveSourceUrl, versionLabel,
// onOpenType, onOpenPackage, onSearch(q), q, pkgIds.
export function Results(props) {
  const { res, graph, health, onOpenType, onOpenPackage, onSearch } = props;
  const noHits = res.total === 0 && !res.ghostTotal && !res.type && !res.pkgDoc && !res.fallback;
  return (
    <div className="v8-results-wrap">
      <Facets {...props} />
      <div className="v8-results" data-testid="results">
        {res.kind === "type" && <TypeCard res={res} graph={graph} onOpenType={onOpenType} onSearch={onSearch} />}
        {res.kind === "package" && res.pkgDoc && <PackageCard res={res} graph={graph} health={health} onOpenPackage={onOpenPackage} />}
        <Summary res={res} graph={graph} onOpenType={onOpenType} onSearch={onSearch} />
        {res.ghostTotal > 0 && <div className="v8-vnote" data-testid="version-note"><span className="v8-ann-dot" /><b>{res.ghostTotal}</b> result{res.ghostTotal === 1 ? "" : "s"} on Live {res.ghostTotal === 1 ? "is" : "are"} not in {props.versionLabel}{res.onlyTotal ? <> · <b>{res.onlyTotal}</b> only here</> : null} — listed under each group.</div>}
        {noHits ? <p className="v8-empty v8-empty-big" data-testid="no-results">No results for <code>{res.core || res.include.join(" ")}</code> in {props.versionLabel}. Try a type name such as <button className="v8-qlink" onClick={() => onSearch("JointState")}>JointState</button>.</p>
          : res.sections.map((sec) => <Section key={sec.id} sec={sec} {...props} />)}
      </div>
    </div>
  );
}
