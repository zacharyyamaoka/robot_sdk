// V9 "Buildfarm": Health is the home. A members × checks matrix, failing first, with versions as columns side by side
// (status.ros.org's repositories × distros grid; a CI dashboard's jobs × checks), so what passes and what changed
// between versions is one glance; every other workspace is coloured by the same health.
// Shell: a left sidebar (pitch + install, type jump, workspace list with counts; draggable, width remembered,
// foldable), a top bar with the breadcrumb and the version picker + GitHub mark top-right, and a one-line health
// summary under it on every workspace. Everything else is the shared kit (@kit), on real data only.
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useSite, useRoute, navigate, TopRight, VersionBanner, HealthDot, healthSummary, TypeWorkspace, PackageMap, Directory,
  RunPanel, AgentsPanel, SkillPanel, Install, PITCH, PITCH_2, LAYER_RULE, matchTypes, typeKey, resolveType, mostUsedType,
  fmtShortDate, healthOf, pmOptions, switchMode,
} from "@kit";
import { HealthMatrix, AcrossVersions } from "./matrix.jsx";
import { PackagePage, PackageQueue } from "./pkgpage.jsx";
import "./v9.css";

// ---- per-viewer conveniences (localStorage, try/catch: a blocked store only means no memory) ---------------------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* no memory, still works */ } },
};
function useStored(key, init) {
  const [v, setV] = useState(() => store.get(key, init));
  return [v, (x) => setV((old) => { const n = typeof x === "function" ? x(old) : x; store.set(key, n); return n; })];
}

// ---- icons (16 px, stroke) ----------------------------------------------------------------------------------------
const I = (d, extra) => ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="v9-ico">{d}{extra}</svg>
);
const ICONS = {
  health: I(<path d="M1.5 8.5h2.8l1.7-4.5 3.2 8.5 1.8-4h3.5" />),
  types: I(<path d="M5.5 2.5c-1.6 0-1.8 1-1.8 2.3S3.4 7.7 2 8c1.4.3 1.7 1.6 1.7 3.2s.2 2.3 1.8 2.3M10.5 2.5c1.6 0 1.8 1 1.8 2.3s.3 2.9 1.7 3.2c-1.4.3-1.7 1.6-1.7 3.2s-.2 2.3-1.8 2.3" />),
  packages: I(<path d="M8 1.8l5.6 2.9v6.6L8 14.2l-5.6-2.9V4.7zM2.4 4.7 8 7.6l5.6-2.9M8 7.6v6.6" />),
  directory: I(<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />),
  agents: I(<><rect x="3" y="5.5" width="10" height="7.5" rx="2" /><path d="M8 2.5v3M6 9.3h.01M10 9.3h.01" /></>),
  run: I(<path d="M5 3.2l7.5 4.8L5 12.8z" />),
  skill: I(<><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8" /><path d="M4.6 6.2l2 1.9-2 1.9M8.4 10.1h3" /></>),
  fold: I(<path d="M10 3.5 5.5 8l4.5 4.5" />),
  unfold: I(<path d="M6 3.5 10.5 8 6 12.5" />),
  menu: I(<path d="M2.5 4h11M2.5 8h11M2.5 12h11" />),
  search: I(<><circle cx="7" cy="7" r="4.3" /><path d="m10.2 10.2 3.3 3.3" /></>),
};

const WS = [
  { id: "health", label: "Health", sub: "members × checks, across versions" },
  { id: "types", label: "Types", sub: "what takes it, where to get one" },
  { id: "packages", label: "Packages", sub: "the layer tree and the type pipeline" },
  { id: "directory", label: "Directory", sub: "every package and agent, one click out" },
  { id: "agents", label: "Agents", sub: "agents built on robot-sdk" },
  { id: "run", label: "Run", sub: "the pick-and-place, stage by stage" },
  { id: "skill", label: "For coding agents", sub: "hand the SDK to Claude Code or Codex" },
];
const WS_BY = Object.fromEntries(WS.map((w) => [w.id, w]));

// ---- the sidebar's type jump: two actions from anywhere to "what can I do with a JointTrajectory?" --------------
function TypeJump({ graph, onOpenType, compact }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const list = useMemo(() => matchTypes(graph, q).slice(0, 8), [graph, q]);
  const pick = (t) => { if (!t) return; onOpenType(typeKey(graph, t)); setQ(""); setOpen(false); };
  return (
    <div className={"v9-jump" + (compact ? " v9-jump-c" : "")} data-testid="type-jump">
      <ICONS.search size={14} />
      <input type="search" value={q} placeholder={`Jump to a type (${graph.types.length})`} aria-label="Jump to a type" data-testid="type-jump-input"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(list[hi]); }
          else if (e.key === "Escape") { setOpen(false); }
        }} />
      {open && q.trim() && <ul className="v9-jump-list" role="listbox">
        {list.map((t, i) => (
          <li key={t.id}><button role="option" aria-selected={i === hi} className={i === hi ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pick(t); }} data-testid={"jump-" + t.name}>
            <code>{t.name}</code><span className="k-faint">{t.module}</span></button></li>
        ))}
        {!list.length && <li className="v9-jump-none">No type matches “{q}”.</li>}
      </ul>}
    </div>
  );
}

function Sidebar({ site, route, counts, folded, onFold, last, onOpenType, drawer, onCloseDrawer }) {
  const { graph, health } = site;
  const s = healthSummary(health);
  const href = (id) => id === "types" && last.types ? route.href("types", last.types) : id === "packages" && last.packages ? route.href("packages", last.packages) : route.href(id);
  return (
    <aside className={"v9-side" + (folded ? " v9-folded" : "") + (drawer ? " v9-drawer-open" : "")} data-testid="sidebar">
      <div className="v9-brand">
        <span className="v9-logo" aria-hidden><i /><i /><i /><i /></span>
        {!folded && <a className="v9-wordmark" href={route.href("health")}>robot-sdk</a>}
        <span className="k-grow" />
        <button className="v9-iconbtn v9-foldbtn" onClick={drawer ? onCloseDrawer : onFold} title={folded ? "Unfold the sidebar" : "Fold the sidebar"} aria-label={folded ? "Unfold the sidebar" : "Fold the sidebar"} data-testid="side-fold">
          {folded ? <ICONS.unfold /> : <ICONS.fold />}
        </button>
      </div>
      {!folded && <div className="v9-pitch" data-testid="pitch">
        <p title={PITCH + " " + PITCH_2}>{PITCH}</p>
        <Install />
        <button className="v9-runlink" onClick={() => route.go("run")} data-testid="pitch-run">See it pick and place →</button>
      </div>}
      {!folded && <TypeJump graph={graph} onOpenType={onOpenType} />}
      <nav className="v9-nav" aria-label="Workspaces">
        {!folded && <div className="v9-nav-h">Workspaces</div>}
        {WS.map((w) => {
          const Icon = ICONS[w.id];
          const on = route.ws === w.id;
          const c = counts[w.id];
          return (
            <a key={w.id} href={href(w.id)} className={"v9-nav-a" + (on ? " on" : "")} data-ws={w.id} aria-current={on ? "page" : undefined} title={folded ? `${w.label} — ${w.sub}` : w.sub} onClick={onCloseDrawer}>
              <Icon />
              {!folded && <span className="v9-nav-l">{w.label}</span>}
              {w.id === "health" && s
                ? <span className={"v9-badge" + (s.fail ? " v9-badge-fail" : s.warn ? " v9-badge-warn" : " v9-badge-pass")} title={`${s.fail} failing · ${s.warn} warnings · ${s.pass} passing`}>{s.fail ? `✗ ${s.fail}` : s.warn ? `⚠ ${s.warn}` : "✓"}</span>
                : c != null && <span className="v9-count">{c}</span>}
            </a>
          );
        })}
      </nav>
      {!folded && <div className="v9-side-foot">
        <div className="v9-nav-h">Data</div>
        <div className="v9-foot-row"><span>graph</span><span>{fmtShortDate(graph.generated)}</span></div>
        <div className="v9-foot-row"><span>health</span><span>{health ? fmtShortDate(health.generated) : "not recorded"}</span></div>
        <div className="v9-foot-row"><span>source</span><span>{site.source?.graph === "runtime" ? "read at runtime" : site.source?.graph || "?"}</span></div>
        <p className="v9-rule" title={LAYER_RULE}>Packages import only from layers below; the type is the API.</p>
      </div>}
    </aside>
  );
}

// The one-line health summary on every workspace: "✗ 4 failing · ⚠ 10 · ✓ 2 — Live"; each part jumps to Health.
function SummaryBar({ site, route }) {
  const s = healthSummary(site.health);
  const label = site.version?.label || "Live";
  const go = (filter) => navigate({ ws: "health", params: { filter: filter === "all" ? null : filter } });
  if (!s) return (
    <div className="v9-sum v9-sum-none" data-testid="health-summary-bar">
      <span className="v9-sum-dash">Health not recorded for <b>{label}</b></span>
      <span className="k-faint v9-sum-meta">snapshots keep the graph only; Live's checks are never shown under another version</span>
      <span className="k-grow" />
      <button className="v9-sum-link" onClick={() => site.setVersion("live")}>Show Live</button>
    </div>
  );
  return (
    <div className="v9-sum" data-testid="health-summary-bar">
      <button className="v9-sum-p v9-sf" onClick={() => go("fail")} title="Show the failing members" data-testid="sum-fail"><b>✗ {s.fail}</b> failing</button>
      <span className="v9-sum-sep">·</span>
      <button className="v9-sum-p v9-sw" onClick={() => go("warn")} title="Show the members with warnings" data-testid="sum-warn"><b>⚠ {s.warn}</b></button>
      <span className="v9-sum-sep">·</span>
      <button className="v9-sum-p v9-sp" onClick={() => go("all")} title="Show every member" data-testid="sum-pass"><b>✓ {s.pass}</b></button>
      {s.unknown ? <><span className="v9-sum-sep">·</span><span className="v9-sum-p">? {s.unknown}</span></> : null}
      <span className="v9-sum-dash">— <b>{label}</b></span>
      <span className="v9-sum-meta k-faint">{site.health === site.live.health ? "health.json" : "health"} {fmtShortDate(site.health.generated)}</span>
      <span className="k-grow" />
      {route.ws !== "health" && <button className="v9-sum-link" onClick={() => go("all")} data-testid="sum-open-health">Open the health matrix →</button>}
    </div>
  );
}

function WsHead({ title, sub, children }) {
  return (
    <div className="v9-wshead">
      <div className="v9-wshead-t"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="v9-wshead-x">{children}</div>}
    </div>
  );
}

function App() {
  const site = useSite();
  const route = useRoute("health");
  const [width, setWidth] = useStored("rsdk-v9-side-w", 232);
  // WHY a separate fold for Types (remembered too): the switchboard needs the width — beside a full sidebar its
  // package nodes drop to ~7 px text at 1440 px. Types opens with the sidebar folded to its icon rail; unfold it
  // there and Types remembers that.
  const [foldedMain, setFoldedMain] = useStored("rsdk-v9-side-folded", false);
  const [foldedTypes, setFoldedTypes] = useStored("rsdk-v9-side-folded-types", true);
  const folded = route.ws === "types" ? foldedTypes : foldedMain;
  const setFolded = route.ws === "types" ? setFoldedTypes : setFoldedMain;
  const [grouped, setGrouped] = useStored("rsdk-v9-hm-grouped", true);
  const [drawer, setDrawer] = useState(false);
  // Package map toggles: remembered per viewer; the mode (tree | pipeline) also lives in the URL (?mode=pipeline) so
  // the pipeline is one deep link and Back walks it.
  const [pmStored, setPmStored] = useStored("rsdk-v9-pm", pmOptions());
  const [dragging, setDragging] = useState(false);
  // WHY remember the last type and package: switching workspaces keeps the selection (criterion fr4), so Types and
  // Packages in the sidebar reopen where you were.
  const [last, setLast] = useState({ types: null, packages: null });
  useEffect(() => {
    if (route.ws === "types" && route.arg) setLast((l) => (l.types === route.arg ? l : { ...l, types: route.arg }));
    if (route.ws === "packages") setLast((l) => (l.packages === route.arg ? l : { ...l, packages: route.arg }));
  }, [route.ws, route.arg]);
  useEffect(() => { window.scrollTo(0, 0); setDrawer(false); }, [route.ws]);

  // the draggable sidebar boundary (Zach's standing UI rule: every boundary draggable, width remembered, foldable)
  const dragRef = useRef(null);
  const onDragStart = (e) => {
    e.preventDefault();
    setDragging(true);
    const move = (ev) => {
      const x = ev.clientX;
      if (x < 120) { setFolded(true); return; }
      setFolded(false);
      setWidth(Math.round(Math.max(200, Math.min(400, x))));
    };
    const up = () => { setDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (site.error) return <div className="v9-fatal"><h1>Could not load the data</h1><p>{String(site.error.message || site.error)}</p></div>;
  if (!site.ready) return <div className="v9-fatal v9-loading">Loading graph.json, health.json and versions.json…</div>;

  const { graph, health } = site;
  const openType = (k) => route.go("types", k);
  const openPkg = (id, v) => navigate({ ws: "packages", args: [id], params: v !== undefined ? { v: v === "live" ? null : v } : {} });
  const openAgent = () => route.go("agents");
  const ws = WS_BY[route.ws] ? route.ws : "health";
  const counts = {
    types: graph.types.length, packages: graph.packages.length, directory: graph.packages.length + (graph.agents || []).length,
    agents: (graph.agents || []).length, run: site.pick?.stages?.length ?? null, skill: null,
  };
  const filter = ["fail", "warn"].includes(route.params.filter) ? route.params.filter : "all";
  const sideW = folded ? 56 : width;
  let pmOpts = pmOptions(pmStored);
  const urlMode = route.params.mode === "pipeline" ? "pipeline" : "tree";
  if (pmOpts.mode !== urlMode) pmOpts = pmOptions({ ...pmOpts, ...switchMode(pmOpts, urlMode) });
  const onPm = (o) => { setPmStored(o); if (o.mode !== pmOpts.mode) route.setParams({ mode: o.mode === "pipeline" ? "pipeline" : null }); };

  const crumbs = [WS_BY[ws].label];
  if (ws === "types") { const t = resolveType(graph, route.arg) || mostUsedType(graph); if (t) crumbs.push(t.name); }
  if (ws === "packages" && route.arg) crumbs.push(route.arg);

  let body;
  if (ws === "health") body = (
    <div className="v9-ws v9-ws-health">
      <WsHead title="Health" sub={<>Every package and agent × its checks at <b>{site.version?.label}</b>, beside its version and type uses in each version.<span className="v9-hide-phone"> Hover a cell for the detail; click it for the evidence (CI run, PyPI page, lint lines).</span></>} />
      <HealthMatrix site={site} filter={filter} onFilter={(f) => route.setParams({ filter: f === "all" ? null : f }, { replace: true })}
        grouped={grouped} onGrouped={setGrouped} onOpenPackage={openPkg} onOpenAgent={openAgent} />
      <AcrossVersions site={site} onOpenPackage={openPkg} onOpenType={openType} />
    </div>
  );
  else if (ws === "types") body = (
    <div className="v9-ws v9-ws-types">
      <TypeWorkspace graph={graph} health={health} typeKey={route.arg} onOpenType={openType} onOpenPackage={(id) => openPkg(id)}
        onGo={(w, arg) => (arg ? route.go(w, arg) : route.go(w))} sourceUrl={site.sourceUrl} intro={false} height="100%" />
    </div>
  );
  else if (ws === "packages") body = route.arg ? (
    <div className="v9-ws v9-ws-pkg">
      <PackagePage site={site} id={route.arg} onOpenType={openType} onOpenPackage={(id) => openPkg(id)} onClose={() => route.go("packages")} />
    </div>
  ) : (
    <div className="v9-ws v9-ws-packages">
      <WsHead title="Packages" sub={<>The layer tree (pyproject deps) or the type pipeline (robot_msgs hidden as the glue), each package coloured by its worst check at <b>{site.version?.label}</b>. Click a package to trace its edges, then <b>open ↗</b> for its checks, versions and type API.</>} />
      <PackageMap graph={graph} health={health} options={pmOpts} onOptions={onPm} onOpenPackage={(id) => openPkg(id)} onOpenType={openType} maxHeight={760} />
      <PackageQueue site={site} onOpenPackage={(id) => openPkg(id)} />
    </div>
  );
  else if (ws === "directory") body = (
    <div className="v9-ws"><WsHead title="Directory" sub="Every package by layer and every agent: GitHub, Site where declared, PyPI and README one click out; the dot is its worst check." />
      <Directory graph={graph} health={health} onOpenPackage={(id) => openPkg(id)} onOpenAgent={openAgent} title="Packages and agents" /></div>
  );
  else if (ws === "agents") body = (
    <div className="v9-ws"><WsHead title="Agents" sub="Agents built on robot-sdk: their KPI, their health and what they build on." />
      <AgentsPanel graph={graph} health={health} onOpenPackage={(id) => openPkg(id)} /></div>
  );
  else if (ws === "run") body = (
    <div className="v9-ws"><WsHead title="Run" sub="The real pick-and-place: each stage is one package; what passes between them is a robot_msgs type." />
      <RunPanel pick={site.pick} graph={graph} health={health} onOpenType={openType} onOpenPackage={(id) => openPkg(id)} /></div>
  );
  else body = (
    <div className="v9-ws v9-ws-skill"><WsHead title="For coding agents" sub="The skill that teaches a coding agent to assemble robot-sdk packages instead of rewriting them." />
      <SkillPanel /></div>
  );

  return (
    <div className={"v9" + (folded ? " v9-is-folded" : "") + (dragging ? " v9-dragging" : "")} style={{ "--side-w": sideW + "px" }}>
      <Sidebar site={site} route={route} counts={counts} folded={folded && !drawer} onFold={() => setFolded((f) => !f)} last={last} onOpenType={openType}
        drawer={drawer} onCloseDrawer={() => setDrawer(false)} />
      <div className="v9-drag" ref={dragRef} onPointerDown={onDragStart} onDoubleClick={() => setFolded((f) => !f)} title="Drag to resize · double-click to fold" role="separator" aria-orientation="vertical" data-testid="side-drag" />
      {drawer && <div className="v9-scrim" onClick={() => setDrawer(false)} />}
      <div className={"v9-main" + (ws === "types" ? " v9-fill" : "")}>
        <header className="v9-top" data-testid="topbar">
          <button className="v9-iconbtn v9-menubtn" onClick={() => setDrawer(true)} aria-label="Open the sidebar" data-testid="menu"><ICONS.menu /></button>
          <a className="v9-top-brand" href={route.href("health")}>robot-sdk</a>
          <nav className="v9-crumb" aria-label="Breadcrumb">
            <span className="v9-crumb-root">robot-sdk</span>
            {crumbs.map((c, i) => <span key={i} className="v9-crumb-i"><span className="v9-crumb-sep">/</span>{i === crumbs.length - 1 ? <b>{c}</b> : <a href={route.href(ws)}>{c}</a>}</span>)}
          </nav>
          <span className="k-grow" />
          <TopRight site={site} />
        </header>
        <nav className="v9-strip" aria-label="Workspaces">
          {WS.map((w) => <a key={w.id} href={w.id === "types" && last.types ? route.href("types", last.types) : w.id === "packages" && last.packages ? route.href("packages", last.packages) : route.href(w.id)}
            className={"v9-strip-a" + (ws === w.id ? " on" : "")} data-ws-strip={w.id}>{w.id === "skill" ? "Coding agents" : w.label}</a>)}
        </nav>
        <SummaryBar site={site} route={route} />
        <VersionBanner site={site} className="v9-vbanner" onOpenPackage={(id) => openPkg(id)} onOpenType={openType} />
        {ws === "health" && <div className="v9-phone-pitch"><p>{PITCH}</p><Install /></div>}
        {body}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
