// V6 "Repo": robot-sdk as the GitHub repository page Zach already lives in (Primer look). The workspaces are the repo
// tabs (Types · Packages · Directory · Health · Agents · Run · For coding agents, each with its counter), the home is
// the Types workspace with GitHub's right column (About · Releases · Health), and the version picker IS GitHub's
// "Switch branches/tags" button, top right beside the GitHub mark. GitHub's keys work: t = go to type (GitHub's "go to
// file"), w = switch versions (GitHub's branch picker), g + letter = a tab.
// WHY (Zach, 2026-11-24): "like github kinda skip to like a branch … top right corner … next to like a github icon";
// "we need to switch to more of a site layout where we have a couple different workspaces you can shift to".
// Every number comes from site/data (graph.json, health.json, versions.json, pick_and_place.json) via the kit.
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useSite, useRoute, buildHash, navigate, TopRight, VersionBanner, HealthPill, HealthBoard, Directory, PackageMap, pmOptions, switchMode,
  store, useStoredState, TypeWorkspace, TypeSearch, RunPanel, AgentsPanel, SkillPanel, CopyCode, REPO_URL, PITCH, healthSummary, fmtShortDate,
  resolveType, mostUsedType,
} from "@kit";
import { Icon, StatusIcon } from "./icons.jsx";
import { ChecksBox } from "./checks.jsx";
import { FileTable } from "./filetable.jsx";
import { AboutBox, ReleasesBox, HealthSide, PackageSide } from "./sidebar.jsx";
import "./v6.css";

const WS_IDS = ["types", "packages", "directory", "health", "agents", "run", "skill"];
const WS_LABEL = { types: "Types", packages: "Packages", directory: "Directory", health: "Health", agents: "Agents", run: "Run", skill: "For coding agents" };
const WS_ICON = { types: "code", packages: "package", directory: "folder", health: "pulse", agents: "agent", run: "play", skill: "sparkle" };
const WS_KEY = { t: "types", p: "packages", d: "directory", h: "health", a: "agents", r: "run", s: "skill" };

// WHY remember each workspace's last args/params: a tab is one click back to where you were in it (the type you had
// open, the package you picked, the pipeline), with the version carried over (criterion fr4: "switching keeps the
// selected type/package and version"). Per page view only; the URL stays the source of truth.
const LAST = {};
function remember(route) {
  if (!WS_IDS.includes(route.ws)) return;
  const { v, ...params } = route.params;
  LAST[route.ws] = { args: route.args, params };
}
function tabHref(ws, v) {
  const l = LAST[ws] || { args: [], params: {} };
  return buildHash(ws, l.args, { ...l.params, v });
}
function go(ws, args = [], extra = {}) {
  const cur = new URLSearchParams((location.hash.split("?")[1]) || "");
  const keep = ws === "packages" && LAST.packages?.params?.mode ? { mode: LAST.packages.params.mode } : {};
  location.hash = buildHash(ws, args, { ...keep, ...extra, v: cur.get("v") || undefined });
}

// ---- header ----------------------------------------------------------------------------------------------------------
function Header({ site, route, counts }) {
  const v = route.params.v;
  const tabs = useRef(null);
  // WHY: on a phone the tab row scrolls sideways; keep the open workspace's tab in view.
  useEffect(() => { tabs.current?.querySelector(".gh-tab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [route.ws]);
  const s = healthSummary(site.health);
  return (
    <header className="gh-head">
      <div className="gh-bar">
        <div className="gh-title">
          <Icon name="repo" className="gh-title-ic" />
          <a className="gh-owner" href="https://github.com/zacharyyamaoka" target="_blank" rel="noreferrer">zacharyyamaoka</a>
          <span className="gh-sep">/</span>
          <a className="gh-repo" href={buildHash("types", [], { v })} data-testid="v6-home">robot-sdk</a>
          <span className="gh-public">Public</span>
        </div>
        <span className="gh-grow" />
        <TopRight site={site} className="gh-topright">
          {site.health
            ? <HealthPill health={site.health} onClick={() => go("health")} className="gh-hide-narrow" />
            : <HealthPill summary={null} note={site.healthNote} className="gh-hide-narrow" />}
          {/* WHY on a phone: the pill does not fit and the Health tab scrolls off; the worst state + its count stays on screen. */}
          <a className="gh-hstatus gh-show-narrow" href={tabHref("health", v)} title={counts.healthTitle} data-testid="v6-hstatus">
            <StatusIcon state={!s ? "unknown" : s.fail ? "fail" : s.warn ? "warn" : "pass"} />{s ? (s.fail || s.warn || s.pass) : "–"}</a>
        </TopRight>
      </div>
      <p className="gh-desc" title={PITCH}>{PITCH}</p>
      <nav className="gh-tabs" aria-label="Workspaces" data-testid="v6-tabs" ref={tabs}>
        {WS_IDS.map((ws) => {
          const on = route.ws === ws, c = counts[ws];
          return (
            <a key={ws} data-ws={ws} href={tabHref(ws, v)} className={"gh-tab" + (on ? " on" : "")} aria-current={on ? "page" : undefined}
              title={`${WS_LABEL[ws]} (g ${Object.keys(WS_KEY).find((k) => WS_KEY[k] === ws)})`}>
              <span className="gh-tab-in"><Icon name={WS_ICON[ws]} className="gh-tab-ic" /><span className="gh-tab-label">{WS_LABEL[ws]}</span>
                {c != null && c !== "" && <span className={"gh-counter" + (ws === "health" ? (counts.healthFail ? " gh-counter-danger" : counts.healthWarn ? " gh-counter-warn" : "") : "")} data-testid={"v6-count-" + ws}
                  title={ws === "health" ? counts.healthTitle : undefined}>{c}</span>}</span>
            </a>
          );
        })}
      </nav>
    </header>
  );
}

// ---- small popovers (Go to type, Install) ------------------------------------------------------------------------------
function usePopover() {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return [open, setOpen, box];
}

// GitHub's "Go to file" (key t), as "Go to type": the kit's TypeSearch, so "JointTrajectory ->" lists what takes one.
function GoToType({ site, openRef, onOpenType, onOpenPackage }) {
  const [open, setOpen, box] = usePopover();
  const [q, setQ] = useState("");
  useEffect(() => { openRef.current = () => setOpen(true); return () => { openRef.current = null; }; }, []);
  const pick = (k) => { setOpen(false); setQ(""); onOpenType(k); };
  return (
    <div className="gh-pop-anchor gh-goto" ref={box}>
      <button className="gh-input-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="v6-goto" title="Go to type (t)">
        <Icon name="search" /><span>Go to type</span><kbd>t</kbd>
      </button>
      {open && <div className="gh-pop gh-pop-right gh-goto-pop" data-testid="v6-goto-pop">
        <TypeSearch graph={site.graph} health={site.health} sourceUrl={site.sourceUrl} value={q} onChange={setQ} autoFocus
          onOpenType={pick} onOpenPackage={(id) => { setOpen(false); onOpenPackage(id); }} placeholder="Go to type — or “JointTrajectory ->”" />
      </div>}
    </div>
  );
}

// GitHub's green "<> Code" button: here, how to get robot-sdk (pip, git, the skill).
function InstallButton() {
  const [open, setOpen, box] = usePopover();
  return (
    <div className="gh-pop-anchor" ref={box}>
      <button className="gh-btn gh-btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="v6-install">
        <Icon name="code" /><span>Install</span><Icon name="triangleDown" />
      </button>
      {open && <div className="gh-pop gh-pop-right gh-install-pop" data-testid="v6-install-pop">
        <div className="gh-pop-h"><Icon name="terminal" /> Install</div>
        <div className="gh-pop-sec"><div className="gh-pop-label">pip</div><CopyCode text="pip install robot-sdk" /></div>
        <div className="gh-pop-sec"><div className="gh-pop-label">Clone</div><CopyCode text={REPO_URL + ".git"} /></div>
        <a className="gh-pop-row" href={tabHref("skill", new URLSearchParams(location.hash.split("?")[1] || "").get("v") || undefined)} onClick={() => setOpen(false)}><Icon name="sparkle" />Hand it to a coding agent (the skill)</a>
        <a className="gh-pop-row" href={REPO_URL} target="_blank" rel="noreferrer"><Icon name="repo" />Open zacharyyamaoka/robot_sdk on GitHub</a>
      </div>}
    </div>
  );
}

// The row above GitHub's file table: branch/tag counts, Go to file, Code.
function FileNav({ site, openGoto, onOpenType, onOpenPackage }) {
  const ch = site.versions.filter((v) => v.kind !== "snapshot").length, sn = site.versions.filter((v) => v.kind === "snapshot").length;
  const openPicker = () => document.querySelector("[data-testid='version-picker']")?.click();
  return (
    <div className="gh-filenav">
      <button className="gh-plain" onClick={openPicker} title="Switch versions (w)"><Icon name="pulse" /><b>{ch}</b> Channels</button>
      <button className="gh-plain" onClick={openPicker} title="Switch versions (w)"><Icon name="tag" /><b>{sn}</b> Snapshots</button>
      <span className="gh-grow" />
      <GoToType site={site} openRef={openGoto} onOpenType={onOpenType} onOpenPackage={onOpenPackage} />
      <InstallButton />
    </div>
  );
}

// The "latest commit" bar on top of GitHub's file table: the version on screen, its status, when it was generated.
function CommitBar({ site, railOpen, onRail }) {
  const s = healthSummary(site.health);
  const st = !s ? "unknown" : s.fail ? "fail" : s.warn ? "warn" : "pass";
  const ver = site.version || {};
  const openPicker = () => document.querySelector("[data-testid='version-picker']")?.click();
  return (
    <div className="gh-commitbar" data-testid="v6-commitbar">
      {/* WHY a toggle (GitHub's "Collapse file tree"): beside GitHub's right column the switchboard gets ~500 px at 1440 and
          its nodes drop to ~7 px names; the type list folds away there (open by default on wide screens, remembered). */}
      <button className={"gh-iconbtn gh-railbtn" + (railOpen ? " on" : "")} onClick={onRail} aria-pressed={railOpen} data-testid="v6-rail-toggle"
        title={railOpen ? "Hide the type list" : `Show the type list (${site.graph.types.length} types)`}><Icon name="sidebar" /><span>{site.graph.types.length} types</span></button>
      <a className="gh-commit-st" href={tabHref("health", site.isLive ? undefined : site.versionId)} title={s ? `${s.fail || 0} failing · ${s.warn || 0} warnings · ${s.pass || 0} passing` : site.healthNote}>
        <StatusIcon state={st} />{s ? <span>{s.fail ? `${s.fail} failing` : s.warn ? `${s.warn} warnings` : "passing"}</span> : <span>no checks</span>}
      </a>
      <span className="gh-commit-msg"><b>{ver.label || "Live"}</b> <span className="gh-muted">{ver.summary || ""}</span></span>
      <span className="gh-grow" />
      <span className="gh-commit-meta gh-muted"><code>graph.json</code> · {fmtShortDate(site.graph.generated)}</span>
      <button className="gh-plain gh-commit-hist" onClick={openPicker} title="Switch versions (w)"><Icon name="history" /><b>{site.versions.length}</b> versions</button>
    </div>
  );
}

// ---- workspaces --------------------------------------------------------------------------------------------------------
function useMedia(q) {
  const mq = typeof matchMedia === "function" ? matchMedia(q) : null;
  const [m, setM] = useState(() => !!mq?.matches);
  useEffect(() => { if (!mq) return; const on = () => setM(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [q]);
  return m;
}

function TypesHome({ site, route, nav, openGoto }) {
  const typeKey = route.arg;
  const wide = useMedia("(min-width: 1600px)");
  const [rail, setRail] = useStoredState("rsdk-v6-rail", "auto", ["auto", "open", "closed"]);
  const railOpen = rail === "auto" ? wide : rail === "open";
  return (
    <div className="gh-layout" data-testid="v6-types">
      <div className="gh-maincol">
        <FileNav site={site} openGoto={openGoto} onOpenType={nav.type} onOpenPackage={nav.pkg} />
        <div className={"gh-box gh-types-box" + (railOpen ? "" : " gh-rail-closed")}>
          <CommitBar site={site} railOpen={railOpen} onRail={() => setRail(railOpen ? "closed" : "open")} />
          <TypeWorkspace key={site.versionId} graph={site.graph} health={site.health} typeKey={typeKey} onOpenType={nav.type} onOpenPackage={nav.pkg}
            onGo={(ws, arg) => go(ws === "example" ? "run" : ws, arg ? [arg] : [])} sourceUrl={site.sourceUrl} intro={false}
            height="max(600px, calc(100vh - 262px))" />
        </div>
      </div>
      <aside className="gh-side" aria-label="About robot-sdk">
        <AboutBox graph={site.graph} pick={site.pick} href={nav.href} />
        <ReleasesBox site={site} />
        <HealthSide site={site} href={nav.href} healthHref={nav.healthHref} />
      </aside>
    </div>
  );
}

// PackageMap options: the mode lives in the URL (?mode=pipeline, deep-linkable, Back works); the rest is remembered.
const PM_KEY = "rsdk-v6-pm";
function usePmOptions(route) {
  const [saved, setSaved] = useState(() => { try { return pmOptions(JSON.parse(store.get(PM_KEY) || "{}")); } catch { return pmOptions(); } });
  const mode = route.params.mode === "pipeline" ? "pipeline" : "tree";
  const opts = saved.mode === mode ? saved : pmOptions({ ...saved, ...switchMode(saved, mode) });
  const onOptions = (o) => {
    const n = pmOptions(o);
    setSaved(n);
    store.set(PM_KEY, JSON.stringify(n));
    if (n.mode !== mode) route.setParams({ mode: n.mode === "pipeline" ? "pipeline" : null });
  };
  return [opts, onOptions];
}

// WHY a sync effect: the kit's PackageMap keeps its node selection inside (no `selected` prop), so a deep link
// (#/packages/traj_compare), Back, or a click from another workspace would leave the map un-highlighted while the
// sidebar shows the package. Click the node (or the lit one, to clear) until the map agrees with the URL.
function useMapSelection(id, deps) {
  useEffect(() => {
    let tries = 0, t;
    const tick = () => {
      const canvas = document.querySelector("[data-testid='pm-canvas']");
      if (!canvas || canvas.querySelector(".k-pm-wait")) return retry();
      const want = id ? canvas.querySelector(`[data-testid='pm-node-${CSS.escape(id)}'], [data-testid='pm-agent-${CSS.escape(id)}']`) : null;
      const hot = canvas.querySelector(".k-pm-node.k-hot");
      if (id && !want) return retry();
      if (want === hot) return;
      (want || hot)?.closest(".react-flow__node")?.click();
    };
    const retry = () => { if (++tries < 30) t = setTimeout(tick, 120); };
    t = setTimeout(tick, 60);
    return () => clearTimeout(t);
  }, [id, ...deps]);
}

// WHY the map runs full width until a package is picked: beside a 296 px column the tree fits at zoom 0.60 (names
// ~7.5 px); full width it is 0.77. Picking a package opens GitHub's right column for it (what it is, its checks, its types).
function PackagesWs({ site, route, nav }) {
  const [opts, onOptions] = usePmOptions(route);
  const sel = route.arg || null;
  useMapSelection(sel, [opts.mode, opts.groupByLayer, opts.deps, opts.agents, opts.imports, site.graph, !!sel]);
  const onSelect = (id) => { if ((id || null) !== sel) navigate({ ws: "packages", args: id ? [id] : [], keep: "all" }); };
  const close = () => navigate({ ws: "packages", args: [], keep: "all" });
  // WHY a fixed height for a small version: the kit fits the map to the width with no zoom cap, so Latest release's
  // four packages came up at 2x (KIT ISSUE); a fixed height makes fitView fit the height too.
  const small = site.graph.packages.length < 8;
  const smallH = 40 + 110 * new Set(site.graph.packages.map((p) => p.layer)).size;
  return (
    <div className={"gh-layout gh-layout-pkg" + (sel ? " has-sel" : " no-sel")} data-testid="v6-packages">
      <div className="gh-maincol">
        {/* WHY key: after a version switch React Flow kept the nodes both versions share at visibility:hidden (never
            re-measured: same id, same size), so Latest release drew empty bands (KIT ISSUE); a fresh map per version fixes it. */}
        <PackageMap key={site.versionId} graph={site.graph} health={site.health} options={opts} onOptions={onOptions} onSelect={onSelect} onOpenType={nav.type}
          height={small ? smallH : "auto"} maxHeight={760}
          toolbarExtra={!sel && <span className="gh-pm-hint gh-muted gh-small">Click a package for its checks and types</span>} />
      </div>
      {sel && <aside className="gh-side" aria-label={"About " + sel}>
        <PackageSide site={site} id={sel} onOpenType={nav.type} onOpenPackage={nav.pkg} healthHref={nav.healthHref} onBackToLive={() => site.setVersion("live")} onClose={close} />
      </aside>}
    </div>
  );
}

function DirectoryWs({ site, route, nav }) {
  const [stored, setStored] = useStoredState("rsdk-v6-dir", "compact", ["cards", "compact"]);
  const view = route.params.view === "cards" || route.params.view === "compact" ? route.params.view : stored;
  const setView = (m) => { setStored(m); route.setParams({ view: m }); };
  return (
    <div className="gh-dir" data-testid="v6-directory">
      {view === "cards"
        ? <div className="gh-box gh-dir-cards"><Directory graph={site.graph} health={site.health} mode="cards" onMode={setView} onOpenPackage={nav.pkg} onOpenAgent={nav.agent} /></div>
        : <FileTable graph={site.graph} health={site.health} mode="compact" onMode={setView} onOpenPackage={nav.pkg} onOpenAgent={nav.agent} onOpenType={nav.type} healthHref={nav.healthHref} />}
    </div>
  );
}

function HealthWs({ site, route, nav }) {
  const open = route.arg;
  return (
    <div className="gh-health" data-testid="v6-health">
      <ChecksBox health={site.health} graph={site.graph} note={site.healthNote} openId={open}
        onToggle={(id) => navigate({ ws: "health", args: id ? [id] : [], replace: true })}
        onOpenMember={(id, kind) => (kind === "agent" ? nav.agent(id) : nav.pkg(id))} onBackToLive={() => site.setVersion("live")} />
      {site.health && <div className="gh-box gh-hb-box">
        <HealthBoard health={site.health} graph={site.graph} note={site.healthNote} onOpenPackage={nav.pkg} onOpenAgent={nav.agent}
          onBackToLive={() => site.setVersion("live")} title="Every check, by member" />
      </div>}
    </div>
  );
}

function BoxWs({ icon, title, sub, children, testid }) {
  return (
    <section className="gh-box gh-pagebox" data-testid={testid}>
      <div className="gh-box-head"><Icon name={icon} /><b>{title}</b>{sub && <span className="gh-muted gh-small">{sub}</span>}</div>
      <div className="gh-box-body">{children}</div>
    </section>
  );
}

function AgentsWs({ site, route, nav }) {
  useEffect(() => {
    if (!route.arg) return;
    const t = setTimeout(() => document.querySelector(`[data-testid='agent-${CSS.escape(route.arg)}']`)?.scrollIntoView({ block: "start" }), 80);
    return () => clearTimeout(t);
  }, [route.arg]);
  return <BoxWs icon="agent" title="Agents" sub={`${(site.graph.agents || []).length} in graph.json · each declares itself in its own robot-sdk.toml`} testid="v6-agents">
    <AgentsPanel graph={site.graph} health={site.health} onOpenPackage={nav.pkg} />
  </BoxWs>;
}

// ---- the app -----------------------------------------------------------------------------------------------------------
function useKeys(route, openGoto) {
  useEffect(() => {
    let g = 0;
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const k = e.key;
      if (g && Date.now() - g < 1500) { g = 0; if (WS_KEY[k]) { e.preventDefault(); location.hash = tabHref(WS_KEY[k], route.params.v); } return; }
      if (k === "g") { g = Date.now(); return; }
      if (k === "t") { e.preventDefault(); if (route.ws !== "types") location.hash = tabHref("types", route.params.v); setTimeout(() => openGoto.current?.(), 80); }
      if (k === "w") { e.preventDefault(); document.querySelector("[data-testid='version-picker']")?.click(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [route.ws, route.params.v]);
}

function App() {
  const site = useSite();
  const route = useRoute("types");
  const openGoto = useRef(null);
  remember(route);
  useKeys(route, openGoto);
  const ws = WS_IDS.includes(route.ws) ? route.ws : "types";
  const v = route.params.v;

  const nav = useMemo(() => ({
    type: (k) => go("types", [k]),
    pkg: (id) => go("packages", [id]),
    agent: (id) => go("agents", [id]),
    href: (w) => tabHref(w, v),
    healthHref: (id) => buildHash("health", [id], { v }),
  }), [v]);

  useEffect(() => {
    if (!site.ready) return;
    const t = ws === "types" ? (resolveType(site.graph, route.arg) || mostUsedType(site.graph))?.name : ws === "packages" ? route.arg : null;
    document.title = `robot-sdk · ${WS_LABEL[ws]}${t ? " · " + t : ""}${site.isLive ? "" : " @ " + (site.version?.label || "")}`;
  }, [site.ready, ws, route.arg, site.versionId]);

  if (site.error) return <div className="gh-fatal"><h1>Could not load robot-sdk's data</h1><p>{String(site.error.message || site.error)}</p></div>;
  if (!site.ready) return <div className="gh-loading" aria-busy="true"><span className="k-spin" /> Loading graph.json, health.json, versions.json…</div>;

  const { graph, health } = site;
  const s = healthSummary(health);
  const counts = {
    types: graph.types.length, packages: graph.packages.length, directory: graph.packages.length + (graph.agents || []).length,
    health: s ? (s.fail || s.warn || s.pass) : "–", healthFail: !!s?.fail, healthWarn: !s?.fail && !!s?.warn,
    healthTitle: s ? `${s.fail || 0} failing · ${s.warn || 0} warnings · ${s.pass || 0} passing` : site.healthNote,
    agents: (graph.agents || []).length, run: site.pick?.stages?.length ?? null, skill: null,
  };

  return (
    <div className="gh">
      <Header site={site} route={{ ...route, ws }} counts={counts} />
      <main className="gh-main">
        <VersionBanner site={site} className="gh-vbanner" onOpenPackage={nav.pkg} onOpenType={nav.type} />
        {ws === "types" && <TypesHome site={site} route={route} nav={nav} openGoto={openGoto} />}
        {ws === "packages" && <PackagesWs site={site} route={route} nav={nav} />}
        {ws === "directory" && <DirectoryWs site={site} route={route} nav={nav} />}
        {ws === "health" && <HealthWs site={site} route={route} nav={nav} />}
        {ws === "agents" && <AgentsWs site={site} route={route} nav={nav} />}
        {ws === "run" && <BoxWs icon="play" title="pick_and_place.json" sub="the real run, stage by stage" testid="v6-run">
          <RunPanel pick={site.pick} graph={graph} health={health} onOpenType={nav.type} onOpenPackage={nav.pkg} /></BoxWs>}
        {ws === "skill" && <BoxWs icon="file" title="skill/SKILL.md" sub="for Claude Code and Codex" testid="v6-skill"><SkillPanel /></BoxWs>}
      </main>
      <footer className="gh-foot">
        <span>robot-sdk</span>
        <span>graph.json {fmtShortDate(graph.generated)} · health.json {health ? fmtShortDate(health.generated) : "not recorded"} · {site.versions.length} versions · read {site.source?.graph || ""}</span>
        <span className="gh-hide-narrow">Keys: <kbd>t</kbd> go to type · <kbd>w</kbd> switch version · <kbd>g</kbd> then <kbd>t</kbd>/<kbd>p</kbd>/<kbd>d</kbd>/<kbd>h</kbd>/<kbd>a</kbd>/<kbd>r</kbd>/<kbd>s</kbd> a tab</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">zacharyyamaoka/robot_sdk</a>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
