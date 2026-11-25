// V8 "Type Search" — robot-sdk is a functional library, so the front door is a type search (Hoogle, Haskell's
// search-by-type engine, is the reference app): "JointTrajectory ->" lists everything you can do with one, and the
// package map is the pipeline of who feeds whom. Every workspace is composed from the round-2 kit (@kit).
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useSite, useRoute, navigate, hrefTo, TopRight, VersionBanner, TypeWorkspace, PackageMap, Directory, HealthBoard,
  RunPanel, AgentsPanel, SkillPanel, HealthDot, TypeLink, Install, PkgLinks, PITCH, healthOf, healthSummary,
  typeCounts, signatures, pipelineEdges, typeById, shortType, LAYER_LABEL, GLUE, store, PM_MODE_DEFAULTS, fmtShortDate, HEALTH_LABEL,
} from "@kit";
import { search, annotate } from "./search.js";
import { Results } from "./results.jsx";
import "./v8.css";

const NAV = [
  ["search", "Search"], ["types", "Types"], ["packages", "Packages"], ["directory", "Directory"], ["health", "Health"],
  ["agents", "Agents"], ["run", "Run"], ["skill", "For coding agents"],
];
// The example queries under the search box. WHY JointLimits -> JointTrajectory and not "Pose -> JointTrajectory" (the
// brief's example): on today's graph no public function takes a Pose, so that chip would land on an empty page; this
// pair has 4 real answers in robot_trajectories.
const EXAMPLES = ["JointTrajectory ->", "-> JointTrajectory", "JointLimits -> JointTrajectory", "robot_controllers"];

function useNarrow(px = 520) {
  const q = `(max-width: ${px}px)`;
  const [n, setN] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q), f = () => setN(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, [q]);
  return n;
}

function useWinH() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => { const f = () => setH(window.innerHeight); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return h;
}

function Mark() {
  return <span className="v8-mark" aria-hidden><svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M4 12h12m-4-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}

// Dots + counts; the words drop on a phone so the top-right still fits beside the picker.
function HealthChip({ health, note, onClick }) {
  const s = healthSummary(health);
  if (!s) return <button className="v8-hchip v8-hchip-none" onClick={onClick} title={note || "health not recorded"} data-testid="health-pill">health not recorded</button>;
  const part = (n, st, w) => n ? <span className="v8-hc" key={st}><HealthDot state={st} /><b>{n}</b><span className="v8-hw"> {w}</span></span> : null;
  return (
    <button className="v8-hchip" onClick={onClick} title={`Health: ${s.fail || 0} failing · ${s.warn || 0} warnings · ${s.pass || 0} passing — open the Health workspace`} data-testid="health-pill">
      {part(s.fail, "fail", "failing")}{part(s.warn, "warn", s.warn === 1 ? "warning" : "warnings")}{part(s.pass, "pass", "passing")}{part(s.unknown, "unknown", "unknown")}
    </button>
  );
}

// ---- the package page (Packages workspace, right column) ----------------------------------------------------------
function PackagePanel({ graph, health, id, onOpenType, onOpenPackage, onSearch, onClose }) {
  const p = graph.packages.find((x) => x.id === id);
  const flows = useMemo(() => pipelineEdges(graph), [graph]);
  if (!p) return <div className="v8-pp"><p className="v8-empty">No package <code>{id}</code> in this version.</p><button className="v8-btn" onClick={onClose}>Close</button></div>;
  const m = health ? healthOf(health, id) : null;
  const sigs = signatures(graph).filter((s) => s.package === id);
  const tb = typeById(graph);
  const tally = (key) => { const c = new Map(); for (const s of sigs) for (const t of s[key]) c.set(t, (c.get(t) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1]); };
  const takes = tally("inputs"), gives = tally("outputs");
  const from = flows.filter((e) => e.target === id), to = flows.filter((e) => e.source === id);
  const checks = health?.checks || [];
  const order = { fail: 0, warn: 1, running: 2, unknown: 3, pass: 4, none: 5 };
  const rows = m ? checks.map((c) => [c, m.checks?.[c.id]]).filter(([, x]) => x).sort((a, b) => (order[a[1].state] ?? 9) - (order[b[1].state] ?? 9)) : [];
  const T = (tid, n) => <span key={tid} className="v8-pp-t"><TypeLink graph={graph} id={tid} onOpen={onOpenType}>{tb[tid]?.name || shortType(tid)}</TypeLink>{n != null && <span className="v8-faint"> {n}</span>}</span>;
  return (
    <div className="v8-pp" data-testid="package-panel">
      <div className="v8-pp-head">
        <div className="v8-pp-title"><code>{p.id}</code><span className="v8-ver">v{p.version}</span><span className="v8-layer">{LAYER_LABEL[p.layer] || p.layer}{p.role === "viewer" ? " · viewer" : ""}</span>
          <button className="v8-x" onClick={onClose} aria-label="Close the package page" title="Close">×</button></div>
        <p className="v8-pp-one">{p.one_line}</p>
        <PkgLinks pkg={p} />
      </div>
      <div className="v8-pp-sec">
        <h4>Health {m && <span className={"v8-hstate v8-st-" + m.state}><HealthDot state={m.state} /> {HEALTH_LABEL[m.state]}</span>}</h4>
        {!health ? <p className="v8-empty">Health was not recorded for this version.</p> : !m ? <p className="v8-empty">No health row for {id}.</p> :
          <ul className="v8-pp-checks" data-testid="package-health">{rows.map(([c, x]) => (
            <li key={c.id} className={"v8-st-" + x.state}>
              <HealthDot state={x.state} /><b>{c.label}</b><span className="v8-pp-detail">{x.detail || HEALTH_LABEL[x.state]}</span>
              {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="v8-ev" data-testid={"evidence-" + c.id}>evidence ↗</a> : x.where ? <code className="v8-faint">{x.where}</code> : null}
              {(x.failures || []).length > 0 && <ul className="v8-pp-fails">{x.failures.map((f, i) => <li key={i}><code>{typeof f === "string" ? f : JSON.stringify(f)}</code></li>)}</ul>}
            </li>))}</ul>}
      </div>
      <div className="v8-pp-sec">
        <h4>In the pipeline <span className="v8-faint">who feeds whom, by type</span></h4>
        {from.length + to.length === 0 ? <p className="v8-empty">Shares no public type with another package{id === GLUE ? " — it defines the types every other package joins on" : ""}.</p> : <>
          {[["gets from", from, "source"], ["feeds", to, "target"]].filter(([, l]) => l.length).map(([k, l, end]) => (
            <div key={k} className="v8-pp-flow"><span className="v8-pp-k">{k}</span><div className="v8-pp-edges">{l.map((e) => (
              <div key={e.id} className="v8-pp-edge"><button className="v8-linkish" onClick={() => onOpenPackage(e[end])} data-testid={"flow-" + e[end]}><code>{e[end]}</code></button>{" "}
                <span className="v8-faint">({e.types.map((t, i) => <span key={t}>{i ? ", " : ""}<TypeLink graph={graph} id={t} onOpen={onOpenType}>{tb[t]?.name || shortType(t)}</TypeLink></span>)})</span></div>))}</div></div>))}
        </>}
      </div>
      <div className="v8-pp-sec">
        <h4>Takes <span className="v8-faint">{takes.length} types as public parameters</span></h4>
        <div className="v8-pp-types">{takes.length ? takes.map(([t, n]) => T(t, n)) : <span className="v8-empty">none</span>}</div>
        <h4>Returns <span className="v8-faint">{gives.length} types</span></h4>
        <div className="v8-pp-types">{gives.length ? gives.map(([t, n]) => T(t, n)) : <span className="v8-empty">none</span>}</div>
        <button className="v8-btn v8-pp-all" onClick={() => onSearch(p.id)} data-testid="package-search">All {sigs.length} symbols in search →</button>
      </div>
    </div>
  );
}

// The Packages workspace without a selection: every package, failing first, one click to its page.
function PackageIndex({ graph, health, onOpenPackage }) {
  const order = { fail: 0, warn: 1, running: 2, unknown: 3, pass: 4 };
  const list = [...graph.packages].sort((a, b) => (order[healthOf(health, a.id)?.state] ?? 5) - (order[healthOf(health, b.id)?.state] ?? 5));
  return (
    <div className="v8-pp v8-pidx">
      <h4>Pick a package <span className="v8-faint">{graph.packages.length} · failing first</span></h4>
      <ul>{list.map((p) => { const m = healthOf(health, p.id); return (
        <li key={p.id}><button className="v8-linkish" onClick={() => onOpenPackage(p.id)} data-testid={"pidx-" + p.id}>{health && <HealthDot state={m?.state || "unknown"} />}<code>{p.id}</code></button><span className="v8-faint v8-pidx-l">{LAYER_LABEL[p.layer]}</span></li>); })}</ul>
    </div>
  );
}

const PM_KEY = "rsdk-v8-pm";
function loadPm() {
  try { const s = JSON.parse(store.get(PM_KEY) || "null"); if (s && s.tree && s.pipeline && s.shared) return s; } catch { /* default */ }
  return { tree: { ...PM_MODE_DEFAULTS.tree }, pipeline: { ...PM_MODE_DEFAULTS.pipeline }, shared: { agents: false, imports: false, health: true } };
}

function PackagesWs({ site, route, openType, openPkg, onSearch }) {
  const { graph, health } = site;
  const winH = useWinH();
  // WHY the mode lives in the URL with pipeline as the default (brief: "Packages workspace opens in PIPELINE mode by
  // default (robot_msgs hidden), tree one click away"): the kit's own memory (localStorage, shared by every variant on
  // the origin) could open another variant's last mode; ?mode=tree deep-links the tree and Back returns to the pipeline.
  const mode = route.params.mode === "tree" ? "tree" : "pipeline";
  const [pm, setPm] = useState(loadPm);
  const options = { mode, ...pm.shared, ...PM_MODE_DEFAULTS[mode], ...pm[mode], byMode: { tree: pm.tree, pipeline: pm.pipeline } };
  const onOptions = (next) => {
    const n = { ...pm, shared: { agents: !!next.agents, imports: !!next.imports, health: next.health !== false }, [next.mode]: { groupByLayer: !!next.groupByLayer, deps: !!next.deps } };
    setPm(n); store.set(PM_KEY, JSON.stringify(n));
    if (next.mode !== mode) navigate({ ws: "packages", args: route.args, params: { mode: next.mode === "tree" ? "tree" : null } });
  };
  const sel = route.arg;
  const ring = sel ? `.v8-pmwrap [data-testid="pm-node-${sel}"]{outline:3px solid var(--v8-accent);outline-offset:3px;border-radius:10px}` : "";
  return (
    <div className={"v8-packages" + (sel ? " v8-has-sel" : "")} data-testid="ws-packages">
      <div className="v8-pmwrap">
        <style>{ring}</style>
        <PackageMap graph={graph} health={health} options={options} onOptions={onOptions} maxHeight={Math.max(420, winH - 290)}
          onOpenPackage={openPkg} onOpenType={openType} onSelect={(id) => { if (id) openPkg(id); }} />
      </div>
      {sel ? <PackagePanel graph={graph} health={health} id={sel} onOpenType={openType} onOpenPackage={openPkg} onSearch={onSearch}
        onClose={() => navigate({ ws: "packages", params: { mode: mode === "tree" ? "tree" : null } })} />
        : <PackageIndex graph={graph} health={health} onOpenPackage={openPkg} />}
    </div>
  );
}

// ---- the home: Hoogle's front page ----------------------------------------------------------------------------------
function Home({ site, onSearch, openType, openWs }) {
  const { graph, health } = site;
  const c = typeCounts(graph);
  const top = [...graph.types].sort((a, b) => (c[b.id]?.total || 0) - (c[a.id]?.total || 0)).slice(0, 9);
  const sigs = signatures(graph).filter((s) => s.inputs.length || s.outputs.length);
  const s = healthSummary(health);
  return (
    <div className="v8-home-below" data-testid="home">
      <p className="v8-pitch" data-testid="pitch"><b>robot-sdk</b> is {PITCH.replace(/^A generic/, "a generic")}</p>
      <div className="v8-pitch-row"><span className="v8-pitch-i"><Install /></span>
        <button className="v8-qlink" onClick={() => openWs("run")} data-testid="home-run">See it pick and place →</button></div>
      <div className="v8-home-grid">
        <div className="v8-home-col">
          <h4>Most-used types</h4>
          <div className="v8-home-types">{top.map((t) => <span key={t.id} className="v8-home-t"><TypeLink graph={graph} id={t.id} onOpen={openType} /><span className="v8-faint"> {c[t.id]?.total || 0}</span></span>)}</div>
        </div>
        <div className="v8-home-col">
          <h4>What is passing</h4>
          {s ? <button className="v8-home-health" onClick={() => openWs("health")} data-testid="home-health">
            <span><HealthDot state="fail" /> <b>{s.fail || 0}</b> failing</span><span><HealthDot state="warn" /> <b>{s.warn || 0}</b> warnings</span><span><HealthDot state="pass" /> <b>{s.pass || 0}</b> passing</span>
            <span className="v8-faint">→ Health</span></button> : <span className="v8-empty">{site.healthNote}</span>}
        </div>
      </div>
      <p className="v8-home-foot">Searching <b>{graph.types.length}</b> types and the <b>{sigs.length}</b> symbols that take or return them, across <b>{graph.packages.length}</b> packages · graph.json {fmtShortDate(graph.generated)}{site.version?.label ? ` · ${site.version.label}` : ""}</p>
    </div>
  );
}

function Page({ title, sub, children, testid }) {
  return <div className="v8-page" data-testid={testid}><div className="v8-page-head"><h2>{title}</h2>{sub && <p className="v8-faint">{sub}</p>}</div>{children}</div>;
}

// ---- the app ------------------------------------------------------------------------------------------------------
function App() {
  const site = useSite();
  const route = useRoute("search");
  const ws = route.ws;
  const urlQ = ws === "search" ? route.params.q || "" : "";
  const [draft, setDraft] = useState(urlQ);
  const lastQ = useRef(urlQ), lastType = useRef(null), lastPm = useRef({});
  const input = useRef(null);
  const narrow = useNarrow();
  useEffect(() => { setDraft(urlQ); if (ws === "search") lastQ.current = urlQ; }, [ws, urlQ]);
  // A workspace is a page: arrive at its top (the results' scroll offset otherwise clipped the header of the next one).
  // On a phone the package page sits above the map, so opening another package scrolls up to it as well.
  const pkgArg = ws === "packages" ? route.arg : null;
  useEffect(() => { window.scrollTo(0, 0); }, [ws]);
  useEffect(() => { if (pkgArg && narrow) window.scrollTo(0, 0); }, [pkgArg]);
  if (ws === "types" && route.arg) lastType.current = route.arg;
  if (ws === "packages") lastPm.current = { arg: route.arg, mode: route.params.mode };

  // Typing searches as you go (Hoogle's instant mode). Each burst of typing is one history entry: its first keystroke
  // pushes, the rest replace; blur, Enter, a chip or a link ends the burst. So Back walks queries, not keystrokes, and
  // never skips the query you were on before you started typing (hand check, 2026-11-25: replace-only lost it).
  const editing = useRef(false);
  const onType = (v) => {
    setDraft(v);
    navigate({ ws: "search", params: { q: v || null }, replace: editing.current && ws === "search" });
    editing.current = true;
  };
  const runQuery = useCallback((q) => { editing.current = false; setDraft(q); navigate({ ws: "search", params: { q: q || null } }); }, []);
  const openType = useCallback((k) => navigate({ ws: "types", args: [k] }), []);
  const openPkg = useCallback((id) => navigate({ ws: "packages", args: [id], params: { mode: lastPm.current.mode || null } }), []);
  const openWs = useCallback((w) => navigate({ ws: w }), []);
  const navHref = (w) => w === "search" ? hrefTo("search") + (lastQ.current ? (hrefTo("search").includes("?") ? "&" : "?") + "q=" + encodeURIComponent(lastQ.current) : "")
    : w === "types" && lastType.current ? hrefTo("types", lastType.current)
    : w === "packages" ? hrefTo("packages", ...(lastPm.current.arg ? [lastPm.current.arg] : [])) + (lastPm.current.mode ? (hrefTo("packages").includes("?") ? "&" : "?") + "mode=" + lastPm.current.mode : "")
    : hrefTo(w);

  const home = ws === "search" && !urlQ;
  const pkgIds = useMemo(() => site.ready ? new Set([...site.graph.packages, ...site.live.graph.packages].map((p) => p.id)) : new Set(), [site.ready, site.graph, site.live]);
  const res = useMemo(() => {
    if (!site.ready || ws !== "search" || !urlQ) return null;
    const r = search(site.graph, urlQ, { pkgIds, refGraph: site.isLive ? null : site.live.graph });
    if (site.isLive) return r;
    return annotate(r, search(site.live.graph, urlQ, { pkgIds }), site.graph, site.live.graph);
  }, [site.ready, site.graph, site.live, site.isLive, ws, urlQ, pkgIds]);
  const liveSourceUrl = useCallback((pkg, where) => {
    const p = site.live?.graph?.packages.find((x) => x.id === pkg);
    if (!p?.repo_url || !where) return null;
    const [path, lines] = String(where).split(":");
    return `${p.repo_url}/blob/main/${path}${lines ? "#L" + lines.split("-")[0] : ""}`;
  }, [site.live]);

  // Keyboard: "/" focuses the search box; ↑↓ move through the result rows; Enter opens the row (Hoogle + GitHub's "/").
  // WHY the active row is a data attribute set here and not React state: rows re-render on every query; the cursor is
  // reset with the query, so it never needs to survive a render.
  const active = useRef(-1);
  useEffect(() => { active.current = -1; document.querySelectorAll("[data-v8-row][data-active]").forEach((el) => el.removeAttribute("data-active")); }, [urlQ, site.versionId]);
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); input.current?.focus(); input.current?.select(); return; }
      if (ws !== "search") return;
      if (typing && t !== input.current) return;
      const rows = [...document.querySelectorAll("[data-v8-row]")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rows.length) return;
        e.preventDefault();
        rows[active.current]?.removeAttribute("data-active");
        active.current = e.key === "ArrowDown" ? Math.min(rows.length - 1, active.current + 1) : Math.max(-1, active.current - 1);
        const el = rows[active.current];
        if (el) { el.setAttribute("data-active", ""); el.scrollIntoView({ block: "nearest" }); }
      } else if (e.key === "Enter" && active.current >= 0 && rows[active.current]) {
        e.preventDefault();
        editing.current = false;
        rows[active.current].querySelector("[data-v8-open]")?.click();
      } else if (e.key === "Escape" && t === input.current) { input.current.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws]);

  if (site.error) return <div className="v8-fatal">Could not load the data: {String(site.error.message || site.error)}</div>;
  if (!site.ready) return <div className="v8-fatal v8-faint">Loading graph.json, health.json, versions.json…</div>;
  const { graph, health } = site;
  const versionLabel = site.version?.label || "this version";
  const fill = ws === "types";

  return (
    <div className={"v8-app" + (home ? " v8-is-home" : "") + (fill ? " v8-fill" : "")} data-ws-current={ws}>
      <header className="v8-head">
        <a className="v8-logo" href={hrefTo("search")} onClick={(e) => { e.preventDefault(); runQuery(""); }} data-testid="logo" title="robot-sdk type search — home">
          <Mark /><span className="v8-logo-t">robot-sdk</span>{home && <span className="v8-logo-s">type search</span>}</a>
        <form className="v8-search" role="search" onSubmit={(e) => { e.preventDefault(); if (active.current < 0) { editing.current = false; if (draft.trim() !== urlQ) runQuery(draft.trim()); } }}>
          <span className="v8-search-ico" aria-hidden>⌕</span>
          <input ref={input} type="search" value={draft} onChange={(e) => onType(e.target.value)} onBlur={() => { editing.current = false; }} autoComplete="off" spellCheck={false}
            placeholder={narrow ? "A type, e.g. JointState" : "Search a type or function — try JointTrajectory ->"} aria-label="Search a type or function" data-testid="search-input" />
          <kbd className="v8-slash" title="press / to search">/</kbd>
          <button type="submit" className="v8-search-btn" data-testid="search-go">Search</button>
        </form>
        <div className="v8-tr"><TopRight site={site}><HealthChip health={health} note={site.healthNote} onClick={() => openWs("health")} /></TopRight></div>
        {home && <div className="v8-examples" data-testid="examples"><span className="v8-faint">Try</span>{EXAMPLES.map((q) => <button key={q} className="v8-ex" onClick={() => runQuery(q)} data-testid={"example-" + EXAMPLES.indexOf(q)}>{q}</button>)}</div>}
        <nav className="v8-nav" aria-label="Workspaces"><div className="v8-seg">
          {NAV.map(([w, label]) => <a key={w} data-ws={w} href={navHref(w)} className={"v8-seg-a" + (ws === w ? " on" : "")} aria-current={ws === w ? "page" : undefined}>{label}</a>)}
        </div></nav>
      </header>
      {!home && <VersionBanner site={site} className="v8-banner" onOpenPackage={openPkg} onOpenType={openType} />}
      <main className={"v8-main v8-main-" + ws}>
        {home && <><VersionBanner site={site} className="v8-banner v8-banner-home" onOpenPackage={openPkg} onOpenType={openType} /><Home site={site} onSearch={runQuery} openType={openType} openWs={openWs} /></>}
        {ws === "search" && res && <Results res={res} graph={graph} liveGraph={site.live.graph} health={health} sourceUrl={site.sourceUrl} liveSourceUrl={liveSourceUrl}
          versionLabel={versionLabel} onOpenType={openType} onOpenPackage={openPkg} onSearch={runQuery} q={urlQ} pkgIds={pkgIds} />}
        {ws === "types" && <TypeWorkspace graph={graph} health={health} typeKey={route.arg} onOpenType={openType} onOpenPackage={openPkg}
          onGo={(w) => openWs(w)} sourceUrl={site.sourceUrl} intro={false} height="100%" />}
        {ws === "packages" && <PackagesWs site={site} route={route} openType={openType} openPkg={openPkg} onSearch={runQuery} />}
        {ws === "directory" && <Page title="Directory" sub="Every package by layer, the viewer and the agents — one click to GitHub, Site, PyPI and README." testid="ws-directory">
          <Directory graph={graph} health={health} onOpenPackage={openPkg} onOpenAgent={() => openWs("agents")} /></Page>}
        {ws === "health" && <Page title="Health" sub={health ? "Every package and agent against five checks, failing first. Each cell opens its evidence." : null} testid="ws-health">
          <HealthBoard health={health} graph={graph} note={site.healthNote} onOpenPackage={openPkg} onOpenAgent={() => openWs("agents")} onBackToLive={() => site.setVersion("live")}
            filter={route.params.filter || "all"} onFilter={(f) => route.setParams({ filter: f === "all" ? null : f })} title={`${(health?.members || []).length || ""} members × ${(health?.checks || []).length || ""} checks`} />
          {health && <dl className="v8-checks">{health.checks.map((c) => <div key={c.id}><dt>{c.label}</dt><dd>{c.what}</dd></div>)}</dl>}</Page>}
        {ws === "agents" && <Page title="Agents" sub="Agents import packages; a package never imports an agent." testid="ws-agents"><AgentsPanel graph={graph} health={health} onOpenPackage={openPkg} /></Page>}
        {ws === "run" && <Page title="Pick and place" sub="The real run, stage by stage: each stage is one package; each type between them is a link." testid="ws-run"><RunPanel pick={site.pick} graph={graph} health={health} onOpenType={openType} onOpenPackage={openPkg} /></Page>}
        {ws === "skill" && <Page title="For coding agents" testid="ws-skill"><SkillPanel /></Page>}
        {!NAV.some(([w]) => w === ws) && <Page title="Not found"><p>No workspace “{ws}”. <a href={hrefTo("search")}>Back to search</a></p></Page>}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
