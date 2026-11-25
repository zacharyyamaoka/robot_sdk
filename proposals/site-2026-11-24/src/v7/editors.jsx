// The editors a V7 tab can hold. Types / Packages / Directory / Health / Agents / Run / For coding agents are the kit's
// workspaces; the package editor (VS Code's extension page: header, links, details beside a "health / resources / more
// info" column) and the Live ↔ version comparison (a diff editor) are V7's own.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  TypeWorkspace, PackageMap, Directory, HealthBoard, AgentsPanel, RunPanel, SkillPanel, TypeLink, Signature, PkgLinks,
  HealthDot, HealthInline, healthOf, HEALTH_LABEL, LAYER_LABEL, LAYER_BLURB, signatures, typeById, typeKey, resolveType,
  fmtShortDate, shortType, PITCH, PITCH_2, REPO_URL,
} from "@kit";
import { Icon, Sev } from "./icons.jsx";
import { ROLE_LABEL, evidenceLabel } from "./lens.js";

// ---- a lens bar on top of the workspaces that follow the selection ---------------------------------------------------
export function LensBar({ sel, lens, what, onClear, onOpenSel }) {
  if (!sel) return <div className="v7-lensbar v7-lensbar-off"><Icon name="info" size={14} /> Pick a type or package in the Explorer and {what} highlights it.</div>;
  if (sel.missing) return <div className="v7-lensbar"><Icon name="warning" size={14} /> <b>{sel.label}</b> is not in this version. <button className="v7-link" onClick={onClear}>Clear selection</button></div>;
  const c = lens.counts || {};
  const parts = sel.kind === "type"
    ? [["returns", c.returns], ["takes", c.takes], ["both", c.both], ["imports", c.imports], ["defines", c.defines]].filter(([, n]) => n)
    : sel.kind === "package" ? [["self", 1], ["near", c.near]].filter(([, n]) => n) : [["near", c.near]].filter(([, n]) => n);
  return (
    <div className="v7-lensbar" data-testid="lens-bar">
      <Icon name={sel.kind === "type" ? "types" : sel.kind === "agent" ? "robot" : "package"} size={14} />
      <span>Selection <button className="v7-link v7-mono" onClick={onOpenSel}>{sel.label}</button>: {lens.pkgs.size} package{lens.pkgs.size === 1 ? "" : "s"}</span>
      {parts.map(([r, n]) => <span key={r} className={"v7-role v7-role-" + r}>{n} {ROLE_LABEL[r]}</span>)}
      <span className="v7-grow" />
      <button className="v7-link" onClick={onClear} data-testid="lens-clear">Clear selection</button>
    </div>
  );
}

// ---- Types ----------------------------------------------------------------------------------------------------------
export function TypeEditor({ site, typeKeyArg, openType, openPackage, onGo }) {
  return (
    <div className="v7-fill v7-type-ed" data-testid="editor-type">
      <TypeWorkspace graph={site.graph} health={site.health} typeKey={typeKeyArg} onOpenType={(k) => openType(k, { pinSource: true })}
        onOpenPackage={(p) => openPackage(p, { pinSource: true, via: typeKeyArg })} onGo={onGo} sourceUrl={site.sourceUrl} intro={false} height="100%" />
    </div>
  );
}

// ---- Packages: the kit's tree / pipeline, ringed by the selection ---------------------------------------------------------
export function MapEditor({ site, sel, lens, setSel, openPackage, openType, clearSel, openSel, bodyH, narrow, phone }) {
  // WHY narrowMinZoom 0 off the phone: a desktop split group can be under the kit's 560 px "phone" threshold, where it
  // would draw the map at a readable zoom and scroll; beside an editor the whole map fitted to the width reads better.
  const h = phone ? "auto" : Math.max(320, (bodyH || 700) - (narrow ? 150 : 118));
  return (
    <div className="v7-page v7-page-map" data-testid="editor-packages">
      <LensBar sel={sel} lens={lens} what="the map" onClear={clearSel} onOpenSel={openSel} />
      <PackageMap graph={site.graph} health={site.health} height={h} maxHeight={h} narrowMinZoom={phone ? 0.75 : 0} onOpenPackage={(p) => openPackage(p, { pinSource: true })}
        onOpenType={(t) => openType(t, { pinSource: true })} onSelect={(id) => { if (id) setSel(id); }} />
    </div>
  );
}

// ---- Package editor (VS Code's extension page) ------------------------------------------------------------------------
function CheckRow({ check, c }) {
  const ev = evidenceLabel(check.id, c.url);
  return (
    <li className={"v7-check v7-st-" + c.state} data-testid={"pkg-check-" + check.id}>
      {["fail", "warn", "unknown", "running"].includes(c.state) ? <Sev s={c.state} /> : <HealthDot state={c.state} />}
      <div className="v7-check-main">
        <div><b>{check.label}</b> <span className="v7-faint">· {HEALTH_LABEL[c.state] || c.state}</span></div>
        <div className="v7-check-detail">{c.detail}</div>
        {(c.failures || []).length > 0 && <ul className="v7-check-fails">{c.failures.map((f, i) => <li key={i}><code>{typeof f === "string" ? f : JSON.stringify(f)}</code></li>)}</ul>}
      </div>
      {c.url && <a className="v7-ev" href={c.url} target="_blank" rel="noreferrer" data-testid={"pkg-ev-" + check.id}>{ev} <Icon name="external" size={12} /></a>}
    </li>
  );
}

export function PackageEditor({ site, id, via, sym, openType, openPackage, onBackToLive }) {
  const { graph, health } = site;
  const p = graph.packages.find((x) => x.id === id);
  const viaType = via ? resolveType(graph, via) : null;
  const [all, setAll] = useState(!viaType);
  useEffect(() => { setAll(!viaType); }, [id, via]);
  const hiRef = useRef(null);
  useEffect(() => { if (sym) setTimeout(() => hiRef.current?.scrollIntoView({ block: "nearest" }), 80); }, [sym, id]);
  const sigs = useMemo(() => signatures(graph).filter((s) => s.package === id).sort((a, b) => (b.public - a.public) || a.name.localeCompare(b.name)), [graph, id]);
  if (!p) {
    const lp = site.live.graph?.packages.find((x) => x.id === id);
    const ventry = site.version?.packages?.[id];
    return (
      <div className="v7-page" data-testid={"pkg-editor-" + id}>
        <div className="v7-missing">
          <Icon name="package" size={40} className="v7-ico-pkg" />
          <h2 className="v7-mono">{id}</h2>
          <p>Not in <b>{site.version?.label}</b>{ventry === null ? ": the package has no v* tag yet, so the latest release cannot include it." : "."}</p>
          {lp && <p className="v7-faint">On Live it is v{lp.version} · {LAYER_LABEL[lp.layer] || lp.layer} · {lp.one_line}</p>}
          <button className="v7-btn v7-btn-primary" onClick={onBackToLive}>Back to Live</button>
        </div>
      </div>
    );
  }
  const tb = typeById(graph);
  const kinds = { consumes: {}, produces: {}, imports: {} };
  for (const u of graph.uses) if (u.package === id) kinds[u.kind][u.type] = (kinds[u.kind][u.type] || 0) + 1;
  const m = healthOf(health, id);
  const requiredBy = graph.packages.filter((x) => (x.deps?.required || []).includes(id)).map((x) => x.id);
  const extraBy = graph.packages.filter((x) => Object.values(x.deps?.extras || {}).some((l) => l.includes(id)) && !(x.deps?.required || []).includes(id)).map((x) => x.id);
  const agents = (graph.agents || []).filter((a) => (a.builds_on || []).includes(id));
  const defines = graph.types.filter((t) => t.package === id);
  const shown = all || !viaType ? sigs : sigs.filter((s) => s.inputs.includes(viaType.id) || s.outputs.includes(viaType.id) || s.imports.includes(viaType.id));
  const P = (x) => <button key={x} className="v7-chip v7-mono" onClick={() => openPackage(x, { pinSource: true })}>{x}</button>;
  const chips = (k) => Object.entries(kinds[k]).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
    <span key={t} className={"v7-tchip v7-tchip-" + k + (viaType?.id === t ? " v7-hit" : "")}><TypeLink graph={graph} id={t} onOpen={(key) => openType(key, { pinSource: true })} /><span className="v7-faint">{n}</span></span>));
  const ref = site.ref(id);
  return (
    <div className="v7-page v7-pkgpage" data-testid={"pkg-editor-" + id}>
      <header className="v7-ext-head">
        <div className={"v7-ext-icon layer-" + p.layer + (p.role === "viewer" ? " role-viewer" : "")}><Icon name="package" size={44} /></div>
        <div className="v7-ext-main">
          <div className="v7-ext-title"><h1 className="v7-mono">{p.id}</h1><span className="v7-tag">v{p.version}</span>{p.role === "viewer" && <span className="v7-tag v7-tag-viewer">viewer</span>}</div>
          <div className="v7-ext-sub">{LAYER_LABEL[p.layer] || p.layer} · {p.role} · <span className="v7-mono">{p.pypi}</span> on PyPI{!site.isLive && <> · at <code>{ref}</code></>}</div>
          <p className="v7-ext-one">{p.one_line}</p>
          <div className="v7-ext-actions"><PkgLinks pkg={p} />{health && m && <HealthInline health={health} id={id} max={3} />}</div>
        </div>
      </header>
      <div className="v7-ext-tabs" role="tablist"><span className="v7-on" role="tab" aria-selected="true">Details</span><span className="v7-faint">{sigs.length} functions · {Object.keys(kinds.consumes).length + Object.keys(kinds.produces).length} public types</span></div>
      <div className="v7-ext-cols">
        <div className="v7-ext-body">
          {(p.summary || p.use_when) && <section className="v7-ext-sec">
            {p.summary && <p>{p.summary}</p>}
            {p.use_when && <p className="v7-usewhen"><b>Reach for it when</b> {p.use_when}</p>}
          </section>}
          <section className="v7-ext-sec" data-testid="pkg-types">
            <h3>Types on its API</h3>
            <div className="v7-trow3"><span className="v7-k v7-c-cons">takes</span><div>{chips("consumes")}{!Object.keys(kinds.consumes).length && <span className="v7-faint">none</span>}</div></div>
            <div className="v7-trow3"><span className="v7-k v7-c-prod">returns</span><div>{chips("produces")}{!Object.keys(kinds.produces).length && <span className="v7-faint">none</span>}</div></div>
            {Object.keys(kinds.imports).length > 0 && <div className="v7-trow3"><span className="v7-k">imports</span><div>{chips("imports")}</div></div>}
            {defines.length > 0 && <div className="v7-trow3"><span className="v7-k">defines</span><div>{defines.map((t) => <span key={t.id} className="v7-tchip"><TypeLink graph={graph} id={t.id} onOpen={(key) => openType(key, { pinSource: true })} /></span>)}</div></div>}
          </section>
          <section className="v7-ext-sec" data-testid="pkg-functions">
            <h3>Functions <span className="v7-faint">{shown.length}{shown.length !== sigs.length ? ` of ${sigs.length}` : ""}</span></h3>
            {viaType && <div className="v7-via">
              {all ? <>All {sigs.length} functions. <button className="v7-link" onClick={() => setAll(false)}>Only the {sigs.filter((s) => s.inputs.includes(viaType.id) || s.outputs.includes(viaType.id) || s.imports.includes(viaType.id)).length} with {viaType.name}</button></>
                : <>Showing the functions that take or return <TypeLink graph={graph} id={viaType.id} onOpen={(k) => openType(k)} bold />, from where you came. <button className="v7-link" onClick={() => setAll(true)} data-testid="pkg-show-all">Show all {sigs.length}</button></>}
            </div>}
            <ul className="v7-fnlist">
              {shown.map((s) => {
                const hit = sym && s.symbol === sym;
                const url = site.sourceUrl(id, s.where);
                return (
                  <li key={s.id} ref={hit ? hiRef : null} className={"v7-fn" + (hit ? " v7-hit" : "")} data-testid={"pkg-fn-" + s.name}>
                    <div className="v7-fn-top"><Icon name="method" size={14} className="v7-ico-method" /><code className="v7-fn-name" title={s.symbol}>{s.name}</code>
                      {!s.public && <span className="v7-tag">internal</span>}<span className="v7-grow" />
                      {url ? <a className="v7-where" href={url} target="_blank" rel="noreferrer" title={`${id}/${s.where} at ${ref}`}>{s.where.split("/").pop()}</a> : <code className="v7-where">{s.where}</code>}</div>
                    <Signature graph={graph} sig={s} focus={viaType?.id} onOpenType={(k) => openType(k, { pinSource: true })} />
                  </li>
                );
              })}
              {!shown.length && <li className="v7-faint">No type-carrying functions found by the scan.</li>}
            </ul>
          </section>
        </div>
        <aside className="v7-ext-side">
          <section className="v7-side-sec" data-testid="pkg-health">
            <h4>Health {m && <span className={"v7-hstate v7-st-" + m.state}><HealthDot state={m.state} /> {HEALTH_LABEL[m.state]}</span>}</h4>
            {!health ? <p className="v7-faint">{site.healthNote}</p> : !m ? <p className="v7-faint">No health row for {id}.</p> : (
              <ul className="v7-checks">{(health.checks || []).map((c) => m.checks?.[c.id] ? <CheckRow key={c.id} check={c} c={m.checks[c.id]} /> : null)}</ul>)}
          </section>
          <section className="v7-side-sec">
            <h4>Dependencies</h4>
            <dl className="v7-kv">
              <dt>requires</dt><dd>{(p.deps?.required || []).filter((x) => x !== id).map(P)}{!(p.deps?.required || []).filter((x) => x !== id).length && <span className="v7-faint">no robot-sdk package</span>}</dd>
              {Object.entries(p.deps?.extras || {}).filter(([, l]) => l.some((x) => x !== id)).map(([k, l]) => <Fragment key={k}><dt>extra [{k}]</dt><dd>{l.filter((x) => x !== id).map(P)}</dd></Fragment>)}
              <dt>required by</dt><dd>{requiredBy.map(P)}{!requiredBy.length && <span className="v7-faint">nothing</span>}</dd>
              {extraBy.length > 0 && <><dt>optional for</dt><dd>{extraBy.map(P)}</dd></>}
              {agents.length > 0 && <><dt>agents</dt><dd>{agents.map((a) => <span key={a.id} className="v7-chip">{a.name}</span>)}</dd></>}
            </dl>
          </section>
          <section className="v7-side-sec">
            <h4>More info</h4>
            <dl className="v7-kv">
              <dt>version</dt><dd>{p.version}</dd>
              <dt>layer</dt><dd title={LAYER_BLURB[p.layer]}>{LAYER_LABEL[p.layer] || p.layer}</dd>
              <dt>declaration</dt><dd>{p.declaration ? <><code>{p.declaration}</code> · lint {p.lint}</> : <span className="v7-faint">none (lint {p.lint})</span>}</dd>
              <dt>scanned at</dt><dd><code>{graph.sources?.[id] || "?"}</code></dd>
              <dt>graph</dt><dd>{fmtShortDate(graph.generated)}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---- Live ↔ version (VS Code's diff editor, over graph.json) -----------------------------------------------------------
export function CompareEditor({ site, openPackage, openType, openTypeLive, onBackToLive }) {
  const live = site.live.graph, here = site.graph, d = site.diff;
  if (site.isLive || !d) {
    return (
      <div className="v7-page"><div className="v7-missing"><Icon name="diff" size={40} /><h2>Live is on screen</h2>
        <p>Pick another version from the status bar (<b>⎇ Live</b>) or the top-right picker to compare it with Live.</p></div></div>
    );
  }
  const lp = Object.fromEntries(live.packages.map((p) => [p.id, p])), hp = Object.fromEntries(here.packages.map((p) => [p.id, p]));
  const ids = [...new Set([...live.packages.map((p) => p.id), ...here.packages.map((p) => p.id)])];
  const uses = (g, id) => g.uses.filter((u) => u.package === id).length;
  const lh = site.live.health, hh = site.health;
  const st = (h, id) => h ? healthOf(h, id)?.state : null;
  const rows = ids.map((id) => {
    const a = lp[id], b = hp[id];
    const status = !b ? "D" : !a ? "A" : a.version !== b.version || uses(live, id) !== uses(here, id) ? "M" : "";
    return { id, a, b, status };
  }).sort((x, y) => "MAD ".indexOf(x.status || " ") - "MAD ".indexOf(y.status || " ") || x.id.localeCompare(y.id));
  const C = d.counts;
  const lt = Object.fromEntries(live.types.map((t) => [t.id, t]));
  return (
    <div className="v7-page v7-compare" data-testid="editor-compare">
      <h1 className="v7-cmp-title"><Icon name="diff" size={18} /> graph.json <span className="v7-faint">(Live)</span> ↔ graph.json <span className="v7-faint">({site.version.label})</span></h1>
      <p className="v7-faint">{site.version.summary}</p>
      <div className="v7-cmp-stats">
        {[["packages", C.packages], ["types", C.types], ["type uses", C.uses], ["agents", C.agents], ["package deps", C.deps]].map(([k, [a, b]]) => (
          <div key={k} className="v7-cmp-stat"><div className="v7-cmp-n"><span>{a}</span><Icon name="chevronRight" size={14} className="v7-faint" /><b className={b < a ? "v7-c-del" : b > a ? "v7-c-add" : ""}>{b}</b></div><div className="v7-faint">{k}</div></div>
        ))}
      </div>
      <div className="v7-diff" role="table" data-testid="compare-table">
        <div className="v7-diff-h" role="row"><span>package</span><span>Live <span className="v7-faint">main</span></span><span>{site.version.label}</span></div>
        {rows.map((r) => (
          <div key={r.id} className={"v7-diff-r v7-diff-" + (r.status || "same")} role="row" onClick={() => openPackage(r.id, { pinSource: true })} data-testid={"cmp-row-" + r.id}>
            <span className="v7-diff-name"><span className={"v7-deco v7-git-" + r.status}>{r.status || "·"}</span><code>{r.id}</code></span>
            <span className="v7-diff-a">{r.a ? <>v{r.a.version} <span className="v7-faint">· {uses(live, r.id)} uses</span>{lh && <HealthDot state={st(lh, r.id) || "unknown"} />}</> : <span className="v7-faint">—</span>}</span>
            <span className="v7-diff-b">{r.b ? <>v{r.b.version} <span className="v7-faint">· {uses(here, r.id)} uses · {site.version?.packages?.[r.id]?.ref || ""}</span>{hh ? <HealthDot state={st(hh, r.id) || "unknown"} /> : null}</>
              : <span className="v7-faint">{site.version?.packages && site.version.packages[r.id] === null ? "no v* tag yet" : "not in this version"}</span>}</span>
          </div>
        ))}
      </div>
      {d.types.removed.length > 0 && <section className="v7-ext-sec"><h3>Types on Live, not in {site.version.label} <span className="v7-faint">{d.types.removed.length}</span></h3>
        <div className="v7-chips">{d.types.removed.map((id) => <button key={id} className="v7-tchip v7-tchip-del" onClick={() => openTypeLive(id)} title={`${lt[id]?.module}.${lt[id]?.name}: open it on Live`}><code>{lt[id]?.name || shortType(id)}</code></button>)}</div></section>}
      {d.types.added.length > 0 && <section className="v7-ext-sec"><h3>Types only in {site.version.label} <span className="v7-faint">{d.types.added.length}</span></h3>
        <div className="v7-chips">{d.types.added.map((id) => <span key={id} className="v7-tchip"><TypeLink graph={here} id={id} onOpen={(k) => openType(k)} /></span>)}</div></section>}
      {!hh && <p className="v7-faint">{site.healthNote}</p>}
      <p><button className="v7-btn" onClick={onBackToLive}>Back to Live</button></p>
    </div>
  );
}

// ---- simple pages --------------------------------------------------------------------------------------------------
export function Page({ title, sub, children, testid, wide }) {
  return (
    <div className={"v7-page" + (wide ? " v7-wide" : "")} data-testid={testid}>
      {title && <h1 className="v7-page-title">{title}</h1>}
      {sub && <p className="v7-page-sub">{sub}</p>}
      {children}
    </div>
  );
}

export function EmptyEditor({ onQuick }) {
  const keys = [["Go to Type or Package", "Ctrl+P"], ["Show All Commands", "Ctrl+Shift+P"], ["Toggle Problems", "Ctrl+J"], ["Toggle Explorer", "Ctrl+B"], ["Split Editor", "Ctrl+\\"]];
  return (
    <div className="v7-watermark" data-testid="editor-empty">
      <div className="v7-wm-logo">robot-sdk</div>
      <dl>{keys.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><kbd>{v}</kbd></dd></div>)}</dl>
      <button className="v7-btn" onClick={onQuick}>Go to a type…</button>
    </div>
  );
}

export { Directory, HealthBoard, AgentsPanel, RunPanel, SkillPanel, PITCH, PITCH_2, REPO_URL };
