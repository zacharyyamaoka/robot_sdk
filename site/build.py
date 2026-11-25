"""Build the robot-sdk landing page: site/_build/index.html (+ media/), from site/data/*.json and site/media/.

    python3 /home/bam/robot_sdk/site/build.py

WHY data files, not prose: the domain diagram draws only edges in site/data/domain.json, where every edge cites the
public signature (file:line) that makes it true (Zach's "do not invent undefined relationships"). The pick-and-place
section draws only what examples/pick_and_place.py printed and saved when it ran (site/data/pick_and_place.json).
"""

from __future__ import annotations

import html
import json
import re
import shutil
from pathlib import Path

SITE = Path(__file__).resolve().parent
ROOT = SITE.parent
BUILD = SITE / "_build"
REPO_URL = "https://github.com/zacharyyamaoka"

# Display labels, bottom to top. WHY no per-package facts here (Zach, 2026-11-24: "robot-sdk doesn't need to maintain
# that information itself"): the cards read each package's PyPI name, layer, blurb and links from site/data/graph.json,
# which tools/sdk_graph builds from every repo's own robot-sdk.toml.
LAYER_LABEL = {"vocabulary": "vocabulary", "models": "models", "leaf": "leaf", "comms": "comms", "viewers": "viewers",
               "outer": "outer API", "checks": "checks"}
LINK_LABEL = {"site": "site", "docs": "docs", "pypi": "PyPI"}
# Language chips (2026-11-25): graph.json's packages[].languages, read from each repo's files by tools/sdk_graph/languages.py.
LANG_SHORT = {"python": "Py", "cpp": "C++", "rust": "Rust"}
LANG_NAME = {"python": "Python", "cpp": "C++", "rust": "Rust"}

# Diagram layout: the robot_msgs types are a band in the middle; packages sit above (leaves) and below (the rest),
# ordered so their arrows cross as little as possible. Library-to-library imports that exist only as optional extras or
# runtime imports are drawn dashed, from domain.json's own notes.
# Order found by exhaustive search over type orders (packages by barycentre): zero crossings for the typed arrows.
TYPE_ORDER = ["NamedPose", "JointLimits", "JointTrajectory", "ServoCommand", "JointState", "JointCommandSequence", "DiagnosticRecord"]
TOP = ["robot_reach", "robot_trajectories", "robot_metrics", "robot_controllers", "robot_activity", "robot_autonomy", "robot_thermal"]
BOTTOM = ["sim2real", "robot_models", "like_keras", "robot_diagnostics"]
LIBRARY_EDGES = [  # (from, to, label) — optional or runtime imports between packages, each stated in domain.json
    ("robot_diagnostics", "robot_metrics", "stock extra"),
    ("robot_diagnostics", "sim2real", "stock extra"),
    ("sim2real", "robot_trajectories", "trajectories extra"),
]

W, H = 1160, 640
TOP_Y, BAND_Y, BOTTOM_Y = 40, 270, 520
BOX_W, BOX_H = 152, 58
TYPE_W, TYPE_H = 156, 40


def esc(text: object) -> str:
    return html.escape(str(text), quote=True)


def language_chips(package: dict) -> str:
    """Py · C++ · partial · Rust (planned), the evidence as the tooltip; nothing for a graph without `languages`."""
    chips = []
    for lang in package.get("languages") or []:
        text = LANG_SHORT.get(lang["id"], lang["id"])
        text += " · partial" if lang["status"] == "partial" else " (planned)" if lang["status"] == "planned" else ""
        state = "" if lang["status"] == "full" else f", {lang['status']}"
        title = f"{LANG_NAME.get(lang['id'], lang['id'])}{state}: {lang['evidence']} (in {lang['where']})"
        chips.append(f'<span class="lang lang-{esc(lang["status"])}" title="{esc(title)}">{esc(text)}</span>')
    return f'<span class="langs">{"".join(chips)}</span>' if chips else ""


def spread(count: int, left: float, right: float) -> list[float]:
    if count == 1:
        return [(left + right) / 2]
    step = (right - left) / (count - 1)
    return [left + i * step for i in range(count)]


def line_anchor(evidence: str) -> str:
    """'src/x.py:31-33' -> 'src/x.py#L31-L33' (GitHub's line anchors)."""
    path, _, lines = evidence.partition(":")
    if not lines:
        return path
    first, _, last = lines.partition("-")
    return f"{path}#L{first}" + (f"-L{last}" if last else "")


def domain_svg(domain: dict) -> tuple[str, list[dict]]:
    packages = {p["repo"]: p for p in domain["packages"]}
    types = {t["name"]: t for t in domain["types"]}
    type_x = dict(zip(TYPE_ORDER, spread(len(TYPE_ORDER), 95, W - 95)))
    top_x = dict(zip(TOP, spread(len(TOP), 85, W - 85)))
    # bottom row placed under the types each package uses (sim2real: NamedPose/JointTrajectory; robot_models: the
    # servo types); like_keras and robot_diagnostics take the free slots so no arrow passes behind a box
    bottom_x = {"sim2real": 290.0, "robot_diagnostics": 545.0, "robot_models": 800.0, "like_keras": 1060.0}
    package_pos = {**{r: (x, TOP_Y) for r, x in top_x.items()}, **{r: (x, BOTTOM_Y) for r, x in bottom_x.items()}}

    edges: list[dict] = []
    for repo, (px, py) in package_pos.items():
        info = packages[repo]
        for direction in ("consumes", "produces"):
            for item in info[direction]:
                name = item["type"]
                if name not in type_x:
                    continue
                edges.append({"repo": repo, "type": name, "direction": direction, "via": item["via"], "evidence": item["evidence"]})
    # one edge per (repo, type, direction) for drawing; keep every citation for the evidence list
    drawn: dict[tuple, dict] = {}
    for edge in edges:
        drawn.setdefault((edge["repo"], edge["type"], edge["direction"]), edge)

    parts: list[str] = [f'<svg viewBox="0 0 {W} {H}" class="domain" role="img" aria-labelledby="domain-title domain-desc">',
                        '<title id="domain-title">How the robot-sdk packages relate</title>',
                        '<desc id="domain-desc">Packages above and below a band of robot_msgs types. An arrow from a package into a '
                        'type means the package produces it; an arrow from a type into a package means the package consumes it.</desc>',
                        '<defs>'
                        '<marker id="arrow-produce" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-produce"/></marker>'
                        '<marker id="arrow-consume" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-consume"/></marker>'
                        '</defs>']
    # the band
    parts.append(f'<rect x="20" y="{BAND_Y - 46}" width="{W - 40}" height="{TYPE_H + 92}" rx="16" class="band"/>')

    # per package: how many edges leave its top/bottom edge, to fan the anchor points
    anchor_count: dict[str, int] = {}
    for (repo, _, _) in drawn:
        anchor_count[repo] = anchor_count.get(repo, 0) + 1
    anchor_used: dict[str, int] = {}
    type_count: dict[tuple[str, str], int] = {}
    for (repo, name, _) in drawn:
        side = "top" if package_pos[repo][1] == TOP_Y else "bottom"
        type_count[(name, side)] = type_count.get((name, side), 0) + 1
    type_used: dict[tuple[str, str], int] = {}

    edge_svg: list[str] = []
    for (repo, name, direction), edge in sorted(drawn.items(), key=lambda kv: (package_pos[kv[0][0]][0], type_x[kv[0][1]])):
        px, py = package_pos[repo]
        above = py == TOP_Y
        n = anchor_count[repo]
        i = anchor_used.get(repo, 0)
        anchor_used[repo] = i + 1
        ax = px + (spread(n, -BOX_W / 2 + 22, BOX_W / 2 - 22)[i] if n > 1 else 0)
        ay = py + BOX_H if above else py
        side = "top" if above else "bottom"
        tn = type_count[(name, side)]
        ti = type_used.get((name, side), 0)
        type_used[(name, side)] = ti + 1
        tx = type_x[name] + (spread(tn, -TYPE_W / 2 + 18, TYPE_W / 2 - 18)[ti] if tn > 1 else 0)
        ty = BAND_Y if above else BAND_Y + TYPE_H
        mid = (ay + ty) / 2
        path = f"M{ax:.1f},{ay:.1f} C{ax:.1f},{mid:.1f} {tx:.1f},{mid:.1f} {tx:.1f},{ty:.1f}"
        if direction == "consumes":  # type -> package
            path = f"M{tx:.1f},{ty:.1f} C{tx:.1f},{mid:.1f} {ax:.1f},{mid:.1f} {ax:.1f},{ay:.1f}"
        marker = "arrow-produce" if direction == "produces" else "arrow-consume"
        title = f"{repo} {'produces' if direction == 'produces' else 'consumes'} {name} — {edge['via']} ({edge['evidence']})"
        edge_svg.append(f'<path d="{path}" class="edge {direction}" data-repo="{esc(repo)}" data-type="{esc(name)}" '
                        f'marker-end="url(#{marker})"><title>{esc(title)}</title></path>')

    # library edges (dashed)
    for source, target, label in LIBRARY_EDGES:
        sx, sy = package_pos[source]
        tx, ty = package_pos[target]
        if ty == TOP_Y:  # bottom package to a top package: route around the band's right/left edge
            start = (sx + BOX_W / 2, sy + BOX_H / 2)
            end = (tx + BOX_W / 2 - 6, ty + BOX_H)
            path = f"M{start[0]:.1f},{start[1]:.1f} C{start[0] + 120:.1f},{start[1] - 150:.1f} {end[0] + 60:.1f},{end[1] + 160:.1f} {end[0]:.1f},{end[1]:.1f}"
        else:
            start = (sx - BOX_W / 2, sy + BOX_H / 2)
            end = (tx + BOX_W / 2, ty + BOX_H / 2)
            path = f"M{start[0]:.1f},{start[1]:.1f} C{start[0] - 40:.1f},{start[1] + 60:.1f} {end[0] + 40:.1f},{end[1] + 60:.1f} {end[0]:.1f},{end[1]:.1f}"
        edge_svg.append(f'<path d="{path}" class="edge library" data-repo="{esc(source)}" data-repo2="{esc(target)}" '
                        f'marker-end="url(#arrow-consume)"><title>{esc(source)} imports {esc(target)} only through its {esc(label)}</title></path>')
    parts.append('<g class="edges">' + "".join(edge_svg) + "</g>")

    # like_keras carries any robot_msgs type: a bracket onto the whole band
    lx, ly = package_pos["like_keras"]
    parts.append(f'<path d="M{lx:.1f},{ly:.1f} L{lx:.1f},{BAND_Y + TYPE_H + 46:.1f}" class="edge carries" data-repo="like_keras" '
                 f'marker-end="url(#arrow-consume)"><title>like_keras ports carry any robot_msgs type between processes and languages</title></path>')
    parts.append(f'<text x="{lx - 10:.1f}" y="{BAND_Y + TYPE_H + 110:.1f}" text-anchor="end" class="edge-note">carries any of these types</text>'
                 f'<text x="{lx - 10:.1f}" y="{BAND_Y + TYPE_H + 126:.1f}" text-anchor="end" class="edge-note">between processes and languages</text>')

    # types
    for name, x in type_x.items():
        info = types[name]
        parts.append(f'<g class="type" data-type="{esc(name)}" tabindex="0"><title>{esc(name)} ({esc(info["module"])}): {esc(info["what"])}</title>'
                     f'<rect x="{x - TYPE_W / 2:.1f}" y="{BAND_Y}" width="{TYPE_W}" height="{TYPE_H}" rx="9"/>'
                     f'<text x="{x:.1f}" y="{BAND_Y + 25}" text-anchor="middle">{esc(name)}</text></g>')
    # packages
    for repo, (x, y) in package_pos.items():
        info = packages[repo]
        own = not info["consumes"] and not info["produces"]
        layer = LAYER_LABEL[info["layer"]]
        parts.append(f'<g class="pkg layer-{esc(info["layer"])}{" own" if own else ""}" data-repo="{esc(repo)}" tabindex="0">'
                     f'<title>{esc(repo)}: {esc(info["one_line"])}</title>'
                     f'<rect x="{x - BOX_W / 2:.1f}" y="{y}" width="{BOX_W}" height="{BOX_H}" rx="11"/>'
                     f'<text x="{x:.1f}" y="{y + 25}" text-anchor="middle" class="pkg-name">{esc(repo)}</text>'
                     f'<text x="{x:.1f}" y="{y + 44}" text-anchor="middle" class="pkg-layer">{esc(layer)}{" · own types" if own else ""}</text></g>')
    parts.append("</svg>")
    return "".join(parts), sorted(edges, key=lambda e: (e["repo"], e["direction"], e["type"]))


PLOT_CAPTIONS = {  # what each recorded plot shows; the plots themselves come from the run
    "pick_and_place_tool_path.png": ("Tool path: measured (coloured by time) vs planned (dashed), pick and place marked",
                                     "robot_msgs' stock PoseTrajectory.plot() of the measured tool pose, the plan drawn on top."),
    "pick_and_place_joints.png": ("Joint positions: target vs measured, every joint",
                                  "The joint_trajectory_controller's target (grey) against the simulated arm (blue)."),
    "pick_and_place_tracking_error.png": ("Tracking error per joint, with the stop-error limit",
                                          "Shaded: the stops robot_diagnostics scored. shoulder_lift sits outside the limit: the arm sags under gravity, and this run has no gravity feed-forward — the check catches exactly that."),
}


def pipeline_svg(pipeline: dict) -> str:
    """The pick-and-place as a flow: each box a package, each arrow the robot_msgs type (or object) handed over.

    Every arrow matches a call the example makes (site/data/pick_and_place.json's stages); the FK/IK arrow is labelled
    as the example's adapter because no package offers that seam yet."""
    results = {stage["package"]: stage.get("one_line_result", "") for stage in pipeline["stages"]}
    verdict = results.get("robot_diagnostics", "")
    fail = verdict.startswith("FAIL")
    nodes = {  # name: (x centre, y top, label, sub)
        "robot_reach": (100, 70, "robot_reach", "UR5e arm · reach check"),
        "robot_trajectories": (400, 70, "robot_trajectories", "pick_and_place()"),
        "robot_controllers": (700, 70, "robot_controllers", "trajectory controller"),
        "plant": (700, 250, "simulated UR5e", "MuJoCo, 500 Hz loop"),
        "robot_metrics": (1010, 70, "robot_metrics", "tracking + stop error"),
        "robot_diagnostics": (1010, 250, "robot_diagnostics", "stock.stop_error"),
    }
    width, height = 172, 56
    out = ['<svg viewBox="0 0 1120 380" class="flow" role="img" aria-label="The pick-and-place pipeline: packages joined by the types they hand over">',
           '<defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
           '<path d="M0,0 L10,5 L0,10 z" class="mk-flow"/></marker></defs>']

    def arrow(path: str, label: str, lx: float, ly: float, anchor: str = "middle") -> None:
        out.append(f'<path d="{path}" class="flow-edge" marker-end="url(#flow-arrow)"/>')
        out.append(f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" class="flow-label">{esc(label)}</text>')

    w2, h = width / 2, height
    mid = 70 + h / 2
    arrow(f"M{100 + w2},{mid} L{400 - w2},{mid}", "Arm FK / IK", 250, mid - 10)
    arrow(f"M{400 + w2},{mid} L{700 - w2},{mid}", "JointTrajectory", 550, mid - 10)
    arrow(f"M{675},{70 + h} L{675},250", "ServoCommand", 665, 185, "end")
    arrow(f"M{725},250 L{725},{70 + h}", "JointState", 735, 185, "start")
    arrow(f"M{400},70 C{400},20 {1010},20 {1010},70", "target JointTrajectory", 705, 36)
    arrow(f"M{700 + w2},{250 + 14} C{880},{250 + 14} {960},200 {985},{70 + h}", "measured JointTrajectory", 880, 205)
    arrow(f"M{700 + w2},{250 + 42} L{1010 - w2},{250 + 42}", "per joint", 855, 250 + 34)
    for key, (x, y, label, sub) in nodes.items():
        kind = "plant" if key == "plant" else ("verdict-fail" if key == "robot_diagnostics" and fail else "pkg")
        out.append(f'<g class="flow-node {kind}"><rect x="{x - w2}" y="{y}" width="{width}" height="{height}" rx="12"/>'
                   f'<text x="{x}" y="{y + 24}" text-anchor="middle" class="flow-name">{esc(label)}</text>'
                   f'<text x="{x}" y="{y + 43}" text-anchor="middle" class="flow-sub">{esc(sub)}</text></g>')
    found = re.search(r"(PASS|FAIL|WARN)\S*.*?(\w+) p90 ([\d.]+) deg vs limit ([\d.]+) deg", verdict)
    if found:
        word, joint, value, limit = found.groups()
        out.append(f'<text x="1010" y="{250 + h + 22}" text-anchor="middle" class="flow-result{" fail" if fail else ""}">{esc(word)}: {esc(joint)}</text>')
        out.append(f'<text x="1010" y="{250 + h + 40}" text-anchor="middle" class="flow-result{" fail" if fail else ""}">{esc(value)}° vs limit {esc(limit)}°</text>')
    out.append("</svg>")
    return "".join(out)


def pipeline_html(pipeline: dict | None) -> str:
    if not pipeline:
        return '<p class="muted">The pick-and-place run has not been recorded yet.</p>'
    stages = pipeline["stages"]
    cards = []
    for number, stage in enumerate(stages, 1):
        result = stage.get("one_line_result", "")
        verdict = " fail" if result.startswith("FAIL") else (" pass" if result.startswith("PASS") else "")
        cards.append(
            f'<li class="stage{verdict}"><div class="stage-n">{number}</div>'
            f'<div class="stage-pkg"><a href="{REPO_URL}/{esc(stage["package"])}">{esc(stage["package"])}</a></div>'
            f'<code class="stage-call">{esc(stage["call"])}</code>'
            f'<div class="stage-io"><span>{esc(stage.get("input_type", ""))}</span> → <span>{esc(stage.get("output_type", ""))}</span></div>'
            f'<div class="stage-result">{esc(stage.get("one_line_result", ""))}</div></li>')
    skipped = "".join(f'<li><code>{esc(item["package"])}</code>: {esc(item["why"])}</li>' for item in pipeline.get("skipped", []))
    run = pipeline.get("run", {})
    versions = ", ".join(f'{esc(name)} {esc(sha)}' for name, sha in run.get("git", {}).items())
    return ('<div class="figure-card">' + pipeline_svg(pipeline) + '</div>'
            + '<p class="muted" style="font-size:14px;margin-top:8px">Each box is one package; each arrow is the object it hands the next. The controller and the simulated arm run in a 500 Hz loop. The <i>Arm FK / IK</i> arrow goes through a 20-line adapter in the example: no package offers that seam yet.</p>'
            + '<h3>Stage by stage, from the run</h3><ol class="pipeline">' + "".join(cards) + "</ol>"
            + (f'<details><summary>Not in this run, and why</summary><ul class="muted">{skipped}</ul></details>' if skipped else "")
            + f'<p class="muted run-meta">Plant: {esc(pipeline.get("plant", ""))}. Ran {esc(run.get("date", "")[:16].replace("T", " "))}, '
              f'{esc(run.get("runtime_s", ""))} s; package versions: {versions}.</p>')


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>robot-sdk</title>
<meta name="description" content="A generic robotics backend in plain Python: small packages that join on one vocabulary, so a new robot task is mostly assembly.">
<style>
:root { --bg:#fbfaf7; --ink:#1f2328; --muted:#5f6670; --line:#e3dfd6; --card:#ffffff; --accent:#2f7d55; --accent-soft:#e8f2ec;
  --consume:#3567b5; --consume-soft:#e7eef9; --band:#f3f1ec; --code:#f3f1ec; --warn:#9a5b00; --dim:.16; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#16181b; --ink:#e6e8eb; --muted:#a3a9b2; --line:#33373d;
  --card:#1d2024; --accent:#7cc39b; --accent-soft:#1f3329; --consume:#8db4f0; --consume-soft:#1d2a3d; --band:#1f2226; --code:#24272c; --warn:#f0b35a; --dim:.22; } }
:root[data-theme="dark"] { --bg:#16181b; --ink:#e6e8eb; --muted:#a3a9b2; --line:#33373d; --card:#1d2024; --accent:#7cc39b;
  --accent-soft:#1f3329; --consume:#8db4f0; --consume-soft:#1d2a3d; --band:#1f2226; --code:#24272c; --warn:#f0b35a; --dim:.22; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
main { max-width:1200px; margin:0 auto; padding:40px 16px 64px; }
a { color:var(--accent); }
code, pre { font:13.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
code { background:var(--code); padding:1px 5px; border-radius:5px; }
.eyebrow { color:var(--muted); font-size:13px; letter-spacing:.03em; margin:0 0 6px; }
h1 { font-size:44px; line-height:1.1; margin:0 0 10px; letter-spacing:-.02em; }
h2 { font-size:26px; margin:56px 0 8px; letter-spacing:-.01em; }
h3 { font-size:17px; margin:24px 0 6px; }
.lede { font-size:19px; max-width:820px; margin:0 0 18px; }
.muted { color:var(--muted); }
.install { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:0 0 8px; }
.install pre { margin:0; background:var(--code); padding:9px 14px; border-radius:9px; }
.install button, .chip { font:inherit; font-size:13.5px; border:1px solid var(--line); background:var(--card); color:var(--ink);
  border-radius:8px; padding:7px 12px; cursor:pointer; text-decoration:none; }
figure { margin:28px 0 0; }
.figure-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:12px; overflow-x:auto; }
.domain { width:100%; min-width:860px; height:auto; display:block; }
figcaption { color:var(--muted); font-size:14px; margin-top:10px; max-width:900px; }
.legend { display:flex; flex-wrap:wrap; gap:18px; font-size:14px; margin:10px 0 0; color:var(--muted); }
.legend span::before { content:""; display:inline-block; width:22px; height:0; border-top:2.5px solid; vertical-align:middle; margin-right:6px; }
.legend .lb::before { width:16px; height:12px; border:1px solid var(--line); background:var(--band); border-radius:3px; }
.legend .lp::before { border-color:var(--accent); } .legend .lc::before { border-color:var(--consume); }
.legend .ll::before { border-color:var(--muted); border-top-style:dashed; }
/* diagram */
.band { fill:var(--band); stroke:var(--line); }
.band-label { fill:var(--muted); font-size:13px; paint-order:stroke; stroke:var(--band); stroke-width:5px; }
.type rect { fill:var(--card); stroke:var(--ink); stroke-width:1.2; }
.type text { fill:var(--ink); font:600 12.5px ui-monospace,Menlo,monospace; }
.pkg rect { fill:var(--card); stroke:var(--line); stroke-width:1.5; }
.pkg.layer-outer rect, .pkg.layer-checks rect { stroke:var(--accent); }
.pkg.own rect { stroke-dasharray:4 3; }
.pkg-name { fill:var(--ink); font:600 13.5px ui-monospace,Menlo,monospace; }
.pkg-layer { fill:var(--muted); font-size:12px; }
.pkg, .type { cursor:pointer; outline:none; }
.edge { fill:none; stroke-width:2; opacity:.85; transition:opacity .15s; }
.edge.produces { stroke:var(--accent); } .edge.consumes { stroke:var(--consume); }
.edge.library { stroke:var(--muted); stroke-dasharray:6 5; stroke-width:1.6; opacity:0; }
.domain.focus .edge.library.on { opacity:1; }
.domain.focus .edge.library:not(.on) { opacity:0; }
.edge.carries { stroke:var(--muted); stroke-width:1.6; stroke-dasharray:2 4; }
.mk-produce { fill:var(--accent); } .mk-consume { fill:var(--consume); }
.edge-note { fill:var(--muted); font-size:12px; }
.domain.focus .edge, .domain.focus .pkg, .domain.focus .type { opacity:var(--dim); }
.domain.focus .on { opacity:1 !important; }
.domain.focus .edge.on { stroke-width:3; }
/* evidence */
details { margin-top:14px; }
summary { cursor:pointer; color:var(--muted); font-size:14px; }
table { border-collapse:collapse; width:100%; font-size:13.5px; margin-top:8px; }
td, th { border-bottom:1px solid var(--line); padding:5px 8px; text-align:left; vertical-align:top; }
th { color:var(--muted); font-weight:600; }
.table-wrap { overflow-x:auto; }
/* pipeline */
.pipeline { list-style:none; padding:0; margin:12px 0 0; display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:12px; }
.flow { width:100%; min-width:860px; height:auto; display:block; }
.flow-node rect { fill:var(--card); stroke:var(--line); stroke-width:1.5; }
.flow-node.plant rect { fill:var(--band); stroke-dasharray:5 4; stroke:var(--muted); }
.flow-node.verdict-fail rect { stroke:var(--warn); stroke-width:2; }
.flow-name { fill:var(--ink); font:600 14px ui-monospace,Menlo,monospace; }
.flow-sub { fill:var(--muted); font-size:12.5px; }
.flow-edge { fill:none; stroke:var(--accent); stroke-width:2; } .mk-flow { fill:var(--accent); }
.flow-label { fill:var(--ink); font:12.5px ui-monospace,Menlo,monospace; paint-order:stroke; stroke:var(--card); stroke-width:5px; }
.flow-result { fill:var(--muted); font-size:12.5px; } .flow-result.fail { fill:var(--warn); font-weight:600; }
.stage { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 14px 12px; position:relative; }
.stage.fail { border-color:var(--warn); } .stage.fail .stage-result { color:var(--warn); font-weight:600; }
.run-meta { font-size:13px; margin-top:10px; }
.stage-n { position:absolute; top:12px; right:14px; color:var(--muted); font-size:13px; }
.stage-pkg a { font:600 14px ui-monospace,Menlo,monospace; text-decoration:none; }
.stage-call { display:block; margin:6px 0; background:none; padding:0; font-size:12.5px; color:var(--muted); word-break:break-word; }
.stage-io { font-size:13px; } .stage-io span { font-family:ui-monospace,Menlo,monospace; }
.stage-result { font-size:13.5px; margin-top:8px; }
.plots { display:grid; grid-template-columns:1fr; gap:22px; margin-top:22px; }
.plots figure { margin:0; } .plots img { width:100%; height:auto; border:1px solid var(--line); border-radius:12px; background:#fff; display:block; }
pre.code { background:var(--code); padding:14px 16px; border-radius:12px; overflow-x:auto; }
/* packages */
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:12px; margin-top:16px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; }
.card h3 { margin:0 0 4px; font:600 15px ui-monospace,Menlo,monospace; } .card h3 a { text-decoration:none; }
.card p { margin:4px 0 8px; font-size:14.5px; }
.card .meta { color:var(--muted); font-size:13px; }
.langs { display:flex; flex-wrap:wrap; gap:4px; margin:0 0 6px; }
.lang { font-size:11.5px; line-height:1.6; padding:0 8px; border-radius:99px; border:1px solid transparent; background:var(--band); color:var(--ink); white-space:nowrap; }
.lang-partial, .lang-planned { background:transparent; border:1px dashed var(--line); color:var(--muted); }
.layers { margin-top:12px; }
footer { margin-top:64px; color:var(--muted); font-size:14px; border-top:1px solid var(--line); padding-top:16px; }
.phone-hint { display:none; font-size:13px; margin:0 0 6px; }
@media (max-width:640px) { .phone-hint { display:block; } h1 { font-size:34px; } .lede { font-size:17px; } h2 { font-size:22px; } }
</style>
</head>
<body>
<main>
<p class="eyebrow">Open source · MIT · Python ≥ 3.11</p>
<h1>robot-sdk</h1>
<p class="lede">A generic robotics backend in plain Python. Twelve small packages that all speak one vocabulary, so a new robot task is mostly <b>assembly</b>: plug in the parts you already have instead of writing them again.</p>
<div class="install"><pre>pip install robot-sdk</pre><button type="button" data-copy="pip install robot-sdk">Copy</button>
<a class="chip" href="__REPO__/robot_sdk">GitHub</a><a class="chip" href="#pick-and-place">Pick-and-place example</a></div>
<p class="muted" style="font-size:14px">Each package is also its own install (<code>pip install robot-trajectories</code>, …); <code>robot-sdk</code> pins a set of versions that work together, the way a ROS release does.</p>

<figure id="domain">
<p class="phone-hint muted">Scroll the diagram sideways →</p><div class="figure-card">__DIAGRAM__</div>
<div class="legend"><span class="lb">middle band: robot_msgs types, the shared vocabulary</span><span class="lp">produces (package → type)</span><span class="lc">consumes (type → package)</span><span class="ll">imports another package only via an optional extra (shown on hover)</span></div>
<figcaption><b>How the packages fit together.</b> They don't import each other: they agree on the <code>robot_msgs</code> types in the middle. A trajectory generator hands a <code>JointTrajectory</code> to a controller, which turns <code>JointState</code> into a <code>ServoCommand</code>; metrics and twins read the same <code>JointTrajectory</code>. Hover or tap a package or a type to trace it. Every arrow is a public function signature — the list below cites each one. Dashed boxes keep their own types (no robot_msgs in their public API yet).</figcaption>
<details><summary>Every arrow, with its source (__EDGE_COUNT__ citations)</summary>
<div class="table-wrap"><table><tr><th>Package</th><th></th><th>Type</th><th>Through</th><th>Where</th></tr>__EVIDENCE__</table></div></details>
</figure>

<h2 id="pick-and-place">A pick-and-place, assembled</h2>
<p class="lede" style="font-size:17px">One script, no new robotics code: each stage is a call into a package, and each hands the next a <code>robot_msgs</code> type. __PIPELINE_INTRO__</p>
__PIPELINE__
__PLOTS__
__CODE__

<h2 id="packages">The packages</h2>
<p class="muted">Bottom to top: <b>vocabulary</b> → <b>models</b> → <b>leaves</b> (each one job, never importing a sibling) → <b>outer API</b> and <b>checks</b>. A package imports only from layers below it; a check in <code>robot_sdk</code> enforces it.</p>
<div class="grid">__CARDS__</div>

<h2 id="agents">Built for coding agents too</h2>
<p>The repo ships an agent skill, <a href="__REPO__/robot_sdk/blob/main/skill/SKILL.md"><code>skill/SKILL.md</code></a>: one row per package saying what it is for, so an agent asked for "UR5e test trajectories, scored for tracking" reaches for <code>JointSpace.from_description</code>, a <code>WaypointTrajectoryGenerator</code>, the trajectory controller and <code>robot_metrics</code> — instead of writing them again. Link the folder into your agent's skills directory as <code>robot-sdk</code>.</p>

<footer>robot-sdk · MIT · <a href="__REPO__/robot_sdk">github.com/zacharyyamaoka/robot_sdk</a> · built __BUILT__ from robot_sdk __SHA__</footer>
</main>
<script>
(function () {
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      try { navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copied'; } catch (error) { /* no clipboard */ }
    });
  });
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
    node.addEventListener('mouseenter', function () { focusRepo(node.dataset.repo); });
    node.addEventListener('focus', function () { focusRepo(node.dataset.repo); });
    node.addEventListener('click', function () { focusRepo(node.dataset.repo); });
  });
  svg.querySelectorAll('.type').forEach(function (node) {
    node.addEventListener('mouseenter', function () { focusType(node.dataset.type); });
    node.addEventListener('focus', function () { focusType(node.dataset.type); });
    node.addEventListener('click', function () { focusType(node.dataset.type); });
  });
  svg.addEventListener('mouseleave', clear);
})();
</script>
</body>
</html>
"""


def main() -> None:
    import datetime
    import subprocess

    domain = json.loads((SITE / "data" / "domain.json").read_text())  # the hand-laid diagram's edges (see main's note)
    graph = json.loads((SITE / "data" / "graph.json").read_text())
    pipeline_path = SITE / "data" / "pick_and_place.json"
    pipeline = json.loads(pipeline_path.read_text()) if pipeline_path.exists() else None
    diagram, edges = domain_svg(domain)

    evidence = "".join(
        f'<tr><td><code>{esc(e["repo"])}</code></td><td>{"produces" if e["direction"] == "produces" else "consumes"}</td>'
        f'<td><code>{esc(e["type"])}</code></td><td>{esc(e["via"])}</td>'
        f'<td><a href="{REPO_URL}/{esc(e["repo"])}/blob/main/{esc(line_anchor(e["evidence"]))}">{esc(e["evidence"])}</a></td></tr>'
        for e in edges)

    def card_links(links: dict) -> str:
        found = [f'<a href="{esc(links[k])}">{esc(label)}</a>' for k, label in LINK_LABEL.items() if k in links]
        return f' · {" · ".join(found)}' if found else ""

    cards = "".join(
        f'<div class="card"><h3><a href="{esc(p["links"]["github"])}">{esc(p["id"])}</a></h3>'
        f'<p>{esc(p["one_line"])}</p>{language_chips(p)}<div class="meta">{esc(LAYER_LABEL[p["layer"]])} · <code>pip install {esc(p["pypi"])}</code>'
        f'{card_links(p["links"])}</div></div>'
        for p in sorted(graph["packages"], key=lambda p: list(LAYER_LABEL).index(p["layer"])))

    BUILD.mkdir(exist_ok=True)
    media_out = BUILD / "media"
    if (SITE / "media").is_dir():
        shutil.copytree(SITE / "media", media_out, dirs_exist_ok=True)

    plots = ""
    code = ""
    intro = ""
    if pipeline:
        intro = "The arm is a simulated UR5e (MuJoCo); every number below is from a real run of the script."
        figures = []
        for relative in pipeline.get("media", []):
            name = Path(relative).name
            if (SITE / "media" / name).exists():
                title, caption = PLOT_CAPTIONS.get(name, (name, ""))
                figures.append(f'<figure><img src="media/{esc(name)}" alt="{esc(title)}" loading="lazy"><figcaption><b>{esc(title)}.</b> {esc(caption)}</figcaption></figure>')
        plots = '<div class="plots">' + "".join(figures) + "</div>" if figures else ""
        example = ROOT / "examples" / "pick_and_place.py"
        if example.exists():
            code = (f'<details><summary>The whole script ({len(example.read_text().splitlines())} lines)</summary><p class="muted">From <a href="{REPO_URL}/robot_sdk/blob/main/examples/pick_and_place.py">'
                    f'<code>examples/pick_and_place.py</code></a>; run it with <code>uv run python examples/pick_and_place.py</code> in a robot_sdk checkout.</p>'
                    f'<pre class="code">{esc(example.read_text())}</pre></details>')

    sha = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    page = (PAGE.replace("__DIAGRAM__", diagram).replace("__EVIDENCE__", evidence).replace("__EDGE_COUNT__", str(len(edges)))
            .replace("__PIPELINE_INTRO__", intro).replace("__PIPELINE__", pipeline_html(pipeline)).replace("__PLOTS__", plots)
            .replace("__CODE__", code).replace("__CARDS__", cards).replace("__REPO__", REPO_URL)
            .replace("__BUILT__", datetime.date.today().isoformat()).replace("__SHA__", sha))
    (BUILD / "index.html").write_text(page)
    print(BUILD / "index.html")


if __name__ == "__main__":
    main()
