import importlib
import sys
import pathlib

import pytest

from robot_sdk import LAYERS

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
import check_layers  # noqa: E402


@pytest.mark.parametrize("package", sorted(LAYERS))
def test_every_package_imports(package):
    importlib.import_module(package)


SIBLINGS = check_layers.ROOT / "robot_msgs" / "pyproject.toml"
needs_checkouts = pytest.mark.skipif(not SIBLINGS.exists(), reason="layer check reads the sibling checkouts; skipped in CI")


@needs_checkouts
def test_layer_rule_holds():
    assert check_layers.violations() == []


@needs_checkouts
def test_layer_check_can_fail(monkeypatch):
    # A gate that can't go red proves nothing: move robot_msgs to the top and expect a violation.
    monkeypatch.setitem(check_layers.LAYERS, "robot_msgs", "outer")
    assert check_layers.violations()


# The viewer rule on synthetic packages (no checkouts needed): a dashboard viewer may build on a per-type viewer, a
# library may not depend on any viewer, and viewers may not depend on each other in a cycle.
VIEWER_LAYERS = {"msgs": "vocabulary", "leafy": "leaf", "per_type": "viewers", "dashboards": "viewers", "sim": "outer"}


def deps(table):
    return lambda package: table.get(package, [])


def test_a_viewer_may_depend_on_another_viewer():
    table = {"per_type": ["msgs"], "dashboards": ["per_type", "msgs"]}
    assert check_layers.violations(VIEWER_LAYERS, deps(table)) == []


def test_nothing_outside_the_viewers_layer_may_depend_on_a_viewer():
    for package in ("leafy", "sim"):
        problems = check_layers.violations(VIEWER_LAYERS, deps({package: ["per_type"]}))
        assert problems == [f"{package} ({VIEWER_LAYERS[package]}) depends on per_type (viewers)"]


def test_viewers_may_not_depend_on_each_other_in_a_cycle():
    problems = check_layers.violations(VIEWER_LAYERS, deps({"per_type": ["dashboards"], "dashboards": ["per_type"]}))
    assert len(problems) == 1 and problems[0].startswith("cycle between viewers: ")


def test_same_layer_dependencies_stay_refused_outside_viewers():
    assert check_layers.violations({"a": "leaf", "b": "leaf"}, deps({"a": ["b"]})) == ["a (leaf) depends on b (leaf)"]
