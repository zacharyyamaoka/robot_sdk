"""tools/sdk_graph: the scanner reads what the code says, and the declaration lint goes red when a robot-sdk.toml lies.

WHY mutation tests (a gate's first test is that it can fail): each red test edits a temp copy of a real package's
declaration or code and proves `check` names the file:line that broke.
"""

import json
import pathlib
import shutil
import sys
import textwrap

import pytest

SDK = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK))

from tools.sdk_graph import declaration as decl  # noqa: E402
from tools.sdk_graph import links as link_check  # noqa: E402
from tools.sdk_graph import readme  # noqa: E402
from tools.sdk_graph.graph import OUT, ROOT, SDK as SDK_ROOT, build, link_problems  # noqa: E402
from tools.sdk_graph.scan import PackageScan, TypeIndex  # noqa: E402

needs_checkouts = pytest.mark.skipif(
    not (ROOT / "robot_msgs" / "src").exists() or not (ROOT / "robot_controllers" / "src").exists(),
    reason="reads the sibling checkouts; skipped in CI",
)
pytestmark = needs_checkouts


@pytest.fixture(scope="module")
def index():
    return TypeIndex(ROOT)


@pytest.fixture
def controllers(tmp_path):
    """A temp copy of robot_controllers (code, pyproject, declaration) to break."""
    repo = tmp_path / "robot_controllers"
    shutil.copytree(ROOT / "robot_controllers" / "src", repo / "src", ignore=shutil.ignore_patterns("__pycache__", "*.so"))
    for name in ("pyproject.toml", decl.FILE):
        shutil.copy(ROOT / "robot_controllers" / name, repo / name)
    return repo


def lint_of(repo, index):
    return decl.lint("robot_controllers", PackageScan(repo, "robot_controllers", index).rows(), decl.Declaration.read(repo))


def test_real_declaration_passes(controllers, index):
    assert lint_of(controllers, index).status == "pass", lint_of(controllers, index).failures


def test_declared_symbol_the_code_lacks_goes_red(controllers, index):
    path = controllers / decl.FILE
    text = path.read_text()
    path.write_text(text.replace('"robot_controllers.core.Controller.tick",',
                                 '"robot_controllers.core.Controller.tick",\n  "robot_controllers.core.Controller.nope",', 1))
    result = lint_of(controllers, index)
    assert result.status == "fail"
    line = next(i for i, l in enumerate(path.read_text().splitlines(), 1) if "Controller.nope" in l)
    assert any(f.startswith(f"{decl.FILE}:{line}:") and "Controller.nope" in f for f in result.failures), result.failures
    assert [m.symbol for m in result.missing] == ["robot_controllers.core.Controller.nope"]


def test_omitted_public_type_goes_red(controllers, index):
    path = controllers / decl.FILE
    text = path.read_text()
    block = '[[consumes]]\ntype = "robot_msgs.sensor.JointState"\nsymbols = [\n  "robot_controllers.core.Controller.tick",\n]\n'
    assert block in text
    path.write_text(text.replace(block, ""))
    result = lint_of(controllers, index)
    assert result.status == "fail"
    assert any(f.startswith("src/robot_controllers/") and "robot_msgs.sensor.JointState" in f and "doesn't declare" in f
               for f in result.failures), result.failures  # fmt: skip


def test_wrong_direction_goes_red(controllers, index):
    path = controllers / decl.FILE
    text = path.read_text()
    path.write_text(text.replace('[[produces]]\ntype = "robot_msgs.control.ServoState"',
                                 '[[consumes]]\ntype = "robot_msgs.control.ServoState"'))
    result = lint_of(controllers, index)
    assert result.status == "fail"
    assert any("the code shows it produces" in f for f in result.failures), result.failures


def test_new_public_type_in_code_goes_red(controllers, index):
    # The code side of the lint: a new public function returning a robot_msgs type the declaration never mentions.
    core = controllers / "src" / "robot_controllers" / "core.py"
    core.write_text(core.read_text() + textwrap.dedent('''

        def latest_imu() -> "Imu":
            from robot_msgs.sensor import Imu
            return Imu()
        '''))
    core.write_text(core.read_text().replace("from __future__ import annotations",
                                             "from __future__ import annotations\nfrom robot_msgs.sensor import Imu", 1))
    result = lint_of(controllers, index)
    assert result.status == "fail"
    assert any(f.startswith("src/robot_controllers/core.py:") and "latest_imu" in f and "Imu" in f
               for f in result.failures), result.failures  # fmt: skip


def test_no_declaration_is_undeclared_never_pass(controllers, index):
    (controllers / decl.FILE).unlink()
    assert lint_of(controllers, index).status == "undeclared"


def test_empty_declaration_fails(controllers, index):
    (controllers / decl.FILE).write_text('schema = "robot-sdk-declaration/1"\n')
    result = lint_of(controllers, index)
    assert result.status == "fail"
    assert any("role must be" in f for f in result.failures)
    assert any("doesn't declare" in f for f in result.failures)


def test_check_through_the_graph_goes_red(controllers):
    # End to end: the same mutation seen by `build()`, which is what `python -m tools.sdk_graph check` runs.
    path = controllers / decl.FILE
    path.write_text(path.read_text().replace("core.Controller.tick", "core.Controller.tock"))
    built = build(overrides={"robot_controllers": controllers})
    assert built.lints["robot_controllers"].status == "fail"
    pkg = next(p for p in built.graph["packages"] if p["id"] == "robot_controllers")
    assert pkg["lint"] == "fail"
    rows = [u for u in built.graph["uses"] if u["package"] == "robot_controllers" and not u["verified"]]
    assert rows and all(u["declared"] and u["where"].startswith(decl.FILE + ":") for u in rows)
    assert all(r.status == "pass" for k, r in built.lints.items() if k != "robot_controllers")


# ------------------------------------------------------------------------------------------------ the scanner


def write_pkg(tmp_path, files):
    repo = tmp_path / "toy"
    for name, body in files.items():
        path = repo / "src" / "toy" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(body))
    return repo


def test_scanner_directions(tmp_path, index):
    repo = write_pkg(tmp_path, {
        "__init__.py": "from toy._impl import Runner\n__all__ = ['Runner']\n",
        "_impl.py": """
            from robot_msgs.trajectory import JointTrajectory
            from robot_msgs.sensor import JointState
            class Runner:
                def run(self, traj: JointTrajectory) -> "JointState | None": ...
            """,
        "plant.py": """
            from typing import Protocol
            from robot_msgs.control import ServoCommand
            from robot_msgs.sensor import JointState
            class Plant(Protocol):
                def tick(self, command: ServoCommand) -> JointState: ...
            """,
        "out.py": """
            from dataclasses import dataclass
            import robot_msgs.trajectory as rt
            @dataclass
            class Result:
                trajectory: rt.JointTrajectory
            def solve() -> Result: ...
            def _helper(x: rt.JointLimits): ...
            """,
    })  # fmt: skip
    rows = {(u.type.removeprefix("robot_msgs."), u.kind, u.symbol, u.public) for u in PackageScan(repo, "toy", index).rows()}
    assert ("trajectory.JointTrajectory", "consumes", "toy.Runner.run", True) in rows  # re-exported out of a private module
    assert ("sensor.JointState", "produces", "toy.Runner.run", True) in rows  # string annotation, union
    # A Protocol nobody in the package implements: the package hands it commands and takes back states.
    assert ("control.ServoCommand", "produces", "toy.plant.Plant.tick", True) in rows
    assert ("sensor.JointState", "consumes", "toy.plant.Plant.tick", True) in rows
    assert ("trajectory.JointTrajectory", "produces", "toy.out.Result.trajectory", True) in rows  # an output's field
    assert ("trajectory.JointLimits", "imports", "toy.out", False) in rows  # only a private helper names it


def test_type_index_canonical_ids(index):
    jt = index.types["robot_msgs.trajectory.JointTrajectory"]
    assert jt.docs_url == "https://robotmsgs.com/types/trajectory/JointTrajectory/"
    assert index.type_of("robot_msgs.trajectory.joint_trajectory.JointTrajectory") == jt.id
    assert jt.what


# ------------------------------------------------------------------------------------------------ the committed file


def test_committed_graph_matches_the_schema():
    graph = json.loads(OUT.read_text())
    assert graph["schema"] == "robot-sdk-graph/1"
    assert set(graph) == {"schema", "generated", "sources", "packages", "types", "uses", "agents"}
    ids = {p["id"] for p in graph["packages"]}
    types = {t["id"] for t in graph["types"]}
    for p in graph["packages"]:
        # graph/1 fields, plus the additive ones of 2026-11-24 (summary, use_when, links from each robot-sdk.toml)
        assert set(p) == {"id", "pypi", "repo_url", "role", "layer", "one_line", "version", "deps", "declaration", "lint",
                          "summary", "use_when", "links"}  # fmt: skip
        assert p["role"] in decl.ROLES and p["layer"] in decl.LAYERS and p["lint"] in {"pass", "fail", "undeclared"}
        assert set(p["deps"]["required"]) <= ids
        assert {"github", "pypi"} <= set(p["links"]) and all(decl.well_formed(u) for u in p["links"].values())
        assert p["links"]["github"] == p["repo_url"]
    for t in graph["types"]:
        assert set(t) == {"id", "name", "package", "module", "what", "docs_url"}
    keys = set()
    for u in graph["uses"]:
        assert set(u) == {"package", "type", "kind", "symbol", "where", "public", "declared", "verified"}
        assert u["package"] in ids and u["type"] in types and u["kind"] in {"consumes", "produces", "imports"}
        assert ":" in u["where"]
        key = (u["package"], u["type"], u["kind"], u["symbol"])
        assert key not in keys
        keys.add(key)
    for a in graph["agents"]:
        assert set(a) == {"id", "name", "repo_url", "objective", "builds_on", "status",
                          "one_line", "summary", "links", "declaration", "lint"}  # fmt: skip
        assert set(a["builds_on"]) <= ids and a["id"] not in ids
        assert a["declaration"] == decl.FILE and "github" in a["links"]
    # WHY a subset, not equality: agents join by declaring themselves (role = "agent"), so the list grows without robot_sdk changing
    assert "trajectory_tracking_agent" in [a["id"] for a in graph["agents"]]  # found by its own declaration


# ------------------------------------------------------------------------------------------------ links (2026-11-24)
# WHY: a link is a claim the code can't fully check, so it is at least validated: present, well formed, the repo's own.


def test_missing_pypi_link_goes_red(controllers, index):
    path = controllers / decl.FILE
    text = path.read_text()
    assert 'pypi = "https://pypi.org/project/robot-controllers/"\n' in text
    path.write_text(text.replace('pypi = "https://pypi.org/project/robot-controllers/"\n', ""))
    result = lint_of(controllers, index)
    assert result.status == "fail"
    line = next(i for i, l in enumerate(path.read_text().splitlines(), 1) if l.strip() == "[links]")
    assert any(f.startswith(f"{decl.FILE}:{line}:") and "needs pypi" in f for f in result.failures), result.failures


def test_malformed_link_goes_red(controllers, index):
    path = controllers / decl.FILE
    path.write_text(path.read_text().replace('site = "https://', 'site = "http//', 1))
    result = lint_of(controllers, index)
    assert result.status == "fail" and any("links.site is not an https URL" in f for f in result.failures)


def test_link_to_another_repo_goes_red(controllers):
    path = controllers / decl.FILE
    path.write_text(path.read_text().replace('github = "https://github.com/zacharyyamaoka/robot_controllers"',
                                             'github = "https://github.com/zacharyyamaoka/robot_reach"'))
    built = build(overrides={"robot_controllers": controllers})
    failures = built.lints["robot_controllers"].failures
    assert built.lints["robot_controllers"].status == "fail"
    assert any("links.github" in f and "pyproject.toml makes it" in f for f in failures), failures


def test_pypi_link_must_name_the_pyproject_project(controllers):
    path = controllers / decl.FILE
    path.write_text(path.read_text().replace("pypi.org/project/robot-controllers/", "pypi.org/project/robot-control/"))
    built = build(overrides={"robot_controllers": controllers})
    assert any("links.pypi" in f for f in built.lints["robot_controllers"].failures)


def test_pypi_probe_uses_the_json_api():
    # pypi.org/project/<name>/ answers 200 (a bot challenge) for any name, so the HTML page proves nothing.
    assert link_check.probe_url("https://pypi.org/project/robot-msgs/") == "https://pypi.org/pypi/robot-msgs/json"
    assert link_check.probe_url("https://robotmsgs.com") == "https://robotmsgs.com"
    assert link_check.verdict("pypi", 404) == "unpublished" and link_check.verdict("site", 404) == "dead"


@pytest.mark.network
def test_every_declared_link_resolves():
    graph = json.loads(OUT.read_text())
    owners = {p["id"]: p["links"] for p in graph["packages"]} | {a["id"]: a["links"] for a in graph["agents"]}
    rows = link_check.check_all(owners)
    dead = [(owner, key, url, code) for owner, key, url, code, verdict in rows if verdict == "dead"]
    assert not dead, dead
    assert any(key == "pypi" and verdict == "ok" for _, key, _, _, verdict in rows)  # the probe can say yes
    assert link_check.verdict("pypi", link_check.status("https://pypi.org/project/no-such-robot-sdk-pkg-zz/")) == "unpublished"


# ------------------------------------------------------------------------------------------------ agents (2026-11-24)


@pytest.fixture
def agent(tmp_path):
    repo = tmp_path / "trajectory_tracking_agent"
    repo.mkdir()
    for name in ("pyproject.toml", decl.FILE, "status.json"):
        shutil.copy(ROOT / "trajectory_tracking_agent" / name, repo / name)
    return repo


def test_agent_builds_on_must_match_its_pyproject(agent):
    path = agent / decl.FILE
    path.write_text(path.read_text().replace('builds_on = ["robot_msgs", "robot_controllers"]', 'builds_on = ["robot_msgs"]'))
    built = build(overrides={"trajectory_tracking_agent": agent})
    result = built.lints["trajectory_tracking_agent"]
    assert result.status == "fail" and any("builds_on" in f for f in result.failures), result.failures
    assert next(a for a in built.graph["agents"] if a["id"] == "trajectory_tracking_agent")["lint"] == "fail"


def test_agent_without_objective_goes_red(agent):
    path = agent / decl.FILE
    path.write_text("\n".join(l for l in path.read_text().splitlines() if not l.startswith("objective")) + "\n")
    built = build(overrides={"trajectory_tracking_agent": agent})
    assert any("needs objective" in f for f in built.lints["trajectory_tracking_agent"].failures)


# ------------------------------------------------------------------------------------------------ generated README


def test_readme_and_skill_tables_match_graph():
    graph = json.loads(OUT.read_text())
    assert readme.stale(SDK_ROOT, graph) == [], "run `python -m tools.sdk_graph readme`"


def test_stale_readme_goes_red():
    graph = json.loads(OUT.read_text())
    graph["packages"][0]["one_line"] = "something the README doesn't say"
    graph["packages"][0]["summary"] = "something the skill doesn't say"
    assert readme.stale(SDK_ROOT, graph) == ["README.md", "skill/SKILL.md"]
    graph = json.loads(OUT.read_text())
    graph["agents"][0]["objective"] = "a different objective"
    assert readme.stale(SDK_ROOT, graph) == ["README.md"]
