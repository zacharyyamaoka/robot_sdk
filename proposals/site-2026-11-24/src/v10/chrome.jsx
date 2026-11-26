// V10 "Docs" chrome, after Docusaurus (versioned docs) and docs.ros.org: announcement bar, navbar (logo, workspace
// links, DocSearch-style Ctrl-K search, version dropdown beside the GitHub icon), the docs sidebar (collapsible tree,
// draggable edge, foldable), the right "On this page" table of contents, the mobile drawer, and the dark footer.
// WHY Docusaurus (Zach specs by pointing at reference apps, zero relearning): anyone who has read ROS 2 or any
// Docusaurus site already knows where the version is, how the sidebar folds, and what "On this page" does.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TopRight, HealthDot, healthSummary, healthText, typeSearch, matchTypes, signatures, signatureText, typeKey, navigate,
  REPO_URL, SKILL_URL, TAGS_URL, dataBase, fmtShortDate, LAYER_LABEL,
} from "@kit";
import { NAV, PAGE_LABEL, ancestorsOf } from "./docs-model.js";

// ---- small icons (Docusaurus' own glyphs, drawn inline) ------------------------------------------------------------
export const Icon = {
  search: (s = 16) => <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true"><path d="M14.386 14.386l4.088 4.088-4.088-4.088A7.533 7.533 0 1 1 3.733 3.733a7.533 7.533 0 0 1 10.653 10.653z" stroke="currentColor" fill="none" fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>,
  menu: () => <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><path stroke="currentColor" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="2" d="M4 7h22M4 15h22M4 23h22" /></svg>,
  home: () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 19v-5h4v5c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-7h1.7c.46 0 .68-.57.33-.87L12.67 3.6c-.38-.34-.96-.34-1.34 0l-8.36 7.53c-.34.3-.13.87.33.87H5v7c0 .55.45 1 1 1h3c.55 0 1-.45 1-1z" fill="currentColor" /></svg>,
  caret: () => <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" /></svg>,
  fold: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><path d="M9.992 10.023c0 .2-.062.399-.172.547l-4.996 7.492a.982.982 0 01-.828.454H1c-.55 0-1-.453-1-1 0-.2.059-.403.168-.551l4.629-6.942L.168 3.078A.939.939 0 010 2.528c0-.548.45-.997 1-.997h2.996c.352 0 .649.18.828.45L9.82 9.472c.11.148.172.347.172.55zm0 0" transform="rotate(180 7.0 10)" /><path d="M19.98 10.023c0 .2-.058.399-.168.547l-4.996 7.492a.987.987 0 01-.828.454h-3c-.547 0-.996-.453-.996-1 0-.2.059-.403.168-.551l4.625-6.942-4.625-6.945a.939.939 0 01-.168-.55 1 1 0 01.996-.997h3c.348 0 .649.18.828.45l4.996 7.492c.11.148.168.347.168.55zm0 0" transform="rotate(180 15 10)" /></g></svg>,
  unfold: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><path d="M9.992 10.023c0 .2-.062.399-.172.547l-4.996 7.492a.982.982 0 01-.828.454H1c-.55 0-1-.453-1-1 0-.2.059-.403.168-.551l4.629-6.942L.168 3.078A.939.939 0 010 2.528c0-.548.45-.997 1-.997h2.996c.352 0 .649.18.828.45L9.82 9.472c.11.148.172.347.172.55zm0 0" /><path d="M19.98 10.023c0 .2-.058.399-.168.547l-4.996 7.492a.987.987 0 01-.828.454h-3c-.547 0-.996-.453-.996-1 0-.2.059-.403.168-.551l4.625-6.942-4.625-6.945a.939.939 0 01-.168-.55 1 1 0 01.996-.997h3c.348 0 .649.18.828.45l4.996 7.492c.11.148.168.347.168.55zm0 0" /></g></svg>,
  edit: () => <svg fill="currentColor" height="18" width="18" viewBox="0 0 40 40" aria-hidden="true"><path d="m34.5 11.7l-3 3.1-6.3-6.3 3.1-3q0.5-0.5 1.2-0.5t1.1 0.5l3.9 3.9q0.5 0.4 0.5 1.1t-0.5 1.2z m-29.5 17.1l18.4-18.5 6.3 6.3-18.4 18.4h-6.3v-6.2z" /></svg>,
  close: () => <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.4"><path d="M.75.75l13.5 13.5M14.25.75L.75 14.25" /></g></svg>,
  ext: () => <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="d-ext"><path fill="currentColor" d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z" /></svg>,
};

// The mark: a type in the middle, a producer on the left (green) and a consumer on the right (blue) — the site's idea.
export function Logo({ size = 28 }) {
  return (
    <svg className="d-logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#1c1e21" />
      <path d="M8 16h16" stroke="#fff" strokeWidth="2" opacity=".55" />
      <circle cx="8" cy="16" r="3.6" fill="#3fb37f" />
      <rect x="12.5" y="12.5" width="7" height="7" rx="1.6" fill="#fff" />
      <circle cx="24" cy="16" r="3.6" fill="#5b8def" />
    </svg>
  );
}

// Where the logo goes. WHY a meta (2026-11-25, Zach: the landing page "doesn't have the side bar"): the published site
// puts a sidebar-free landing page at / and these docs at /docs/; publish_dashboard.py writes
// <meta name="robot-sdk-home" content="../"> so the logo returns to it, as a Docusaurus logo returns to the site's home.
// Without the meta (the proposals gallery, file://) the logo opens the docs' own Overview, as before.
const homeHref = (route) => (typeof document !== "undefined" && document.querySelector('meta[name="robot-sdk-home"]')?.content) || route.href("overview");

// ---- announcement bar: health on every screen ------------------------------------------------------------------------
// WHY the announcement bar (Docusaurus' site-wide notice slot): Zach wants health first-class and "summarised on every
// screen" (criterion fr2); the bar is where a docs site says the one thing every reader should know right now.
export function AnnouncementBar({ site, route, compact }) {
  const s = healthSummary(site.health);
  const label = site.version?.label || "Live";
  return (
    <div className="d-ann" data-testid="d-announcement">
      {s ? <>
        <span className="d-ann-txt"><b>{label}</b>{compact ? " " : " health: "}
          {s.fail ? <span className="d-ann-part"><HealthDot state="fail" />{s.fail} failing</span> : null}
          {s.warn ? <span className="d-ann-part"><HealthDot state="warn" />{s.warn} {compact ? "warn" : s.warn === 1 ? "warning" : "warnings"}</span> : null}
          {s.pass ? <span className="d-ann-part"><HealthDot state="pass" />{s.pass} {compact ? "pass" : "passing"}</span> : null}
        </span>
        <a className="d-ann-link" href={route.href("health")} data-testid="d-ann-health">{compact ? "Health →" : s.fail ? "See what is failing →" : "Open Health →"}</a>
      </> : <><span className="d-ann-txt" title={site.healthNote || ""}><b>{label}</b> · health not recorded for this version</span><a className="d-ann-link" href={route.href("health")} data-testid="d-ann-health">Health →</a></>}
    </div>
  );
}

// ---- navbar -----------------------------------------------------------------------------------------------------------
function HealthBadge({ health }) {
  const s = healthSummary(health);
  if (!s) return <span className="d-nbadge d-nbadge-none" title="health not recorded for this version">–</span>;
  const st = s.fail ? "fail" : s.warn ? "warn" : "pass";
  const n = s.fail || s.warn || s.pass;
  return <span className={"d-nbadge d-nbadge-" + st} title={healthText(s)} data-testid="d-health-badge">{n}</span>;
}

export function Navbar({ site, route, active, mobile, onMenu, onSearch }) {
  return (
    <nav className="d-navbar" aria-label="Main" data-testid="d-navbar">
      {mobile && <button className="d-burger" onClick={onMenu} aria-label="Open the navigation" data-testid="d-burger"><Icon.menu /></button>}
      <a className="d-brand" href={homeHref(route)} data-testid="d-brand" title="robot-sdk home"><Logo /><b>robot-sdk</b></a>
      {!mobile && <div className="d-navitems">
        {NAV.map((w) => (
          <a key={w.id} data-ws={w.id} href={route.href(w.id)} className={"d-navlink" + (active === w.id ? " on" : "")} aria-current={active === w.id ? "page" : undefined}>
            {w.label}{w.id === "health" && <HealthBadge health={site.health} />}
          </a>
        ))}
      </div>}
      <span className="d-grow" />
      <button className="d-search-btn" onClick={onSearch} aria-label="Search" data-testid="d-search-open">
        {Icon.search(15)}{!mobile && <><span className="d-search-ph">Search</span><span className="d-keys"><kbd>Ctrl</kbd><kbd>K</kbd></span></>}
      </button>
      <TopRight site={site} className="d-topright" />
    </nav>
  );
}

// ---- docs sidebar -------------------------------------------------------------------------------------------------------
// tree from sidebarTree(); current = "<ws>/<arg>". Categories open by default: Packages and its layers, Types (modules
// folded, the current type's module open), Agents. Folding is per session (Docusaurus doesn't remember it either).
function useOpenSet(tree, current) {
  const [open, setOpen] = useState(() => {
    const s = new Set(["packages/", "types/", "agents/"]);
    for (const it of tree) if (it.key === "packages/") for (const l of it.items || []) s.add(l.key);
    return s;
  });
  // WHY auto-open the current page's ancestors: the highlighted page must be visible in the tree (Docusaurus does this).
  useEffect(() => {
    const anc = ancestorsOf(tree, current);
    if (anc.some((k) => !open.has(k))) setOpen((o) => new Set([...o, ...anc]));
  }, [current, tree]);
  const toggle = (k) => setOpen((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return [open, toggle];
}

function SbItem({ it, depth, current, open, toggle, route, onNavigate }) {
  const isCur = it.key === current;
  const href = it.ws ? route.href(it.ws, ...(it.arg ? [it.arg] : [])) : null;
  const tid = "d-sb-" + it.key.replace(/\/$/, "").replace(/[^A-Za-z0-9_.-]/g, "-");
  const extra = <>
    {it.state && <HealthDot state={it.state} />}
    {it.count != null && it.kind === "link" && <span className="d-sb-n">{it.count}</span>}
    {it.viewer && <span className="d-sb-tag">viewer</span>}
  </>;
  if (it.kind === "link") {
    return (
      <li className="d-sb-li">
        <a className={"d-sb-link" + (isCur ? " on" : "") + (it.mono ? " mono" : "")} href={href} aria-current={isCur ? "page" : undefined}
          onClick={onNavigate} data-testid={tid} style={{ "--d": depth }}>
          <span className="d-sb-label">{it.label}</span>{extra}
        </a>
      </li>
    );
  }
  const isOpen = open.has(it.key);
  const inside = !isOpen && current.startsWith(it.ws ? it.ws + "/" : "\0") && !isCur;
  return (
    <li className={"d-sb-li d-sb-cat" + (isOpen ? " open" : "")}>
      <div className={"d-sb-catrow" + (isCur ? " on" : "") + (inside ? " has-cur" : "")} style={{ "--d": depth }}>
        {href
          ? <a className={"d-sb-link d-sb-catlink" + (isCur ? " on" : "") + (it.mono ? " mono" : "")} href={href} onClick={onNavigate} data-testid={tid} aria-current={isCur ? "page" : undefined}>
              <span className="d-sb-label">{it.label}</span>{it.count != null && <span className="d-sb-n">{it.count}</span>}</a>
          : <button className={"d-sb-link d-sb-catlink" + (it.mono ? " mono" : "")} onClick={() => toggle(it.key)} aria-expanded={isOpen} data-testid={tid}>
              <span className="d-sb-label">{it.label}</span><span className="d-sb-n">{it.items.length}</span></button>}
        <button className="d-sb-caret" onClick={() => toggle(it.key)} aria-expanded={isOpen} aria-label={(isOpen ? "Collapse " : "Expand ") + it.label} data-testid={tid + "-caret"}><Icon.caret /></button>
      </div>
      {isOpen && <ul className="d-sb-list">{it.items.map((c) => <SbItem key={c.key} it={c} depth={depth + 1} current={current} open={open} toggle={toggle} route={route} onNavigate={onNavigate} />)}</ul>}
    </li>
  );
}

export function SidebarTree({ tree, current, route, onNavigate }) {
  const [open, toggle] = useOpenSet(tree, current);
  const ref = useRef(null);
  // keep the current page in view inside the sidebar's own scroll (only when it is out of view)
  // WHY a timeout: the current page's module opens in an effect first; scroll once it is rendered.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current?.querySelector(".d-sb-link.on");
      const box = ref.current?.closest(".d-sb-scroll, .d-drawer-body");
      if (!el || !box) return;
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (r.top < b.top + 8 || r.bottom > b.bottom - 8) box.scrollTop += r.top - b.top - b.height / 2 + r.height / 2;
    }, 60);
    return () => clearTimeout(t);
  }, [current]);
  return (
    <ul className="d-sb-list d-sb-root" ref={ref} data-testid="d-sidebar-tree">
      {tree.map((it) => <SbItem key={it.key} it={it} depth={0} current={current} open={open} toggle={toggle} route={route} onNavigate={onNavigate} />)}
    </ul>
  );
}

// The desktop sidebar: draggable right edge (width remembered) and Docusaurus' "Collapse sidebar" button.
// WHY draggable + foldable (Zach's standing UI rule: every panel boundary draggable, width remembered, foldable).
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* per-viewer convenience only */ } },
};
export const SB_MIN = 200, SB_MAX = 460, SB_DEFAULT = 286;
export function useSidebarState() {
  const [w, setW] = useState(() => { const n = parseInt(store.get("rsdk-v10-sb-w"), 10); return Number.isFinite(n) ? Math.min(SB_MAX, Math.max(SB_MIN, n)) : SB_DEFAULT; });
  const [folded, setFolded] = useState(() => store.get("rsdk-v10-sb-folded") === "1");
  return {
    width: w, folded,
    setWidth: (x, save) => { const v = Math.round(Math.min(SB_MAX, Math.max(SB_MIN, x))); setW(v); if (save) store.set("rsdk-v10-sb-w", String(v)); },
    setFolded: (f) => { setFolded(f); store.set("rsdk-v10-sb-folded", f ? "1" : "0"); },
  };
}

export function Sidebar({ sb, children }) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const onDown = (e) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: sb.width };
    setDragging(true);
    const move = (ev) => sb.setWidth(drag.current.w + ev.clientX - drag.current.x, false);
    const up = (ev) => {
      sb.setWidth(drag.current.w + ev.clientX - drag.current.x, true);
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onKey = (e) => {
    if (e.key === "ArrowLeft") sb.setWidth(sb.width - 16, true);
    if (e.key === "ArrowRight") sb.setWidth(sb.width + 16, true);
  };
  if (sb.folded) {
    return (
      <aside className="d-sidebar d-folded" data-testid="d-sidebar" data-folded="1">
        <button className="d-sb-unfold" onClick={() => sb.setFolded(false)} title="Expand sidebar" aria-label="Expand sidebar" data-testid="d-sb-unfold"><Icon.unfold /></button>
      </aside>
    );
  }
  return (
    <aside className={"d-sidebar" + (dragging ? " d-dragging" : "")} style={{ width: sb.width }} data-testid="d-sidebar">
      <div className="d-sb-scroll">{children}</div>
      <button className="d-sb-fold" onClick={() => sb.setFolded(true)} title="Collapse sidebar" aria-label="Collapse sidebar" data-testid="d-sb-fold"><Icon.fold /></button>
      <div className="d-sb-resizer" role="separator" aria-orientation="vertical" aria-label="Resize the sidebar" aria-valuenow={sb.width} aria-valuemin={SB_MIN} aria-valuemax={SB_MAX}
        tabIndex={0} onPointerDown={onDown} onKeyDown={onKey} onDoubleClick={() => sb.setWidth(SB_DEFAULT, true)} title="Drag to resize · double-click to reset" data-testid="d-sb-resizer" />
    </aside>
  );
}

// Mobile: Docusaurus' navbar drawer — the main menu, then the docs sidebar.
export function Drawer({ open, onClose, route, active, site, children }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="d-drawer-wrap" data-testid="d-drawer">
      <div className="d-drawer-backdrop" onClick={onClose} />
      <div className="d-drawer" role="dialog" aria-label="Navigation">
        <div className="d-drawer-head"><a className="d-brand" href={homeHref(route)} onClick={onClose}><Logo /><b>robot-sdk</b></a>
          <button className="d-x" onClick={onClose} aria-label="Close the navigation"><Icon.close /></button></div>
        {/* WHY the main menu outside the scroll: the docs tree below scrolls to the current page, and the workspaces
            must stay one tap away (Docusaurus' "back to main menu", flattened into one view). */}
        <ul className="d-drawer-main">
          {NAV.map((w) => <li key={w.id}><a className={"d-dchip" + (active === w.id ? " on" : "")} href={route.href(w.id)} onClick={onClose} data-testid={"d-drawer-" + w.id}>
            {w.label}{w.id === "health" && <HealthBadge health={site.health} />}</a></li>)}
        </ul>
        <div className="d-drawer-body">
          <div className="d-drawer-sub">Docs</div>
          {children}
        </div>
      </div>
    </div>, document.body);
}

// ---- "On this page" -------------------------------------------------------------------------------------------------
// items: [{ id | sel, label, level }]. Desktop: the right column, scroll-spied; phone: Docusaurus' collapsible box.
export function tocTarget(it) {
  return it.id ? document.getElementById(it.id) : it.sel ? document.querySelector(it.sel) : null;
}
export function Toc({ items, active, onPick }) {
  if (!items?.length) return null;
  return (
    <nav className="d-toc" aria-label="On this page" data-testid="d-toc">
      <div className="d-toc-title">On this page</div>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={"lvl-" + (it.level || 2)}>
            <a href={"#" + (it.id || "")} className={active === i ? "on" : ""} onClick={(e) => { e.preventDefault(); onPick(it, i); }} data-testid={"d-toc-" + (it.id || it.key || i)}>{it.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
export function MobileToc({ items, onPick }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  return (
    <div className={"d-mtoc" + (open ? " open" : "")} data-testid="d-mtoc">
      <button className="d-mtoc-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>On this page <Icon.caret /></button>
      {open && <ul>{items.map((it, i) => <li key={i} className={"lvl-" + (it.level || 2)}><a href={"#" + (it.id || "")} onClick={(e) => { e.preventDefault(); setOpen(false); onPick(it, i); }}>{it.label}</a></li>)}</ul>}
    </div>
  );
}

// ---- search (DocSearch look: Ctrl-K modal, grouped hits, keyboard) ---------------------------------------------------------
// Over types, functions and packages of the version on screen (the kit's typeSearch, so "JointTrajectory ->" lists what
// takes it and "-> JointTrajectory" where to get one), plus the site's pages.
// "JointTrajectory, JointState → TrackingResult", or "takes JointTrajectory" / "returns JointTrajectory" for one side.
function sigText(graph, s) {
  const nm = (id) => graph.types.find((t) => t.id === id)?.name || String(id).split(".").pop();
  const ins = s.inputs.map(nm).join(", "), outs = s.outputs.map(nm).join(", ");
  return ins && outs ? `${ins} → ${outs}` : ins ? `takes ${ins}` : outs ? `returns ${outs}` : signatureText(graph, s);
}
function buildHits(graph, q) {
  const query = q.trim();
  if (!query) return { groups: [], flow: null };
  const r = typeSearch(graph, query);
  const groups = [];
  const typeHit = (t) => ({ kind: "type", key: "t:" + t.id, title: t.name, sub: t.module + (t.what ? " — " + t.what : ""), go: () => navigate({ ws: "types", args: [typeKey(graph, t)] }) });
  const fnHit = (s) => ({ kind: "fn", key: "f:" + s.id, title: s.name, sub: `${s.package} · ${sigText(graph, s)}`, go: () => navigate({ ws: "packages", args: [s.package], params: { s: "api", sym: s.symbol } }) });
  if (r.kind === "flow") {
    const ends = [...(r.from || []), ...(r.to || [])];
    if (ends.length) groups.push({ label: "Types", hits: ends.slice(0, 4).map(typeHit) });
    groups.push({ label: `Functions (${r.functions.length})`, hits: r.functions.slice(0, 12).map(fnHit) });
    if (r.chains.length) groups.push({ label: `Two-step chains (${r.chains.length})`, hits: r.chains.slice(0, 6).map((c, i) => ({ kind: "fn", key: "c" + i, title: `${c.first.name} → ${graph.types.find((t) => t.id === c.via)?.name || c.via} → ${c.second.name}`, sub: `${c.first.package} then ${c.second.package}`, go: () => navigate({ ws: "packages", args: [c.first.package], params: { s: "api", sym: c.first.symbol } }) })) });
    return { groups: groups.filter((g) => g.hits.length), flow: r };
  }
  const ql = query.toLowerCase();
  const types = matchTypes(graph, query).slice(0, 6);
  if (types.length) groups.push({ label: "Types", hits: types.map(typeHit) });
  const pkgs = graph.packages.filter((p) => `${p.id} ${p.pypi} ${p.one_line}`.toLowerCase().includes(ql)).slice(0, 5);
  if (pkgs.length) groups.push({ label: "Packages", hits: pkgs.map((p) => ({ kind: "pkg", key: "p:" + p.id, title: p.id, sub: `${LAYER_LABEL[p.layer] || p.layer} · ${p.one_line}`, go: () => navigate({ ws: "packages", args: [p.id] }) })) });
  const fns = signatures(graph).filter((s) => (s.inputs.length || s.outputs.length) && `${s.name} ${s.symbol}`.toLowerCase().includes(ql)).slice(0, 6);
  if (fns.length) groups.push({ label: "Functions", hits: fns.map(fnHit) });
  const agents = (graph.agents || []).filter((a) => `${a.name} ${a.id}`.toLowerCase().includes(ql)).slice(0, 3);
  if (agents.length) groups.push({ label: "Agents", hits: agents.map((a) => ({ kind: "page", key: "a:" + a.id, title: a.name, sub: a.one_line || a.objective, go: () => navigate({ ws: "agents", args: [a.id] }) })) });
  const pages = Object.entries(PAGE_LABEL).filter(([id, l]) => `${l} ${id}`.toLowerCase().includes(ql)).slice(0, 4);
  if (pages.length) groups.push({ label: "Pages", hits: pages.map(([id, l]) => ({ kind: "page", key: "pg:" + id, title: l, sub: "robot-sdk", go: () => navigate({ ws: id }) })) });
  return { groups, flow: null };
}

const KIND_MARK = { type: "T", fn: "ƒ", pkg: "P", page: "#" };

export function SearchModal({ open, onClose, graph, mobile }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef(null), list = useRef(null);
  const res = useMemo(() => buildHits(graph, q), [graph, q]);
  const flat = res.groups.flatMap((g) => g.hits);
  useEffect(() => { setSel(0); }, [q, graph]);
  useEffect(() => { if (open) { setTimeout(() => input.current?.focus(), 10); } else setQ(""); }, [open]);
  useEffect(() => { list.current?.querySelector(".d-hit.on")?.scrollIntoView({ block: "nearest" }); }, [sel]);
  if (!open) return null;
  const pick = (h) => { onClose(); h.go(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && flat[sel]) { e.preventDefault(); pick(flat[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  const tries = ["JointTrajectory", "JointTrajectory ->", "-> JointTrajectory", "JointState -> ServoCommand", "robot_controllers"];
  let i = -1;
  return createPortal(
    <div className="d-search-wrap" data-testid="d-search">
      <div className="d-search-backdrop" onClick={onClose} />
      <div className={"d-search-modal" + (mobile ? " mobile" : "")} role="dialog" aria-label="Search">
        <div className="d-search-form">
          {Icon.search(20)}
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search types, functions, packages"
            aria-label="Search" data-testid="d-search-input" spellCheck={false} autoComplete="off" />
          <button className="d-search-cancel" onClick={onClose}>{mobile ? "Cancel" : "esc"}</button>
        </div>
        <div className="d-search-body" ref={list}>
          {!q.trim() && <div className="d-search-empty">
            <div className="d-hit-group">Try</div>
            {tries.map((t) => <button key={t} className="d-try" onClick={() => setQ(t)}><code>{t}</code></button>)}
            <p className="d-faint">A type name finds its page; <code>Type -&gt;</code> lists the functions that take it, <code>-&gt; Type</code> where to get one, <code>A -&gt; B</code> what turns A into B.</p>
          </div>}
          {res.flow && <div className="d-search-flow">{res.flow.functions.length} function{res.flow.functions.length === 1 ? "" : "s"}{res.flow.from ? <> take {res.flow.from.map((t) => t.name).join(" / ")}</> : null}{res.flow.to ? <> {res.flow.from ? "and return" : "return"} {res.flow.to.map((t) => t.name).join(" / ")}</> : null}{res.flow.unresolved ? " · a side matches no type" : ""}</div>}
          {res.groups.map((g) => (
            <div key={g.label}>
              <div className="d-hit-group">{g.label}</div>
              {g.hits.map((h) => { i++; const me = i; return (
                <button key={h.key} className={"d-hit" + (me === sel ? " on" : "")} onMouseMove={() => setSel(me)} onClick={() => pick(h)} data-testid={"d-hit-" + h.key}>
                  <span className={"d-hit-icon k-" + h.kind}>{KIND_MARK[h.kind]}</span>
                  <span className="d-hit-main"><span className="d-hit-title">{h.title}</span><span className="d-hit-sub">{h.sub}</span></span>
                  <span className="d-hit-enter" aria-hidden>↵</span>
                </button>); })}
            </div>
          ))}
          {q.trim() && !flat.length && <div className="d-search-empty"><p>No results for “<b>{q}</b>” in this version.</p></div>}
        </div>
        {!mobile && <div className="d-search-foot"><span><kbd>↵</kbd> to select</span><span><kbd>↓</kbd><kbd>↑</kbd> to navigate</span><span><kbd>esc</kbd> to close</span><span className="d-grow" /><span className="d-faint">types · functions · packages of this version</span></div>}
      </div>
    </div>, document.body);
}

// ---- footer (Docusaurus' dark footer, real links only) ---------------------------------------------------------------
export function Footer({ site, route }) {
  const base = dataBase();
  const g = site.graph, h = site.health;
  return (
    <footer className="d-footer" data-testid="d-footer">
      <div className="d-footer-cols">
        <div><div className="d-footer-title">Workspaces</div>
          {["types", "packages", "directory", "health"].map((w) => <a key={w} href={route.href(w)}>{PAGE_LABEL[w]}</a>)}</div>
        <div><div className="d-footer-title">Use it</div>
          <a href={route.href("run")}>Pick and place run</a><a href={route.href("skill")}>For coding agents</a><a href={SKILL_URL} target="_blank" rel="noreferrer">skill/SKILL.md <Icon.ext /></a></div>
        <div><div className="d-footer-title">Source</div>
          <a href={REPO_URL} target="_blank" rel="noreferrer">robot_sdk on GitHub <Icon.ext /></a><a href={TAGS_URL} target="_blank" rel="noreferrer">Tags <Icon.ext /></a></div>
        <div><div className="d-footer-title">Data</div>
          <a href={base + (site.version?.graph || "graph.json")} target="_blank" rel="noreferrer">graph.json</a>
          <a href={base + (site.version?.health || "health.json")} target="_blank" rel="noreferrer">health.json</a>
          <a href={base + "versions.json"} target="_blank" rel="noreferrer">versions.json</a></div>
      </div>
      <div className="d-footer-copy">{site.version?.label || "Live"} · graph.json generated {fmtShortDate(g?.generated)}{h ? ` · health.json ${fmtShortDate(h.generated)}` : ""} · every page is generated from these files</div>
    </footer>
  );
}
