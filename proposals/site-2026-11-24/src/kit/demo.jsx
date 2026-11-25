// The kit's demo page: every component on the real data, so the kit is checked the way variants will use it.
// VARIANT=kit npx vite build -> kit/index.html. Deep links work here too: #/types/JointState?v=release.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useSite, useRoute, WORKSPACES, TopRight, VersionBanner, HealthPill, HealthBoard, Directory, PackageMap, TypeWorkspace,
  TypeActions, TypeSearch, TypeLink, Pitch, RunPanel, AgentsPanel, SkillPanel, healthSummary, diffText, resolveType, fmtShortDate,
} from "@kit";
import "./demo.css";

const SECTIONS = [["data", "useSite"], ["health", "Health"], ["directory", "Directory"], ["packages", "PackageMap"], ["types", "TypeWorkspace"], ["actions", "TypeActions + search"], ["panels", "Panels"]];

function Section({ id, title, api, children }) {
  return (
    <section className="demo-sec" id={"sec-" + id} data-testid={"demo-" + id}>
      <div className="demo-sec-head"><h2>{title}</h2>{api && <code className="demo-api">{api}</code>}</div>
      {children}
    </section>
  );
}

function App() {
  const site = useSite();
  const route = useRoute("types");
  const [last, setLast] = useState(null);
  if (site.error) return <div className="demo-wrap"><h1>Could not load the data</h1><p>{String(site.error.message || site.error)}</p></div>;
  if (!site.ready) return <div className="demo-wrap demo-loading">Loading graph.json, health.json, versions.json…</div>;
  const { graph, health } = site;
  const typeKey = route.ws === "types" && route.arg ? route.arg : "JointTrajectory";
  const t = resolveType(graph, typeKey);
  const onOpenType = (k) => { setLast(`onOpenType("${k}")`); route.go("types", k); };
  const onOpenPackage = (id) => setLast(`onOpenPackage("${id}")`);
  const onOpenAgent = (id) => setLast(`onOpenAgent("${id}")`);
  const jump = (id) => document.getElementById("sec-" + id)?.scrollIntoView({ block: "start" });
  return (
    <>
      <header className="demo-top">
        <b className="demo-brand">robot-sdk <span>workspace kit</span></b>
        <nav className="demo-nav">{SECTIONS.map(([id, l]) => <a key={id} href={"#sec-" + id} onClick={(e) => { e.preventDefault(); jump(id); }}>{l}</a>)}</nav>
        <TopRight site={site}><HealthPill summary={healthSummary(health)} note={site.healthNote} onClick={() => jump("health")} /></TopRight>
      </header>
      <div className="demo-wrap">
        <VersionBanner site={site} onOpenPackage={onOpenPackage} onOpenType={onOpenType} />
        {last && <div className="demo-last" data-testid="demo-last">last callback: <code>{last}</code></div>}

        <Section id="data" title="useSite() · useRoute()" api="const site = useSite(); const route = useRoute('types')">
          <table className="demo-kv"><tbody>
            <tr><th>version on screen</th><td><code>{site.versionId}</code> — {site.version?.label} ({site.version?.kind}){site.loading ? " · loading " + site.requestedId : ""}</td></tr>
            <tr><th>versions</th><td>{site.versions.map((v) => <span key={v.id} className={"demo-v" + (v.available ? "" : " na")} title={v.reason || v.summary}>{v.label}</span>)}</td></tr>
            <tr><th>graph</th><td>{graph.packages.length} packages · {graph.types.length} types · {graph.uses.length} uses · {(graph.agents || []).length} agents · generated {fmtShortDate(graph.generated)}</td></tr>
            <tr><th>health</th><td>{health ? <>{(health.members || []).length} members · {(health.checks || []).length} checks · generated {fmtShortDate(health.generated)}</> : <span className="k-muted">{site.healthNote}</span>}</td></tr>
            <tr><th>diff vs Live</th><td>{site.diff ? diffText(site.diff) : <span className="k-muted">on Live</span>}</td></tr>
            <tr><th>sources</th><td className="k-small">{Object.entries(site.source || {}).map(([k, v]) => <span key={k} className="demo-src"><b>{k}</b> {v}</span>)}</td></tr>
            <tr><th>route</th><td><code>{route.hash || "(empty)"}</code> → ws <code>{route.ws}</code> args <code>{JSON.stringify(route.args)}</code> v <code>{route.v}</code></td></tr>
            <tr><th>WORKSPACES</th><td>{WORKSPACES.map((w) => <code key={w.id} className="demo-src">{w.id}</code>)}</td></tr>
          </tbody></table>
          <Pitch onOpenRun={() => jump("panels")} onOpenTypes={() => jump("types")} />
        </Section>

        <Section id="health" title="HealthBoard" api="<HealthBoard health graph note onOpenPackage onOpenAgent onBackToLive />">
          <HealthBoard health={health} graph={graph} note={site.healthNote} onOpenPackage={onOpenPackage} onOpenAgent={onOpenAgent} onBackToLive={() => site.setVersion("live")} />
        </Section>

        <Section id="directory" title="Directory" api="<Directory graph health onOpenPackage onOpenAgent />  (Cards ⇄ Compact, remembered)">
          <Directory graph={graph} health={health} onOpenPackage={onOpenPackage} onOpenAgent={onOpenAgent} />
        </Section>

        <Section id="packages" title="PackageMap" api="<PackageMap graph health onOpenPackage onOpenType />  (tree ⇄ pipeline, group by layer)">
          <PackageMap graph={graph} health={health} onOpenPackage={onOpenPackage} onOpenType={onOpenType} />
        </Section>

        <Section id="types" title="TypeWorkspace" api="<TypeWorkspace graph health typeKey onOpenType onOpenPackage sourceUrl />">
          <TypeWorkspace graph={graph} health={health} typeKey={typeKey} onOpenType={onOpenType} onOpenPackage={onOpenPackage} sourceUrl={site.sourceUrl} height={800} />
        </Section>

        <Section id="actions" title="TypeActions · TypeSearch · TypeLink" api="<TypeActions graph typeId health sourceUrl /> · <TypeSearch graph /> · <TypeLink graph id />">
          <div className="demo-2col">
            <div className="demo-card"><TypeActions graph={graph} typeId={t?.id || typeKey} health={health} sourceUrl={site.sourceUrl} onOpenType={onOpenType} onOpenPackage={onOpenPackage} limit={3} /></div>
            <div className="demo-card">
              <TypeSearch graph={graph} health={health} sourceUrl={site.sourceUrl} onOpenType={onOpenType} onOpenPackage={onOpenPackage} />
              <p className="k-small k-muted">TypeLink: {["robot_msgs.trajectory.JointTrajectory", "JointState", "ServoCommand", "PoseTrajectory"].map((id) => <span key={id}><TypeLink graph={graph} id={id} onOpen={onOpenType} /> · </span>)}</p>
            </div>
          </div>
        </Section>

        <Section id="panels" title="RunPanel · AgentsPanel · SkillPanel" api="<RunPanel pick graph health onOpenType /> · <AgentsPanel graph health /> · <SkillPanel />">
          <RunPanel pick={site.pick} graph={graph} health={health} onOpenType={onOpenType} onOpenPackage={onOpenPackage} />
          <h3 className="demo-h3">Agents</h3>
          <AgentsPanel graph={graph} health={health} onOpenPackage={onOpenPackage} />
          <h3 className="demo-h3">For coding agents</h3>
          <SkillPanel />
        </Section>
        <footer className="demo-foot k-small k-muted">Every number on this page comes from site/data (graph.json, health.json, versions.json, pick_and_place.json), read at runtime; offline it is the copy embedded at build time and only Live is available.</footer>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
