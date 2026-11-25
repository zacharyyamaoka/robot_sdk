"""A package's `robot-sdk.toml`: the public contract it states, and the lint that holds it to the code.

    schema = "robot-sdk-declaration/1"
    role = "library"                  # library | viewer
    layer = "leaf"                    # vocabulary | models | leaf | comms | outer | checks | viewers
    one_line = "..."

    [[consumes]]                      # a public parameter (or an input record's field) of this type
    type = "robot_msgs.sensor.JointState"
    symbols = ["robot_controllers.core.Controller.tick"]

    [[produces]]                      # a public return (or an output record's field) of this type
    ...

The lint, both ways (Zach, 2026-11-24: "some linter that verifies it's true"):
* every declared (type, symbol) must be a public signature the scanner finds, of that kind;
* every shared type the public API consumes or produces must be declared for that kind (with at least one symbol).
A declaration names the symbols that ARE the contract; other public hits of a declared type need not be listed.
"""

from __future__ import annotations

import dataclasses
import pathlib
import re
import tomllib

from .scan import Use

FILE = "robot-sdk.toml"
SCHEMA = "robot-sdk-declaration/1"
ROLES = ("library", "viewer")
LAYERS = ("vocabulary", "models", "leaf", "comms", "outer", "checks", "viewers")
KINDS = ("consumes", "produces")


@dataclasses.dataclass
class Declaration:
    path: pathlib.Path
    role: str | None
    layer: str | None
    one_line: str | None
    entries: dict[tuple[str, str], list[str]]  # (kind, type) → symbols
    lines: dict[tuple[str, str, str | None], int]  # (kind, type, symbol | None for the type line) → line number
    problems: list[str]

    @classmethod
    def read(cls, repo: pathlib.Path) -> Declaration | None:
        path = repo / FILE
        if not path.exists():
            return None
        text = path.read_text(encoding="utf-8")
        problems: list[str] = []
        try:
            data = tomllib.loads(text)
        except tomllib.TOMLDecodeError as error:
            return cls(path, None, None, None, {}, {}, [f"{FILE}: not valid TOML ({error})"])
        if data.get("schema") != SCHEMA:
            problems.append(f"{FILE}:1: schema must be {SCHEMA!r}, got {data.get('schema')!r}")
        entries: dict[tuple[str, str], list[str]] = {}
        for kind in KINDS:
            for entry in data.get(kind, []):
                type_id, symbols = entry.get("type"), entry.get("symbols", [])
                if not isinstance(type_id, str) or not isinstance(symbols, list):
                    problems.append(f"{FILE}: a [[{kind}]] entry needs type = \"…\" and symbols = [\"…\"]")
                    continue
                entries.setdefault((kind, type_id), []).extend(symbols)
        lines = locate(text)
        role, layer = data.get("role"), data.get("layer")
        if role not in ROLES:
            problems.append(f"{FILE}:{_line(text, 'role')}: role must be one of {ROLES}, got {role!r}")
        if layer not in LAYERS:
            problems.append(f"{FILE}:{_line(text, 'layer')}: layer must be one of {LAYERS}, got {layer!r}")
        if not data.get("one_line"):
            problems.append(f"{FILE}:1: one_line is missing")
        return cls(path, role, layer, data.get("one_line"), entries, lines, problems)


def _line(text: str, key: str) -> int:
    for number, line in enumerate(text.splitlines(), 1):
        if re.match(rf"\s*{key}\s*=", line):
            return number
    return 1


def locate(text: str) -> dict[tuple[str, str, str | None], int]:
    """Line numbers of each [[kind]] entry's type and symbols, for lint messages that point at the file."""
    lines: dict[tuple[str, str, str | None], int] = {}
    kind = type_id = None
    in_symbols = False
    for number, line in enumerate(text.splitlines(), 1):
        stripped = line.split("#", 1)[0].strip()
        header = re.fullmatch(r"\[\[(\w+)\]\]", stripped)
        if header:
            kind, type_id, in_symbols = header.group(1), None, False
            continue
        if stripped.startswith("["):
            kind = None
            continue
        match = re.match(r'type\s*=\s*"([^"]+)"', stripped)
        if match and kind:
            type_id = match.group(1)
            lines.setdefault((kind, type_id, None), number)
            continue
        if stripped.startswith("symbols"):
            in_symbols = True
        if in_symbols and kind and type_id:
            for symbol in re.findall(r'"([^"]+)"', stripped):
                lines.setdefault((kind, type_id, symbol), number)
            if "]" in stripped:
                in_symbols = False
    return lines


@dataclasses.dataclass
class Lint:
    status: str  # pass | fail | undeclared
    failures: list[str]
    declared: set[tuple[str, str, str]]  # (type, kind, symbol) the declaration lists AND the code has
    missing: list[Use]  # declared but not found: rows with verified=false


def lint(package: str, uses: list[Use], declaration: Declaration | None) -> Lint:
    if declaration is None:
        return Lint("undeclared", [], set(), [])
    failures = list(declaration.problems)
    public = {(u.type, u.kind, u.symbol): u for u in uses if u.public and u.kind in KINDS}
    declared: set[tuple[str, str, str]] = set()
    missing: list[Use] = []
    for (kind, type_id), symbols in sorted(declaration.entries.items()):
        type_line = declaration.lines.get((kind, type_id, None), 1)
        if not symbols:
            failures.append(f"{FILE}:{type_line}: {kind} {type_id} lists no symbols; name the public API that "
                            f"{kind} it")  # fmt: skip
        for symbol in symbols:
            line = declaration.lines.get((kind, type_id, symbol), type_line)
            if (type_id, kind, symbol) in public:
                declared.add((type_id, kind, symbol))
                continue
            other = [k for k in KINDS if (type_id, k, symbol) in public]
            hint = f" (the code shows it {other[0]})" if other else " (no public signature of that name names the type)"
            failures.append(f"{FILE}:{line}: declares {symbol} {kind} {type_id}, but the code doesn't{hint}")
            missing.append(Use(package, type_id, kind, symbol, f"{FILE}:{line}", True))
    for (type_id, kind), first in sorted({(t, k): u for (t, k, s), u in sorted(public.items(), reverse=True)}.items()):
        if (kind, type_id) not in declaration.entries:
            failures.append(f"{first.where}: public API {first.symbol} {kind} {type_id}, which {FILE} doesn't declare")
    return Lint("fail" if failures else "pass", failures, declared, missing)


def draft(package: str, uses: list[Use], role: str, layer: str, one_line: str) -> str:
    """A first declaration from the scan: every public (type, kind) with all its symbols, for a human to prune."""
    out = [
        "# robot-sdk declaration: the shared types this package's public API takes (consumes) and gives (produces).",
        "# Checked against the code by robot_sdk's `python -m tools.sdk_graph check`.",
        f'schema = "{SCHEMA}"',
        f'role = "{role}"',
        f'layer = "{layer}"',
        f"one_line = {one_line!r}".replace("'", '"'),
    ]
    by: dict[tuple[str, str], list[str]] = {}
    for use in uses:
        if use.public and use.kind in KINDS:
            by.setdefault((use.kind, use.type), []).append(use.symbol)
    for (kind, type_id), symbols in sorted(by.items()):
        out += ["", f"[[{kind}]]", f'type = "{type_id}"', "symbols = ["]
        out += [f'  "{s}",' for s in sorted(set(symbols))]
        out += ["]"]
    return "\n".join(out) + "\n"
