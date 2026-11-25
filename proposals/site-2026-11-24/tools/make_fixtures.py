"""Test fixtures (gitignored, labelled TEST DATA): copies of the live graph.json for the swap test and the links gate.

    python3 /home/bam/robot_sdk/proposals/site-2026-11-24/tools/make_fixtures.py

graph-links.json: the live graph plus `links` on the four packages Zach named as having their own site (2026-11-24);
the real links arrive from each package's robot-sdk.toml via tools/sdk_graph. graph-2x.json: every package, type and
use duplicated with a "_x2" suffix, to check layouts survive twice the data with no code change.
"""
import copy, json
from pathlib import Path
REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "reports/media/site-proposals-2026-11-24/_fixtures"
OUT.mkdir(parents=True, exist_ok=True)
g = json.loads((REPO / "site/data/graph.json").read_text())
SITES = {"robot_metrics": "https://zacharyyamaoka.github.io/robot_metrics/", "robot_activity": "https://zacharyyamaoka.github.io/robot_activity/",
         "robot_controllers": "https://zacharyyamaoka.github.io/robot-controllers/", "robot_msgs": "https://robotmsgs.com"}
gl = copy.deepcopy(g)
for p in gl["packages"]:
    if p["id"] in SITES and not p.get("links"):
        p["links"] = {"github": p["repo_url"], "site": SITES[p["id"]], "pypi": f"https://pypi.org/project/{p['pypi']}/", "docs": SITES[p["id"]]}
gl["sources"] = {**gl.get("sources", {}), "fixture": "TEST DATA: links added by make_fixtures.py"}
(OUT / "graph-links.json").write_text(json.dumps(gl, indent=1))
g2 = copy.deepcopy(g)
ids = {p["id"] for p in g["packages"]}
for p in g["packages"]:
    q = copy.deepcopy(p); q["id"] += "_x2"
    q["deps"]["required"] = [d + "_x2" if d in ids and d != "robot_msgs" else d for d in q["deps"]["required"]]
    g2["packages"].append(q)
for t in g["types"]:
    u = copy.deepcopy(t); u["id"] += "_x2"; u["name"] += "_x2"; g2["types"].append(u)
for u in g["uses"]:
    v = copy.deepcopy(u); v["package"] += "_x2"; v["type"] += "_x2"; g2["uses"].append(v)
g2["sources"] = {**g2.get("sources", {}), "fixture": "TEST DATA: 2x duplicate"}
(OUT / "graph-2x.json").write_text(json.dumps(g2, indent=1))
print(len(g2["packages"]), len(g2["types"]), len(g2["uses"]))
