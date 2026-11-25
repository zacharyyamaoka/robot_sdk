// V10 "Docs": one page per entity. resolvePage(route, site) -> { key, kind, active, title, crumbs, toc, wide, body,
// edit, updated }. Pages compose the shared kit; every type mention is a TypeLink (a real #/types/<Name>?v=… link).
// Page kinds: overview · types (generated index) · type · packages (the map) · package · directory · health ·
// agents · agent · run · skill. A page whose entity is missing from the version on screen says so, the way a
// versioned docs site says "this page doesn't exist in version X" (never a silent swap).
import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Handle, Position, MarkerType } from "@xyflow/react";
import {
  TypeActions, TypeWorkspace, TypeLink, TypeText, TypeSearch, Signature, PackageMap, Directory, HealthBoard, HealthInline,
  HealthPill, HealthDot, AgentsPanel, AgentCard, RunPanel, SkillPanel, Install, CopyCode, PkgLinks, PLOTS, PITCH, PITCH_2,
  LAYER_RULE, AGENT_RULE, LAYER_BLURB, LAYER_LABEL, layersOf, packageEdges, consumersOf, producersOf, importersOf, typeCounts,
  signatures, sortedMembers, healthOf, healthSummary, healthText, shortCheck, HEALTH_LABEL, resolveType, navigate, fmtShortDate,
  REPO_URL,
} from "@kit";
import { Icon } from "./chrome.jsx";
import { PAGE_LABEL, layerTitle, typesByModule, typeKeyOf } from "./docs-model.js";

const openType = (k) => navigate({ ws: "types", args: [k] });
const openPkg = (id) => navigate({ ws: "packages", args: [id] });
const openAgent = (id) => navigate({ ws: "agents", args: [id] });

// ---- building blocks (Infima / Docusaurus look) ----------------------------------------------------------------------
const ADMON = { tip: "Tip", info: "Info", note: "Note", warning: "Warning", danger: "Danger" };
export function Admonition({ type = "note", title, children, testid }) {
  return (
    <div className={"d-admon d-admon-" + type} data-testid={testid}>
      <div className="d-admon-head"><span className="d-admon-ico" aria-hidden>{type === "tip" ? "✓" : type === "warning" || type === "danger" ? "!" : "i"}</span>{title || ADMON[type]}</div>
      <div className="d-admon-body">{children}</div>
    </div>
  );
}

// A heading with Docusaurus' hover "#" (copies nothing; the TOC owns scrolling).
function H2({ id, children }) { return <h2 className="d-h2" id={id}>{children}</h2>; }
function H3({ id, children }) { return <h3 className="d-h3" id={id}>{children}</h3>; }

// Free text from a package's own robot-sdk.toml: `code` spans render as code, and every type name is a link.
export function RichText({ text, graph }) {
  if (!text) return null;
  const parts = String(text).split(/(`[^`]+`)/g);
  return <>{parts.map((p, i) => p.startsWith("`") && p.endsWith("`")
    ? <code key={i}><TypeText text={p.slice(1, -1)} graph={graph} onOpenType={openType} /></code>
    : <TypeText key={i} text={p} graph={graph} onOpenType={openType} />)}</>;
}

// WHY a stretched title link instead of an <a> card: a type's description links the other types it names, and links
// may not nest; the title's ::after covers the card, the inner type links sit above it.
function DocCard({ href, title, desc, descTitle, foot, mark, testid, mono }) {
  return (
    <div className="d-card" data-testid={testid ? testid + "-card" : undefined}>
      <div className="d-card-title">{mark && <span className="d-card-mark" aria-hidden>{mark}</span>}<a className={"d-card-link" + (mono ? " mono" : "")} href={href} data-testid={testid}>{title}</a></div>
      {desc && <p className="d-card-desc" title={descTitle || (typeof desc === "string" ? desc : undefined)}>{desc}</p>}
      {foot && <div className="d-card-foot">{foot}</div>}
    </div>
  );
}

// Shields-style health badges (README badges are how a package's state is read at a glance); each one opens its evidence.
function Shields({ health, id }) {
  const m = healthOf(health, id);
  if (!health) return <span className="d-shield d-st-none"><span className="k">health</span><span className="v">not recorded</span></span>;
  if (!m) return null;
  return (
    <span className="d-shields" data-testid="d-shields">
      {(health.checks || []).map((c) => {
        const x = m.checks?.[c.id];
        if (!x || x.state === "none") return null;
        const inner = <><span className="k">{c.label.toLowerCase()}</span><span className="v">{shortCheck(c.id, x)}</span></>;
        const title = `${c.label}: ${x.detail || HEALTH_LABEL[x.state]}`;
        return x.url
          ? <a key={c.id} className={"d-shield d-st-" + x.state} href={x.url} target="_blank" rel="noreferrer" title={title + " (open the evidence)"} data-testid={"d-shield-" + c.id}>{inner}</a>
          : <span key={c.id} className={"d-shield d-st-" + x.state} title={title} data-testid={"d-shield-" + c.id}>{inner}</span>;
      })}
    </span>
  );
}

// Every check with its detail and its evidence link (the CI run, robot-sdk.toml, PyPI, the repo).
function HealthTable({ health, id, note }) {
  const m = healthOf(health, id);
  if (!health) return <Admonition type="note" title="Health not recorded">{note || "Health was not recorded for this version."} The site never shows Live's checks under another version.</Admonition>;
  if (!m) return <p className="d-muted">No health row for {id} in this version.</p>;
  return (
    <div className="d-table-wrap">
      <table className="d-table d-htable" data-testid="d-health-table">
        <thead><tr><th>Check</th><th>State</th><th>Detail</th><th>Evidence</th></tr></thead>
        <tbody>
          {(health.checks || []).map((c) => {
            const x = m.checks?.[c.id];
            if (!x) return null;
            return (
              <tr key={c.id} className={"d-st-row-" + x.state}>
                <td title={c.what}><b>{c.label}</b></td>
                <td className="d-nowrap"><HealthDot state={x.state} /> {HEALTH_LABEL[x.state] || x.state}</td>
                <td className="d-detail">{x.detail || "—"}
                  {(x.failures || []).length > 0 && <ul className="d-fails">{x.failures.map((f, i) => <li key={i}><code>{typeof f === "string" ? f : JSON.stringify(f)}</code></li>)}</ul>}
                  {x.where && <div className="d-small"><code>{x.where}</code></div>}</td>
                <td className="d-nowrap">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{evidenceLabel(c.id)} <Icon.ext /></a> : <span className="d-faint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const evidenceLabel = (id) => ({ tests: "CI run", lint: "robot-sdk.toml", types: "source", release: "PyPI", upstream: "GitHub" }[id] || "open");

// A version that does not hold this page. WHY say it, not 404: Docusaurus answers "this page doesn't exist in that
// version"; here the reason is real (versions.json: the package has no v* tag, or the snapshot predates it).
function NotInVersion({ site, kind, id, label }) {
  const v = site.version;
  const onLive = kind === "package" ? site.live.graph.packages.some((p) => p.id === id)
    : kind === "type" ? !!resolveType(site.live.graph, id) : (site.live.graph.agents || []).some((a) => a.id === id);
  const pin = kind === "package" && v?.packages && id in v.packages ? v.packages[id] : undefined;
  const why = kind === "package" && v?.kind === "release" && pin === null ? <><code>{id}</code> has no <code>v*</code> tag yet, so it is not part of <b>{v.label}</b> ({v.summary}).</>
    : kind === "agent" && v?.kind === "release" ? <>Agents are not released; <b>{v.label}</b> lists packages only.</>
    : <><b>{label}</b> is not in <b>{v?.label}</b>.</>;
  const g = site.graph;
  return (
    <div className="d-notin" data-testid="d-not-in-version">
      <h1 className="d-h1">{label}</h1>
      <Admonition type="warning" title={`Not in ${v?.label || "this version"}`}>
        <p>{why}</p>
        {onLive && <p><button className="d-btn d-btn-primary" onClick={() => site.setVersion("live")} data-testid="d-open-on-live">Open it on Live</button></p>}
      </Admonition>
      {kind === "package" && <><H2 id="in-this-version">What is in {v?.label}</H2>
        <div className="d-cards d-cards-3">{g.packages.map((p) => <DocCard key={p.id} href={hrefOf("packages", p.id)} mono title={p.id}
          desc={p.one_line} foot={<>v{p.version}{v?.packages?.[p.id]?.ref ? <> · tag <code>{v.packages[p.id].ref}</code></> : null}</>} testid={"d-notin-pkg-" + p.id} />)}</div></>}
      {kind === "type" && <><H2 id="in-this-version">The {g.types.length} types in {v?.label}</H2>
        <p className="d-chips">{g.types.map((t) => <TypeLink key={t.id} graph={g} id={t.id} />)}</p></>}
    </div>
  );
}
const hrefOf = (ws, ...args) => {
  const q = (location.hash.split("?")[1] || "");
  const v = new URLSearchParams(q).get("v");
  return "#/" + [ws, ...args].map(encodeURIComponent).join("/") + (v ? "?v=" + encodeURIComponent(v) : "");
};

// "(Live: 58)" beside a number when the version on screen is not Live and the number differs.
function vsLive(site, here, live) {
  if (site.isLive || live == null || here === live) return null;
  return <span className="d-vs" title="the same number on Live"> (Live: {live})</span>;
}

// ---- small deps graph (React Flow) ----------------------------------------------------------------------------------
// WHY boxes with one edge each, not one edge per package: robot_msgs is required by 13 packages; 13 edges converging
// through two wrapped rows crossed the nodes in between. A "Required by" box above and a "Requires" box below, one arrow
// each, read at a glance; the arrow points at what is required (V1's tree convention).
function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW((x) => { const n = Math.round(e.contentRect.width); return Math.abs(n - x) > 4 ? n : x; }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return w;
}
const HT = (p) => <Handle {...p} isConnectable={false} />;
function DBox({ data }) {
  return (<div className={"d-dg-box " + data.cls} style={{ width: data.w, height: data.h }}><HT type="source" position={Position.Bottom} id="s" /><HT type="target" position={Position.Top} id="t" />
    <div className="d-dg-boxhead">{data.label}</div></div>);
}
function DNode({ data }) {
  return (
    <div className={"d-dg-node" + (data.center ? " center" : "") + (data.agent ? " agent" : "") + (data.extra ? " extra" : "") + (data.viewer ? " viewer" : "")}
      style={{ width: data.w, height: data.h }} title={data.title} data-testid={"d-dg-" + data.id}>
      <HT type="source" position={Position.Bottom} id="s" /><HT type="target" position={Position.Top} id="t" />
      <div className="d-dg-name">{data.label}</div>
      {data.sub && <div className="d-dg-sub">{data.sub}</div>}
      {data.state && <span className="d-dg-dot"><HealthDot state={data.state} /></span>}
    </div>
  );
}
const dgTypes = { dbox: DBox, dnode: DNode };

function DepsGraph({ graph, health, pkg }) {
  const ref = useRef(null);
  const w = useWidth(ref);
  const all = useMemo(() => packageEdges(graph), [graph]);
  const users = all.filter((e) => e.target === pkg.id).map((e) => ({ id: e.source, extras: e.required ? null : e.extras }));
  const deps = all.filter((e) => e.source === pkg.id).map((e) => ({ id: e.target, extras: e.required ? null : e.extras, known: e.known }));
  const agents = (graph.agents || []).filter((a) => (a.builds_on || []).includes(pkg.id));
  const pk = Object.fromEntries(graph.packages.map((p) => [p.id, p]));
  const lay = useMemo(() => {
    if (!w) return null;
    const narrow = w < 560, PAD = 10, GX = 10, GY = 10, HEAD = 28, NH = 42;
    const NW = narrow ? Math.floor((w - 2 * PAD - 2 * 12 - GX) / 2) : 176;
    const nodes = [], edges = [];
    let y = 0;
    const st = (id) => (health ? healthOf(health, id)?.state || "unknown" : null);
    const box = (key, label, items, cls) => {
      const cols = Math.max(1, Math.min(items.length, Math.floor((w - 2 * PAD - 24 + GX) / (NW + GX))));
      const rows = Math.ceil(items.length / cols);
      // WHY a label-wide minimum and a wrapping heading: a box holding one node was narrower than its own heading, and
      // on a phone "Required by 12 packages · 1 agent builds on it" needs two lines.
      const bw = Math.min(w - 2 * PAD, Math.max(cols * NW + (cols - 1) * GX + 24, Math.ceil(label.length * 7.4) + 28));
      const head = HEAD + 16 * (Math.ceil((label.length * 7.4) / (bw - 24)) - 1);
      const bh = head + rows * NH + (rows - 1) * GY + 12;
      const bx = Math.round((w - bw) / 2);
      nodes.push({ id: key, type: "dbox", position: { x: bx, y }, data: { w: bw, h: bh, label, cls }, draggable: false, selectable: false, zIndex: -1, style: { width: bw, height: bh } });
      items.forEach((it, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const inRow = Math.min(cols, items.length - r * cols);
        const rowW = inRow * NW + (inRow - 1) * GX;
        const x0 = bx + 12 + Math.round((bw - 24 - rowW) / 2);
        nodes.push({ id: key + ":" + it.id, type: "dnode", position: { x: x0 + c * (NW + GX), y: y + head + r * (NH + GY) }, draggable: false,
          data: { ...it, w: NW, h: NH } , style: { width: NW, height: NH } });
      });
      y += bh;
      return key;
    };
    const top = [...users.map((u) => ({ id: u.id, label: u.id, sub: u.extras ? `extra [${u.extras.join(", ")}]` : `v${pk[u.id]?.version || "?"} · ${LAYER_LABEL[pk[u.id]?.layer] || ""}`, extra: !!u.extras, state: st(u.id), viewer: pk[u.id]?.role === "viewer", open: () => openPkg(u.id), title: pk[u.id]?.one_line })),
      ...agents.map((a) => ({ id: a.id, label: a.name, sub: "agent builds on it", agent: true, state: st(a.id), open: () => openAgent(a.id), title: a.objective }))];
    const bottom = deps.map((d) => ({ id: d.id, label: d.id, sub: d.extras ? `extra [${d.extras.join(", ")}]` : `v${pk[d.id]?.version || "?"} · ${LAYER_LABEL[pk[d.id]?.layer] || ""}`, extra: !!d.extras, state: st(d.id), open: pk[d.id] ? () => openPkg(d.id) : null, title: pk[d.id]?.one_line || "not a robot-sdk package in this version" }));
    let topKey = null, botKey = null;
    const nU = users.length, nA = agents.length;
    const topLabel = [nU ? `Required by ${nU} package${nU === 1 ? "" : "s"}` : null, nA ? `${nA} agent${nA === 1 ? " builds" : "s build"} on it` : null].filter(Boolean).join(" · ");
    if (top.length) { topKey = box("box-top", topLabel, top, "up"); y += 46; }
    const CW = Math.min(w - 2 * PAD, narrow ? 220 : 230), CH = 50;
    nodes.push({ id: "center", type: "dnode", position: { x: Math.round((w - CW) / 2), y }, draggable: false, data: { id: pkg.id, label: pkg.id, sub: `v${pkg.version} · ${LAYER_LABEL[pkg.layer] || pkg.layer}`, center: true, w: CW, h: CH, state: st(pkg.id) }, style: { width: CW, height: CH } });
    y += CH;
    if (bottom.length) { y += 46; botKey = box("box-bot", `Requires ${deps.length}`, bottom, "down"); }
    const mk = { type: MarkerType.ArrowClosed, color: "#606770", width: 16, height: 16 };
    if (topKey) edges.push({ id: "e-top", source: topKey, sourceHandle: "s", target: "center", targetHandle: "t", type: "straight", markerEnd: mk, style: { stroke: "#606770", strokeWidth: 1.6 }, label: nU ? "requires" : "builds on", labelBgPadding: [6, 2], labelBgBorderRadius: 4 });
    if (botKey) edges.push({ id: "e-bot", source: "center", sourceHandle: "s", target: botKey, targetHandle: "t", type: "straight", markerEnd: mk, style: { stroke: "#606770", strokeWidth: 1.6 }, label: "requires", labelBgPadding: [6, 2], labelBgBorderRadius: 4 });
    return { nodes, edges, height: y + 4 };
  }, [w, graph, health, pkg.id]);
  const none = !users.length && !deps.length && !agents.length;
  if (none) return <p className="d-muted">No robot-sdk package requires {pkg.id}, and it requires none.</p>;
  return (
    <div ref={ref} className="d-deps" style={{ height: lay ? lay.height : 220 }} data-testid="d-deps-graph">
      {lay && <ReactFlow id={"d-deps-" + pkg.id} nodes={lay.nodes} edges={lay.edges} nodeTypes={dgTypes} defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false}
        zoomOnDoubleClick={false} panOnScroll={false} preventScrolling={false} proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => n.data?.open?.()} />}
    </div>
  );
}

// ---- the public API by type (a package's functions) --------------------------------------------------------------------
function ApiList({ graph, pkgId, sourceUrl, sym }) {
  const all = signatures(graph).filter((s) => s.package === pkgId).sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
  const sigs = all.filter((s) => s.inputs.length || s.outputs.length);
  const importsOnly = all.length - sigs.length;
  const [more, setMore] = useState(!!sym);
  const ref = useRef(null);
  useEffect(() => { if (sym) setMore(true); }, [sym]);
  useEffect(() => {
    if (!sym) return;
    const t = setTimeout(() => ref.current?.querySelector(".d-api-row.hit")?.scrollIntoView({ block: "center" }), 160);
    return () => clearTimeout(t);
  }, [sym, pkgId]);
  if (!sigs.length) return <p className="d-muted">No public function of {pkgId} takes or returns a robot-sdk type{importsOnly ? ` (${importsOnly} symbol${importsOnly === 1 ? "" : "s"} import one internally)` : ""}.</p>;
  const LIMIT = 10;
  const shown = more ? sigs : sigs.slice(0, LIMIT);
  const byMod = new Map();
  for (const s of shown) { if (!byMod.has(s.module)) byMod.set(s.module, []); byMod.get(s.module).push(s); }
  return (
    <div className="d-api" ref={ref} data-testid="d-api">
      {[...byMod].map(([mod, list]) => (
        <div key={mod} className="d-api-mod">
          <div className="d-api-modname"><code>{mod}</code></div>
          <ul>{list.map((s) => {
            const url = sourceUrl(s.package, s.where);
            return (
              <li key={s.id} className={"d-api-row" + (sym === s.symbol ? " hit" : "")} data-testid={"d-api-" + s.symbol}>
                <code className="d-api-name">{s.name}</code>
                {!s.public && <span className="k-tag" title="not on the package's public API">internal</span>}
                <span className="d-api-sig"><Signature graph={graph} sig={s} onOpenType={openType} /></span>
                {url ? <a className="d-api-where" href={url} target="_blank" rel="noreferrer" title={s.where}>{s.where.split("/").pop()}</a> : <code className="d-api-where">{s.where}</code>}
              </li>
            );
          })}</ul>
        </div>
      ))}
      {sigs.length > LIMIT && <button className="d-btn" onClick={() => setMore((m) => !m)} data-testid="d-api-more">{more ? "Show fewer" : `Show all ${sigs.length} functions`}</button>}
      {importsOnly > 0 && <p className="d-faint d-small">Plus {importsOnly} symbol{importsOnly === 1 ? "" : "s"} that use a type internally (not on the public API).</p>}
    </div>
  );
}

// ---- pages ------------------------------------------------------------------------------------------------------------
function OverviewPage({ site }) {
  const { graph, health, pick } = site;
  const c = typeCounts(graph);
  const top = [...graph.types].sort((a, b) => (c[b.id]?.total || 0) - (c[a.id]?.total || 0) || a.name.localeCompare(b.name)).slice(0, 6);
  const members = health ? sortedMembers(health) : [];
  const failing = members.filter((m) => m.state === "fail");
  const warnBy = {};
  for (const m of members.filter((x) => x.state === "warn")) for (const ch of health.checks || []) if (m.checks?.[ch.id]?.state === "warn") warnBy[ch.label] = (warnBy[ch.label] || 0) + 1;
  const names = Object.fromEntries((graph.agents || []).map((a) => [a.id, a.name]));
  const sum = healthSummary(health);
  return (
    <div className="d-markdown" data-testid="d-overview">
      <header className="d-hero">
        <div className="d-eyebrow">Robotics backend in plain Python</div>
        <h1 className="d-h1">robot-sdk</h1>
        <p className="d-lead">{PITCH}</p>
        <p className="d-muted d-pitch2">{PITCH_2}</p>
        <div className="d-install" id="install"><Install /><span className="d-muted d-small">{graph.packages.length} packages · {graph.types.length} shared types · {graph.uses.length} type uses, scanned from the code</span></div>
      </header>

      <H2 id="start-from-a-type">Start from a type</H2>
      <p>It is a functional library: packages meet only on <code>robot_msgs</code> types. Open a type to see every function that takes it, where to get one, and whether those packages pass. Or search <span className="d-desk-only">(<kbd>Ctrl</kbd> <kbd>K</kbd>) </span>for <code>JointTrajectory -&gt;</code>.</p>
      <div className="d-cards d-cards-3" data-testid="d-start-types">
        {top.map((t) => {
          const k = typeKeyOf(graph, t), cons = consumersOf(graph, t.id), prod = producersOf(graph, t.id);
          return <DocCard key={t.id} href={hrefOf("types", k)} mono mark="T" title={t.name} desc={<RichText text={t.what} graph={graph} />} descTitle={t.what}
            foot={<><b>{cons.length}</b> take it · <b>{prod.length}</b> return one · <span className="d-faint">{t.module}</span></>} testid={"d-start-" + t.name} />;
        })}
      </div>
      <p className="d-more"><a href={hrefOf("types")}>All {graph.types.length} types →</a></p>

      <H2 id="health">Health right now</H2>
      {health ? <>
        <p className="d-hline"><HealthPill summary={sum} /> <span className="d-muted d-small">{(health.checks || []).map((ch) => ch.label).join(" · ")}, per package and agent · health.json {fmtShortDate(health.generated)}</span></p>
        {failing.length > 0 && <div className="d-table-wrap"><table className="d-table d-fail-table" data-testid="d-overview-failing"><tbody>
          {failing.map((m) => (
            <tr key={m.id}><td className="d-nowrap"><HealthDot state={m.state} /> <a href={m.kind === "agent" ? hrefOf("agents", m.id) : hrefOf("packages", m.id)}>{m.kind === "agent" ? names[m.id] || m.id : <code>{m.id}</code>}</a></td>
              <td>{(health.checks || []).filter((ch) => m.checks?.[ch.id]?.state === "fail").map((ch) => {
                const x = m.checks[ch.id];
                return <span key={ch.id} className="d-failcheck">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{ch.label}: {x.detail}</a> : <>{ch.label}: {x.detail}</>}</span>;
              })}</td></tr>
          ))}
        </tbody></table></div>}
        {Object.keys(warnBy).length > 0 && <p className="d-small d-muted">{members.filter((m) => m.state === "warn").length} more with warnings: {Object.entries(warnBy).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(" · ")}.</p>}
        <p className="d-more"><a href={hrefOf("health")} data-testid="d-overview-health-link">Open the Health board →</a></p>
      </> : <Admonition type="note" title="Health not recorded">{site.healthNote}</Admonition>}

      <H2 id="the-real-run">The real run</H2>
      {pick ? <>
        <p><b>{pick.title}.</b> <span className="k-tag k-tag-warn">simulated plant</span> <span className="d-muted d-small">{pick.plant}</span></p>
        <ol className="d-run" data-testid="d-overview-run">
          {pick.stages.map((st, i) => (
            <li key={i}><div className="d-run-top">{health && <HealthDot state={healthOf(health, st.package)?.state || "unknown"} />}
              {graph.packages.some((p) => p.id === st.package) ? <a href={hrefOf("packages", st.package)}><code>{st.package}</code></a> : <code>{st.package}</code>}
              <span className="d-run-io"><TypeText text={st.input_type} graph={graph} onOpenType={openType} /> → <TypeText text={st.output_type} graph={graph} onOpenType={openType} /></span></div>
              <div className="d-run-res">{st.one_line_result}</div></li>
          ))}
        </ol>
        <figure className="d-fig"><img src={PLOTS[2].src} alt={PLOTS[2].title} /><figcaption><b>{PLOTS[2].title}.</b> {PLOTS[2].caption}</figcaption></figure>
        <p className="d-more"><a href={hrefOf("run")}>The whole run, with plots →</a></p>
      </> : <p className="d-muted">pick_and_place.json is not available.</p>}

      <H2 id="the-layer-rule">The layer rule</H2>
      <Admonition type="info" title="Rule">{LAYER_RULE}</Admonition>
      <div className="d-table-wrap"><table className="d-table" data-testid="d-layers-table">
        <thead><tr><th>Layer</th><th>Packages</th><th>What lives here</th></tr></thead>
        <tbody>{[...layersOf(graph)].reverse().map((l) => (
          <tr key={l}><td className="d-nowrap"><b>{layerTitle(l)}</b></td>
            <td>{graph.packages.filter((p) => p.layer === l).map((p) => <a key={p.id} className="d-pkgchip" href={hrefOf("packages", p.id)}>{health && <HealthDot state={healthOf(health, p.id)?.state || "unknown"} />}<code>{p.id}</code></a>)}</td>
            <td className="d-muted d-small">{LAYER_BLURB[l] || ""}</td></tr>
        ))}</tbody>
      </table></div>

      <H2 id="where-next">Where next</H2>
      <div className="d-cards d-cards-3">
        <DocCard href={hrefOf("types")} mark="T" title="Types" desc={`${graph.types.length} shared types; each page answers what you can do with it.`} testid="d-next-types" />
        <DocCard href={hrefOf("packages")} mark="P" title="Packages" desc={`${graph.packages.length} packages as a layer tree, or a pipeline joined by the types they pass.`} />
        <DocCard href={hrefOf("directory")} mark="D" title="Directory" desc="Every package and agent, one click to GitHub, PyPI, README and Site." />
        <DocCard href={hrefOf("health")} mark="H" title="Health" desc={sum ? healthText(sum) : "Not recorded for this version."} />
        <DocCard href={hrefOf("agents")} mark="A" title="Agents" desc={`${(graph.agents || []).length} agents build on the packages; a package never imports an agent.`} />
        <DocCard href={hrefOf("skill")} mark={">"} title="For coding agents" desc="Hand the SDK to Claude Code or Codex as a skill." />
      </div>
    </div>
  );
}

function TypesIndexPage({ site }) {
  const { graph, health } = site;
  const c = typeCounts(graph);
  const mods = typesByModule(graph);
  return (
    <div className="d-markdown" data-testid="d-types-index">
      <h1 className="d-h1">Types</h1>
      <p className="d-lead">{graph.types.length} types in {mods.length} modules. Packages meet only on these: one returns a type, another takes it as a parameter. Each type's page answers what you can do with it.</p>
      <div className="d-tsearch"><TypeSearch graph={graph} health={health} sourceUrl={site.sourceUrl} onOpenType={openType} onOpenPackage={openPkg} /></div>
      {mods.map(([mod, list]) => (
        <section key={mod}>
          <H2 id={"mod-" + mod}><code className="d-h2code">{mod}</code></H2>
          <div className="d-cards d-cards-3">
            {list.map((t) => {
              const cons = consumersOf(graph, t.id).length, prod = producersOf(graph, t.id).length;
              return <DocCard key={t.id} href={hrefOf("types", typeKeyOf(graph, t))} mono mark="T" title={t.name} desc={<RichText text={t.what} graph={graph} />} descTitle={t.what}
                foot={c[t.id]?.total ? <><b>{cons}</b> take it · <b>{prod}</b> return one · {c[t.id].total} uses</> : <span className="d-faint">no uses in this version</span>} testid={"d-tcard-" + t.name} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TypePage({ site, t }) {
  const { graph, health } = site;
  const rows = graph.uses.filter((u) => u.type === t.id);
  const kinds = { produces: new Set(), consumes: new Set(), imports: new Set() };
  for (const u of rows) kinds[u.kind]?.add(u.package);
  const verified = rows.filter((u) => u.declared && u.verified).length;
  const liveT = site.isLive ? null : resolveType(site.live.graph, t.id) || resolveType(site.live.graph, t.name);
  const liveRows = liveT ? site.live.graph.uses.filter((u) => u.type === liveT.id).length : null;
  const owner = graph.packages.find((p) => p.id === t.package);
  const pkgs = [...new Set(rows.map((u) => u.package))];
  const pk = Object.fromEntries(graph.packages.map((p) => [p.id, p]));
  const byPkg = pkgs.map((p) => ({ id: p, n: { produces: 0, consumes: 0, imports: 0, ...Object.fromEntries(["produces", "consumes", "imports"].map((k) => [k, rows.filter((u) => u.package === p && u.kind === k).length])) } }))
    .sort((a, b) => (sortRank(health, a.id) - sortRank(health, b.id)) || a.id.localeCompare(b.id));
  return (
    <div className="d-markdown" data-testid="d-type-page">
      <div className="d-titlerow"><h1 className="d-h1 mono" data-testid="d-type-title">{t.name}</h1><code className="d-badge">{t.module}</code></div>
      <p className="d-lead"><RichText text={t.what} graph={graph} /></p>
      <p className="d-facts" data-testid="d-type-facts">
        <span><b>{rows.length}</b> uses{vsLive(site, rows.length, liveRows)}</span>
        <span className="k-c-prod"><b>{kinds.produces.size}</b> {kinds.produces.size === 1 ? "package returns" : "packages return"} it</span>
        <span className="k-c-cons"><b>{kinds.consumes.size}</b> {kinds.consumes.size === 1 ? "takes" : "take"} it</span>
        <span className="d-muted"><b>{kinds.imports.size}</b> {kinds.imports.size === 1 ? "imports" : "import"} it</span>
        <span className="d-muted"><b>{verified}</b> of {rows.length} declared + verified</span>
        {owner && <span>defined in <a href={hrefOf("packages", owner.id)}><code>{owner.id}</code></a></span>}
        {t.docs_url && <a href={t.docs_url} target="_blank" rel="noreferrer">robotmsgs.com <Icon.ext /></a>}
      </p>
      <H2 id="what-can-i-do">What can I do with it?</H2>
      <div className="d-ta"><TypeActions graph={graph} typeId={t.id} health={health} sourceUrl={site.sourceUrl} onOpenType={openType} onOpenPackage={openPkg} limit={3} /></div>
      <H2 id="switchboard">Switchboard</H2>
      <p className="d-muted d-small">Round 1's type switchboard: producers on the left, consumers on the right, packages that only import it below; edge numbers are rows. Click a package or a number to list its rows with file:line under the canvas. The docs sidebar is the type list.</p>
      <div className="d-sw"><TypeWorkspace graph={graph} health={health} typeKey={typeKeyOf(graph, t)} onOpenType={openType} onOpenPackage={openPkg} sourceUrl={site.sourceUrl} intro={false} height="auto" /></div>
      <H2 id="package-health">Is each package passing?</H2>
      {health ? <div className="d-table-wrap"><table className="d-table" data-testid="d-type-health">
        <thead><tr><th>Package</th><th>With {t.name}</th><th>Health</th></tr></thead>
        <tbody>{byPkg.map(({ id, n }) => (
          <tr key={id} data-testid={"d-tph-" + id}>
            <td className="d-nowrap"><a href={hrefOf("packages", id)} data-testid={"d-pkglink-" + id}><code>{id}</code></a><div className="d-faint d-small">{LAYER_LABEL[pk[id]?.layer] || ""}</div></td>
            <td className="d-small">{n.produces ? <span className="k-c-prod">returns ×{n.produces} </span> : null}{n.consumes ? <span className="k-c-cons">takes ×{n.consumes} </span> : null}{n.imports ? <span className="d-muted">imports ×{n.imports}</span> : null}</td>
            <td><HealthInline health={health} id={id} max={3} /></td>
          </tr>))}</tbody>
      </table></div> : <Admonition type="note" title="Health not recorded">{site.healthNote}</Admonition>}
    </div>
  );
}
const sortRank = (health, id) => ({ fail: 0, warn: 1, running: 2, unknown: 3, pass: 4 }[healthOf(health, id)?.state] ?? 5);

function PackagePage({ site, p, sym }) {
  const { graph, health } = site;
  const rows = graph.uses.filter((u) => u.package === p.id);
  const liveP = site.isLive ? null : site.live.graph.packages.find((x) => x.id === p.id);
  const liveRows = liveP ? site.live.graph.uses.filter((u) => u.package === p.id).length : null;
  const pin = site.version?.packages?.[p.id];
  const byKind = (k) => {
    const m = new Map();
    for (const u of rows.filter((x) => x.kind === k)) m.set(u.type, (m.get(u.type) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const takes = byKind("consumes"), gives = byKind("produces"), imps = byKind("imports");
  const defines = graph.types.filter((t) => t.package === p.id);
  const agents = (graph.agents || []).filter((a) => (a.builds_on || []).includes(p.id));
  const chips = (list) => <p className="d-chips">{list.map(([id, n]) => <span key={id} className="d-tchip"><TypeLink graph={graph} id={id} /> <span className="d-faint">×{n}</span></span>)}</p>;
  return (
    <div className="d-markdown" data-testid="d-package-page">
      <div className="d-titlerow"><h1 className="d-h1 mono" data-testid="d-pkg-title">{p.id}</h1>
        <span className="d-badge">v{p.version}{liveP && liveP.version !== p.version ? <span className="d-vs"> (Live: v{liveP.version})</span> : null}</span>
        <span className="d-badge d-badge-soft">{layerTitle(p.layer)}</span>{p.role === "viewer" && <span className="k-tag k-tag-viewer">viewer</span>}
        {!site.isLive && pin?.ref && pin.ref !== "main" && <span className="d-badge d-badge-soft" title={`sha ${pin.sha}`}>tag {pin.ref}</span>}</div>
      <p className="d-lead">{p.one_line}</p>
      <div className="d-shieldrow"><Shields health={health} id={p.id} /></div>
      <div className="d-linkrow"><PkgLinks pkg={p} /></div>

      <H2 id="overview">Overview</H2>
      {p.summary ? <p><RichText text={p.summary} graph={graph} /></p> : <p className="d-muted">No summary in its robot-sdk.toml.</p>}
      {p.use_when && <Admonition type="tip" title="Reach for it when"><RichText text={p.use_when} graph={graph} /></Admonition>}
      <div className="d-install"><CopyCode text={`pip install ${p.pypi}`} /><span className="d-muted d-small">or all of them: <code>pip install robot-sdk</code></span></div>

      <H2 id="health">Health</H2>
      <HealthTable health={health} id={p.id} note={site.healthNote} />

      <H2 id="types">Types</H2>
      <p className="d-muted d-small">{rows.length} type uses found in the code{vsLive(site, rows.length, liveRows)} · {rows.filter((u) => u.declared && u.verified).length} declared in robot-sdk.toml and verified.</p>
      {takes.length > 0 && <><H3 id="takes">Takes <span className="d-faint d-h3sub">public parameters</span></H3>{chips(takes)}</>}
      {gives.length > 0 && <><H3 id="returns">Returns <span className="d-faint d-h3sub">public returns</span></H3>{chips(gives)}</>}
      {imps.length > 0 && <><H3 id="imports">Imports <span className="d-faint d-h3sub">used inside, not on the public API</span></H3>{chips(imps)}</>}
      {defines.length > 0 && <><H3 id="defines">Defines <span className="d-faint d-h3sub">{defines.length} shared types</span></H3>
        {typesByModule({ ...graph, types: defines }).map(([mod, list]) => <p key={mod} className="d-chips"><code className="d-modlabel">{mod}</code>{list.map((t) => <TypeLink key={t.id} graph={graph} id={t.id} />)}</p>)}</>}
      {!rows.length && !defines.length && <p className="d-muted">The scanner found no robot-sdk type in {p.id}'s code.</p>}

      <H2 id="api">Functions</H2>
      <p className="d-muted d-small">The public functions that take or return a robot-sdk type, with file:line at {site.isLive ? "main" : <>this version's ref (<code>{site.ref(p.id)}</code>)</>}.</p>
      <ApiList graph={graph} pkgId={p.id} sourceUrl={site.sourceUrl} sym={sym} />

      <H2 id="dependencies">Dependencies</H2>
      <p className="d-muted d-small">From pyproject: robot-sdk packages only. Click a box to open that package.</p>
      <DepsGraph graph={graph} health={health} pkg={p} />
      {agents.length > 0 && <><H2 id="agents">Agents that build on it</H2>
        <p className="d-chips">{agents.map((a) => <a key={a.id} className="d-pkgchip" href={hrefOf("agents", a.id)}>{a.name}</a>)}</p></>}
    </div>
  );
}

function AgentPage({ site, a }) {
  const { graph, health } = site;
  return (
    <div className="d-markdown" data-testid="d-agent-page">
      <div className="d-titlerow"><h1 className="d-h1">{a.name}</h1><span className="d-badge d-badge-agent">agent</span></div>
      <p className="d-lead">{a.one_line || a.objective}</p>
      <div className="d-shieldrow"><Shields health={health} id={a.id} /></div>
      <div className="d-linkrow"><PkgLinks agent={a} /></div>
      <H2 id="objective">Objective</H2>
      <p>{a.objective}</p>
      {a.summary && <p className="d-muted">{a.summary}</p>}
      <Admonition type="info" title="Rule">{AGENT_RULE}</Admonition>
      <H2 id="status">Status</H2>
      <div className="d-agentcard"><AgentCard agent={a} /></div>
      <H2 id="builds-on">Builds on</H2>
      {(a.builds_on || []).length ? <p className="d-chips">{a.builds_on.map((p) => <a key={p} className="d-pkgchip" href={hrefOf("packages", p)}>{health && <HealthDot state={healthOf(health, p)?.state || "unknown"} />}<code>{p}</code></a>)}</p>
        : <p className="d-muted">Nothing yet: its pyproject imports no robot-sdk package.</p>}
      <H2 id="health">Health</H2>
      <HealthTable health={health} id={a.id} note={site.healthNote} />
    </div>
  );
}

// ---- the resolver -----------------------------------------------------------------------------------------------------
const crumb = (label, href) => ({ label, href });

export function resolvePage({ site, route }) {
  const { graph, health } = site;
  const ws = route.ws, arg = route.arg;
  const base = { active: ws, wide: false, toc: [], edit: null, updated: `graph.json generated ${fmtShortDate(graph.generated)}` };
  const pkgToc = (p) => {
    const rows = graph.uses.filter((u) => u.package === p.id);
    const has = (k) => rows.some((u) => u.kind === k);
    return [
      { id: "overview", label: "Overview" }, { id: "health", label: "Health" }, { id: "types", label: "Types" },
      ...(has("consumes") ? [{ id: "takes", label: "Takes", level: 3 }] : []), ...(has("produces") ? [{ id: "returns", label: "Returns", level: 3 }] : []),
      ...(has("imports") ? [{ id: "imports", label: "Imports", level: 3 }] : []), ...(graph.types.some((t) => t.package === p.id) ? [{ id: "defines", label: "Defines", level: 3 }] : []),
      { id: "api", label: "Functions" }, { id: "dependencies", label: "Dependencies" },
      ...((graph.agents || []).some((a) => (a.builds_on || []).includes(p.id)) ? [{ id: "agents", label: "Agents that build on it" }] : []),
    ];
  };
  switch (ws) {
    case "types": {
      if (!arg) return { ...base, key: "types/", kind: "types-index", title: "Types", crumbs: [crumb("Types")],
        toc: typesByModule(graph).map(([m]) => ({ id: "mod-" + m, label: m })), body: <TypesIndexPage site={site} /> };
      const t = resolveType(graph, arg);
      if (!t) return { ...base, key: "types/" + arg, kind: "missing", title: arg, crumbs: [crumb("Types", hrefOf("types")), crumb(arg)], wide: true,
        body: <NotInVersion site={site} kind="type" id={arg} label={arg} /> };
      return { ...base, key: "types/" + typeKeyOf(graph, t), kind: "type", title: t.name,
        crumbs: [crumb("Types", hrefOf("types")), crumb(t.module), crumb(t.name)],
        toc: [{ id: "what-can-i-do", label: "What can I do with it?" }, { sel: ".d-ta .k-ta-h.k-c-cons", key: "takes", label: `Takes a ${t.name}`, level: 3 },
          { sel: ".d-ta .k-ta-h.k-c-prod", key: "get-one", label: "Where to get one", level: 3 }, { id: "switchboard", label: "Switchboard" }, { id: "package-health", label: "Is each package passing?" }],
        edit: graph.packages.find((p) => p.id === t.package) ? { href: graph.packages.find((p) => p.id === t.package).repo_url, label: `Defined in ${t.package} on GitHub` } : null,
        body: <TypePage site={site} t={t} /> };
    }
    case "packages": {
      if (!arg) return { ...base, key: "packages/", kind: "packages", title: "Packages", crumbs: [crumb("Packages")], wide: true,
        body: <div className="d-markdown" data-testid="d-packages-page"><h1 className="d-h1">Packages</h1>
          <p className="d-lead">{graph.packages.length} packages. <b>Tree</b>: package deps from pyproject, layer by layer. <b>Pipeline</b>: packages joined by the types one returns and another takes, robot_msgs hidden as the glue.</p>
          <PackageMap graph={graph} health={health} onOpenPackage={openPkg} onOpenType={openType} maxHeight={760} />
          <p className="d-muted d-small">Click a package to light up its edges, then <b>open ↗</b> for its page.</p></div> };
      const p = graph.packages.find((x) => x.id === arg);
      if (!p) return { ...base, key: "packages/" + arg, kind: "missing", title: arg, crumbs: [crumb("Packages", hrefOf("packages")), crumb(arg)], wide: true,
        body: <NotInVersion site={site} kind="package" id={arg} label={arg} /> };
      const src = graph.sources?.[p.id];
      return { ...base, key: "packages/" + p.id, kind: "package", title: p.id,
        crumbs: [crumb("Packages", hrefOf("packages")), crumb(layerTitle(p.layer)), crumb(p.id)], toc: pkgToc(p),
        edit: p.repo_url && p.declaration ? { href: `${p.repo_url}/blob/${site.ref(p.id)}/${p.declaration}`, label: `Edit this page (${p.declaration})` } : null,
        updated: `graph.json generated ${fmtShortDate(graph.generated)}${src ? ` · scanned ${p.id} @ ${String(src).slice(0, 7)}` : ""}`,
        body: <PackagePage site={site} p={p} sym={route.params.sym} /> };
    }
    case "directory":
      return { ...base, key: "directory/", kind: "directory", title: "Directory", crumbs: [crumb("Directory")], wide: true,
        body: <div className="d-markdown d-hide-kit-title" data-testid="d-directory-page"><h1 className="d-h1">Directory</h1>
          <p className="d-lead">Every package by layer, vocabulary first, and every agent: one click to GitHub, PyPI, README, and Site where the package declares one. The name opens its page here.</p>
          <Directory graph={graph} health={health} onOpenPackage={openPkg} onOpenAgent={openAgent} /></div> };
    case "health":
      return { ...base, key: "health/", kind: "health", title: "Health", crumbs: [crumb("Health")], wide: true,
        body: <div className="d-markdown d-hide-kit-title" data-testid="d-health-page"><h1 className="d-h1">Health</h1>
          <p className="d-lead">{health ? <>{healthText(healthSummary(health))} across {(health.members || []).length} packages and agents. Failing first; click a cell for its evidence (the CI run, the PyPI page, the lint lines), a name for its page.</> : site.healthNote}</p>
          <HealthBoard health={health} graph={graph} note={site.healthNote} onOpenPackage={openPkg} onOpenAgent={openAgent} onBackToLive={() => site.setVersion("live")} />
          {health && <><H2 id="checks">The checks</H2><dl className="d-dl">{(health.checks || []).map((c) => <div key={c.id}><dt>{c.label}</dt><dd>{c.what}</dd></div>)}</dl></>}</div> };
    case "agents": {
      if (!arg) return { ...base, key: "agents/", kind: "agents", title: "Agents", crumbs: [crumb("Agents")], wide: true,
        body: <div className="d-markdown" data-testid="d-agents-page"><h1 className="d-h1">Agents</h1>
          <p className="d-lead">{(graph.agents || []).length} agents search for better building blocks on top of the packages. Each has its own page.</p>
          <AgentsPanel graph={graph} health={health} onOpenPackage={openPkg} />
          <p className="d-chips">{(graph.agents || []).map((a) => <a key={a.id} className="d-pkgchip" href={hrefOf("agents", a.id)}>{a.name} →</a>)}</p></div> };
      const a = (graph.agents || []).find((x) => x.id === arg);
      if (!a) return { ...base, key: "agents/" + arg, kind: "missing", title: arg, crumbs: [crumb("Agents", hrefOf("agents")), crumb(arg)], wide: true,
        body: <NotInVersion site={site} kind="agent" id={arg} label={arg} /> };
      return { ...base, key: "agents/" + a.id, kind: "agent", title: a.name, crumbs: [crumb("Agents", hrefOf("agents")), crumb(a.name)],
        toc: [{ id: "objective", label: "Objective" }, { id: "status", label: "Status" }, { id: "builds-on", label: "Builds on" }, { id: "health", label: "Health" }],
        edit: a.repo_url ? { href: `${a.repo_url}/blob/main/${a.declaration || "robot-sdk.toml"}`, label: `Edit this page (${a.declaration || "robot-sdk.toml"})` } : null,
        body: <AgentPage site={site} a={a} /> };
    }
    case "run":
      return { ...base, key: "run/", kind: "run", title: "Pick and place run", crumbs: [crumb("Pick and place run")], wide: true,
        body: <div className="d-markdown d-hide-kit-title" data-testid="d-run-page"><h1 className="d-h1">{site.pick?.title || "Pick and place run"}</h1>
          <p className="d-lead">Six calls into five packages; what passes between them is a robot_msgs type. Every type below links to its page.</p>
          <RunPanel pick={site.pick} graph={graph} health={health} onOpenType={openType} onOpenPackage={openPkg} /></div> };
    case "skill":
      return { ...base, key: "skill/", kind: "skill", title: "For coding agents", crumbs: [crumb("For coding agents")], wide: true,
        edit: { href: `${REPO_URL}/blob/main/skill/SKILL.md`, label: "Edit this page (skill/SKILL.md)" },
        body: <div className="d-markdown" data-testid="d-skill-page"><h1 className="d-h1">For coding agents</h1><SkillPanel /></div> };
    case "overview":
      return { ...base, key: "overview/", kind: "overview", active: null, title: "Overview", crumbs: [],
        toc: [{ id: "start-from-a-type", label: "Start from a type" }, { id: "health", label: "Health right now" },
          { id: "the-real-run", label: "The real run" }, { id: "the-layer-rule", label: "The layer rule" }, { id: "where-next", label: "Where next" }],
        edit: { href: `${REPO_URL}/blob/main/README.md`, label: "Edit this page (README.md)" },
        body: <OverviewPage site={site} /> };
    default:
      return { ...base, key: "404/", kind: "missing", active: null, title: "Page Not Found", crumbs: [], wide: true,
        body: <div className="d-markdown"><h1 className="d-h1">Page Not Found</h1><p>No page called <code>{ws}</code>. <a href={hrefOf("overview")}>Back to the overview</a>.</p></div> };
  }
}
export { PAGE_LABEL };
