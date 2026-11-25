// Language chips: which languages a package ships (Py · C++ · partial · Rust (planned)), from graph.json's
// packages[].languages, which tools/sdk_graph/languages.py reads from each repo's own files (docs/graph-schema.md).
// WHY (Zach, 2026-11-25, Daily Note): "In the robot SDK landing page now on each package you can also like support
// lanuagues, py, cpp". Calm UI: plain words, no colour for state; a partial or planned language is the same chip in a
// muted dashed outline, and the evidence (what the code proves, and where) is the tooltip. A graph from before
// 2026-11-25 has no `languages`: nothing is drawn, never a guess.
const NAME = { python: "Python", cpp: "C++", rust: "Rust" };
const SHORT = { python: "Py", cpp: "C++", rust: "Rust" };

// Same words as tools/sdk_graph/languages.py `label()` (the README and skill tables).
export function languageLabel(l) {
  const text = SHORT[l.id] || l.id;
  return l.status === "partial" ? `${text} · partial` : l.status === "planned" ? `${text} (planned)` : text;
}

export function languageTitle(l) {
  const name = NAME[l.id] || l.id;
  const state = l.status === "full" ? "" : `, ${l.status}`;
  return `${name}${state}: ${l.evidence}${l.where ? ` (in ${l.where})` : ""}`;
}

// Props: pkg (a graph.json package), className. Renders nothing when the package carries no languages.
export function LanguageChips({ pkg, className = "" }) {
  const langs = Array.isArray(pkg?.languages) ? pkg.languages : [];
  if (!langs.length) return null;
  return (
    <span className={"k-langs " + className} role="list" aria-label={"Languages of " + pkg.id} data-testid={"langs-" + pkg.id}>
      {langs.map((l) => (
        <span key={l.id} role="listitem" className={"k-lang k-lang-" + l.status} data-lang={l.id} data-status={l.status} title={languageTitle(l)}>
          {languageLabel(l)}
        </span>
      ))}
    </span>
  );
}
