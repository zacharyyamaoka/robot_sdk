"""python -m tools.sdk_graph [build|check|draft <package>]

  build (default)  scan the sibling checkouts and write site/data/graph.json
  check            lint every robot-sdk.toml against the code; exit 1 naming file:line on any mismatch
  draft <package>  print a first robot-sdk.toml for a package from what the scanner finds (prune it by hand)
"""

from __future__ import annotations

import sys

from . import declaration as decl
from .graph import OUT, ROOT, SDK, build, sdk_layers, write
from .scan import PackageScan, TypeIndex


def check() -> int:
    built = build()
    bad = 0
    for package, result in built.lints.items():
        print(f"{result.status:10} {package}")
        for failure in result.failures:
            print(f"           {package}/{failure}")
        bad += result.status == "fail"
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
        return check()
    if command == "draft" and len(argv) == 2:
        package = argv[1]
        rows = PackageScan(ROOT / package, package, TypeIndex(ROOT)).rows()
        role = "viewer" if package == "traj_compare" else "library"
        layer = sdk_layers(SDK).get(package, "viewers" if role == "viewer" else "leaf")
        print(decl.draft(package, rows, role, layer, ""), end="")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
