// Top-right: the version picker (GitHub's "Switch branches/tags" popover, image 203759) beside a GitHub mark, plus the
// banner that says which version you are on and how it differs from Live.
// WHY (Zach, 2026-11-24): "just like ros has the different pinned versions we want that to be first class … like
// github kinda skip to like a branch. by default it can be live. but then you can always go back to the latest stable
// or previous ones … top right corner … next to like a github icon that takes you to the github repo."
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { REPO_URL } from "@shared/parts.jsx";
import { diffText, fmtShortDate, shortType } from "./model.js";

export const TAGS_URL = REPO_URL + "/tags";

export function BranchIcon({ size = 14 }) {
  return (
    <svg className="k-ico" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M9.5 3.25a2.25 2.25 0 1 1 3 2.12V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.13a2.25 2.25 0 1 1-1.5 0V5.37a2.25 2.25 0 1 1 1.5 0v1.836A2.49 2.49 0 0 1 6 7h4a1 1 0 0 0 1-1v-.63A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  );
}
export function GitHubMark({ size = 18 }) {
  return (
    <svg className="k-ico" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

export function GitHubButton({ href = REPO_URL, label = "robot_sdk on GitHub", className = "" }) {
  return (
    <a className={"k-gh " + className} href={href} target="_blank" rel="noreferrer" title={label} aria-label={label} data-testid="github-link">
      <GitHubMark />
    </a>
  );
}

const KIND_TAB = (v) => (v.kind === "snapshot" ? "snapshots" : "channels");

function metaLine(v) {
  const bits = [];
  if (v.summary) bits.push(v.summary);
  const when = v.published || v.generated;
  if (when) bits.push(fmtShortDate(when));
  const sha = v.built_from || v.sha;
  if (sha) bits.push(String(sha).slice(0, 7));
  return bits.join(" · ");
}

// site = useSite(). Button "⎇ Live ▾"; popover: title, filter, Channels | Snapshots tabs, ✓ current, "default" pill,
// meta line per row, footer "View tags on GitHub". data-testid="version-picker" on the button.
export function VersionPicker({ site, align = "right", compact = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = site.versions.find((v) => v.id === site.versionId) || site.versions[0];
  const [tab, setTab] = useState(() => (current ? KIND_TAB(current) : "channels"));
  const btn = useRef(null), pop = useRef(null), input = useRef(null);
  const [pos, setPos] = useState(null);
  const defaultId = site.versionsDoc?.default || "live";

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current.getBoundingClientRect();
      const w = Math.min(360, window.innerWidth - 16);
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top: r.bottom + 6, left, width: w });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    setTab(current ? KIND_TAB(current) : "channels");
    const t = setTimeout(() => input.current?.focus(), 20);
    const onDown = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const counts = useMemo(() => ({ channels: site.versions.filter((v) => KIND_TAB(v) === "channels").length, snapshots: site.versions.filter((v) => KIND_TAB(v) === "snapshots").length }), [site.versions]);
  const ql = q.trim().toLowerCase();
  const rows = site.versions.filter((v) => (ql ? `${v.label} ${v.id} ${v.summary || ""} ${v.built_from || ""}`.toLowerCase().includes(ql) : KIND_TAB(v) === tab));
  const choose = (v) => { if (!v.available) return; site.setVersion(v.id); setOpen(false); setQ(""); };
  const label = site.loading ? site.versions.find((v) => v.id === site.requestedId)?.label || site.requestedId : current?.label || "Live";

  return (
    <>
      <button ref={btn} type="button" className={"k-vp-btn" + (site.isLive ? "" : " k-off-live") + (compact ? " k-compact" : "")} data-testid="version-picker"
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Switch versions">
        <BranchIcon /><span className="k-vp-label">{label}</span>{site.loading && <span className="k-spin" aria-label="loading" />}<span className="k-caret" aria-hidden>▾</span>
      </button>
      {open && pos && createPortal(
        <div ref={pop} className="k-vp-pop" role="dialog" aria-label="Switch versions" data-testid="version-popover" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <div className="k-vp-head"><b>Switch versions</b><button className="k-x" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
          <div className="k-vp-filter"><input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a version…" aria-label="Find a version" /></div>
          {!ql && <div className="k-vp-tabs" role="tablist">
            {[["channels", "Channels"], ["snapshots", "Snapshots"]].map(([id, lab]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={"k-vp-tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)} data-testid={"vp-tab-" + id}>
                {lab}{counts[id] ? <span className="k-n">{counts[id]}</span> : null}</button>
            ))}
          </div>}
          <div className="k-vp-list" role="listbox">
            {rows.map((v) => (
              <button key={v.id} role="option" aria-selected={v.id === site.versionId} aria-disabled={!v.available} disabled={!v.available}
                className={"k-vp-row" + (v.id === site.versionId ? " on" : "") + (v.available ? "" : " k-na")} onClick={() => choose(v)} data-testid={"vp-option-" + v.id}
                title={v.available ? metaLine(v) : v.reason}>
                <span className="k-vp-check" aria-hidden>{v.id === site.versionId ? "✓" : ""}</span>
                <span className="k-vp-main">
                  <span className="k-vp-name">{v.label}{v.id === defaultId && <span className="k-pill">default</span>}</span>
                  <span className="k-vp-meta">{v.available ? metaLine(v) : v.reason}</span>
                </span>
              </button>
            ))}
            {!rows.length && <div className="k-vp-empty">{ql ? `Nothing matches “${q}”.` : tab === "snapshots" ? "No snapshots published yet." : "No channels."}</div>}
          </div>
          <div className="k-vp-foot">
            <a href={TAGS_URL} target="_blank" rel="noreferrer">View tags on GitHub</a>
            {site.source?.versions && site.source.versions !== "runtime" && <span className="k-faint">versions.json: {site.source.versions}</span>}
          </div>
        </div>, document.body)}
    </>
  );
}

// The picker and the GitHub mark side by side (gate g3: top-right, beside each other).
export function TopRight({ site, children, className = "" }) {
  return (
    <div className={"k-topright " + className}>
      {children}
      <VersionPicker site={site} />
      <GitHubButton />
    </div>
  );
}

// Shown when the version on screen is not Live: which one, how it differs, and the way back.
export function VersionBanner({ site, detail: detailDefault = false, className = "", onOpenPackage, onOpenType }) {
  const [detail, setDetail] = useState(detailDefault);
  if (!site.ready) return null;
  if (site.loading) return <div className={"k-vbanner k-loading " + className} data-testid="version-banner"><span className="k-spin" /> Loading {site.versions.find((v) => v.id === site.requestedId)?.label || site.requestedId}…</div>;
  if (site.unknownVersion) return (
    <div className={"k-vbanner k-bad " + className} data-testid="version-banner">
      <span>No version called <code>{site.unknownVersion}</code>; showing Live.</span>
      <button className="k-btn" onClick={() => site.setVersion("live")}>Clear</button>
    </div>
  );
  const req = site.versions.find((v) => v.id === site.requestedId);
  if (req && !req.available && site.requestedId !== "live") return (
    <div className={"k-vbanner k-bad " + className} data-testid="version-banner">
      <span><b>{req.label}</b> is not available here: {req.reason} Showing Live.</span>
      <button className="k-btn" onClick={() => site.setVersion("live")}>Back to Live</button>
    </div>
  );
  if (site.isLive) return null;
  const d = site.diff;
  return (
    <div className={"k-vbanner " + className} data-testid="version-banner">
      <div className="k-vbanner-main">
        <BranchIcon />
        <span>Viewing <b>{site.version.label}</b>{site.version.summary ? <span className="k-muted"> — {site.version.summary}</span> : null}</span>
        {d && <span className="k-vbanner-diff">vs Live: {diffText(d)}</span>}
        {!site.health && <span className="k-tag k-tag-warn" title={site.healthNote}>health not recorded</span>}
        <span className="k-grow" />
        {d && !d.same && <button className="k-btn k-btn-ghost" onClick={() => setDetail((x) => !x)} aria-expanded={detail} data-testid="version-diff-toggle">{detail ? "Hide differences" : "What differs?"}</button>}
        <button className="k-btn" onClick={() => site.setVersion("live")} data-testid="back-to-live">Back to Live</button>
      </div>
      {detail && d && <VersionDiff diff={d} onOpenPackage={onOpenPackage} onOpenType={onOpenType} />}
    </div>
  );
}

// The differences, listed: packages (missing / only here / other version), types, type uses per package.
export function VersionDiff({ diff, onOpenPackage, onOpenType }) {
  if (!diff) return null;
  const P = (id) => onOpenPackage ? <button key={id} className="k-chip" onClick={() => onOpenPackage(id)}><code>{id}</code></button> : <code key={id} className="k-chip">{id}</code>;
  const T = (id) => onOpenType ? <button key={id} className="k-chip" onClick={() => onOpenType(id)}>{shortType(id)}</button> : <span key={id} className="k-chip">{shortType(id)}</span>;
  const byPkg = (rows) => { const m = {}; for (const u of rows) m[u.package] = (m[u.package] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  return (
    <div className="k-vdiff" data-testid="version-diff">
      {diff.packages.removed.length > 0 && <div><span className="k-vdiff-k">Not in this version ({diff.packages.removed.length})</span>{diff.packages.removed.map(P)}</div>}
      {diff.packages.added.length > 0 && <div><span className="k-vdiff-k">Only in this version ({diff.packages.added.length})</span>{diff.packages.added.map(P)}</div>}
      {diff.packages.changed.length > 0 && <div><span className="k-vdiff-k">Other version</span>{diff.packages.changed.map((c) => <span key={c.id} className="k-chip"><code>{c.id}</code> {c.here} <span className="k-faint">(Live {c.live})</span></span>)}</div>}
      {diff.types.removed.length > 0 && <div><span className="k-vdiff-k">Types not in this version ({diff.types.removed.length})</span>{diff.types.removed.map(T)}</div>}
      {diff.types.added.length > 0 && <div><span className="k-vdiff-k">Types only here ({diff.types.added.length})</span>{diff.types.added.map(T)}</div>}
      {(diff.uses.removed.length > 0 || diff.uses.added.length > 0) && <div><span className="k-vdiff-k">Type uses</span>
        <span className="k-muted">{diff.counts.uses[0]} on Live → {diff.counts.uses[1]} here</span>
        {byPkg(diff.uses.removed).slice(0, 8).map(([p, n]) => <span key={"r" + p} className="k-chip"><code>{p}</code> −{n}</span>)}
        {byPkg(diff.uses.added).slice(0, 8).map(([p, n]) => <span key={"a" + p} className="k-chip"><code>{p}</code> +{n}</span>)}
      </div>}
      {diff.same && <div className="k-muted">Same packages, types and uses as Live.</div>}
    </div>
  );
}
