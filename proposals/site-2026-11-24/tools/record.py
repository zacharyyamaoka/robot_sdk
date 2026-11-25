"""Record one variant's primary journey from the real running prototype: stills per step, a hero video, a phone still.

    uv run --with playwright python /home/bam/robot_sdk/proposals/site-2026-11-24/tools/record.py v1

Serves /home/bam/robot_sdk on a free 127.0.0.1 port (in-process, stopped on exit), opens
/proposals/site-2026-11-24/<v>/index.html in headless Chrome at 1440 x 900, runs src/<v>/journey.py's STEPS,
and writes reports/media/site-proposals-2026-11-24/<v>/: step-N.png, hero.mp4, hero.gif, phone.png, steps.json.
Every variant goes through this one recorder so viewport, timing and capture are the same (babble: fair comparison).

journey.py defines STEPS = [{"label", "caption", "act": callable(page) or None}]; step 1 is the landing state.
"""
from __future__ import annotations

import functools
import http.server
import importlib.util
import json
import shutil
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent.parent  # proposals/site-2026-11-24
REPO = HERE.parent.parent  # robot_sdk
OUT_ROOT = REPO / "reports" / "media" / "site-proposals-2026-11-24"
W, H = 1440, 900


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve():
    handler = functools.partial(Quiet, directory=str(REPO))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def load_journey(v: str):
    path = HERE / "src" / v / "journey.py"
    spec = importlib.util.spec_from_file_location(f"journey_{v}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.STEPS


def main(v: str, query: str = "") -> int:
    steps = load_journey(v)
    out = OUT_ROOT / v
    if out.exists():
        shutil.rmtree(out)
    (out / "_video").mkdir(parents=True)
    httpd = serve()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/proposals/site-2026-11-24/{v}/index.html{query}"
    errors: list[str] = []
    meta = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
            ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="light",
                                      record_video_dir=str(out / "_video"), record_video_size={"width": W, "height": H})
            page = ctx.new_page()
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url, wait_until="networkidle")
            page.wait_for_selector("[data-ready='1']", timeout=15000)
            page.wait_for_timeout(900)
            for i, st in enumerate(steps, 1):
                if st.get("act"):
                    st["act"](page)
                page.wait_for_timeout(st.get("wait", 1100))
                page.screenshot(path=str(out / f"step-{i}.png"))
                meta.append({"n": i, "label": st["label"], "caption": st["caption"], "still": f"step-{i}.png"})
            page.wait_for_timeout(600)
            video = page.video.path()
            ctx.close()
            # phone still of the landing state
            pctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="light")
            pp = pctx.new_page()
            pp.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            pp.goto(url, wait_until="networkidle")
            pp.wait_for_selector("[data-ready='1']", timeout=15000)
            pp.wait_for_timeout(900)
            overflow = pp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            pp.screenshot(path=str(out / "phone.png"))
            pctx.close()
            browser.close()
    finally:
        httpd.shutdown()
    mp4 = out / "hero.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-an", "-vf", "fps=25,scale=1440:-2",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "slow", "-movflags", "+faststart", str(mp4)], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp4), "-vf",
                    "fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer",
                    str(out / "hero.gif")], check=True)
    shutil.rmtree(out / "_video")
    (out / "steps.json").write_text(json.dumps({"variant": v, "url_path": f"/proposals/site-2026-11-24/{v}/index.html",
                                                "steps": meta, "console_errors": errors, "phone_overflow_px": overflow}, indent=1))
    print(json.dumps({"variant": v, "steps": len(meta), "console_errors": errors, "phone_overflow_px": overflow,
                      "mp4_kb": mp4.stat().st_size // 1024}))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ""))
