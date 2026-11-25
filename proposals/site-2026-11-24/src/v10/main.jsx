// V10 "Docs" — robot-sdk as a versioned docs site (reference: Docusaurus versioned docs and docs.ros.org).
// Thesis: every package and every type is a page with a stable URL, the directory is the docs sidebar, and versions
// behave like versioned docs (the dropdown keeps you on the same page; a page missing from a version says so).
//   #/overview · #/types · #/types/JointTrajectory?v=release · #/packages · #/packages/robot_controllers?s=health
//   #/directory · #/health · #/agents · #/agents/<id> · #/run · #/skill        (?s=<section> deep-links a heading)
// Everything comes from the shared kit (@kit): data + versions (useSite), the hash router (useRoute), the version
// picker + GitHub icon (TopRight), VersionBanner, TypeActions, TypeWorkspace (round-1 V2's switchboard), PackageMap,
// Directory, HealthBoard, RunPanel, AgentsPanel, SkillPanel. This file is the docs shell around them.
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useSite, useRoute, setParams, VersionBanner, navigate } from "@kit";
import { AnnouncementBar, Navbar, Sidebar, SidebarTree, Drawer, Toc, MobileToc, SearchModal, Footer, Icon, tocTarget, useSidebarState } from "./chrome.jsx";
import { resolvePage } from "./pages.jsx";
import { sidebarTree, pageOrder } from "./docs-model.js";
import "./v10.css";

// Docusaurus' mobile breakpoint (996px): below it the sidebar moves into the navbar drawer and the TOC into the page.
const MOBILE = "(max-width: 996px)";
function useMedia(q) {
  const [m, setM] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [q]);
  return m;
}

const isTyping = (e) => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };

function Breadcrumbs({ crumbs, route }) {
  if (!crumbs.length) return null;
  return (
    <nav className="d-crumbs" aria-label="Breadcrumbs" data-testid="d-breadcrumbs">
      <a className="d-crumb d-crumb-home" href={route.href("overview")} aria-label="Overview"><Icon.home /></a>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return <span key={i} className="d-crumb-wrap">{c.href && !last ? <a className="d-crumb" href={c.href}>{c.label}</a> : <span className={"d-crumb" + (last ? " on" : "")}>{c.label}</span>}</span>;
      })}
    </nav>
  );
}

function Pagination({ order, pageKey, route }) {
  const i = order.findIndex((p) => p.key === pageKey);
  if (i < 0) return null;
  const prev = order[i - 1], next = order[i + 1];
  const href = (p) => route.href(p.ws, ...(p.arg ? [p.arg] : []));
  return (
    <nav className="d-pager" aria-label="Docs pages" data-testid="d-pager">
      {prev ? <a className="d-pager-link prev" href={href(prev)} data-testid="d-pager-prev"><span className="d-pager-sub">Previous</span><span className="d-pager-label">« {prev.label}</span></a> : <span />}
      {next ? <a className="d-pager-link next" href={href(next)} data-testid="d-pager-next"><span className="d-pager-sub">Next</span><span className="d-pager-label">{next.label} »</span></a> : <span />}
    </nav>
  );
}

function App() {
  const site = useSite();
  const route = useRoute("overview");
  const mobile = useMedia(MOBILE);
  const sb = useSidebarState();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [tocActive, setTocActive] = useState(0);
  const mainRef = useRef(null);

  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); }
      else if (e.key === "/" && !isTyping(e)) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const tree = useMemo(() => (site.graph ? sidebarTree(site.graph, site.health) : []), [site.graph, site.health]);
  const order = useMemo(() => pageOrder(tree), [tree]);
  const page = site.ready ? resolvePage({ site, route }) : null;
  const tocItems = page && !page.wide ? page.toc : [];
  const tocSig = tocItems.map((t) => t.id || t.sel).join("|");
  const scroller = () => (mobile ? window : mainRef.current);

  // A new page starts at its top, or at ?s=<section> (a deep link to a heading); a version switch keeps the scroll.
  useEffect(() => {
    if (!page) return;
    const s = route.params.s;
    const t = setTimeout(() => {
      const el = s && document.getElementById(s);
      if (el) el.scrollIntoView({ block: "start" });
      else if (mobile) window.scrollTo(0, 0); else mainRef.current?.scrollTo(0, 0);
    }, s ? 120 : 0);
    return () => clearTimeout(t);
  }, [route.ws, route.arg, !!page]);

  useEffect(() => { if (page) document.title = page.kind === "overview" ? "robot-sdk" : `${page.title} | robot-sdk`; }, [page?.title, page?.kind]);
  useEffect(() => { setDrawer(false); }, [route.ws, route.arg]);

  // "On this page" follows the scroll: the last heading above the top quarter of the view is the current one.
  useEffect(() => {
    const sc = scroller();
    if (!sc || !tocItems.length) return;
    const top = () => (mobile ? 64 : mainRef.current.getBoundingClientRect().top);
    const on = () => {
      let a = 0;
      tocItems.forEach((it, i) => { const el = tocTarget(it); if (el && el.getBoundingClientRect().top - top() < 110) a = i; });
      const atEnd = mobile ? window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 : sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
      if (atEnd && sc.scrollTop + (mobile ? window.scrollY : 0) > 0) a = Math.max(a, tocItems.length - 1);
      setTocActive(a);
    };
    on();
    const tgt = mobile ? window : sc;
    tgt.addEventListener("scroll", on, { passive: true });
    return () => tgt.removeEventListener("scroll", on);
  }, [tocSig, mobile, page?.key, site.versionId]);

  const pickToc = (it) => {
    const el = tocTarget(it);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
    if (it.id) setParams({ s: it.id }, { replace: true });
  };

  if (site.error) return <div className="d-fatal"><h1>Could not load the data</h1><p>{String(site.error.message || site.error)}</p></div>;
  if (!site.ready) return <div className="d-fatal d-muted">Loading graph.json, health.json, versions.json…</div>;

  const tocCol = !mobile && !page.wide && tocItems.length > 0;
  const sidebar = <SidebarTree tree={tree} current={page.key} route={route} onNavigate={() => setDrawer(false)} />;
  return (
    <div className={"d-app" + (mobile ? " d-mobile" : " d-desktop")} data-version={site.versionId}>
      <AnnouncementBar site={site} route={route} compact={mobile} />
      <Navbar site={site} route={route} active={page.active} mobile={mobile} onMenu={() => setDrawer(true)} onSearch={() => setSearch(true)} />
      <div className="d-body">
        {!mobile && <Sidebar sb={sb}>{sidebar}</Sidebar>}
        <main className="d-main" ref={mainRef} data-testid="d-main">
          <div className={"d-docwrap" + (tocCol ? " has-toc" : "") + (page.wide ? " wide" : "")}>
            <article className={"d-doc d-kind-" + page.kind} data-testid={"d-page-" + page.kind} data-page={page.key}>
              <VersionBanner site={site} className="d-vbanner" onOpenPackage={(id) => navigate({ ws: "packages", args: [id] })} onOpenType={(k) => navigate({ ws: "types", args: [k] })} />
              <Breadcrumbs crumbs={page.crumbs} route={route} />
              {mobile && <MobileToc items={page.toc} onPick={pickToc} />}
              {page.body}
              {(page.edit || page.updated) && <div className="d-docfoot">
                {page.edit ? <a href={page.edit.href} target="_blank" rel="noreferrer" className="d-edit"><Icon.edit /> {page.edit.label}</a> : <span />}
                <span className="d-updated">{page.updated}</span>
              </div>}
              <Pagination order={order} pageKey={page.key} route={route} />
            </article>
            {tocCol && <div className="d-toccol"><Toc items={tocItems} active={tocActive} onPick={pickToc} /></div>}
          </div>
          <Footer site={site} route={route} />
        </main>
      </div>
      <Drawer open={mobile && drawer} onClose={() => setDrawer(false)} route={route} active={page.active} site={site}>{sidebar}</Drawer>
      <SearchModal open={search} onClose={() => setSearch(false)} graph={site.graph} mobile={mobile} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
