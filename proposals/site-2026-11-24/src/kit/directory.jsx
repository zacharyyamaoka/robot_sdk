// The directory: every package by layer (viewers included) and every agent, one click to GitHub / Site / PyPI / README.
// Two forms behind one toggle (Zach, 2026-11-24: "I like this more directory like view [V1's layer cards] … I do like
// how compact this directory view is as well though [V5] … Maybe you can like switch between like cards vs compact").
// The mode is remembered per viewer (localStorage, try/catch: a blocked store just means no memory).
import { useState } from "react";
import { PkgLinks } from "@shared/parts.jsx";
import { LAYER_LABEL, LAYER_BLURB, layersOf, usesOfPackage } from "@shared/graph.js";
import { HealthDot, HealthInline } from "./health.jsx";
import { healthOf } from "./model.js";

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* per-viewer convenience only */ } },
};

// WHY per page (kit check, 2026-11-25): a key shared by every variant served from the same origin (the gallery's
// /v6/ … /v10/, the kit demo) let a toggle in one prototype change the others. Kit components default to
// `<base>:<page path>`; an explicit key is used as given.
export function pagePathKey(base) {
  let path = "";
  try { path = location.pathname.replace(/index\.html$/, ""); } catch { /* no location: one shared key */ }
  return path ? `${base}:${path}` : base;
}

// useStoredState("rsdk-kit-dir-mode", "cards", ["cards", "compact"]) — remembered per viewer, falls back silently.
export function useStoredState(key, initial, allowed) {
  const [v, setV] = useState(() => { const s = store.get(key); return s != null && (!allowed || allowed.includes(s)) ? s : initial; });
  return [v, (x) => { setV(x); store.set(key, x); }];
}

export function DirModeToggle({ mode, onMode }) {
  return (
    <div className="k-seg" role="group" aria-label="Directory layout">
      <button className={"k-seg-btn" + (mode === "cards" ? " on" : "")} aria-pressed={mode === "cards"} onClick={() => onMode("cards")} data-testid="dir-mode-cards">Cards</button>
      <button className={"k-seg-btn" + (mode === "compact" ? " on" : "")} aria-pressed={mode === "compact"} onClick={() => onMode("compact")} data-testid="dir-mode-compact">Compact</button>
    </div>
  );
}

function counts(graph, id) {
  const rows = usesOfPackage(graph, id);
  const c = { produces: 0, consumes: 0, imports: 0, total: rows.length };
  for (const u of rows) c[u.kind]++;
  return c;
}

function PackageCard({ graph, health, p, onOpenPackage }) {
  const c = counts(graph, p.id);
  const defines = graph.types.filter((t) => t.package === p.id).length;
  return (
    <div className={"k-card" + (p.role === "viewer" ? " k-viewer" : "")} data-testid={"dir-card-" + p.id}>
      <div className="k-card-head">
        <code className="k-card-name">{p.id}</code>
        <span className="k-tag">v{p.version}</span>
        {health && <HealthDot state={healthOf(health, p.id)?.state || "unknown"} title={healthOf(health, p.id) ? undefined : "no health row"} />}
      </div>
      <p className="k-card-one">{p.one_line}</p>
      <div className="k-card-meta">
        {c.total ? <><span className="k-c-prod">{c.produces} produce</span> · <span className="k-c-cons">{c.consumes} consume</span> · {c.imports} import</>
          : defines ? <span>defines {defines} types</span> : <span className="k-faint">no type uses</span>}
        {health && <HealthInline health={health} id={p.id} />}
      </div>
      <div className="k-card-links">
        {onOpenPackage && <button className="k-btn k-btn-drill" onClick={() => onOpenPackage(p.id)} data-testid={"dir-open-" + p.id}>types &amp; uses</button>}
        <PkgLinks pkg={p} />
      </div>
    </div>
  );
}

function AgentCardSmall({ health, a, onOpenAgent, compact }) {
  const m = healthOf(health, a.id);
  return (
    <div className={compact ? "k-dirc-row k-agent" : "k-card k-agent"} data-testid={"dir-agent-" + a.id}>
      <div className="k-card-head">
        {onOpenAgent ? <button className="k-linkish" onClick={() => onOpenAgent(a.id)}><b>{a.name}</b></button> : <b>{a.name}</b>}
        {health && <HealthDot state={m?.state || "unknown"} />}
      </div>
      <p className={compact ? "k-dirc-one" : "k-card-one"} title={compact ? a.one_line || a.objective : undefined}>{a.one_line || a.objective}</p>
      <PkgLinks agent={a} compact={compact} />
    </div>
  );
}

// Props: graph, health (or null), mode/onMode (optional; else remembered under storageKey, default
// "rsdk-kit-dir-mode:<page path>"), onOpenPackage(id), onOpenAgent(id), showAgents = true, title.
export function Directory({ graph, health, mode: modeProp, onMode, onOpenPackage, onOpenAgent, showAgents = true, title = "Directory", storageKey, className = "" }) {
  const [stored, setStored] = useStoredState(storageKey || pagePathKey("rsdk-kit-dir-mode"), "cards", ["cards", "compact"]);
  const mode = modeProp ?? stored;
  const setMode = onMode ?? setStored;
  const layers = [...layersOf(graph)];
  const agents = showAgents ? graph.agents || [] : [];
  return (
    <section className={"k-dir k-dirmode-" + mode + " " + className} data-testid="directory">
      <div className="k-dir-head">
        <h3>{title}</h3>
        <span className="k-muted k-small">{graph.packages.length} packages · {(graph.agents || []).length} agents · by layer, vocabulary first</span>
        <span className="k-grow" />
        <DirModeToggle mode={mode} onMode={setMode} />
      </div>
      {mode === "cards" ? (
        <div className="k-dir-layers">
          {layers.map((l) => (
            <div key={l} className={"k-dir-layer k-layer-" + l}>
              <div className="k-dir-side"><div className="k-dir-lname">{LAYER_LABEL[l] || l}</div><p>{LAYER_BLURB[l] || ""}</p></div>
              <div className="k-dir-cards">{graph.packages.filter((p) => p.layer === l).map((p) => <PackageCard key={p.id} graph={graph} health={health} p={p} onOpenPackage={onOpenPackage} />)}</div>
            </div>
          ))}
          {agents.length > 0 && <div className="k-dir-layer k-layer-agents">
            <div className="k-dir-side"><div className="k-dir-lname">agents</div><p>An agent imports packages; a package never imports an agent.</p></div>
            <div className="k-dir-cards">{agents.map((a) => <AgentCardSmall key={a.id} health={health} a={a} onOpenAgent={onOpenAgent} />)}</div>
          </div>}
        </div>
      ) : (
        <div className="k-dirc">
          {layers.map((l) => (
            <div key={l} className="k-dirc-layer">
              <div className="k-dirc-lh" title={LAYER_BLURB[l] || ""}>{LAYER_LABEL[l] || l}</div>
              {graph.packages.filter((p) => p.layer === l).map((p) => {
                const st = healthOf(health, p.id)?.state;
                return (
                  <div key={p.id} className={"k-dirc-row" + (p.role === "viewer" ? " k-viewer" : "")} data-testid={"dir-row-" + p.id}>
                    <div className="k-dirc-top">
                      {onOpenPackage ? <button className="k-dirc-name" onClick={() => onOpenPackage(p.id)} title="its types and uses"><code>{p.id}</code></button> : <code className="k-dirc-name">{p.id}</code>}
                      {p.role === "viewer" && <span className="k-tag k-tag-viewer">viewer</span>}
                      <span className="k-grow" />
                      <span className="k-faint k-small">v{p.version}</span>
                      {health && <HealthDot state={st || "unknown"} />}
                    </div>
                    {/* WHY title: compact cuts one_line with an ellipsis; the full text stays one hover away. */}
                    <div className="k-dirc-one" title={p.one_line}>{p.one_line}</div>
                    <PkgLinks pkg={p} compact />
                  </div>
                );
              })}
            </div>
          ))}
          {agents.length > 0 && <div className="k-dirc-layer">
            <div className="k-dirc-lh">agents</div>
            {agents.map((a) => <AgentCardSmall key={a.id} health={health} a={a} onOpenAgent={onOpenAgent} compact />)}
          </div>}
        </div>
      )}
    </section>
  );
}
