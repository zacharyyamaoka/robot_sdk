"""Write `site/data/health.json` (schema `robot-sdk-health/1`, docs/site-data-schema.md): is each member passing?

    python -m tools.sdk_graph health [--graph PATH] [--out PATH]

One row per member (graph.json's packages in order, then its agents), five checks each: tests on main (GitHub Actions),
the declaration lint and the declared type uses (both from graph.json), robot-sdk's pin vs PyPI, and whether the GitHub
repo is public.

WHY a check never invents a pass (Zach, 2026-11-24: "you want to be able to see what is passing or not"): every source
that could not be read (no network, rate limit, a timeout, a bad answer) is `unknown` with the reason in `detail`, and
nothing here raises: a broken source costs one cell, never the file.
WHY stdlib only: tools/refresh runs this in CI with no install step (`packaging` is used when it happens to be there).
"""

from __future__ import annotations

import concurrent.futures
import datetime
import json
import os
import pathlib
import re
import subprocess
import tomllib
import urllib.error
import urllib.request
from collections.abc import Callable

from .graph import SDK, normalize

SCHEMA = "robot-sdk-health/1"
OUT = SDK / "site" / "data" / "health.json"
GRAPH = SDK / "site" / "data" / "graph.json"
TIMEOUT_S = 15
AGENT = "robot-sdk-health/1"
API = "https://api.github.com"

CHECKS = [
    {"id": "tests", "label": "Tests", "what": "the package's test workflow on main (GitHub Actions)"},
    {"id": "lint", "label": "Declaration", "what": "robot-sdk.toml matches the code (python -m tools.sdk_graph check)"},
    {"id": "types", "label": "Types", "what": "declared type uses are found in the code"},
    {"id": "release", "label": "Release", "what": "the version robot-sdk pins is published on PyPI"},
    {"id": "upstream", "label": "Repo", "what": "the GitHub repo is reachable"},
]
# A release version's health (versions/release/health.json) asks the same questions of each package at its tag.
RELEASE_CHECKS = [
    {"id": "tests", "label": "Tests", "what": "the package's test workflow at the tagged commit (GitHub Actions)"},
    {"id": "lint", "label": "Declaration", "what": "robot-sdk.toml at the tag matches the tagged code"},
    {"id": "types", "label": "Types", "what": "declared type uses at the tag are found in the tagged code"},
    {"id": "release", "label": "Release", "what": "the tagged version is published on PyPI"},
    {"id": "upstream", "label": "Repo", "what": "the GitHub repo is reachable"},
]
FAILED = {"failure", "timed_out", "cancelled", "startup_failure"}
RANK = {"fail": 3, "warn": 2, "pass": 1}  # unknown / none / running never raise a member's state


# --- reading the outside world (tests replace `fetch_json`) -------------------------------------------------------------


def github_token() -> str | None:
    """GITHUB_TOKEN / GH_TOKEN, then `gh auth token`, else None (unauthenticated: 60 requests an hour)."""
    for name in ("GITHUB_TOKEN", "GH_TOKEN"):
        if os.environ.get(name):
            return os.environ[name]
    try:
        done = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5, check=False)
        return done.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def fetch_json(url: str, token: str | None = None) -> tuple[int | None, object | None, str]:
    """(HTTP status or None, parsed body or None, reason). Never raises."""
    headers = {"User-Agent": AGENT, "Accept": "application/json"}
    if token and url.startswith(API):
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=TIMEOUT_S) as response:
            return response.status, json.loads(response.read().decode("utf-8")), "ok"
    except urllib.error.HTTPError as error:
        return error.code, None, f"HTTP {error.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return None, None, f"{type(error).__name__}: {getattr(error, 'reason', error)}"
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        return None, None, f"unreadable answer ({type(error).__name__})"


class Sources:
    """GitHub and PyPI answers, each URL fetched once."""

    def __init__(self, fetch: Callable[..., tuple] | None = None, token: str | None = None) -> None:
        self.fetch = fetch or fetch_json
        self.token = token
        self._cache: dict[str, tuple] = {}

    def get(self, url: str) -> tuple[int | None, object | None, str]:
        if url not in self._cache:
            try:
                self._cache[url] = self.fetch(url, self.token)
            except Exception as error:  # noqa: BLE001 — a fetcher bug costs a cell, never the file
                self._cache[url] = (None, None, f"{type(error).__name__}: {error}")
        return self._cache[url]


def slug(repo_url: str) -> str | None:
    match = re.match(r"https://github\.com/([^/]+/[^/#?]+)", repo_url or "")
    return match.group(1).removesuffix(".git") if match else None


def short(sha: str | None) -> str | None:
    return sha[:7] if sha else None


# --- the checks ----------------------------------------------------------------------------------------------------------


def upstream_check(member: dict, src: Sources) -> tuple[dict, dict | None]:
    """(the check, the repo's API record when it is public)."""
    if member.get("upstream") == "missing":
        return {"state": "fail", "detail": "pinned, but the GitHub repo is not reachable (kept from the last good graph)"}, None
    name = slug(member.get("repo_url", ""))
    if not name:
        return {"state": "unknown", "detail": f"repo_url {member.get('repo_url')!r} is not a GitHub repo"}, None
    code, body, reason = src.get(f"{API}/repos/{name}")
    if code == 404:
        return {"state": "fail", "detail": f"no public repo at github.com/{name} (404)", "url": f"https://github.com/{name}"}, None
    if code != 200 or not isinstance(body, dict):
        return {"state": "unknown", "detail": f"GitHub API: {reason}"}, None
    if body.get("private"):
        return {"state": "fail", "detail": f"github.com/{name} is private"}, None
    if body.get("archived"):
        return {"state": "warn", "detail": "public on GitHub, archived", "url": body.get("html_url")}, body
    return {"state": "pass", "detail": "public on GitHub", "url": body.get("html_url") or f"https://github.com/{name}"}, body


def find_test_workflow(name: str, src: Sources) -> tuple[str | None, str | None, str]:
    """(workflow id or file for the API, its file name, reason): test.yml, else any workflow named `test`."""
    code, body, reason = src.get(f"{API}/repos/{name}/actions/workflows?per_page=100")
    if code != 200 or not isinstance(body, dict):
        return None, None, f"GitHub API: {reason}"
    flows = body.get("workflows") or []
    for flow in flows:
        if flow.get("path", "").endswith("/test.yml"):
            return "test.yml", "test.yml", "ok"
    for flow in flows:
        if str(flow.get("name", "")).strip().lower() == "test":
            return str(flow.get("id")), flow.get("path", "").rsplit("/", 1)[-1], "ok"
    return None, None, "no test workflow"


def run_state(run: dict) -> str:
    if run.get("status") != "completed":
        return "running"
    conclusion = run.get("conclusion")
    if conclusion == "success":
        return "pass"
    if conclusion in FAILED:
        return "fail"
    return "warn"  # neutral / skipped / action_required / stale: it ran, but did not say pass


def tests_check(repo: dict | None, upstream: dict, src: Sources, at_sha: str | None = None, tag: str | None = None) -> dict:
    """The newest run of the test workflow on the default branch (or, for a release, at the tagged commit)."""
    if repo is None:
        return {"state": "unknown", "detail": f"CI not readable: {upstream['detail']}"}
    name = repo["full_name"]
    flow, file, reason = find_test_workflow(name, src)
    if flow is None:
        if reason == "no test workflow":
            return {"state": "none", "detail": "the repo has no test workflow", "url": f"https://github.com/{name}/actions"}
        return {"state": "unknown", "detail": f"CI not readable: {reason}"}
    branch = repo.get("default_branch") or "main"
    query = f"head_sha={at_sha}" if at_sha else f"branch={branch}"
    code, body, reason = src.get(f"{API}/repos/{name}/actions/workflows/{flow}/runs?{query}&per_page=1")
    if code != 200 or not isinstance(body, dict):
        return {"state": "unknown", "detail": f"CI not readable: GitHub API: {reason}", "workflow": file}
    runs = body.get("workflow_runs") or []
    if not runs:
        where = f"at {tag} ({short(at_sha)})" if at_sha else f"on {branch}"
        return {"state": "none", "detail": f"{file} has no run {where}", "workflow": file,
                "url": f"https://github.com/{name}/actions/workflows/{file}"}  # fmt: skip
    run = runs[0]
    state = run_state(run)
    where = f"at {tag}" if tag else f"on {branch}"
    verb = {"pass": "passed", "fail": "failed", "running": "is running"}.get(state, f"ended {run.get('conclusion')}")
    return {
        "state": state,
        "detail": f"{file} {verb} {where} {short(run.get('head_sha'))}",
        "url": run.get("html_url"),
        "workflow": file,
        "sha": short(run.get("head_sha")),
        "at": run.get("run_started_at") or run.get("created_at"),
    }


def lint_check(member: dict, failures: list[str] | None, repo: dict | None) -> dict:
    lint = member.get("lint")
    url = f"{repo['html_url']}/blob/{repo.get('default_branch') or 'main'}/robot-sdk.toml" if repo else None
    carried = " (from the last good graph)" if member.get("upstream") == "missing" else ""
    if lint == "pass":
        check = {"state": "pass", "detail": f"robot-sdk.toml matches the code{carried}", "failures": []}
    elif lint == "fail":
        failures = list(failures or [])
        first = f": {failures[0]}" if failures else "; python -m tools.sdk_graph check names the lines"
        check = {"state": "fail", "detail": f"robot-sdk.toml disagrees with the code{carried}{first}", "failures": failures}
    elif lint == "undeclared":
        check = {"state": "warn", "detail": "no robot-sdk.toml yet: its public API is not declared", "failures": []}
        url = None
    else:
        return {"state": "unknown", "detail": f"graph.json has no lint result ({lint!r})", "failures": []}
    if url:
        check["url"] = url
    return check


def types_check(package: str, uses: list[dict], defines: int) -> dict:
    mine = [u for u in uses if u["package"] == package]
    verified = sum(1 for u in mine if u["declared"] and u["verified"])
    found = sum(1 for u in mine if u["verified"] and not u["declared"])
    missing = [u for u in mine if u["declared"] and not u["verified"]]
    counts = {"verified": verified, "found": found, "missing": len(missing)}
    detail = f"{verified} declared + verified · {found} found, not declared · {len(missing)} missing"
    if not mine:
        what = f"defines {defines} shared types; uses none of them" if defines else "no type uses"
        return {"state": "none", "detail": what, **counts}
    if missing:
        first = missing[0]
        return {"state": "fail", "detail": f"{detail}: {first['symbol']} ({first['kind']} {first['type']}) not found",
                **counts, "where": first["where"]}  # fmt: skip
    if not verified:
        return {"state": "warn", "detail": f"{detail}: none of its type uses are declared", **counts}
    return {"state": "pass", "detail": detail, **counts}


class Version:
    """A small PEP 440 subset: release numbers only (a pre/dev/local version never satisfies a pin here)."""

    @staticmethod
    def parse(text: str) -> tuple[int, ...] | None:
        text = text.strip().lstrip("v")
        return tuple(int(p) for p in text.split(".")) if re.fullmatch(r"\d+(\.\d+)*", text) else None


def _cmp(a: tuple[int, ...], b: tuple[int, ...]) -> int:
    width = max(len(a), len(b))
    a, b = a + (0,) * (width - len(a)), b + (0,) * (width - len(b))
    return (a > b) - (a < b)


def satisfies_simple(version: str, spec: str) -> bool:
    """`version` meets every clause of `spec` (~=, ==, ==X.*, !=, >=, <=, >, <); False on anything it can't read."""
    have = Version.parse(version)
    if have is None:
        return False
    for clause in filter(None, (c.strip() for c in spec.split(","))):
        match = re.fullmatch(r"(~=|===|==|!=|>=|<=|>|<)\s*([0-9][0-9.]*)(\.\*)?", clause)
        if not match:
            return False
        op, text, star = match.groups()
        want = Version.parse(text.rstrip("."))
        if want is None:
            return False
        if op == "~=":
            if len(want) < 2 or _cmp(have, want) < 0 or have[: len(want) - 1] != want[:-1]:
                return False
        elif op in ("==", "===", "!="):
            equal = have[: len(want)] == want if star else _cmp(have, want) == 0
            if equal != (op != "!="):
                return False
        elif not {">=": lambda c: c >= 0, "<=": lambda c: c <= 0, ">": lambda c: c > 0, "<": lambda c: c < 0}[op](_cmp(have, want)):
            return False
    return True


def satisfies(version: str, spec: str) -> bool:
    try:
        from packaging.specifiers import InvalidSpecifier, SpecifierSet
        from packaging.version import InvalidVersion, Version as PVersion
    except ImportError:
        return satisfies_simple(version, spec)
    try:
        # WHY prereleases=False: what `pip install robot-sdk` takes by default, and what satisfies_simple does
        return SpecifierSet(spec).contains(PVersion(version), prereleases=False)
    except (InvalidSpecifier, InvalidVersion):
        return False


def split_requirement(requirement: str) -> tuple[str, str]:
    """("robot-msgs", "~=0.3.1") from "robot-msgs~=0.3.1" (extras and markers dropped)."""
    body = requirement.split(";", 1)[0].strip()
    name = re.split(r"[\s<>=~!\[(@]", body, maxsplit=1)[0]
    rest = re.sub(r"^\[[^\]]*\]", "", body[len(name):].strip()).strip().strip("()")
    return name, rest


def sdk_pins(sdk: pathlib.Path = SDK) -> dict[str, str]:
    """normalized PyPI name → the specifier robot_sdk's pyproject pins it to ('' = unpinned)."""
    meta = tomllib.loads((sdk / "pyproject.toml").read_text(encoding="utf-8"))
    return {normalize(name): spec for name, spec in map(split_requirement, meta["project"].get("dependencies", []))}


def pypi_releases(body: dict) -> list[str]:
    """Released versions with at least one file not yanked, oldest → newest by the order PyPI lists them."""
    return [v for v, files in (body.get("releases") or {}).items() if files and not all(f.get("yanked") for f in files)]


def release_check(pypi: str, pin: str | None, src: Sources, tagged: str | None = None) -> dict:
    """Live: is the pinned specifier satisfied by a PyPI release? Release: is the tagged version on PyPI?"""
    url = f"https://pypi.org/project/{pypi}/"
    code, body, reason = src.get(f"https://pypi.org/pypi/{pypi}/json")
    if tagged is not None:
        base = {"tag": f"v{tagged}", "url": url}
        if code == 404:
            return {"state": "warn", "detail": f"v{tagged} is tagged; {pypi} is not on PyPI yet", **base, "published": False}
        if code != 200 or not isinstance(body, dict):
            return {"state": "unknown", "detail": f"PyPI: {reason}", **base}
        on = tagged in pypi_releases(body)
        return {"state": "pass" if on else "warn", "published": on, **base,
                "detail": f"v{tagged} is on PyPI" if on else f"v{tagged} is tagged but not on PyPI"}  # fmt: skip
    if pin is None:
        return {"state": "none", "detail": "robot-sdk does not pin it", "url": url}
    shown = pin or "(any version)"
    if code == 404:
        return {"state": "warn", "detail": f"pins {shown}; not on PyPI yet", "pinned": pin, "pypi_latest": None,
                "satisfied": False, "url": url}  # fmt: skip
    if code != 200 or not isinstance(body, dict):
        return {"state": "unknown", "detail": f"pins {shown}; PyPI: {reason}", "pinned": pin, "url": url}
    released = pypi_releases(body)
    latest = (body.get("info") or {}).get("version") or (released[-1] if released else None)
    meets = [v for v in released if satisfies(v, pin)] if pin else released
    satisfied = bool(meets)
    detail = (f"pins {shown}; PyPI has {meets[-1]}" if satisfied else
              f"pins {shown}; PyPI has {latest}" if latest else f"pins {shown}; PyPI has no release files")  # fmt: skip
    return {"state": "pass" if satisfied else "warn", "detail": detail, "pinned": pin, "pypi_latest": latest,
            "satisfied": satisfied, "url": url}  # fmt: skip


def member_state(checks: dict) -> str:
    ranked = [RANK[c["state"]] for c in checks.values() if c["state"] in RANK]
    if not ranked:
        return "unknown"
    return {v: k for k, v in RANK.items()}[max(ranked)]


# --- the document --------------------------------------------------------------------------------------------------------


def now() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def build_health(
    graph: dict,
    pins: dict[str, str] | None = None,
    src: Sources | None = None,
    lint_failures: dict[str, list[str]] | None = None,
    tags: dict[str, dict] | None = None,
) -> dict:
    """The health document for `graph`. `tags` (package id → {"tag", "sha", "version"}) makes it a release's health:
    tests at the tagged commit, and the tagged version (not robot-sdk's pin) checked on PyPI."""
    src = src or Sources(token=github_token())
    pins = sdk_pins() if pins is None else pins
    lint_failures = lint_failures or {}
    uses = graph.get("uses", [])
    defines = {}
    for t in graph.get("types", []):
        defines[t["package"]] = defines.get(t["package"], 0) + 1

    def package_row(p: dict) -> dict:
        upstream, repo = upstream_check(p, src)
        tag = (tags or {}).get(p["id"])
        if tags is not None and tag:
            tests = tests_check(repo, upstream, src, at_sha=tag.get("full_sha") or tag.get("sha"), tag=tag["tag"])
            release = release_check(p["pypi"], None, src, tagged=tag["version"])
        else:
            tests = tests_check(repo, upstream, src)
            release = release_check(p["pypi"], pins.get(normalize(p["pypi"])), src)
        checks = {
            "tests": tests,
            "lint": lint_check(p, lint_failures.get(p["id"]), repo),
            "types": types_check(p["id"], uses, defines.get(p["id"], 0)),
            "release": release,
            "upstream": upstream,
        }
        return {"id": p["id"], "kind": "package", "state": member_state(checks), "checks": checks}

    def agent_row(a: dict) -> dict:
        upstream, repo = upstream_check(a, src)
        checks = {
            "tests": tests_check(repo, upstream, src),
            "lint": lint_check(a, lint_failures.get(a["id"]), repo),
            "types": {"state": "none", "detail": "an agent declares no types; it builds on packages"},
            "release": {"state": "none", "detail": "an agent is not released on PyPI"},
            "upstream": upstream,
        }
        return {"id": a["id"], "kind": "agent", "state": member_state(checks), "checks": checks}

    jobs = [(package_row, p) for p in graph.get("packages", [])] + [(agent_row, a) for a in graph.get("agents", [])]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        members = list(pool.map(lambda job: job[0](job[1]), jobs))
    summary = {"pass": 0, "warn": 0, "fail": 0, "unknown": 0}
    for member in members:
        summary[member["state"]] += 1
    return {
        "schema": SCHEMA,
        "generated": now(),
        "graph_generated": graph.get("generated"),
        "checks": RELEASE_CHECKS if tags is not None else CHECKS,
        "members": members,
        "summary": summary,
    }


def lint_failures_for(graph: dict) -> dict[str, list[str]]:
    """The failure lines of every member whose lint failed, re-run from the same checkouts the graph was built from
    (graph.json keeps only pass/fail). A member whose checkout moved since is left without lines, never mismatched."""
    failing = [m["id"] for m in graph.get("packages", []) + graph.get("agents", []) if m.get("lint") == "fail"]
    if not failing:
        return {}
    try:
        from .graph import build

        built = build()
    except Exception:  # noqa: BLE001 — the lines are a nicety; the fail state already stands
        return {}
    same = lambda m: built.graph["sources"].get(m) == graph.get("sources", {}).get(m)  # noqa: E731
    return {m: list(built.lints[m].failures) for m in failing if m in built.lints and same(m)}


def write(doc: dict, out: pathlib.Path = OUT) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main(graph_path: pathlib.Path = GRAPH, out: pathlib.Path = OUT) -> dict:
    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    doc = build_health(graph, lint_failures=lint_failures_for(graph))
    write(doc, out)
    return doc
