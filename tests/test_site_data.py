"""site/data/health.json and versions.json (docs/site-data-schema.md): the shape of the committed files, and the rules
that keep them honest, each proved with fake fetchers (no network).

WHY these rules are tested red first: a health view that shows a pass it never read is worse than none (Zach,
2026-11-24: "you want to be able to see what is passing or not"), so a failed run must read fail, an unreachable API
must read unknown, and Latest release must hold only tagged packages.
"""

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import textwrap

import pytest

SDK = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK))

from tools.sdk_graph import health, landing, versions  # noqa: E402

DATA = SDK / "site" / "data"
STATES = {"pass", "warn", "fail", "running", "none", "unknown"}
API = "https://api.github.com"


# ------------------------------------------------------------------------------------------------ fakes


class Fake:
    """A fetcher answering from a URL-prefix table (longest prefix wins); anything not in it is unreachable."""

    def __init__(self, table: dict[str, tuple] | None = None, raises: bool = False) -> None:
        self.table = table or {}
        self.raises = raises
        self.urls: list[str] = []

    def __call__(self, url: str, token: str | None = None) -> tuple:
        self.urls.append(url)
        if self.raises:
            raise RuntimeError("fetcher bug")
        matches = [prefix for prefix in self.table if url.startswith(prefix)]
        return self.table[max(matches, key=len)] if matches else (None, None, "URLError: offline")


def repo(name: str, owner: str = "o") -> dict:
    return {"full_name": f"{owner}/{name}", "html_url": f"https://github.com/{owner}/{name}", "default_branch": "main",
            "private": False}  # fmt: skip


def flows(*paths: str) -> dict:
    return {"workflows": [{"id": i, "name": p.rsplit("/", 1)[-1].removesuffix(".yml"), "path": p} for i, p in enumerate(paths)]}


def run_of(conclusion: str | None, status: str = "completed") -> dict:
    return {"workflow_runs": [{"status": status, "conclusion": conclusion, "head_sha": "248f9f1aaaaaaaaa",
                               "html_url": "https://github.com/o/pkg/actions/runs/1", "run_started_at": "2026-11-25T04:14:01Z"}]}  # fmt: skip


def pypi(*released: str) -> dict:
    return {"info": {"version": released[-1] if released else None}, "releases": {v: [{"yanked": False}] for v in released}}


def online(name: str = "pkg", run: dict | None = None, released: tuple = ("0.3.0",), pypi_name: str = "pkg",
           owner: str = "o") -> dict:
    return {
        f"{API}/repos/{owner}/{name}/actions/workflows?": (200, flows(".github/workflows/test.yml"), "ok"),
        f"{API}/repos/{owner}/{name}/actions/workflows/test.yml/runs": (200, run or run_of("success"), "ok"),
        f"{API}/repos/{owner}/{name}": (200, repo(name, owner), "ok"),
        f"https://pypi.org/pypi/{pypi_name}/json": (200, pypi(*released), "ok"),
    }


SITE = "https://o.github.io/pkg/"
LANDING = "<!doctype html><title>pkg</title><body>" + "A real landing page for pkg, with what it is for. " * 8 + "</body>"


def pages(readme: str = f"# pkg\n\n[Landing page]({SITE})\n") -> dict:
    """The fake page fetcher: pkg's landing page and its README on main."""
    table = {SITE: landing.Page(200, SITE, "text/html", LANDING, "ok"),
             "https://raw.githubusercontent.com/o/pkg/main/README.md": landing.Page(200, "raw", "text/plain", readme, "ok")}  # fmt: skip
    return lambda url: table.get(url) or landing.Page(None, url, None, None, "URLError: offline")


def graph(**package) -> dict:
    p = {"id": "pkg", "pypi": "pkg", "repo_url": "https://github.com/o/pkg", "lint": "pass",
         "links": {"github": "https://github.com/o/pkg", "site": SITE}, **package}  # fmt: skip
    return {
        "schema": "robot-sdk-graph/1", "generated": "2026-11-24T21:00:00-07:00", "sources": {"pkg": "248f9f1"},
        "packages": [p], "types": [{"id": "robot_msgs.T", "package": "robot_msgs"}],
        "uses": [{"package": "pkg", "type": "robot_msgs.T", "kind": "consumes", "symbol": "pkg.f", "where": "src/pkg/a.py:3",
                  "public": True, "declared": True, "verified": True}],
        "agents": [],
    }  # fmt: skip


def checks_of(doc: dict, member: str = "pkg") -> dict:
    return next(m for m in doc["members"] if m["id"] == member)["checks"]


def member(doc: dict, member: str = "pkg") -> dict:
    return next(m for m in doc["members"] if m["id"] == member)


def doc_for(table: dict, g: dict | None = None, pins: dict | None = None, **kw) -> dict:
    return health.build_health(g or graph(), pins={"pkg": "~=0.3.0"} if pins is None else pins,
                               src=health.Sources(fetch=Fake(table) if not isinstance(table, Fake) else table,
                                                  fetch_page=pages()), **kw)  # fmt: skip


# ------------------------------------------------------------------------------------------------ health: state rules


def test_all_green_is_pass():
    doc = doc_for(online())
    assert {k: c["state"] for k, c in checks_of(doc).items()} == {
        "tests": "pass", "lint": "pass", "types": "pass", "release": "pass", "upstream": "pass", "landing": "pass"}  # fmt: skip
    assert member(doc)["state"] == "pass" and doc["summary"] == {"pass": 1, "warn": 0, "fail": 0, "unknown": 0}


def test_failed_ci_run_makes_the_member_fail():
    doc = doc_for(online(run=run_of("failure")))
    tests = checks_of(doc)["tests"]
    assert tests["state"] == "fail" and tests["sha"] == "248f9f1" and tests["url"].endswith("/actions/runs/1")
    assert "failed on main 248f9f1" in tests["detail"]
    assert member(doc)["state"] == "fail" and doc["summary"]["fail"] == 1


@pytest.mark.parametrize("conclusion", ["timed_out", "cancelled", "startup_failure"])
def test_every_failed_conclusion_is_fail(conclusion):
    assert checks_of(doc_for(online(run=run_of(conclusion))))["tests"]["state"] == "fail"


def test_running_ci_neither_passes_nor_raises():
    doc = doc_for(online(run=run_of(None, status="in_progress")))
    assert checks_of(doc)["tests"]["state"] == "running"
    assert member(doc)["state"] == "pass"  # the other five pass; running never raises the member


def test_unreachable_api_is_unknown_never_pass():
    doc = doc_for({})  # every fetch: no answer
    checks = checks_of(doc)
    for name in ("tests", "release", "upstream"):  # the three that need the network
        assert checks[name]["state"] == "unknown", name
        assert checks[name]["detail"], name  # with the reason
    assert "URLError" in checks["upstream"]["detail"]


def test_a_fetcher_that_raises_is_unknown_not_a_crash():
    doc = doc_for(Fake(raises=True))
    assert {checks_of(doc)[c]["state"] for c in ("tests", "release", "upstream")} == {"unknown"}


def test_rate_limited_api_is_unknown():
    table = {f"{API}/": (403, None, "HTTP 403"), "https://pypi.org/": (200, pypi("0.3.0"), "ok")}
    checks = checks_of(doc_for(table))
    assert checks["tests"]["state"] == "unknown" and checks["upstream"]["state"] == "unknown"
    assert "403" in checks["upstream"]["detail"]


def test_repo_404_fails_upstream_and_tests_are_unknown():
    table = {f"{API}/repos/o/pkg": (404, None, "HTTP 404"), "https://pypi.org/pypi/pkg/json": (404, None, "HTTP 404")}
    checks = checks_of(doc_for(table))
    assert checks["upstream"]["state"] == "fail" and "404" in checks["upstream"]["detail"]
    assert checks["tests"]["state"] == "unknown"


def test_private_repo_is_not_reachable():
    table = online() | {f"{API}/repos/o/pkg": (200, {**repo("pkg"), "private": True}, "ok")}
    assert checks_of(doc_for(table))["upstream"]["state"] == "fail"


def test_carried_over_package_fails_upstream():
    doc = doc_for(online(), g=graph(upstream="missing"))
    assert checks_of(doc)["upstream"]["state"] == "fail" and member(doc)["state"] == "fail"


def test_no_test_workflow_is_none_and_a_workflow_named_test_is_used():
    none = online() | {f"{API}/repos/o/pkg/actions/workflows?": (200, flows(".github/workflows/publish.yml"), "ok")}
    assert checks_of(doc_for(none))["tests"]["state"] == "none"
    named = online() | {
        f"{API}/repos/o/pkg/actions/workflows?": (200, {"workflows": [{"id": 77, "name": "test", "path": ".github/workflows/ci.yml"}]}, "ok"),
        f"{API}/repos/o/pkg/actions/workflows/77/runs": (200, run_of("failure"), "ok"),
    }  # fmt: skip
    tests = checks_of(doc_for(named))["tests"]
    assert tests["state"] == "fail" and tests["workflow"] == "ci.yml"


def test_no_run_on_main_is_none_not_pass():
    table = online() | {f"{API}/repos/o/pkg/actions/workflows/test.yml/runs": (200, {"workflow_runs": []}, "ok")}
    assert checks_of(doc_for(table))["tests"]["state"] == "none"


def test_release_pin_vs_pypi():
    assert checks_of(doc_for(online(released=("0.3.0", "0.3.2"))))["release"]["state"] == "pass"
    low = checks_of(doc_for(online(released=("0.2.0",)), pins={"pkg": "~=0.3.1"}))["release"]
    assert low["state"] == "warn" and low["satisfied"] is False and low["pypi_latest"] == "0.2.0"
    assert low["detail"] == "pins ~=0.3.1; PyPI has 0.2.0"
    unpublished = online() | {"https://pypi.org/pypi/pkg/json": (404, None, "HTTP 404")}
    gone = checks_of(doc_for(unpublished))["release"]
    assert gone["state"] == "warn" and "not on PyPI" in gone["detail"] and gone["pypi_latest"] is None


def test_yanked_release_does_not_satisfy():
    body = {"info": {"version": "0.3.0"}, "releases": {"0.3.0": [{"yanked": True}]}}
    table = online() | {"https://pypi.org/pypi/pkg/json": (200, body, "ok")}
    assert checks_of(doc_for(table))["release"]["state"] == "warn"


def test_lint_states():
    failed = doc_for(online(), g=graph(lint="fail"), lint_failures={"pkg": ["robot-sdk.toml:4: wrong"]})
    lint = checks_of(failed)["lint"]
    assert lint["state"] == "fail" and lint["failures"] == ["robot-sdk.toml:4: wrong"] and "robot-sdk.toml:4" in lint["detail"]
    assert member(failed)["state"] == "fail"
    assert checks_of(doc_for(online(), g=graph(lint="undeclared")))["lint"]["state"] == "warn"


def test_types_states():
    g = graph()
    g["uses"][0]["verified"] = False  # declared, not found in the code
    assert checks_of(doc_for(online(), g=g))["types"]["state"] == "fail"
    g = graph()
    g["uses"][0]["declared"] = False  # found, none declared
    assert checks_of(doc_for(online(), g=g))["types"]["state"] == "warn"
    g = graph()
    g["uses"] = []
    assert checks_of(doc_for(online(), g=g))["types"]["state"] == "none"


def test_agents_count_their_tests_and_have_no_release():
    g = graph()
    g["agents"] = [{"id": "agent", "repo_url": "https://github.com/o/agent", "lint": "pass"}]
    doc = doc_for(online() | online("agent", run=run_of("failure")), g=g)
    agent = member(doc, "agent")
    assert agent["kind"] == "agent" and agent["checks"]["tests"]["state"] == "fail" and agent["state"] == "fail"
    assert agent["checks"]["release"]["state"] == "none" and agent["checks"]["types"]["state"] == "none"
    assert [m["id"] for m in doc["members"]] == ["pkg", "agent"]  # packages in graph order, then agents


def test_member_state_ignores_unknown_and_none():
    assert health.member_state({"a": {"state": "unknown"}, "b": {"state": "none"}}) == "unknown"
    assert health.member_state({"a": {"state": "unknown"}, "b": {"state": "pass"}}) == "pass"
    assert health.member_state({"a": {"state": "warn"}, "b": {"state": "fail"}, "c": {"state": "pass"}}) == "fail"


# ------------------------------------------------------------------------------------------------ pins


@pytest.mark.parametrize(
    "version,spec,ok",
    [
        ("0.3.1", "~=0.3.1", True), ("0.3.9", "~=0.3.1", True), ("0.3.0", "~=0.3.1", False), ("0.4.0", "~=0.3.1", False),
        ("1.9", "~=1.2", True), ("2.0", "~=1.2", False), ("0.1.0", "==0.1.0", True), ("0.1.1", "==0.1.0", False),
        ("0.1.7", "==0.1.*", True), ("0.2.0", "==0.1.*", False), ("1.0", ">=0.9,<2", True), ("2.0", ">=0.9,<2", False),
        ("0.3.0", "!=0.3.0", False), ("0.3.0rc1", ">=0.1", False), ("0.3.0", "", True),
    ],
)  # fmt: skip
def test_small_pin_matcher(version, spec, ok):
    assert health.satisfies_simple(version, spec) is ok
    try:
        from packaging.specifiers import SpecifierSet
        from packaging.version import Version
    except ImportError:
        return
    assert SpecifierSet(spec).contains(Version(version), prereleases=False) is ok  # agrees with packaging


def test_split_requirement():
    assert health.split_requirement("robot-msgs~=0.3.1") == ("robot-msgs", "~=0.3.1")
    assert health.split_requirement("like_keras ~= 0.1.0 ; python_version>'3.10'") == ("like_keras", "~= 0.1.0")
    assert health.split_requirement("traj-compare[viz]>=0.1") == ("traj-compare", ">=0.1")
    assert health.split_requirement("sim2real") == ("sim2real", "")


# ------------------------------------------------------------------------------------------------ versions (temp git)


def git(repo: pathlib.Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout


def init(repo: pathlib.Path) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.email", "t@example.com")
    git(repo, "config", "user.name", "t")
    git(repo, "config", "commit.gpgsign", "false")
    git(repo, "config", "tag.gpgsign", "false")


def commit(repo: pathlib.Path, files: dict[str, str], message: str = "c") -> None:
    for rel, text in files.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(textwrap.dedent(text))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", message)


def pyproject(name: str, version: str = "0.1.0", deps: list[str] | None = None) -> str:
    return f'[project]\nname = "{name}"\nversion = "{version}"\ndependencies = {json.dumps(deps or [])}\n'


@pytest.fixture
def tagged_world(tmp_path):
    """robot_msgs + pkg_a tagged v0.1.0, then moved on (a new type and a new use on main); pkg_b never tagged."""
    root = tmp_path / "root"
    msgs, a, b, sdk = root / "robot_msgs", root / "pkg_a", root / "pkg_b", root / "robot_sdk"
    for r in (msgs, a, b, sdk):
        init(r)
    commit(msgs, {"pyproject.toml": pyproject("robot-msgs"),
                  "src/robot_msgs/__init__.py": 'class JointTrajectory:\n    """Timed joint positions."""\n'})  # fmt: skip
    git(msgs, "tag", "v0.1.0")
    commit(msgs, {"src/robot_msgs/__init__.py": 'class JointTrajectory:\n    """Timed."""\n\n\nclass Pose:\n    """A pose."""\n'})
    commit(a, {"pyproject.toml": pyproject("pkg-a", deps=["robot-msgs"]),
               "src/pkg_a/__init__.py": "from robot_msgs import JointTrajectory\n\n\ndef plan() -> JointTrajectory: ...\n"})  # fmt: skip
    git(a, "tag", "v0.1.0")
    git(a, "tag", "archive/old")  # ignored: not a v* tag
    commit(a, {"pyproject.toml": pyproject("pkg-a", "0.2.0", ["robot-msgs"]),
               "src/pkg_a/__init__.py": "from robot_msgs import JointTrajectory, Pose\n\n\ndef plan() -> JointTrajectory: ...\n\n\n"
                                        "def where(pose: Pose) -> None: ...\n"})  # fmt: skip
    commit(b, {"pyproject.toml": pyproject("pkg-b", deps=["robot-msgs"]),
               "src/pkg_b/__init__.py": "from robot_msgs import Pose\n\n\ndef go(pose: Pose) -> None: ...\n"})  # fmt: skip
    commit(sdk, {"pyproject.toml": pyproject("robot-sdk", deps=["robot-msgs~=0.1.0", "pkg-a~=0.1.0", "pkg-b~=0.1.0"]),
                 "src/robot_sdk/__init__.py": 'LAYERS = {"robot_msgs": "vocabulary", "pkg_a": "leaf", "pkg_b": "leaf"}\n'})  # fmt: skip
    return root, sdk


def test_release_graph_holds_only_tagged_packages_at_their_tags(tagged_world):
    root, sdk = tagged_world
    entry, g, doc = versions.release(root, sdk, health.Sources(fetch=Fake()))
    assert [p["id"] for p in g["packages"]] == ["robot_msgs", "pkg_a"]  # pkg_b has no tag: absent
    assert entry["packages"]["pkg_b"] is None
    assert entry["packages"]["pkg_a"] == {"version": "0.1.0", "ref": "v0.1.0", "sha": git(root / "pkg_a", "rev-parse", "--short=7", "v0.1.0").strip()}
    assert g["sources"]["pkg_a"] == entry["packages"]["pkg_a"]["sha"]
    # robot_msgs' types and pkg_a's uses come from the tagged trees: Pose (added on main after the tag) is nowhere.
    assert {t["name"] for t in g["types"]} == {"JointTrajectory"}
    assert [(u["package"], u["symbol"], u["kind"]) for u in g["uses"]] == [("pkg_a", "pkg_a.plan", "produces")]
    assert next(p for p in g["packages"] if p["id"] == "pkg_a")["version"] == "0.1.0"
    assert "2 of 3 tagged" in entry["summary"] and "not released yet" in entry["summary"]
    # The release's health exists, is about the tagged members only, and with no network says unknown, never pass.
    assert doc is not None and [m["id"] for m in doc["members"]] == ["robot_msgs", "pkg_a"]
    assert {m["checks"]["tests"]["state"] for m in doc["members"]} == {"unknown"}


def test_release_health_reads_ci_at_the_tagged_commit(tagged_world):
    root, sdk = tagged_world
    full = git(root / "pkg_a", "rev-list", "-n", "1", "v0.1.0").strip()
    owner = "zacharyyamaoka"  # graph.py's default repo_url owner for a pyproject without [project.urls]
    fake = Fake(online("pkg_a", released=("0.1.0",), pypi_name="pkg-a", owner=owner)
                | online("robot_msgs", released=("0.1.0",), pypi_name="robot-msgs", owner=owner))  # fmt: skip
    _, g, doc = versions.release(root, sdk, health.Sources(fetch=fake))
    assert any(f"head_sha={full}" in u for u in fake.urls)  # the run at the tag, not main's newest
    assert not any("branch=main" in u for u in fake.urls)
    pkg_a = member(doc, "pkg_a")["checks"]
    assert pkg_a["tests"]["state"] == "pass" and "at v0.1.0" in pkg_a["tests"]["detail"]
    assert pkg_a["release"]["state"] == "pass" and pkg_a["release"]["detail"] == "v0.1.0 is on PyPI"


def gh_pages(sdk: pathlib.Path, scratch: pathlib.Path, graphs: list[tuple[dict, dict | None, str]]) -> None:
    """Commit each (graph, health or None, ISO date) to an orphan gh-pages branch, oldest first (plumbing, the way
    tools/refresh publishes: a temp index over a separate work tree, so main's checkout is never touched)."""
    parent = None
    for i, (g, h, date) in enumerate(graphs):
        site = scratch / f"site{i}"
        (site / "data").mkdir(parents=True)
        (site / "data" / "graph.json").write_text(json.dumps(g))
        if h is not None:
            (site / "data" / "health.json").write_text(json.dumps(h))
        env = {**os.environ, "GIT_INDEX_FILE": str(scratch / f"index{i}"), "GIT_COMMITTER_DATE": date, "GIT_AUTHOR_DATE": date}
        plumb = lambda *a: subprocess.run(["git", f"--git-dir={sdk / '.git'}", f"--work-tree={site}", *a], cwd=site, env=env,  # noqa: E731
                                          capture_output=True, text=True, check=True).stdout.strip()  # fmt: skip
        plumb("add", "--all", ".")
        tree = plumb("write-tree")
        parent = plumb("commit-tree", tree, *(["-p", parent] if parent else []), "-m",
                       f"site: built from main {g['sources']['robot_sdk']} with data/graph.json (tools/refresh)")  # fmt: skip
    git(sdk, "update-ref", "refs/heads/gh-pages", parent)


def tiny(n: int, generated: str = "2026-11-24T21:00:00-07:00") -> dict:
    return {"schema": "robot-sdk-graph/1", "generated": generated, "sources": {"robot_sdk": f"abc{n:04d}"},
            "packages": [{"id": "pkg", "version": f"0.{n}.0"}], "types": [], "uses": [], "agents": []}  # fmt: skip


def test_snapshots_one_per_distinct_graph_newest_first(tagged_world, tmp_path):
    _, sdk = tagged_world
    gh_pages(sdk, tmp_path / "pages", [
        (tiny(1), None, "2026-11-25T04:10:00Z"),
        (tiny(1, generated="2026-11-25T05:00:00Z"), None, "2026-11-25T04:20:00Z"),  # same facts, new `generated`
        (tiny(2), {"schema": "robot-sdk-health/1"}, "2026-11-25T04:30:00Z"),
        (tiny(3), None, "2026-11-25T04:40:00Z"),                                     # = live: not a snapshot
    ])  # fmt: skip
    found = versions.snapshots(sdk, live=tiny(3))
    entries = [e for e, _, _ in found]
    assert [e["published"] for e in entries] == ["2026-11-25T04:30:00Z", "2026-11-25T04:20:00Z"]
    assert entries[0]["health"] == f"versions/{entries[0]['id']}/health.json" and found[0][2] is not None
    assert entries[1]["health"] is None and found[1][2] is None
    assert entries[0]["built_from"] == "abc0002" and entries[0]["kind"] == "snapshot"
    assert json.loads(found[0][1]) == tiny(2)  # the published bytes, verbatim
    assert len(versions.snapshots(sdk, live={}, limit=1)) == 1


def test_distributions_are_pin_sets_newest_first(tmp_path):
    sdk = tmp_path / "robot_sdk"
    init(sdk)
    commit(sdk, {"pyproject.toml": pyproject("robot-sdk", deps=["robot-msgs~=0.3.0"])}, "first pins")
    commit(sdk, {"pyproject.toml": pyproject("robot-sdk", deps=["robot-msgs~=0.3.1", "robot-reach~=0.1.0"])}, "bump + add")
    commit(sdk, {"pyproject.toml": pyproject("robot-sdk", deps=["robot-msgs~=0.3.1", "robot-reach~=0.1.0"]) + "# a comment\n"}, "no pin change")  # fmt: skip
    commit(sdk, {"pyproject.toml": pyproject("robot-sdk", deps=["robot-msgs~=0.3.1"])}, "drop reach")
    rows = versions.distributions(sdk)
    assert [r["subject"] for r in rows] == ["drop reach", "bump + add", "first pins"]
    assert rows[0]["removed"] == ["robot-reach"] and rows[0]["added"] == [] and rows[0]["changed"] == {}
    assert rows[1]["added"] == ["robot-reach"] and rows[1]["changed"] == {"robot-msgs": {"from": "~=0.3.0", "to": "~=0.3.1"}}
    assert rows[2]["pins"] == {"robot-msgs": "~=0.3.0"} and rows[2]["added"] == []
    assert all(r["released"] is False for r in rows)
    git(sdk, "tag", "v0.1.0")
    assert versions.distributions(sdk)[0]["released"] is True


# ------------------------------------------------------------------------------------------------ the committed files


def test_committed_health_matches_the_schema():
    path = DATA / "health.json"
    if not path.exists():
        pytest.skip("site/data/health.json not generated yet")
    doc, g = json.loads(path.read_text()), json.loads((DATA / "graph.json").read_text())
    assert doc["schema"] == "robot-sdk-health/1"
    assert set(doc) == {"schema", "generated", "graph_generated", "checks", "members", "summary"}
    assert [c["id"] for c in doc["checks"]] == ["tests", "lint", "types", "release", "upstream", "landing"]
    assert [m["id"] for m in doc["members"]] == [p["id"] for p in g["packages"]] + [a["id"] for a in g["agents"]]
    for m in doc["members"]:
        assert set(m) == {"id", "kind", "state", "checks"} and m["kind"] in {"package", "agent"}
        assert set(m["checks"]) == {c["id"] for c in doc["checks"]}
        for check in m["checks"].values():
            assert check["state"] in STATES and isinstance(check["detail"], str) and check["detail"]
        assert m["state"] == health.member_state(m["checks"])
    assert set(doc["summary"]) == {"pass", "warn", "fail", "unknown"}
    assert sum(doc["summary"].values()) == len(doc["members"])
    for state, n in doc["summary"].items():
        assert n == sum(m["state"] == state for m in doc["members"])


def test_committed_versions_match_the_schema():
    path = DATA / "versions.json"
    if not path.exists():
        pytest.skip("site/data/versions.json not generated yet")
    doc = json.loads(path.read_text())
    assert doc["schema"] == "robot-sdk-versions/1" and doc["default"] == "live"
    assert set(doc) == {"schema", "generated", "default", "versions", "distributions"}
    ids = [v["id"] for v in doc["versions"]]
    assert ids[0] == "live" and len(set(ids)) == len(ids)
    assert sum(v["kind"] == "snapshot" for v in doc["versions"]) <= versions.MAX_SNAPSHOTS
    live = doc["versions"][0]
    assert live["graph"] == "graph.json" and live["health"] in {"health.json", None}
    for v in doc["versions"]:
        assert v["kind"] in {"live", "release", "snapshot"} and v["label"] and v["summary"] and v["graph"]
        if v["kind"] != "live":
            assert v["graph"] == f"versions/{v['id']}/graph.json"
            assert v["health"] in {None, f"versions/{v['id']}/health.json"}
        if (DATA / v["graph"]).exists():  # versions/ is generated and gitignored: checked where it was built
            assert json.loads((DATA / v["graph"]).read_text())["schema"] == "robot-sdk-graph/1"
    release = next((v for v in doc["versions"] if v["kind"] == "release"), None)
    if release and (DATA / release["graph"]).exists():
        tagged = {p for p, at in release["packages"].items() if at}
        assert {p["id"] for p in json.loads((DATA / release["graph"]).read_text())["packages"]} == tagged
    for row in doc["distributions"]:
        assert set(row) == {"version", "released", "commit", "date", "subject", "pins", "added", "removed", "changed"}


# ------------------------------------------------------------------------------------------------ refresh wiring


def load_refresh():
    spec = importlib.util.spec_from_file_location("refresh", SDK / "tools" / "refresh" / "refresh.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pages_race(tmp_path):
    """A bare origin whose gh-pages a rival publisher moved after our last fetch: (origin, our clone, the rival's tip)."""
    origin, ours, rival = tmp_path / "origin.git", tmp_path / "ours", tmp_path / "rival"
    sh = lambda cwd, *a: subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()  # noqa: E731
    sh(tmp_path, "init", "-q", "--bare", str(origin))
    for clone in (ours, rival):
        sh(tmp_path, "clone", "-q", str(origin), str(clone))
        sh(clone, "config", "user.email", "t@t"), sh(clone, "config", "user.name", "t")
    sh(rival, "checkout", "-q", "--orphan", "gh-pages")
    (rival / "index.html").write_text("first")
    sh(rival, "add", "."), sh(rival, "commit", "-qm", "first"), sh(rival, "push", "-q", "origin", "gh-pages")
    sh(ours, "fetch", "-q", "origin", "+gh-pages:refs/remotes/origin/gh-pages")  # our view: the first build
    (rival / "index.html").write_text("rival")
    sh(rival, "commit", "-qam", "rival"), sh(rival, "push", "-q", "origin", "gh-pages")  # the other publisher wins the race
    return origin, ours, sh(rival, "rev-parse", "HEAD"), sh


def test_refresh_publish_survives_a_rival_publish(tmp_path, monkeypatch):
    origin, ours, rival_tip, sh = pages_race(tmp_path)
    refresh = load_refresh()
    build = tmp_path / "_build"
    build.mkdir()
    (build / "index.html").write_text("ours")
    monkeypatch.setattr(refresh, "BUILD", build)
    real_run = refresh.run
    monkeypatch.setattr(refresh, "run", lambda *a, cwd=None, **kw: real_run(*a, cwd=ours, **kw))
    line = refresh.publish("abc1234")
    assert line.startswith("published:") and "on attempt 2" in line
    tip = sh(origin, "rev-parse", "gh-pages")
    assert sh(origin, "rev-parse", f"{tip}^") == rival_tip  # re-parented on the rival's build, nothing force-pushed
    assert sh(origin, "show", f"{tip}:index.html") == "ours"


def test_refresh_publish_can_still_fail(tmp_path, monkeypatch):
    # A retry that can't go red proves nothing: with no attempts left after the rejected one, the run must fail loudly.
    origin, ours, rival_tip, sh = pages_race(tmp_path)
    refresh = load_refresh()
    build = tmp_path / "_build"
    build.mkdir()
    (build / "index.html").write_text("ours")
    monkeypatch.setattr(refresh, "BUILD", build)
    real_run = refresh.run
    monkeypatch.setattr(refresh, "run", lambda *a, cwd=None, **kw: real_run(*a, cwd=ours, **kw))
    with pytest.raises(SystemExit, match="rejected 1 times"):
        refresh.publish("abc1234", attempts=1)
    assert sh(origin, "rev-parse", "gh-pages") == rival_tip


def test_refresh_leaves_out_a_failed_file_and_still_writes_the_rest(tmp_path, monkeypatch):
    refresh = load_refresh()
    data = tmp_path / "_build" / "data"
    data.mkdir(parents=True)
    (data / "health.json").write_text("{}")  # a stale copy publish_dashboard brought over
    monkeypatch.setattr(refresh, "BUILD", tmp_path / "_build")
    monkeypatch.setattr(refresh, "published", lambda rel: None)

    def fake_run(*args, check=True, **kw):
        if "health" in args:
            return subprocess.CompletedProcess(args, 1, "", "Traceback…\nRuntimeError: boom")
        (data / "versions.json").write_text("{}")
        return subprocess.CompletedProcess(args, 0, f"wrote {data / 'versions.json'}: 1 versions, 0 distributions\n", "")

    monkeypatch.setattr(refresh, "run", fake_run)
    lines = refresh.site_data(data)
    assert not (data / "health.json").exists()  # never ship the stale copy
    assert (data / "versions.json").exists()
    assert any("health.json left out" in line and "boom" in line for line in lines)


def test_refresh_keeps_published_bytes_when_only_stamps_changed(tmp_path, monkeypatch):
    refresh = load_refresh()
    monkeypatch.setattr(refresh, "BUILD", tmp_path)
    old = json.dumps({"generated": "old", "members": [{"generated": "x", "state": "pass"}]})
    monkeypatch.setattr(refresh, "published", lambda rel: old.encode())
    out = tmp_path / "data" / "health.json"
    out.parent.mkdir()
    out.write_text(json.dumps({"generated": "new", "members": [{"generated": "y", "state": "pass"}]}))
    refresh.keep_published_bytes(out)
    assert out.read_text() == old
    out.write_text(json.dumps({"generated": "new", "members": [{"generated": "y", "state": "fail"}]}))
    refresh.keep_published_bytes(out)
    assert json.loads(out.read_text())["members"][0]["state"] == "fail"
