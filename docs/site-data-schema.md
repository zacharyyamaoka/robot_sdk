# robot-sdk site data: `health.json` and `versions.json`

Frozen 2026-11-24 (round 2 of the site proposals), beside `graph.json` (`docs/graph-schema.md`). Every view of the site
reads these three files at runtime from the data folder (`site/data/` in the repo, `data/` on gh-pages). Generated,
never hand-edited: `python -m tools.sdk_graph health` and `python -m tools.sdk_graph versions`, both run by
`tools/refresh/refresh.py` every hour.

**WHY (Zach, 2026-11-24, Daily Note "Robot SDK feedback"):** "I really like the health view super duper important can
we have that first class supported. Very common with these packages you want to be able to see what is passing or
not." And: "our pinned versions… just like ros… we want that to be first class as well… like github kinda skip to a
branch. by default it can be live. but then you can always go back to the latest stable or previous ones."

## `health.json` — schema `robot-sdk-health/1`

One row per member (packages in graph order, then agents). A check never invents a pass: a source that could not be
read is `unknown` with the reason in `detail`.

```jsonc
{
  "schema": "robot-sdk-health/1",
  "generated": "2026-11-24T22:10:00-07:00",
  "graph_generated": "…",                    // graph.json's `generated` this was built against
  "checks": [                                // the columns, in display order
    {"id": "tests",    "label": "Tests",       "what": "the package's test workflow on main (GitHub Actions)"},
    {"id": "lint",     "label": "Declaration", "what": "robot-sdk.toml matches the code (python -m tools.sdk_graph check)"},
    {"id": "types",    "label": "Types",       "what": "declared type uses are found in the code"},
    {"id": "release",  "label": "Release",     "what": "the version robot-sdk pins is published on PyPI"},
    {"id": "upstream", "label": "Repo",        "what": "the GitHub repo is reachable"}
  ],
  "members": [{
    "id": "robot_msgs",                      // = graph.json packages[].id or agents[].id
    "kind": "package",                       // package | agent
    "state": "fail",                         // worst of its checks: fail > warn > pass; unknown/none never raise it
    "checks": {
      "tests":    {"state": "fail", "detail": "test.yml failed on main 248f9f1", "url": "https://github.com/…/actions/runs/…",
                   "workflow": "test.yml", "sha": "248f9f1", "at": "2026-11-25T04:14:01Z"},
      "lint":     {"state": "pass", "detail": "robot-sdk.toml matches the code", "failures": []},
      "types":    {"state": "pass", "detail": "21 declared + verified · 37 found, not declared · 0 missing",
                   "verified": 21, "found": 37, "missing": 0},
      "release":  {"state": "warn", "detail": "pins ~=0.3.1; PyPI has 0.3.0", "pinned": "~=0.3.1",
                   "pypi_latest": "0.3.0", "satisfied": false, "url": "https://pypi.org/project/robot-msgs/"},
      "upstream": {"state": "pass", "detail": "public on GitHub"}
    }
  }],
  "summary": {"pass": 9, "warn": 3, "fail": 4, "unknown": 0}
}
```

Check states: `pass | warn | fail | running | none | unknown` (`none` = the check doesn't apply, e.g. an agent has no
release; `running` = the newest run on main hasn't finished).

- **tests** — the newest run on `main` of the repo's `test.yml` (any workflow named `test` when there is no such file):
  `success` → pass, `failure`/`timed_out`/`cancelled` → fail, in progress → running, no workflow → none, API
  unreachable → unknown. Agents count the same way.
- **lint** — graph.json's `lint`: pass → pass, fail → fail (with the failures), undeclared → warn.
- **types** — from graph.json `uses`: any declared-but-not-found row → fail; uses found but none declared → warn;
  else pass. `none` for a package with no type uses.
- **release** — robot_sdk's pyproject pin vs PyPI's released versions: the pin is satisfied → pass; PyPI has the
  project but no version satisfying the pin, or the project is not on PyPI yet → warn. Agents: none.
- **upstream** — graph.json `upstream: "missing"` → fail; otherwise pass.

## `versions.json` — schema `robot-sdk-versions/1`

The version picker's menu. Each entry names the data files that make up that version; the site loads them on switch.
Paths are relative to the data folder.

```jsonc
{
  "schema": "robot-sdk-versions/1",
  "generated": "…",
  "default": "live",
  "versions": [
    {"id": "live", "label": "Live", "kind": "live", "ref": "main",
     "summary": "every package at its main branch, refreshed hourly",
     "graph": "graph.json", "health": "health.json", "generated": "…",
     "packages": {"robot_msgs": {"version": "0.3.1", "ref": "main", "sha": "cf3709b"}}},

    {"id": "release", "label": "Latest release", "kind": "release",
     "summary": "each package at its newest v* tag: 4 of 14 tagged; robot-sdk itself is not released yet",
     "graph": "versions/release/graph.json", "health": "versions/release/health.json" /* or null */, "generated": "…",
     "packages": {"robot_msgs": {"version": "0.3.0", "ref": "v0.3.0", "sha": "…"}, "robot_controllers": null}},

    {"id": "snap-49836d0", "label": "Nov 24, 21:48", "kind": "snapshot",
     "summary": "the live directory as published from main 0a69f2a",
     "graph": "versions/snap-49836d0/graph.json", "health": null, "generated": "…",
     "built_from": "0a69f2a", "published": "2026-11-25T04:48:13Z"}
  ],
  "distributions": [                         // robot-sdk's own pin sets, newest first (git history of pyproject.toml)
    {"version": "0.1.0", "released": false, "commit": "13403ba", "date": "…", "subject": "…",
     "pins": {"robot-msgs": "~=0.3.1"}, "added": ["robot-collision"], "removed": [], "changed": {}}
  ]
}
```

- `kind`: `live` (every repo at main; the default), `release` (each package at its newest `v*` git tag; a package with
  no tag is `null` in `packages` and absent from that graph), `snapshot` (a previous published live directory, taken
  from the gh-pages branch history; one per distinct graph, newest first, at most 12).
- A version's `graph` is a full `robot-sdk-graph/1` document; `health` is a `robot-sdk-health/1` document or `null`
  when it was not recorded for that version (the UI says so; it never shows Live's health under another version).
- `distributions` is information (what robot-sdk pins, when it changed); it does not add picker entries until a
  robot-sdk release tag exists.
