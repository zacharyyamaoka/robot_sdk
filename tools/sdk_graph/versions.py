"""Write `site/data/versions.json` (schema `robot-sdk-versions/1`, docs/site-data-schema.md) and the graphs it names.

    python -m tools.sdk_graph versions [--data DIR]

The site's version picker: Live (every repo at main: graph.json + health.json, the default), Latest release (each
package at its newest `v*` git tag, scanned from the tagged tree), and up to 12 snapshots (previous live directories
from the gh-pages branch history). `distributions` lists robot-sdk's own pin sets from the history of pyproject.toml.

WHY (Zach, 2026-11-24): "our pinned versions… just like ros… we want that to be first class… by default it can be
live. but then you can always go back to the latest stable or previous ones."
WHY the release graph is scanned from `git archive <tag>`, never the working tree: robot_msgs' types and every package's
declaration must be the tagged ones, or "Latest release" would show main's API under a release label.
WHY versions/ is not committed (.gitignore): it is generated output, rebuilt from git history on every refresh, and a
snapshot is already in gh-pages' history; only versions.json and health.json are tracked beside graph.json.
"""

from __future__ import annotations

import datetime
import io
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import tomllib

from . import health as health_doc
from .graph import ROOT, SDK, build, normalize, sdk_packages

SCHEMA = "robot-sdk-versions/1"
DATA = SDK / "site" / "data"
MAX_SNAPSHOTS = 12
PAGES = ("origin/gh-pages", "gh-pages")
# WHY a fixed zone for labels: the refresh runs in CI (UTC) and on Zach's machine; he reads the picker in Vancouver.
# The exact instant stays in `published` (UTC) for any reader that wants its own zone.
LABEL_TZ = "America/Vancouver"
TAG = re.compile(r"^v\d+(\.\d+)*$")


def git(repo: pathlib.Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=False)


def git_text(repo: pathlib.Path, *args: str) -> str:
    done = git(repo, *args)
    return done.stdout.decode("utf-8", "replace") if done.returncode == 0 else ""


def content(graph: dict) -> dict:
    """What a reader learns from a graph: everything but when it was generated (same rule as tools/refresh)."""
    return {k: v for k, v in graph.items() if k != "generated"}


def key_of(graph: dict) -> str:
    return json.dumps(content(graph), sort_keys=True, ensure_ascii=False)


def bare_sha(source: str | None) -> tuple[str | None, bool]:
    if not source:
        return None, False
    return source.removesuffix("-dirty"), source.endswith("-dirty")


def packages_of(graph: dict, ref: str) -> dict:
    out = {}
    for p in graph.get("packages", []):
        sha, dirty = bare_sha(graph.get("sources", {}).get(p["id"]))
        out[p["id"]] = {"version": p.get("version"), "ref": ref, "sha": sha, **({"dirty": True} if dirty else {})}
    return out


def label_time(when: datetime.datetime, seconds: bool = False) -> str:
    try:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            when = when.astimezone(ZoneInfo(LABEL_TZ))
        except ZoneInfoNotFoundError:
            when = when.astimezone(datetime.timezone.utc)
    except ImportError:
        when = when.astimezone(datetime.timezone.utc)
    return f"{when:%b} {when.day}, {when:%H:%M:%S}" if seconds else f"{when:%b} {when.day}, {when:%H:%M}"


def utc_z(when: datetime.datetime) -> str:
    return when.astimezone(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# --- live ----------------------------------------------------------------------------------------------------------------


def live_entry(graph: dict, has_health: bool) -> dict:
    return {
        "id": "live",
        "label": "Live",
        "kind": "live",
        "ref": "main",
        "summary": "every package at its main branch, refreshed hourly",
        "graph": "graph.json",
        "health": "health.json" if has_health else None,
        "generated": graph.get("generated"),
        "packages": packages_of(graph, "main"),
    }


# --- latest release ------------------------------------------------------------------------------------------------------


def newest_tag(repo: pathlib.Path) -> str | None:
    """The highest `v<digits>` tag (`archive/*` and other tags ignored)."""
    tags = [t for t in git_text(repo, "tag", "--list", "v*", "--sort=-v:refname").split() if TAG.match(t)]
    return tags[0] if tags else None


def extract(repo: pathlib.Path, ref: str, dest: pathlib.Path) -> None:
    """The tree at `ref`, written to `dest` (tar members filtered: no absolute paths, links out, or devices)."""
    done = git(repo, "archive", "--format=tar", ref)
    if done.returncode:
        raise RuntimeError(f"git archive {ref} in {repo.name}: {done.stderr.decode().strip()}")
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(done.stdout), mode="r:") as archive:
        archive.extractall(dest, filter="data")


def release(root: pathlib.Path = ROOT, sdk: pathlib.Path = SDK, src: health_doc.Sources | None = None) -> tuple[dict, dict, dict | None]:
    """(entry, graph, health or None) for each pinned package at its newest v* tag."""
    ids = sdk_packages(root, sdk)
    tagged: dict[str, dict] = {}
    with tempfile.TemporaryDirectory(prefix="robot-sdk-release-") as scratch:
        tree = pathlib.Path(scratch) / "root"
        tree.mkdir()
        for pkg in ids:
            tag = newest_tag(root / pkg)
            if not tag:
                continue
            full = git_text(root / pkg, "rev-list", "-n", "1", tag).strip()
            extract(root / pkg, tag, tree / pkg)
            tagged[pkg] = {"tag": tag, "sha": full[:7], "full_sha": full, "version": tag[1:]}
        # Only the tagged trees are under `tree` and only they are scanned (by folder, since a tag may predate the
        # pinned PyPI name): an untagged package is absent, and robot_msgs' types come from its tagged src
        # (TypeIndex(tree)). robot_sdk's own LAYERS stay live: robot-sdk itself has no release to read them from.
        built = build(root=tree, sdk=sdk, ids=[p for p in ids if p in tagged])
    graph = built.graph
    graph["sources"] = {"robot_sdk": graph["sources"].get("robot_sdk"), **{p: t["sha"] for p, t in tagged.items()}}
    graph["agents"] = []  # agents are never tagged releases
    for p in graph["packages"]:
        tagged[p["id"]]["version"] = p.get("version") or tagged[p["id"]]["version"]
    sdk_tag = newest_tag(sdk)
    itself = f"robot-sdk itself is at {sdk_tag}" if sdk_tag else "robot-sdk itself is not released yet"
    health = None
    try:
        failures = {p: list(r.failures) for p, r in built.lints.items() if r.status == "fail"}
        release_tags = {p: {**t, "version": t["tag"][1:]} for p, t in tagged.items()}
        health = health_doc.build_health(graph, src=src, lint_failures=failures, tags=release_tags)
    except Exception as error:  # noqa: BLE001 — no honest health is better than a crash: the UI says "not recorded"
        print(f"versions: release health not recorded ({type(error).__name__}: {error})", file=sys.stderr)
    entry = {
        "id": "release",
        "label": "Latest release",
        "kind": "release",
        "summary": f"each package at its newest v* tag: {len(tagged)} of {len(ids)} tagged; {itself}",
        "graph": "versions/release/graph.json",
        "health": "versions/release/health.json" if health else None,
        "generated": graph.get("generated"),
        "packages": {
            pkg: ({"version": tagged[pkg]["version"], "ref": tagged[pkg]["tag"], "sha": tagged[pkg]["sha"]}
                  if pkg in tagged else None)  # fmt: skip
            for pkg in ids
        },
    }
    return entry, graph, health


# --- snapshots (gh-pages history) ----------------------------------------------------------------------------------------


def pages_ref(sdk: pathlib.Path) -> str | None:
    for ref in PAGES:
        if git(sdk, "rev-parse", "-q", "--verify", f"{ref}^{{commit}}").returncode == 0:
            return ref
    return None


def snapshots(sdk: pathlib.Path, live: dict, limit: int = MAX_SNAPSHOTS) -> list[tuple[dict, bytes, bytes | None]]:
    """(entry, graph bytes, health bytes or None), newest first: one per distinct published graph (ignoring
    `generated`), skipping any identical to Live."""
    ref = pages_ref(sdk)
    if ref is None:
        print("versions: no gh-pages branch here (git fetch origin gh-pages); no snapshots", file=sys.stderr)
        return []
    seen = {key_of(live)}
    found = []
    for line in git_text(sdk, "log", "--format=%H%x09%cI%x09%s", ref, "--", "data/graph.json").splitlines():
        commit, when, subject = line.split("\t", 2)
        shown = git(sdk, "show", f"{commit}:data/graph.json")
        if shown.returncode:
            continue  # the commit deleted it
        try:
            graph = json.loads(shown.stdout)
        except json.JSONDecodeError:
            continue
        key = key_of(graph)
        if key in seen:
            continue
        seen.add(key)
        health = git(sdk, "show", f"{commit}:data/health.json")
        published = datetime.datetime.fromisoformat(when)
        match = re.search(r"built from main ([0-9a-f]{7,40})", subject)
        built_from = match.group(1) if match else bare_sha(graph.get("sources", {}).get("robot_sdk"))[0]
        sid = f"snap-{commit[:7]}"
        entry = {
            "id": sid,
            "label": label_time(published),
            "kind": "snapshot",
            "summary": f"the live directory as published from main {built_from}",
            "graph": f"versions/{sid}/graph.json",
            "health": f"versions/{sid}/health.json" if health.returncode == 0 else None,
            "generated": graph.get("generated"),
            "built_from": built_from,
            "published": utc_z(published),
            "packages": packages_of(graph, "main"),
        }
        found.append((entry, shown.stdout, health.stdout if health.returncode == 0 else None))
        if len(found) == limit:
            break
    labels = [e["label"] for e, _, _ in found]
    for entry, _, _ in found:  # two publishes in one minute: both get seconds, so no two picker rows read the same
        if labels.count(entry["label"]) > 1:
            entry["label"] = label_time(datetime.datetime.fromisoformat(entry["published"].replace("Z", "+00:00")), seconds=True)
    return found


# --- robot-sdk's own pin sets --------------------------------------------------------------------------------------------


def pin_set(text: str) -> tuple[str | None, dict[str, str]]:
    meta = tomllib.loads(text)
    project = meta.get("project", {})
    return project.get("version"), dict(map(health_doc.split_requirement, project.get("dependencies", [])))


def distributions(sdk: pathlib.Path = SDK) -> list[dict]:
    """One row per pin set robot-sdk has had (the commit that introduced it), newest first."""
    tags = set(git_text(sdk, "tag", "--list", "v*").split())
    rows = []
    for line in git_text(sdk, "log", "--format=%H%x09%cI%x09%s", "--", "pyproject.toml").splitlines():
        commit, date, subject = line.split("\t", 2)
        shown = git(sdk, "show", f"{commit}:pyproject.toml")
        if shown.returncode:
            continue
        try:
            version, pins = pin_set(shown.stdout.decode("utf-8"))
        except (tomllib.TOMLDecodeError, UnicodeDecodeError):
            continue
        rows.append({"version": version, "commit": commit[:7], "date": date, "subject": subject, "pins": pins})
    out = []
    for i, row in enumerate(rows):
        older = rows[i + 1] if i + 1 < len(rows) else None
        if older and older["version"] == row["version"] and older["pins"] == row["pins"]:
            continue  # pyproject changed, the pin set didn't
        before = {normalize(n): (n, s) for n, s in (older["pins"] if older else {}).items()}
        now = {normalize(n): (n, s) for n, s in row["pins"].items()}
        out.append({
            "version": row["version"],
            "released": f"v{row['version']}" in tags,
            "commit": row["commit"], "date": row["date"], "subject": row["subject"],
            "pins": row["pins"],
            "added": [now[k][0] for k in now if k not in before] if older else [],
            "removed": [before[k][0] for k in before if k not in now],
            "changed": {now[k][0]: {"from": before[k][1], "to": now[k][1]} for k in now
                        if k in before and before[k][1] != now[k][1]},
        })  # fmt: skip
    return out


# --- the document --------------------------------------------------------------------------------------------------------


def dump(doc: dict) -> str:
    return json.dumps(doc, indent=1, ensure_ascii=False) + "\n"


def main(data: pathlib.Path = DATA, root: pathlib.Path = ROOT, sdk: pathlib.Path = SDK) -> dict:
    graph = json.loads((data / "graph.json").read_text(encoding="utf-8"))
    has_health = (data / "health.json").exists()
    versions = [live_entry(graph, has_health)]
    files: dict[str, bytes] = {}
    try:
        entry, release_graph, release_health = release(root, sdk, health_doc.Sources(token=health_doc.github_token()))
        versions.append(entry)
        files[entry["graph"]] = dump(release_graph).encode("utf-8")
        if release_health:
            files[entry["health"]] = dump(release_health).encode("utf-8")
    except Exception as error:  # noqa: BLE001 — Live and the snapshots still ship
        print(f"versions: no Latest release entry ({type(error).__name__}: {error})", file=sys.stderr)
    for entry, graph_bytes, health_bytes in snapshots(sdk, graph):
        versions.append(entry)
        files[entry["graph"]] = graph_bytes
        if health_bytes is not None:
            files[entry["health"]] = health_bytes
    doc = {
        "schema": SCHEMA,
        "generated": health_doc.now(),
        "default": "live",
        "versions": versions,
        "distributions": distributions(sdk),
    }
    folder = data / "versions"
    if folder.exists():
        shutil.rmtree(folder)  # generated: a snapshot that aged out must not linger
    for rel, body in files.items():
        (data / rel).parent.mkdir(parents=True, exist_ok=True)
        (data / rel).write_bytes(body)
    (data / "versions.json").write_text(dump(doc), encoding="utf-8")
    return doc
