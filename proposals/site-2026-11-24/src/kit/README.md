# robot-sdk workspace kit (round 2)

The shared parts every round-2 site variant (V6–V10) composes: data + versions, the hash router, the top-right version
picker beside a GitHub mark, health, the directory, the package map (tree / pipeline, ELK-routed), the Types workspace
(round-1 V2's switchboard + "What can I do with it?"), and the round-1 content panels. Real data only: every component
reads `site/data/graph.json`, `health.json`, `versions.json` (+ the version graphs it names) and `pick_and_place.json`
through `useSite()`.

```bash
cd /home/bam/robot_sdk/proposals/site-2026-11-24 && VARIANT=kit npx vite build      # -> kit/index.html, the demo page
uv run -q --with playwright python /home/bam/robot_sdk/proposals/site-2026-11-24/src/kit/verify_kit.py   # 53 checks + screenshots
```

The demo (`kit/index.html`, source `demo.jsx`) renders every component on the real data; deep links work there too
(`#/types/JointState?v=release`).

## Compose a variant in ten lines

```jsx
import { useSite, useRoute, TopRight, VersionBanner, HealthPill, TypeWorkspace, PackageMap, Directory, HealthBoard, RunPanel } from "@kit";

function App() {
  const site = useSite(), route = useRoute("types");            // one fetch shared by every component; ?v= lives in the hash
  if (!site.ready) return null;
  const { graph, health } = site, openType = (k) => route.go("types", k), openPkg = (id) => route.go("packages", id);
  return (<>
    <header><nav>{["types", "packages", "directory", "health", "run"].map((w) => <a key={w} data-ws={w} href={route.href(w)}>{w}</a>)}</nav>
      <TopRight site={site}><HealthPill health={health} note={site.healthNote} /></TopRight></header>
    <VersionBanner site={site} />
    {route.ws === "types" && <TypeWorkspace graph={graph} health={health} typeKey={route.arg} onOpenType={openType} onOpenPackage={openPkg} sourceUrl={site.sourceUrl} height="calc(100vh - 110px)" />}
    {route.ws === "packages" && <PackageMap graph={graph} health={health} onOpenPackage={openPkg} onOpenType={openType} />}
    {route.ws === "directory" && <Directory graph={graph} health={health} onOpenPackage={openPkg} />}
    {route.ws === "health" && <HealthBoard health={health} graph={graph} note={site.healthNote} onOpenPackage={openPkg} onBackToLive={() => site.setVersion("live")} />}
    {route.ws === "run" && <RunPanel pick={site.pick} graph={graph} health={health} onOpenType={openType} />}
  </>);
}
```

`import … from "@kit"` also loads the CSS (`@xyflow/react`'s, `@shared/kit.css`'s tokens and `kit.css`). Put
`data-theme="light"` on `<html>` to pin the light theme. Gates look for `data-ws="<workspace>"` on the workspace nav
(ids in `WORKSPACES`: types, packages, directory, health, agents, run, skill).

## API

### Data — `data.js`

`useSite({ autoReady = true })` →

| field | |
|---|---|
| `ready`, `error`, `loading` | `loading`: the version in the URL is still being fetched (the previous one stays on screen) |
| `versions` | versions.json entries, each with `available` and `reason` (offline: only Live; a failed fetch: why) |
| `versionsDoc`, `versionId`, `version`, `requestedId`, `unknownVersion` | the version on screen and its entry; the one the URL asks for |
| `setVersion(id)` | writes `?v=<id>` into the hash (Live removes it) |
| `graph`, `health`, `healthNote` | documents for the version on screen; `health` is `null` when that version did not record it, and `healthNote` says why. Live's health is never shown under another version |
| `pick`, `live: { graph, health }`, `isLive` | pick_and_place.json; Live's documents |
| `diff` | `diffGraphs(live.graph, graph)` when not on Live: packages added/removed/changed version, types added/removed, uses added/removed, counts |
| `ref(pkg)`, `sourceUrl(pkg, where)` | GitHub blob links at the version's ref (main for Live, the package's tag for a release, its scanned sha for a snapshot) |
| `source`, `http` | where each document came from: `runtime`, `embedded at build`, `override …` |

Runtime fetch from the data folder: `<meta name="robot-sdk-data" content="data/">` (gh-pages) or the repo default
`../../../site/data/`; `?data=<base>` and `?graph=<url>` override for tests. Offline (`file://`) the build-time copies
of the four top-level files are used and only Live is selectable. `document.documentElement.dataset.ready = "1"` is set
once the first data renders (pass `autoReady: false` and call `markReady()` yourself to wait for something else).

### Route — `route.js`

`useRoute(defaultWs)` → `{ ws, args, arg, params, v, hash, go(ws, ...args), href(ws, ...args), setParams(patch, { replace }), setVersion(id), navigate }`.
Grammar `#/<workspace>/<args…>?v=<id>&<params>`; `go` keeps the version and drops the old workspace's params;
`setParams` keeps everything (use it for per-workspace state such as `?mode=pipeline`). Back/Forward work. Also
exported standalone: `navigate`, `hrefTo`, `setParams`, `setVersion`, `parseHash`, `buildHash`, `WORKSPACES`.

### Top right — `top.jsx`

- `<TopRight site>{extra}</TopRight>`: `extra` (e.g. a HealthPill), then the picker, then the GitHub mark.
- `<VersionPicker site align="right" />`: GitHub's "Switch branches/tags" popover — "⎇ Live ▾" (`data-testid="version-picker"`), "Switch versions", filter, Channels (Live · Latest release) | Snapshots, ✓ current, `default` pill, a meta line per row, "View tags on GitHub". Tinted amber when not on Live.
- `<GitHubButton />` (`data-testid="github-link"`, https://github.com/zacharyyamaoka/robot_sdk).
- `<VersionBanner site onOpenPackage onOpenType />`: off Live, which version and how it differs ("10 packages not in this version · 2 at another version · 24 fewer types · 238 fewer type uses"), "What differs?" (→ `<VersionDiff diff />`), "Back to Live". Also covers loading, unknown and unavailable versions.

### Health — `health.jsx`

`<HealthDot state />`, `<HealthPill summary | health note onClick />` ("4 failing · 10 warnings · 2 passing"),
`<HealthInline health id />` (dot + its failing checks, for cards), and
`<HealthBoard health graph note onOpenPackage onOpenAgent onBackToLive filter onFilter />`: members × checks, failing
first, packages then agents, All/Failing/Warnings filter; hover a cell for its detail, click it for its evidence (CI run,
PyPI page, robot-sdk.toml) or, for lint failures and checks without a url, the detail row. `null` health renders the
"not recorded for this version" state. Helpers: `healthOf`, `healthState`, `healthSummary`, `healthText`, `sortedMembers`.

### Directory — `directory.jsx`

`<Directory graph health mode onMode onOpenPackage onOpenAgent showAgents />`: Cards (V1 "The layers") ⇄ Compact (V5),
grouped by layer with the layer blurb, viewers and agents included; per package name, version, one_line, health, type
counts and `PkgLinks` (GitHub, Site where declared, PyPI, README, Docs). Compact cuts one_line with an ellipsis and
keeps the full text in its `title`. Mode remembered in localStorage unless controlled, under `storageKey` (default
`rsdk-kit-dir-mode:<page path>`, so variants on one origin do not share it; `pagePathKey(base)` builds such a key).
`data-testid="dir-mode-cards" / "dir-mode-compact"`.

### Package map — `packagemap.jsx`, `layout.js`

`<PackageMap graph health height="auto" maxHeight={720} narrowMinZoom={0.75} narrowMaxHeight={1400} options onOptions onOpenPackage onOpenType onSelect caption toolbarExtra storageKey />`.
Toolbar: Tree | Pipeline (`pm-mode-tree`, `pm-mode-pipeline`), imports (not public) · package deps · agents · group by
layer (`pm-group-by-layer`) · health. Options remembered unless controlled
(`{ mode, groupByLayer, deps, agents, imports, health, byMode }`), under `storageKey` (default
`rsdk-kit-pm.v2:<page path>`: one key per page, so the gallery's variants on one origin no longer share it).

- **Fit**: fit-to-view never zooms in past `PM_FIT_MAX_ZOOM` (1.2), centred; with `height="auto"` a small map (Latest
  release's 4 packages) gets a canvas its height at that zoom instead of a 2x blow-up.
- **Version switch**: nodes state their size, `measured` and handles, so a package both versions share is drawn the
  moment the new layout lands (it used to stay `visibility: hidden`: empty bands). No remount (`key`) needed.

- **Each mode has its own "group by layer" and "package deps"** (`PM_MODE_DEFAULTS`): tree grouped with deps, pipeline
  ungrouped without (grouped, the layer order fights the type flow). Switching modes restores that mode's last choice
  (kept in `options.byMode`). Controlled? Pass a partial set: `pmOptions({ mode: "pipeline" })` completes it, and
  `switchMode(opts, "pipeline")` is the patch the toolbar applies.
- **Narrow canvas (< `PM_NARROW` = 560 px, a phone)**: a compact layout (two boxes per row, packed rows) drawn at a
  readable zoom, at least `narrowMinZoom` (0.75: names ~9.4 px, labels ~9 px), never fitted down to the width. The
  canvas grows to the layout's height (up to `narrowMaxHeight`, then it scrolls inside) and scrolls sideways inside
  itself when the layout is wider (the pipeline; a shade marks the right edge); the page never scrolls sideways. Drag
  and pinch are off there so a finger scrolls the page, and a "Whole map" button under the canvas
  (`pm-fit-toggle`) flips to fit-to-width for the overview. `narrowMinZoom={0}` keeps fit-to-width everywhere.
  Measured on today's graph at 390 px: tree 0.75 (fits the width), pipeline 0.75 (530 px wide, scrolls). A band's label
  strip sits above its first row there; the layout is shifted so the top band's label is inside the canvas.

- **tree**: package deps from pyproject, viewers on top, vocabulary at the bottom. Group by layer on → full-width layer
  bands (ELK partitions; a layer with more than 4 packages gets several rows); off → a plain layered tree.
- **pipeline**: one edge per producer → consumer pair, labelled with the type names (two when they fit, else
  `JointLimits +2`); `robot_msgs` hidden (caption says so) and packages that share no public type with another are
  listed under the canvas. Click a label to open the type, or a `+N` label to list them.
- Click a package to highlight its edges; its "open ↗" calls `onOpenPackage`.
- Layout: ELK layered, direction DOWN, orthogonal routing, inline edge labels. `layoutTree(graph, opts)`,
  `layoutPipeline(graph, opts)` return `{ nodes, edges(points), bands, groups, width, height, isolated }` for anyone
  drawing it differently.

### Types — `types.jsx`

- `<TypeWorkspace graph health typeKey onOpenType onOpenPackage onGo sourceUrl intro panel onPanel height />`: round-1
  V2's `TypesTab` imported unchanged (rail | switchboard | rows) beside a right-hand panel that opens on **"What can I do
  with it?"** and flips to V2's rows panel when you click into the switchboard. Health marks the switchboard's package
  nodes. An unknown `typeKey` (e.g. missing in an older version) is said, not swapped silently.
- **On a phone (≤ 640 px, V2's own breakpoint)** the switchboard is laid out by the kit (`swnarrow.js`): producers
  above the type, consumers below, import-only below those, two boxes per row around a central gap that carries one
  trunk per kind; each edge branches off in the gap beside its own row with its count on that branch. Drawn over V2's
  nodes by a scoped `<style>` (node transforms, CSS `d` on the edge paths, label transforms), so V2's state, clicks,
  focus styling, "+N types" rings and layer groups all keep working and are laid out too; V2's viewport, zoom buttons
  and fit stay V2's. The canvas height follows the layout; the zoom controls sit in a strip at the bottom left that
  nothing is drawn in. Measured on today's graph at 390 px: 0 edges through an unrelated box for every one of the 31
  types (V2's layout: 6 on JointTrajectory, 1 on JointState), no count under a box, zoom 0.71 (was 0.57). Desktop is
  V2's layout untouched (no override above 640 px). `narrowLayout(nodes, ringParent)` returns the geometry.
- `<TypeActions graph typeId health sourceUrl onOpenType onOpenPackage limit />`: functions that take the type (symbol,
  package + health, `JointTrajectory, JointState → TrackingResult`, file:line at the version's ref), "Where to get one"
  (producers) and the packages that only import it. Several on one page are fine: heading ids are per instance
  (`k-ta-take-<useId>`), and "N functions take it" / "N return one" scroll to their own instance.
- `<TypeLink graph id onOpen />` (any type mention → that type; a real `#/types/<Name>?v=…` link),
  `<TypeText text graph onOpenType />` (links type names inside free text), `<Signature graph sig focus />`.
- `<TypeSearch graph health onOpenType value onChange />` and `typeSearch(graph, query)`: plain names (`JointTraj`),
  `JointTrajectory ->` (what takes it), `-> JointTrajectory` (where to get one), `A -> B` (functions taking A and
  returning B, plus two-step chains when none does).
- Model (`model.js`): `signatures(graph)` (uses rows grouped by symbol: consumes = inputs, produces = outputs),
  `consumersOf`, `producersOf`, `importersOf`, `groupByPackage`, `pipelineEdges`, `matchTypes`, `resolveType`,
  `typeKey`, `mostUsedType`, `diffGraphs`, `diffText`, `refFor`, `sourceUrlAt`, plus `@shared/graph.js`'s layer helpers.

### Panels — `panels.jsx`

`<Pitch compact onOpenRun onOpenTypes />` (README pitch + pip install), `<RunPanel pick graph health onOpenType onOpenPackage plots />`
(the pick-and-place stages with type links + the three plots), `<AgentsPanel graph health onOpenPackage />`,
`<AgentCard agent />`, `<SkillPanel />`. Re-exported from `@shared/parts.jsx`: `PITCH`, `Install`, `CopyCode`,
`SkillBlock`, `Plots`, `PkgLinks`, `REPO_URL`, ….

## Styling

`kit.css` (+ `types.css`, `types.v2.css`). Kit classes start with `k-`; restyle a variant's shell freely and override
`--k-fail`, `--k-warn`, `--k-pass`, `--k-flow`, `--k-radius` to retheme. Note `@shared/kit.css` also owns `.k-produces`,
`.k-consumes`, `.k-imports` (V2's kind colours). `types.v2.css` is generated from `src/v2/v2.css` by
`gen_types_css.py` (V2's Types-tab rules scoped under `.k-types`); regenerate, don't edit. Readable at 1440 × 900 and
390 px (no sideways page scroll; the health table drops to dots and short headers on a phone; the package map keeps a
readable zoom and scrolls inside itself, see Package map). No duplicate ids on a page that holds several components
(React Flow instances get their own `id`).

## Known limits

- ELK (`elkjs/lib/elk.bundled.js`, ~1.6 MB) is inlined into every single-file build: the demo is ~2.5 MB on disk
  (~0.9 MB gzipped). Layout runs on the main thread (~40–100 ms per change on today's graph).
- Only the top-level data files are embedded at build time; opened from `file://`, Latest release and snapshots are
  listed but disabled with the reason.
- Snapshots record no health (versions.json `health: null`); every health view says so for them.
- The phone switchboard overrides V2's geometry with CSS, so the DOM's own `d` attributes and node `style.transform`
  still hold V2's numbers: measure what is drawn (`getPointAtLength` / `getScreenCTM`, `getBoundingClientRect`), as
  verify_kit does. The kit layout is mapped into the viewport V2's fit gives at the current canvas size, so after a
  resize that V2 did not refit for (V2 refits on a node change or its fit button), the drawing can sit off-centre until
  the next refit.
- V2's own rows panel (inside TypeWorkspace, imported unchanged) renders its file:line links at `main`; TypeWorkspace
  re-points each one at the version's ref through `sourceUrl` (a MutationObserver on the panel), so the Rows tab,
  TypeActions, TypeSearch and `site.sourceUrl` all link the release tag or snapshot sha. Without a `sourceUrl` prop the
  rows stay at `main`. The rows panel's package links (GitHub, README) stay package-level.
- On a phone the pipeline is wider than the screen at a readable zoom (labels take room): it scrolls sideways inside
  the canvas.
- `GLUE = "robot_msgs"` is the one package the pipeline hides; any other shared-type package would show as a node.
