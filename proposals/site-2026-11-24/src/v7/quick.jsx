// VS Code's quick input, three ways in:
//   Ctrl+P         go to a type, a package, an agent or a workspace by name; "JointTrajectory ->" lists the functions
//                  that take one, "-> JointTrajectory" the ones that return one (kit typeSearch)
//   Ctrl+Shift+P   ">" commands (toggle Problems, split, switch version…)
//   status bar ⎇   the version quick pick (Live, Latest release, snapshots), like VS Code's branch picker
import { useEffect, useMemo, useRef, useState } from "react";
import { matchTypes, typeSearch, typeCounts, typeKey, healthOf, HealthDot, LAYER_LABEL, fmtShortDate } from "@kit";
import { Icon } from "./icons.jsx";

// "JointTrajectory, JointState → TrackingResult", or "takes JointTrajectory" / "returns JointTrajectory" when one side is empty
function sigLine(graph, s) {
  const nm = (id) => graph.types.find((t) => t.id === id)?.name || String(id).split(".").pop();
  const i = s.inputs.map(nm).join(", "), o = s.outputs.map(nm).join(", ");
  return i && o ? `${i} → ${o}` : i ? `takes ${i}` : o ? `returns ${o}` : "imports only";
}

function Hl({ text, q }) {
  const t = String(text ?? "");
  const i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (!q || i < 0) return <>{t}</>;
  return <>{t.slice(0, i)}<mark>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>;
}

export function QuickOpen({ mode: modeIn, site, tabs, labelOf, commands, onClose, onOpenKey, onOpenFunction }) {
  const [text, setText] = useState(modeIn === "commands" ? ">" : "");
  const [i, setI] = useState(0);
  const input = useRef(null), list = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  const mode = modeIn === "versions" ? "versions" : text.startsWith(">") ? "commands" : "files";
  const q = mode === "commands" ? text.slice(1).trim() : text.trim();
  const { graph, health } = site;
  const counts = useMemo(() => typeCounts(graph), [graph]);

  const items = useMemo(() => {
    const out = [];
    if (mode === "versions") {
      const ql = q.toLowerCase();
      let lastGroup = null;
      for (const v of site.versions) {
        if (ql && !`${v.label} ${v.id} ${v.summary || ""}`.toLowerCase().includes(ql)) continue;
        const group = v.kind === "snapshot" ? "snapshots (previous publishes)" : "channels";
        out.push({ id: "v:" + v.id, sep: group !== lastGroup ? group : null, icon: v.kind === "snapshot" ? "history" : "branch", label: v.label,
          desc: v.id === site.versionId ? "current" : v.id === (site.versionsDoc?.default || "live") ? "default" : "",
          detail: v.available ? [v.summary, fmtShortDate(v.published || v.generated), (v.built_from || "").slice(0, 7)].filter(Boolean).join(" · ") : v.reason,
          disabled: !v.available, on: v.id === site.versionId, pick: () => site.setVersion(v.id), testid: "qp-version-" + v.id });
        lastGroup = group;
      }
      return out;
    }
    if (mode === "commands") {
      const ql = q.toLowerCase();
      for (const c of commands) if (!ql || c.label.toLowerCase().includes(ql)) out.push({ id: "c:" + c.id, icon: c.icon, label: c.label, right: c.keys, pick: c.run, testid: "qp-cmd-" + c.id });
      return out;
    }
    // files
    if (/->|→|=>/.test(q)) {
      const r = typeSearch(graph, q);
      const head = `${r.functions.length} function${r.functions.length === 1 ? "" : "s"}${r.from ? ` taking ${r.from.map((t) => t.name).join("/")}` : ""}${r.to ? ` returning ${r.to.map((t) => t.name).join("/")}` : ""}`;
      r.functions.slice(0, 60).forEach((s, n) => out.push({ id: "f:" + s.id, sep: n === 0 ? head : null, icon: "method", iconClass: "v7-ico-method", label: s.name,
        desc: sigLine(graph, s), right: <><HealthDot state={healthOf(health, s.package)?.state || "unknown"} /> {s.package} · {s.where.split("/").pop()}</>,
        pick: () => onOpenFunction(s, r), testid: "qp-fn-" + s.package + "-" + s.name }));
      if (!r.functions.length) r.chains.slice(0, 20).forEach((c, n) => out.push({ id: "ch:" + n, sep: n === 0 ? `no single function; ${r.chains.length} two-step chains` : null, icon: "method", iconClass: "v7-ico-method",
        label: `${c.first.name} → ${c.second.name}`, desc: `${c.first.package} → ${c.second.package}`, pick: () => onOpenFunction(c.first, r) }));
      return out;
    }
    const ql = q.toLowerCase();
    if (!q) {
      const seen = new Set();
      tabs.forEach((k, n) => { if (seen.has(k)) return; seen.add(k); out.push({ id: "r:" + k, sep: n === 0 ? "recently opened" : null, ...labelOf(k), pick: () => onOpenKey(k), right: "open editor" }); });
    }
    const types = q ? matchTypes(graph, q) : [...graph.types].sort((a, b) => (counts[b.id]?.total || 0) - (counts[a.id]?.total || 0)).slice(0, 8);
    types.slice(0, 14).forEach((t, n) => out.push({ id: "t:" + t.id, sep: n === 0 ? (q ? "types" : "most used types") : null, icon: "types", iconClass: "v7-ico-type", label: t.name, desc: t.module,
      right: `${counts[t.id]?.total || 0} uses`, pick: () => onOpenKey("types/" + typeKey(graph, t)), testid: "qp-type-" + t.name }));
    const pkgs = graph.packages.filter((p) => !q || p.id.toLowerCase().includes(ql) || (p.one_line || "").toLowerCase().includes(ql));
    pkgs.forEach((p, n) => out.push({ id: "p:" + p.id, sep: n === 0 ? "packages" : null, icon: "package", iconClass: "v7-ico-pkg", label: p.id, desc: `${LAYER_LABEL[p.layer] || p.layer} · ${p.one_line}`,
      right: <HealthDot state={healthOf(health, p.id)?.state || "unknown"} />, pick: () => onOpenKey("packages/" + p.id), testid: "qp-pkg-" + p.id }));
    (graph.agents || []).filter((a) => !q || a.name.toLowerCase().includes(ql)).forEach((a, n) => out.push({ id: "a:" + a.id, sep: n === 0 ? "agents" : null, icon: "robot", iconClass: "v7-ico-agent",
      label: a.name, desc: a.one_line || a.objective, pick: () => onOpenKey("agents", a.id) }));
    for (const c of commands.filter((c) => c.ws && q && c.label.toLowerCase().includes(ql))) out.push({ id: "w:" + c.id, sep: null, icon: c.icon, label: c.label, right: "workspace", pick: c.run });
    return out;
  }, [mode, q, site, graph, health, counts, tabs, commands]);

  const pickable = items.filter((x) => !x.disabled);
  const cur = Math.min(i, Math.max(0, pickable.length - 1));
  useEffect(() => { setI(0); }, [q, mode]);
  useEffect(() => { list.current?.querySelector(".v7-qi-row.v7-focus")?.scrollIntoView({ block: "nearest" }); }, [cur]);
  const pick = (it) => { if (!it || it.disabled) return; onClose(); it.pick(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, pickable.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(pickable[cur]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  const placeholder = mode === "versions" ? "Select a version to view (Live is the default)" : mode === "commands" ? "Type the name of a command to run" : "Go to a type or package — or try “JointTrajectory ->”";
  return (
    <div className="v7-qi-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="quick-open">
      <div className="v7-qi" role="dialog" aria-label="Quick open">
        {mode === "versions" && <div className="v7-qi-title">Switch version</div>}
        <input ref={input} className="v7-qi-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={placeholder} aria-label={placeholder} data-testid="quick-open-input" spellCheck={false} />
        <div className="v7-qi-list" ref={list} role="listbox">
          {items.map((it) => {
            const pi = pickable.indexOf(it);
            return (
              <div key={it.id}>
                {it.sep && <div className="v7-qi-sep">{it.sep}</div>}
                <div className={"v7-qi-row" + (pi === cur && !it.disabled ? " v7-focus" : "") + (it.disabled ? " v7-dis" : "")} role="option" aria-selected={pi === cur} aria-disabled={it.disabled}
                  onMouseMove={() => pi >= 0 && pi !== cur && setI(pi)} onClick={() => pick(it)} data-testid={it.testid}>
                  <span className="v7-qi-check">{it.on ? <Icon name="check" size={14} /> : null}</span>
                  {it.icon && <Icon name={it.icon} className={it.iconClass || ""} />}
                  <span className="v7-qi-main">
                    <span className="v7-qi-line">
                      <span className="v7-qi-label"><Hl text={it.label} q={mode === "files" && !/->/.test(q) ? q : mode === "commands" ? q : ""} /></span>
                      {it.desc && <span className="v7-qi-desc">{it.desc}</span>}
                    </span>
                    {it.detail && <span className="v7-qi-detail">{it.detail}</span>}
                  </span>
                  {it.right && <span className="v7-qi-right">{it.right}</span>}
                </div>
              </div>
            );
          })}
          {!items.length && <div className="v7-qi-empty">No matching results</div>}
        </div>
      </div>
    </div>
  );
}
