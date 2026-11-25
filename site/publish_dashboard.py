"""Build the live site from the chosen proposal (V5 Commit Dashboard, 2026-11-24) into site/_build/.

    python3 /home/bam/robot_sdk/site/publish_dashboard.py && python3 /home/bam/robot_sdk/site/publish_pages.py

WHY: the AI prune picked V5 (92/100, co-leader V2 at 89) and Zach's rule is to ship the recommended default, then let him
swap. Swapping to another variant = change VARIANT below. The previous page (site/build.py) stays buildable.
The page reads data/graph.json at runtime, so republishing a regenerated graph updates it without a rebuild.
"""
import pathlib
import shutil

VARIANT = "v5"
ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD = ROOT / "site" / "_build"
SOURCE = ROOT / "proposals" / "site-2026-11-24" / VARIANT / "index.html"

if BUILD.exists():
    shutil.rmtree(BUILD)
(BUILD / "data").mkdir(parents=True)
page = SOURCE.read_text()
meta = '<meta name="robot-sdk-data" content="data/">'
page = page.replace("<head>", "<head>\n" + meta, 1) if meta not in page else page
(BUILD / "index.html").write_text(page)
for name in ("graph.json", "pick_and_place.json"):
    shutil.copy2(ROOT / "site" / "data" / name, BUILD / "data" / name)
shutil.copytree(ROOT / "site" / "media", BUILD / "media")
(BUILD / ".nojekyll").touch()
print(BUILD / "index.html")
