"""Copy the landing page's media out of the packages' own recordings: site/media/landing/ (committed, ~2 MB).

    python3 /home/bam/robot_sdk/site/landing_media.py

Run by hand on the workstation where the sibling repos are checked out (/home/bam/<repo>); the hourly refresh never
runs it, it only copies site/media/ as committed. Needs ffmpeg (with libfreetype for the hero's labels).

WHY copies of real captures, never new renders (Zach, 2026-11-25: "informative and media rich like [pidtuna.com]",
and his standing "never fabricated media"): every still and clip below is cut from a recording or figure the package
itself published (its own site/, website/ or reports/). The SOURCES table names the file each one came from, so a
re-cut after a package re-records is one run. A package with no recording yet gets no image on its card.

Writes, per package in SOURCES: <id>.jpg (16:10 card still, 640 px) and, when the source is a video, <id>.mp4 (the
same 3 s the hero uses, 640 px, no audio). Plus hero.mp4 + hero.jpg: those clips joined, 1280x780 (a 60 px caption
band under each clip names its package).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HOME = Path("/home/bam")
OUT = Path(__file__).resolve().parent / "media" / "landing"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

# id: (source under /home/bam, start s for a video / None for a still, crop of the source "w:h:x:y" or None, caption)
# Captions say what the capture shows, in the package's own terms; the landing page prints them under each card.
SOURCES: dict[str, tuple[str, float | None, str | None, str]] = {
    "robot_msgs": ("robot_msgs/reports/media/robot-msgs-v1-gallery/ur5e_tool.webp", None, None,
                   "A UR5e tool path as a PoseTrajectory: its stock .plot(), 626 samples"),
    "robot_models": ("robot_models/reports/media/robot-models-v1-2026-11-16/still-servo-ladder.jpg", None, "iw:iw*0.625:0:0",
                     "The servo model ladder: M0 learned black box up to M7, each rung one physical effect"),
    "robot_controllers": ("robot_controllers/reports/media/controller-layouts-2026-11-20/hero-ur5e.mp4", 0.5, None,
                          "Three controller layouts on one simulated UR5e trajectory: tracking error underneath"),
    "robot_reach": ("robot_reach/site/media/hero.mp4", 10.0, None,
                    "The UR5e's workspace in viser: every point coloured by how much of the pose the arm controls"),
    "robot_collision": ("robot_collision/site/media/hero.mp4", 2.0, None,
                        "The allowed-collision matrix next to the robot: pick a link pair, see the pair in 3D"),
    "robot_trajectories": ("robot_trajectories/reports/media/catalog-hero-2026-11-18.mp4", 6.0, None,
                           "The trajectory catalog: pick a generator, see its path on the arm and its joint curves"),
    "robot_autonomy": ("robot_autonomy/reports/media/hero-2026-11-18-run4/frame-45.png", None, None,
                       "Hands-on interventions per day and the agent's to-do list, from a simulated fleet"),
    "robot_metrics": ("robot_metrics/reports/media/coverage-gallery-2026-11-19/hero.mp4", 8.0, None,
                      "Coverage of a real CAN-bus servo's state space, growing play by play"),
    "robot_activity": ("robot_activity/website/_build/media/hero.mp4", 6.0, "iw:iw*0.625:0:0",
                       "Fleet utilisation: what each robot did today, and why it stood still"),
    "traj_compare": ("traj_compare/reports/media/coverage-viewer-2026-11-23/hero.mp4", 10.0, None,
                     "Trajectory coverage: which joint and tool space a dataset of UR5e runs actually visits"),
    "robot_msg_viz": ("robot_msg_viz/website/media/hero.mp4", 0.0, None,
                      "A JointTrajectory in Rerun: the arm moving, the tool's position and speed beside it"),
    "sim2real": ("sim2real/dashboards/source/media/scene_cam_twin.mp4", 0.0, None,
                 "The simulated twin of a UR5e pick cell, the scene camera's view"),
    "robot_diagnostics": ("robot_sdk/site/media/pick_and_place_tracking_error.png", None, None,
                          "From the pick-and-place below: shaded, the stops stock.stop_error scored against its limit"),
    "like_keras": ("like_keras/build/report/hero.mp4", 8.0, None,
                   "A live arm cell over dora: every port's rate, latency and drops, refreshed each second"),
}
# The hero reel: these packages' clips in this order (robot-forward first), 3 s each.
HERO = ["robot_controllers", "robot_msg_viz", "robot_reach", "robot_collision", "robot_trajectories", "sim2real", "traj_compare"]
CLIP_S = 3.0
DEEP = "0x0a1f33"  # the Yellowfin --pt-bg-deep, behind letterboxed clips


def hero_line(caption: str) -> str:
    """The caption, cut at its first colon and escaped for drawtext (its own quoting is ' and :)."""
    text = caption.split(":")[0]
    return text.replace("\\", "").replace("'", "\u2019").replace("%", " percent")


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def cover(width: int, height: int) -> str:
    """Scale to cover width x height, then centre-crop: a card still never letterboxes."""
    return (f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}")


def main() -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required")
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for pkg, (source, start, crop, caption) in SOURCES.items():
        src = HOME / source
        if not src.exists():
            print(f"skip {pkg}: {src} missing", file=sys.stderr)
            continue
        pre = f"crop={crop}," if crop else ""
        if start is None:
            ffmpeg("-i", str(src), "-vf", pre + cover(640, 400), "-frames:v", "1", "-q:v", "4", str(OUT / f"{pkg}.jpg"))
        else:
            ffmpeg("-ss", f"{start + 1.0}", "-i", str(src), "-vf", pre + cover(640, 400), "-frames:v", "1", "-q:v", "4", str(OUT / f"{pkg}.jpg"))
            ffmpeg("-ss", f"{start}", "-t", f"{CLIP_S}", "-i", str(src), "-an", "-vf", pre + cover(640, 400) + ",fps=24",
                   "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "slow", "-movflags", "+faststart",
                   str(OUT / f"{pkg}.mp4"))
        manifest[pkg] = {"still": f"media/landing/{pkg}.jpg", "clip": f"media/landing/{pkg}.mp4" if start is not None else None,
                         "caption": caption, "source": source}

    with tempfile.TemporaryDirectory() as scratch:
        parts = []
        for index, pkg in enumerate(HERO):
            source, start, crop, caption = SOURCES[pkg]
            label = pkg.replace(":", r"\:")
            pre = f"crop={crop}," if crop else ""
            part = Path(scratch) / f"{index}.mp4"
            # WHY a caption band under the picture, not a label on it: an overlay hid the clips' own badges (SIM TWIN)
            vf = (pre + f"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:780:(ow-iw)/2:(720-ih)/2:color={DEEP},fps=30,"
                  f"drawtext=fontfile={MONO}:text='{label}':fontcolor=0xffc21a:fontsize=28:x=28:y=738,"
                  f"drawtext=fontfile={FONT}:text='{hero_line(caption)}':fontcolor=0xe8f0f8:fontsize=20:x=28+{len(pkg) * 17 + 24}:y=744")
            ffmpeg("-ss", f"{start}", "-t", f"{CLIP_S}", "-i", str(HOME / source), "-an", "-vf", vf,
                   "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "fast", str(part))
            parts.append(part)
        listing = Path(scratch) / "list.txt"
        listing.write_text("".join(f"file '{p}'\n" for p in parts))
        ffmpeg("-f", "concat", "-safe", "0", "-i", str(listing), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28",
               "-preset", "slow", "-movflags", "+faststart", str(OUT / "hero.mp4"))
    ffmpeg("-ss", "1.2", "-i", str(OUT / "hero.mp4"), "-frames:v", "1", "-q:v", "3", str(OUT / "hero.jpg"))
    manifest["_hero"] = {"order": HERO, "clip_s": CLIP_S}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    total = sum(f.stat().st_size for f in OUT.iterdir())
    print(f"{OUT}: {len(list(OUT.iterdir()))} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
