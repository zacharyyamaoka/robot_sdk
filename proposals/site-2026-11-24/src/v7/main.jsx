// V7 "Workbench": robot-sdk as a VS Code window. One selection, every lens: open JointTrajectory or robot_controllers
// once and the Explorer, the package map, the health board, the directory and the Problems list all show it; health is
// the Problems panel, one keystroke away (Ctrl+J), with its counts on the status bar of every screen.
// Reference app (zero relearning, Zach specs by pointing at one): VS Code — activity bar, Explorer side bar, editor tabs
// with preview tabs and split, Problems panel, status bar, Ctrl+P / Ctrl+Shift+P quick input. Anything VS Code has that
// robot-sdk cannot back with real data (menus, terminal, extensions, settings) is left out rather than mocked.
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useSite, useRoute, navigate, buildHash, TopRight, VersionBanner, resolveType, typeKey, mostUsedType, fmtShortDate, store,
  Install, PITCH, LAYER_LABEL, diffText,
} from "@kit";
import { Icon } from "./icons.jsx";
import { Explorer } from "./explorer.jsx";
import { Panel } from "./panel.jsx";
import { QuickOpen } from "./quick.jsx";
import { resolveSel, lensOf, lensCss, problemsOf, problemCounts } from "./lens.js";
import { TypeEditor, MapEditor, PackageEditor, CompareEditor, Page, EmptyEditor, LensBar, Directory, HealthBoard, AgentsPanel, RunPanel, SkillPanel } from "./editors.jsx";
import "./v7.css";

// ---- layout state, remembered per viewer (VS Code restores its window the same way) ----------------------------------
const LKEY = "rsdk-v7-layout.v1";
const DEFAULT_UI = {
  groups: null, focus: 0, ratio: 0.5, sbW: 300, sbOpen: true, panelH: 240, panelOpen: false, panelTab: "problems", panelMax: false,
  welcome: true, expanded: {}, sections: {}, lastSel: null, lastType: null, filterSel: false,
};
function loadUi() {
  try { const s = JSON.parse(store.get(LKEY) || "null"); return s && typeof s === "object" ? { ...DEFAULT_UI, ...s } : { ...DEFAULT_UI }; }
  catch { return { ...DEFAULT_UI }; }
}
const WS_KEYS = ["packages", "directory", "health", "agents", "run", "skill", "compare", "home"];
const isSubject = (k) => !!k && (k.startsWith("types/") || k.startsWith("packages/"));
// Types and package editors open as VS Code "preview" tabs (italic; the next single-click replaces them) until pinned
// by a double-click or by working from inside them; workspaces open pinned.
const previewable = (k) => isSubject(k);

function normType(graph, arg) { const t = resolveType(graph, arg); return t ? typeKey(graph, t) : arg; }
function routeKey(route, graph) {
  if (!route.hash || route.hash === "#/" || route.hash === "#") return null;
  const { ws, arg } = route;
  if (ws === "types") return arg ? "types/" + normType(graph, arg) : "types";
  if (ws === "packages") return arg ? "packages/" + arg : "packages";
  if (WS_KEYS.includes(ws)) return ws;
  return "unknown";
}
const TAB_PARAMS = ["via", "sym"];
const pick = (params) => Object.fromEntries(TAB_PARAMS.filter((k) => params?.[k]).map((k) => [k, params[k]]));

function cloneGroups(groups) { return (groups && groups.length ? groups : [{ tabs: [], active: null }]).map((g) => ({ ...g, tabs: g.tabs.map((t) => ({ ...t })), mru: [...(g.mru || [])] })); }

// Open (or activate) `key` in the focused group. intent: { pin, pinSource, group }.
function openKey(u, key, intent = {}, params = {}) {
  const groups = cloneGroups(u.groups);
  let f = Math.min(intent.group ?? u.focus ?? 0, groups.length - 1);
  let g = groups[f];
  let i = g.tabs.findIndex((t) => t.key === key);
  if (i < 0 && intent.group == null) {
    const other = groups.findIndex((gg, gi) => gi !== f && gg.tabs.some((t) => t.key === key));
    if (other >= 0) { f = other; g = groups[f]; i = g.tabs.findIndex((t) => t.key === key); }
  }
  if (intent.pinSource) { const a = g.tabs.findIndex((t) => t.key === g.active); if (a >= 0) g.tabs[a].preview = false; }
  if (i >= 0) {
    if (intent.pin) g.tabs[i].preview = false;
    if (Object.keys(params).length || g.tabs[i].key.startsWith("packages/")) g.tabs[i].params = params;
    g.active = key;
  } else {
    const tab = { key, preview: !intent.pin && previewable(key), params };
    const pi = g.tabs.findIndex((t) => t.preview);
    if (tab.preview && pi >= 0) g.tabs[pi] = tab;
    else { const a = g.tabs.findIndex((t) => t.key === g.active); g.tabs.splice(a + 1, 0, tab); }
    g.active = key;
  }
  // most recently used first: closing the active tab returns to the one used before it (VS Code's default)
  g.mru = [key, ...(g.mru || []).filter((k) => k !== key)].slice(0, 30);
  const lastType = key.startsWith("types/") ? key.slice(6) : u.lastType;
  return { ...u, groups, focus: f, lastType };
}

function useMedia(q) {
  const [m, setM] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [q]);
  return m;
}
function useSize(ref) {
  const [s, setS] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setS((o) => { const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height); return Math.abs(o.w - w) > 2 || Math.abs(o.h - h) > 2 ? { w, h } : o; }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return s;
}
// A VS Code sash: drag a panel boundary; double-click resets it.
function Sash({ dir, onDrag, onEnd, onReset, className = "", testid }) {
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    document.body.classList.add("v7-dragging", dir === "v" ? "v7-drag-ew" : "v7-drag-ns");
    const move = (ev) => onDrag(ev.clientX - x0, ev.clientY - y0, ev);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.classList.remove("v7-dragging", "v7-drag-ew", "v7-drag-ns"); onEnd?.(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  return <div className={`v7-sash v7-sash-${dir} ${className}`} onPointerDown={down} onDoubleClick={onReset} role="separator" aria-orientation={dir === "v" ? "vertical" : "horizontal"} data-testid={testid} />;
}

const ACTIVITY = [
  { ws: "types", icon: "types", label: "Types", tip: "Types — what takes or returns each robot_msgs type" },
  { ws: "packages", icon: "packages", label: "Packages", tip: "Packages — the layer tree and the type pipeline" },
  { ws: "directory", icon: "library", label: "Directory", tip: "Directory — every package, one click to GitHub, PyPI, README" },
  { ws: "health", icon: "pulse", label: "Health", tip: "Health — what is passing or failing" },
  { ws: "agents", icon: "robot", label: "Agents", tip: "Agents — what builds on the packages" },
  { ws: "run", icon: "play", label: "Pick and place", tip: "Run — the real pick-and-place, stage by stage" },
  { ws: "skill", icon: "sparkle", label: "For coding agents", tip: "For coding agents — the skill and pip install" },
];
const WS_META = {
  packages: { icon: "packages", label: "Packages", desc: "tree · pipeline" }, directory: { icon: "library", label: "Directory" },
  health: { icon: "pulse", label: "Health" }, agents: { icon: "robot", label: "Agents" }, run: { icon: "play", label: "Pick and place" },
  skill: { icon: "sparkle", label: "For coding agents" },
};
const wsOfKey = (k) => (!k ? null : k.startsWith("types/") ? "types" : k.startsWith("packages") ? "packages" : k);

function App() {
  const site = useSite();
  const route = useRoute("types");
  const narrow = useMedia("(max-width: 760px)");
  const [ui, setUiState] = useState(loadUi);
  const uiRef = useRef(ui); uiRef.current = ui;
  const setUi = useCallback((patch) => setUiState((u) => {
    const n = typeof patch === "function" ? patch(u) : { ...u, ...patch };
    store.set(LKEY, JSON.stringify(n));
    return n;
  }), []);
  const [quick, setQuick] = useState(null);
  const [phoneSb, setPhoneSb] = useState(false);
  const [phonePanel, setPhonePanel] = useState(false);
  const booted = useRef(false);
  const graph = site.graph;

  // ---- route ⇄ editors ----
  const rk = site.ready ? routeKey(route, graph) : null;
  const selKey = isSubject(rk) ? rk.slice(rk.indexOf("/") + 1) : rk === "packages" || WS_KEYS.includes(rk) || rk === "home" ? (route.params.sel ?? ui.lastSel) : ui.lastSel;
  const sel = useMemo(() => (site.ready ? resolveSel(graph, selKey, site.live.graph) : null), [site.ready, graph, selKey, site.live]);
  const lens = useMemo(() => lensOf(graph, sel), [graph, sel]);
  const css = useMemo(() => lensCss(sel, lens), [sel, lens]);
  const selRef = useRef(null); selRef.current = sel?.missing ? sel.key : sel?.key || null;
  useEffect(() => { if (sel && !sel.missing && sel.key !== ui.lastSel) setUi({ lastSel: sel.key }); }, [sel?.key]);

  const navTo = useCallback((key, { replace = false, sel: s, params = {}, intent = {} } = {}) => {
    if (!key) return;
    const [ws, ...rest] = key.split("/");
    const p = { ...params };
    if (!isSubject(key) && key !== "home") { const v = s !== undefined ? s : selRef.current; if (v) p.sel = v; }
    if (key !== "home") setUi((u) => openKey(u, key, intent, pick(p)));
    navigate({ ws, args: rest.length ? [rest.join("/")] : [], params: p, replace });
  }, [setUi]);

  // boot: no hash -> the last session's editor (or the most-used type), explorer open (V7's home screen axis)
  useEffect(() => {
    if (!site.ready || booted.current) return;
    booted.current = true;
    const u = uiRef.current;
    const groups = cloneGroups(u.groups).filter((g) => g.tabs.length);
    const restored = groups.length ? groups : [{ tabs: [], active: null }];
    setUi({ groups: restored, focus: Math.min(u.focus || 0, restored.length - 1) });
    if (!rk) {
      const g = restored[Math.min(u.focus || 0, restored.length - 1)];
      const target = g?.active || "types/" + typeKey(graph, mostUsedType(graph));
      const tab = g?.tabs.find((t) => t.key === target);
      navTo(target, { replace: true, params: tab?.params || {}, intent: { pin: true } });
    }
  }, [site.ready]);

  // every hash change (clicks, deep links, Back/Forward) opens or activates its editor
  useEffect(() => {
    if (!site.ready || !booted.current || !rk) return;
    if (rk === "types") { navTo("types/" + (ui.lastType || (sel?.kind === "type" ? sel.key : typeKey(graph, mostUsedType(graph)))), { replace: true }); return; }
    if (rk === "unknown") { navTo("types/" + typeKey(graph, mostUsedType(graph)), { replace: true }); return; }
    if (rk === "home") { setUi((u) => { const groups = cloneGroups(u.groups); groups[Math.min(u.focus, groups.length - 1)].active = null; return { ...u, groups }; }); return; }
    setUi((u) => openKey(u, rk, {}, pick(route.params)));
  }, [route.hash, site.ready]);

  const groups = ui.groups && ui.groups.length ? ui.groups : [{ tabs: [], active: null }];
  const focus = Math.min(ui.focus || 0, groups.length - 1);
  const activeKey = groups[focus]?.active || null;

  // ---- actions ----
  const openType = useCallback((k, o = {}) => navTo("types/" + normType(site.graph, k), { intent: { pin: o.pin, pinSource: o.pinSource } }), [navTo, site.graph]);
  const openPackage = useCallback((id, o = {}) => navTo("packages/" + id, { intent: { pin: o.pin, pinSource: o.pinSource }, params: { ...(o.via ? { via: o.via } : {}), ...(o.sym ? { sym: o.sym } : {}) } }), [navTo]);
  const openAgent = useCallback((id) => navTo("agents", { sel: id }), [navTo]);
  // a type this version lacks (Latest release has 24 fewer) opens on Live, where it exists
  const openTypeLive = useCallback((k) => {
    const lg = site.live.graph, t = resolveType(lg, k), key = t ? typeKey(lg, t) : k;
    setUi((u) => openKey(u, "types/" + key, {}));
    navigate({ ws: "types", args: [key], keep: "none" });
  }, [site.live, setUi]);
  const setSel = useCallback((id) => { navigate({ params: { sel: id }, keep: "all", replace: true }); }, []);
  const clearSel = () => { setUi({ lastSel: null }); if (!isSubject(activeKey)) navigate({ params: { sel: null }, keep: "all", replace: true }); };
  const openSel = () => { if (!sel) return; if (sel.kind === "type") openType(sel.key); else if (sel.kind === "package") openPackage(sel.id); else openAgent(sel.id); };
  const typeTarget = () => ui.lastType || (sel?.kind === "type" && !sel.missing ? sel.key : typeKey(graph, mostUsedType(graph)));
  const activity = (ws) => {
    if (narrow) setPhoneSb(false);
    if (ws === "types") navTo("types/" + typeTarget());
    else navTo(ws);
  };
  const toggleSb = () => (narrow ? setPhoneSb((x) => !x) : setUi((u) => ({ ...u, sbOpen: !u.sbOpen })));
  const togglePanel = (tab) => {
    if (narrow) { setPhonePanel((x) => (tab && !x ? true : !x)); if (tab) setUi({ panelTab: tab }); return; }
    setUi((u) => ({ ...u, panelOpen: tab && u.panelTab !== tab ? true : !u.panelOpen, panelTab: tab || u.panelTab }));
  };
  const panelOpen = narrow ? phonePanel : ui.panelOpen;
  const sbOpen = narrow ? phoneSb : ui.sbOpen;

  const focusGroup = (gi) => {
    const u = uiRef.current;
    if (gi === focus || !u.groups?.[gi]) return;
    const g = u.groups[gi];
    setUi({ focus: gi });
    if (g.active) { const t = g.tabs.find((x) => x.key === g.active); navTo(g.active, { intent: { group: gi }, params: t?.params || {} }); }
  };
  const closeTab = (gi, key) => {
    const u = uiRef.current;
    const gs = cloneGroups(u.groups);
    const g = gs[gi]; if (!g) return;
    const idx = g.tabs.findIndex((t) => t.key === key); if (idx < 0) return;
    g.tabs.splice(idx, 1);
    g.mru = (g.mru || []).filter((k) => k !== key);
    if (g.active === key) g.active = g.mru.find((k) => g.tabs.some((t) => t.key === k)) || g.tabs[Math.min(idx, g.tabs.length - 1)]?.key || null;
    let f = u.focus;
    if (!g.tabs.length && gs.length > 1) { gs.splice(gi, 1); f = 0; } else if (gi === u.focus || !g.tabs.length) f = gi;
    f = Math.min(f, gs.length - 1);
    setUi({ groups: gs, focus: f });
    const nk = gs[f].active;
    if (nk) { const t = gs[f].tabs.find((x) => x.key === nk); navTo(nk, { replace: true, intent: { group: f }, params: t?.params || {} }); }
    else navigate({ ws: "home", replace: true });
  };
  const pinTab = (gi, key) => setUi((u) => { const gs = cloneGroups(u.groups); const t = gs[gi]?.tabs.find((x) => x.key === key); if (t) t.preview = false; return { ...u, groups: gs }; });
  const split = () => {
    const u = uiRef.current;
    const gs = cloneGroups(u.groups);
    if (gs.length >= 2) { // join: VS Code's "Join All Editor Groups"
      const merged = { tabs: [...gs[0].tabs, ...gs[1].tabs.filter((t) => !gs[0].tabs.some((x) => x.key === t.key))], active: gs[u.focus]?.active || gs[0].active };
      setUi({ groups: [merged], focus: 0 });
      return;
    }
    const a = gs[0].active || "";
    // WHY the other lens and not a copy: Zach's ask is two views of one selection side by side (the Types switchboard
    // beside the package tree with that type's packages ringed), so the new group opens the complementary workspace.
    const k2 = a === "packages" ? (sel?.kind === "package" ? "packages/" + sel.id : "types/" + typeTarget()) : "packages";
    gs.push({ tabs: [{ key: k2, preview: false, params: {} }], active: k2 });
    setUi({ groups: gs, focus: 0 });
  };
  const backToLive = () => site.setVersion("live");

  // ---- keyboard: VS Code's bindings ----
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === "p") { e.preventDefault(); setQuick(e.shiftKey ? "commands" : "files"); }
      else if (mod && !e.shiftKey && k === "b") { e.preventDefault(); toggleSb(); }
      else if (mod && !e.shiftKey && k === "j") { e.preventDefault(); togglePanel(); }
      else if (mod && e.shiftKey && k === "m") { e.preventDefault(); togglePanel("problems"); }
      else if (mod && e.key === "\\") { e.preventDefault(); split(); }
      else if (e.key === "Escape" && narrow) { setPhoneSb(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- sizes ----
  const mainRef = useRef(null);
  const mainSize = useSize(mainRef);
  const centerRef = useRef(null);
  const centerSize = useSize(centerRef);
  const sbW = Math.max(180, Math.min(ui.sbW, Math.max(220, (mainSize.w || 1200) - 420)));
  const panelH = ui.panelMax ? Math.max(160, (centerSize.h || 700) - 90) : Math.max(110, Math.min(ui.panelH, Math.max(140, (centerSize.h || 700) - 170)));
  const sbDrag = useRef(0), phDrag = useRef(0), splitDrag = useRef(0);

  if (site.error) return <div className="v7-fatal"><h1>Could not load the data</h1><p>{String(site.error.message || site.error)}</p></div>;
  if (!site.ready) return <div className="v7-app v7-loading-shell"><div className="v7-title" /><div className="v7-loading">Loading graph.json, health.json, versions.json…</div><div className="v7-status" /></div>;

  const health = site.health;
  const probs = problemsOf(health);
  const pc = problemCounts(probs);
  const failingMembers = health ? (health.members || []).filter((m) => m.state === "fail").length : 0;
  const activeWs = wsOfKey(activeKey);

  const labelOf = (key) => {
    if (key.startsWith("types/")) { const t = resolveType(graph, key.slice(6)); return { icon: "types", iconClass: "v7-ico-type", label: t?.name || key.slice(6), desc: t?.module || "not in this version" }; }
    if (key.startsWith("packages/")) { const id = key.slice(9), p = graph.packages.find((x) => x.id === id); return { icon: "package", iconClass: "v7-ico-pkg", label: id, desc: p ? LAYER_LABEL[p.layer] || p.layer : "not in this version" }; }
    if (key === "compare") return { icon: "diff", label: site.isLive ? "Compare with Live" : `Live ↔ ${site.version?.label || "version"}`, desc: "graph.json diff" };
    return { ...(WS_META[key] || { icon: "files", label: key }) };
  };
  const crumbs = (key) => {
    if (!key) return [];
    if (key.startsWith("types/")) { const t = resolveType(graph, key.slice(6)); return t ? [...t.module.split("."), t.name] : [key.slice(6)]; }
    if (key.startsWith("packages/")) { const id = key.slice(9), p = graph.packages.find((x) => x.id === id); return ["robot-sdk", p ? LAYER_LABEL[p.layer] || p.layer : "(not in this version)", id]; }
    return ["robot-sdk", labelOf(key).label];
  };

  const commands = [
    { id: "problems", label: "View: Toggle Problems", keys: "Ctrl+J", icon: "panel", run: () => togglePanel("problems") },
    { id: "sidebar", label: "View: Toggle Explorer", keys: "Ctrl+B", icon: "sidebar", run: toggleSb },
    { id: "split", label: groups.length > 1 ? "View: Join Editor Groups" : "View: Split Editor Right", keys: "Ctrl+\\", icon: "split", run: split },
    { id: "version", label: "Version: Switch Version…", icon: "branch", run: () => setTimeout(() => setQuick("versions"), 0) },
    ...(!site.isLive ? [{ id: "live", label: "Version: Back to Live", icon: "branch", run: backToLive }, { id: "compare", label: "Version: Compare with Live", icon: "diff", run: () => navTo("compare") }] : []),
    { id: "output", label: "View: Show Output (data sources)", icon: "output", run: () => togglePanel("output") },
    ...(sel ? [{ id: "clear", label: `Selection: Clear (${sel.label})`, icon: "close", run: clearSel }] : []),
    ...(!ui.welcome ? [{ id: "welcome", label: "Help: Show the welcome strip", icon: "sparkle", run: () => setUi({ welcome: true }) }] : []),
    ...ACTIVITY.map((a) => ({ id: "ws-" + a.ws, ws: true, label: `Open ${a.label}`, icon: a.icon, run: () => activity(a.ws) })),
  ];

  const renderEditor = (key, tab, gi, size) => {
    if (!key) return <EmptyEditor onQuick={() => setQuick("files")} />;
    const ctxNarrow = size.w > 0 && size.w < 560;
    if (key.startsWith("types/")) return <TypeEditor site={site} typeKeyArg={key.slice(6)} openType={openType} openPackage={openPackage} onGo={(ws) => navTo(ws === "example" ? "run" : ws)} />;
    if (key === "packages") return <MapEditor site={site} sel={sel} lens={lens} setSel={(id) => { focusGroup(gi); setSel(id); }} openPackage={openPackage} openType={openType} clearSel={clearSel} openSel={openSel} bodyH={size.h} narrow={ctxNarrow} phone={narrow} />;
    if (key.startsWith("packages/")) return <PackageEditor site={site} id={key.slice(9)} via={tab?.params?.via} sym={tab?.params?.sym} openType={openType} openPackage={openPackage} onBackToLive={backToLive} />;
    if (key === "directory") return <Page testid="editor-directory"><LensBar sel={sel} lens={lens} what="the directory" onClear={clearSel} onOpenSel={openSel} />
      <Directory graph={graph} health={health} title="Directory" onOpenPackage={(p) => openPackage(p, { pinSource: true })} onOpenAgent={openAgent} /></Page>;
    if (key === "health") return <Page testid="editor-health"><LensBar sel={sel} lens={lens} what="the health board" onClear={clearSel} onOpenSel={openSel} />
      <HealthBoard health={health} graph={graph} note={site.healthNote} title="Health" onOpenPackage={(p) => openPackage(p, { pinSource: true })} onOpenAgent={openAgent} onBackToLive={backToLive} /></Page>;
    if (key === "agents") return <Page title="Agents" testid="editor-agents"><AgentsPanel graph={graph} health={health} onOpenPackage={(p) => openPackage(p, { pinSource: true })} /></Page>;
    if (key === "run") return <Page testid="editor-run"><RunPanel pick={site.pick} graph={graph} health={health} onOpenType={(k) => openType(k, { pinSource: true })} onOpenPackage={(p) => openPackage(p, { pinSource: true })} /></Page>;
    if (key === "skill") return <Page title="For coding agents" testid="editor-skill"><SkillPanel /></Page>;
    if (key === "compare") return <CompareEditor site={site} openPackage={openPackage} openType={openType} openTypeLive={openTypeLive} onBackToLive={backToLive} />;
    return <EmptyEditor onQuick={() => setQuick("files")} />;
  };

  const visibleGroups = narrow ? [focus] : groups.map((_, i) => i);
  const ratio = Math.max(0.2, Math.min(0.8, ui.ratio || 0.5));
  const hrefFor = (ws) => {
    const v = route.params.v ? { v: route.params.v } : {};
    if (ws === "types") return buildHash("types", [typeTarget()], v);
    return buildHash(ws, [], { ...v, ...(sel && !sel.missing ? { sel: sel.key } : {}) });
  };

  return (
    <div className={"v7-app" + (sbOpen ? " v7-sb-open" : " v7-sb-closed") + (narrow ? " v7-narrow" : "") + (site.isLive ? "" : " v7-offlive")} style={{ "--sbw": sbW + "px", "--ph": panelH + "px" }}>
      <style>{css}</style>
      {/* ---- title bar ---- */}
      <header className="v7-title">
        <div className="v7-brand">
          {narrow && <button className="v7-ibtn" onClick={toggleSb} aria-label="Toggle Explorer" data-testid="phone-explorer"><Icon name="menu" /></button>}
          <span className="v7-logo" aria-hidden><Icon name="package" size={16} /></span><b>robot-sdk</b>
        </div>
        <button className="v7-cc" onClick={() => setQuick("files")} data-testid="command-center" title="Go to a type or package (Ctrl+P)">
          <Icon name="search" size={14} /><span className="v7-cc-text">robot-sdk — go to a type or package</span><kbd>Ctrl+P</kbd>
        </button>
        <div className="v7-title-r">
          <button className="v7-ibtn v7-hide-phone" onClick={toggleSb} title="Toggle Primary Side Bar (Ctrl+B)" aria-label="Toggle side bar" data-testid="toggle-sidebar"><Icon name={sbOpen ? "sidebar" : "sidebarOff"} /></button>
          <button className={"v7-ibtn v7-hide-phone" + (panelOpen ? " v7-on" : "")} onClick={() => togglePanel()} title="Toggle Panel (Ctrl+J)" aria-label="Toggle panel" data-testid="toggle-panel"><Icon name={panelOpen ? "panel" : "panelOff"} /></button>
          <TopRight site={site} />
        </div>
      </header>

      <div className="v7-main" ref={mainRef}>
        {/* ---- activity bar ---- */}
        <nav className="v7-activity" aria-label="Workspaces">
          <button className={"v7-act v7-act-ex" + (sbOpen ? " v7-on" : "")} onClick={toggleSb} aria-label="Explorer (Ctrl+B)" data-tip="Explorer (Ctrl+B)" data-testid="act-explorer"><Icon name="files" size={24} /></button>
          {ACTIVITY.map((a) => (
            <a key={a.ws} href={hrefFor(a.ws)} className={"v7-act" + (activeWs === a.ws ? " v7-cur" : "")} data-ws={a.ws} data-testid={"act-" + a.ws} aria-label={a.label} data-tip={a.tip}
              aria-current={activeWs === a.ws ? "page" : undefined} onMouseLeave={(e) => { delete e.currentTarget.dataset.tipoff; }}
              onClick={(e) => { e.currentTarget.dataset.tipoff = "1"; if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); activity(a.ws); }}>
              <Icon name={a.icon} size={24} />
              {a.ws === "health" && failingMembers > 0 && <span className="v7-badge" data-testid="health-badge" title={`${failingMembers} failing`}>{failingMembers}</span>}
            </a>
          ))}
        </nav>

        {/* ---- side bar ---- */}
        {sbOpen && <aside className="v7-side" data-testid="side-bar">
          <Explorer site={site} sel={sel} lens={lens} activeKey={activeKey} expanded={ui.expanded} setExpanded={(e) => setUi({ expanded: e })}
            sections={ui.sections} setSections={(s) => setUi({ sections: s })}
            onOpenType={(k, o) => { if (narrow) setPhoneSb(false); openType(k, o); }} onOpenPackage={(id, o) => { if (narrow) setPhoneSb(false); openPackage(id, o); }}
            onOpenAgent={(id) => { if (narrow) setPhoneSb(false); openAgent(id); }} onOpenCompare={() => navTo("compare")} onOpenTypeLive={openTypeLive} />
          {!narrow && <Sash dir="v" testid="sash-sidebar" onDrag={(dx) => { if (!sbDrag.current) sbDrag.current = sbW; const w = sbDrag.current + dx; if (w < 120) setUi({ sbOpen: false, sbW: sbDrag.current }); else setUi({ sbW: Math.max(180, Math.min(620, w)), sbOpen: true }); }}
            onEnd={() => { sbDrag.current = 0; }} onReset={() => setUi({ sbW: DEFAULT_UI.sbW })} className="v7-sash-side" />}
        </aside>}
        {narrow && sbOpen && <div className="v7-scrim" onClick={() => setPhoneSb(false)} />}

        {/* ---- editor area + panel ---- */}
        <div className="v7-center" ref={centerRef}>
          {ui.welcome && <div className="v7-welcome" data-testid="welcome-strip">
            <span className="v7-welcome-pitch"><b>robot-sdk</b> {PITCH}</span>
            <span className="v7-welcome-act"><Install /><button className="v7-btn" onClick={() => navTo("run")} data-testid="welcome-run">See it pick and place →</button>
              <span className="v7-welcome-tip">Ctrl+P finds any type · Ctrl+J shows Problems</span></span>
            <button className="v7-ibtn v7-welcome-x" onClick={() => setUi({ welcome: false })} aria-label="Dismiss the welcome strip" title="Dismiss" data-testid="welcome-close"><Icon name="close" /></button>
          </div>}
          <VersionBanner site={site} className="v7-vbanner" onOpenPackage={(p) => openPackage(p)} onOpenType={(t) => openType(t)} />
          <div className="v7-ed" data-testid="editor-area">
            {visibleGroups.map((gi, n) => {
              const g = groups[gi];
              const tab = g.tabs.find((t) => t.key === g.active);
              const w = groups.length > 1 && !narrow ? (gi === 0 ? ratio : 1 - ratio) : 1;
              return (
                <EditorGroup key={gi} gi={gi} g={g} tab={tab} focused={gi === focus} multi={groups.length > 1} grow={w} narrow={narrow}
                  labelOf={labelOf} crumbs={crumbs(g.active)} onFocus={() => focusGroup(gi)}
                  onTab={(t) => { if (t.key === g.active && gi === focus) return; navTo(t.key, { intent: { group: gi }, params: t.params || {} }); }}
                  onPin={(t) => pinTab(gi, t.key)} onClose={(t) => closeTab(gi, t.key)} onSplit={split} split={groups.length > 1} renderEditor={renderEditor}
                  onSwitchGroup={() => focusGroup(gi === 0 ? 1 : 0)} groupCount={groups.length}
                  sash={n > 0 ? <Sash dir="v" testid="sash-split" onDrag={(dx) => { if (!splitDrag.current) splitDrag.current = ratio; const W = centerSize.w || 1000; setUi({ ratio: Math.max(0.2, Math.min(0.8, splitDrag.current + dx / W)) }); }}
                    onEnd={() => { splitDrag.current = 0; }} onReset={() => setUi({ ratio: 0.5 })} className="v7-sash-split" /> : null} />
              );
            })}
          </div>
          {panelOpen && <div className={"v7-panel-wrap" + (narrow ? " v7-panel-sheet" : "")}>
            {!narrow && <Sash dir="h" testid="sash-panel" onDrag={(dx, dy) => { if (!phDrag.current) phDrag.current = panelH; const h = phDrag.current - dy; if (h < 70) setUi({ panelOpen: false }); else setUi({ panelH: h, panelMax: false }); }}
              onEnd={() => { phDrag.current = 0; }} onReset={() => setUi({ panelH: DEFAULT_UI.panelH, panelMax: false })} className="v7-sash-panel" />}
            <Panel site={site} lens={lens} sel={sel} tab={ui.panelTab} setTab={(t) => setUi({ panelTab: t })} onClose={() => togglePanel()} maximized={ui.panelMax} setMaximized={(m) => setUi({ panelMax: m })}
              counts={health ? pc : null} filterSel={ui.filterSel} setFilterSel={(x) => setUi({ filterSel: x })}
              onOpenMember={(id, isAgent) => { if (narrow) setPhonePanel(false); isAgent ? openAgent(id) : openPackage(id); }} />
          </div>}
        </div>
      </div>

      {/* ---- status bar ---- */}
      <footer className="v7-status" data-testid="status-bar">
        <button className="v7-sb v7-sb-remote" onClick={() => setQuick("versions")} data-testid="sb-version" title={`${site.version?.label}: ${site.version?.summary || ""} — click to switch version`}>
          <Icon name="branch" size={14} /><span>{site.loading ? (site.versions.find((v) => v.id === site.requestedId)?.label || site.requestedId) + "…" : site.version?.label}</span>
        </button>
        <button className="v7-sb" onClick={() => togglePanel("problems")} data-testid="sb-problems" title={health ? "Problems: failing and warning checks from health.json (Ctrl+J)" : site.healthNote}>
          {health ? <><Icon name="error" size={14} /><span>{pc.fail}</span><Icon name="warning" size={14} /><span>{pc.warn}</span>{pc.info > 0 && <><Icon name="info" size={14} /><span>{pc.info}</span></>}</> : <span>health not recorded</span>}
        </button>
        {!site.isLive && site.diff && <button className="v7-sb v7-sb-diff" onClick={() => navTo("compare")} data-testid="sb-compare" title="Open the comparison with Live">
          <Icon name="diff" size={14} /><span>vs Live: {diffText(site.diff)}</span></button>}
        <span className="v7-grow" />
        {sel && <button className="v7-sb v7-sb-sel" onClick={openSel} title="The selection every workspace highlights" data-testid="sb-selection">
          <Icon name={sel.kind === "type" ? "types" : sel.kind === "agent" ? "robot" : "package"} size={14} /><span>{sel.label}{sel.missing ? " (not in this version)" : sel.kind === "type" ? ` · ${lens.pkgs.size} packages` : ""}</span></button>}
        <span className="v7-sb v7-sb-static v7-hide-phone" title={`graph.json generated ${graph.generated}`} data-testid="sb-generated">graph {fmtShortDate(graph.generated)}</span>
        <span className="v7-sb v7-sb-static v7-hide-phone">{graph.packages.length} packages · {graph.types.length} types</span>
      </footer>

      {quick && <QuickOpen mode={quick} site={site} tabs={groups.flatMap((g) => g.tabs.map((t) => t.key))} labelOf={labelOf} commands={commands} onClose={() => setQuick(null)}
        onOpenKey={(k, s) => { if (k === "agents") openAgent(s); else if (k.startsWith("types/")) openType(k.slice(6)); else if (k.startsWith("packages/")) openPackage(k.slice(9)); else navTo(k); }}
        onOpenFunction={(s, r) => openPackage(s.package, { pinSource: true, sym: s.symbol, via: (r.from || r.to || [])[0] ? typeKey(graph, (r.from || r.to)[0]) : undefined })} />}
    </div>
  );
}

function EditorGroup({ gi, g, tab, focused, multi, grow, narrow, labelOf, crumbs, onFocus, onTab, onPin, onClose, onSplit, split, renderEditor, sash, onSwitchGroup, groupCount }) {
  const bodyRef = useRef(null);
  const size = useSize(bodyRef);
  const tabsRef = useRef(null);
  useEffect(() => { tabsRef.current?.querySelector(".v7-tab.v7-active")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [g.active]);
  return (
    <>
      {sash}
      <section className={"v7-group" + (focused ? " v7-focused" : "") + (multi ? " v7-multi" : "")} style={{ flexGrow: grow, flexBasis: 0 }} onPointerDownCapture={onFocus} data-testid={"editor-group-" + gi}>
        <div className="v7-tabs" role="tablist">
          <div className="v7-tabs-scroll" ref={tabsRef}>
            {g.tabs.map((t) => {
              const L = labelOf(t.key);
              const on = t.key === g.active;
              return (
                <div key={t.key} role="tab" aria-selected={on} className={"v7-tab" + (on ? " v7-active" : "") + (t.preview ? " v7-preview" : "")} title={`${L.label}${L.desc ? " — " + L.desc : ""}${t.preview ? " (preview: double-click to keep it open)" : ""}`}
                  onClick={() => onTab(t)} onDoubleClick={() => onPin(t)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t); } }} data-testid={"tab-" + t.key}>
                  <Icon name={L.icon} size={14} className={L.iconClass || ""} />
                  <span className="v7-tab-label">{L.label}</span>
                  <button className="v7-tab-x" onClick={(e) => { e.stopPropagation(); onClose(t); }} aria-label={"Close " + L.label} title="Close" data-testid={"tab-close-" + t.key}><Icon name="close" size={14} /></button>
                </div>
              );
            })}
          </div>
          <div className="v7-tab-actions">
            {narrow && groupCount > 1 && <button className="v7-ibtn" onClick={onSwitchGroup} title="Show the other editor group" aria-label="Other editor group">{gi + 1}/{groupCount}</button>}
            {!narrow && <button className={"v7-ibtn" + (split ? " v7-on" : "")} onClick={onSplit} title={split ? "Join Editor Groups (Ctrl+\\)" : "Split Editor Right: the package tree beside it, linked to the selection (Ctrl+\\)"}
              aria-label={split ? "Join editor groups" : "Split editor right"} data-testid="split-editor"><Icon name="split" /></button>}
          </div>
        </div>
        {g.active && !narrow && <div className="v7-crumbs" aria-label="Breadcrumbs">{crumbs.map((c, i) => <span key={i} className={i === crumbs.length - 1 ? "v7-crumb-last" : ""}>{i > 0 && <Icon name="chevronRight" size={12} />}{c}</span>)}</div>}
        <div className="v7-body" ref={bodyRef} data-testid={"editor-body-" + gi}>
          {renderEditor(g.active, tab, gi, size)}
        </div>
      </section>
    </>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
