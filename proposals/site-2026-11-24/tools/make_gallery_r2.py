"""Build the babble deck gallery for round 2 (V6-V10: a site with workspaces).

    python3 /home/bam/robot_sdk/proposals/site-2026-11-24/tools/make_gallery_r2.py

Reads criteria.r2.json (frozen before the build), prune.r2.json (variant meta + the AI prune, written after every variant
was built, recorded and gate-checked), each variant's recorder steps.json and gates.json; writes
reports/media/site-workspaces-2026-11-24/gallery-spec.json and the gallery reports/media/site-workspaces-2026-11-24.html
through the babble skill's gallery.py (deck shell). Round 1's builder (make_gallery.py) is left as it was so its gallery
stays reproducible.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from make_gallery import esc, hero_html  # same stepped-stills exhibit as round 1

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
MEDIA = REPO / "reports/media/site-workspaces-2026-11-24"
GALLERY = REPO / "reports/media/site-workspaces-2026-11-24.html"
SKILL = Path.home() / "zach_brain/Settings/Skills/babble/scripts/gallery.py"
REL = "site-workspaces-2026-11-24"
LIVE = "../../proposals/site-2026-11-24"


def main():
    crit = json.loads((HERE / "criteria.r2.json").read_text())
    prune = json.loads((HERE / "prune.r2.json").read_text())
    gates = json.loads((MEDIA / "gates.json").read_text()) if (MEDIA / "gates.json").exists() else {}
    variants = []
    for meta in prune["variants"]:
        v = meta["id"]
        rec = json.loads((MEDIA / v / "steps.json").read_text())
        steps, overflow = rec["steps"][:5], rec["steps"][5:]
        # WHY hero_html's paths: it was written for round 1's media folder name; point it at this round's.
        preview = hero_html(v, steps).replace("site-proposals-2026-11-24/", REL + "/")
        media = [
            {"label": "Hero clip · the journey, recorded",
             "caption": "The same steps as the stills, recorded from the running single-file build in headless Chrome at 1440 × 900 on the real graph.json, health.json and versions.json."
                        + (" The clip also shows step " + ", ".join(f"{s['n']} · {s['label']}" for s in overflow) + "." if overflow else ""),
             "html": f'<video src="{REL}/{v}/hero.mp4" muted loop playsinline controls></video>'},
            {"label": "Live prototype · drive it here",
             "caption": "The real build in a frame. From file:// it runs on the copies embedded at build time (Live only); the live site has every version.",
             "html": f'<iframe src="{LIVE}/{v}/index.html" title="{esc(meta["name"])}" style="width:1440px;height:900px;border:1px solid #ddd;border-radius:8px"></iframe>'},
        ]
        if (MEDIA / f"gate-{v}-release.png").exists():
            media.append({"label": "Latest release picked · the version picker at work",
                          "caption": "After choosing Latest release in the top-right picker (gate g3): the data every workspace shows switches to each package at its newest v* tag.",
                          "html": f'<img src="{REL}/gate-{v}-release.png" alt="latest release">'})
        media.append({"label": "Phone · 390 px",
                      "caption": "The landing state on a phone (no sideways page scroll).",
                      "html": f'<img src="{REL}/{v}/phone.png" alt="phone" style="width:390px;border:1px solid #ddd;border-radius:8px">'})
        g = gates.get(v, {})
        variants.append({
            **{k: meta[k] for k in ["id", "name", "thesis", "accent", "bestWhen", "losesWhen", "decisions", "keepParts", "scores", "gateResults"]},
            "proof": meta.get("proof", []) + [f"Recorder: {len(rec['steps'])} steps, console errors {rec['console_errors'] or 'none'}, phone overflow {rec['phone_overflow_px']} px."]
                     + ([f"Gates run: {json.dumps({k: (x.get('pass') if isinstance(x, dict) else x) for k, x in g.items()})}"] if g else []),
            "previewLabel": "the recorded journey",
            "story": {"title": "Walk the journey",
                      "steps": [{"label": s["label"], "caption": s["caption"], "state": f"s{s['n']}", "target": f'[data-story-to="s{s["n"]}"]'} for s in steps]},
            "preview": preview,
            "media": media,
        })
    spec = {
        "schemaVersion": 3,
        "title": "robot-sdk site, round 2: a site with workspaces",
        "kicker": "babble 5 · robot_sdk · 2026-11-24 · round 2",
        "brief": crit["outcome"],
        "count": len(variants),
        "defaultId": prune["defaultId"], "defaultWhy": prune["defaultWhy"], "decisionHinge": prune["decisionHinge"],
        "invariants": crit["invariants"],
        "boundary": prune["boundary"],
        "axes": crit["axes"],
        "requirements": crit["requirements"],
        # WHY the mapping: criteria.r2.json (frozen) states each gate as a `test`; the deck shell requires a `why`. The gate's
        # own test sentence is shown as its reason, so the frozen file stays untouched.
        "hardGates": [{**g, "why": g.get("why") or g["test"]} for g in crit["hardGates"]],
        "variants": variants,
        "checks": prune.get("checks", []),
    }
    (MEDIA / "gallery-spec.json").write_text(json.dumps(spec, indent=1, ensure_ascii=False))
    tmp = GALLERY.with_suffix(".building.html")
    tmp.unlink(missing_ok=True)
    subprocess.run(["python3", str(SKILL), "build", "--spec", str(MEDIA / "gallery-spec.json"), "--output", str(tmp)], check=True)
    tmp.replace(GALLERY)
    subprocess.run(["python3", str(SKILL), "check", "--input", str(GALLERY), "--strict"], check=True)
    print(GALLERY, GALLERY.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
