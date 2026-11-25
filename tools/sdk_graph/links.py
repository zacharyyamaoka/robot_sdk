"""Does each declared link resolve? `python -m tools.sdk_graph check --online` (network; tests mark it `network`).

WHY PyPI through its JSON API: pypi.org/project/<name>/ answers 200 with a bot challenge page for any name, real or not
(measured 2026-11-24), so only https://pypi.org/pypi/<name>/json tells a released project from a missing one.
WHY a PyPI 404 is "unpublished", not a failure: the offline lint already proves the link names the pyproject's own
project, so a 404 there means "not released yet" (docs/release-brief.md tracks that), not a wrong link.
"""

from __future__ import annotations

import concurrent.futures
import re
import urllib.error
import urllib.request

TIMEOUT_S = 20
AGENT = "robot-sdk-link-check/1"
PYPI_PROJECT = re.compile(r"https://pypi\.org/project/([^/]+)/?$")


def probe_url(url: str) -> str:
    match = PYPI_PROJECT.match(url)
    return f"https://pypi.org/pypi/{match.group(1)}/json" if match else url


def status(url: str) -> int | str:
    """The HTTP status after redirects, or the error's name when there was no answer."""
    request = urllib.request.Request(probe_url(url), headers={"User-Agent": AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return type(error).__name__


def verdict(key: str, code: int | str) -> str:
    if code == 200:
        return "ok"
    if key == "pypi" and code == 404:
        return "unpublished"
    return "dead"


def check_all(links: dict[str, dict[str, str]]) -> list[tuple[str, str, str, int | str, str]]:
    """(owner, key, url, status, verdict) for every link of every owner, probed in parallel."""
    jobs = [(owner, key, url) for owner, table in links.items() for key, url in table.items()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        codes = list(pool.map(lambda job: status(job[2]), jobs))
    return [(owner, key, url, code, verdict(key, code)) for (owner, key, url), code in zip(jobs, codes)]
