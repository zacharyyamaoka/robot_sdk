"""Fail if any package depends on a package in its own or a higher layer, or on a viewer from outside the viewers layer.

Reads each sibling checkout's pyproject.toml [project].dependencies.
"""
import pathlib
import re
import sys
import tomllib
from collections.abc import Callable

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from robot_sdk import LAYERS  # noqa: E402

# WHY viewers between comms and outer, and a sink (Zach, 2026-11-24: visualization packages "designed to work with
# robot_msgs ... should 100% be linked there"): a viewer reads robot_msgs types and may use leaves, but it is an end
# point; no library imports a viewer, so a view can change without moving any package beneath it.
RANK = {"vocabulary": 0, "models": 1, "leaf": 2, "comms": 2, "viewers": 3, "outer": 4, "checks": 5}
SINKS = {"viewers"}  # layers no package outside them may depend on, whatever its rank
# WHY a viewer may depend on another viewer (2026-11-25, the default taken for the directory sweep's open call (a)):
# Zach split robot_dashboards (stock use-case dashboards) from robot_msg_viz (one view per type) on purpose, and a
# dashboard composes the per-type views, so it needs them. Both stay end points, since nothing below the viewers layer
# imports either, so the sink's purpose holds; only a cycle between viewers is refused. Undo: drop SAME_LAYER_OK.
SAME_LAYER_OK = {"viewers"}
ROOT = pathlib.Path(__file__).resolve().parents[2]  # /home/bam
REPO_OF = {"robot_models": "robot_models"}  # import name == repo dir for all today


def normalize(requirement: str) -> str:
    name = re.split(r"[\s<>=~!\[;]", requirement, maxsplit=1)[0]
    name = name.lower().replace("-", "_")
    return {"robot_models_lib": "robot_models"}.get(name, name)


def pyproject_deps(package: str) -> list[str]:
    pyproject = ROOT / REPO_OF.get(package, package) / "pyproject.toml"
    return [normalize(d) for d in tomllib.loads(pyproject.read_text())["project"].get("dependencies", [])]


def cycle(edges: dict[str, list[str]]) -> list[str] | None:
    """One dependency cycle in `edges` (package -> its deps), as a closed path, or None."""
    state: dict[str, int] = {}  # 1 = on the current path, 2 = done

    def visit(node: str, path: list[str]) -> list[str] | None:
        state[node] = 1
        for nxt in edges.get(node, []):
            if state.get(nxt) == 1:
                return path[path.index(nxt):] + [nxt]
            if nxt not in state and (found := visit(nxt, path + [nxt])):
                return found
        state[node] = 2
        return None

    for start in edges:
        if start not in state and (found := visit(start, [start])):
            return found
    return None


def violations(layers: dict[str, str] | None = None,
               deps_of: Callable[[str], list[str]] = pyproject_deps) -> list[str]:
    layers = LAYERS if layers is None else layers
    found, same_layer = [], {}
    for package, layer in layers.items():
        for dep in deps_of(package):
            if dep not in layers or dep == package:
                continue
            if layer == layers[dep] and layer in SAME_LAYER_OK:
                same_layer.setdefault(package, []).append(dep)
            elif RANK[layers[dep]] >= RANK[layer] or layers[dep] in SINKS:
                found.append(f"{package} ({layer}) depends on {dep} ({layers[dep]})")
    if loop := cycle(same_layer):
        found.append("cycle between viewers: " + " -> ".join(loop))
    return found


if __name__ == "__main__":
    problems = violations()
    print("\n".join(problems) or "layers OK")
    sys.exit(1 if problems else 0)
