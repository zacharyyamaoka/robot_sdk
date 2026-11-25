"""Read packages with `ast` (never importing them): which shared types each one takes and gives.

WHY ast, not import (Zach's ask, 2026-11-24): an edge exists only where the code makes it true, and reading the code
is the one way to say so without installing every package's extras or running its import-time side effects.
"""

from __future__ import annotations

import ast
import dataclasses
import pathlib
import re
from collections.abc import Iterable, Iterator

# Packages whose classes are the shared vocabulary other packages join on. A type defined anywhere else is private to
# its package and never becomes a graph node.
SHARED_TYPES = ("robot_msgs",)

# Dunder methods that are part of a class's public surface (construction, calling, iteration, context).
PUBLIC_DUNDERS = {"__init__", "__call__", "__iter__", "__next__", "__enter__", "__getitem__"}


def parse(path: pathlib.Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def modules_of(src: pathlib.Path, package: str) -> Iterator[tuple[str, pathlib.Path]]:
    """(dotted module name, file) for every .py under src/<package>/, `__init__` as the package itself."""
    base = src / package
    for path in sorted(base.rglob("*.py")):
        rel = path.relative_to(src).with_suffix("")
        parts = list(rel.parts)
        if parts[-1] == "__init__":
            parts.pop()
        if any(p in {"tests", "test", "__pycache__"} for p in parts):
            continue
        yield ".".join(parts), path


def is_public_module(name: str) -> bool:
    return not any(p.startswith("_") for p in name.split("."))


def dotted(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return f"{base}.{node.attr}" if base else None
    return None


def resolve_from(module: str, is_package: bool, level: int, target: str | None) -> str:
    """Absolute module of `from <dots><target> import …` written in `module`."""
    if level == 0:
        return target or ""
    parts = module.split(".")
    if not is_package:
        parts = parts[:-1]
    parts = parts[: len(parts) - (level - 1)] if level > 1 else parts
    return ".".join(parts + ([target] if target else []))


@dataclasses.dataclass
class Imports:
    """Local name → absolute dotted target, for every import anywhere in a module (lazy imports included)."""

    names: dict[str, str]
    lines: dict[str, int]  # absolute target → first line importing it

    @classmethod
    def of(cls, tree: ast.Module, module: str, is_package: bool) -> Imports:
        names: dict[str, str] = {}
        lines: dict[str, int] = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.asname:
                        names[alias.asname] = alias.name
                    else:
                        names.setdefault(alias.name.split(".")[0], alias.name.split(".")[0])
                    lines.setdefault(alias.name, node.lineno)
            elif isinstance(node, ast.ImportFrom):
                base = resolve_from(module, is_package, node.level, node.module)
                for alias in node.names:
                    if alias.name == "*":
                        continue
                    target = f"{base}.{alias.name}"
                    names[alias.asname or alias.name] = target
                    lines.setdefault(target, node.lineno)
        return cls(names, lines)

    def resolve(self, node: ast.AST) -> str | None:
        name = dotted(node)
        if not name:
            return None
        head, _, rest = name.partition(".")
        if head not in self.names:
            return None
        return f"{self.names[head]}.{rest}" if rest else self.names[head]


# ---------------------------------------------------------------------------------------------- the shared types


@dataclasses.dataclass
class TypeDef:
    id: str  # canonical public path, e.g. robot_msgs.trajectory.JointTrajectory
    name: str
    package: str
    module: str  # the module of the canonical path
    what: str
    docs_url: str | None


def first_doc_line(node: ast.ClassDef) -> str:
    doc = ast.get_docstring(node) or ""
    for paragraph in doc.strip().split("\n\n"):
        text = " ".join(line.strip() for line in paragraph.splitlines()).strip()
        if text:
            # WHY first sentence of the first paragraph: the docstrings' summary is one sentence, sometimes wrapped.
            match = re.match(r"(.+?[.!?])(\s|$)", text)
            return (match.group(1) if match else text).rstrip(".")
    return ""


class TypeIndex:
    """Every public class of the shared-types packages, by every path it can be imported from."""

    def __init__(self, root: pathlib.Path, packages: Iterable[str] = SHARED_TYPES) -> None:
        self.types: dict[str, TypeDef] = {}
        self.alias: dict[str, str] = {}  # any importable path → canonical id
        for package in packages:
            self._index(root / package / "src", package)

    def _index(self, src: pathlib.Path, package: str) -> None:
        defined: dict[str, tuple[str, ast.ClassDef]] = {}  # defining path → (module, node)
        exposed: dict[str, set[str]] = {}  # defining path → every path that re-exports it
        bases: dict[str, list[str]] = {}
        trees = {}
        for module, path in modules_of(src, package):
            tree = parse(path)
            trees[module] = (tree, path.name == "__init__.py")
            imports = Imports.of(tree, module, path.name == "__init__.py")
            for node in tree.body:
                if isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
                    full = f"{module}.{node.name}"
                    defined[full] = (module, node)
                    bases[full] = [imports.resolve(b) or f"{module}.{dotted(b)}" for b in node.bases if dotted(b)]
        # Re-exports: `from robot_msgs.trajectory.joint_trajectory import JointTrajectory` in trajectory/__init__.py.
        changed = True
        paths = {full: {full} for full in defined}
        while changed:
            changed = False
            for module, (tree, is_package) in trees.items():
                for node in tree.body:
                    if not isinstance(node, ast.ImportFrom):
                        continue
                    base = resolve_from(module, is_package, node.level, node.module)
                    for alias in node.names:
                        target = f"{base}.{alias.name}"
                        for full, known in paths.items():
                            if target in known and f"{module}.{alias.asname or alias.name}" not in known:
                                known.add(f"{module}.{alias.asname or alias.name}")
                                changed = True
        exposed = paths

        def is_msg(full: str, seen: frozenset[str] = frozenset()) -> bool:
            for base in bases.get(full, []):
                canonical = next((f for f, known in exposed.items() if base in known), base)
                if canonical.endswith("._core.Msg") or (canonical not in seen and is_msg(canonical, seen | {full})):
                    return True
            return False

        for full, (module, node) in defined.items():
            public = sorted((p for p in exposed[full] if is_public_module(p.rsplit(".", 1)[0])),
                            key=lambda p: (p.count("."), p))  # fmt: skip
            if not public:
                continue
            canonical = public[0]
            canon_module = canonical.rsplit(".", 1)[0]
            parts = module.split(".")
            # WHY this URL rule: robotmsgs.com renders one page per registered Msg, keyed `<domain>/<Name>` the way
            # Msg.__init_subclass__ names it (module[1] for modules nested under a domain).
            docs = None
            if package == "robot_msgs" and len(parts) > 2 and is_msg(full):
                docs = f"https://robotmsgs.com/types/{parts[1]}/{node.name}/"
            self.types[canonical] = TypeDef(canonical, node.name, package, canon_module, first_doc_line(node), docs)
            for path in exposed[full]:
                self.alias[path] = canonical

    def type_of(self, path: str | None) -> str | None:
        return self.alias.get(path) if path else None


# ---------------------------------------------------------------------------------------------- one package's uses


@dataclasses.dataclass(frozen=True)
class Use:
    package: str
    type: str
    kind: str  # consumes | produces | imports
    symbol: str
    where: str  # file:line, relative to the repo root
    public: bool


def annotation_types(node: ast.AST | None, imports: Imports, index: TypeIndex) -> list[tuple[str, int]]:
    """Shared types named anywhere in an annotation (unions, generics, string annotations), with their lines."""
    if node is None:
        return []
    found: list[tuple[str, int]] = []
    for sub in ast.walk(node):
        if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
            try:
                inner = ast.parse(sub.value, mode="eval").body
            except SyntaxError:
                continue
            for type_id, _ in annotation_types(inner, imports, index):
                found.append((type_id, sub.lineno))
        elif isinstance(sub, (ast.Name, ast.Attribute)):
            type_id = index.type_of(imports.resolve(sub))
            if type_id:
                found.append((type_id, sub.lineno))
    return list(dict.fromkeys(found))


def literal_all(tree: ast.Module) -> list[str] | None:
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        if any(isinstance(t, ast.Name) and t.id == "__all__" for t in targets) and node.value is not None:
            try:
                return list(ast.literal_eval(node.value))
            except ValueError:
                return None
    return None


def is_protocol(node: ast.ClassDef, imports: Imports) -> bool:
    return any((imports.resolve(b) or dotted(b) or "").endswith("Protocol") for b in node.bases)


def is_classvar(annotation: ast.AST, imports: Imports) -> bool:
    head = annotation.value if isinstance(annotation, ast.Subscript) else annotation
    return (imports.resolve(head) or dotted(head) or "").endswith("ClassVar")


@dataclasses.dataclass
class Module:
    name: str
    path: pathlib.Path
    tree: ast.Module
    imports: Imports
    is_package: bool


class PackageScan:
    """Every shared type a package's code names, and on which public signature it consumes or produces it."""

    def __init__(self, repo: pathlib.Path, package: str, index: TypeIndex) -> None:
        self.repo, self.package, self.index = repo, package, index
        src = repo / "src"
        self.modules: dict[str, Module] = {}
        for name, path in modules_of(src, package):
            tree = parse(path)
            is_package = path.name == "__init__.py"
            self.modules[name] = Module(name, path, tree, Imports.of(tree, name, is_package), is_package)
        self.uses: list[Use] = []
        self._public = self._public_symbols()
        self._scan_public()
        self._scan_imports()

    def where(self, module: Module, line: int) -> str:
        return f"{module.path.relative_to(self.repo).as_posix()}:{line}"

    # Which top-level definitions are public, and under which dotted path.
    def _public_symbols(self) -> dict[tuple[str, str], str]:
        """(defining module, name) → public dotted path, following re-exports out of private modules."""
        public: dict[tuple[str, str], str] = {}
        defs = {
            (m.name, node.name)
            for m in self.modules.values()
            for node in m.tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        }
        for m in self.modules.values():
            if not is_public_module(m.name):
                continue
            listed = literal_all(m.tree)
            for node in m.tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    if (listed is None and not node.name.startswith("_")) or (listed and node.name in listed):
                        public[(m.name, node.name)] = f"{m.name}.{node.name}"
        # Re-exports: a public module's `__all__` (or, without one, its non-underscore imported names) naming a
        # definition from a private module makes that definition public under the re-exporting path.
        changed = True
        while changed:
            changed = False
            for m in self.modules.values():
                if not is_public_module(m.name):
                    continue
                listed = literal_all(m.tree)
                for local, target in m.imports.names.items():
                    if (listed is not None and local not in listed) or (listed is None and local.startswith("_")):
                        continue
                    if listed is None and not m.is_package:
                        continue  # a plain module's imports are its own dependencies, not its API
                    key = tuple(target.rsplit(".", 1))
                    if len(key) == 2 and key in defs and key not in public:
                        public[key] = f"{m.name}.{local}"
                        changed = True
        return public

    def _add(self, type_id: str, kind: str, symbol: str, module: Module, line: int, public: bool = True) -> None:
        self.uses.append(Use(self.package, type_id, kind, symbol, self.where(module, line), public))

    def _function(self, fn: ast.FunctionDef | ast.AsyncFunctionDef, symbol: str, module: Module, flip: bool) -> None:
        # WHY flip for a Protocol: it describes what the package expects of a collaborator, so data flows the other
        # way: the package hands the implementer its parameters (produces) and takes back its return (consumes).
        give, take = ("produces", "consumes") if not flip else ("consumes", "produces")
        args = fn.args
        params = args.posonlyargs + args.args + args.kwonlyargs + [a for a in (args.vararg, args.kwarg) if a]
        for arg in params:
            if arg.arg in {"self", "cls"}:
                continue
            for type_id, line in annotation_types(arg.annotation, module.imports, self.index):
                self._add(type_id, take, symbol, module, line)
        returns = annotation_types(fn.returns, module.imports, self.index)
        if fn.returns is None and not flip:
            # Unannotated: a `return Type(...)` still produces that type.
            for node in ast.walk(fn):
                if isinstance(node, ast.Return) and isinstance(node.value, ast.Call):
                    type_id = self.index.type_of(module.imports.resolve(node.value.func))
                    if type_id:
                        returns.append((type_id, node.lineno))
        for type_id, line in returns:
            self._add(type_id, give, symbol, module, line)

    def _implemented_here(self, protocol: ast.ClassDef) -> bool:
        """Does a concrete class in this package subclass the Protocol or define all of its public methods?"""
        wanted = {n.name for n in protocol.body
                  if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and not n.name.startswith("_")}  # fmt: skip
        for module in self.modules.values():
            for node in ast.walk(module.tree):
                if not isinstance(node, ast.ClassDef) or node is protocol or is_protocol(node, module.imports):
                    continue
                if any((dotted(b) or "").rsplit(".", 1)[-1] == protocol.name for b in node.bases):
                    return True
                have = {n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
                if wanted and wanted <= have:
                    return True
        return False

    def _scan_public(self) -> None:
        returned: set[str] = set()  # this package's own classes named in a public return annotation
        taken: set[str] = set()
        local_classes = {f"{mod}.{name}" for (mod, name) in self._public}
        for (mod, name), public_path in self._public.items():
            module = self.modules[mod]
            node = next(n for n in module.tree.body if getattr(n, "name", None) == name)
            fns = [node] if not isinstance(node, ast.ClassDef) else [
                n for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]  # fmt: skip
            for fn in fns:
                for target, bucket in ((fn.returns, returned), *((a.annotation, taken) for a in fn.args.args)):
                    for sub in ast.walk(target) if target is not None else ():
                        path = module.imports.resolve(sub) if isinstance(sub, (ast.Name, ast.Attribute)) else None
                        if isinstance(sub, ast.Name) and sub.id in {n for (m, n) in self._public if m == mod}:
                            path = f"{mod}.{sub.id}"
                        if path in local_classes:
                            bucket.add(path)
        for (mod, name), public_path in self._public.items():
            module = self.modules[mod]
            node = next(n for n in module.tree.body if getattr(n, "name", None) == name)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self._function(node, public_path, module, flip=False)
                continue
            flip = is_protocol(node, module.imports) and not self._implemented_here(node)
            # WHY fields follow the class's direction: a class the package only returns is an output whose fields it
            # produces; any other class (a config, an input record, a Protocol's attributes) is filled in by the caller.
            output = f"{mod}.{name}" in returned and f"{mod}.{name}" not in taken
            field_kind = "produces" if output and not flip else "consumes"
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if item.name.startswith("_") and item.name not in PUBLIC_DUNDERS:
                        continue
                    symbol = public_path if item.name == "__init__" else f"{public_path}.{item.name}"
                    is_property = any(dotted(d) in {"property", "functools.cached_property", "cached_property"}
                                      for d in item.decorator_list)  # fmt: skip
                    if is_property:
                        for type_id, line in annotation_types(item.returns, module.imports, self.index):
                            self._add(type_id, "consumes" if flip else field_kind if output else "produces",
                                      symbol, module, line)  # fmt: skip
                    else:
                        self._function(item, symbol, module, flip)
                elif isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    if item.target.id.startswith("_") or is_classvar(item.annotation, module.imports):
                        continue
                    for type_id, line in annotation_types(item.annotation, module.imports, self.index):
                        self._add(type_id, field_kind, f"{public_path}.{item.target.id}", module, line)

    def _scan_imports(self) -> None:
        on_api = {u.type for u in self.uses}
        for module in self.modules.values():
            seen: dict[str, int] = {}
            for target, line in module.imports.lines.items():
                type_id = self.index.type_of(target)
                if type_id:
                    seen.setdefault(type_id, line)
            for node in ast.walk(module.tree):
                if isinstance(node, ast.Attribute):
                    type_id = self.index.type_of(module.imports.resolve(node))
                    if type_id:
                        seen.setdefault(type_id, node.lineno)
            for type_id, line in sorted(seen.items()):
                if type_id not in on_api:
                    self._add(type_id, "imports", module.name, module, line, public=False)

    def rows(self) -> list[Use]:
        """One row per (type, kind, symbol): the first place it was seen."""
        out: dict[tuple[str, str, str], Use] = {}
        for use in self.uses:
            out.setdefault((use.type, use.kind, use.symbol), use)
        return list(out.values())
