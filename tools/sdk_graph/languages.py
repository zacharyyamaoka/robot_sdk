"""Which languages a package ships (graph.json `packages[].languages`), read from its repo's files, never declared.

WHY (Zach, 2026-11-25, Daily Note): "In the robot SDK landing page now on each package you can also like support
lanuagues, py, cpp". Same rule as every edge in the graph: a language is listed only where a file proves it.

Layout: mjbots moteus's, `cpp/`, `python/`, `rust/` folders in one repo (robot_sdk_cpp_agent ports packages that way),
plus what robot_controllers does today (C++ inside the Python package's src tree). Per language, at most one entry:

  python  the package's Python source: src/<pkg>, else python/src/<pkg> or python/<pkg>. Always "full" today: it is the
          reference implementation every other language is measured against.
  cpp     a cpp/ folder with headers, else C++ files under src/ or python/. "partial" unless a test proves full parity.
  rust    a Cargo.toml (code: "partial" unless proved), else rust/README.md alone ("planned": the folder says it is
          out of scope for now).

Only files the repo owns count: in a git checkout, tracked or untracked-but-not-ignored (`git ls-files -co
--exclude-standard`), so like_keras's gitignored build/ (dora's own Cargo.toml) proves nothing; everywhere, build output,
virtualenvs and node_modules are skipped. Tests and benchmarks (tests/cpp, kpi/) are not the package.

The "full" hook: a test module under tests/ that assigns `CPP_PARITY` (or `RUST_PARITY`) a literal list of the public
symbols it pins against the Python. Full means that list covers every public symbol the scanner finds in the package
(non-empty), and a listed symbol counts only if that test's code names it. Nothing has one today, so every C++ port is
partial; robot_sdk_cpp_agent's per-package parity tests can earn it.
"""

from __future__ import annotations

import ast
import pathlib
import posixpath
import subprocess
import tomllib

LANGUAGES = ("python", "cpp", "rust")  # display order
STATUSES = ("full", "partial", "planned")
LABEL = {"python": "Py", "cpp": "C++", "rust": "Rust"}

HEADERS = {".h", ".hh", ".hpp", ".hxx", ".ipp"}
CXX_ONLY = {".hh", ".hpp", ".hxx", ".ipp", ".cc", ".cpp", ".cxx"}  # .h alone is C as much as C++
CXX = HEADERS | CXX_ONLY
SKIP = {".git", ".venv", "venv", "node_modules", "build", "_build", "target", "dist", "out", "__pycache__",
        ".pytest_cache", ".ruff_cache", ".mypy_cache", ".tox"}  # fmt: skip
NOT_PACKAGE = {"tests", "test", "__pycache__"}  # inside a source tree (the scanner skips these too)
PARITY = {"cpp": "CPP_PARITY", "rust": "RUST_PARITY"}


def label(entry: dict) -> str:
    """What a chip or a table cell says: Py · C++ · partial · Rust (planned)."""
    text = LABEL.get(entry["id"], entry["id"])
    if entry["status"] == "partial":
        return f"{text} · partial"
    if entry["status"] == "planned":
        return f"{text} (planned)"
    return text


def repo_files(repo: pathlib.Path) -> list[str]:
    """Repo-relative posix paths of the files the repo owns (see the module docstring)."""
    top = subprocess.run(["git", "-C", str(repo), "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=False)
    if top.returncode == 0 and pathlib.Path(top.stdout.strip()).resolve() == repo.resolve():
        listed = subprocess.run(["git", "-C", str(repo), "ls-files", "-z", "-co", "--exclude-standard"],
                                capture_output=True, text=True, check=False).stdout.split("\0")  # fmt: skip
        paths = [p for p in listed if p and (repo / p).is_file()]
    else:  # a tagged tree from `git archive` (versions.py), or a test fixture
        paths = [p.relative_to(repo).as_posix() for p in repo.rglob("*") if p.is_file()]
    return sorted(p for p in paths if not SKIP.intersection(p.split("/")[:-1]))


def suffix(path: str) -> str:
    return posixpath.splitext(path)[1].lower()


def under(path: str, folder: str) -> bool:
    return path.startswith(folder.rstrip("/") + "/")


def plural(count: int, singular: str, many: str) -> str:
    return f"{count} {singular if count == 1 else many}"


# ---------------------------------------------------------------------------------------------- the full-parity hook


def parity_tests(repo: pathlib.Path, files: list[str], language: str) -> tuple[str | None, set[str] | None]:
    """(the parity test to cite, the symbols its <LANG>_PARITY list pins and its code names) — or (None, None).

    The test cited without a list is any tests/ module whose name says parity and the language (test_cpp_parity.py)."""
    marker = PARITY[language]
    named = None
    tokens = {"cpp": ("cpp", "cxx"), "rust": ("rust",)}[language]
    for path in files:
        if not under(path, "tests") or suffix(path) != ".py":
            continue
        name = posixpath.basename(path).lower()
        if named is None and "parity" in name and any(t in name for t in tokens):
            named = path
        source = (repo / path).read_text(encoding="utf-8", errors="replace")
        if marker not in source:
            continue
        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue
        listed, node_of_list = None, None
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == marker for t in node.targets):
                try:
                    listed, node_of_list = [str(s) for s in ast.literal_eval(node.value)], node
                except (ValueError, TypeError):
                    listed = None
        if listed is None:
            continue
        names = set()
        for node in ast.walk(tree):
            if node is node_of_list:
                continue
            if isinstance(node, ast.Name):
                names.add(node.id)
            elif isinstance(node, ast.Attribute):
                names.add(node.attr)
            elif isinstance(node, ast.alias):
                names.add((node.asname or node.name).rsplit(".", 1)[-1])
        # WHY the names check: a symbol in the list the test never touches is a claim, not a pinned twin.
        return path, {s for s in listed if s.rsplit(".", 1)[-1] in names}
    return named, None


def public_api(repo: pathlib.Path, package: str) -> dict[str, set[str]]:
    """Every public definition the scanner finds → every public path that reaches it (scan.PackageScan). Imported here:
    the scan runs only when a parity list exists."""
    from .scan import PackageScan, TypeIndex

    if not (repo / "src" / package).is_dir():
        return {}
    return PackageScan(repo, package, TypeIndex(repo, packages=())).public_aliases()


def proof(repo: pathlib.Path, package: str, files: list[str], language: str) -> tuple[str, str]:
    """(status, evidence suffix) for a language whose code exists: "full" only when the parity list covers the API."""
    test, covered = parity_tests(repo, files, language)
    if test is None:
        return "partial", ""
    if covered is None:
        return "partial", f" · parity test {test}"
    wanted = public_api(repo, package)
    if not wanted:
        return "partial", f" · parity test {test} (no public Python API found to check it against)"
    have = sum(1 for paths in wanted.values() if paths & covered)
    if have == len(wanted):
        return "full", f" · all {len(wanted)} public symbols parity-tested ({test})"
    return "partial", f" · {have} of {len(wanted)} public symbols parity-tested ({test})"


# ---------------------------------------------------------------------------------------------- per language


def python(files: list[str], package: str) -> dict | None:
    for base in ("src", "python/src", "python"):
        root = f"{base}/{package}"
        modules = [p for p in files if under(p, root) and suffix(p) == ".py"
                   and not NOT_PACKAGE.intersection(p[len(root) + 1:].split("/")[:-1])]  # fmt: skip
        if modules:
            return {"id": "python", "status": "full", "where": root, "evidence": plural(len(modules), "module", "modules")}
    return None


def cpp(repo: pathlib.Path, files: list[str], package: str) -> dict | None:
    top = [p for p in files if under(p, "cpp") and suffix(p) in CXX]
    if any(suffix(p) in HEADERS for p in top):
        where, group = "cpp", top
    else:
        group = [p for p in files if (under(p, "src") or under(p, "python")) and suffix(p) in CXX]
        if not any(suffix(p) in CXX_ONLY for p in group):
            return None
        where = posixpath.commonpath([posixpath.dirname(p) for p in group])
    headers = [p for p in group if suffix(p) in HEADERS]
    include = f"{where}/include"
    public = [p for p in headers if under(p, include)] or headers
    names = []
    for path in public:
        rel = path[len(include) + 1:] if under(path, include) else path[len(where) + 1:]
        parts = rel.split("/")
        if len(parts) > 1 and parts[0] == package:  # include/<package>/x.hpp: the folder is the namespace
            parts = parts[1:]
        names.append(posixpath.splitext("/".join(parts))[0])
    names = sorted(dict.fromkeys(names))
    # WHY name what it ports: robot_controllers/controllers/cpp holds controllers, so its evidence says "1 controller";
    # a top-level cpp/ (moteus layout) just has headers.
    parent = posixpath.basename(posixpath.dirname(where))
    if parent and parent not in {"src", "python", package}:
        noun = plural(len(names), parent.removesuffix("s"), parent)
    else:
        noun = plural(len(names), "header", "headers")
    shown = ", ".join(names[:4]) + (f" +{len(names) - 4} more" if len(names) > 4 else "")
    evidence = f"{noun}: {shown}" if names else plural(len(group), "C++ file", "C++ files")
    status, extra = proof(repo, package, files, "cpp")
    return {"id": "cpp", "status": status, "where": where, "evidence": evidence + extra}


def rust(repo: pathlib.Path, files: list[str], package: str) -> dict | None:
    cargo = sorted((p for p in files if posixpath.basename(p) == "Cargo.toml"), key=lambda p: (p.count("/"), p))
    if cargo:
        where = posixpath.dirname(cargo[0]) or "."
        try:
            meta = tomllib.loads((repo / cargo[0]).read_text(encoding="utf-8"))
        except (tomllib.TOMLDecodeError, UnicodeDecodeError):
            meta = {}
        crate = meta.get("package", {}).get("name")
        evidence = f"crate {crate} ({cargo[0]})" if crate else f"workspace ({cargo[0]})"
        status, extra = proof(repo, package, files, "rust")
        return {"id": "rust", "status": status, "where": where, "evidence": evidence + extra}
    if "rust/README.md" in files:
        return {"id": "rust", "status": "planned", "where": "rust", "evidence": "rust/README.md; no Cargo.toml yet"}
    return None


def detect(repo: pathlib.Path, package: str) -> list[dict]:
    """[{id, status, where, evidence}] in LANGUAGES order; a language with no file to prove it is not listed."""
    files = repo_files(repo)
    found = [python(files, package), cpp(repo, files, package), rust(repo, files, package)]
    return [entry for entry in found if entry]
