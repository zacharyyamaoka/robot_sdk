"""Fail if any package depends on a package in its own or a higher layer.

Reads each sibling checkout's pyproject.toml [project].dependencies.
"""
import pathlib
import re
import sys
import tomllib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from robot_sdk import LAYERS  # noqa: E402

RANK = {"vocabulary": 0, "models": 1, "leaf": 2, "comms": 2, "outer": 3}
ROOT = pathlib.Path(__file__).resolve().parents[2]  # /home/bam
REPO_OF = {"robot_models": "robot_models"}  # import name == repo dir for all today


def normalize(requirement: str) -> str:
    name = re.split(r"[\s<>=~!\[;]", requirement, maxsplit=1)[0]
    name = name.lower().replace("-", "_")
    return {"robot_models_lib": "robot_models"}.get(name, name)


def violations() -> list[str]:
    found = []
    for package, layer in LAYERS.items():
        pyproject = ROOT / REPO_OF.get(package, package) / "pyproject.toml"
        deps = tomllib.loads(pyproject.read_text())["project"].get("dependencies", [])
        for dep in map(normalize, deps):
            if dep in LAYERS and dep != package and RANK[LAYERS[dep]] >= RANK[layer]:
                found.append(f"{package} ({layer}) depends on {dep} ({LAYERS[dep]})")
    return found


if __name__ == "__main__":
    problems = violations()
    print("\n".join(problems) or "layers OK")
    sys.exit(1 if problems else 0)
