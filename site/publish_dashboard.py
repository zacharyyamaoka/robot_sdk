"""Build the live site into site/_build/: every 2026-11-24 proposal, with a bottom-right switcher that remembers the pick.

    python3 /home/bam/robot_sdk/site/publish_dashboard.py && python3 /home/bam/robot_sdk/site/publish_pages.py

Layout: / is the DEFAULT variant, /v1/ … /v10/ are every variant, and all of them read data/graph.json,
data/pick_and_place.json and (round 2) data/health.json + data/versions.json at runtime, so a refreshed graph updates
every variant without a rebuild.

WHY a switcher (Zach, 2026-11-24, "launch the site for me … with the ability to switch"; his standing rule
feedback_prototype_switch_in_app): gated variants get a temporary bottom-right in-app drop-down that remembers the pick
(localStorage), never a URL flag. Once he settles, set DEFAULT and drop SWITCHER to ship one page.
WHY two groups (Zach, 2026-11-24 round-2 feedback: "create 5 new proposals that I can switch between on the live landing
page"): round 2 (a site with workspaces) is listed first; round 1 stays reachable for comparison.
"""
import pathlib
import shutil

ROUNDS = [
    ("Round 2 · site with workspaces", {
        "v6": "V6 · Repo",
        "v7": "V7 · Workbench",
        "v8": "V8 · Type Search",
        "v9": "V9 · Buildfarm",
        "v10": "V10 · Docs",
    }),
    ("Round 1 · landing page", {
        "v1": "V1 · Layer Atlas",
        "v2": "V2 · Type Switchboard",
        "v3": "V3 · Canvas Map",
        "v4": "V4 · Catalog",
        "v5": "V5 · Commit Dashboard",
    }),
]
# WHY v6 (2026-11-25): round 2's AI prune pick, V6 Repo at 96/100 (prune.r2.json); round 1's was v5 at 92. Your own pick
# in the switcher still wins for you (localStorage); change this line to make another design the page everyone lands on.
DEFAULT = "v6"
SWITCHER = True

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD = ROOT / "site" / "_build"
PROPOSALS = ROOT / "proposals" / "site-2026-11-24"
# WHY only built variants: the hourly refresh runs this file from main; a variant whose build is not committed yet is
# left out of the switcher instead of failing the publish.
VARIANTS = {v: label for _, group in ROUNDS for v, label in group.items() if (PROPOSALS / v / "index.html").is_file()}

SWITCHER_HTML = """
<div id="rsdk-switch" style="position:fixed;right:14px;bottom:14px;z-index:2147483647;font:13px system-ui,sans-serif;
  background:rgba(20,22,26,.92);color:#fff;border-radius:10px;padding:6px 8px;box-shadow:0 4px 18px rgba(0,0,0,.25);
  display:flex;gap:6px;align-items:center">
  <span style="opacity:.75">Site design</span>
  <select aria-label="Site design" style="font:inherit;border-radius:6px;border:0;padding:3px 6px">__OPTIONS__</select>
</div>
<script>
(function () {
  var KEY = "robot-sdk-site-variant", CURRENT = "__CURRENT__", DEFAULT = "__DEFAULT__", AT_ROOT = __AT_ROOT__;
  var select = document.querySelector("#rsdk-switch select");
  select.value = CURRENT;
  function href(v) { var base = AT_ROOT ? "./" : "../"; return v === DEFAULT ? base : base + v + "/"; }
  select.addEventListener("change", function () {
    try { localStorage.setItem(KEY, select.value); } catch (e) {}
    location.href = href(select.value) + location.hash;
  });
  if (AT_ROOT) {  // the root remembers: open the last-picked design
    var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved && saved !== DEFAULT && saved !== CURRENT && __VALID__.indexOf(saved) >= 0) location.replace(href(saved) + location.hash);
  }
})();
</script>
"""


def page(variant: str, at_root: bool) -> str:
    text = (PROPOSALS / variant / "index.html").read_text()
    data = "data/" if at_root else "../data/"
    meta = f'<meta name="robot-sdk-data" content="{data}">'
    text = text.replace("<head>", "<head>\n" + meta, 1)
    if SWITCHER:
        options = "".join(
            f'<optgroup label="{title}">'
            + "".join(f'<option value="{v}">{label}{" (default)" if v == DEFAULT else ""}</option>' for v, label in group.items() if v in VARIANTS)
            + "</optgroup>"
            for title, group in ROUNDS if any(v in VARIANTS for v in group))
        switch = (SWITCHER_HTML.replace("__OPTIONS__", options).replace("__CURRENT__", variant).replace("__DEFAULT__", DEFAULT)
                  .replace("__AT_ROOT__", "true" if at_root else "false").replace("__VALID__", str(list(VARIANTS))))
        index = text.rfind("</body>")
        text = text[:index] + switch + text[index:] if index >= 0 else text + switch
    return text


if BUILD.exists():
    shutil.rmtree(BUILD)
(BUILD / "data").mkdir(parents=True)
(BUILD / "index.html").write_text(page(DEFAULT, at_root=True))
if SWITCHER:
    for variant in VARIANTS:
        (BUILD / variant).mkdir()
        (BUILD / variant / "index.html").write_text(page(variant, at_root=False))
for name in ("graph.json", "pick_and_place.json"):
    shutil.copy2(ROOT / "site" / "data" / name, BUILD / "data" / name)
for name in ("health.json", "versions.json"):  # the Health workspace and version picker (docs/site-data-schema.md)
    if (ROOT / "site" / "data" / name).exists():
        shutil.copy2(ROOT / "site" / "data" / name, BUILD / "data" / name)
if (ROOT / "site" / "data" / "versions").is_dir():  # generated, gitignored: present after `python -m tools.sdk_graph versions`
    shutil.copytree(ROOT / "site" / "data" / "versions", BUILD / "data" / "versions")
shutil.copytree(ROOT / "site" / "media", BUILD / "media")
(BUILD / ".nojekyll").touch()
print(BUILD / "index.html")
