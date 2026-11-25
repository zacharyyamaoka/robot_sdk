// Directory, Compact: GitHub's file browser table (icon · name · one line · version · status), one folder row per
// layer, agents last. Cards is the kit's own Directory. Same links as the kit's (GitHub, Site where declared, PyPI,
// README, Docs) so the directory stays one click from every package's own pages (gate g5).
import { DirModeToggle, PkgLinks, TypeText, healthOf } from "@kit";
import { LAYER_LABEL, LAYER_BLURB, layersOf } from "@shared/graph.js";
import { Icon, StatusIcon } from "./icons.jsx";
import { worstLine } from "./checks.jsx";

function Status({ health, id, href }) {
  const m = healthOf(health, id);
  if (!health) return <span className="gh-ft-status" title="health not recorded for this version"><StatusIcon state="unknown" title="not recorded" /></span>;
  if (!m) return <span className="gh-ft-status"><StatusIcon state="unknown" title="no health row" /></span>;
  const w = worstLine(health, m);
  return <a className="gh-ft-status" href={href} title={`${m.state}: ${w.text}`} data-testid={"v6-ft-status-" + id}><StatusIcon state={m.state} /></a>;
}

// Props: graph, health, mode, onMode, onOpenPackage(id), onOpenAgent(id), healthHref(id)
export function FileTable({ graph, health, mode, onMode, onOpenPackage, onOpenAgent, onOpenType, healthHref }) {
  const layers = layersOf(graph);
  const agents = graph.agents || [];
  return (
    <section className="gh-box gh-ft" data-testid="v6-filetable">
      {/* Same head as the kit's Directory (title, counts, the Cards/Compact toggle), so the toggle sits in one place in both modes. */}
      <div className="gh-box-head k-dir-head">
        <h3>Directory</h3>
        <span className="k-muted k-small">{graph.packages.length} packages · {agents.length} agents · by layer, vocabulary first</span>
        <span className="k-grow" />
        <DirModeToggle mode={mode} onMode={onMode} />
      </div>
      <div className="gh-ft-rows" role="table" aria-label="robot-sdk packages">
        <div className="gh-ft-row gh-ft-colhead" role="row">
          <span role="columnheader">Name</span><span role="columnheader">What it is</span><span role="columnheader" className="gh-ft-links-h">Links</span>
          <span role="columnheader" className="gh-ft-ver">Version</span><span role="columnheader" className="gh-ft-st-h">Health</span>
        </div>
        {layers.map((l) => (
          <div key={l} role="rowgroup" className="gh-ft-group" data-testid={"v6-ft-layer-" + l}>
            <div className="gh-ft-row gh-ft-folder" role="row">
              <span className="gh-ft-name"><Icon name="folder" className="gh-ic-folder" /><b>{LAYER_LABEL[l] || l}</b></span>
              <span className="gh-ft-msg gh-muted" title={LAYER_BLURB[l] || ""}>{LAYER_BLURB[l] || ""}</span>
            </div>
            {graph.packages.filter((p) => p.layer === l).map((p) => (
              <div key={p.id} className={"gh-ft-row gh-ft-pkg" + (p.role === "viewer" ? " is-viewer" : "")} role="row" data-testid={"dir-row-" + p.id}>
                <span className="gh-ft-name">
                  <Icon name="package" className="gh-ic-file" />
                  <button className="gh-ft-link" onClick={() => onOpenPackage(p.id)} title="its types, uses and checks"><code>{p.id}</code></button>
                  {p.role === "viewer" && <span className="gh-label gh-label-viewer">viewer</span>}
                </span>
                {/* WHY title: the one line is cut with an ellipsis here; the full text stays one hover away. */}
                <span className="gh-ft-msg gh-muted" title={p.one_line}><TypeText text={p.one_line} graph={graph} onOpenType={onOpenType} /></span>
                <span className="gh-ft-links"><PkgLinks pkg={p} compact /></span>
                <span className="gh-ft-ver gh-muted">v{p.version}</span>
                <Status health={health} id={p.id} href={healthHref(p.id)} />
              </div>
            ))}
          </div>
        ))}
        {agents.length > 0 && <div role="rowgroup" className="gh-ft-group">
          <div className="gh-ft-row gh-ft-folder" role="row">
            <span className="gh-ft-name"><Icon name="folder" className="gh-ic-folder" /><b>agents</b></span>
            <span className="gh-ft-msg gh-muted">An agent imports packages; a package never imports an agent.</span>
          </div>
          {agents.map((a) => (
            <div key={a.id} className="gh-ft-row gh-ft-pkg is-agent" role="row" data-testid={"dir-agent-" + a.id}>
              <span className="gh-ft-name">
                <Icon name="agent" className="gh-ic-agent" />
                <button className="gh-ft-link gh-sans" onClick={() => onOpenAgent(a.id)}>{a.name}</button>
              </span>
              <span className="gh-ft-msg gh-muted" title={a.one_line || a.objective}>{a.one_line || a.objective}</span>
              <span className="gh-ft-links"><PkgLinks agent={a} compact /></span>
              <span className="gh-ft-ver gh-faint">—</span>
              <Status health={health} id={a.id} href={healthHref(a.id)} />
            </div>
          ))}
        </div>}
      </div>
    </section>
  );
}
