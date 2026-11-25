// V6's icon set: 16 px line glyphs drawn in the spirit of GitHub's Octicons (Primer), plus the check-state icons
// GitHub uses in its checks list (✓ success, ✗ failure, ● pending/warning, ⊘ skipped). Hand-drawn here because the
// lane may not install packages; each glyph is a few strokes so it reads at 16 px.
const GLYPHS = {
  code: <><path d="M5.5 4 1.75 8 5.5 12" /><path d="M10.5 4 14.25 8 10.5 12" /></>,
  package: <><path d="M8 1.75 14 5v6L8 14.25 2 11V5Z" /><path d="M2 5l6 3.25L14 5M8 8.25v6" /></>,
  folder: <path d="M1.75 3.25h4.5l1.5 1.5h6.5v8.5H1.75Z" />,
  pulse: <path d="M1 8.5h3l1.75-4.5 3.5 8L11 8.5h4" />,
  agent: <><rect x="2.75" y="5" width="10.5" height="8.25" rx="2" /><path d="M8 2.25V5M6 9.1v.01M10 9.1v.01" /></>,
  play: <><circle cx="8" cy="8" r="6.25" /><path d="M6.75 5.75 10.5 8l-3.75 2.25Z" /></>,
  sparkle: <path d="M8 1.75c.6 3.4 2.85 5.65 6.25 6.25-3.4.6-5.65 2.85-6.25 6.25C7.4 10.85 5.15 8.6 1.75 8 5.15 7.4 7.4 5.15 8 1.75Z" />,
  repo: <><path d="M3.25 12.5V3a1.25 1.25 0 0 1 1.25-1.25h8.25v9.5H4.5a1.25 1.25 0 0 0-1.25 1.25Zm0 0a1.25 1.25 0 0 0 1.25 1.25h1.25" /><path d="M8.25 12.75v1.75l1-.7 1 .7v-1.75" /></>,
  tag: <><path d="M1.75 2.75a1 1 0 0 1 1-1h4.1l7.4 7.4-5.1 5.1-7.4-7.4Z" /><circle cx="5" cy="5" r="1" /></>,
  link: <><path d="M7 4.75 8.6 3.1a2.6 2.6 0 0 1 3.7 3.7L10.75 8.4" /><path d="M9 11.25 7.4 12.9a2.6 2.6 0 0 1-3.7-3.7L5.25 7.6" /><path d="m6.25 9.75 3.5-3.5" /></>,
  history: <><circle cx="8" cy="8" r="6.25" /><path d="M8 4.75V8l2.25 1.5" /></>,
  search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.75 3.75" /></>,
  book: <><path d="M1.75 3h4a2.25 2.25 0 0 1 2.25 2.25v8.25a1.75 1.75 0 0 0-1.75-1.75h-4.5Z" /><path d="M14.25 3h-4A2.25 2.25 0 0 0 8 5.25v8.25a1.75 1.75 0 0 1 1.75-1.75h4.5Z" /></>,
  file: <><path d="M3.75 1.75h5.5l3 3v9.5h-8.5Z" /><path d="M9.25 1.75v3h3" /></>,
  chevronDown: <path d="m4 6 4 4 4-4" />,
  chevronRight: <path d="m6 4 4 4-4 4" />,
  triangleDown: <path d="M4.5 6.5h7L8 10Z" fill="currentColor" stroke="none" />,
  type: <><path d="M2.75 3.25h10.5M8 3.25v9.5" /><path d="M5.5 12.75h5" /></>,
  layers: <><path d="M8 1.75 14.25 5 8 8.25 1.75 5Z" /><path d="m1.75 8 6.25 3.25L14.25 8" /><path d="m1.75 11 6.25 3.25L14.25 11" /></>,
  terminal: <><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" /><path d="m4.5 6 2 2-2 2M8.5 10.5h3" /></>,
  arrowRight: <path d="M2.75 8h10.5M9.5 4.25 13.25 8 9.5 11.75" />,
  x: <path d="m4 4 8 8M12 4l-8 8" />,
  sidebar: <><rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.75" /><path d="M6 2.25v11.5" /></>,
};

export function Icon({ name, size = 16, className = "", title }) {
  return (
    <svg className={"oc " + className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {GLYPHS[name]}
    </svg>
  );
}

// GitHub's check-run icons, by health state: pass ✓ green, fail ✗ red, warn ● amber, running ● amber (pulsing),
// unknown ? grey, none ⊘ grey (GitHub's "skipped").
const STATE_LABEL = { pass: "passing", fail: "failing", warn: "warning", running: "running", unknown: "unknown", none: "n/a" };
export function StatusIcon({ state, size = 16, title }) {
  const s = state || "unknown";
  const t = title || STATE_LABEL[s] || s;
  const common = { className: "gh-st gh-st-" + s, width: size, height: size, viewBox: "0 0 16 16", role: "img", "aria-label": t };
  if (s === "pass") return <svg {...common}><title>{t}</title><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (s === "fail") return <svg {...common}><title>{t}</title><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  if (s === "warn" || s === "running") return <svg {...common}><title>{t}</title><circle cx="8" cy="8" r="4" fill="currentColor" /></svg>;
  if (s === "none") return <svg {...common}><title>{t}</title><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m4.2 11.8 7.6-7.6" stroke="currentColor" strokeWidth="1.5" /></svg>;
  return <svg {...common}><title>{t}</title><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6.4 6.4a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.5-.7 1v.3M8 11.2v.01" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

// The big round icon at the head of GitHub's checks box (filled circle, white glyph).
export function BigStatus({ state, size = 32 }) {
  const s = state || "unknown";
  return (
    <svg className={"gh-bigst gh-bigst-" + s} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="currentColor" />
      {s === "fail" && <path d="m11 11 10 10M21 11 11 21" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
      {s === "pass" && <path d="M10 16.5 14.2 20.5 22 12" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
      {(s === "warn" || s === "running") && <circle cx="16" cy="16" r="5" fill="#fff" />}
      {(s === "unknown" || s === "none") && <path d="M13 13a3 3 0 1 1 4 2.8c-.8.3-1 .8-1 1.6v.4M16 21v.01" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}
