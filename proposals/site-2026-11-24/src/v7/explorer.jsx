// The side bar's Explorer: VS Code's tree, over robot-sdk instead of files.
//   ROBOT-SDK   layers (folders) → packages → the types each takes / returns / imports; agents last
//   TYPES       every robot_msgs type by module, with its use count and V2's produce/consume/import bar (the type rail)
//   CHANGES     only off Live: what this version lacks or adds vs Live, with git-style letters (D / A / M)
// Decorations follow VS Code: problems colour the name and put a count on the right (red = failing check, amber =
// warning); off Live a git letter sits beside it; the selection's role ("takes", "returns") shows when a type is selected.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { LAYER_LABEL, layersOf, typeCounts, typeKey, healthOf, HEALTH_LABEL } from "@kit";
import { Icon } from "./icons.jsx";
import { ROLE_LABEL, problemsOf } from "./lens.js";

const KIND_WORD = { produces: "returns", consumes: "takes", imports: "imports" };

function Twisty({ open, hidden }) {
  return <span className={"v7-twisty" + (hidden ? " v7-hide" : "")} aria-hidden><Icon name={open ? "chevronDown" : "chevronRight"} size={16} /></span>;
}

function Row({ depth, open, leaf, icon, iconClass = "", label, mono, desc, deco, decoTitle, decoClass = "", nameClass = "", selected, onClick, onDoubleClick, onTwisty, title, testid, strike }) {
  return (
    <div className={"v7-row" + (selected ? " v7-sel" : "")} style={{ paddingLeft: 4 + depth * 12 }} role="treeitem" aria-selected={!!selected}
      aria-expanded={leaf ? undefined : !!open} tabIndex={-1} onClick={onClick} onDoubleClick={onDoubleClick} title={title} data-testid={testid}>
      <span onClick={onTwisty ? (e) => { e.stopPropagation(); onTwisty(); } : undefined}><Twisty open={open} hidden={leaf} /></span>
      {icon && <Icon name={icon} size={16} className={"v7-row-ico " + iconClass} />}
      <span className={"v7-row-name " + (mono ? "v7-mono " : "") + nameClass + (strike ? " v7-strike" : "")}>{label}</span>
      {desc && <span className="v7-row-desc">{desc}</span>}
      <span className="v7-grow" />
      {deco}
      {decoTitle && <span className={"v7-deco " + decoClass} title={decoTitle.title}>{decoTitle.text}</span>}
    </div>
  );
}

function Section({ id, title, count, open, onToggle, actions, children, grow = 1 }) {
  return (
    <section className={"v7-sec" + (open ? " v7-open" : "")} style={open ? { flexGrow: grow } : undefined} data-testid={"ex-sec-" + id}>
      <div className="v7-sec-head" onClick={onToggle} role="button" aria-expanded={open}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={16} />
        <span className="v7-sec-title">{title}</span>
        {count != null && <span className="v7-sec-count">{count}</span>}
        <span className="v7-grow" />
        {open && actions && <span className="v7-sec-actions" onClick={(e) => e.stopPropagation()}>{actions}</span>}
      </div>
      {open && <div className="v7-sec-body" role="tree">{children}</div>}
    </section>
  );
}

// problem decoration for a member: count + colour of its worst check (VS Code: "2" in red beside a file with errors)
function useProblemDeco(health) {
  return useMemo(() => {
    const m = {};
    for (const r of problemsOf(health)) {
      const d = (m[r.member] ||= { fail: 0, warn: 0, info: 0, lines: [] });
      r.state === "fail" ? d.fail++ : r.state === "warn" ? d.warn++ : d.info++;
      d.lines.push(`${r.check.label}: ${r.detail}`);
    }
    return m;
  }, [health]);
}

function Deco({ d }) {
  if (!d || (!d.fail && !d.warn)) return null;
  return <span className={"v7-pdeco " + (d.fail ? "v7-pdeco-err" : "v7-pdeco-warn")} title={d.lines.join("\n")}>{d.fail || d.warn}</span>;
}

function fold0(activeKey, graph, sel) {
  if (activeKey?.startsWith("packages/")) { const p = graph.packages.find((x) => x.id === activeKey.slice(9)); return p ? "layer:" + p.layer : ""; }
  if (activeKey?.startsWith("types/") && sel?.type) return "mod:" + sel.type.module;
  return "";
}

export const Explorer = memo(function Explorer({ site, sel, lens, activeKey, expanded, setExpanded, sections, setSections, onOpenType, onOpenPackage, onOpenAgent, onOpenCompare, onOpenTypeLive }) {
  const { graph, health, diff } = site;
  const live = site.live.graph;
  const counts = useMemo(() => typeCounts(graph), [graph]);
  const deco = useProblemDeco(health);
  const [filter, setFilter] = useState("");
  const isOpen = (k, dflt) => (expanded[k] ?? dflt);
  const toggle = (k, dflt) => setExpanded({ ...expanded, [k]: !isOpen(k, dflt) });
  const layers = layersOf(graph);
  const pkgUses = useMemo(() => {
    const m = {};
    for (const u of graph.uses) {
      const p = (m[u.package] ||= {});
      const t = (p[u.type] ||= { produces: 0, consumes: 0, imports: 0 });
      t[u.kind]++;
    }
    return m;
  }, [graph]);
  const tById = useMemo(() => Object.fromEntries(graph.types.map((t) => [t.id, t])), [graph]);
  const changed = useMemo(() => {
    const m = {};
    if (!diff) return m;
    for (const c of diff.packages.changed) m[c.id] = { text: "M", title: `version ${c.here} here, ${c.live} on Live` };
    for (const id of diff.packages.added) m[id] = { text: "A", title: "only in this version" };
    const usesDelta = {};
    for (const u of diff.uses.removed) usesDelta[u.package] = (usesDelta[u.package] || 0) - 1;
    for (const u of diff.uses.added) usesDelta[u.package] = (usesDelta[u.package] || 0) + 1;
    for (const [p, n] of Object.entries(usesDelta)) if (!m[p] && graph.packages.some((x) => x.id === p) && n) m[p] = { text: "M", title: `${n > 0 ? "+" : ""}${n} type uses vs Live` };
    return m;
  }, [diff, graph]);
  const typeAdded = useMemo(() => new Set(diff?.types.added || []), [diff]);
  const selType = sel?.kind === "type" ? sel.id : null;
  const selPkg = sel?.kind === "package" ? sel.id : null;
  // VS Code's "reveal active file": expand the folder that holds the active editor's package or type, scroll it into view
  const root = useRef(null);
  useEffect(() => {
    if (!activeKey) return;
    let fold = null, tid = null;
    if (activeKey.startsWith("packages/")) { const p = graph.packages.find((x) => x.id === activeKey.slice(9)); if (p) { fold = "layer:" + p.layer; tid = "ex-pkg-" + p.id; } }
    else if (activeKey.startsWith("types/") && sel?.type) { fold = "mod:" + sel.type.module; tid = "ex-type-" + sel.type.name; }
    if (fold && expanded[fold] === false) { setExpanded({ ...expanded, [fold]: true }); return; }
    const t = setTimeout(() => root.current?.querySelector(`[data-testid="${tid}"]`)?.scrollIntoView({ block: "nearest" }), 60);
    return () => clearTimeout(t);
  }, [activeKey, graph, expanded[fold0(activeKey, graph, sel)]]);

  // ---- ROBOT-SDK tree ----
  const tree = [];
  for (const l of layers) {
    const pk = graph.packages.filter((p) => p.layer === l);
    const lk = "layer:" + l, lo = isOpen(lk, true);
    tree.push(<Row key={lk} depth={0} open={lo} icon={lo ? "folderOpen" : "folder"} iconClass="v7-ico-folder" label={LAYER_LABEL[l] || l}
      desc={pk.length > 1 ? String(pk.length) : null} onClick={() => toggle(lk, true)} testid={"ex-layer-" + l} />);
    if (!lo) continue;
    for (const p of pk) {
      const pkk = "pkg:" + p.id;
      const types = Object.entries(pkgUses[p.id] || {});
      const po = isOpen(pkk, false);
      const role = lens?.role?.[p.id];
      const showRole = sel?.kind === "type" && role;
      const d = deco[p.id];
      const ch = changed[p.id];
      tree.push(<Row key={pkk} depth={1} open={po} leaf={!types.length} icon="package" iconClass={"v7-ico-pkg" + (p.role === "viewer" ? " v7-ico-viewer" : "")}
        label={p.id} mono nameClass={d?.fail ? "v7-n-err" : ""} selected={activeKey === "packages/" + p.id}
        title={`${p.id} v${p.version} — ${p.one_line}${health ? `\nhealth: ${HEALTH_LABEL[healthOf(health, p.id)?.state] || "no row"}` : ""}${d?.lines?.length ? "\n" + d.lines.join("\n") : ""}`}
        onClick={() => onOpenPackage(p.id)} onDoubleClick={() => onOpenPackage(p.id, { pin: true })} onTwisty={types.length ? () => toggle(pkk, false) : undefined}
        testid={"ex-pkg-" + p.id}
        deco={<>{showRole && <span className={"v7-role v7-role-" + role}>{ROLE_LABEL[role]}</span>}{selPkg === p.id && <span className="v7-role v7-role-self">selected</span>}<Deco d={d} /></>}
        decoTitle={ch} decoClass={ch ? "v7-git-" + ch.text : ""} />);
      if (!po) continue;
      const order = { consumes: 0, produces: 1, imports: 2 };
      const list = types.map(([tid, k]) => ({ tid, k, t: tById[tid], main: k.consumes ? "consumes" : k.produces ? "produces" : "imports" }))
        .filter((x) => x.t).sort((a, b) => order[a.main] - order[b.main] || a.t.name.localeCompare(b.t.name));
      for (const x of list) {
        const words = ["consumes", "produces", "imports"].filter((kk) => x.k[kk]).map((kk) => KIND_WORD[kk]);
        tree.push(<Row key={pkk + ":" + x.tid} depth={2} leaf icon="types" iconClass={"v7-ico-k-" + x.main} label={x.t.name} mono
          desc={words.join(" · ")} selected={selType === x.tid && activeKey?.startsWith("types/")}
          title={`${x.t.module}.${x.t.name}: ${p.id} ${words.join(" and ")} it`}
          onClick={() => onOpenType(typeKey(graph, x.t))} onDoubleClick={() => onOpenType(typeKey(graph, x.t), { pin: true })} testid={`ex-ptype-${p.id}-${x.t.name}`} />);
      }
    }
  }
  const agents = graph.agents || [];
  if (agents.length) {
    const ao = isOpen("layer:agents", true);
    tree.push(<Row key="agents" depth={0} open={ao} icon={ao ? "folderOpen" : "folder"} iconClass="v7-ico-folder v7-ico-agentf" label="agents" desc={String(agents.length)} onClick={() => toggle("layer:agents", true)} testid="ex-layer-agents" />);
    if (ao) for (const a of agents) {
      const d = deco[a.id];
      tree.push(<Row key={"agent:" + a.id} depth={1} leaf icon="robot" iconClass="v7-ico-agent" label={a.name} selected={sel?.kind === "agent" && sel.id === a.id}
        title={a.objective} onClick={() => onOpenAgent(a.id)} testid={"ex-agent-" + a.id} deco={<Deco d={d} />} />);
    }
  }

  // ---- TYPES (the rail) ----
  const ql = filter.trim().toLowerCase();
  const max = Math.max(1, ...Object.values(counts).map((c) => c.total || 0));
  const mods = new Map();
  for (const t of graph.types) {
    if (ql && !`${t.name} ${t.module} ${t.what || ""}`.toLowerCase().includes(ql)) continue;
    if (!mods.has(t.module)) mods.set(t.module, []);
    mods.get(t.module).push(t);
  }
  for (const l of mods.values()) l.sort((a, b) => (counts[b.id]?.total || 0) - (counts[a.id]?.total || 0) || a.name.localeCompare(b.name));
  const typeRows = [];
  for (const [mod, list] of [...mods].sort((a, b) => a[0].localeCompare(b[0]))) {
    const mk = "mod:" + mod, mo = ql ? true : isOpen(mk, true);
    typeRows.push(<Row key={mk} depth={0} open={mo} icon={mo ? "folderOpen" : "folder"} iconClass="v7-ico-folder" label={mod.replace(/^robot_msgs\./, "")} desc={mod.startsWith("robot_msgs.") ? "robot_msgs" : null}
      onClick={() => toggle(mk, true)} testid={"ex-mod-" + mod} />);
    if (!mo) continue;
    for (const t of list) {
      const c = counts[t.id] || { total: 0 };
      const ga = typeAdded.has(t.id);
      typeRows.push(
        <div key={t.id} className={"v7-trow" + (selType === t.id ? " v7-sel" : "") + (c.total ? "" : " v7-unused")} role="treeitem" aria-selected={selType === t.id}
          onClick={() => onOpenType(typeKey(graph, t))} onDoubleClick={() => onOpenType(typeKey(graph, t), { pin: true })} title={`${t.module}.${t.name}${t.what ? " — " + t.what : ""}`} data-testid={"ex-type-" + t.name}>
          <Icon name="types" size={16} className="v7-row-ico v7-ico-type" />
          <span className="v7-trow-main">
            <span className="v7-trow-top"><span className="v7-row-name v7-mono">{t.name}</span><span className="v7-grow" />
              {ga && <span className="v7-deco v7-git-A" title="only in this version">A</span>}<span className="v7-trow-n">{c.total}</span></span>
            <span className="v7-trow-bar">{["produces", "consumes", "imports"].map((k) => c[k] ? <i key={k} className={"v7-b-" + k} style={{ width: `${(c[k] / max) * 100}%` }} /> : null)}</span>
          </span>
        </div>,
      );
    }
  }

  // ---- CHANGES vs Live (only off Live) ----
  const changes = [];
  if (diff && live) {
    for (const id of diff.packages.removed) changes.push(<Row key={"d:" + id} depth={0} leaf icon="package" iconClass="v7-ico-pkg" label={id} mono strike nameClass="v7-n-del"
      desc={LAYER_LABEL[live.packages.find((p) => p.id === id)?.layer] || ""} decoTitle={{ text: "D", title: "on Live, not in this version" }} decoClass="v7-git-D"
      onClick={() => onOpenPackage(id)} testid={"ex-chg-" + id} />);
    for (const c of diff.packages.changed) changes.push(<Row key={"m:" + c.id} depth={0} leaf icon="package" iconClass="v7-ico-pkg" label={c.id} mono nameClass="v7-n-mod"
      desc={`${c.live} → ${c.here}`} decoTitle={{ text: "M", title: `v${c.here} here, v${c.live} on Live` }} decoClass="v7-git-M" onClick={() => onOpenPackage(c.id)} testid={"ex-chg-" + c.id} />);
    for (const id of diff.packages.added) changes.push(<Row key={"a:" + id} depth={0} leaf icon="package" iconClass="v7-ico-pkg" label={id} mono nameClass="v7-n-add"
      decoTitle={{ text: "A", title: "only in this version" }} decoClass="v7-git-A" onClick={() => onOpenPackage(id)} />);
    const lt = Object.fromEntries(live.types.map((t) => [t.id, t]));
    if (diff.types.removed.length) {
      const tk = "chg:types", to = isOpen(tk, false);
      changes.push(<Row key={tk} depth={0} open={to} icon={to ? "folderOpen" : "folder"} iconClass="v7-ico-folder" label={`${diff.types.removed.length} types not in this version`}
        onClick={() => toggle(tk, false)} decoTitle={{ text: "D", title: "on Live, not in this version" }} decoClass="v7-git-D" />);
      if (to) for (const id of diff.types.removed) changes.push(<Row key={"dt:" + id} depth={1} leaf icon="types" iconClass="v7-ico-type" label={lt[id]?.name || id} mono strike nameClass="v7-n-del"
        desc={lt[id]?.module?.replace(/^robot_msgs\./, "")} onClick={() => onOpenTypeLive(id)} title="on Live, not in this version: opens it on Live" />);
    }
  }

  const collapseAll = () => { const e = {}; for (const l of layers) e["layer:" + l] = false; e["layer:agents"] = false; setExpanded(e); };
  return (
    <div className="v7-explorer" data-testid="explorer" ref={root}>
      <div className="v7-sb-title"><span>Explorer</span><span className="v7-grow" />
        <button className="v7-ibtn" onClick={collapseAll} title="Collapse Folders in Explorer" aria-label="Collapse all"><Icon name="collapseAll" /></button>
      </div>
      <Section id="robot-sdk" title="robot-sdk" count={`${graph.packages.length} packages`} open={sections.tree !== false} onToggle={() => setSections({ ...sections, tree: sections.tree === false })} grow={3}>
        {tree}
      </Section>
      <Section id="types" title="Types" count={graph.types.length} open={sections.types !== false} onToggle={() => setSections({ ...sections, types: sections.types === false })} grow={2.2}
        actions={null}>
        <div className="v7-sec-filter"><input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${graph.types.length} types`} aria-label="Filter types" data-testid="ex-type-filter" /></div>
        <div className="v7-legend"><i className="v7-b-produces" />returned <i className="v7-b-consumes" />taken <i className="v7-b-imports" />imported</div>
        {typeRows}
        {!typeRows.length && <p className="v7-empty-note">No type matches “{filter}”.</p>}
      </Section>
      {diff && <Section id="changes" title={`Changes vs Live`} count={diff.packages.removed.length + diff.packages.changed.length + diff.packages.added.length + (diff.types.removed.length ? 1 : 0)}
        open={sections.changes !== false} onToggle={() => setSections({ ...sections, changes: sections.changes === false })} grow={1.4}
        actions={<button className="v7-ibtn" onClick={onOpenCompare} title="Open the comparison with Live" aria-label="Compare with Live"><Icon name="diff" /></button>}>
        {changes}
        {!changes.length && <p className="v7-empty-note">Same packages and types as Live.</p>}
      </Section>}
    </div>
  );
});
