"""Gate checks for all five variants (babble prune evidence), from the real built files.

    uv run -q --with playwright python /home/bam/robot_sdk/proposals/site-2026-11-24/tools/gates.py

g2 swap: each variant served over http with ?graph=<2x TEST fixture> must render with 0 page errors and show a
         "_x2" package id somewhere in its DOM (no code change, data-driven ids); a still per variant.
offline: each variant opened from file:// (the gallery's iframe) must reach data-ready with the build-time copy.
g5 links: under the links TEST fixture, count anchors to each package's GitHub repo and to the four fixture sites.
Writes reports/media/site-proposals-2026-11-24/gates.json (+ swap-2x.png per variant). Run make_fixtures.py first.
"""
from __future__ import annotations

import functools, http.server, json, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
OUT = REPO / "reports/media/site-proposals-2026-11-24"
FIX = "/reports/media/site-proposals-2026-11-24/_fixtures"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(REPO)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}/proposals/site-2026-11-24"
    graph = json.loads((REPO / "site/data/graph.json").read_text())
    repos = {p["id"]: p["repo_url"] for p in graph["packages"]}
    fixture = json.loads((OUT / "_fixtures/graph-links.json").read_text())
    sites = {p["id"]: p["links"]["site"] for p in fixture["packages"] if (p.get("links") or {}).get("site")}
    results = {}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
            for v in ["v1", "v2", "v3", "v4", "v5"]:
                r = results[v] = {}
                # g2: 2x swap
                ctx = b.new_context(viewport={"width": 1440, "height": 900})
                pg = ctx.new_page(); errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)))
                pg.goto(f"{base}/{v}/index.html?graph={FIX}/graph-2x.json", wait_until="networkidle")
                ok = True
                try: pg.wait_for_selector("[data-ready='1']", timeout=15000)
                except Exception: ok = False
                pg.wait_for_timeout(800)
                x2 = pg.evaluate("document.body.textContent.includes('_x2')")
                pg.screenshot(path=str(OUT / v / "swap-2x.png"))
                r["g2_swap"] = {"ready": ok, "page_errors": errs, "x2_ids_rendered": x2, "pass": ok and not errs and x2}
                ctx.close()
                # offline from file://
                ctx = b.new_context(viewport={"width": 1440, "height": 900})
                pg = ctx.new_page(); errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)))
                pg.goto((HERE / v / "index.html").as_uri())
                try: pg.wait_for_selector("[data-ready='1']", timeout=15000); ok = True
                except Exception: ok = False
                r["offline_file"] = {"ready": ok, "page_errors": errs, "pass": ok and not errs}
                ctx.close()
                # g5 links: hrefs anywhere in the DOM (directory surfaces may be in a tab: count what is reachable
                # in the landing DOM, then report; the per-variant still shows where they sit)
                ctx = b.new_context(viewport={"width": 1440, "height": 900})
                pg = ctx.new_page()
                pg.goto(f"{base}/{v}/index.html?graph={FIX}/graph-links.json", wait_until="networkidle")
                try: pg.wait_for_selector("[data-ready='1']", timeout=15000)
                except Exception: pass
                pg.wait_for_timeout(800)
                hrefs = set(pg.eval_on_selector_all("a[href]", "els => els.map(e => e.href)"))
                gh = sorted(k for k, u in repos.items() if any(h.rstrip('/') == u.rstrip('/') for h in hrefs))
                st = sorted(k for k, u in sites.items() if any(h.rstrip('/') == u.rstrip('/') for h in hrefs))
                r["g5_links_on_landing"] = {"github_repos_linked": f"{len(gh)}/{len(repos)}", "missing_github": sorted(set(repos) - set(gh)),
                                            "fixture_sites_linked": f"{len(st)}/{len(sites)}"}
                ctx.close()
            b.close()
    finally:
        httpd.shutdown()
    (OUT / "gates.json").write_text(json.dumps(results, indent=1))
    print(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
