// Health in GitHub's own words: the pull-request checks box ("Some checks were not successful · 4 failing, …",
// expandable rows with ✓/✗/● and a "Details" link to the run), the "Languages"-style bar in the sidebar, and a
// package's check list. Reads robot-sdk-health/1 only; never shows Live's checks under another version.
import { useEffect, useMemo, useRef, useState } from "react";
import { sortedMembers, healthSummary, HEALTH_RANK, fmtShortDate } from "@kit";
import { StatusIcon, BigStatus, Icon } from "./icons.jsx";

const CHECK_WORD = { pass: "successful", fail: "failing", warn: "with warnings", running: "running", unknown: "unknown", none: "not applicable" };

// The member's checks, worst first, each with its label.
export function memberChecks(health, m) {
  return (health?.checks || []).map((c) => ({ ...c, r: m.checks?.[c.id] })).filter((x) => x.r)
    .sort((a, b) => (HEALTH_RANK[a.r.state] ?? 9) - (HEALTH_RANK[b.r.state] ?? 9));
}
// The one line a member row says: its worst check ("Tests — test.yml failed on main 42a6c2a").
export function worstLine(health, m) {
  const list = memberChecks(health, m);
  const bad = list.filter((x) => x.r.state === "fail" || x.r.state === "warn");
  if (!bad.length) return { text: m.kind === "agent" ? "all checks that apply pass" : "all checks pass", url: list.find((x) => x.r.url)?.r.url, extra: 0 };
  const w = bad[0];
  return { text: `${w.label} — ${w.r.detail || w.r.state}`, url: w.r.url, check: w, extra: bad.length - 1, extraFail: bad.slice(1).filter((x) => x.r.state === "fail").length };
}

export function cellCounts(health) {
  const n = { pass: 0, fail: 0, warn: 0, running: 0, unknown: 0, none: 0, total: 0 };
  for (const m of health?.members || []) for (const c of health.checks || []) { const r = m.checks?.[c.id]; if (r) { n[r.state] = (n[r.state] || 0) + 1; n.total++; } }
  return n;
}

function Details({ url, testid }) {
  if (!url) return <span className="gh-details gh-details-none" title="this check has no linked run">—</span>;
  return <a className="gh-details" href={url} target="_blank" rel="noreferrer" data-testid={testid} onClick={(e) => e.stopPropagation()}>Details</a>;
}

// One check of one member: icon, label, detail, when, Details.
export function CheckLine({ check, r, testid }) {
  const fails = r.failures || [];
  return (
    <li className={"gh-checkline gh-is-" + r.state} data-testid={testid}>
      <StatusIcon state={r.state} />
      <span className="gh-checkline-main">
        <b>{check.label}</b> <span className="gh-muted">{r.detail || r.state}</span>
        {r.at && <span className="gh-faint"> · {fmtShortDate(r.at)}</span>}
        {fails.length > 0 && <ul className="gh-checkline-fails">{fails.map((f, i) => <li key={i}><code>{typeof f === "string" ? f : JSON.stringify(f)}</code></li>)}</ul>}
        {r.where && <span className="gh-faint"> · <code>{r.where}</code></span>}
      </span>
      <Details url={r.url} />
    </li>
  );
}

// GitHub's merge-box checks list, one row per member (package or agent), failing first.
// Props: health, graph, note, openId (expanded member, from the URL), onOpenMember(id, kind), onToggle(id|null), onBackToLive.
export function ChecksBox({ health, graph, note, openId, onToggle, onOpenMember, onBackToLive }) {
  const [showAll, setShowAll] = useState(true);
  const rowRefs = useRef({});
  useEffect(() => {
    if (openId && rowRefs.current[openId]) rowRefs.current[openId].scrollIntoView({ block: "nearest" });
  }, [openId]);
  const members = useMemo(() => sortedMembers(health), [health]);
  if (!health) {
    return (
      <section className="gh-box gh-checks" data-testid="v6-checks">
        <div className="gh-checks-head">
          <BigStatus state="unknown" />
          <div><h2>Checks were not recorded for this version</h2><p className="gh-muted">{note || "Health was not recorded for this version."} The site never shows Live's checks under another version.</p></div>
          <span className="gh-grow" />
          {onBackToLive && <button className="gh-btn" onClick={onBackToLive}>Back to Live</button>}
        </div>
      </section>
    );
  }
  const s = healthSummary(health);
  const cells = cellCounts(health);
  const names = Object.fromEntries([...(graph?.packages || []).map((p) => [p.id, p.id]), ...(graph?.agents || []).map((a) => [a.id, a.name])]);
  const worst = s.fail ? "fail" : s.warn ? "warn" : s.running ? "running" : s.pass ? "pass" : "unknown";
  const title = s.fail ? "Some checks were not successful" : s.warn ? "No check failed; some have warnings" : s.running ? "Some checks haven't completed yet" : "All checks have passed";
  const parts = [s.fail && `${s.fail} failing`, s.warn && `${s.warn} with warnings`, s.running && `${s.running} running`, s.pass && `${s.pass} successful`, s.unknown && `${s.unknown} unknown`].filter(Boolean);
  return (
    <section className="gh-box gh-checks" data-testid="v6-checks">
      <div className="gh-checks-head">
        <BigStatus state={worst} />
        <div className="gh-checks-title">
          <h2>{title}</h2>
          <p className="gh-muted">{parts.join(", ")} members <span className="gh-faint">·</span> {cells.total} checks: {cells.fail} failing, {cells.warn} warnings, {cells.pass} successful{cells.none ? `, ${cells.none} n/a` : ""}{cells.unknown ? `, ${cells.unknown} unknown` : ""}</p>
        </div>
        <span className="gh-grow" />
        <button className="gh-linkbtn" onClick={() => setShowAll((x) => !x)} data-testid="v6-checks-toggle">{showAll ? "Hide all checks" : "Show all checks"}</button>
      </div>
      {showAll && <ul className="gh-checks-list">
        {members.map((m) => {
          const w = worstLine(health, m), open = openId === m.id, isAgent = m.kind === "agent";
          return (
            <li key={m.id} ref={(el) => { rowRefs.current[m.id] = el; }} className={"gh-checkrow gh-is-" + m.state + (open ? " open" : "")} data-testid={"v6-check-row-" + m.id}>
              <div className="gh-checkrow-main" onClick={() => onToggle(open ? null : m.id)}>
                <StatusIcon state={m.state} />
                <span className="gh-checkrow-text">
                  <button className="gh-checkrow-name" onClick={(e) => { e.stopPropagation(); onOpenMember(m.id, m.kind); }} title={`open ${names[m.id] || m.id}`}>
                    {isAgent ? names[m.id] || m.id : <code>{m.id}</code>}</button>
                  {isAgent && <span className="gh-label gh-label-agent">agent</span>}
                  <span className="gh-muted gh-checkrow-why">{w.text}</span>
                  {w.extra > 0 && <span className="gh-faint"> · +{w.extraFail ? `${w.extraFail} failing` : ""}{w.extraFail && w.extra - w.extraFail ? ", " : ""}{w.extra - w.extraFail ? `${w.extra - w.extraFail} warning${w.extra - w.extraFail > 1 ? "s" : ""}` : ""}</span>}
                </span>
                <Details url={w.url} testid={"v6-check-details-" + m.id} />
                <button className="gh-iconbtn" aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} data-testid={"v6-check-expand-" + m.id}
                  onClick={(e) => { e.stopPropagation(); onToggle(open ? null : m.id); }}><Icon name={open ? "chevronDown" : "chevronRight"} /></button>
              </div>
              {open && <ul className="gh-checklines">
                {memberChecks(health, m).map((x) => <CheckLine key={x.id} check={x} r={x.r} testid={`v6-checkline-${m.id}-${x.id}`} />)}
              </ul>}
            </li>
          );
        })}
      </ul>}
      <div className="gh-checks-foot gh-faint">health.json generated {fmtShortDate(health.generated)} · against graph.json {fmtShortDate(health.graph_generated)} · click a row for its checks, Details for the run</div>
    </section>
  );
}

// GitHub's "Languages" bar, re-used for health: one segment per state, sized by member count.
export function HealthBar({ health }) {
  const s = healthSummary(health);
  if (!s) return null;
  const order = [["fail", "Failing"], ["warn", "Warnings"], ["running", "Running"], ["pass", "Passing"], ["unknown", "Unknown"]];
  const total = order.reduce((a, [k]) => a + (s[k] || 0), 0) || 1;
  return (
    <div className="gh-hbar-wrap">
      <div className="gh-hbar" role="img" aria-label={order.filter(([k]) => s[k]).map(([k, l]) => `${s[k]} ${l.toLowerCase()}`).join(", ")}>
        {order.filter(([k]) => s[k]).map(([k]) => <span key={k} className={"gh-hbar-seg gh-is-" + k} style={{ width: `${(100 * s[k]) / total}%` }} />)}
      </div>
      <ul className="gh-hbar-legend">
        {order.filter(([k]) => s[k]).map(([k, l]) => <li key={k}><span className={"gh-hbar-dot gh-is-" + k} /><b>{l}</b> <span className="gh-muted">{s[k]}</span></li>)}
      </ul>
    </div>
  );
}
