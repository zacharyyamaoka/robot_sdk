"""Publish site/_build/ to the gh-pages branch (GitHub Pages serves it) and push it.

    python3 site/build.py && python3 site/publish_pages.py

WHY a build artifact on its own branch (2026-11-18): the page is built where the recordings are, so CI cannot rebuild
it; its images and data stay out of main's history. The commit is made with a temporary index (never the shared one)
and never touches the working tree: one new commit on top of gh-pages, named after the main commit it was built from.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "site" / "_build"
BRANCH = "gh-pages"


def git(*args: str, env: dict | None = None) -> str:
    done = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, env=env)
    if done.returncode:
        raise SystemExit(f"git {' '.join(args)} failed: {done.stderr.strip()}")
    return done.stdout.strip()


def main() -> None:
    if not (BUILD / "index.html").is_file():
        raise SystemExit(f"nothing to publish: build it first ({BUILD / 'index.html'} is missing)")
    source = git("rev-parse", "--short", "HEAD")
    dirty = git("status", "--porcelain", "--", "site", "examples", "pyproject.toml")
    with tempfile.TemporaryDirectory() as scratch:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(scratch) / "index")}
        git("--work-tree", str(BUILD), "add", "--all", "--force", ".", env=env)
        tree = git("write-tree", env=env)
    # WHY fetch first (2026-11-24): the hourly refresh workflow also publishes gh-pages; building on a stale local branch
    # made every hand publish after it a rejected non-fast-forward push. Start from the remote tip when there is one.
    subprocess.run(["git", "-C", str(ROOT), "fetch", "-q", "origin", f"{BRANCH}:refs/remotes/origin/{BRANCH}"], capture_output=True)
    remote = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "-q", "--verify", f"refs/remotes/origin/{BRANCH}"],
                            capture_output=True, text=True).stdout.strip()
    if remote:
        git("update-ref", f"refs/heads/{BRANCH}", remote)
    parent = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "-q", "--verify", f"refs/heads/{BRANCH}"],
                            capture_output=True, text=True).stdout.strip()
    if parent and git("rev-parse", f"{parent}^{{tree}}") == tree:
        print(f"{BRANCH} already holds this build ({parent[:9]})")
    else:
        message = f"site: built from main {source}" + (" (with uncommitted changes)" if dirty else "")
        commit = git("commit-tree", tree, *(["-p", parent] if parent else []), "-m", message)
        git("update-ref", f"refs/heads/{BRANCH}", commit, *([parent] if parent else []))
        print(f"{BRANCH} -> {commit[:9]}: {message}")
    if "--no-push" not in sys.argv:
        print(git("push", "origin", f"{BRANCH}:{BRANCH}"))


if __name__ == "__main__":
    main()
