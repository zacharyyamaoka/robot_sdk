"""tools/sdk_graph/languages.py: which languages a package ships, read from its files, never typed by hand.

WHY (Zach, 2026-11-25, Daily Note): "In the robot SDK landing page now on each package you can also like support
lanuagues, py, cpp". Every fixture is a temp repo in mjbots moteus's layout (cpp/, python/, rust/ in one repo) or the
src-tree layout robot_controllers uses today; a language is listed only where a file proves it.
"""

import json
import pathlib
import subprocess
import sys
import textwrap

import pytest

SDK = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK))

from tools.sdk_graph import languages  # noqa: E402
from tools.sdk_graph.graph import OUT, ROOT, build  # noqa: E402


def repo_with(tmp_path, files: dict[str, str], name: str = "toy") -> pathlib.Path:
    repo = tmp_path / name
    for path, body in files.items():
        target = repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(textwrap.dedent(body))
    return repo


PY = {"src/toy/__init__.py": "", "src/toy/core.py": "def run(): ...\n", "src/toy/tests/test_x.py": ""}


def by_id(found: list[dict]) -> dict[str, dict]:
    return {entry["id"]: entry for entry in found}


def test_python_only_package_lists_python_alone(tmp_path):
    found = languages.detect(repo_with(tmp_path, PY), "toy")
    # a test module inside the package is not package source (the scanner skips it too)
    assert found == [{"id": "python", "status": "full", "where": "src/toy", "evidence": "2 modules"}]


def test_moteus_layout_cpp_folder_with_headers_is_cpp(tmp_path):
    repo = repo_with(tmp_path, {**PY, "cpp/include/toy/lk.hpp": "", "cpp/include/toy/abi.h": "", "cpp/include/toy/msgs/std.hpp": "",
                                "cpp/src/rt.cpp": "", "cpp/CMakeLists.txt": ""})  # fmt: skip
    cpp = by_id(languages.detect(repo, "toy"))["cpp"]
    assert cpp == {"id": "cpp", "status": "partial", "where": "cpp", "evidence": "3 headers: abi, lk, msgs/std"}


def test_cpp_inside_the_src_tree_names_what_it_ports(tmp_path):
    # robot_controllers today: one controller's law in C++ under controllers/cpp/, pinned by a parity test
    repo = repo_with(tmp_path, {
        **PY,
        "src/toy/controllers/__init__.py": "",
        "src/toy/controllers/cpp/include/toy/joint_trajectory_controller.hpp": "",
        "src/toy/controllers/cpp/jtc_capi.cpp": "",
        "src/toy/controllers/cpp/CMakeLists.txt": "",
        "tests/test_cpp_parity.py": "def test_same(): ...\n",
    })  # fmt: skip
    cpp = by_id(languages.detect(repo, "toy"))["cpp"]
    assert cpp["status"] == "partial" and cpp["where"] == "src/toy/controllers/cpp"
    assert cpp["evidence"] == "1 controller: joint_trajectory_controller · parity test tests/test_cpp_parity.py"


def test_order_is_python_cpp_rust(tmp_path):
    repo = repo_with(tmp_path, {**PY, "cpp/include/toy/a.hpp": "", "rust/README.md": "# Rust\n\nOut of scope for now.\n"})
    assert [entry["id"] for entry in languages.detect(repo, "toy")] == ["python", "cpp", "rust"]


@pytest.mark.parametrize("files", [
    {"cpp/README.md": "# C++\n\nPlanned.\n"},                                   # a cpp/ folder with no header proves nothing
    {"src/toy/_speedups.c": "", "src/toy/_speedups.h": ""},                     # C, not C++
    {"tests/cpp/test_box.cpp": "", "kpi/bench/chain.cpp": ""},                  # tests and benchmarks are not the package
    {"build/dora/include/dora.hpp": "", "build/dora/Cargo.toml": "[package]\nname = 'dora'\n"},  # build output
    {".venv/lib/x/include/eigen.hpp": "", "node_modules/y/Cargo.toml": ""},     # someone else's code
])  # fmt: skip
def test_no_proof_no_language(tmp_path, files):
    found = languages.detect(repo_with(tmp_path, {**PY, **files}), "toy")
    assert [entry["id"] for entry in found] == ["python"], found


def test_rust_readme_alone_is_planned(tmp_path):
    repo = repo_with(tmp_path, {**PY, "rust/README.md": "# Rust\n\nOut of scope for now; planned.\n"})
    rust = by_id(languages.detect(repo, "toy"))["rust"]
    assert rust == {"id": "rust", "status": "planned", "where": "rust", "evidence": "rust/README.md; no Cargo.toml yet"}


def test_cargo_toml_is_rust_code_and_beats_the_readme(tmp_path):
    repo = repo_with(tmp_path, {**PY, "rust/README.md": "# Rust\n", "rust/Cargo.toml": '[package]\nname = "toy"\nversion = "0.1.0"\n',
                                "rust/src/lib.rs": ""})  # fmt: skip
    rust = by_id(languages.detect(repo, "toy"))["rust"]
    assert rust == {"id": "rust", "status": "partial", "where": "rust", "evidence": "crate toy (rust/Cargo.toml)"}


def test_gitignored_files_prove_nothing(tmp_path):
    repo = repo_with(tmp_path, {**PY, ".gitignore": "vendor/\n", "vendor/x/Cargo.toml": "", "vendor/x/include/x.hpp": "",
                                "cpp/include/toy/a.hpp": ""})  # fmt: skip
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    found = by_id(languages.detect(repo, "toy"))
    assert "rust" not in found and found["cpp"]["evidence"] == "1 header: a"  # untracked but not ignored still counts


# ---------------------------------------------------------------------------------------------- the full-parity hook
# WHY a hook that can only be earned: "full" claims every public Python symbol has a C++ twin that a test pins. The
# proof is a CPP_PARITY list in a test module, cross-checked against the scanner's own public API, and a listed symbol
# counts only when that test's code names it.

PARITY_PY = {
    "src/toy/__init__.py": "from toy.core import run, Box\n__all__ = ['run', 'Box']\n",
    "src/toy/core.py": "def run(): ...\nclass Box: ...\ndef _private(): ...\n",
    "cpp/include/toy/core.hpp": "",
}


def parity_test(symbols: list[str], uses: str) -> str:
    return f"CPP_PARITY = {symbols!r}\n\ndef test_same():\n    {uses}\n"


def test_full_parity_needs_every_public_symbol(tmp_path):
    repo = repo_with(tmp_path, {**PARITY_PY, "tests/test_cpp_parity.py": parity_test(["toy.run", "toy.Box"], "run(); Box()")})
    cpp = by_id(languages.detect(repo, "toy"))["cpp"]
    assert cpp["status"] == "full", cpp
    assert cpp["evidence"] == "1 header: core · all 2 public symbols parity-tested (tests/test_cpp_parity.py)"


def test_one_public_symbol_short_is_partial(tmp_path):
    repo = repo_with(tmp_path, {**PARITY_PY, "tests/test_cpp_parity.py": parity_test(["toy.run"], "run()")})
    cpp = by_id(languages.detect(repo, "toy"))["cpp"]
    assert cpp["status"] == "partial"
    assert cpp["evidence"] == "1 header: core · 1 of 2 public symbols parity-tested (tests/test_cpp_parity.py)"


def test_a_listed_symbol_the_test_never_uses_does_not_count(tmp_path):
    repo = repo_with(tmp_path, {**PARITY_PY, "tests/test_cpp_parity.py": parity_test(["toy.run", "toy.Box"], "run()")})
    assert by_id(languages.detect(repo, "toy"))["cpp"]["status"] == "partial"


def test_an_empty_public_api_never_proves_full(tmp_path):
    repo = repo_with(tmp_path, {"python/toy/__init__.py": "", "cpp/include/toy/core.hpp": "",
                                "tests/test_cpp_parity.py": parity_test([], "pass")})  # fmt: skip
    found = by_id(languages.detect(repo, "toy"))
    assert found["python"]["where"] == "python/toy"  # moteus layout's python/ folder
    assert found["cpp"]["status"] == "partial"


# ---------------------------------------------------------------------------------------------- real checkouts + graph

needs_checkouts = pytest.mark.skipif(
    not (ROOT / "robot_controllers" / "src").exists() or not (ROOT / "like_keras" / "cpp").exists(),
    reason="reads the sibling checkouts; skipped in CI",
)


@needs_checkouts
def test_real_packages():
    controllers = by_id(languages.detect(ROOT / "robot_controllers", "robot_controllers"))
    assert controllers["cpp"]["status"] == "partial" and controllers["cpp"]["where"] == "src/robot_controllers/controllers/cpp"
    assert controllers["cpp"]["evidence"].startswith("1 controller: joint_trajectory_controller")
    like_keras = by_id(languages.detect(ROOT / "like_keras", "like_keras"))
    assert like_keras["cpp"]["where"] == "cpp" and like_keras["cpp"]["status"] == "partial"
    assert "rust" not in like_keras  # its build/ holds dora's Cargo.toml: gitignored, not like_keras code
    assert [entry["id"] for entry in languages.detect(ROOT / "robot_msgs", "robot_msgs")] == ["python"]


def test_committed_graph_languages():
    graph = json.loads(OUT.read_text())
    for p in graph["packages"]:
        ids = [entry["id"] for entry in p["languages"]]
        assert ids == [i for i in languages.LANGUAGES if i in ids], p["id"]  # known ids, display order, no repeats
        assert ids[:1] == ["python"], p["id"]
        for entry in p["languages"]:
            assert set(entry) == {"id", "status", "where", "evidence"} and entry["status"] in languages.STATUSES
            assert entry["where"] and entry["evidence"]
    assert "cpp" in [entry["id"] for entry in next(p for p in graph["packages"] if p["id"] == "robot_controllers")["languages"]]


def test_label_is_what_the_chips_and_tables_say():
    assert languages.label({"id": "python", "status": "full"}) == "Py"
    assert languages.label({"id": "cpp", "status": "partial"}) == "C++ · partial"
    assert languages.label({"id": "cpp", "status": "full"}) == "C++"
    assert languages.label({"id": "rust", "status": "planned"}) == "Rust (planned)"


# ---------------------------------------------------------------------------------------------- agents without a pyproject

def test_agent_without_pyproject_still_builds(tmp_path):
    # robot_sdk_cpp_agent (2026-11-25) declares itself with builds_on = [] and ships no pyproject.toml: it imports nothing
    # at runtime. One member like that must not stop the directory build (it crashed with FileNotFoundError).
    agent = tmp_path / "toy_agent"
    agent.mkdir()
    (agent / "robot-sdk.toml").write_text(textwrap.dedent('''\
        schema = "robot-sdk-declaration/1"
        role = "agent"
        name = "Toy Agent"
        one_line = "Ports nothing"
        objective = "Lowest nothing"
        builds_on = []
        [links]
        github = "https://github.com/zacharyyamaoka/toy_agent"
        '''))
    built = build(root=tmp_path, ids=[])  # a root with no package checkouts: only the agent is scanned
    agent_row = next(a for a in built.graph["agents"] if a["id"] == "toy_agent")
    assert agent_row["builds_on"] == [] and agent_row["lint"] == "pass", built.lints["toy_agent"].failures
    assert agent_row["repo_url"] == "https://github.com/zacharyyamaoka/toy_agent"
    # and a declaration that claims imports with no pyproject to make them true is a lint failure, not a crash
    text = (agent / "robot-sdk.toml").read_text().replace("builds_on = []", 'builds_on = ["robot_msgs"]')
    (agent / "robot-sdk.toml").write_text(text)
    built = build(root=tmp_path, ids=[])
    assert built.lints["toy_agent"].status == "fail"
    assert any("builds_on" in f for f in built.lints["toy_agent"].failures)
