// Health, first-class (Zach, 2026-11-24: "I really like the health view super duper important … you want to be able
// to see like what is passing or not"). Reads robot-sdk-health/1 (docs/site-data-schema.md); never invents a pass, and
// never shows Live's health under another version (health is null there, and these components say so).
import { Fragment, useMemo, useState } from "react";
import { HEALTH_LABEL, HEALTH_RANK, healthOf, healthSummary, healthText, sortedMembers, fmtShortDate } from "./model.js";

export { healthOf, healthState, healthSummary, healthText, sortedMembers, HEALTH_LABEL } from "./model.js";

export function HealthDot({ state, title, size }) {
  const s = state || "unknown";
  return <span className={"k-dot k-st-" + s} style={size ? { width: size, height: size } : null} title={title || HEALTH_LABEL[s] || s} aria-label={HEALTH_LABEL[s] || s} role="img" />;
}

// "4 failing · 3 warnings · 9 passing" with a dot per part. summary: health.summary (or healthSummary(health)).
export function HealthPill({ summary, health, note, onClick, className = "" }) {
  const s = summary || healthSummary(health);
  const Tag = onClick ? "button" : "span";
  if (!s) return <Tag className={"k-hpill k-hpill-none " + className} onClick={onClick} title={note || "health not recorded"} data-testid="health-pill">health not recorded</Tag>;
  const part = (n, st, word) => n ? <span className="k-hpill-part" key={st}><HealthDot state={st} />{n} {word}</span> : null;
  return (
    <Tag className={"k-hpill " + className} onClick={onClick} title={healthText(s)} data-testid="health-pill">
      {part(s.fail, "fail", "failing")}{part(s.warn, "warn", s.warn === 1 ? "warning" : "warnings")}{part(s.running, "running", "running")}{part(s.pass, "pass", "passing")}{part(s.unknown, "unknown", "unknown")}
    </Tag>
  );
}

const SHORT = { tests: "Test", lint: "Decl", types: "Type", release: "Rel", upstream: "Repo" };

// One short word or number per check cell; the full detail is in the cell's title and its expanded row.
export function shortCheck(id, c) {
  if (!c) return "";
  const st = c.state;
  if (st === "none") return "—";
  if (st === "unknown") return "unknown";
  if (st === "running") return "running";
  if (id === "tests") return st === "pass" ? "passing" : st === "fail" ? "failing" : HEALTH_LABEL[st] || st;
  if (id === "lint") return st === "fail" ? `${(c.failures || []).length || ""} fail`.trim() : st === "warn" ? "undeclared" : "matches";
  if (id === "types") {
    if (st === "fail") return `${c.missing ?? "?"} missing`;
    if (st === "warn") return `${c.found ?? "?"} undeclared`;
    return c.verified != null ? `${c.verified} verified` : "ok";
  }
  if (id === "release") return c.pypi_latest ? (st === "pass" ? c.pypi_latest : `PyPI ${c.pypi_latest}`) : st === "warn" ? "not on PyPI" : "ok";
  if (id === "upstream") return st === "pass" ? "public" : st === "fail" ? "missing" : HEALTH_LABEL[st];
  return HEALTH_LABEL[st] || st;
}

function CheckDetail({ check, c, member }) {
  const fails = c.failures || [];
  return (
    <div className="k-hb-detail" data-testid={`health-detail-${member.id}-${check.id}`}>
      <div><HealthDot state={c.state} /> <b>{check.label}</b> <span className="k-muted">· {check.what}</span></div>
      <div className="k-hb-detail-text">{c.detail || HEALTH_LABEL[c.state]}</div>
      {fails.length > 0 && <ul className="k-hb-fails">{fails.map((f, i) => <li key={i}><code>{typeof f === "string" ? f : JSON.stringify(f)}</code></li>)}</ul>}
      {(c.pinned || c.sha || c.at || c.workflow) && <div className="k-muted k-small">
        {c.workflow && <>workflow <code>{c.workflow}</code> </>}{c.sha && <>at <code>{c.sha}</code> </>}{c.at && <>· {fmtShortDate(c.at)} </>}{c.pinned && <>· pinned <code>{c.pinned}</code></>}{c.pypi_latest && <> · PyPI {c.pypi_latest}</>}
      </div>}
      {c.url && <a href={c.url} target="_blank" rel="noreferrer">Open the evidence ↗</a>}
    </div>
  );
}

function Cell({ check, c, member, open, onToggle }) {
  if (!c) return <td className="k-hb-cell k-st-none"><span className="k-faint">—</span></td>;
  const text = shortCheck(check.id, c);
  const inner = <><HealthDot state={c.state} /><span className="k-hb-txt">{text}</span></>;
  const title = `${check.label}: ${c.detail || HEALTH_LABEL[c.state]}${c.url ? " (click for the evidence)" : ""}`;
  const tid = `health-cell-${member.id}-${check.id}`;
  // WHY a link when there is a url: one click from a failure to its evidence (CI run, PyPI page), criterion fr2.
  // Lint failures and checks without a url open their detail row instead.
  const hasFails = (c.failures || []).length > 0;
  return (
    <td className={"k-hb-cell k-st-" + c.state + (open ? " k-open" : "")}>
      {c.url && !hasFails
        ? <a className="k-hb-btn" href={c.url} target="_blank" rel="noreferrer" title={title} data-testid={tid}>{inner}</a>
        : <button className="k-hb-btn" onClick={onToggle} title={title} aria-expanded={open} data-testid={tid}>{inner}</button>}
    </td>
  );
}

// members × checks, failing first, packages then agents. Each cell: hover = detail; click = its url (CI run, PyPI) or
// the detail row (lint failures). Props: health (robot-sdk-health/1 or null), graph, note (why health is null),
// onOpenPackage(id), onOpenAgent(id), onBackToLive(), filter/onFilter (optional, "all" | "fail" | "warn").
export function HealthBoard({ health, graph, note, onOpenPackage, onOpenAgent, onBackToLive, filter: filterProp, onFilter, title = "Health", className = "" }) {
  const [filterState, setFilterState] = useState("all");
  const filter = filterProp ?? filterState;
  const setFilter = onFilter ?? setFilterState;
  const [openCell, setOpenCell] = useState(null);
  const members = useMemo(() => sortedMembers(health), [health]);
  if (!health) {
    return (
      <section className={"k-hb k-hb-missing " + className} data-testid="health-board">
        <div className="k-hb-head"><h3>{title}</h3><HealthPill summary={null} note={note} /></div>
        <p className="k-muted">{note || "Health was not recorded for this version."} The site never shows Live's checks under another version.</p>
        {onBackToLive && <button className="k-btn" onClick={onBackToLive}>Back to Live</button>}
      </section>
    );
  }
  const checks = health.checks || [];
  const summary = healthSummary(health);
  const names = Object.fromEntries([...(graph?.packages || []).map((p) => [p.id, p.id]), ...(graph?.agents || []).map((a) => [a.id, a.name])]);
  const keep = (m) => filter === "all" || (filter === "fail" ? m.state === "fail" : filter === "warn" ? m.state === "warn" : true);
  const groups = [["package", "Packages"], ["agent", "Agents"]].map(([k, lab]) => [lab, members.filter((m) => (m.kind || "package") === k && keep(m))]).filter(([, l]) => l.length);
  const n = (st) => members.filter((m) => m.state === st).length;
  return (
    <section className={"k-hb " + className} data-testid="health-board">
      <div className="k-hb-head">
        <h3>{title}</h3>
        <HealthPill summary={summary} />
        <span className="k-grow" />
        <div className="k-seg" role="group" aria-label="Filter">
          {[["all", `All ${members.length}`], ["fail", `Failing ${n("fail")}`], ["warn", `Warnings ${n("warn")}`]].map(([id, lab]) => (
            <button key={id} className={"k-seg-btn" + (filter === id ? " on" : "")} aria-pressed={filter === id} onClick={() => setFilter(id)} data-testid={"health-filter-" + id}>{lab}</button>
          ))}
        </div>
      </div>
      <div className="k-hb-scroll">
        <table className="k-hb-table">
          <thead><tr><th className="k-hb-name">member</th>{checks.map((c) => <th key={c.id} title={`${c.label}: ${c.what}`}><span className="k-hb-long">{c.label}</span><span className="k-hb-short" aria-hidden>{SHORT[c.id] || c.label.slice(0, 5)}</span></th>)}</tr></thead>
          <tbody>
            {groups.map(([lab, list]) => (
              <Fragment key={lab}>
                <tr className="k-hb-group"><td colSpan={checks.length + 1}>{lab} <span className="k-faint">{list.length}</span></td></tr>
                {list.map((m) => {
                  const open = openCell?.startsWith(m.id + "|") ? checks.find((c) => openCell === m.id + "|" + c.id) : null;
                  const isAgent = m.kind === "agent";
                  const openMember = isAgent ? onOpenAgent : onOpenPackage;
                  return (
                    <Fragment key={m.id}>
                      <tr className={"k-hb-row k-st-" + m.state} data-testid={"health-row-" + m.id}>
                        <th className="k-hb-name" scope="row"><div className="k-hb-namein">
                          <HealthDot state={m.state} />
                          {openMember ? <button className="k-hb-member" onClick={() => openMember(m.id)} title={`open ${names[m.id] || m.id}`}>{isAgent ? names[m.id] || m.id : <code>{m.id}</code>}</button>
                            : <span className="k-hb-member">{isAgent ? names[m.id] || m.id : <code>{m.id}</code>}</span>}
                        </div></th>
                        {checks.map((c) => <Cell key={c.id} check={c} c={m.checks?.[c.id]} member={m} open={openCell === m.id + "|" + c.id}
                          onToggle={() => setOpenCell(openCell === m.id + "|" + c.id ? null : m.id + "|" + c.id)} />)}
                      </tr>
                      {open && <tr className="k-hb-x"><td colSpan={checks.length + 1}><CheckDetail check={open} c={m.checks[open.id]} member={m} /></td></tr>}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
            {!groups.length && <tr><td colSpan={checks.length + 1} className="k-muted">Nothing {filter === "fail" ? "failing" : "with a warning"}.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="k-hb-foot k-faint">Hover a cell for its detail; click it for the CI run, the PyPI page or the lint lines. · health.json generated {fmtShortDate(health.generated)} against graph.json {fmtShortDate(health.graph_generated)}</p>
    </section>
  );
}

// A compact per-member strip (dot + failing checks) for cards and lists.
export function HealthInline({ health, id, max = 2 }) {
  const m = healthOf(health, id);
  if (!m) return null;
  const bad = (health.checks || []).filter((c) => ["fail", "warn"].includes(m.checks?.[c.id]?.state))
    .sort((a, b) => (HEALTH_RANK[m.checks[a.id].state] ?? 9) - (HEALTH_RANK[m.checks[b.id].state] ?? 9));
  return (
    <span className={"k-hinline k-st-" + m.state} title={bad.map((c) => `${c.label}: ${m.checks[c.id].detail || m.checks[c.id].state}`).join("\n") || "all checks pass"}>
      <HealthDot state={m.state} />
      {bad.length ? bad.slice(0, max).map((c) => <span key={c.id} className={"k-hinline-c k-st-" + m.checks[c.id].state}>{c.label.toLowerCase()} {shortCheck(c.id, m.checks[c.id])}</span>) : <span className="k-hinline-c">{HEALTH_LABEL[m.state]}</span>}
      {bad.length > max && <span className="k-faint">+{bad.length - max}</span>}
    </span>
  );
}
