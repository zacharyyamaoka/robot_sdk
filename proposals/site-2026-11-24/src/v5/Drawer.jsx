// The right-hand drawer beside the health map: layer overview when nothing is picked, else one package or one type,
// its uses grouped by lint state (declared + verified / found in code, not declared / declared, not found), each a
// shared UseRow with file:line linking to GitHub.
import { useMemo, useState } from "react";
import { UseRow, LAYER_RULE } from "@shared/parts.jsx";
import { LAYER_LABEL, LAYER_BLURB, shortType, useState_, USE_STATE_LABEL, KIND_LABEL } from "@shared/graph.js";
import { CovBar } from "./HealthMap.jsx";
import { coverage, pct, plural } from "./derive.js";

const STATE_ORDER = ["verified", "found", "missing"];
const STATE_HEAD = { verified: "Declared + verified", found: "Found in code, not declared yet", missing: "Declared, not found (lint fail)" };

function Rows({ graph, rows, showPackage, showType, limit = 12 }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  return (<>
    {shown.map((u, i) => <UseRow key={i} graph={graph} use={u} showPackage={showPackage} showType={showType} />)}
    {rows.length > limit && <button className="btn ghost v5-more" onClick={() => setAll(!all)}>{all ? "show fewer" : `show all ${rows.length}`}</button>}
  </>);
}

function StateGroups({ graph, rows, showPackage, showType, testid }) {
  const groups = STATE_ORDER.map((s) => [s, rows.filter((u) => useState_(u) === s)]);
  return (
    <div className="v5-groups" data-testid={testid}>
      {groups.map(([s, list]) => (
        <details key={s} open={list.length > 0 && list.length <= 40} className={`v5-group st-${s} ${list.length ? "" : "empty"}`}>
          <summary><span className={"v5-dot st-" + s} /> {STATE_HEAD[s]} <span className="v5-count">{list.length}</span></summary>
          {list.length ? <Rows graph={graph} rows={list} showPackage={showPackage} showType={showType} /> : <p className="muted small v5-none">none</p>}
        </details>
      ))}
    </div>
  );
}

function CovLine({ cov }) {
  return (
    <div className="v5-covline">
      <CovBar cov={cov} />
      <div className="small"><b>{cov.verified}</b> of {cov.total} declared + verified ({pct(cov.verified, cov.total)}%) · {cov.found} not declared yet
        {cov.missing ? <span className="bad"> · {cov.missing} lint fail</span> : " · 0 lint fail"}</div>
    </div>
  );
}

function PkgLink({ id, onSelect }) { return <button className="v5-chip" onClick={() => onSelect({ kind: "pkg", id })}>{id}</button>; }

function PackageView({ graph, d, id, typeFilter, onSelect }) {
  const p = d.pkgIdx[id];
  const [tf, setTf] = useState(typeFilter || "");
  const all = d.usesByPkg[id] || [];
  const rows = tf ? all.filter((u) => u.type === tf) : all;
  const typeCounts = useMemo(() => { const m = {}; for (const u of all) m[u.type] = (m[u.type] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [id]);
  const req = p.deps?.required || [];
  const extras = Object.entries(p.deps?.extras || {}).filter(([, v]) => v.some((x) => x !== id));
  const dependants = d.dependants[id] || [];
  const agents = (graph.agents || []).filter((a) => (a.builds_on || []).includes(id));
  return (
    <div className="v5-view" data-testid="drawer-pkg">
      <div className="v5-view-head">
        <div className="v5-eyebrow">{p.role === "viewer" ? "viewer package" : "package"} · {LAYER_LABEL[p.layer] || p.layer}</div>
        <h3><code>{p.id}</code> <span className="muted small">{p.version}</span></h3>
        <p className="muted">{p.one_line}</p>
        <div className="v5-meta small">
          <span className={"tag " + (p.lint === "fail" ? "bad" : p.lint === "pass" ? "ok" : "")}>lint {p.lint}</span>
          {p.declaration && <code>{p.declaration}</code>}
          <a href={p.repo_url} target="_blank" rel="noreferrer">repo</a>
          {p.pypi && <a href={`https://pypi.org/project/${p.pypi}/`} target="_blank" rel="noreferrer">pip install {p.pypi}</a>}
        </div>
      </div>
      <section>
        <h4>Depends on</h4>
        <div className="chips">{req.length ? req.map((x) => <PkgLink key={x} id={x} onSelect={onSelect} />) : <span className="muted small">nothing required</span>}</div>
        {extras.map(([k, v]) => <div key={k} className="chips v5-extra"><span className="muted small">[{k}]</span>{v.filter((x) => x !== id).map((x) => <PkgLink key={x} id={x} onSelect={onSelect} />)}</div>)}
        <h4>Depended on by</h4>
        <div className="chips">{dependants.length ? dependants.map((e) => <PkgLink key={e.source} id={e.source} onSelect={onSelect} />) : <span className="muted small">{p.role === "viewer" ? "nothing (viewers are end points)" : "nothing"}</span>}</div>
        {agents.length > 0 && <><h4>Agents building on it</h4><div className="chips">{agents.map((a) => <span key={a.id} className="v5-chip agent">{a.name}</span>)}</div></>}
      </section>
      <section>
        <h4>Type uses {tf ? <>of <code>{shortType(tf)}</code></> : null}</h4>
        {all.length ? <>
          <CovLine cov={coverage(rows)} />
          <div className="chips v5-typechips">
            <button className={"v5-chip" + (!tf ? " on" : "")} onClick={() => setTf("")}>all {all.length}</button>
            {typeCounts.map(([t, n]) => <button key={t} className={"v5-chip" + (tf === t ? " on" : "")} onClick={() => setTf(t)}>{shortType(t)} {n}</button>)}
          </div>
          <StateGroups graph={graph} rows={rows} showPackage={false} showType testid="pkg-uses" />
        </> : <p className="muted small">{graph.types.some((t) => t.package === id) ? `Defines ${graph.types.filter((t) => t.package === id).length} shared types; the scanner records uses in other packages.` : "The scanner found no robot_msgs type in its code."}</p>}
      </section>
    </div>
  );
}

function TypeView({ graph, d, id, onSelect }) {
  const t = graph.types.find((x) => x.id === id);
  const rows = d.usesByType[id] || [];
  const [stateF, setStateF] = useState("");
  const kinds = ["produces", "consumes", "imports"];
  const filtered = stateF ? rows.filter((u) => useState_(u) === stateF) : rows;
  const byKind = kinds.map((k) => [k, filtered.filter((u) => u.kind === k)]);
  const pkgsOf = (list) => [...new Set(list.map((u) => u.package))];
  const cov = coverage(rows);
  return (
    <div className="v5-view" data-testid="drawer-type">
      <div className="v5-view-head">
        <div className="v5-eyebrow">type · {t.module}</div>
        <h3><code>{t.name}</code></h3>
        {t.what && <p className="muted">{t.what}</p>}
        <div className="v5-meta small">{t.docs_url && <a href={t.docs_url} target="_blank" rel="noreferrer">docs</a>}<span className="muted">defined in {t.package}</span></div>
      </div>
      <div className="v5-kindsum">
        {kinds.map((k) => { const ps = pkgsOf(rows.filter((u) => u.kind === k)); return (
          <div key={k} className={"v5-kindcell k-" + k}><div className="v5-kindn">{ps.length}</div><div className="small">{k === "imports" ? "import it (not public)" : `${k === "produces" ? "produce" : "consume"} it`}</div></div>); })}
      </div>
      <CovLine cov={cov} />
      <div className="chips v5-statefilter" data-testid="type-state-filter">
        <button className={"v5-chip" + (!stateF ? " on" : "")} onClick={() => setStateF("")}>all {rows.length}</button>
        {STATE_ORDER.map((s) => <button key={s} className={"v5-chip st-" + s + (stateF === s ? " on" : "")} onClick={() => setStateF(stateF === s ? "" : s)}><span className={"v5-dot st-" + s} />{USE_STATE_LABEL[s]} {cov[s]}</button>)}
      </div>
      {byKind.map(([k, list]) => list.length > 0 && (
        <section key={k} className="v5-kindsec" data-testid={`type-${k}`}>
          <h4><span className={"kind k-" + k}>{KIND_LABEL[k]}</span> <span className="muted small">{plural(pkgsOf(list).length, "package")} · {plural(list.length, "use")}</span></h4>
          {pkgsOf(list).map((pid) => { const pr = list.filter((u) => u.package === pid); const c = coverage(pr); return (
            <details key={pid} className="v5-pkggroup" open={pr.length <= 6}>
              <summary><button className="v5-chip" onClick={(e) => { e.preventDefault(); onSelect({ kind: "pkg", id: pid, typeFilter: id }); }}>{pid}</button>
                <CovBar cov={c} thin /><span className="small muted">{c.verified}/{c.total} declared</span></summary>
              <Rows graph={graph} rows={[...pr].sort((a, b) => STATE_ORDER.indexOf(useState_(a)) - STATE_ORDER.indexOf(useState_(b)))} showPackage={false} showType={false} limit={8} />
            </details>); })}
        </section>
      ))}
    </div>
  );
}

function Overview({ graph, d, collapsed, onToggleLayer }) {
  return (
    <div className="v5-view" data-testid="drawer-overview">
      <div className="v5-view-head">
        <div className="v5-eyebrow">the stack at this commit</div>
        <h3>Layers</h3>
        <p className="muted small">{LAYER_RULE}</p>
        <p className="small">{d.ruleBreaks.length === 0
          ? <><span className="v5-dot st-verified" /> All {d.deps.length} pyproject dependency edges point down the stack.</>
          : <span className="bad">{plural(d.ruleBreaks.length, "dependency edge")} break the layer rule: {d.ruleBreaks.map((e) => `${e.source} → ${e.target}`).join(", ")}</span>}</p>
      </div>
      <div className="v5-layerlist">
        {[...d.layers].reverse().map((l) => {
          const members = graph.packages.filter((p) => p.layer === l);
          const cov = coverage(members.flatMap((p) => d.usesByPkg[p.id] || []));
          return (
            <div key={l} className="v5-layerrow">
              <div className="v5-layerrow-top">
                <b>{LAYER_LABEL[l] || l}</b><span className="muted small">{members.length}</span>
                <button className="btn ghost v5-mini" data-testid={`layer-toggle-${l}`} onClick={() => onToggleLayer(l)}>{collapsed.has(l) ? "expand" : "collapse"}</button>
              </div>
              <div className="muted small">{LAYER_BLURB[l] || ""}</div>
              {cov.total > 0 && <div className="v5-layercov"><CovBar cov={cov} thin /><span className="small muted">{cov.verified}/{cov.total}</span></div>}
            </div>);
        })}
      </div>
    </div>
  );
}

export function Drawer({ graph, d, sel, onSelect, collapsed, onToggleLayer }) {
  const key = sel ? sel.kind + ":" + sel.id + ":" + (sel.typeFilter || "") : "none";
  return (
    <aside className="v5-drawer">
      <div className="v5-pickers">
        <label><span>Type</span>
          <select data-testid="pick-type" value={sel?.kind === "type" ? sel.id : ""} onChange={(e) => onSelect(e.target.value ? { kind: "type", id: e.target.value } : null)}>
            <option value="">choose a type…</option>
            {d.typesByUse.map((t) => <option key={t.id} value={t.id}>{t.name} ({d.usesByType[t.id]?.length || 0})</option>)}
          </select></label>
        <label><span>Package</span>
          <select data-testid="pick-pkg" value={sel?.kind === "pkg" ? sel.id : ""} onChange={(e) => onSelect(e.target.value ? { kind: "pkg", id: e.target.value } : null)}>
            <option value="">choose a package…</option>
            {[...d.layers].flatMap((l) => graph.packages.filter((p) => p.layer === l)).map((p) => <option key={p.id} value={p.id}>{p.id} ({d.usesByPkg[p.id]?.length || 0})</option>)}
          </select></label>
        {sel && <button className="btn ghost v5-close" data-testid="drawer-close" onClick={() => onSelect(null)} aria-label="close">×</button>}
      </div>
      <div className="v5-drawer-body" key={key}>
        {!sel && <Overview graph={graph} d={d} collapsed={collapsed} onToggleLayer={onToggleLayer} />}
        {sel?.kind === "pkg" && d.pkgIdx[sel.id] && <PackageView graph={graph} d={d} id={sel.id} typeFilter={sel.typeFilter} onSelect={onSelect} />}
        {sel?.kind === "type" && graph.types.some((t) => t.id === sel.id) && <TypeView graph={graph} d={d} id={sel.id} onSelect={onSelect} />}
      </div>
    </aside>
  );
}
