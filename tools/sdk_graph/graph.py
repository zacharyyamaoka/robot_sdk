"""Assemble `site/data/graph.json` (schema `robot-sdk-graph/1`, docs/graph-schema.md) from the sibling checkouts."""

from __future__ import annotations

import ast
import dataclasses
import datetime
import json
import pathlib
import re
import subprocess
import tomllib

from . import declaration as decl
from .scan import SHARED_TYPES, PackageScan, TypeIndex

SDK = pathlib.Path(__file__).resolve().parents[2]  # this robot_sdk checkout
ROOT = SDK.parent  # sibling checkouts live next to it: /home/bam/<repo>
OUT = SDK / "site" / "data" / "graph.json"
SCHEMA = "robot-sdk-graph/1"
GITHUB = "https://github.com/zacharyyamaoka"
# WHY listed here, not read from pyproject: a viewer is scanned like a package but is not one of the stack's pins.
VIEWERS = ("traj_compare",)
# The inputs a scan reads; a dirty file elsewhere in a checkout (a lockfile, a report) doesn't change the graph.
SCANNED = ("src", "pyproject.toml", decl.FILE, "status.json", "README.md")


def normalize(requirement: str) -> str:
    name = re.split(r"[\s<>=~!\[;@(]", requirement.strip(), maxsplit=1)[0]
    return name.lower().replace("-", "_").replace(".", "_")


def pyproject(repo: pathlib.Path) -> dict:
    return tomllib.loads((repo / "pyproject.toml").read_text(encoding="utf-8"))


def sdk_packages(root: pathlib.Path, sdk: pathlib.Path) -> list[str]:
    """Import names (== repo names) of robot_sdk's pins, in pin order, then the viewers."""
    by_pypi = {}
    for repo in sorted(p for p in root.iterdir() if (p / "pyproject.toml").exists()):
        try:
            by_pypi[normalize(pyproject(repo)["project"]["name"])] = repo.name
        except (KeyError, tomllib.TOMLDecodeError):
            continue
    ids = [by_pypi[normalize(d)] for d in pyproject(sdk)["project"]["dependencies"] if normalize(d) in by_pypi]
    return list(dict.fromkeys(ids + [v for v in VIEWERS if (root / v).exists()]))


def agent_rows(sdk: pathlib.Path) -> list[tuple[str, str, str]]:
    """(name, repo dir, objective) from README's agents table."""
    rows, in_table = [], False
    for line in (sdk / "README.md").read_text(encoding="utf-8").splitlines():
        if line.startswith("| Agent |"):
            in_table = True
            continue
        if in_table:
            if not line.startswith("|"):
                break
            cells = [c.strip() for c in line.strip("|").split("|")]
            if set(cells[0]) <= {"-", ":", " "}:
                continue
            repo = re.search(r"`\.\./([^`]+)`", cells[1])
            if repo:
                rows.append((cells[0], repo.group(1).strip("/"), cells[2]))
    return rows


def git_source(repo: pathlib.Path) -> str:
    def run(*args: str) -> str:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=False).stdout

    sha = run("rev-parse", "--short=7", "HEAD").strip() or "unknown"
    dirty = run("status", "--porcelain", "--", *SCANNED).strip()
    return f"{sha}-dirty" if dirty else sha


def deps_of(meta: dict, pypi_to_id: dict[str, str]) -> dict:
    project = meta["project"]
    pick = lambda reqs: list(dict.fromkeys(pypi_to_id[n] for n in map(normalize, reqs) if n in pypi_to_id))  # noqa: E731
    extras = {k: pick(v) for k, v in project.get("optional-dependencies", {}).items()}
    return {"required": pick(project.get("dependencies", [])), "extras": extras}


def repo_url(meta: dict, package: str) -> str:
    urls = {k.lower(): v for k, v in meta["project"].get("urls", {}).items()}
    url = urls.get("repository") or urls.get("source") or f"{GITHUB}/{package}"
    return url.removesuffix(".git").rstrip("/")


def sdk_layers(sdk: pathlib.Path) -> dict[str, str]:
    """robot_sdk's own LAYERS table (src/robot_sdk/__init__.py), read without importing it."""
    tree = ast.parse((sdk / "src" / "robot_sdk" / "__init__.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "LAYERS" for t in node.targets):
            return ast.literal_eval(node.value)
    return {}


@dataclasses.dataclass
class Built:
    graph: dict
    lints: dict[str, decl.Lint]


def build(root: pathlib.Path = ROOT, sdk: pathlib.Path = SDK, overrides: dict[str, pathlib.Path] | None = None) -> Built:
    """`overrides` maps a package id to a different checkout (the lint's mutation tests point one at a temp copy)."""
    overrides = overrides or {}
    repo_of = lambda pkg: overrides.get(pkg, root / pkg)  # noqa: E731
    ids = sdk_packages(root, sdk)
    metas = {pkg: pyproject(repo_of(pkg)) for pkg in ids}
    pypi_to_id = {normalize(m["project"]["name"]): pkg for pkg, m in metas.items()}
    index = TypeIndex(root)
    layers = sdk_layers(sdk)

    packages, uses, lints, sources = [], [], {}, {}
    for pkg in ids:
        repo, meta = repo_of(pkg), metas[pkg]
        sources[pkg] = git_source(repo)
        declared = decl.Declaration.read(repo)
        rows = [] if pkg in SHARED_TYPES else PackageScan(repo, pkg, index).rows()
        result = decl.lint(pkg, rows, declared)
        if declared and pkg in layers and declared.layer != layers[pkg]:
            result.failures.append(f"{decl.FILE}: layer {declared.layer!r} disagrees with robot_sdk's LAYERS "
                                   f"({layers[pkg]!r}, src/robot_sdk/__init__.py)")  # fmt: skip
            result.status = "fail"
        lints[pkg] = result
        role = (declared and declared.role) or ("viewer" if pkg in VIEWERS else "library")
        packages.append({
            "id": pkg,
            "pypi": meta["project"]["name"],
            "repo_url": repo_url(meta, pkg),
            "role": role,
            "layer": (declared and declared.layer) or layers.get(pkg) or ("viewers" if role == "viewer" else "leaf"),
            "one_line": (declared and declared.one_line) or meta["project"].get("description", ""),
            "version": meta["project"].get("version"),
            "deps": deps_of(meta, pypi_to_id),
            "declaration": decl.FILE if declared else None,
            "lint": result.status,
        })  # fmt: skip
        for use in rows:
            uses.append({
                "package": pkg, "type": use.type, "kind": use.kind, "symbol": use.symbol, "where": use.where,
                "public": use.public, "declared": (use.type, use.kind, use.symbol) in result.declared, "verified": True,
            })  # fmt: skip
        for use in result.missing:
            uses.append({
                "package": pkg, "type": use.type, "kind": use.kind, "symbol": use.symbol, "where": use.where,
                "public": True, "declared": True, "verified": False,
            })  # fmt: skip

    agents = []
    for name, folder, objective in agent_rows(sdk):
        repo = root / folder
        if not repo.exists():
            continue
        sources[folder] = git_source(repo)
        deps = deps_of(pyproject(repo), pypi_to_id)
        status_file = repo / "status.json"
        agents.append({
            "id": folder,
            "name": name,
            "repo_url": repo_url(pyproject(repo), folder),
            "objective": objective,
            "builds_on": list(dict.fromkeys(deps["required"] + [d for ex in deps["extras"].values() for d in ex])),
            "status": json.loads(status_file.read_text(encoding="utf-8")) if status_file.exists() else None,
        })  # fmt: skip

    order = {pkg: i for i, pkg in enumerate(ids)}
    kind_order = {"consumes": 0, "produces": 1, "imports": 2}
    uses.sort(key=lambda u: (order[u["package"]], u["type"], kind_order[u["kind"]], u["symbol"]))
    used = {u["type"] for u in uses}
    types = [
        {"id": t.id, "name": t.name, "package": t.package, "module": t.module, "what": t.what, "docs_url": t.docs_url}
        for t in sorted(index.types.values(), key=lambda t: t.id)
        if t.id in used
    ]
    unknown = sorted(used - {t["id"] for t in types})  # declared ids that name no shared type
    for type_id in unknown:
        for pkg, result in lints.items():
            if any(m.type == type_id for m in result.missing):
                result.failures.append(f"{decl.FILE}: {type_id} is not a shared type (no public class at that path)")
                result.status = "fail"
    types += [{"id": t, "name": t.rsplit(".", 1)[-1], "package": t.split(".")[0], "module": t.rsplit(".", 1)[0],
               "what": "", "docs_url": None} for t in unknown]  # fmt: skip
    sources = {"robot_sdk": git_source(sdk), **sources}
    graph = {
        "schema": SCHEMA,
        "generated": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "sources": sources,
        "packages": packages,
        "types": types,
        "uses": uses,
        "agents": agents,
    }
    return Built(graph, lints)


def write(built: Built, out: pathlib.Path = OUT) -> None:
    out.write_text(json.dumps(built.graph, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
