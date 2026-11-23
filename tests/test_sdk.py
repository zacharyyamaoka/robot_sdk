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
