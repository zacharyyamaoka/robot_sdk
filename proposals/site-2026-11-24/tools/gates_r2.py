"""Hard-gate checks for round 2 (V6-V10), from the real built files, served the way gh-pages serves them.

    uv run -q --with playwright python /home/bam/robot_sdk/proposals/site-2026-11-24/tools/gates_r2.py [v6 v7 …]

Gates (criteria.r2.json): g1 real data (graph/health/versions fetched at runtime), g2 workspaces present, g3 version
picker top-right beside a GitHub icon linking the robot_sdk repo, Live default, switching changes the data, g5 directory
links, g6 0 console errors at 1440 x 900 (landing + every workspace) and no sideways scroll at 390 px. g4 (nothing from
V3) is judged by eye from the stills, not here.
Writes reports/media/site-workspaces-2026-11-24/gates.json + gate-<v>-*.png.
"""
from __future__ import annotations

import functools
import http.server
import json
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
OUT = REPO / "reports/media/site-workspaces-2026-11-24"
REPO_URL = "https://github.com/zacharyyamaoka/robot_sdk"
W, H = 1440, 900
REQUIRED_WS = ["types", "packages", "directory", "health"]
REACHABLE_WS = ["agents", "run", "skill"]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def ready(page):
    page.wait_for_selector("[data-ready='1']", timeout=20000)
    page.wait_for_timeout(700)


def check(browser, base: str, v: str) -> dict:
    graph = json.loads((REPO / "site/data/graph.json").read_text())
    r: dict = {}
    ctx = browser.new_context(viewport={"width": W, "height": H})
    page = ctx.new_page()
    errors: list[str] = []
    fetched: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda q: fetched.append(q.url))
    page.goto(f"{base}/{v}/index.html", wait_until="networkidle")
    ready(page)

    # g1: the three data files are read at runtime
    names = [u.rsplit("/", 1)[-1].split("?")[0] for u in fetched]
    r["g1_runtime_data"] = {f: f in names for f in ("graph.json", "health.json", "versions.json")}
    r["g1_runtime_data"]["pass"] = all(r["g1_runtime_data"].values())

    # g3: picker + GitHub icon, top-right, side by side; Live default
    picker, gh = page.locator("[data-testid='version-picker']").first, page.locator("[data-testid='github-link']").first
    g3: dict = {"picker": picker.count() > 0, "github": gh.count() > 0}
    if g3["picker"] and g3["github"]:
        pb, gb = picker.bounding_box(), gh.bounding_box()
        g3["picker_box"], g3["github_box"] = pb, gb
        g3["top_right"] = bool(pb and gb and min(pb["x"], gb["x"]) > W * 0.55 and max(pb["y"], gb["y"]) < 140)
        g3["side_by_side"] = bool(pb and gb and abs(pb["y"] - gb["y"]) < 30 and
                                  min(abs(gb["x"] - (pb["x"] + pb["width"])), abs(pb["x"] - (gb["x"] + gb["width"]))) < 120)
        g3["github_href"] = gh.get_attribute("href")
        g3["live_default"] = "live" in (picker.inner_text() or "").lower()
        before = page.evaluate("document.body.innerText")
        picker.click()
        page.wait_for_timeout(400)
        option = page.get_by_text("Latest release", exact=False).last
        g3["release_option"] = option.count() > 0
        if g3["release_option"]:
            option.click()
            page.wait_for_timeout(1500)
            after = page.evaluate("document.body.innerText")
            g3["hash_after"] = page.evaluate("location.hash")
            g3["data_changed"] = before != after
            g3["release_fetched"] = any("versions/release/graph.json" in u for u in fetched)
            page.screenshot(path=str(OUT / f"gate-{v}-release.png"))
        g3["pass"] = all(g3.get(k) for k in ("top_right", "side_by_side", "live_default", "release_option", "data_changed")) \
            and (g3.get("github_href") or "").rstrip("/") == REPO_URL
    else:
        g3["pass"] = False
    r["g3_version_picker"] = g3

    # g2 + g6: every workspace present; visiting each one stays error-free
    page.goto(f"{base}/{v}/index.html", wait_until="networkidle")
    ready(page)
    present = {ws: page.locator(f"[data-ws='{ws}']").count() > 0 for ws in REQUIRED_WS + REACHABLE_WS}
    r["g2_workspaces"] = {"present": present, "pass": all(present[w] for w in REQUIRED_WS) and any(present[w] for w in REACHABLE_WS)}
    controls = {}
    for ws in REQUIRED_WS + REACHABLE_WS:
        nav = page.locator(f"[data-ws='{ws}']").first
        if not present[ws]:
            continue
        try:
            nav.click()
            page.wait_for_timeout(900)
        except Exception as e:  # noqa: BLE001
            errors.append(f"click data-ws={ws}: {e}")
            continue
        page.screenshot(path=str(OUT / f"gate-{v}-ws-{ws}.png"))
        if ws == "packages":
            controls["packages"] = {t: page.locator(f"[data-testid='{t}']").count() > 0 for t in ("pm-mode-tree", "pm-mode-pipeline", "pm-group-by-layer")}
        if ws == "directory":
            controls["directory"] = {t: page.locator(f"[data-testid='{t}']").count() > 0 for t in ("dir-mode-cards", "dir-mode-compact")}
            hrefs = set(page.eval_on_selector_all("a[href]", "els => els.map(e => e.href.replace(/\\/$/, ''))"))
            gh_ok = [p["id"] for p in graph["packages"] if p["repo_url"].rstrip("/") in hrefs]
            pypi_ok = [p["id"] for p in graph["packages"] if (p.get("links") or {}).get("pypi", "").rstrip("/") in hrefs]
            sites = [p["id"] for p in graph["packages"] if (p.get("links") or {}).get("site")]
            site_ok = [i for i in sites if next(p for p in graph["packages"] if p["id"] == i)["links"]["site"].rstrip("/") in hrefs]
            r["g5_directory_links"] = {"github": f"{len(gh_ok)}/{len(graph['packages'])}", "pypi": f"{len(pypi_ok)}/{len(graph['packages'])}",
                                       "site": f"{len(site_ok)}/{len(sites)}",
                                       "pass": len(gh_ok) == len(graph["packages"]) and len(pypi_ok) == len(graph["packages"]) and len(site_ok) == len(sites)}
    r["g2_workspaces"]["controls"] = controls
    r["g2_workspaces"]["pass"] = r["g2_workspaces"]["pass"] and all(all(c.values()) for c in controls.values()) and len(controls) == 2
    r.setdefault("g5_directory_links", {"pass": False, "why": "no directory workspace"})
    ctx.close()

    pctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pp = pctx.new_page()
    pp.on("pageerror", lambda e: errors.append("phone: " + str(e)))
    pp.goto(f"{base}/{v}/index.html", wait_until="networkidle")
    ready(pp)
    overflow = pp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    pctx.close()
    r["g6_clean"] = {"console_errors": errors, "phone_overflow_px": overflow, "pass": not errors and overflow <= 0}
    r["pass"] = all(r[k]["pass"] for k in ("g1_runtime_data", "g2_workspaces", "g3_version_picker", "g5_directory_links", "g6_clean"))
    return r


def main(variants: list[str]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(REPO)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}/proposals/site-2026-11-24"
    path = OUT / "gates.json"
    results = json.loads(path.read_text()) if path.exists() else {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
            for v in variants:
                try:
                    results[v] = check(browser, base, v)
                except Exception as e:  # noqa: BLE001 — a crashed check is a failed gate, recorded
                    results[v] = {"pass": False, "crash": repr(e)}
                print(v, "PASS" if results[v]["pass"] else "FAIL", json.dumps({k: (x.get("pass") if isinstance(x, dict) else x) for k, x in results[v].items()}))
            browser.close()
    finally:
        httpd.shutdown()
    path.write_text(json.dumps(results, indent=1))
    return 0 if all(results[v]["pass"] for v in variants) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["v6", "v7", "v8", "v9", "v10"]))
