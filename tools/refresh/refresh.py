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
"""

from __future__ import annotations

import json
import os
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


def listed_repos() -> list[str]:
    """Every sibling repo the directory scans: robot_sdk's uv sources (the pins + viewers) and README's agents table."""
    meta = tomllib.loads((SDK / "pyproject.toml").read_text(encoding="utf-8"))
    repos = [Path(s["path"]).name for s in meta.get("tool", {}).get("uv", {}).get("sources", {}).values() if "path" in s]
    readme = (SDK / "README.md").read_text(encoding="utf-8")
    repos += re.findall(r"^\|[^|]+\|\s*`\.\./([^`/]+)/?`", readme, flags=re.M)
    return list(dict.fromkeys(repos))


def clone(repos: list[str]) -> dict[str, str]:
    heads = {}
    for repo in repos:
        path = ROOT / repo
        if not path.exists():
            run("git", "clone", "--quiet", "--depth", "1", f"{OWNER}/{repo}.git", str(path), cwd=ROOT)
        heads[repo] = run("git", "-C", str(path), "rev-parse", "--short=7", "HEAD").stdout.strip()
    return heads


def content(graph: dict) -> dict:
    """What a reader learns from the graph: everything but when it was generated."""
    return {k: v for k, v in graph.items() if k != "generated"}


def published(path: str) -> bytes | None:
    done = run("git", "show", f"origin/{BRANCH}:{path}", check=False)
    return done.stdout.encode() if done.returncode == 0 else None


def main(argv: list[str]) -> int:
    heads = clone(listed_repos())
    print("cloned at main:", ", ".join(f"{r} {s}" for r, s in heads.items()))
    run(sys.executable, "-m", "tools.sdk_graph", "build")
    lint = run(sys.executable, "-m", "tools.sdk_graph", "check", check=False)
    print(lint.stdout, end="")
    run(sys.executable, "site/build.py")
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))

    run("git", "fetch", "--quiet", "origin", f"{BRANCH}:refs/remotes/origin/{BRANCH}", check=False)
    old = published("data/graph.json")
    out = BUILD / "data" / "graph.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if old is not None and content(json.loads(old)) == content(graph):
        out.write_bytes(old)  # same facts: keep the old bytes (and its `generated`) so an unchanged run commits nothing
    else:
        out.write_text(json.dumps(graph, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (BUILD / ".nojekyll").touch()

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [f"lint exit {lint.returncode}", *(f"- {r} `{s}`" for r, s in heads.items())]
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
