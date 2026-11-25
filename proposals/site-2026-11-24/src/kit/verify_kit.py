"""Drive the kit's demo page (kit/index.html) in headless Chrome and prove each component on the real data.

    uv run -q --with playwright python /home/bam/robot_sdk/proposals/site-2026-11-24/src/kit/verify_kit.py

Serves /home/bam/robot_sdk on a free 127.0.0.1 port (in-process, stopped on exit), opens
/proposals/site-2026-11-24/kit/index.html at 1440 x 900 and 390 x 844, and writes PNGs + results.json to
reports/media/site-workspaces-2026-11-24/kit/. Exit 1 when any check fails.
"""
from __future__ import annotations

import functools
import http.server
import json
import re
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[4]
OUT = REPO / "reports/media/site-workspaces-2026-11-24/kit"
PAGE = "/proposals/site-2026-11-24/kit/index.html"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def ready(page):
    page.wait_for_selector("[data-ready='1']", timeout=20000)
    page.wait_for_timeout(600)


def shot(page, name, sel=None, full=False):
    path = OUT / f"{name}.png"
    if sel:
        page.locator(sel).first.scroll_into_view_if_needed()
        page.wait_for_timeout(250)
        page.locator(sel).first.screenshot(path=str(path))
    else:
        page.screenshot(path=str(path), full_page=full)
    return path.name


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    graph = json.loads((REPO / "site/data/graph.json").read_text())
    health = json.loads((REPO / "site/data/health.json").read_text())
    release = json.loads((REPO / "site/data/versions/release/graph.json").read_text())
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(REPO)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    r: dict = {"checks": {}, "shots": []}
    ok = r["checks"]
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            errors: list[str] = []
            fetched: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("request", lambda q: fetched.append(q.url))
            page.goto(base + PAGE, wait_until="networkidle")
            ready(page)
            r["shots"].append(shot(page, "01-landing-1440"))
            names = [u.rsplit("/", 1)[-1] for u in fetched]
            ok["runtime_data"] = all(f in names for f in ("graph.json", "health.json", "versions.json", "pick_and_place.json"))

            # top right: picker + GitHub side by side; Live default
            pb = page.locator("[data-testid='version-picker']").bounding_box()
            gb = page.locator("[data-testid='github-link']").bounding_box()
            ok["topright_side_by_side"] = bool(pb and gb and abs(pb["y"] - gb["y"]) < 30 and pb["x"] > 1440 * 0.55 and gb["x"] > pb["x"])
            ok["github_href"] = page.locator("[data-testid='github-link']").get_attribute("href") == "https://github.com/zacharyyamaoka/robot_sdk"
            ok["live_default"] = "Live" in page.locator("[data-testid='version-picker']").inner_text()
            page.locator("[data-testid='version-picker']").click()
            page.wait_for_timeout(300)
            r["shots"].append(shot(page, "02-version-picker", "[data-testid='version-popover']"))
            page.locator("[data-testid='vp-tab-snapshots']").click()
            page.wait_for_timeout(200)
            r["shots"].append(shot(page, "03-version-picker-snapshots", "[data-testid='version-popover']"))
            page.locator("[data-testid='vp-tab-channels']").click()
            dir_before = page.locator("[data-testid^='dir-card-']").count()
            page.get_by_text("Latest release", exact=False).last.click()
            page.wait_for_selector("[data-testid='version-banner']", timeout=8000)
            page.wait_for_timeout(1200)
            dir_after = page.locator("[data-testid^='dir-card-']").count()
            ok["release_fetched"] = any("versions/release/graph.json" in u for u in fetched)
            ok["release_changes_package_list"] = dir_before == len(graph["packages"]) and dir_after == len(release["packages"]) and dir_after != dir_before
            ok["release_hash"] = "v=release" in page.evaluate("location.hash")
            r["release"] = {"dir_before": dir_before, "dir_after": dir_after, "hash": page.evaluate("location.hash")}
            page.locator("[data-testid='version-diff-toggle']").click()
            page.wait_for_timeout(200)
            r["shots"].append(shot(page, "04-release-banner-diff", "[data-testid='version-banner']"))
            r["shots"].append(shot(page, "05-release-directory", "[data-testid='directory']"))
            r["shots"].append(shot(page, "06-release-health", "[data-testid='health-board']"))
            # a snapshot without recorded health says so, never shows Live's
            page.evaluate("location.hash = '#/types/JointTrajectory?v=snap-49836d0'")
            page.wait_for_timeout(1500)
            ok["snapshot_health_not_recorded"] = "not recorded" in page.locator("[data-testid='health-board']").inner_text().lower()
            r["shots"].append(shot(page, "07-snapshot-health-missing", "[data-testid='health-board']"))
            page.locator("[data-testid='back-to-live']").click()
            page.wait_for_timeout(800)
            ok["back_to_live"] = page.locator("[data-testid='version-banner']").count() == 0 and "v=" not in page.evaluate("location.hash")

            # health board: real CI failures, failing first, evidence links
            hb = page.locator("[data-testid='health-board']")
            first_rows = page.eval_on_selector_all("[data-testid^='health-row-']", "els => els.map(e => e.dataset.testid.replace('health-row-',''))")
            failing = [m["id"] for m in health["members"] if m["state"] == "fail"]
            ok["health_failing_first"] = first_rows[: len(failing)] == [m for m in first_rows if m in failing][: len(failing)] and set(first_rows[: len(failing)]) == set(failing)
            ci_fail = [m for m in health["members"] if m["checks"].get("tests", {}).get("state") == "fail"]
            hrefs = {m["id"]: page.locator(f"[data-testid='health-cell-{m['id']}-tests']").get_attribute("href") for m in ci_fail}
            ok["health_ci_links"] = all(hrefs[m["id"]] == m["checks"]["tests"].get("url") for m in ci_fail) and len(ci_fail) > 0
            r["health"] = {"order": first_rows, "ci_fail_links": hrefs}
            r["shots"].append(shot(page, "08-health-board", "[data-testid='health-board']"))
            # a cell without a url opens its detail row
            no_url = next(((m["id"], c) for m in health["members"] for c, v in m["checks"].items() if not v.get("url") and v["state"] in ("fail", "warn", "unknown")), None)
            if no_url:
                page.locator(f"[data-testid='health-cell-{no_url[0]}-{no_url[1]}']").click()
                page.wait_for_timeout(200)
                ok["health_detail_opens"] = page.locator(f"[data-testid='health-detail-{no_url[0]}-{no_url[1]}']").count() == 1
                r["shots"].append(shot(page, "09-health-detail", "[data-testid='health-board']"))
            page.locator("[data-testid='health-filter-fail']").click()
            page.wait_for_timeout(200)
            ok["health_filter_fail"] = page.locator("[data-testid^='health-row-']").count() == len(failing)
            page.locator("[data-testid='health-filter-all']").click()

            # directory: cards <-> compact, links
            r["shots"].append(shot(page, "10-directory-cards", "[data-testid='directory']"))
            hrefs_all = set(page.eval_on_selector_all("[data-testid='directory'] a[href]", "els => els.map(e => e.href.replace(/\\/$/, ''))"))
            ok["directory_links"] = all(pk["repo_url"].rstrip("/") in hrefs_all and (pk.get("links") or {}).get("pypi", "").rstrip("/") in hrefs_all for pk in graph["packages"]) \
                and all(pk["links"]["site"].rstrip("/") in hrefs_all for pk in graph["packages"] if (pk.get("links") or {}).get("site"))
            page.locator("[data-testid='dir-mode-compact']").click()
            page.wait_for_timeout(300)
            ok["directory_compact"] = page.locator("[data-testid^='dir-row-']").count() == len(graph["packages"]) and page.locator("[data-testid^='dir-card-']").count() == 0
            r["shots"].append(shot(page, "11-directory-compact", "[data-testid='directory']"))
            page.reload(wait_until="networkidle")
            ready(page)
            ok["directory_mode_remembered"] = page.locator("[data-testid^='dir-row-']").count() == len(graph["packages"])
            page.locator("[data-testid='dir-mode-cards']").click()

            # package map: tree grouped, ungrouped, pipeline (no robot_msgs), pipeline grouped
            pm = "[data-testid='package-map']"
            page.locator(pm).scroll_into_view_if_needed()
            page.wait_for_timeout(900)
            ok["tree_has_bands"] = page.locator(".k-pm-band").count() > 0
            r["shots"].append(shot(page, "12-pm-tree-grouped", pm))
            page.locator("[data-testid='pm-group-by-layer']").uncheck()
            page.wait_for_timeout(1200)
            ok["tree_ungrouped_no_bands"] = page.locator(".k-pm-band").count() == 0 and page.locator("[data-testid='pm-canvas']").get_attribute("data-grouped") == "false"
            r["shots"].append(shot(page, "13-pm-tree-ungrouped", pm))
            page.locator("[data-testid='pm-mode-pipeline']").click()
            page.wait_for_timeout(1200)
            ok["pipeline_no_robot_msgs"] = page.locator("[data-testid='pm-node-robot_msgs']").count() == 0 and page.locator("[data-testid^='pm-node-']").count() > 0
            ok["pipeline_labels"] = page.locator("[data-testid^='pm-elabel-']").count() > 0
            # "JointLimits +2 (3)" counted the same types twice (kit check 2026-11-24)
            texts = page.eval_on_selector_all(".k-pm-elabel-t", "els => els.map(e => e.textContent)")
            ok["pipeline_labels_count_once"] = bool(texts) and not any(re.search(r"\(\d+\)$", t) for t in texts)
            r["pipeline"] = {"nodes": page.locator("[data-testid^='pm-node-']").count(), "labels": page.locator("[data-testid^='pm-elabel-']").count()}
            r["shots"].append(shot(page, "14-pm-pipeline", pm))
            multi = page.locator("[data-testid^='pm-elabel-'] .k-pm-elabel-t", has_text="+").first
            if multi.count():
                multi.click()
                page.wait_for_timeout(250)
                ok["pipeline_multi_label_lists_types"] = page.locator(".k-pm-elabel-list button").count() >= 2
                page.locator(".k-pm-elabel-list button").first.click()
                page.wait_for_timeout(300)
                ok["pipeline_label_opens_type"] = page.evaluate("location.hash").startswith("#/types/")
            page.locator("[data-testid='pm-imports']").check()
            page.wait_for_timeout(1200)
            ok["pipeline_imports_dashed"] = page.locator(".k-pm-elabel.k-ek-imports").count() > 0
            r["shots"].append(shot(page, "14b-pm-pipeline-imports", pm))
            page.locator("[data-testid='pm-imports']").uncheck()
            page.locator("[data-testid='pm-group-by-layer']").check()
            page.wait_for_timeout(1200)
            r["shots"].append(shot(page, "15-pm-pipeline-grouped", pm))
            page.locator("[data-testid='pm-agents']").check()
            page.locator("[data-testid='pm-mode-tree']").click()
            page.wait_for_timeout(1200)
            r["shots"].append(shot(page, "16-pm-tree-agents", pm))
            page.locator("[data-testid='pm-agents']").uncheck()

            # types: workspace + actions + search
            page.locator("[data-testid='type-workspace']").scroll_into_view_if_needed()
            page.wait_for_timeout(900)
            r["shots"].append(shot(page, "17-type-workspace", "[data-testid='type-workspace']"))
            ta = page.locator("[data-testid='type-workspace'] [data-testid='type-actions']")
            ok["type_actions_consumers"] = ta.locator("[data-testid='type-actions-consumers'] .k-sigrow").count() > 0
            page.locator("[data-testid='type-workspace'] .sw-elabel").first.click()
            page.wait_for_timeout(400)
            ok["types_flip_to_rows"] = page.locator("[data-testid='type-workspace'] [data-testid='rows-panel']").is_visible()
            r["shots"].append(shot(page, "18-type-workspace-rows", "[data-testid='type-workspace']"))
            page.locator("[data-testid='type-search-input']").fill("JointTrajectory ->")
            page.wait_for_timeout(300)
            ok["type_search_arrow"] = page.locator("[data-testid='type-search-functions'] .k-sigrow").count() > 0
            r["shots"].append(shot(page, "19-type-actions-search", "[data-testid='demo-actions']"))
            page.locator("[data-testid='type-search'] [data-testid='tlink-JointState']").first.click() if page.locator("[data-testid='type-search'] [data-testid='tlink-JointState']").count() else None
            page.locator("[data-testid='tlink-ServoCommand']").last.click()
            page.wait_for_timeout(600)
            ok["type_link_navigates"] = page.evaluate("location.hash").startswith("#/types/ServoCommand")
            r["shots"].append(shot(page, "20-panels-run", "[data-testid='run-panel']"))
            r["shots"].append(shot(page, "21-panels-agents", "[data-testid='agents-panel']"))
            # a type missing from the selected version is said, not swapped silently
            missing = next((t["name"] for t in graph["types"] if t["id"] not in {x["id"] for x in release["types"]}), None)
            if missing:
                page.evaluate(f"location.hash = '#/types/{missing}?v=release'")
                page.wait_for_timeout(1500)
                ok["missing_type_said"] = page.locator("[data-testid='type-workspace'] [data-testid='type-missing']").count() == 1
                r["shots"].append(shot(page, "22-release-missing-type", "[data-testid='type-workspace']"))
                # Rows panel (V2's, imported unchanged) links file:line at the version's ref like TypeActions, not main
                page.evaluate("location.hash = '#/types/JointTrajectory?v=release'")
                page.wait_for_timeout(1500)
                page.locator("[data-testid='type-workspace'] [data-testid='types-panel-rows']").click()
                page.wait_for_timeout(400)
                rows = page.eval_on_selector_all("[data-testid='type-workspace'] [data-testid='rows-panel'] a.where", "els => els.map(e => e.getAttribute('href'))")
                ok["release_rows_at_ref"] = bool(rows) and not any("/blob/main/" in h for h in rows)
                r["release_rows_links"] = rows
                page.evaluate("location.hash = '#/types/JointTrajectory'")
                page.wait_for_timeout(800)
            # no duplicate ids (two TypeActions and two React Flows share this page)
            dup = page.evaluate("Object.entries([...document.querySelectorAll('[id]')].reduce((m, e) => (m[e.id] = (m[e.id] || 0) + 1, m), {})).filter(([, n]) => n > 1)")
            ok["no_duplicate_ids"] = not dup
            r["duplicate_ids"] = dup
            page.locator("[data-testid='dir-mode-compact']").click()
            page.wait_for_timeout(200)
            ok["compact_one_line_title"] = page.eval_on_selector_all("[data-testid^='dir-row-'] .k-dirc-one", "els => els.length > 0 && els.every(e => e.title && e.title === e.textContent)")
            page.locator("[data-testid='dir-mode-cards']").click()
            ok["no_console_errors_1440"] = not errors
            r["errors_1440"] = errors
            ctx.close()

            # phone
            pctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
            pp = pctx.new_page()
            perr: list[str] = []
            pp.on("console", lambda m: perr.append(m.text) if m.type == "error" else None)
            pp.on("pageerror", lambda e: perr.append(str(e)))
            pp.goto(base + PAGE, wait_until="networkidle")
            ready(pp)
            ok["phone_no_sideways_scroll"] = pp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0
            r["shots"].append(shot(pp, "30-phone-top"))
            pp.locator("[data-testid='version-picker']").click()
            pp.wait_for_timeout(300)
            r["shots"].append(shot(pp, "31-phone-picker"))
            pp.keyboard.press("Escape")
            # package map on a phone: readable zoom, not fit-to-width (names were 3-5 px; kit check 2026-11-24); a first
            # visitor's pipeline is ungrouped (per-mode defaults)
            pz = """() => { const c = document.querySelector("[data-testid='pm-canvas']"); const z = new DOMMatrix(getComputedStyle(c.querySelector('.react-flow__viewport')).transform).a;
              return { mode: c.dataset.mode, grouped: c.dataset.grouped, zoom: z, namePx: parseFloat(getComputedStyle(c.querySelector('.k-pm-node-name')).fontSize) * z }; }"""
            pp.locator("[data-testid='package-map']").scroll_into_view_if_needed()
            pp.wait_for_timeout(1300)
            tree_z = pp.evaluate(pz)
            pp.locator("[data-testid='pm-mode-pipeline']").click()
            pp.wait_for_timeout(1300)
            pipe_z = pp.evaluate(pz)
            r["phone_map"] = [tree_z, pipe_z]
            ok["phone_map_readable"] = all(m["zoom"] >= 0.74 and m["namePx"] >= 9 for m in (tree_z, pipe_z))
            ok["pipeline_first_ungrouped"] = pipe_z["mode"] == "pipeline" and pipe_z["grouped"] == "false"
            pp.locator("[data-testid='pm-mode-tree']").click()
            for sel, name in [("[data-testid='health-board']", "32-phone-health"), ("[data-testid='directory']", "33-phone-directory"),
                              ("[data-testid='package-map']", "34-phone-packagemap"), ("[data-testid='type-workspace']", "35-phone-types")]:
                pp.locator(sel).scroll_into_view_if_needed()
                pp.wait_for_timeout(700)
                pp.screenshot(path=str(OUT / f"{name}.png"))
                r["shots"].append(name + ".png")
            ok["phone_no_sideways_scroll_after"] = pp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0
            ok["no_console_errors_390"] = not perr
            r["errors_390"] = perr
            pctx.close()

            # offline (file://): only Live is available
            fctx = browser.new_context(viewport={"width": 1440, "height": 900})
            fp = fctx.new_page()
            ferr: list[str] = []
            fp.on("pageerror", lambda e: ferr.append(str(e)))
            fp.goto((REPO / "proposals/site-2026-11-24/kit/index.html").as_uri())
            ready(fp)
            fp.locator("[data-testid='version-picker']").click()
            fp.wait_for_timeout(300)
            ok["file_only_live"] = fp.locator("[data-testid='vp-option-release']").is_disabled() and fp.locator("[data-testid='vp-option-live']").is_enabled()
            r["shots"].append(shot(fp, "40-file-picker", "[data-testid='version-popover']"))
            ok["file_no_page_errors"] = not ferr
            fctx.close()
            browser.close()
    finally:
        httpd.shutdown()
    r["pass"] = all(ok.values())
    (OUT / "results.json").write_text(json.dumps(r, indent=1))
    for k, v in ok.items():
        print(("PASS " if v else "FAIL ") + k)
    print("errors:", r.get("errors_1440"), r.get("errors_390"))
    return 0 if r["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
