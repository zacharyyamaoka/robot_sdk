"""The robotsdk.dev landing page: one page, no sidebar, in the pidtuna.com "Yellowfin" look. Called by publish_dashboard.py.

    python3 /home/bam/robot_sdk/site/landing.py [out.html]     # default: print the page's path after writing site/_build/index.html

WHY a separate landing page (Zach, 2026-11-25, on robotsdk.dev: "update the landing page so that it doesn't have the side
bar. see how the landing page of pidtuna.com is and do something more like informative and media rich like that"):
/ is this page; the V10 Docs (sidebar, packages, types, health) moved to /docs/, one click away from the top bar, and
every old link (/#/…, /v10/#/…) is forwarded there with its route intact.

Look: pidtuna.com's landing (pidtuna-website's Landing.vue + style.css tokens, the same block robot_reach's and
robot_collision's sites copy under the `--pt-*` names). WHY a copy, not an import: that theme is a VitePress Vue theme
with no published package; this is one static file the hourly refresh rebuilds with the stdlib alone.

Inputs, all real; nothing here is a hand-written fact about a package:
- site/data/graph.json: every card (name, layer, one line, languages, PyPI name, links) and the counts. The hourly
  refresh rebuilds it from each repo's robot-sdk.toml before this runs, so the cards follow the packages.
- site/data/domain.json: the layer diagram's arrows, each citing a public signature (drawn by build.py's domain_svg).
- site/data/pick_and_place.json + site/media/pick_and_place_*.png + examples/pick_and_place.py: the assembled example,
  its recorded results and plots, and the code excerpt (read from the file, never retyped).
- site/media/landing/: stills and clips cut from each package's own recordings by site/landing_media.py (manifest.json
  names every source). data/health.json is read in the browser, so the health line is as fresh as the last refresh.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent
ROOT = SITE.parent
sys.path.insert(0, str(SITE))
from build import LAYER_LABEL, domain_svg, esc, language_chips, pipeline_svg  # noqa: E402  (site/build.py: the diagram code)

REPO = "https://github.com/zacharyyamaoka/robot_sdk"
DOCS = "docs/"  # the V10 Docs, published beside this page by publish_dashboard.py
LAYER_ORDER = ["vocabulary", "models", "leaf", "comms", "viewers", "outer", "checks"]
LAYER_HEAD = {  # what each layer is for, from the README's dependency rule
    "vocabulary": ("Vocabulary", "The types every package joins on. Nothing below it."),
    "models": ("Models", "Generic models by type, built on the vocabulary."),
    "leaf": ("Leaves", "One job each. A leaf never imports another leaf: it takes a function or a Protocol instead."),
    "comms": ("Comms", "Moves robot_msgs types between processes and languages."),
    "viewers": ("Viewers", "End points: they read the types, nothing depends on them."),
    "outer": ("Outer API", "The top of the stack, assembled from the layers below."),
    "checks": ("Checks", "Health checks as pure functions, run over any of the above."),
}
# The excerpt of examples/pick_and_place.py: (comment shown above it, first line's exact text, lines). Read from the
# file at build time, with its own line numbers, so the page can never show code the example does not run.
EXCERPT = [
    ("1 · robot_reach: the arm, and whether it reaches the four tool points", "arm = ur5e()", 1),
    (None, "reach = reach_map(arm, targets, tool_down)", 1),
    ("2 · robot_trajectories: the pick-and-place motion, timed by minimum jerk", "leg_timing = WaypointTrajectoryGenerator", 2),
    ("3 · robot_controllers: the trajectory controller, ticked against the simulated arm", "jtc = controller(", 1),
    (None, "for tick in range(", 7),
    ("4 · robot_metrics: tracking and stop error, folded over the run", "metrics = Collection(aliases)", 2),
    ("5 · robot_diagnostics: the stock stop-error check, per joint", "stop_check = replace(", 6),
]
PY_KEYWORDS = {"for", "in", "if", "else", "return", "import", "from", "def", "class", "None", "True", "False", "and", "or", "not", "with", "as"}
LOGO = ('<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#1c1e21"/>'
        '<path d="M8 16h16" stroke="#fff" stroke-width="2" opacity=".55"/><circle cx="8" cy="16" r="3.6" fill="#3fb37f"/>'
        '<rect x="12.5" y="12.5" width="7" height="7" rx="1.6" fill="#fff"/><circle cx="24" cy="16" r="3.6" fill="#5b8def"/></svg>')


def highlight(code: str) -> str:
    """Python, coloured with the stdlib: comments, strings, numbers, keywords, called names."""
    token = re.compile(r"(?P<com>#[^\n]*)|(?P<str>(?:[rbf]?)(?:\"[^\"\n]*\"|'[^'\n]*'))|(?P<num>\b\d+(?:\.\d+)?(?:e-?\d+)?\b)"
                       r"|(?P<name>\b[A-Za-z_]\w*\b)(?P<call>\s*\()?")
    out, last = [], 0
    for match in token.finditer(code):
        out.append(esc(code[last:match.start()]))
        last = match.end()
        if match.group("com"):
            out.append(f'<span class="c">{esc(match.group())}</span>')
        elif match.group("str"):
            out.append(f'<span class="s">{esc(match.group())}</span>')
        elif match.group("num"):
            out.append(f'<span class="m">{esc(match.group())}</span>')
        else:
            name, call = match.group("name"), match.group("call") or ""
            if name in PY_KEYWORDS:
                out.append(f'<span class="k">{esc(name)}</span>{esc(call)}')
            elif call:
                out.append(f'<span class="nf">{esc(name)}</span>{esc(call)}')
            else:
                out.append(esc(name))
    out.append(esc(code[last:]))
    return "".join(out)


def excerpt() -> tuple[str, str]:
    """The example's package calls, verbatim with their line numbers; returns (html, 'lines a–b of N')."""
    path = ROOT / "examples" / "pick_and_place.py"
    if not path.exists():
        return "", ""
    lines = path.read_text().splitlines()
    rows, first_last = [], []
    for comment, start, count in EXCERPT:
        at = next((i for i, line in enumerate(lines) if line.startswith(start)), None)
        if at is None:
            continue  # the example changed: leave the chunk out rather than show code it no longer has
        if comment:
            rows.append(f'<span class="ln"> </span><span class="c"># {esc(comment)}</span>')
        for i in range(at, min(at + count, len(lines))):
            rows.append(f'<span class="ln">{i + 1}</span>{highlight(lines[i])}')
            first_last.append(i + 1)
    if not rows:
        return "", ""
    return "\n".join(rows), f"lines {min(first_last)}–{max(first_last)} of {len(lines)}"


def card(package: dict, media: dict) -> str:
    pid, links = package["id"], package.get("links", {})
    own = links.get("site")
    home = own or links.get("github") or f"{REPO}"
    shot = media.get(pid)
    if shot:
        clip = (f'<video muted loop playsinline preload="none" poster="{esc(shot["still"])}" aria-hidden="true">'
                f'<source src="{esc(shot["clip"])}" type="video/mp4"></video>') if shot.get("clip") else ""
        figure = (f'<a class="pk-media{" has-clip" if clip else ""}" href="{esc(home)}" tabindex="-1">'
                  f'<img src="{esc(shot["still"])}" alt="{esc(shot["caption"])}" loading="lazy" width="640" height="400">{clip}'
                  f'{"<span class=play aria-hidden=true>▶</span>" if clip else ""}</a>'
                  f'<p class="pk-cap">{esc(shot["caption"])}</p>')
    else:
        figure = (f'<a class="pk-media empty" href="{esc(home)}" tabindex="-1"><span>{esc(pid)}</span><small>no recording yet</small></a>'
                  f'<p class="pk-cap">{esc(package.get("use_when", "")).replace("**", "")}</p>')
    buttons = []
    if own:
        buttons.append(f'<a class="pk-btn primary" href="{esc(own)}">Landing page ↗</a>')
    buttons.append(f'<a class="pk-btn" href="{DOCS}#/packages/{esc(pid)}">Docs</a>')
    if links.get("github"):
        buttons.append(f'<a class="pk-btn" href="{esc(links["github"])}">GitHub</a>')
    if links.get("pypi"):
        buttons.append(f'<a class="pk-btn" href="{esc(links["pypi"])}">PyPI</a>')
    layer = LAYER_HEAD.get(package.get("layer"), (package.get("layer", ""), ""))[0]
    return (f'<article class="pk" id="pkg-{esc(pid)}">{figure}<div class="pk-body"><p class="pk-layer">{esc(layer)}</p>'
            f'<h3><a href="{esc(home)}">{esc(pid)}</a></h3><p class="pk-line">{esc(package.get("one_line", ""))}</p>'
            f'<div class="pk-meta">{language_chips(package)}<code>pip install {esc(package.get("pypi", pid))}</code></div>'
            f'<div class="pk-btns">{"".join(buttons)}</div></div></article>')


def build() -> str:
    graph = json.loads((SITE / "data" / "graph.json").read_text())
    domain = json.loads((SITE / "data" / "domain.json").read_text())
    pipeline_path = SITE / "data" / "pick_and_place.json"
    pipeline = json.loads(pipeline_path.read_text()) if pipeline_path.exists() else None
    manifest_path = SITE / "media" / "landing" / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    media = {k: v for k, v in manifest.items() if not k.startswith("_") and (SITE / v["still"]).exists()}
    packages = graph["packages"]
    by_id = {p["id"]: p for p in packages}

    # One grid, ordered bottom to top; each card names its layer. WHY not a block per layer: most layers hold one
    # package, and seven one-card rows made the page eleven screens long for fifteen cards.
    rank = {layer: i for i, layer in enumerate(LAYER_ORDER)}
    ordered = sorted(packages, key=lambda p: rank.get(p.get("layer"), len(LAYER_ORDER)))
    groups = f'<div class="pk-grid">{"".join(card(p, media) for p in ordered)}</div>'
    layer_list = "".join(f'<li><b>{esc(LAYER_HEAD[layer][0])}</b> {esc(LAYER_HEAD[layer][1])}</li>'
                         for layer in LAYER_ORDER if any(p.get("layer") == layer for p in packages))

    try:
        diagram, edges = domain_svg(domain)
    except KeyError:  # domain.json names a package graph.json dropped: show the cards, skip the diagram
        diagram, edges = "", []
    hero_order = [pid for pid in manifest.get("_hero", {}).get("order", []) if pid in by_id]
    hero_has = (SITE / "media" / "landing" / "hero.mp4").exists()
    reel = "".join(f'<a class="chip" href="#pkg-{esc(pid)}">{esc(pid)}</a>' for pid in hero_order)
    code_html, code_where = excerpt()

    stages_html = ""
    plots = ""
    flow = ""
    if pipeline:
        flow = pipeline_svg(pipeline)
        items = []
        for number, stage in enumerate(pipeline["stages"], 1):
            result = stage.get("one_line_result", "")
            fail = result.startswith("FAIL")
            items.append(f'<li class="{"fail" if fail else ""}"><span class="n">{number}</span><strong><a href="#pkg-{esc(stage["package"])}">'
                         f'{esc(stage["package"])}</a></strong><p class="io"><code>{esc(stage.get("input_type", ""))}</code> → '
                         f'<code>{esc(stage.get("output_type", ""))}</code></p><p>{esc(result)}</p></li>')
        stages_html = f'<ol class="run-stages">{"".join(items)}</ol>'
        shots = []
        for name, caption in (("pick_and_place_tool_path.png", "The tool path: measured, coloured by time, against the plan (dashed)"),
                              ("pick_and_place_joints.png", "Every joint: the controller's target (grey) against the simulated arm"),
                              ("pick_and_place_tracking_error.png", "Tracking error per joint; shaded, the stops robot_diagnostics scored")):
            if (SITE / "media" / name).exists():
                shots.append(f'<figure class="shot"><a href="media/{name}"><img src="media/{name}" alt="{esc(caption)}" loading="lazy"></a>'
                             f'<figcaption>{esc(caption)}</figcaption></figure>')
        plots = f'<div class="shots">{"".join(shots)}</div>' if shots else ""
    run = (pipeline or {}).get("run", {})
    run_meta = (f'Plant: {esc(pipeline.get("plant", ""))}. Ran {esc(run.get("date", "")[:10])} in {esc(run.get("runtime_s", ""))} s.'
                if pipeline else "")

    counts = (f'<b>{len(packages)}</b> packages · <b>{len(graph.get("types", []))}</b> shared types · '
              f'<b>{len(graph.get("uses", []))}</b> type uses, scanned from the code')
    page = (TEMPLATE.replace("@@CSS@@", CSS).replace("@@LOGO@@", LOGO).replace("@@COUNTS@@", counts)
            .replace("@@N@@", str(len(packages)))
            .replace("@@HERO@@", HERO_VIDEO if hero_has else '<img src="media/landing/hero.jpg" alt="">')
            .replace("@@REEL@@", reel).replace("@@GROUPS@@", groups).replace("@@LAYERS@@", layer_list).replace("@@DIAGRAM@@", diagram)
            .replace("@@EDGES@@", str(len(edges))).replace("@@FLOW@@", flow).replace("@@STAGES@@", stages_html)
            .replace("@@PLOTS@@", plots).replace("@@RUN_META@@", run_meta).replace("@@CODE@@", code_html)
            .replace("@@CODE_WHERE@@", code_where).replace("@@REPO@@", REPO).replace("@@DOCS@@", DOCS)
            .replace("@@GENERATED@@", esc(graph.get("generated", "")[:16].replace("T", " "))))
    return page


HERO_VIDEO = ('<video id="hero-video" autoplay muted loop playsinline preload="auto" poster="media/landing/hero.jpg" '
              'aria-label="Recordings from seven robot-sdk packages, three seconds each">'
              '<source src="media/landing/hero.mp4" type="video/mp4"></video>'
              '<button class="hero-toggle" type="button" aria-label="Pause the video" title="Pause / play">❚❚</button>')

CSS = r"""
:root{--pt-font-base:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;--pt-font-display:'Space Grotesk','Inter',ui-sans-serif,system-ui,sans-serif;--pt-font-mono:'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,monospace;
--pt-bg:#ffffff;--pt-bg-soft:#f2f6fa;--pt-bg-deep:#0a1f33;--pt-on-deep:#e8f0f8;--pt-text:#0b1b2b;--pt-text-2:#3d5166;--pt-text-3:#6b7d90;--pt-line:#d9e2ec;
--pt-brand:#0f4c81;--pt-brand-2:#1763a6;--pt-brand-soft:rgba(15,76,129,.1);--pt-accent:#c98a00;--pt-accent-soft:rgba(229,165,0,.16);--pt-warn:#d6402b;--pt-ok:#2e8555;
--pt-radius:14px;--pt-radius-sm:8px;--pt-border-w:1px;--pt-shadow:0 1px 2px rgba(10,31,51,.06),0 8px 24px rgba(10,31,51,.06);
--pt-display-weight:700;--pt-display-tracking:-0.025em;
--produce:#2e8555;--consume:#3567b5;--band:#f2f6fa;--card:#ffffff;--dim:.16;
--c-kw:#7c2fa8;--c-str:#2a7a2a;--c-num:#b35c00;--c-com:#6b7d90;--c-fn:#1763a6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--pt-bg:#07131f;--pt-bg-soft:#0c1d2e;--pt-bg-deep:#040c15;--pt-text:#e6edf5;--pt-text-2:#a9b8c8;--pt-text-3:#7a8b9c;--pt-line:#1b3046;
--pt-brand:#5fb0ff;--pt-brand-2:#8cc6ff;--pt-brand-soft:rgba(95,176,255,.14);--pt-accent:#ffc21a;--pt-accent-soft:rgba(255,194,26,.14);--pt-warn:#ff6b57;--pt-ok:#7cc39b;
--pt-shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);--produce:#7cc39b;--consume:#8db4f0;--band:#0c1d2e;--card:#07131f;--dim:.22;
--c-kw:#c792ea;--c-str:#9ece6a;--c-num:#ff9e64;--c-com:#7a8b9c;--c-fn:#8cc6ff}}
:root[data-theme="dark"]{--pt-bg:#07131f;--pt-bg-soft:#0c1d2e;--pt-bg-deep:#040c15;--pt-text:#e6edf5;--pt-text-2:#a9b8c8;--pt-text-3:#7a8b9c;--pt-line:#1b3046;
--pt-brand:#5fb0ff;--pt-brand-2:#8cc6ff;--pt-brand-soft:rgba(95,176,255,.14);--pt-accent:#ffc21a;--pt-accent-soft:rgba(255,194,26,.14);--pt-warn:#ff6b57;--pt-ok:#7cc39b;
--pt-shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);--produce:#7cc39b;--consume:#8db4f0;--band:#0c1d2e;--card:#07131f;--dim:.22;
--c-kw:#c792ea;--c-str:#9ece6a;--c-num:#ff9e64;--c-com:#7a8b9c;--c-fn:#8cc6ff}
*{box-sizing:border-box}
html{overflow-x:hidden;scroll-padding-top:72px}
body{margin:0;background:var(--pt-bg);color:var(--pt-text);font:16px/1.6 var(--pt-font-base);overflow-x:hidden;-webkit-font-smoothing:antialiased}
a{color:var(--pt-brand)}
h1,h2{font-family:var(--pt-font-display);font-weight:var(--pt-display-weight);letter-spacing:var(--pt-display-tracking);line-height:1.05;margin:0}
code{font-family:var(--pt-font-mono);font-size:.875em;background:var(--pt-bg-soft);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
/* nav: VitePress' bar */
.nav{position:sticky;top:0;z-index:10;background:var(--pt-bg);border-bottom:1px solid var(--pt-line)}
.nav-in{max-width:1376px;margin:0 auto;height:64px;padding:0 32px;display:flex;align-items:center;gap:24px}
.brand{display:flex;align-items:center;gap:10px;color:var(--pt-text);text-decoration:none;font-weight:700;font-size:16px;letter-spacing:-.01em;font-family:var(--pt-font-mono)}
.brand .mark{width:30px;height:30px}
.nav-links{margin-left:auto;display:flex;gap:22px;align-items:center}
.nav-links a{color:var(--pt-text);text-decoration:none;font-size:14px;font-weight:500}
.nav-links a:hover{color:var(--pt-brand)}
.nav-links a.docs{padding:6px 14px;border:1px solid var(--pt-brand);border-radius:var(--pt-radius-sm);color:var(--pt-brand);font-weight:600}
.nav-links a.docs:hover{background:var(--pt-brand);color:var(--pt-bg)}
.nav-docs-phone{display:none;margin-left:auto;padding:5px 12px;border:1px solid var(--pt-brand);border-radius:var(--pt-radius-sm);color:var(--pt-brand);font-weight:600;font-size:14px;text-decoration:none}
.theme{margin-left:8px;width:40px;height:22px;border-radius:11px;border:1px solid var(--pt-line);background:var(--pt-bg-soft);cursor:pointer;position:relative;padding:0;flex:none}
.theme::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--pt-bg);box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .2s}
.is-dark .theme::after{transform:translateX(18px)}
/* landing */
.pt-landing{--gap:clamp(56px,7vw,104px);max-width:1180px;margin:0 auto;padding:24px 24px 96px}
section{margin-top:var(--gap)}
section.hero{margin-top:clamp(16px,4vw,48px)}
.section-head{max-width:780px;margin-bottom:24px}
.section-head h2{font-size:clamp(26px,3.4vw,38px)}
.section-head p{margin:10px 0 0;color:var(--pt-text-2);font-size:16px;line-height:1.6}
.hero{display:grid;grid-template-columns:minmax(0,.86fr) minmax(0,1.14fr);gap:clamp(24px,4vw,56px);align-items:center}
.eyebrow{margin:0 0 14px;color:var(--pt-accent);font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.wordmark{display:flex;align-items:center;gap:14px;font-size:clamp(38px,4.6vw,64px);min-width:0;overflow-wrap:anywhere;font-family:var(--pt-font-mono);letter-spacing:-.04em}
.wordmark .mark{width:.95em;height:.95em;flex:none}
.lead{margin:22px 0 0;font-size:clamp(19px,2vw,23px);line-height:1.45;font-weight:600}
.sub{margin:14px 0 0;color:var(--pt-text-2);font-size:16px;line-height:1.6}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.btn{display:inline-flex;align-items:center;padding:10px 18px;border:var(--pt-border-w) solid var(--pt-line);border-radius:var(--pt-radius-sm);color:var(--pt-text);font-weight:600;font-size:15px;text-decoration:none;transition:background .15s,border-color .15s;background:var(--pt-bg)}
.btn:hover{border-color:var(--pt-brand)}
.btn.primary{background:var(--pt-brand);border-color:var(--pt-brand);color:var(--pt-bg)}
.btn.primary:hover{background:var(--pt-brand-2)}
.install{display:flex;align-items:center;gap:0;margin-top:22px;max-width:100%;width:max-content;border:1px solid var(--pt-line);border-radius:var(--pt-radius-sm);background:var(--pt-bg-soft);overflow:hidden}
.install code{background:none;font-size:14px;padding:10px 14px;white-space:nowrap}
.install code::before{content:"$ ";color:var(--pt-text-3)}
.copy{border:0;border-left:1px solid var(--pt-line);background:var(--pt-bg);color:var(--pt-text-2);font:600 13px var(--pt-font-base);padding:10px 14px;cursor:pointer}
.copy:hover{color:var(--pt-brand)}
.counts{margin:12px 0 0;color:var(--pt-text-3);font-size:13.5px}
.counts b{color:var(--pt-text-2);font-variant-numeric:tabular-nums}
.health{margin:6px 0 0;font-size:13.5px;color:var(--pt-text-3);min-height:1.6em}
.health a{color:var(--pt-text-2);white-space:nowrap}
.health .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 4px 0 8px;vertical-align:1px}
.hero-stage{position:relative;min-width:0;padding:14px;border-radius:calc(var(--pt-radius) + 6px);background:radial-gradient(120% 90% at 85% 0%,rgba(255,194,26,.12),transparent 55%),linear-gradient(160deg,#0f4c81 0%,#0a1f33 70%);box-shadow:var(--pt-shadow)}
.hero-stage .frame{position:relative}
.hero-stage video,.hero-stage img{display:block;width:100%;height:auto;aspect-ratio:1280/780;border-radius:var(--pt-radius-sm);background:#0a1f33}
.hero-toggle{position:absolute;right:10px;top:10px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(10,31,51,.7);color:#e8f0f8;font-size:11px;cursor:pointer;opacity:.6}
.hero-toggle:hover{opacity:1}
.hero-stage .caption{color:rgba(232,240,248,.78);margin:10px 2px 0;font-size:13px;line-height:1.5}
.reel{display:flex;flex-wrap:wrap;gap:6px;margin:10px 2px 0}
.reel .chip{font:12px var(--pt-font-mono);color:#ffc21a;text-decoration:none;border:1px solid rgba(255,194,26,.35);border-radius:99px;padding:1px 9px}
.reel .chip:hover{background:rgba(255,194,26,.14)}
/* steps strip */
.stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
.stages li{border:var(--pt-border-w) solid var(--pt-line);border-radius:var(--pt-radius);background:var(--pt-bg);transition:border-color .15s,transform .15s;padding:16px}
.stages li:hover{border-color:var(--pt-brand);transform:translateY(-2px)}
.stages li.out{background:var(--pt-brand-soft);border-color:var(--pt-brand)}
.stages .n{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--pt-accent-soft);color:var(--pt-accent);font-family:var(--pt-font-mono);font-weight:700;font-size:14px}
.stages strong{display:block;margin-top:10px;font-size:16px}
.stages p{margin:6px 0 0;color:var(--pt-text-2);font-size:14px;line-height:1.5}
.stages .pk-refs{margin-top:10px;display:flex;flex-wrap:wrap;gap:4px}
.stages .pk-refs a{font:12px var(--pt-font-mono);text-decoration:none;background:var(--pt-bg-soft);border-radius:4px;padding:1px 6px}
/* promises */
.promises{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.promise{padding:20px;border-top:3px solid var(--pt-accent);background:var(--pt-bg-soft);border-radius:var(--pt-radius-sm)}
.promise strong{font-size:16px}
.promise p{margin:8px 0 0;color:var(--pt-text-2);font-size:14px;line-height:1.55}
.promise .how{color:var(--pt-text-3);font-size:13px}
/* package cards */
.pk-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.pk-layer{margin:2px 0 -4px;color:var(--pt-accent);font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.layer-rules{list-style:none;margin:20px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px 24px;font-size:14px;color:var(--pt-text-2)}
.layer-rules b{color:var(--pt-text);margin-right:4px}
.pk{display:flex;flex-direction:column;border:var(--pt-border-w) solid var(--pt-line);border-radius:var(--pt-radius);overflow:hidden;background:var(--card);transition:border-color .15s,box-shadow .15s}
.pk:hover{border-color:var(--pt-brand);box-shadow:var(--pt-shadow)}
.pk-media{position:relative;display:block;aspect-ratio:16/10;background:#fff;border-bottom:1px solid var(--pt-line);overflow:hidden}
.pk-media img,.pk-media video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.pk-media video{opacity:0;transition:opacity .2s}
.pk-media.playing video{opacity:1}
.pk-media .play{position:absolute;right:10px;bottom:10px;width:28px;height:28px;border-radius:50%;background:rgba(10,31,51,.72);color:#fff;font-size:11px;display:grid;place-items:center;transition:opacity .2s}
.pk-media.playing .play{opacity:0}
.pk-media.empty{display:grid;place-content:center;text-align:center;background:var(--pt-bg-soft);color:var(--pt-text-3);text-decoration:none}
.pk-media.empty span{font:600 16px var(--pt-font-mono);color:var(--pt-text-2)}
.pk-media.empty small{font-size:12.5px}
.pk-cap{margin:0;padding:8px 14px 0;color:var(--pt-text-3);font-size:12.5px;line-height:1.45}
.pk-body{padding:8px 14px 14px;display:flex;flex-direction:column;gap:8px;flex:1}
.pk h3{margin:0;font:700 16px var(--pt-font-mono);letter-spacing:-.01em}
.pk h3 a{color:var(--pt-text);text-decoration:none}
.pk h3 a:hover{color:var(--pt-brand)}
.pk-line{margin:0;color:var(--pt-text-2);font-size:14.5px;line-height:1.5}
.pk-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px}
.pk-meta code{font-size:12px}
.langs{display:inline-flex;gap:4px}
.lang{font-size:11.5px;line-height:1.6;padding:0 8px;border-radius:99px;background:var(--pt-brand-soft);color:var(--pt-text);white-space:nowrap}
.lang-partial,.lang-planned{background:transparent;border:1px dashed var(--pt-line);color:var(--pt-text-3)}
.pk-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:4px}
.pk-btn{font-size:12.5px;font-weight:600;text-align:center;text-decoration:none;border:1px solid var(--pt-line);border-radius:6px;padding:4px 10px;color:var(--pt-text)}
.pk-btn:hover{border-color:var(--pt-brand);color:var(--pt-brand)}
.pk-btn.primary{flex-basis:100%;background:var(--pt-brand);border-color:var(--pt-brand);color:var(--pt-bg)}
.pk-btn.primary:hover{background:var(--pt-brand-2);color:var(--pt-bg)}
/* diagram (site/build.py's domain_svg, recoloured) */
.figure-card{background:var(--card);border:1px solid var(--pt-line);border-radius:var(--pt-radius);padding:12px;overflow-x:auto}
.domain,.flow{width:100%;min-width:860px;height:auto;display:block}
.phone-hint{display:none;font-size:13px;margin:0 0 6px;color:var(--pt-text-3)}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13.5px;margin:12px 0 0;color:var(--pt-text-2)}
.legend span::before{content:"";display:inline-block;width:22px;height:0;border-top:2.5px solid;vertical-align:middle;margin-right:6px}
.legend .lb::before{width:16px;height:12px;border:1px solid var(--pt-line);background:var(--band);border-radius:3px}
.legend .lp::before{border-color:var(--produce)}.legend .lc::before{border-color:var(--consume)}
.legend .ll::before{border-color:var(--pt-text-3);border-top-style:dashed}
.band{fill:var(--band);stroke:var(--pt-line)}
.type rect{fill:var(--card);stroke:var(--pt-text);stroke-width:1.2}
.type text{fill:var(--pt-text);font:600 12.5px var(--pt-font-mono)}
.pkg rect{fill:var(--card);stroke:var(--pt-line);stroke-width:1.5}
.pkg.layer-outer rect,.pkg.layer-checks rect{stroke:var(--produce)}
.pkg.own rect{stroke-dasharray:4 3}
.pkg-name{fill:var(--pt-text);font:600 13.5px var(--pt-font-mono)}
.pkg-layer{fill:var(--pt-text-3);font-size:12px}
.pkg,.type{cursor:pointer;outline:none}
.edge{fill:none;stroke-width:2;opacity:.85;transition:opacity .15s}
.edge.produces{stroke:var(--produce)}.edge.consumes{stroke:var(--consume)}
.edge.library{stroke:var(--pt-text-3);stroke-dasharray:6 5;stroke-width:1.6;opacity:0}
.domain.focus .edge.library.on{opacity:1}.domain.focus .edge.library:not(.on){opacity:0}
.edge.carries{stroke:var(--pt-text-3);stroke-width:1.6;stroke-dasharray:2 4}
.mk-produce{fill:var(--produce)}.mk-consume{fill:var(--consume)}
.edge-note{fill:var(--pt-text-3);font-size:12px}
.domain.focus .edge,.domain.focus .pkg,.domain.focus .type{opacity:var(--dim)}
.domain.focus .on{opacity:1!important}.domain.focus .edge.on{stroke-width:3}
.flow-node rect{fill:var(--card);stroke:var(--pt-line);stroke-width:1.5}
.flow-node.plant rect{fill:var(--band);stroke-dasharray:5 4;stroke:var(--pt-text-3)}
.flow-node.verdict-fail rect{stroke:var(--pt-warn);stroke-width:2}
.flow-name{fill:var(--pt-text);font:600 14px var(--pt-font-mono)}
.flow-sub{fill:var(--pt-text-3);font-size:12.5px}
.flow-edge{fill:none;stroke:var(--produce);stroke-width:2}.mk-flow{fill:var(--produce)}
.flow-label{fill:var(--pt-text);font:12.5px var(--pt-font-mono);paint-order:stroke;stroke:var(--card);stroke-width:5px}
.flow-result{fill:var(--pt-text-3);font-size:12.5px}.flow-result.fail{fill:var(--pt-warn);font-weight:600}
/* the run */
.run-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:24px;align-items:start;margin-top:20px}
.code{position:relative;margin:0;background:var(--pt-bg-soft);border-radius:var(--pt-radius-sm);min-width:0}
.code .lang-tag{position:absolute;top:6px;right:12px;font-size:12px;color:var(--pt-text-3)}
.code pre{margin:0;padding:20px 20px 20px 8px;overflow-x:auto;font:12.5px/1.7 var(--pt-font-mono)}
.code .ln{display:inline-block;width:3.2em;padding-right:1em;text-align:right;color:var(--pt-text-3);opacity:.6;user-select:none}
.code .k{color:var(--c-kw)}.code .s{color:var(--c-str)}.code .m{color:var(--c-num)}.code .c{color:var(--c-com);font-style:italic}.code .nf{color:var(--c-fn)}
.code-foot{margin:8px 0 0;color:var(--pt-text-3);font-size:13px}
.run-stages{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.run-stages li{position:relative;border:1px solid var(--pt-line);border-radius:var(--pt-radius-sm);padding:10px 12px 10px 48px;background:var(--card)}
.run-stages li .n{position:absolute;left:12px;top:11px;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--pt-accent-soft);color:var(--pt-accent);font:700 12.5px var(--pt-font-mono)}
.run-stages strong a{font:600 14px var(--pt-font-mono);text-decoration:none}
.run-stages p{margin:2px 0 0;font-size:13.5px;color:var(--pt-text-2);line-height:1.45}
.run-stages p.io code{font-size:11.5px}
.run-stages li.fail{border-color:var(--pt-warn)}.run-stages li.fail p:last-child{color:var(--pt-warn);font-weight:600}
.shots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:24px}
.shot{margin:0;border:var(--pt-border-w) solid var(--pt-line);border-radius:var(--pt-radius);overflow:hidden;background:var(--card);transition:border-color .15s}
.shot:hover{border-color:var(--pt-brand)}
.shot img{display:block;width:100%;height:auto;background:#fff;border-bottom:1px solid var(--pt-line)}
.shot figcaption{padding:10px 14px 12px;color:var(--pt-text-2);font-size:13.5px;line-height:1.5}
.footnote{margin-top:14px;max-width:860px;color:var(--pt-text-2);font-size:14px;line-height:1.6}
/* install */
.install-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.install-card{border:1px solid var(--pt-line);border-radius:var(--pt-radius);padding:18px;background:var(--card);min-width:0}
.install-card strong{display:block;font-size:16px;margin-bottom:6px}
.install-card p{margin:0 0 10px;color:var(--pt-text-2);font-size:14px}
.install-card pre{margin:0;background:var(--pt-bg-soft);border-radius:6px;padding:10px 12px;overflow-x:auto;font:12.5px/1.6 var(--pt-font-mono)}
.cta{display:flex;align-items:center;gap:16px;padding-top:32px;border-top:1px solid var(--pt-line);color:var(--pt-text-2)}
.cta .mark{width:48px;height:48px;flex:none}
.cta p{margin:0;font-size:16px}
footer{border-top:1px solid var(--pt-line);padding:24px;text-align:center;color:var(--pt-text-3);font-size:13.5px}
footer a{color:var(--pt-text-2)}
@media (max-width:1100px){.pk-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:1060px){.stages{grid-template-columns:repeat(3,minmax(0,1fr))}.run-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:860px){.pk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:960px){.hero{grid-template-columns:1fr}.promises,.install-grid{grid-template-columns:1fr}.shots{grid-template-columns:1fr 1fr}.nav-links{display:none}.nav-docs-phone{display:inline-block}.theme{margin-left:0}}
@media (max-width:640px){.nav-in{padding:0 16px;gap:12px}.pt-landing{padding:12px 16px 80px}.stages,.pk-grid,.shots{grid-template-columns:minmax(0,1fr)}
.phone-hint{display:block}.code pre{padding:14px 12px 14px 0}.code .ln{width:2.6em;padding-right:.7em}.cta{flex-direction:column;align-items:flex-start}
.install{width:100%}.install code{overflow-x:auto;flex:1;min-width:0}.wordmark{gap:10px}}
@media (prefers-reduced-motion:reduce){.stages li:hover{transform:none}}
"""

TEMPLATE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>robot-sdk</title>
<meta name="description" content="A generic robotics backend in plain Python: small packages that join on one vocabulary of robot types, so a new robot task is mostly assembly.">
<meta name="theme-color" content="#0f3b5f">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect x=%271%27 y=%271%27 width=%2730%27 height=%2730%27 rx=%278%27 fill=%27%231c1e21%27/%3E%3Ccircle cx=%278%27 cy=%2716%27 r=%273.6%27 fill=%27%233fb37f%27/%3E%3Crect x=%2712.5%27 y=%2712.5%27 width=%277%27 height=%277%27 rx=%271.6%27 fill=%27%23fff%27/%3E%3Ccircle cx=%2724%27 cy=%2716%27 r=%273.6%27 fill=%27%235b8def%27/%3E%3C/svg%3E">
<script>
// WHY first, before anything paints: the docs used to live at / and their routes are hashes (#/packages/robot_msgs,
// #/types/JointTrajectory, …). Those links were shared; they now open the same page in the docs at docs/.
(function(){var h=location.hash;if(/^#\//.test(h))location.replace("@@DOCS@@"+h);
try{var t=localStorage.getItem('rsdk-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}})();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap">
<style>@@CSS@@</style></head><body>
<header class="nav"><div class="nav-in">
<a class="brand" href="#top">@@LOGO@@<span>robot-sdk</span></a>
<nav class="nav-links" aria-label="Main"><a href="#assemble">How it works</a><a href="#packages">Packages</a><a href="#layers">Layers</a><a href="#example">Example</a><a href="#install">Install</a><a href="@@REPO@@">GitHub</a><a class="docs" href="@@DOCS@@">Docs</a></nav>
<a class="nav-docs-phone" href="@@DOCS@@">Docs</a>
<button class="theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"></button>
</div></header>
<main class="pt-landing" id="top">

<section class="hero">
<div class="hero-copy">
<p class="eyebrow">Robotics backend in plain Python · open source, MIT</p>
<h1 class="wordmark">@@LOGO@@<span>robot-sdk</span></h1>
<p class="lead">Assemble, don't rewrite. @@N@@ small robotics packages that all speak one vocabulary of robot types, so a new robot task is mostly plugging together parts that already work.</p>
<p class="sub">Messages, models, controllers, reach, collision, thermal limits, trajectories, metrics, viewers and sim-to-real calibration.
Each package keeps its own repo, PyPI name and release schedule; <code>robot-sdk</code> is the one install that pins a set known to work together, the way a ROS release does.</p>
<div class="install"><code>pip install robot-sdk</code><button class="copy" type="button" data-copy="pip install robot-sdk">Copy</button></div>
<div class="actions">
<a class="btn primary" href="@@DOCS@@">Read the docs</a>
<a class="btn" href="#packages">See the packages</a>
<a class="btn" href="#example">A pick-and-place, assembled</a>
</div>
<p class="counts">@@COUNTS@@</p>
<p class="health" id="health"></p>
</div>
<div class="hero-stage">
<div class="frame">@@HERO@@</div>
<p class="caption">Real recordings, cut from the packages' own sites, reports and dashboards, three seconds each. Click a name for its card:</p>
<div class="reel">@@REEL@@</div>
</div>
</section>

<section id="assemble">
<div class="section-head"><h2>A robot task is an assembly</h2>
<p>The packages never import each other. They agree on the <code>robot_msgs</code> types instead, so the output of one is
the input of the next: a <code>JointTrajectory</code> out of a planner goes straight into a controller, a metric, a viewer
or a twin. You write the glue; the robotics is already written and tested.</p></div>
<ol class="stages">
<li><span class="n">1</span><strong>Describe the robot</strong><p>Poses, joint states, limits and trajectories as frozen dataclasses; actuators, arms and sensors as generic models.</p><div class="pk-refs"><a href="#pkg-robot_msgs">robot_msgs</a><a href="#pkg-robot_models">robot_models</a></div></li>
<li><span class="n">2</span><strong>Plan the motion</strong><p>Where the tool can reach and with which IK branch, which link pairs may touch, then one <code>JointTrajectory</code> out.</p><div class="pk-refs"><a href="#pkg-robot_reach">robot_reach</a><a href="#pkg-robot_collision">robot_collision</a><a href="#pkg-robot_trajectories">robot_trajectories</a></div></li>
<li><span class="n">3</span><strong>Run it</strong><p>Controllers tick a <code>JointState</code> into a <code>ServoCommand</code>; heat and burst limits on the motors; ports carry the types between processes.</p><div class="pk-refs"><a href="#pkg-robot_controllers">robot_controllers</a><a href="#pkg-robot_thermal">robot_thermal</a><a href="#pkg-like_keras">like_keras</a></div></li>
<li><span class="n">4</span><strong>Measure it</strong><p>Tracking and stop error over the same streams, checks with a verdict, activity and interventions across a fleet.</p><div class="pk-refs"><a href="#pkg-robot_metrics">robot_metrics</a><a href="#pkg-robot_diagnostics">robot_diagnostics</a><a href="#pkg-robot_activity">robot_activity</a><a href="#pkg-robot_autonomy">robot_autonomy</a></div></li>
<li class="out"><span class="n">→</span><strong>See it, then go real</strong><p>A stock viewer for every type, A/B trajectory comparison, and a calibrated twin that replays real runs.</p><div class="pk-refs"><a href="#pkg-robot_msg_viz">robot_msg_viz</a><a href="#pkg-traj_compare">traj_compare</a><a href="#pkg-sim2real">sim2real</a></div></li>
</ol>
</section>

<section id="packages">
<div class="section-head"><h2>The packages</h2>
<p>Bottom to top, the way they depend on each other: a package imports only from layers below it. Every card is the
package's own declaration (its <code>robot-sdk.toml</code>), and its picture is cut from its own recordings; hover one to play it.
<b>Landing page</b> opens the package's own site where it has one.</p></div>
@@GROUPS@@
</section>

<section id="layers">
<div class="section-head"><h2>How they fit together</h2>
<p>Packages above and below, the shared <code>robot_msgs</code> types in the band between them. An arrow into a type means
the package produces it; an arrow out of a type means it consumes it. Every arrow is a public function signature
(@@EDGES@@ citations, in the <a href="@@DOCS@@#/packages">docs</a>). Hover or tap a package or a type to trace it.</p></div>
<p class="phone-hint">Scroll the diagram sideways →</p>
<div class="figure-card">@@DIAGRAM@@</div>
<div class="legend"><span class="lb">the band: robot_msgs types, the shared vocabulary</span><span class="lp">produces (package → type)</span><span class="lc">consumes (type → package)</span><span class="ll">imports another package only through an optional extra (on hover)</span></div>
<ul class="layer-rules">@@LAYERS@@</ul>
</section>

<section id="example">
<div class="section-head"><h2>A pick-and-place, assembled</h2>
<p>One script and no new robotics code: each stage is a call into a package that hands the next one a <code>robot_msgs</code>
type. The arm is a simulated UR5e (MuJoCo); every number below is from a real run of the script, including the check that fails.</p></div>
<p class="phone-hint">Scroll the diagram sideways →</p>
<div class="figure-card">@@FLOW@@</div>
<div class="run-grid">
<div><div class="code"><span class="lang-tag">python</span><pre><code>@@CODE@@</code></pre></div>
<p class="code-foot">From <a href="@@REPO@@/blob/main/examples/pick_and_place.py"><code>examples/pick_and_place.py</code></a>, @@CODE_WHERE@@, as it runs; the rest passes the objects along and saves the plots.</p></div>
<div>@@STAGES@@<p class="code-foot">@@RUN_META@@</p></div>
</div>
@@PLOTS@@
<p class="footnote">The failing check is the point: the arm sags under gravity and this run has no gravity feed-forward, so the
shoulder misses its stop-error limit, and <code>robot_diagnostics</code>' stock check says so without anyone writing one.
The run is also in the docs, stage by stage: <a href="@@DOCS@@#/run">Run</a>.</p>
</section>

<section id="install">
<div class="section-head"><h2>Install</h2>
<p>Python 3.11 or newer. Take the whole set, or just the package you need.</p></div>
<div class="install-grid">
<div class="install-card"><strong>Everything</strong><p>Every package at versions tested together.</p><pre><code>pip install robot-sdk</code></pre></div>
<div class="install-card"><strong>One package</strong><p>Each is its own PyPI install, with only the dependencies below it.</p><pre><code>pip install robot-trajectories</code></pre></div>
<div class="install-card"><strong>For coding agents</strong><p>An agent skill that lists every package and what it is for, so an agent assembles instead of rewriting.</p><pre><code>git clone @@REPO@@
ln -s $PWD/robot_sdk/skill ~/.claude/skills/robot-sdk</code></pre></div>
</div>
</section>

<section class="promises" aria-label="What holds">
<div class="promise"><strong>Leaves never import each other</strong><p>When one needs another's behaviour it takes a function or a Protocol. Swap any package without touching its neighbours.</p><p class="how"><code>tools/check_layers.py</code> enforces it.</p></div>
<div class="promise"><strong>One vocabulary</strong><p>Never another <code>Pose</code> class: every package reads and writes the same <code>robot_msgs</code> types, so outputs plug into inputs.</p><p class="how"><a href="@@DOCS@@#/types">Every shared type</a>, with who takes and returns it.</p></div>
<div class="promise"><strong>Checked every hour</strong><p>Every hour each package's tests, its declaration, its types and its PyPI release are re-checked from its own repo; what fails is shown, not hidden.</p><p class="how"><a href="@@DOCS@@#/health">Health</a>, per package.</p></div>
</section>

<section class="cta">
@@LOGO@@
<p>Read the <a href="@@DOCS@@">docs</a>, browse the <a href="@@DOCS@@#/packages">package map</a> or the <a href="@@DOCS@@#/types">types</a>, see <a href="@@DOCS@@#/health">what is failing</a>, or start from <a href="@@REPO@@">the repo</a>.</p>
</section>
</main>
<footer>robot-sdk · MIT · <a href="@@REPO@@">github.com/zacharyyamaoka/robot_sdk</a> · package data from @@GENERATED@@ · look after <a href="https://pidtuna.com">pidtuna.com</a></footer>
<script>
(function () {
  var root = document.documentElement;
  function dark() { return root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function paint() { document.body.classList.toggle('is-dark', dark()); }
  paint();
  document.querySelector('.theme').addEventListener('click', function () {
    root.dataset.theme = dark() ? 'light' : 'dark';
    try { localStorage.setItem('rsdk-theme', root.dataset.theme); } catch (e) {}
    paint();
  });
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      try { navigator.clipboard.writeText(button.dataset.copy).then(function () { button.textContent = 'Copied'; }); } catch (e) {}
    });
  });
  // hero: honour reduced motion; a button to pause
  var video = document.getElementById('hero-video'), toggle = document.querySelector('.hero-toggle');
  if (video) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { video.removeAttribute('autoplay'); video.pause(); }
    function label() { toggle.textContent = video.paused ? '▶' : '❚❚'; toggle.setAttribute('aria-label', video.paused ? 'Play the video' : 'Pause the video'); }
    toggle.addEventListener('click', function () { if (video.paused) { video.play().catch(function () {}); } else { video.pause(); } });
    video.addEventListener('play', label); video.addEventListener('pause', label); label();
  }
  // cards: play the package's own clip while hovered or focused
  document.querySelectorAll('.pk').forEach(function (card) {
    var media = card.querySelector('.pk-media.has-clip'), clip = media && media.querySelector('video');
    if (!clip) return;
    function on() { var p = clip.play(); if (p && p.then) p.then(function () { media.classList.add('playing'); }).catch(function () {}); }
    function off() { clip.pause(); media.classList.remove('playing'); }
    card.addEventListener('mouseenter', on); card.addEventListener('mouseleave', off);
    card.addEventListener('focusin', on); card.addEventListener('focusout', off);
  });
  // health: read at view time from the data the hourly refresh publishes (calm unless something fails)
  fetch('data/health.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (h) {
    if (!h || !h.summary) return;
    var s = h.summary, el = document.getElementById('health'), parts = [];
    if (s.pass) parts.push('<span class="dot" style="background:var(--pt-ok)"></span>' + s.pass + ' passing');
    if (s.warn) parts.push('<span class="dot" style="background:var(--pt-accent)"></span>' + s.warn + ' with warnings');
    if (s.fail) parts.push('<span class="dot" style="background:var(--pt-warn)"></span>' + s.fail + ' failing');
    el.innerHTML = 'Health right now:' + parts.join('') + ' · <a href="@@DOCS@@#/health">see why →</a>';
  }).catch(function () {});
  // the layer diagram: trace a package or a type
  var svg = document.querySelector('svg.domain');
  if (!svg) return;
  var edges = Array.prototype.slice.call(svg.querySelectorAll('.edge'));
  function clear() { svg.classList.remove('focus'); svg.querySelectorAll('.on').forEach(function (n) { n.classList.remove('on'); }); }
  function focusRepo(repo) {
    clear(); svg.classList.add('focus');
    svg.querySelector('.pkg[data-repo="' + repo + '"]').classList.add('on');
    edges.forEach(function (edge) {
      if (edge.dataset.repo === repo || edge.dataset.repo2 === repo) {
        edge.classList.add('on');
        if (edge.dataset.type) svg.querySelector('.type[data-type="' + edge.dataset.type + '"]').classList.add('on');
        var other = edge.dataset.repo === repo ? edge.dataset.repo2 : edge.dataset.repo;
        if (other) svg.querySelector('.pkg[data-repo="' + other + '"]').classList.add('on');
      }
    });
  }
  function focusType(name) {
    clear(); svg.classList.add('focus');
    svg.querySelector('.type[data-type="' + name + '"]').classList.add('on');
    edges.forEach(function (edge) {
      if (edge.dataset.type === name) { edge.classList.add('on'); svg.querySelector('.pkg[data-repo="' + edge.dataset.repo + '"]').classList.add('on'); }
    });
  }
  svg.querySelectorAll('.pkg').forEach(function (node) {
    ['mouseenter', 'focus', 'click'].forEach(function (ev) { node.addEventListener(ev, function () { focusRepo(node.dataset.repo); }); });
  });
  svg.querySelectorAll('.type').forEach(function (node) {
    ['mouseenter', 'focus', 'click'].forEach(function (ev) { node.addEventListener(ev, function () { focusType(node.dataset.type); }); });
  });
  svg.addEventListener('mouseleave', clear);
})();
</script>
</body></html>
"""


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else SITE / "_build" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build())
    print(out)


if __name__ == "__main__":
    main()
