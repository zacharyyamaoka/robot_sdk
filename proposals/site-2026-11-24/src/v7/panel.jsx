// The bottom panel: PROBLEMS (VS Code's Problems list over health.json) and OUTPUT (where each data file came from).
// WHY a Problems list beside the Health board: Zach wants health "super duper important … first class"; in a workbench
// that is the panel you toggle with one keystroke (Ctrl+J) from any workspace, filterable to the current selection.
import { useMemo, useState } from "react";
import { fmtShortDate, LAYER_LABEL } from "@kit";
import { Icon, Sev } from "./icons.jsx";
import { problemsOf, problemCounts, groupProblems, evidenceLabel } from "./lens.js";

function Problems({ site, lens, sel, onOpenMember, filterSel, setFilterSel }) {
  const { health, graph } = site;
  const rows = useMemo(() => problemsOf(health), [health]);
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState(() => new Set());
  if (!health) {
    return (
      <div className="v7-prob-empty" data-testid="problems-none">
        <Icon name="info" /> {site.healthNote || "No health recorded for this version."} The site never shows Live's checks under another version.
        <button className="v7-link" onClick={() => site.setVersion("live")}>Back to Live</button>
      </div>
    );
  }
  const ql = q.trim().toLowerCase();
  const selPkgs = filterSel && sel && !sel.missing ? new Set(sel.kind === "type" ? [...lens.pkgs] : [sel.id]) : null;
  const shown = rows.filter((r) => (!ql || `${r.member} ${r.check.label} ${r.detail}`.toLowerCase().includes(ql)) && (!selPkgs || selPkgs.has(r.member)));
  const groups = groupProblems(shown);
  const pk = Object.fromEntries(graph.packages.map((p) => [p.id, p]));
  const names = Object.fromEntries((graph.agents || []).map((a) => [a.id, a.name]));
  return (
    <div className="v7-problems" data-testid="problems-list">
      <div className="v7-prob-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter (e.g. tests, robot_reach, PyPI)" aria-label="Filter problems" data-testid="problems-filter" />
        <button className={"v7-ibtn" + (filterSel ? " v7-on" : "")} onClick={() => setFilterSel(!filterSel)} aria-pressed={filterSel} disabled={!sel}
          title={sel ? `Show only ${sel.kind === "type" ? `the packages that touch ${sel.label}` : sel.label}` : "Select a type or package first"} data-testid="problems-selonly">
          <Icon name="filter" /></button>
        <button className="v7-ibtn" onClick={() => setClosed(new Set(groups.map(([id]) => id)))} title="Collapse All" aria-label="Collapse all"><Icon name="collapseAll" /></button>
        {selPkgs && <span className="v7-prob-scope">only {sel.kind === "type" ? <>packages touching <b>{sel.label}</b></> : <b>{sel.label}</b>} · <button className="v7-link" onClick={() => setFilterSel(false)}>show all</button></span>}
      </div>
      <div className="v7-prob-list" role="tree">
        {groups.map(([id, list]) => {
          const open = !closed.has(id);
          const isAgent = list[0].kind === "agent";
          const p = pk[id];
          const n = problemCounts(list);
          return (
            <div key={id} className="v7-prob-group" data-testid={"problem-group-" + id}>
              <div className={"v7-prob-head" + (sel?.id === id ? " v7-sel" : "")} onClick={() => { const s = new Set(closed); open ? s.add(id) : s.delete(id); setClosed(s); }} role="treeitem" aria-expanded={open}>
                <Icon name={open ? "chevronDown" : "chevronRight"} />
                <Icon name={isAgent ? "robot" : "package"} className={isAgent ? "v7-ico-agent" : "v7-ico-pkg"} />
                <button className="v7-prob-member" onClick={(e) => { e.stopPropagation(); onOpenMember(id, isAgent); }} title={`open ${isAgent ? names[id] || id : id}`}>{isAgent ? names[id] || id : id}</button>
                <span className="v7-faint">{isAgent ? "agent" : `${LAYER_LABEL[p?.layer] || p?.layer || ""}${p ? " · v" + p.version : ""}`}</span>
                <span className="v7-prob-n">{n.fail ? <span className="v7-cnt-err">{n.fail}</span> : null}{n.warn ? <span className="v7-cnt-warn">{n.warn}</span> : null}{n.info ? <span className="v7-cnt-info">{n.info}</span> : null}</span>
              </div>
              {open && list.map((r) => {
                const ev = evidenceLabel(r.check.id, r.url);
                return (
                  <div key={r.check.id} className={"v7-prob-row v7-st-" + r.state} role="treeitem" onClick={() => onOpenMember(id, isAgent)} title={`${r.check.label}: ${r.check.what}`}
                    data-testid={`problem-${id}-${r.check.id}`}>
                    <Sev s={r.state} />
                    <span className="v7-prob-msg"><b>{r.check.label}</b>: {r.detail}{r.failures.length ? <span className="v7-faint"> · {r.failures.length} lint lines</span> : null}</span>
                    <span className="v7-prob-src">robot-sdk health <span className="v7-faint">({r.check.id})</span></span>
                    {r.url ? <a className="v7-prob-ev" href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`problem-ev-${id}-${r.check.id}`}>{ev} <Icon name="external" size={12} /></a>
                      : <span className="v7-prob-ev v7-faint">no link</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!groups.length && <div className="v7-prob-empty">{rows.length ? "No problems match the filter." : "No problems have been detected in this version."}</div>}
      </div>
    </div>
  );
}

function Output({ site }) {
  const { graph, health, versionsDoc, pick, source } = site;
  const t = (iso) => fmtShortDate(iso);
  const lines = [
    `[data] folder ${source?.base || ""}`,
    `[data] graph.json · ${graph.schema} · ${source?.graph || "?"} · generated ${t(site.live.graph?.generated)} · ${site.live.graph?.packages.length} packages, ${site.live.graph?.types.length} types, ${site.live.graph?.uses.length} type uses, ${(site.live.graph?.agents || []).length} agents`,
    `[data] health.json · ${source?.health || "?"} · ${site.live.health ? `generated ${t(site.live.health.generated)} against graph.json ${t(site.live.health.graph_generated)}` : "not available"}`,
    `[data] versions.json · ${source?.versions || "?"} · ${versionsDoc ? `${versionsDoc.versions.length} versions (${versionsDoc.versions.filter((v) => v.kind === "snapshot").length} snapshots), default ${versionsDoc.default}` : "not available"}`,
    `[data] pick_and_place.json · ${source?.pick || "?"} · ${pick ? `${pick.stages?.length} stages, run ${t(pick.run?.date)}` : "not available"}`,
    site.isLive ? `[view] showing Live (every package at main)` : `[view] showing ${site.version?.label}: ${site.version?.graph} · ${graph.packages.length} packages, ${graph.types.length} types, ${graph.uses.length} uses · health ${health ? site.version?.health : "not recorded"}`,
    `[sources] ${Object.entries(graph.sources || {}).map(([k, v]) => `${k}@${v}`).join("  ")}`,
  ];
  return <pre className="v7-output" data-testid="output-log">{lines.join("\n")}</pre>;
}

export function Panel({ site, lens, sel, tab, setTab, onClose, maximized, setMaximized, onOpenMember, counts, filterSel, setFilterSel }) {
  return (
    <section className="v7-panel" data-testid="problems-panel" aria-label="Panel">
      <div className="v7-panel-head">
        <div className="v7-panel-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "problems"} className={"v7-ptab" + (tab === "problems" ? " v7-on" : "")} onClick={() => setTab("problems")} data-testid="panel-tab-problems">
            Problems {counts && <span className="v7-ptab-n">{counts.fail + counts.warn + counts.info}</span>}</button>
          <button role="tab" aria-selected={tab === "output"} className={"v7-ptab" + (tab === "output" ? " v7-on" : "")} onClick={() => setTab("output")} data-testid="panel-tab-output">Output</button>
        </div>
        <span className="v7-grow" />
        <button className="v7-ibtn" onClick={() => setMaximized(!maximized)} title={maximized ? "Restore Panel Size" : "Maximize Panel Size"} aria-label="Maximize panel"><Icon name={maximized ? "restore" : "maximize"} /></button>
        <button className="v7-ibtn" onClick={onClose} title="Hide Panel (Ctrl+J)" aria-label="Hide panel" data-testid="panel-close"><Icon name="close" /></button>
      </div>
      <div className="v7-panel-body">
        {tab === "problems" ? <Problems site={site} lens={lens} sel={sel} onOpenMember={onOpenMember} filterSel={filterSel} setFilterSel={setFilterSel} /> : <Output site={site} />}
      </div>
    </section>
  );
}
