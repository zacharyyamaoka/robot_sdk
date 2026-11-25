"""Refresh the published directory: clone every listed repo at main, regenerate graph.json, lint, rebuild the site,
and publish it to gh-pages when anything changed. Solution 0 of the robot-sdk agent (github.com/zacharyyamaoka/robot_sdk_agent).

    python3 tools/refresh/refresh.py              # clone siblings, build, lint, rebuild site/_build (no publish)
    python3 tools/refresh/refresh.py --publish    # ... and commit site/_build to gh-pages + push, if it changed

Run by .github/workflows/refresh-directory.yml (hourly + on demand). Locally, run it from a FRESH clone of robot_sdk in an
empty directory: it clones the siblings next to it, and a sibling that already exists (your own, maybe dirty, checkout)
is used as is, which the graph then records as `<sha>-dirty`.

WHY gh-pages, never main (2026-11-24): other lanes own site/data/graph.json on main and are editing it now; a bot
committing generated JSON there would collide with their rebases. The published graph lives at the live site's
data/graph.json, next to the page built from the same main commit.
WHY stdlib only: the scanner is ast-only (never imports a package), so CI needs no install step.
WHY health.json and versions.json ride along (2026-11-24, docs/site-data-schema.md): the site's Health workspace and
version picker read them beside graph.json. They are built from the published graph (so a carried-over package shows
its missing upstream), and a failure in either is logged and that file left out: it never stops the publish.
"""

from __future__ import annotations

import json
import os
import shutil
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
import re
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

SDK = Path(__file__).resolve().parents[2]
ROOT = SDK.parent
OWNER = "https://github.com/zacharyyamaoka"
BUILD = SDK / "site" / "_build"
GRAPH = SDK / "site" / "data" / "graph.json"
BRANCH = "gh-pages"


def run(*args: str, cwd: Path = SDK, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    done = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, env=env)
    if check and done.returncode:
        raise SystemExit(f"{' '.join(args)} failed ({done.returncode}): {done.stderr.strip() or done.stdout.strip()}")
    return done


def pinned_repos() -> list[str]:
    """The packages: robot_sdk's uv sources (one per pin, viewers included)."""
    meta = tomllib.loads((SDK / "pyproject.toml").read_text(encoding="utf-8"))
    return [Path(s["path"]).name for s in meta.get("tool", {}).get("uv", {}).get("sources", {}).values() if "path" in s]


def _get(url: str) -> bytes | None:
    headers = {"User-Agent": "robot-sdk-refresh"}
    token = os.environ.get("GITHUB_TOKEN")
    if token and url.startswith("https://api.github.com/"):
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
            return response.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def agent_repos() -> list[str]:
    """The agents: the owner's public repos whose own robot-sdk.toml says role = "agent". WHY discovered on GitHub:
    tools.sdk_graph finds agents among sibling checkouts (robot_sdk keeps no list of them), so CI must clone them first."""
    repos, page = [], 1
    while True:
        body = _get(f"https://api.github.com/users/{OWNER.rsplit('/', 1)[1]}/repos?type=owner&per_page=100&page={page}")
        if body is None:  # the API is down or rate-limited: fall back to the agents the last good graph names
            print("could not list the owner's repos; agents from the last good graph instead", file=sys.stderr)
            return fallback_agents()
        batch = json.loads(body)
        repos += [r for r in batch if not r.get("fork") and not r.get("archived") and not r.get("private")]
        if len(batch) < 100:
            break
        page += 1

    def role(repo: dict) -> str | None:
        body = _get(f"https://raw.githubusercontent.com/{OWNER.rsplit('/', 1)[1]}/{repo['name']}/{repo['default_branch']}/robot-sdk.toml")
        try:
            return tomllib.loads(body.decode("utf-8")).get("role") if body else None
        except (tomllib.TOMLDecodeError, UnicodeDecodeError):
            return None

    with ThreadPoolExecutor(16) as pool:
        roles = list(pool.map(role, repos))
    return sorted(r["name"] for r, found in zip(repos, roles) if found == "agent")


def fallback_agents() -> list[str]:
    try:
        return [a["id"] for a in json.loads(GRAPH.read_text(encoding="utf-8")).get("agents", [])]
    except (OSError, json.JSONDecodeError, KeyError):
        return []


def listed_repos() -> list[str]:
    return list(dict.fromkeys(pinned_repos() + agent_repos()))


def clone(repos: list[str]) -> tuple[dict[str, str], list[str]]:
    """Clone each repo at main; one that can't be cloned (not on GitHub yet, or private) is a missing upstream."""
    heads, missing = {}, []
    for repo in repos:
        path = ROOT / repo
        if not path.exists():
            done = run("git", "clone", "--quiet", "--depth", "1", f"{OWNER}/{repo}.git", str(path), cwd=ROOT, check=False,
                       env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})  # a missing repo must fail, never prompt
            if done.returncode:
                missing.append(repo)
                continue
            # WHY: a depth-1 clone carries no tags, and versions.json's Latest release reads each repo's newest v* tag.
            run("git", "-C", str(path), "fetch", "--quiet", "--depth", "1", "origin", "+refs/tags/v*:refs/tags/v*",
                cwd=ROOT, check=False, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
        heads[repo] = run("git", "-C", str(path), "rev-parse", "--short=7", "HEAD").stdout.strip()
    return heads, missing


def carry_over(graph: dict, last_good: dict | None, missing: list[str]) -> list[str]:
    """Keep each pinned package whose repo can't be cloned from the last good graph, marked `upstream: "missing"`.
    WHY (coordinator, 2026-11-24): a package can be pinned before its first public push (Zach's call); the directory
    keeps listing it, says so, and the run stays green. Returns the ids it carried."""
    if not last_good:
        return []
    have = {p["id"] for p in graph["packages"]}
    types = {t["id"] for t in graph["types"]}
    carried = []
    for package in last_good.get("packages", []):
        if package["id"] in missing and package["id"] not in have:
            graph["packages"].append({**package, "upstream": "missing"})
            graph["uses"] += [u for u in last_good.get("uses", []) if u["package"] == package["id"]]
            used = {u["type"] for u in last_good.get("uses", []) if u["package"] == package["id"]}
            graph["types"] += [t for t in last_good.get("types", []) if t["id"] in used - types]
            types |= used
            if package["id"] in last_good.get("sources", {}):
                graph["sources"][package["id"]] = last_good["sources"][package["id"]]
            carried.append(package["id"])
    return carried


def content(graph: dict) -> dict:
    """What a reader learns from the graph: everything but when it was generated."""
    return {k: v for k, v in graph.items() if k != "generated"}


STAMPS = ("generated", "graph_generated")


def facts(value):
    """A data file minus every timestamp of when it was built, at any depth (health.json, versions.json, versions/**)."""
    if isinstance(value, dict):
        return {k: facts(v) for k, v in value.items() if k not in STAMPS}
    if isinstance(value, list):
        return [facts(v) for v in value]
    return value


def keep_published_bytes(out: Path) -> None:
    """Same facts as the published copy: keep its bytes, so an unchanged run commits nothing."""
    rel = out.relative_to(BUILD).as_posix()
    old = published(rel)
    if old is None:
        return
    try:
        if facts(json.loads(old)) == facts(json.loads(out.read_text(encoding="utf-8"))):
            out.write_bytes(old)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        return


def full_history() -> None:
    """versions.json reads robot_sdk's pyproject history and gh-pages' history; CI's checkout is depth 1."""
    if run("git", "rev-parse", "--is-shallow-repository", check=False).stdout.strip() == "true":
        done = run("git", "fetch", "--quiet", "--unshallow", "origin", check=False)
        if done.returncode:
            print(f"could not unshallow robot_sdk: {done.stderr.strip()}; distributions list only what is here", file=sys.stderr)


def last_line(done: subprocess.CompletedProcess) -> str:
    return ((done.stderr or done.stdout).strip().splitlines() or [f"exit {done.returncode}"])[-1]


def site_data(data: Path) -> list[str]:
    """health.json, then versions.json + versions/ (which names health.json), into the built data folder. A failure is
    logged and its file left out, so the publish still goes out with graph.json. Returns summary lines."""
    lines = []
    health = run(sys.executable, "-m", "tools.sdk_graph", "health", "--graph", str(data / "graph.json"),
                 "--out", str(data / "health.json"), check=False)  # fmt: skip
    if health.returncode:
        (data / "health.json").unlink(missing_ok=True)  # never ship a stale copy (publish_dashboard copied site/data's)
        lines.append(f"health.json left out: {last_line(health)}")
    else:
        lines.append(health.stdout.splitlines()[0].replace(str(SDK) + "/", ""))
    versions = run(sys.executable, "-m", "tools.sdk_graph", "versions", "--data", str(data), check=False)
    if versions.returncode:
        (data / "versions.json").unlink(missing_ok=True)
        shutil.rmtree(data / "versions", ignore_errors=True)
        lines.append(f"versions.json left out: {last_line(versions)}")
    else:
        lines.append(versions.stdout.splitlines()[0].replace(str(SDK) + "/", ""))
        if versions.stderr.strip():
            lines += [f"  {line}" for line in versions.stderr.strip().splitlines()]
    for out in sorted([data / "health.json", data / "versions.json", *(data / "versions").rglob("*.json")]):
        if out.exists():
            keep_published_bytes(out)
    return lines


def published(path: str) -> bytes | None:
    done = run("git", "show", f"origin/{BRANCH}:{path}", check=False)
    return done.stdout.encode() if done.returncode == 0 else None


def main(argv: list[str]) -> int:
    heads, missing = clone(listed_repos())
    print("cloned at main:", ", ".join(f"{r} {s}" for r, s in heads.items()))
    # The last good graph: main's committed one (built by a lane from its own checkouts), read before build overwrites it.
    last_good = json.loads(GRAPH.read_text(encoding="utf-8")) if GRAPH.exists() else None
    run(sys.executable, "-m", "tools.sdk_graph", "build")
    lint = run(sys.executable, "-m", "tools.sdk_graph", "check", check=False)
    print(lint.stdout, end="")
    # The live page: the chosen dashboard (reads data/graph.json at runtime) when main has its publisher, else the old page.
    builder = "site/publish_dashboard.py" if (SDK / "site" / "publish_dashboard.py").exists() else "site/build.py"
    run(sys.executable, builder)
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))
    carried = carry_over(graph, last_good, missing)

    full_history()
    run("git", "fetch", "--quiet", "origin", f"+{BRANCH}:refs/remotes/origin/{BRANCH}", check=False)
    old = published("data/graph.json")
    out = BUILD / "data" / "graph.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if old is not None and content(json.loads(old)) == content(graph):
        out.write_bytes(old)  # same facts: keep the old bytes (and its `generated`) so an unchanged run commits nothing
    else:
        out.write_text(json.dumps(graph, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (BUILD / ".nojekyll").touch()
    data_lines = site_data(out.parent)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [f"lint exit {lint.returncode}", *data_lines, *(f"- {r} `{s}`" for r, s in heads.items())]
    lines += [f"- {r}: missing upstream (no public repo to clone); "
              + ("kept from the last good graph" if r in carried else "not in the last good graph either") for r in missing]
    if "--publish" in argv:
        lines.insert(0, publish(graph["sources"].get("robot_sdk", "?")))
    if summary:
        Path(summary).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    # WHY red on a lint failure, after publishing: the published graph still carries each package's lint status,
    # so readers see the truth either way; the red run is the alarm.
    return lint.returncode


def publish(source: str) -> str:
    parent = run("git", "rev-parse", "-q", "--verify", f"refs/remotes/origin/{BRANCH}", check=False).stdout.strip()
    with tempfile.TemporaryDirectory() as scratch:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(scratch) / "index")}
        run("git", "--work-tree", str(BUILD), "add", "--all", "--force", ".", env=env)
        tree = run("git", "write-tree", env=env).stdout.strip()
    if parent and run("git", "rev-parse", f"{parent}^{{tree}}").stdout.strip() == tree:
        return f"unchanged: {BRANCH} already holds this build ({parent[:9]})"
    message = f"site: built from main {source} with data/graph.json (tools/refresh)"
    commit = run("git", "commit-tree", tree, *(["-p", parent] if parent else []), "-m", message).stdout.strip()
    run("git", "push", "origin", f"{commit}:refs/heads/{BRANCH}")
    return f"published: {BRANCH} -> {commit[:9]} ({message})"


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
