"""Every robot-sdk package has a landing page (Zach, 2026-11-25: "All the packages in robot sdk should have a landing
page they link to ... the health of the package is only good IF it does have this").

The gate, proved with fake page fetchers (no network): robot-sdk.toml's [links] site names the page, the page answers
200 with real HTML (not a 404, a placeholder or a GitHub page), and the README links to it. A package without one is
never green on the Health page.
"""

import pathlib
import sys

import pytest

SDK = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK))

from tools.sdk_graph import health, landing  # noqa: E402

SITE = "https://zacharyyamaoka.github.io/pkg/"
REAL = ("<!doctype html><html><head><title>pkg: joint-space trajectories</title></head><body><h1>pkg</h1>"
        + "<p>Time-optimal joint trajectories for robot arms, from waypoints to a sampled path. </p>" * 6
        + "</body></html>")  # fmt: skip
README = f"# pkg\n\nLanding page: [{SITE.rstrip('/')}]({SITE})\n"
RAW = "https://raw.githubusercontent.com/o/pkg/main/README.md"


def page(status=200, text=REAL, url=None, content_type="text/html; charset=utf-8", reason="ok", access=None):
    return landing.Page(status=status, url=url or SITE, content_type=content_type, text=text, reason=reason, access=access)


class Pages:
    """A page fetcher answering from a URL table; anything not in it is unreachable."""

    def __init__(self, table: dict[str, landing.Page]) -> None:
        self.table = table
        self.urls: list[str] = []

    def __call__(self, url: str) -> landing.Page:
        self.urls.append(url)
        return self.table.get(url) or landing.Page(None, url, None, None, "URLError: offline", None)


def check(site=SITE, pages=None, readme=README):
    links = {"github": "https://github.com/o/pkg", **({"site": site} if site else {})}
    fetch = Pages({SITE: page()} if pages is None else pages)
    return landing.landing_check(links, fetch, readme)


# ------------------------------------------------------------------------------------------------ the check itself


def test_a_package_without_a_landing_page_fails():
    result = check(site=None)
    assert result["state"] == "fail"
    assert "no landing page" in result["detail"] and "[links] site" in result["detail"]


def test_a_real_page_the_readme_links_to_passes():
    result = check()
    assert result["state"] == "pass", result["detail"]
    assert result["url"] == SITE and result["readme"] is True and result["http"] == 200


@pytest.mark.parametrize("status", [404, 500, 403])
def test_a_page_that_does_not_answer_200_fails(status):
    result = check(pages={SITE: page(status=status, text="Not Found", reason=f"HTTP {status}")})
    assert result["state"] == "fail" and str(status) in result["detail"]


def test_github_pages_missing_site_fails():
    gh404 = page(status=404, text="<title>Site not found · GitHub Pages</title>There isn't a GitHub Pages site here.")
    assert check(pages={SITE: gh404})["state"] == "fail"


@pytest.mark.parametrize("text", [
    "<html><head><title>Coming soon</title></head><body>Coming soon</body></html>",
    "<html><body>hi</body></html>",
    "<!doctype html><html><head><title>Site not found · GitHub Pages</title></head><body>" + "x " * 400 + "</body></html>",
])  # fmt: skip
def test_a_placeholder_page_fails(text):
    result = check(pages={SITE: page(text=text)})
    assert result["state"] == "fail" and "placeholder" in result["detail"]


def test_a_non_html_answer_fails():
    result = check(pages={SITE: page(content_type="application/json", text='{"ok": true}')})
    assert result["state"] == "fail" and "not an HTML page" in result["detail"]


def test_a_github_readme_is_not_a_landing_page():
    gh = "https://github.com/o/pkg"
    result = check(site=gh, pages={gh: page(url=gh)}, readme=f"see {gh}")
    assert result["state"] == "fail" and "GitHub" in result["detail"]
    redirected = check(pages={SITE: page(url="https://github.com/o/pkg#readme")})
    assert redirected["state"] == "fail" and "GitHub" in redirected["detail"]


def test_a_cloudflare_access_page_is_present_but_flagged():
    gated = page(status=302, url="https://zach.cloudflareaccess.com/cdn-cgi/access/login/pkg.zacharyyamaoka.com",
                 text=None, access="zach.cloudflareaccess.com")  # fmt: skip
    result = check(pages={SITE: gated})
    assert result["state"] == "warn" and "Cloudflare Access" in result["detail"] and result["private"] is True


def test_a_readme_that_does_not_link_the_page_is_not_green():
    result = check(readme="# pkg\n\nNo links here.\n")
    assert result["state"] == "warn" and result["readme"] is False and "README" in result["detail"]


def test_the_readme_link_tolerates_a_trailing_slash_but_not_a_longer_host():
    assert landing.readme_links("see https://zacharyyamaoka.github.io/pkg", SITE)
    assert landing.readme_links("<a href='https://zacharyyamaoka.github.io/pkg/'>", SITE)
    assert landing.readme_links("[x](https://robotmsgs.com/)", "https://robotmsgs.com")
    assert not landing.readme_links("https://robotmsgs.community", "https://robotmsgs.com")
    assert not landing.readme_links("https://zacharyyamaoka.github.io/pkg2/", SITE)


def test_unreachable_page_is_unknown_never_pass():
    result = check(pages={})
    assert result["state"] == "unknown" and "URLError" in result["detail"]


def test_no_readme_read_is_unknown_not_pass_and_no_readme_file_is_flagged():
    assert check(readme=None)["state"] == "unknown"
    assert check(readme=landing.NO_README)["state"] == "warn"


def test_offline_check_still_fails_a_missing_declaration_and_says_the_page_was_not_fetched():
    missing = landing.landing_check({"github": "https://github.com/o/pkg"}, None, README)
    assert missing["state"] == "fail"
    offline = landing.landing_check({"site": SITE}, None, README)
    assert offline["state"] == "unknown" and "not fetched" in offline["detail"] and offline["readme"] is True


# ------------------------------------------------------------------------------------------------ the health gate


def graph(links: dict) -> dict:
    p = {"id": "pkg", "pypi": "pkg", "repo_url": "https://github.com/o/pkg", "lint": "pass", "links": links}
    return {"schema": "robot-sdk-graph/1", "generated": "2026-11-25T00:00:00-07:00", "sources": {}, "packages": [p],
            "types": [], "uses": [], "agents": [{"id": "agent", "repo_url": "https://github.com/o/agent", "lint": "pass",
                                                 "links": {"github": "https://github.com/o/agent"}}]}  # fmt: skip


def api(name: str) -> dict:
    a = "https://api.github.com"
    return {
        f"{a}/repos/o/{name}/actions/workflows?": (200, {"workflows": [{"id": 1, "name": "test", "path": ".github/workflows/test.yml"}]}, "ok"),
        f"{a}/repos/o/{name}/actions/workflows/test.yml/runs": (200, {"workflow_runs": [{"status": "completed", "conclusion": "success", "head_sha": "abcdef0"}]}, "ok"),
        f"{a}/repos/o/{name}": (200, {"full_name": f"o/{name}", "html_url": f"https://github.com/o/{name}", "default_branch": "main"}, "ok"),
        f"https://pypi.org/pypi/{name}/json": (200, {"info": {"version": "0.1.0"}, "releases": {"0.1.0": [{"yanked": False}]}}, "ok"),
    }  # fmt: skip


def fake_json(table):
    def fetch(url, token=None):
        hits = [p for p in table if url.startswith(p)]
        return table[max(hits, key=len)] if hits else (None, None, "URLError: offline")

    return fetch


def health_doc(links: dict, pages: dict) -> dict:
    src = health.Sources(fetch=fake_json(api("pkg") | api("agent")), fetch_page=Pages(pages))
    return health.build_health(graph(links), pins={"pkg": "~=0.1.0"}, src=src)


def test_landing_is_a_health_column():
    assert [c["id"] for c in health.CHECKS][-1] == "landing"
    assert "landing" not in [c["id"] for c in health.RELEASE_CHECKS]  # a page answers today, not at a tag


def test_health_is_only_green_with_a_landing_page():
    links = {"github": "https://github.com/o/pkg", "site": SITE}
    good = health_doc(links, {SITE: page(), RAW: page(url=RAW, content_type="text/plain", text=README)})
    pkg = next(m for m in good["members"] if m["id"] == "pkg")
    assert pkg["checks"]["landing"]["state"] == "pass", pkg["checks"]["landing"]
    assert pkg["state"] == "pass"

    bare = health_doc({"github": "https://github.com/o/pkg"}, {})
    pkg = next(m for m in bare["members"] if m["id"] == "pkg")
    assert pkg["checks"]["landing"]["state"] == "fail"
    assert pkg["state"] == "fail", "a package with no landing page must never be green"
    assert bare["summary"]["pass"] == 1  # only the agent


def test_health_reads_the_readme_on_main_from_github():
    links = {"github": "https://github.com/o/pkg", "site": SITE}
    doc = health_doc(links, {SITE: page(), RAW: page(url=RAW, content_type="text/plain", text="# pkg\n")})
    landing_cell = next(m for m in doc["members"] if m["id"] == "pkg")["checks"]["landing"]
    assert landing_cell["state"] == "warn" and landing_cell["readme"] is False
    missing = health_doc(links, {SITE: page(), RAW: page(status=404, url=RAW, text="404: Not Found", reason="HTTP 404")})
    assert next(m for m in missing["members"] if m["id"] == "pkg")["checks"]["landing"]["state"] == "warn"


def test_agents_need_no_landing_page():
    doc = health_doc({"github": "https://github.com/o/pkg", "site": SITE}, {})
    agent = next(m for m in doc["members"] if m["id"] == "agent")
    assert agent["checks"]["landing"]["state"] == "none" and agent["state"] == "pass"


def test_without_a_page_fetcher_nothing_is_fetched():
    """Offline-safe: tests that pass only a JSON fake never touch the network for pages."""
    src = health.Sources(fetch=fake_json({}))
    assert src.page(SITE).status is None and "offline" in src.page(SITE).reason
