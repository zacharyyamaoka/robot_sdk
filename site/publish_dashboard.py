"""Build the live site into site/_build/: all five 2026-11-24 proposals, with a bottom-right switcher that remembers the pick.

    python3 /home/bam/robot_sdk/site/publish_dashboard.py && python3 /home/bam/robot_sdk/site/publish_pages.py

Layout: / is the DEFAULT variant (V5 Commit Dashboard, the AI pick at 92/100), /v1/ … /v5/ are every variant, and all of
them read data/graph.json + data/pick_and_place.json at runtime, so a refreshed graph updates every variant without a
rebuild.

WHY a switcher (Zach, 2026-11-24, "launch the site for me … with the ability to switch"; his standing rule
feedback_prototype_switch_in_app): gated variants get a temporary bottom-right in-app drop-down that remembers the pick
(localStorage), never a URL flag. Once he settles, set DEFAULT and drop SWITCHER to ship one page.
"""
import pathlib
import shutil

VARIANTS = {
    "v1": "V1 · Layer Atlas",
    "v2": "V2 · Type Switchboard",
    "v3": "V3 · Canvas Map",
    "v4": "V4 · Catalog",
    "v5": "V5 · Commit Dashboard",
}
DEFAULT = "v5"
SWITCHER = True

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD = ROOT / "site" / "_build"
PROPOSALS = ROOT / "proposals" / "site-2026-11-24"

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
        options = "".join(f'<option value="{v}">{label}{" (default)" if v == DEFAULT else ""}</option>' for v, label in VARIANTS.items())
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
