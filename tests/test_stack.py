import importlib
import sys
import pathlib

import pytest

from robot_stack import LAYERS

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
import check_layers  # noqa: E402


@pytest.mark.parametrize("package", sorted(LAYERS))
def test_every_package_imports(package):
    importlib.import_module(package)


def test_layer_rule_holds():
    assert check_layers.violations() == []


def test_layer_check_can_fail(monkeypatch):
    # A gate that can't go red proves nothing: move robot_msgs to the top and expect a violation.
    monkeypatch.setitem(check_layers.LAYERS, "robot_msgs", "outer")
    assert check_layers.violations()
