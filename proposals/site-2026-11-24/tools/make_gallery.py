"""Build the babble deck gallery for the five site proposals.

    python3 /home/bam/robot_sdk/proposals/site-2026-11-24/tools/make_gallery.py

Reads criteria.json (frozen before the build), prune.json (variant meta + the AI prune, written after every variant was
built and recorded), the recorder's steps.json per variant and gates.json; writes
reports/media/site-proposals-2026-11-24/gallery-spec.json and the gallery
reports/media/site-proposals-2026-11-24.html via the babble skill's scripts/gallery.py (deck shell).
Media paths are relative to the gallery file, so it opens from file:// next to its media folder.
"""
from __future__ import annotations

import html
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
MEDIA = REPO / "reports/media/site-proposals-2026-11-24"
GALLERY = REPO / "reports/media/site-proposals-2026-11-24.html"
SKILL = Path.home() / "zach_brain/Settings/Skills/babble/scripts/gallery.py"
REL = "site-proposals-2026-11-24"  # media folder, relative to the gallery
LIVE = "../../proposals/site-2026-11-24"  # built prototypes, relative to the gallery


def esc(s): return html.escape(str(s), quote=True)


def hero_html(v: str, steps: list[dict]) -> str:
    """The recorded journey as a stepped exhibit: one real still per step, chips that jump between them."""
    css = ["<style>.prototype img.sh{display:none;width:1440px;max-width:none;height:auto;border:1px solid #ddd;border-radius:8px}",
           ".jr{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}.jr button{font:13px system-ui;border:1px solid #ccc;background:#fff;border-radius:7px;padding:4px 10px;cursor:pointer}"]
    for s in steps:
        n = s["n"]
        css.append(f'.prototype[data-story-state="s{n}"] img.sh{n}{{display:block}}'
                   f'.prototype[data-story-state="s{n}"] .jb{n}{{background:#1f2328;color:#fff;border-color:#1f2328}}')
    css.append("</style>")
    chips = "".join(f'<button class="jb{s["n"]}" data-story-to="s{s["n"]}">{s["n"]} · {esc(s["label"])}</button>' for s in steps)
    imgs = "".join(f'<img class="sh sh{s["n"]}" src="{REL}/{v}/{s["still"]}" alt="{esc(s["label"])}" width="1440" height="900">' for s in steps)
    return "".join(css) + f'<div class="jr">{chips}</div>{imgs}'


def main():
    crit = json.loads((HERE / "criteria.json").read_text())
    prune = json.loads((HERE / "prune.json").read_text())
    gates = json.loads((MEDIA / "gates.json").read_text()) if (MEDIA / "gates.json").exists() else {}
    variants = []
    for meta in prune["variants"]:
        v = meta["id"]
        rec = json.loads((MEDIA / v / "steps.json").read_text())
        # WHY: the deck's walkthrough takes 2-5 steps; a 6th recorded step becomes its own still exhibit.
        steps, overflow = rec["steps"][:5], rec["steps"][5:]
        media = [
            {"label": "Hero clip · the journey, recorded", "caption": "The same steps as the stills, recorded from the running single-file build in headless Chrome at 1440 × 900 (real graph.json).",
             "html": f'<video src="{REL}/{v}/hero.mp4" muted loop playsinline controls></video>'},
            {"label": "Live prototype · drive it here", "caption": "The real build in a frame. From file:// it runs on the graph.json copy embedded at build time; served, it re-reads site/data/graph.json.",
             "html": f'<iframe src="{LIVE}/{v}/index.html" title="{esc(meta["name"])}" style="width:1440px;height:900px;border:1px solid #ddd;border-radius:8px"></iframe>'},
        ]
        # Strict deck: at most four supporting exhibits. A 6th recorded step stays in the hero clip.
        if overflow:
            media[0]["caption"] += " The clip also shows step " + ", ".join(f"{s['n']} · {s['label']}" for s in overflow) + "."
        if (MEDIA / v / "links-fixture.png").exists():
            media.append({"label": "Directory links (g5) · TEST fixture", "caption": "Under a TEST graph.json (?graph= override) where four packages declare `links.site`: GitHub · Site · PyPI · README, one click from the directory.",
                          "html": f'<img src="{REL}/{v}/links-fixture.png" alt="directory links">'})
        media.append({"label": "Holds up · 2× TEST data and a 390 px phone", "caption": "Left: the same build with ?graph= pointing at a TEST copy with every package, type and use duplicated (26 packages, 58 types, 506 uses), no code change. Right: the landing state on a phone (no sideways page scroll).",
                      "html": f'<div style="display:flex;gap:16px;align-items:flex-start"><img src="{REL}/{v}/swap-2x.png" alt="2x data" style="width:1100px;border:1px solid #ddd;border-radius:8px"><img src="{REL}/{v}/phone.png" alt="phone" style="width:300px;border:1px solid #ddd;border-radius:8px"></div>'})
        g = gates.get(v, {})
        variants.append({
            **{k: meta[k] for k in ["id", "name", "thesis", "accent", "bestWhen", "losesWhen", "decisions", "keepParts", "scores", "gateResults"]},
            "proof": meta.get("proof", []) + [f"Recorder: {len(steps)} steps, console errors {rec['console_errors'] or 'none'}, phone overflow {rec['phone_overflow_px']} px."]
                     + ([f"Gates run: {json.dumps(g)}"] if g else []),
            "previewLabel": "the recorded journey",
            "story": {"title": meta.get("storyTitle", "Walk the journey"),
                      "steps": [{"label": s["label"], "caption": s["caption"], "state": f"s{s['n']}", "target": f'[data-story-to="s{s["n"]}"]'} for s in steps]},
            "preview": hero_html(v, steps),
            "media": media,
        })
    spec = {
        "schemaVersion": 3,
        "title": "robot-sdk site: five proposals",
        "kicker": "babble 5 · robot_sdk · 2026-11-24",
        "brief": crit["outcome"],
        "count": len(variants),
        "defaultId": prune["defaultId"], "defaultWhy": prune["defaultWhy"], "decisionHinge": prune["decisionHinge"],
        "invariants": crit["invariants"],
        "boundary": prune["boundary"],
        "axes": crit["axes"],
        "requirements": crit["requirements"],
        "hardGates": crit["hardGates"],
        "variants": variants,
        "checks": prune.get("checks", []),
    }
    (MEDIA / "gallery-spec.json").write_text(json.dumps(spec, indent=1, ensure_ascii=False))
    tmp = GALLERY.with_suffix(".building.html")
    tmp.unlink(missing_ok=True)  # gallery.py refuses to overwrite; build beside it, then replace
    subprocess.run(["python3", str(SKILL), "build", "--spec", str(MEDIA / "gallery-spec.json"), "--output", str(tmp)], check=True)
    tmp.replace(GALLERY)
    subprocess.run(["python3", str(SKILL), "check", "--input", str(GALLERY), "--strict"], check=True)
    print(GALLERY, GALLERY.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
