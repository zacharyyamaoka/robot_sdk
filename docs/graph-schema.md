# robot-sdk graph: `site/data/graph.json` (schema `robot-sdk-graph/1`)

Frozen 2026-11-24. Everything that draws robot-sdk's relationships (the landing site, robot_msgs' "used by" sections,
README tables) reads this one file. `tools/sdk_graph` generates it from the code; nothing hand-edits it.

**WHY (Zach, 2026-11-24, Daily Note "Back to UR?"):** "autogenerate the package dependency graph and also even more
specifically the datatype dependency graph... are those types on the public API and are they being consumed or
produced... each package perhaps can have like a little .robot-sdk file... or even better like if there is some linter
that verifies it's true." An edge exists only where code makes it true (no invented relationships).

```jsonc
{
  "schema": "robot-sdk-graph/1",
  "generated": "2026-11-24T21:00:00-07:00",
  "sources": {"robot_msgs": "cf3709b", "...": "sha, '-dirty' when the tree had uncommitted changes"},

  "packages": [{
    "id": "robot_trajectories",            // import name; also the repo name
    "pypi": "robot-trajectories",
    "repo_url": "https://github.com/zacharyyamaoka/robot_trajectories",
    "role": "library",                     // library | viewer
    "layer": "leaf",                       // vocabulary | models | leaf | comms | outer | checks | viewers
    "one_line": "Trajectory kinds from limits and tasks, one JointTrajectory out",
    "version": "0.1.0",
    "deps": {"required": ["robot_msgs"], "extras": {"viz": []}},   // robot-sdk packages only, from pyproject
    "declaration": "robot-sdk.toml",       // the package's own declaration file, or null when it has none
    "lint": "pass"                         // pass | fail | undeclared — does the declaration match the code?
  }],

  "types": [{
    "id": "robot_msgs.trajectory.JointTrajectory",
    "name": "JointTrajectory",
    "package": "robot_msgs",               // robot_msgs, or another package that defines a shared type
    "module": "robot_msgs.trajectory",
    "what": "Timed joint positions/velocities; the join type",
    "docs_url": "https://robotmsgs.com/…"  // or null
  }],

  "uses": [{
    "package": "robot_controllers",
    "type": "robot_msgs.trajectory.JointTrajectory",
    "kind": "consumes",                    // consumes (a public parameter) | produces (a public return) | imports (used, not on the public API)
    "symbol": "robot_controllers.core.Controller.tick",
    "where": "src/robot_controllers/core.py:62",
    "public": true,                        // reachable from the package's public API (__all__ / non-underscore names)
    "declared": true,                      // also listed in the package's robot-sdk.toml
    "verified": true                       // found in the code by the scanner (declared-but-not-found → false, a lint failure)
  }],

  "agents": [{
    "id": "trajectory_tracking_agent",
    "name": "Trajectory Tracking Agent",
    "repo_url": "https://github.com/zacharyyamaoka/trajectory_tracking_agent",
    "objective": "Lowest tool tracking error on a given trajectory, inside its gates (UR5e first)",
    "builds_on": ["robot_msgs", "robot_controllers"],
    "status": {}                           // the agent's status.json (ai-team-status/1), verbatim, or null
  }]
}
```

Rules: `uses` holds one row per (package, type, kind, symbol); an agent imports packages, a package never imports an
agent; ids are stable (they key URLs and node ids in every view).

## How it is made (2026-11-24)

- `python -m tools.sdk_graph` rewrites the file; `python -m tools.sdk_graph check` lints every package's `robot-sdk.toml`
  and exits 1 naming file:line (also `tests/test_sdk_graph.py`, with mutation tests that prove it goes red).
  `python -m tools.sdk_graph draft <package>` prints a first declaration from the scan.
- The scan reads code with `ast`, never imports it. Public = no underscore in the module path, and the module's
  `__all__` when it has one (a package `__init__` re-exporting out of a private module makes the name public there).
  Parameters consume, returns produce; a dataclass field follows its class (a class only ever returned is an output);
  a `Protocol` the package does not itself implement flips (the package hands the implementer its parameters and takes
  back its return). `Any` or duck-typed signatures name no type, so they make no edge; the type then shows as `imports`.
- `robot-sdk.toml` format: `declaration.py`'s docstring. `declared` is per symbol: the declaration names that symbol.
- `sources`: `-dirty` means an uncommitted change in what the scan reads (`src/`, `pyproject.toml`, `robot-sdk.toml`,
  `status.json`, `README.md`, and since 2026-11-25 `cpp/`, `python/`, `rust/`, `Cargo.toml`, `tests/*parity*` for
  `languages`); a dirty lockfile or report elsewhere in a checkout doesn't count.

## Additive fields (2026-11-24, still `robot-sdk-graph/1`)

No field above changed; readers that ignore unknown keys keep working. Every value is copied from the member's own
`robot-sdk.toml`, so robot_sdk keeps no facts about a package or an agent itself (Zach, 2026-11-24: "robot-sdk doesn't
need to maintain that information itself… its decentralized").

```jsonc
"packages": [{
  // … the fields above, plus:
  "summary": "2-4 sentences for drill-down, or null",            // robot-sdk.toml `summary` (the skill's "What it is")
  "use_when": "when an agent should reach for it, or null",       // robot-sdk.toml `use_when` (the skill's "Reach for it when")
  "links": {                                                      // robot-sdk.toml [links], verbatim, in file order
    "github": "https://github.com/zacharyyamaoka/robot_metrics",  // required; equals repo_url (lint)
    "pypi": "https://pypi.org/project/robot-metrics/",            // required; names pyproject's [project].name (lint)
    "site": "https://zacharyyamaoka.github.io/robot_metrics/",    // optional: its own landing page
    "docs": "…", "changelog": "…"                                 // optional; any other key a package wants
  }
}],
"agents": [{
  // … the fields above, plus (an agent is found by role = "agent" in a sibling repo's robot-sdk.toml):
  "one_line": "…", "summary": "… or null",
  "links": {"github": "…", "site": "…"},                          // github required
  "declaration": "robot-sdk.toml",
  "lint": "pass"                                                  // pass | fail: builds_on matches its pyproject, links valid
}]
```

- `name`, `objective` and `builds_on` of an agent now come from its declaration (before: robot_sdk's README table);
  `builds_on` stays the robot-sdk packages its pyproject imports, and the lint fails when the declaration disagrees.
- Links are lint-checked offline (present, `https://`, github/pypi are the repo's own). `python -m tools.sdk_graph check
  --online` (and `pytest -m network`) fetches each one: any non-200 fails, except a PyPI 404, reported `unpublished`
  (the package is not released yet). PyPI is probed through `https://pypi.org/pypi/<name>/json`, because the project
  page answers 200 with a bot challenge for any name.
- README.md's layers and agents tables and skill/SKILL.md's packages table are generated from this file between
  `<!-- robot-sdk:… begin/end -->` markers (`python -m tools.sdk_graph readme`); a test fails when they are stale.
- `upstream` (per package, optional, added 2026-11-24 by the refresh workflow): `"missing"` when the package is pinned in
  robot_sdk but its GitHub repo is not reachable (e.g. not yet public). The package is then kept from the last good graph.
  Absent means the repo was cloned and scanned.

## Additive field: `languages` (2026-11-25, still `robot-sdk-graph/1`)

**WHY (Zach, 2026-11-25, Daily Note):** "In the robot SDK landing page now on each package you can also like support
lanuagues, py, cpp". Like every edge, a language is listed only where the code makes it true: `tools/sdk_graph/languages.py`
reads each package repo's own files; no declaration names a language. Additive under the rule above (no field changed;
readers that ignore unknown keys keep working), so the schema stays `/1`. A graph from before 2026-11-25 (an older
snapshot in `versions.json`) has no `languages`; readers show nothing for it, never a guess.

```jsonc
"packages": [{
  // … the fields above, plus:
  "languages": [                                   // display order python, cpp, rust; an absent language is not listed
    {"id": "python", "status": "full",    "where": "src/robot_controllers", "evidence": "54 modules"},
    {"id": "cpp",    "status": "partial", "where": "src/robot_controllers/controllers/cpp",
     "evidence": "1 controller: joint_trajectory_controller · parity test tests/test_cpp_parity.py"}
  ]
}]
```

- `id`: `python | cpp | rust`. `status`: `full | partial | planned`. `where`: repo-relative folder. `evidence`: one short
  line for a tooltip, made from file names only.
- **python**: the package's Python source, `src/<pkg>` (else `python/src/<pkg>` or `python/<pkg>`, mjbots moteus's
  `cpp/` · `python/` · `rust/` layout, which robot_sdk_cpp_agent ports to). Always `full`: the reference implementation.
- **cpp**: a top-level `cpp/` with at least one header, else C++ files under `src/` or `python/` (`where` = their common
  folder; `.h` alone is C and proves nothing). `partial` unless the full-parity proof below holds.
- **rust**: a `Cargo.toml` (`partial` unless proved), else `rust/README.md` alone → `planned`.
- Only files the repo owns count: `git ls-files -co --exclude-standard` in a checkout (so like_keras's gitignored `build/`,
  which holds dora's `Cargo.toml`, is not Rust), and build output, virtualenvs and `node_modules` are skipped everywhere.
  Tests and benchmarks (`tests/cpp`, `kpi/`) are not the package.
- **full** (the hook; nothing earns it today): a module under `tests/` assigns `CPP_PARITY` (or `RUST_PARITY`) a literal
  list of public symbols it pins against the Python. `full` when that list covers every public definition the scanner
  finds (any of its public paths, re-exports included; an empty API never counts), and a listed symbol counts only if
  the test's own code names it. Otherwise the evidence says how far it got: `1 of 12 public symbols parity-tested`.
- README.md's layers table and skill/SKILL.md's packages table carry it as a Languages column (`Py, C++ · partial`).
