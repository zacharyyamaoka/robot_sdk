// V9 Buildfarm: the Health matrix, the home screen. Rows = packages grouped by layer (then agents), column group 1 =
// the checks of the focused version, column group 2 = "Across versions": each package's version string and type-use
// count at Live | Latest release | the newest snapshot (plus the focused one when it is an older snapshot), so what
// passes and what changed between versions is one glance.
// WHY a build-farm grid (status.ros.org: repositories × distros; CI dashboards: jobs × checks): Zach, 2026-11-24 —
// "I really like the health view super duper important … you want to be able to see like what is passing or not",
// and versions "just like ros has the different pinned versions … first class". Versions as columns side by side is
// how the ROS build farm shows one package across distros.
// Real data only: health.json / versions/release/health.json for checks, each version's graph.json for versions and
// type uses. Snapshots record no health: their cells say so and never borrow Live's.
import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  HealthDot, shortCheck, healthOf, HEALTH_LABEL, HEALTH_RANK, LAYER_LABEL, LAYER_BLURB, LAYER_ORDER,
  usesOfPackageCounts, diffGraphs, diffText, VersionDiff, dataBase, fmtShortDate, navigate, BranchIcon,
} from "@kit";

// ---- other versions' documents (graph + health), fetched once per page --------------------------------------------
// WHY our own small store and not useSite(): useSite() loads only the version on screen; the matrix needs Latest release
// and the newest snapshot side by side with it. Same files, same data folder (dataBase()), fetched on demand.
let VS = {};
const vlisteners = new Set();
const vsub = (l) => { vlisteners.add(l); return () => vlisteners.delete(l); };
const vget = () => VS;
function vset(id, v) { VS = { ...VS, [id]: v }; for (const l of vlisteners) l(); }
async function fetchJson(url) {
  const r = await fetch(new URL(url, location.href), { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
function loadVersion(entry) {
  if (VS[entry.id]) return;
  vset(entry.id, { status: "loading" });
  (async () => {
    try {
      const base = dataBase();
      const graph = await fetchJson(base + entry.graph);
      if (!String(graph?.schema || "").startsWith("robot-sdk-graph/")) throw new Error("not robot-sdk-graph");
      let health = null;
      if (entry.health) {
        try { const h = await fetchJson(base + entry.health); if (String(h?.schema || "").startsWith("robot-sdk-health/")) health = h; }
        catch (e) { console.warn(`[v9] ${entry.id} health:`, e.message); }
      }
      vset(entry.id, { status: "ok", graph, health });
    } catch (e) {
      console.warn(`[v9] ${entry.id}:`, e.message);
      vset(entry.id, { status: "error", error: e.message });
    }
  })();
}

// The version columns: Live | Latest release | newest snapshot, plus the focused version when it is none of those.
export function versionColumns(site) {
  const vs = site.versions || [];
  const live = vs.find((v) => v.kind === "live" || v.id === "live");
  const rel = vs.find((v) => v.kind === "release");
  const snap = vs.find((v) => v.kind === "snapshot");
  const cols = [live, rel, snap].filter(Boolean);
  const focus = vs.find((v) => v.id === site.versionId);
  if (focus && !cols.some((c) => c.id === focus.id)) cols.push(focus);
  return cols;
}

// docs per column id: { status: ok | loading | na | error, graph, health }
export function useVersionDocs(site, cols) {
  const map = useSyncExternalStore(vsub, vget, vget);
  const key = cols.map((c) => c.id + ":" + c.available).join(",");
  useEffect(() => {
    if (!site.ready || !site.http) return;
    for (const c of cols) if (c.kind !== "live" && c.id !== "live" && c.available && c.graph && c.id !== site.versionId) loadVersion(c);
  }, [key, site.ready, site.http, site.versionId]);
  return useMemo(() => Object.fromEntries(cols.map((c) => {
    if (c.kind === "live" || c.id === "live") return [c.id, { status: "ok", graph: site.live.graph, health: site.live.health }];
    if (c.id === site.versionId) return [c.id, { status: "ok", graph: site.graph, health: site.health }];
    if (!c.available) return [c.id, { status: "na", error: c.reason }];
    return [c.id, map[c.id] || { status: "loading" }];
  })), [map, key, site]);
}

// One package's (or agent's) presence, version and type uses in one version.
export function memberAt(doc, col, id, kind) {
  if (!doc || doc.status !== "ok") {
    // WHY: versions.json names each package's version per version, and it is embedded at build; so the version string
    // shows even before (or without, from file://) that version's graph. Type uses wait for the graph.
    if (kind === "package" && col.packages) {
      const e = col.packages[id];
      return { status: "ok", partial: true, present: !!e, version: e?.version ?? null, uses: null, health: null, recorded: false, tag: e, why: doc?.error || (doc?.status === "loading" ? "loading its graph" : null) };
    }
    return { status: doc?.status || "loading", error: doc?.error };
  }
  const g = doc.graph;
  if (kind === "agent") {
    const a = (g.agents || []).find((x) => x.id === id);
    return { status: "ok", present: !!a, label: a ? `on ${(a.builds_on || []).length}` : null, builds: a ? (a.builds_on || []).slice().sort().join(",") : null, health: doc.health ? healthOf(doc.health, id) : null, recorded: !!doc.health };
  }
  const p = g.packages.find((x) => x.id === id);
  const uses = p ? usesOfPackageCounts(g)[id]?.total || 0 : null;
  return { status: "ok", present: !!p, version: p?.version ?? null, uses, health: doc.health ? healthOf(doc.health, id) : null, recorded: !!doc.health,
    tag: col.packages ? col.packages[id] : undefined };
}

export function differsFromLive(at, live) {
  if (at.status !== "ok" || live.status !== "ok") return false;
  if (at.present !== live.present) return true;
  if (!at.present) return false;
  if (at.partial) return at.version !== live.version;
  return at.version !== live.version || at.uses !== live.uses || at.builds !== live.builds;
}

function absentWord(col) {
  return col.kind === "release" ? "not tagged" : col.kind === "snapshot" ? "not in snapshot" : "absent";
}
export function colSub(col, doc) {
  if (col.kind === "live" || col.id === "live") return `${col.ref || "main"} · hourly`;
  if (col.kind === "release") {
    const pk = col.packages || {};
    const n = Object.values(pk).filter(Boolean).length;
    return `${n} of ${Object.keys(pk).length} tagged`;
  }
  return `snapshot · ${String(col.built_from || col.id).slice(0, 7)}`;
}

// ---- the hover card ------------------------------------------------------------------------------------------------
function HoverCard({ hover }) {
  if (!hover) return null;
  const { rect, body } = hover;
  const w = Math.min(340, window.innerWidth - 16);
  let left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
  const below = rect.bottom + 8;
  const top = below + 170 > window.innerHeight ? Math.max(8, rect.top - 8) : below;
  const style = { left, width: w, top, transform: top < rect.top ? "translateY(-100%)" : undefined };
  return createPortal(<div className="v9-hover" style={style} role="tooltip" data-testid="v9-hover">{body}</div>, document.body);
}

function CheckHoverBody({ member, check, c, versionLabel }) {
  const hasFails = (c.failures || []).length > 0;
  return (
    <>
      <div className="v9-hover-h"><HealthDot state={c.state} /><b>{check.label}</b><span className="k-faint">· {member}</span><span className="k-grow" /><span className={"v9-st v9-st-" + c.state}>{HEALTH_LABEL[c.state] || c.state}</span></div>
      <div className="v9-hover-what">{check.what}</div>
      <div className="v9-hover-detail">{c.detail || HEALTH_LABEL[c.state]}</div>
      {(c.workflow || c.sha || c.at || c.pinned) && <div className="v9-hover-meta">
        {c.workflow && <span>workflow <code>{c.workflow}</code></span>}{c.sha && <span>at <code>{c.sha}</code></span>}{c.at && <span>{fmtShortDate(c.at)}</span>}{c.pinned && <span>pinned <code>{c.pinned}</code></span>}{c.pypi_latest && <span>PyPI {c.pypi_latest}</span>}
      </div>}
      <div className="v9-hover-act">{c.url && !hasFails ? `Click: open the evidence ↗ (${new URL(c.url).hostname})` : "Click: show the detail row"} · {versionLabel}</div>
    </>
  );
}

// ---- the matrix ----------------------------------------------------------------------------------------------------
const CHECK_SHORT = { tests: "Test", lint: "Decl", types: "Type", release: "Rel", upstream: "Repo" };

// Props: site (useSite), filter ("all"|"fail"|"warn"), onFilter, grouped, onGrouped, onOpenPackage(id, versionId?),
// onOpenAgent(id).
export function HealthMatrix({ site, filter, onFilter, grouped, onGrouped, onOpenPackage, onOpenAgent }) {
  const cols = versionColumns(site);
  const docs = useVersionDocs(site, cols);
  const [hover, setHover] = useState(null);
  const [openCell, setOpenCell] = useState(null);
  const health = site.health, graph = site.graph, live = site.live.graph;
  const focus = site.version;
  const checks = health?.checks || site.live.health?.checks || [];

  // every member any column knows, in Live's graph order, then the focused version's, then the other columns'
  const rows = useMemo(() => {
    const out = [], seen = new Set();
    const addP = (p) => { if (!seen.has("p:" + p.id)) { seen.add("p:" + p.id); out.push({ id: p.id, kind: "package", layer: p.layer, i: out.length }); } };
    const addA = (a) => { if (!seen.has("a:" + a.id)) { seen.add("a:" + a.id); out.push({ id: a.id, kind: "agent", layer: "agents", name: a.name, i: out.length }); } };
    const gs = [live, graph, ...cols.map((c) => docs[c.id]?.graph)].filter(Boolean);
    for (const g of gs) g.packages.forEach(addP);
    for (const g of gs) (g.agents || []).forEach(addA);
    return out;
  }, [live, graph, docs]);

  const inFocus = (r) => r.kind === "agent" ? (graph.agents || []).some((a) => a.id === r.id) : graph.packages.some((p) => p.id === r.id);
  const stateOf = (r) => (health && inFocus(r) ? healthOf(health, r.id)?.state : null);
  const rank = (r) => { const s = stateOf(r); return s ? HEALTH_RANK[s] ?? 9 : 9; };
  const keep = (r) => filter === "all" || !health || stateOf(r) === filter;
  const sortFailFirst = (list) => [...list].sort((a, b) => rank(a) - rank(b) || a.i - b.i);

  const groups = useMemo(() => {
    const pk = rows.filter((r) => r.kind === "package"), ag = rows.filter((r) => r.kind === "agent");
    const out = [];
    if (grouped) {
      const layers = [...LAYER_ORDER.filter((l) => pk.some((r) => r.layer === l)), ...[...new Set(pk.map((r) => r.layer))].filter((l) => !LAYER_ORDER.includes(l))];
      for (const l of layers) out.push({ key: l, label: LAYER_LABEL[l] || l, blurb: LAYER_BLURB[l], all: pk.filter((r) => r.layer === l) });
    } else out.push({ key: "packages", label: "Packages", blurb: "every package, failing first", all: pk });
    if (ag.length) out.push({ key: "agents", label: "agents", blurb: "An agent imports packages; a package never imports an agent.", all: ag });
    return out.map((g) => ({ ...g, list: sortFailFirst(g.all).filter(keep) })).filter((g) => g.list.length);
  }, [rows, grouped, filter, health, graph]);

  const counts = useMemo(() => {
    const c = { fail: 0, warn: 0, pass: 0, unknown: 0, running: 0, all: 0 };
    for (const r of rows) { if (!inFocus(r)) continue; const s = stateOf(r); c.all++; if (s) c[s] = (c[s] || 0) + 1; }
    return c;
  }, [rows, health, graph]);

  const liveCol = cols.find((c) => c.kind === "live" || c.id === "live");
  const nCols = 1 + checks.length + cols.length;
  const memberName = (r) => r.kind === "agent" ? (r.name || r.id) : r.id;
  const openMember = (r, v) => r.kind === "agent" ? onOpenAgent?.(r.id) : onOpenPackage?.(r.id, v);
  const hoverOn = (e, body) => setHover({ rect: e.currentTarget.getBoundingClientRect(), body });
  const hoverOff = () => setHover(null);
  useEffect(() => { setOpenCell(null); setHover(null); }, [site.versionId]);

  const groupCounts = (g) => {
    const c = { fail: 0, warn: 0 };
    for (const r of g.all) { const s = stateOf(r); if (s === "fail" || s === "warn") c[s]++; }
    return c;
  };

  // per-check totals for the focused version
  const checkTotals = (ck) => {
    const t = { fail: 0, warn: 0, unknown: 0, pass: 0 };
    for (const m of health?.members || []) { const s = m.checks?.[ck.id]?.state; if (s in t) t[s]++; }
    return t;
  };

  return (
    <section className="v9-hm" data-testid="health-matrix">
      <div className="v9-hm-bar">
        <div className="v9-chips" role="group" aria-label="Filter">
          {[["fail", "Failing", counts.fail], ["warn", "Warnings", counts.warn], ["all", "All", counts.all]].map(([id, lab, n]) => (
            <button key={id} className={"v9-chip v9-chip-" + id + (filter === id ? " on" : "")} aria-pressed={filter === id} onClick={() => onFilter(id)} disabled={!health && id !== "all"} data-testid={"hm-filter-" + id}>
              {id !== "all" && <HealthDot state={id} />}{lab}<span className="v9-chip-n">{health || id === "all" ? n : "–"}</span>
            </button>
          ))}
        </div>
        <label className="k-check"><input type="checkbox" checked={grouped} onChange={(e) => onGrouped(e.target.checked)} data-testid="hm-group-by-layer" /> group by layer</label>
        <span className="v9-hm-sort k-faint">sorted failing first{grouped ? " within each layer" : ""}</span>
        <span className="k-grow" />
        <span className="v9-legend">
          <span><HealthDot state="fail" /> fail</span><span><HealthDot state="warn" /> warn</span><span><HealthDot state="pass" /> pass</span>
          <span><HealthDot state="unknown" /> unknown</span><span><HealthDot state="none" /> n/a</span><span><i className="v9-sw-diff" /> differs from Live</span>
        </span>
      </div>

      <div className="v9-hm-scroll">
        <table className={"v9-hm-table" + (cols.length > 3 ? " v9-4v" : "") + (health ? "" : " v9-nohealth")}>
          <colgroup><col className="v9-col-name" />{checks.map((c) => <col key={c.id} className="v9-col-check" />)}{cols.map((c) => <col key={c.id} className={"v9-col-ver" + (c.id === site.versionId ? " v9-col-focus" : "")} />)}</colgroup>
          <thead>
            <tr className="v9-hm-g">
              <th rowSpan={3} className="v9-hm-name v9-hm-corner">member</th>
              <th colSpan={checks.length} className="v9-hm-gchecks" data-testid="hm-checks-head">
                Checks <span className="v9-at">@ <BranchIcon size={11} /> {focus?.label}</span>
                {health ? <span className="k-faint v9-gen"> · {health === site.live.health ? "health.json" : "health"} {fmtShortDate(health.generated)}</span> : <span className="v9-gen v9-norec"> · not recorded for this version</span>}
              </th>
              <th colSpan={cols.length} className="v9-hm-gvers">Across versions <span className="k-faint v9-gen">· version · type uses</span></th>
            </tr>
            <tr className="v9-hm-h">
              {checks.map((c) => <th key={c.id} className="v9-hm-ch" title={`${c.label}: ${c.what}`}><span className="v9-long">{c.label}</span><span className="v9-short">{CHECK_SHORT[c.id] || c.label.slice(0, 4)}</span></th>)}
              {cols.map((c) => (
                <th key={c.id} className={"v9-hm-vh" + (c.id === site.versionId ? " v9-focus" : "")} data-testid={"hm-vcol-" + c.id}>
                  <button className="v9-vh-btn" onClick={() => site.setVersion(c.id)} disabled={!c.available} title={c.available ? `Focus ${c.label}: every workspace shows it` : c.reason} aria-pressed={c.id === site.versionId}>
                    <span className="v9-vh-label">{c.id === site.versionId && <span className="v9-focus-dot" aria-hidden />}{c.label}</span>
                    <span className="v9-vh-sub">{colSub(c, docs[c.id])}</span>
                  </button>
                </th>
              ))}
            </tr>
            <tr className="v9-hm-t">
              {checks.map((ck) => {
                if (!health) return <td key={ck.id} className="v9-tot k-faint">–</td>;
                const t = checkTotals(ck);
                return <td key={ck.id} className="v9-tot">{t.fail ? <span className="v9-tf"><HealthDot state="fail" />{t.fail}</span> : null}{t.warn ? <span className="v9-tw"><HealthDot state="warn" />{t.warn}</span> : null}{t.unknown ? <span><HealthDot state="unknown" />{t.unknown}</span> : null}{!t.fail && !t.warn && !t.unknown ? <span className="v9-tp"><HealthDot state="pass" />{t.pass}</span> : null}</td>;
              })}
              {cols.map((c) => {
                const d = docs[c.id];
                return <td key={c.id} className={"v9-tot v9-tot-v" + (c.id === site.versionId ? " v9-focus" : "")}>
                  {d.status === "ok" ? <>{d.graph.packages.length} pkgs · {d.graph.uses.length} uses</> : d.status === "loading" ? <span className="k-faint">loading…</span> : <span className="k-faint" title={d.error}>not loaded</span>}
                </td>;
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const gc = groupCounts(g);
              return (
                <Fragment key={g.key}>
                  <tr className="v9-hm-grp" data-testid={"hm-group-" + g.key}>
                    <td colSpan={nCols}><div className="v9-grp-in">
                      <span className="v9-grp-l">{g.label}</span><span className="v9-grp-n">{g.all.length}</span>
                      {gc.fail > 0 && <span className="v9-grp-c v9-c-fail"><HealthDot state="fail" />{gc.fail}</span>}
                      {gc.warn > 0 && <span className="v9-grp-c v9-c-warn"><HealthDot state="warn" />{gc.warn}</span>}
                      {g.blurb && <span className="v9-grp-b">{g.blurb}</span>}
                    </div></td>
                  </tr>
                  {g.list.map((r) => {
                    const st = stateOf(r);
                    const m = health && inFocus(r) ? healthOf(health, r.id) : null;
                    const liveAt = memberAt(docs[liveCol.id], liveCol, r.id, r.kind);
                    const open = openCell?.startsWith(r.id + "|") ? checks.find((c) => openCell === r.id + "|" + c.id) : null;
                    return (
                      <Fragment key={r.kind + r.id}>
                        <tr className={"v9-hm-row" + (st ? " v9-r-" + st : "")} data-testid={"hm-row-" + r.id}>
                          <th scope="row" className="v9-hm-name">
                            <div className="v9-name-in">
                              <HealthDot state={st || (health ? "none" : "unknown")} title={st ? HEALTH_LABEL[st] : "no health for this version"} />
                              <button className="v9-member" onClick={() => openMember(r)} title={`open ${memberName(r)}`} data-testid={"hm-open-" + r.id}>
                                {r.kind === "agent" ? <span className="v9-agent-name">{memberName(r)}</span> : <code>{r.id}</code>}
                              </button>
                              {!grouped && r.kind === "package" && <span className="v9-layer-tag">{LAYER_LABEL[r.layer] || r.layer}</span>}
                            </div>
                          </th>
                          {!inFocus(r) ? (
                            <td colSpan={checks.length} className="v9-hm-absent" data-testid={"hm-absent-" + r.id}>
                              {focus?.kind === "release" ? <>not in {focus.label} <span className="k-faint">· no v* tag yet</span></> : <>not in {focus?.label}</>}
                            </td>
                          ) : !health ? (
                            <td colSpan={checks.length} className="v9-hm-absent v9-norec-cell">not recorded for {focus?.label}</td>
                          ) : checks.map((ck) => {
                            const c = m?.checks?.[ck.id];
                            if (!c) return <td key={ck.id} className="v9-hc v9-hc-none"><span className="k-faint">—</span></td>;
                            const hasFails = (c.failures || []).length > 0;
                            const tid = `hm-cell-${r.id}-${ck.id}`;
                            const inner = <><HealthDot state={c.state} /><span className="v9-hc-txt">{shortCheck(ck.id, c)}</span></>;
                            const isOpen = openCell === r.id + "|" + ck.id;
                            const hv = { onMouseEnter: (e) => hoverOn(e, <CheckHoverBody member={memberName(r)} check={ck} c={c} versionLabel={focus?.label} />), onMouseLeave: hoverOff };
                            const label = `${ck.label}: ${c.detail || HEALTH_LABEL[c.state]}`;
                            return (
                              <td key={ck.id} className={"v9-hc v9-hc-" + c.state + (isOpen ? " v9-open" : "")}>
                                {c.url && !hasFails
                                  ? <a className="v9-hc-btn" href={c.url} target="_blank" rel="noreferrer" aria-label={label} data-testid={tid} {...hv}>{inner}</a>
                                  : <button className="v9-hc-btn" onClick={() => setOpenCell(isOpen ? null : r.id + "|" + ck.id)} aria-expanded={isOpen} aria-label={label} data-testid={tid} {...hv}>{inner}</button>}
                              </td>
                            );
                          })}
                          {cols.map((col) => {
                            const at = memberAt(docs[col.id], col, r.id, r.kind);
                            const diff = col.id !== liveCol.id && differsFromLive(at, liveAt);
                            const focusCls = col.id === site.versionId ? " v9-focus" : "";
                            if (at.status !== "ok") return <td key={col.id} className={"v9-vc v9-vc-wait" + focusCls} title={at.error || "loading"}><span className="k-faint">{at.status === "loading" ? "…" : "–"}</span></td>;
                            const hst = at.health?.state;
                            const body = (
                              <>
                                <div className="v9-hover-h"><BranchIcon size={12} /><b>{col.label}</b><span className="k-faint">· {memberName(r)}</span>{diff && <><span className="k-grow" /><span className="v9-st v9-st-diff">differs from Live</span></>}</div>
                                {at.present ? <div className="v9-hover-detail">{r.kind === "agent" ? `builds on ${at.builds.replaceAll(",", ", ") || "nothing"}` : `version ${at.version} · ${at.uses == null ? `type uses not loaded${at.why ? " (" + at.why + ")" : ""}` : at.uses + " type uses"}`}{at.tag?.ref ? ` · ref ${at.tag.ref}` : ""}</div>
                                  : <div className="v9-hover-detail">{absentWord(col)}{col.kind === "release" ? ": no v* tag yet" : ""}</div>}
                                {col.id !== liveCol.id && liveAt.status === "ok" && <div className="v9-hover-meta"><span>Live: {liveAt.present ? (r.kind === "agent" ? `builds on ${liveAt.builds.replaceAll(",", ", ")}` : `${liveAt.version} · ${liveAt.uses} uses`) : "absent"}</span></div>}
                                <div className="v9-hover-meta"><span>health {at.recorded ? (hst ? HEALTH_LABEL[hst] : "no row") : "not recorded for this version"}</span></div>
                                <div className="v9-hover-act">{at.present ? `Click: open ${memberName(r)} at ${col.label}` : ""}</div>
                              </>
                            );
                            return (
                              <td key={col.id} className={"v9-vc" + focusCls + (diff ? " v9-diff" : "") + (at.present ? "" : " v9-vc-absent")} data-testid={`hm-ver-${r.id}-${col.id}`}
                                onMouseEnter={(e) => hoverOn(e, body)} onMouseLeave={hoverOff}>
                                {at.present ? (
                                  <button className="v9-vc-btn" onClick={() => openMember(r, col.id)} aria-label={`${memberName(r)} at ${col.label}`}>
                                    {at.recorded ? <HealthDot state={hst || "none"} /> : <span className="v9-dot-nr" aria-hidden />}
                                    {r.kind === "agent" ? <span className="v9-vc-v v9-sans">{at.label}</span> : <span className="v9-vc-v">{at.version}</span>}
                                    {r.kind !== "agent" && (at.uses == null ? <span className="v9-vc-u k-faint">–</span> : <span className="v9-vc-u">{at.uses} <span className="v9-uw">uses</span></span>)}
                                  </button>
                                ) : <span className="v9-vc-none">{absentWord(col)}</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {open && (
                          <tr className="v9-hm-x"><td colSpan={nCols}>
                            <div className="v9-x" data-testid={`hm-detail-${r.id}-${open.id}`}>
                              <div><HealthDot state={m.checks[open.id].state} /> <b>{open.label}</b> <span className="k-muted">· {open.what}</span></div>
                              <div className="v9-x-detail">{m.checks[open.id].detail}</div>
                              {(m.checks[open.id].failures || []).length > 0 && <ul className="v9-x-fails">{m.checks[open.id].failures.map((f, i) => <li key={i}><code>{typeof f === "string" ? f : JSON.stringify(f)}</code></li>)}</ul>}
                              {m.checks[open.id].url && <a href={m.checks[open.id].url} target="_blank" rel="noreferrer">Open the evidence ↗</a>}
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            {!groups.length && <tr><td colSpan={nCols} className="k-muted v9-empty">Nothing {filter === "fail" ? "failing" : "with a warning"} at {focus?.label}.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="v9-swipe k-faint">Swipe the table sideways for the versions →</p>
      <HoverCard hover={hover} />
    </section>
  );
}

// "What differs from Live", one line per version column, each expandable to the kit's VersionDiff.
export function AcrossVersions({ site, onOpenPackage, onOpenType }) {
  const cols = versionColumns(site);
  const docs = useVersionDocs(site, cols);
  const [open, setOpen] = useState(null);
  const others = cols.filter((c) => !(c.kind === "live" || c.id === "live"));
  return (
    <section className="v9-av" data-testid="across-versions">
      <h3>What differs from Live</h3>
      <div className="v9-av-list">
        {others.map((c) => {
          const d = docs[c.id];
          const diff = d.status === "ok" ? diffGraphs(site.live.graph, d.graph) : null;
          const isOpen = open === c.id;
          return (
            <div key={c.id} className={"v9-av-row" + (c.id === site.versionId ? " v9-focus" : "")} data-testid={"av-" + c.id}>
              <div className="v9-av-main">
                <button className="v9-av-label" onClick={() => site.setVersion(c.id)} disabled={!c.available} title={c.available ? "focus this version" : c.reason}><BranchIcon size={12} /> {c.label}</button>
                <span className="v9-av-sum">{c.summary}</span>
                <span className="k-grow" />
                {d.status === "ok" ? <span className="v9-av-diff">{diff ? diffText(diff) : "same as Live"}</span> : <span className="k-faint">{d.status === "loading" ? "loading…" : c.reason || d.error || "not loaded"}</span>}
                {diff && !diff.same && <button className="k-btn k-btn-ghost" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} data-testid={"av-toggle-" + c.id}>{isOpen ? "Hide" : "What differs?"}</button>}
              </div>
              {isOpen && diff && <VersionDiff diff={diff} onOpenPackage={(id) => onOpenPackage(id, c.id)} onOpenType={onOpenType} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { navigate };
