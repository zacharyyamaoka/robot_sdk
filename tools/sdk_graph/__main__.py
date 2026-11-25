"""python -m tools.sdk_graph [build|check [--online]|readme|draft <package>]

  build (default)  scan the sibling checkouts and write site/data/graph.json
  check            lint every robot-sdk.toml against the code; exit 1 naming file:line on any mismatch
    --online       also fetch every declared link; exit 1 on any that doesn't answer 200 (a PyPI 404 = unpublished)
  readme           rewrite README.md's and skill/SKILL.md's generated tables from site/data/graph.json
  draft <package>  print a first robot-sdk.toml for a package from what the scanner finds (prune it by hand)
"""

from __future__ import annotations

import json
import sys

from . import declaration as decl
from . import links as link_check
from . import readme
from .graph import OUT, ROOT, SDK, build, sdk_layers, write
from .scan import PackageScan, TypeIndex


def check(online: bool = False) -> int:
    built = build()
    bad = 0
    for package, result in built.lints.items():
        print(f"{result.status:10} {package}")
        for failure in result.failures:
            print(f"           {package}/{failure}")
        bad += result.status == "fail"
    if online:
        owners = {p["id"]: p["links"] for p in built.graph["packages"]} | {a["id"]: a["links"] for a in built.graph["agents"]}
        print("\nlinks:")
        for owner, key, url, code, verdict in link_check.check_all(owners):
            print(f"  {verdict:11} {code!s:>4}  {owner}.{key}  {url}")
            bad += verdict == "dead"
    return 1 if bad else 0


def main(argv: list[str]) -> int:
    command = argv[0] if argv else "build"
    if command == "build":
        built = build()
        write(built)
        graph = built.graph
        print(f"wrote {OUT.relative_to(SDK)}: {len(graph['packages'])} packages, {len(graph['types'])} types, "
              f"{len(graph['uses'])} uses, {len(graph['agents'])} agents")  # fmt: skip
        for package, result in built.lints.items():
            print(f"  {result.status:10} {package}")
        return 0
    if command == "check":
        return check(online="--online" in argv[1:])
    if command == "readme":
        changed = readme.write(SDK, json.loads(OUT.read_text(encoding="utf-8")))
        print("rewrote " + ", ".join(changed) if changed else "README.md and skill/SKILL.md already match graph.json")
        return 0
    if command == "draft" and len(argv) == 2:
        package = argv[1]
        rows = PackageScan(ROOT / package, package, TypeIndex(ROOT)).rows()
        layer = sdk_layers(SDK).get(package, "leaf")
        role = "viewer" if layer == "viewers" else "library"
        print(decl.draft(package, rows, role, layer, ""), end="")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
