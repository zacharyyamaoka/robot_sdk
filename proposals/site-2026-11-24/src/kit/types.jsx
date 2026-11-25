// The Types workspace: round-1 V2's Type Switchboard (imported, not copied) plus "What can I do with it?".
// WHY (Zach, 2026-11-24): "I really really really like this type view … Its a functional robot library so if you want
// to understand it moving around by the types is 100% the right way to navigate … you have a joint trajectory and you
// want to know what you can do with it? well now you can quickly find out!!"
// Adapter, not a fork: V2's TypesTab renders rail | switchboard | rows. Here `.types-tab` is display: contents, so its
// three children join the kit's grid beside a panel switcher; the right column shows TypeActions (the functions that
// take the type, and where to get one) by default and V2's rows panel as soon as you click into the switchboard.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TypesTab } from "../v2/types-tab.jsx";
import { buildSwitchboard, filterRows } from "../v2/sw-model.js";
import { LAYER_LABEL, byId, usesOfType } from "@shared/graph.js";
import { SW_NARROW_QUERY, narrowLayout, narrowHeight, narrowCss } from "./swnarrow.js";
import { navigate, hrefTo } from "./route.js";
import {
  consumersOf, producersOf, importersOf, groupByPackage, typeKey, resolveType, mostUsedType, typeById, typeSearch,
  healthOf, sourceUrlAt, shortType, signatureText,
} from "./model.js";
import { HealthDot } from "./health.jsx";
import "./types.css";

// ---- type links ---------------------------------------------------------------------------------------------------
// Any mention of a type is a link to it: a real <a href="#/types/<Name>?v=…"> (deep link, middle-click, Back), or
// onOpen(key) when the variant routes types itself.
export function TypeLink({ graph, id, onOpen, className = "", bold = false, children }) {
  const t = typeById(graph)[id] || resolveType(graph, id);
  const name = children ?? (t ? t.name : shortType(id));
  if (!t) return <span className={"k-tlink k-tlink-x " + className} title="not a robot-sdk type in this version">{name}</span>;
  const key = typeKey(graph, t);
  return (
    <a className={"k-tlink " + (bold ? "k-tlink-on " : "") + className} href={hrefTo("types", key)} title={`${t.module}.${t.name}${t.what ? " — " + t.what : ""}`}
      onClick={onOpen ? (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); onOpen(key); } : undefined}
      data-testid={"tlink-" + t.name}>{name}</a>
  );
}

// Link every type name found in free text (the run's stage descriptions). WHY the package guard (from round-1 V2):
// "robot_diagnostics Trajectory" is that package's own Trajectory, not robot_msgs' one.
export function TypeText({ text, graph, onOpenType }) {
  const parts = useMemo(() => {
    const names = [...new Set(graph.types.map((t) => t.name))].sort((a, b) => b.length - a.length);
    if (!names.length || !text) return [text];
    const pkgIds = graph.packages.map((p) => p.id).filter((p) => p !== "robot_msgs");
    const re = new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
    const out = []; let last = 0, m;
    while ((m = re.exec(text))) {
      const before = text.slice(0, m.index);
      if (pkgIds.some((p) => before.endsWith(p + " ") || before.endsWith(p + "."))) continue;
      const t = graph.types.find((x) => x.name === m[1]);
      out.push(text.slice(last, m.index));
      out.push({ id: t.id, at: m.index });
      last = m.index + m[1].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, graph]);
  return <>{parts.map((p, i) => typeof p === "string" ? p : <TypeLink key={i} graph={graph} id={p.id} onOpen={onOpenType} />)}</>;
}

// "JointTrajectory, JointState → TrackingResult" with each type a link and the focus type in bold. A side with no
// robot-sdk type is left out rather than drawn empty: "takes JointTrajectory" / "returns JointTrajectory".
export function Signature({ graph, sig, focus, onOpenType }) {
  const list = (ids) => ids.map((id, i) => <span key={id}>{i ? ", " : ""}{id === focus ? <b className="k-sig-focus">{typeById(graph)[id]?.name || shortType(id)}</b> : <TypeLink graph={graph} id={id} onOpen={onOpenType} />}</span>);
  const ins = sig.inputs.length > 0, outs = sig.outputs.length > 0;
  return (
    <span className="k-sig" title={signatureText(graph, sig)}>
      {ins && outs ? <>{list(sig.inputs)}<span className="k-sig-arrow"> → </span>{list(sig.outputs)}</>
        : ins ? <><span className="k-sig-word">takes </span>{list(sig.inputs)}</>
        : outs ? <><span className="k-sig-word">returns </span>{list(sig.outputs)}</>
        : <span className="k-faint">imports only</span>}
    </span>
  );
}

function SigRow({ graph, sig, focus, url, onOpenType }) {
  const missing = sig.rows.some((r) => r.declared && !r.verified);
  return (
    <li className="k-sigrow" data-testid={"sig-" + sig.symbol}>
      <div className="k-sigrow-top">
        <code className="k-sig-name" title={sig.symbol}>{sig.name}</code>
        {!sig.public && <span className="k-tag" title="not on the package's public API">internal</span>}
        {missing && <span className="k-tag k-tag-bad" title="declared in robot-sdk.toml but not found in the code">lint: not found</span>}
      </div>
      <div className="k-sigrow-bot">
        <Signature graph={graph} sig={sig} focus={focus} onOpenType={onOpenType} />
        {url ? <a className="k-where" href={url} target="_blank" rel="noreferrer" title={`${sig.package}/${sig.where}`}>{sig.where.split("/").pop()}</a> : <code className="k-where">{sig.where}</code>}
      </div>
    </li>
  );
}

function SigGroups({ graph, sigs, focus, health, sourceUrl, onOpenType, onOpenPackage, limit, testid }) {
  const [open, setOpen] = useState(() => new Set());
  const groups = groupByPackage(sigs);
  const pk = Object.fromEntries(graph.packages.map((p) => [p.id, p]));
  if (!groups.length) return <p className="k-muted k-small">None in this version.</p>;
  return (
    <div className="k-siggroups" data-testid={testid}>
      {groups.map(([p, list]) => {
        const all = open.has(p), shown = all ? list : list.slice(0, limit);
        const m = healthOf(health, p);
        return (
          <div key={p} className="k-siggroup">
            <div className="k-siggroup-head">
              {health ? <HealthDot state={m?.state || "unknown"} title={m ? `${p}: ${m.state}` : "no health row"} /> : null}
              {onOpenPackage ? <button className="k-linkish" onClick={() => onOpenPackage(p)}><code>{p}</code></button> : <code>{p}</code>}
              <span className="k-faint k-small">{LAYER_LABEL[pk[p]?.layer] || ""}</span>
              <span className="k-grow" />
              <span className="k-count">{list.length}</span>
            </div>
            <ul className="k-siglist">{shown.map((s) => <SigRow key={s.id} graph={graph} sig={s} focus={focus} url={sourceUrl(s.package, s.where)} onOpenType={onOpenType} />)}</ul>
            {list.length > limit && <button className="k-more" onClick={() => { const n = new Set(open); all ? n.delete(p) : n.add(p); setOpen(n); }}>{all ? "show fewer" : `+${list.length - limit} more`}</button>}
          </div>
        );
      })}
    </div>
  );
}

// "What can I do with it?" — the public functions that take the type (consumers), with their other inputs and outputs
// as a signature, file:line linked to GitHub at the version's ref, and each package's health; then "Where to get one"
// (producers) and the packages that only import it.
// Props: graph, typeId, health, sourceUrl(pkg, where) (from useSite; default: main), onOpenType(key), onOpenPackage(id), limit = 4.
export function TypeActions({ graph, typeId, health, sourceUrl, onOpenType, onOpenPackage, limit = 4, note, className = "" }) {
  // WHY refs + useId: fixed ids (k-ta-take / k-ta-get) were duplicated when two TypeActions share a page, and the
  // "functions take it" / "return one" links scrolled to the first one (kit check, 2026-11-24).
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const takeRef = useRef(null), getRef = useRef(null);
  const jump = (ref) => (e) => { e.preventDefault(); ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const t = typeById(graph)[typeId] || resolveType(graph, typeId);
  const url = sourceUrl || ((p, w) => sourceUrlAt(graph, p, w, "main"));
  if (!t) return <div className={"k-ta " + className}><p className="k-muted">No type {String(typeId)} in this version.</p></div>;
  const cons = consumersOf(graph, t.id), prod = producersOf(graph, t.id), imps = importersOf(graph, t.id);
  const pk = (l) => new Set(l.map((s) => s.package)).size;
  const impPkgs = groupByPackage(imps);
  return (
    <div className={"k-ta " + className} data-testid="type-actions">
      {note && <div className="k-ta-note" data-testid="type-missing">{note}</div>}
      <div className="k-ta-head">
        <h3>What can I do with a <span className="k-mono">{t.name}</span>?</h3>
        <p className="k-muted k-small">{t.what}</p>
        <div className="k-ta-stats">
          <a href={"#k-ta-take-" + uid} onClick={jump(takeRef)} data-testid="type-actions-jump-take"><b>{cons.length}</b> functions take it <span className="k-faint">({pk(cons)} pkgs)</span></a>
          <a href={"#k-ta-get-" + uid} onClick={jump(getRef)} data-testid="type-actions-jump-get"><b>{prod.length}</b> return one <span className="k-faint">({pk(prod)} pkgs)</span></a>
        </div>
      </div>
      <h4 id={"k-ta-take-" + uid} ref={takeRef} className="k-ta-h k-c-cons">Takes a {t.name} <span className="k-faint">public parameter</span></h4>
      <SigGroups graph={graph} sigs={cons} focus={t.id} health={health} sourceUrl={url} onOpenType={onOpenType} onOpenPackage={onOpenPackage} limit={limit} testid="type-actions-consumers" />
      <h4 id={"k-ta-get-" + uid} ref={getRef} className="k-ta-h k-c-prod">Where to get one <span className="k-faint">returns a {t.name}</span></h4>
      <SigGroups graph={graph} sigs={prod} focus={t.id} health={health} sourceUrl={url} onOpenType={onOpenType} onOpenPackage={onOpenPackage} limit={limit} testid="type-actions-producers" />
      {impPkgs.length > 0 && <>
        <h4 className="k-ta-h">Also imported by <span className="k-faint">not on their public API</span></h4>
        <div className="k-ta-imps">{impPkgs.map(([p, l]) => <span key={p} className="k-chip">{health && <HealthDot state={healthOf(health, p)?.state || "unknown"} />}{onOpenPackage ? <button className="k-linkish" onClick={() => onOpenPackage(p)}><code>{p}</code></button> : <code>{p}</code>} <span className="k-faint">{l.length}</span></span>)}</div>
      </>}
    </div>
  );
}

// Health marks on V2's own switchboard and rows panel, as a scoped style (V2's nodes carry data-testid="sw-node-<col>-<pkg>"
// and "rows-pkg-<pkg>"). WHY CSS and not a fork: the switchboard is imported unchanged (criterion: build on V2).
function healthCss(health) {
  if (!health) return "";
  const out = [];
  for (const m of health.members || []) {
    if (!["fail", "warn", "pass"].includes(m.state)) continue;
    const v = `var(--k-${m.state})`;
    out.push(`.k-types .sw-pkg[data-testid$="-${m.id}"]::after{background:${v}}`);
    out.push(`.k-types .sw-pkg[data-testid$="-${m.id}"]{box-shadow:inset 3px 0 0 ${v}}`);
    out.push(`.k-types [data-testid="rows-pkg-${m.id}"] .rows-pkg-name::before{background:${v}}`);
  }
  return out.join("\n");
}

// WHY re-point V2's rows links: V2's rows panel (imported unchanged) links file:line at main for every version, so on
// Latest release the Rows tab sent you to main while TypeActions linked the tag, and line numbers drift between them
// (kit check, 2026-11-24). Each file:line link in the rows panel (UseRow's a.where, inside rows-pkg-<pkg>) is rewritten
// to sourceUrl(pkg, where), i.e. the version's ref; a MutationObserver catches rows V2 re-renders. Live (ref main) is
// left as is. Package links (GitHub, README) stay package-level.
function useRowsAtVersion(rootRef, graph, sourceUrl) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !sourceUrl) return;
    const blobMain = Object.fromEntries(graph.packages.filter((p) => p.repo_url).map((p) => [p.id, p.repo_url.replace(/\/$/, "") + "/blob/main/"]));
    const fix = () => {
      for (const a of root.querySelectorAll('[data-testid="rows-panel"] a.where[href*="/blob/main/"]')) {
        const pkg = a.closest('[data-testid^="rows-pkg-"]')?.dataset.testid.slice("rows-pkg-".length);
        const href = a.getAttribute("href"), prefix = blobMain[pkg];
        if (!prefix || !href.startsWith(prefix)) continue;
        const [path, hash = ""] = href.slice(prefix.length).split("#");
        const m = hash.match(/^L(\d+)(?:-L(\d+))?$/);
        const url = sourceUrl(pkg, path + (m ? ":" + m[1] + (m[2] ? "-" + m[2] : "") : ""));
        if (url && url !== href) a.setAttribute("href", url);
      }
    };
    fix();
    const mo = new MutationObserver(fix);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
    return () => mo.disconnect();
  }, [rootRef, graph, sourceUrl]);
}

// The switchboard on a phone (<= 640 px, V2's own breakpoint): the kit's layout (swnarrow.js) drawn over V2's nodes by a
// scoped <style>, so no edge runs through a box it does not connect and no count sits under a box (kit check,
// 2026-11-25). Inputs: V2's nodes as rendered (ids, V2 positions, sizes) — which also covers V2-internal state such as
// an open "+N types" ring or an expanded layer — plus, for the canvas height, the layout of the default node set built
// from props (graph, type, filters), so the height is right before V2's first fit. Writes `styleEl.textContent`
// directly (no React state): it runs from a MutationObserver as V2 re-renders.
function useNarrowSwitchboard(rootRef, styleRef, scope, graph, type, filters) {
  const inputs = useRef(null);
  inputs.current = { graph, type, filters };
  const update = useRef(null);
  update.current = () => {
    const root = rootRef.current, st = styleRef.current;
    if (!root || !st) return;
    const narrow = typeof matchMedia === "function" && matchMedia(SW_NARROW_QUERY).matches;
    const canvas = root.querySelector(".sw-canvas");
    const paneW = canvas?.clientWidth || 0;
    let css = "", zoom = null;
    if (narrow && canvas && paneW > 80 && inputs.current.type) {
      const { graph: g, type: t, filters: f } = inputs.current;
      const sb = buildSwitchboard(t, { rows: filterRows(usesOfType(g, t.id), f), pkgById: byId(g.packages), groupByLayer: f.groupByLayer,
        expanded: new Set(), ring: null, vertical: true, ringTypes: () => [] });
      const paneH = narrowHeight(narrowLayout(sb.nodes.map((n) => ({ id: n.id, w: n.w, h: n.h }))), paneW);
      const sel = `[data-k-sw="${scope}"]`;
      // border-box canvas with 1 px borders: the pane inside is paneH tall
      const rules = [`${sel} .sw-canvas{height:${paneH + 2}px!important;min-height:0!important;flex:none!important}`];
      const v2 = [];
      for (const el of canvas.querySelectorAll(".react-flow__node")) {
        const m = /translate\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*\)/.exec(el.style.transform || "");
        if (m && el.offsetWidth > 0) v2.push({ id: el.dataset.id, x: +m[1], y: +m[2], w: el.offsetWidth, h: el.offsetHeight });
      }
      if (v2.some((n) => n.id === "type")) {
        const btn = [...canvas.querySelectorAll(".sw-ring-btn")].find((b) => b.textContent.trim() === "hide types");
        const ring = btn ? "p:" + btn.dataset.testid.replace(/^sw-ring-/, "").replace("-", ":") : null;
        const lay = narrowLayout(v2.map(({ id, w, h }) => ({ id, w, h })), ring);
        if (lay) { const r = narrowCss(sel, lay, v2, paneW, paneH); rules.push(r.css); zoom = r.zoom; }
      }
      css = `@media ${SW_NARROW_QUERY} {\n${rules.join("\n")}\n}`;
    }
    if (st.textContent !== css) st.textContent = css;
    if (zoom) root.dataset.swZoom = zoom.toFixed(3); else delete root.dataset.swZoom;
  };
  // before paint, in the same commit as V2's new nodes: the height is set before V2 fits
  useLayoutEffect(() => { update.current(); }, [graph, type?.id, filters]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const run = () => update.current();
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (!el || el === styleRef.current || el.classList.contains("react-flow__viewport") || !el.closest(".sw-canvas")) continue;
        return run();
      }
    });
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"], characterData: true });
    const ro = new ResizeObserver(run);
    const canvas = root.querySelector(".sw-canvas");
    if (canvas) ro.observe(canvas);
    const mq = typeof matchMedia === "function" ? matchMedia(SW_NARROW_QUERY) : null;
    mq?.addEventListener("change", run);
    run();
    return () => { mo.disconnect(); ro.disconnect(); mq?.removeEventListener("change", run); };
  }, []);
}

const DEFAULT_FILTERS = { show: { produces: true, consumes: true, imports: true }, publicOnly: false, declaredOnly: false, groupByLayer: false };

// Props: graph, health, typeKey (a name or id, e.g. route.arg; default: the most used type), onOpenType(key),
// onOpenPackage(id), onGo(ws) (V2's intro buttons: "run", "directory"), sourceUrl, intro = true,
// panel/onPanel ("actions" | "rows"; optional), height = 760 (any CSS length).
export function TypeWorkspace({ graph, health, typeKey: key, onOpenType, onOpenPackage, onGo, sourceUrl, intro = true, panel: panelProp, onPanel, height = 760, className = "" }) {
  const asked = resolveType(graph, key);
  const type = asked || mostUsedType(graph);
  // WHY say so: a type can be missing from an older version (Latest release has 24 fewer); never swap silently.
  const note = key && !asked ? `No type “${key}” in this version; showing ${type?.name}.` : null;
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [panelState, setPanelState] = useState("actions");
  const rootRef = useRef(null);
  const swStyleRef = useRef(null);
  const swScope = useId().replace(/[^A-Za-z0-9_-]/g, "");
  useRowsAtVersion(rootRef, graph, sourceUrl);
  useNarrowSwitchboard(rootRef, swStyleRef, swScope, graph, type, filters);
  const panel = panelProp ?? panelState;
  const setPanel = onPanel ?? setPanelState;
  useEffect(() => { setPanel("actions"); }, [type?.id]);
  const openType = onOpenType || ((k) => navigate({ ws: "types", args: [k] }));
  const go = (ws, arg) => {
    if (ws === "types") return openType(arg);
    if (ws === "packages" && arg && onOpenPackage) return onOpenPackage(arg);
    const target = ws === "example" ? "run" : ws === "packages" && !arg ? "directory" : ws;
    if (onGo) return onGo(target, arg);
    navigate({ ws: target, args: arg ? [arg] : [] });
  };
  if (!type) return <div className="k-muted">No types in this version.</div>;
  const rows = graph.uses.filter((u) => u.type === type.id).length;
  // WHY flip on click: V2's switchboard narrows its rows panel when you click a package or an edge count; show it.
  const onClickCapture = (e) => {
    if (e.target.closest?.(".sw-elabel, .react-flow__node-pkg, .react-flow__node-layergroup")) setPanel("rows");
    else if (e.target.closest?.(".react-flow__node-type")) setPanel("actions");
  };
  return (
    <div ref={rootRef} className={`k-types k-panel-${panel}${intro ? "" : " k-nointro"} ${className}`} style={{ "--k-types-h": typeof height === "number" ? height + "px" : height }} onClickCapture={onClickCapture} data-testid="type-workspace" data-k-sw={swScope}>
      <style>{healthCss(health)}</style>
      <style ref={swStyleRef} data-k-sw-style="" />
      <TypesTab graph={graph} type={type} go={go} filters={filters} setFilters={setFilters} />
      <div className="k-types-ptabs" role="tablist">
        <button role="tab" aria-selected={panel === "actions"} className={"k-ptab" + (panel === "actions" ? " on" : "")} onClick={() => setPanel("actions")} data-testid="types-panel-actions">What can I do with it?</button>
        <button role="tab" aria-selected={panel === "rows"} className={"k-ptab" + (panel === "rows" ? " on" : "")} onClick={() => setPanel("rows")} data-testid="types-panel-rows">Rows <span className="k-n">{rows}</span></button>
      </div>
      <aside className="k-types-actions">
        <TypeActions graph={graph} typeId={type.id} health={health} sourceUrl={sourceUrl} onOpenType={openType} onOpenPackage={onOpenPackage} note={note} />
      </aside>
    </div>
  );
}

// A search box over types: plain names ("JointTraj"), and arrow queries for functions: "JointTrajectory ->" (what
// takes it), "-> JointTrajectory" (where to get one), "JointState -> ServoCommand" (what turns A into B, plus two-step
// chains when no single function does). Props: graph, health, onOpenType(key), onOpenPackage(id), sourceUrl,
// value/onChange (optional), placeholder, max = 12.
export function TypeSearch({ graph, health, onOpenType, onOpenPackage, sourceUrl, value, onChange, placeholder = "Search types — or try “JointTrajectory ->”", max = 12, autoFocus = false, className = "" }) {
  const [qState, setQState] = useState("");
  const q = value ?? qState;
  const setQ = onChange ?? setQState;
  const r = useMemo(() => typeSearch(graph, q), [graph, q]);
  const openType = onOpenType || ((k) => navigate({ ws: "types", args: [k] }));
  const url = sourceUrl || ((p, w) => sourceUrlAt(graph, p, w, "main"));
  return (
    <div className={"k-ts " + className} data-testid="type-search">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label="Search types" data-testid="type-search-input" />
      {r.kind === "empty" && <div className="k-ts-hint k-faint k-small">Try <button className="k-linkish" onClick={() => setQ("JointTrajectory ->")}>JointTrajectory -&gt;</button> · <button className="k-linkish" onClick={() => setQ("-> JointTrajectory")}>-&gt; JointTrajectory</button> · <button className="k-linkish" onClick={() => setQ("JointState -> ServoCommand")}>JointState -&gt; ServoCommand</button></div>}
      {r.kind === "types" && <ul className="k-ts-list">
        {r.types.slice(0, max).map((t) => (
          <li key={t.id}><a className="k-ts-type" href={hrefTo("types", typeKey(graph, t))} onClick={(e) => { e.preventDefault(); openType(typeKey(graph, t)); }} data-testid={"ts-type-" + t.name}>
            <code>{t.name}</code><span className="k-faint k-small">{t.module}</span><span className="k-ts-what k-small k-muted">{t.what}</span></a></li>
        ))}
        {!r.types.length && <li className="k-muted k-small">No type matches “{q}”.</li>}
        {r.types.length > max && <li className="k-faint k-small">+{r.types.length - max} more</li>}
      </ul>}
      {r.kind === "flow" && <div className="k-ts-flow">
        <div className="k-small k-muted">
          {r.from ? <>takes {r.from.map((t) => <TypeLink key={t.id} graph={graph} id={t.id} onOpen={openType} />)}</> : "anything"}{" → "}
          {r.to ? <>returns {r.to.map((t) => <TypeLink key={t.id} graph={graph} id={t.id} onOpen={openType} />)}</> : "anything"}
          {" · "}<b>{r.functions.length}</b> function{r.functions.length === 1 ? "" : "s"}
          {r.unresolved && <span className="k-tag k-tag-warn">a side matches no type</span>}
        </div>
        {r.functions.length > 0 && <SigGroups graph={graph} sigs={r.functions} focus={null} health={health} sourceUrl={url} onOpenType={openType} onOpenPackage={onOpenPackage} limit={3} testid="type-search-functions" />}
        {r.chains.length > 0 && <div className="k-ts-chains"><div className="k-small k-muted">No single function; {r.chains.length} two-step chains:</div>
          <ul className="k-siglist">{r.chains.slice(0, max).map((c, i) => (
            <li key={i} className="k-sigrow"><code className="k-sig-name">{c.first.name}</code> <span className="k-faint">({c.first.package})</span> → <TypeLink graph={graph} id={c.via} onOpen={openType} /> → <code className="k-sig-name">{c.second.name}</code> <span className="k-faint">({c.second.package})</span></li>
          ))}</ul></div>}
        {!r.functions.length && !r.chains.length && <p className="k-muted k-small">No public function in this version does that.</p>}
      </div>}
    </div>
  );
}
