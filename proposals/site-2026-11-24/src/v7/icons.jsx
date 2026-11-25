// V7 Workbench icons: 16 px line glyphs in the spirit of VS Code's Codicons (drawn here, no icon font or download).
// WHY hand-drawn: the variant ships as one self-contained file and the proposals folder installs nothing new.
const P = {
  files: <><path d="M4.5 1.5h5l3 3v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" /><path d="M9.5 1.5v3h3" /><path d="M2 4v9.5a1 1 0 0 0 1 1h7" /></>,
  types: <><path d="M5.5 2C4 2 4 3 4 4.2v1.6C4 7 3.4 7.6 2.5 8c.9.4 1.5 1 1.5 2.2v1.6C4 13 4 14 5.5 14" /><path d="M10.5 2C12 2 12 3 12 4.2v1.6c0 1.2.6 1.8 1.5 2.2-.9.4-1.5 1-1.5 2.2v1.6c0 1.2 0 2.2-1.5 2.2" /><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" /></>,
  packages: <><rect x="5.5" y="1.5" width="5" height="3.5" rx=".6" /><rect x="1.5" y="11" width="5" height="3.5" rx=".6" /><rect x="9.5" y="11" width="5" height="3.5" rx=".6" /><path d="M8 5v3M4 11V8h8v3" /></>,
  library: <><rect x="2" y="2" width="2.6" height="12" rx=".5" /><rect x="5.6" y="2" width="2.6" height="12" rx=".5" /><path d="m9.6 2.8 2.4-.6 2.6 11.3-2.4.6Z" /></>,
  pulse: <path d="M1 8.5h3l1.6-4.5 2.8 9 2-6 1.1 1.5H15" />,
  robot: <><rect x="2.5" y="5" width="11" height="8" rx="2" /><path d="M8 2.2V5M6 1.8h4" /><circle cx="5.8" cy="9" r="1" fill="currentColor" stroke="none" /><circle cx="10.2" cy="9" r="1" fill="currentColor" stroke="none" /><path d="M1 8v2.5M15 8v2.5" /></>,
  play: <path d="M4.5 2.5v11l9-5.5Z" />,
  sparkle: <><path d="M8 1.5c.5 3.3 1.7 4.6 5 5.2-3.3.6-4.5 1.9-5 5.3-.5-3.4-1.7-4.7-5-5.3 3.3-.6 4.5-1.9 5-5.2Z" /><path d="M13 11v3M11.5 12.5h3" /></>,
  package: <><path d="M8 1.5 14 4.5v7L8 14.5 2 11.5v-7Z" /><path d="M2 4.5 8 7.5l6-3M8 7.5v7" /></>,
  folder: <path d="M1.5 3.5h4.2l1.5 1.5h7.3v8h-13Z" />,
  folderOpen: <><path d="M1.5 3.5h4.2l1.5 1.5h6.3v2" /><path d="M1.5 13V3.5M1.5 13h11l2-6H3.5Z" /></>,
  chevronRight: <path d="m6 3.5 4.5 4.5L6 12.5" />,
  chevronDown: <path d="M3.5 6 8 10.5 12.5 6" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  split: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="M8 2.5v11" /></>,
  sidebar: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="M5.5 2.5v11" /><path d="M2.5 5h2M2.5 7h2" /></>,
  sidebarOff: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="M5.5 2.5v11" /></>,
  panel: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="M1.5 9.5h13" /><path d="M3.5 11.5h4" /></>,
  panelOff: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="M1.5 9.5h13" /></>,
  search: <><circle cx="6.8" cy="6.8" r="4.3" /><path d="m10 10 4.5 4.5" /></>,
  error: <><circle cx="8" cy="8" r="6.3" /><path d="m5.6 5.6 4.8 4.8M10.4 5.6l-4.8 4.8" /></>,
  warning: <><path d="M8 1.8 14.8 13.8H1.2Z" /><path d="M8 6v3.6" /><circle cx="8" cy="11.6" r=".6" fill="currentColor" stroke="none" /></>,
  info: <><circle cx="8" cy="8" r="6.3" /><path d="M8 7.2v4.3" /><circle cx="8" cy="4.9" r=".7" fill="currentColor" stroke="none" /></>,
  check: <path d="m2.5 8.5 3.5 3.5 7.5-8" />,
  external: <><path d="M9 2.5h4.5V7" /><path d="M13.5 2.5 7.5 8.5" /><path d="M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5" /></>,
  filter: <path d="M1.5 2.5h13l-5 6v5l-3-1.5V8.5Z" />,
  collapseAll: <><rect x="4.5" y="4.5" width="10" height="10" rx="1" /><path d="M7 9.5h5" /><path d="M2.5 11.5v-9h9" /></>,
  method: <><path d="M8 1.5 14 4.8v6.4L8 14.5 2 11.2V4.8Z" /><path d="M2 4.8 8 8l6-3.2M8 8v6.5" /></>,
  branch: <><circle cx="4.5" cy="3.5" r="1.6" /><circle cx="4.5" cy="12.5" r="1.6" /><circle cx="11.5" cy="5" r="1.6" /><path d="M4.5 5.1v5.8M11.5 6.6c0 2.6-2.4 2.9-5.6 3.9" /></>,
  diff: <><path d="M4 2.5v6M1 5.5h6" /><path d="M9 11.5h6" /><path d="M3 13.5h4M11 2.5h3v3" /></>,
  history: <><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" /><path d="M2 2.5v3h3" /><path d="M8 5v3.3l2.2 1.4" /></>,
  output: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="M4 6h8M4 8.5h8M4 11h5" /></>,
  maximize: <path d="m3.5 10 4.5-4.5 4.5 4.5" />,
  restore: <path d="M3.5 6 8 10.5 12.5 6" />,
  agent: <><circle cx="8" cy="5" r="2.8" /><path d="M2.5 14c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /></>,
  menu: <path d="M2 4h12M2 8h12M2 12h12" />,
  github: null,
};

export function Icon({ name, size = 16, className = "", title }) {
  const body = P[name];
  return (
    <svg className={"v7-ico " + className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} aria-label={title}>
      {body}
    </svg>
  );
}

// Severity glyphs in VS Code's Problems colours (error, warning, info), filled the way the Problems list draws them.
export function Sev({ s, size = 14 }) {
  const name = s === "fail" ? "error" : s === "warn" ? "warning" : "info";
  return <Icon name={name} size={size} className={"v7-sev v7-sev-" + name} title={s === "fail" ? "failing" : s === "warn" ? "warning" : s} />;
}
