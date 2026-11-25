"""Build the V10-ship + robotsdk.dev report: one self-contained HTML page, media inlined.

    python3 /home/bam/robot_sdk/docs/record_v10_live.py   (via uv run --with playwright, makes reports/media/v10-live-*)
    python3 /home/bam/robot_sdk/docs/build_v10_ship_report.py

Writes reports/media/robotsdk-dev-v10-2026-11-25.html (media pages live in the gitignored reports/media/).
"""
import base64
import pathlib

MEDIA = pathlib.Path("/home/bam/robot_sdk/reports/media")
OUT = MEDIA / "robotsdk-dev-v10-2026-11-25.html"


def uri(name: str, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode((MEDIA / name).read_bytes()).decode()


FACTS = [
    ("Root page", "https://robotsdk.dev/ → 200, 2.67 MB V10 page, valid certificate"),
    ("Left docs sidebar on the landing page", "286 px wide at 1440 × 900; “Overview” marked current"),
    ("robot-sdk logo", "from robot_controllers’ page → <code>#/overview</code>, the same landing page"),
    ("Design switcher", "gone (0 <code>#rsdk-switch</code> on the page)"),
    ("Old switcher-era link", "<code>/v10/#/types/JointTrajectory</code> → <code>robotsdk.dev/#/types/JointTrajectory</code>"),
    ("www", "<code>www.robotsdk.dev/x</code> → 301 <code>https://robotsdk.dev/x</code>"),
    ("Runtime data", "<code>data/graph.json</code> and <code>data/health.json</code> → 200 (five tries each)"),
    ("Phone (390 px)", "0 px horizontal overflow; the hamburger opens the same sidebar as a drawer"),
    ("Console", "0 errors over the whole recorded journey"),
    ("Tests", "<code>uv run pytest</code> in robot_sdk: 107 passed"),
]

html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>robotsdk.dev · V10 shipped</title>
<style>
:root{{--bg:#fff;--fg:#1c1e21;--mut:#5f6368;--line:#e3e5e8;--ok:#1e7f4f;--card:#f6f8fa}}
@media (prefers-color-scheme:dark){{:root{{--bg:#16181c;--fg:#e6e8eb;--mut:#9aa0a6;--line:#2b2f36;--ok:#4cc38a;--card:#1e2127}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:1100px;margin:0 auto;padding:28px 16px 60px}}
h1{{font-size:26px;margin:0 0 6px}} h2{{font-size:19px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}}
.verdict{{font-size:17px;margin:4px 0 18px}} .verdict b{{color:var(--ok)}}
video,img{{max-width:100%;border:1px solid var(--line);border-radius:8px;display:block}}
.cap{{color:var(--mut);font-size:13px;margin:6px 0 18px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
.phones{{display:flex;gap:16px;flex-wrap:wrap}} .phones figure{{margin:0;width:min(260px,100%)}}
figure{{margin:0}} code{{background:var(--card);padding:1px 5px;border-radius:4px;font-size:13px}}
table{{border-collapse:collapse;width:100%}} td{{border-top:1px solid var(--line);padding:7px 8px;vertical-align:top}}
td:first-child{{white-space:nowrap;font-weight:600;width:1%}}
ul{{padding-left:20px}} li{{margin:4px 0}} a{{color:var(--ok)}}
details summary{{cursor:pointer;color:var(--mut)}}
</style></head><body><main>
<h1>robot-sdk V10 Docs is live at robotsdk.dev</h1>
<p class="verdict"><b>Shipped:</b> V10 Docs is the only design, the logo opens the Overview landing page with the classic left docs
sidebar, and <a href="https://robotsdk.dev">robotsdk.dev</a> serves it. Landed on robot_sdk <code>main</code> @ <code>8e5c8cd</code>
(site <code>2645d73</code>, gh-pages <code>ef9cdbb</code>, Worker version <code>b3fc89e8</code>).</p>

<video controls autoplay muted loop playsinline poster="{uri('v10-live-landing.jpg', 'image/jpeg')}">
<source src="{uri('v10-live-hero.mp4', 'video/mp4')}" type="video/mp4">
</video>
<p class="cap">Recorded on the live https://robotsdk.dev at 1440 × 900: land on the Overview → robot_controllers from the sidebar →
Packages map → the robot-sdk logo back to the Overview → an old <code>/v10/#/types/JointTrajectory</code> link, which lands on the same type page.</p>
<details><summary>GIF fallback (if the video does not play)</summary><img src="{uri('v10-live-hero-small.gif', 'image/gif')}" alt="GIF of the same journey"></details>

<h2>The landing page</h2>
<div class="grid">
<figure><img src="{uri('v10-live-logo.jpg', 'image/jpeg')}" alt="Overview with sidebar"><p class="cap">What the robot-sdk logo opens (also the root URL):
Overview with the left docs sidebar (Overview › Packages by layer › Types by module › Directory › Health › Agents) and “On this page” on the right.</p></figure>
<figure><img src="{uri('v10-live-packages.jpg', 'image/jpeg')}" alt="Packages page"><p class="cap">Packages: a wide page with the same sidebar; the logo top-left leads back to the Overview.</p></figure>
</div>
<div class="phones">
<figure><img src="{uri('v10-live-phone.jpg', 'image/jpeg')}" alt="Phone overview"><p class="cap">Phone, 390 px: the Overview, no overflow.</p></figure>
<figure><img src="{uri('v10-live-phone-drawer.jpg', 'image/jpeg')}" alt="Phone drawer"><p class="cap">The hamburger opens the same sidebar as a drawer (Docusaurus’ pattern below 996 px).</p></figure>
</div>

<h2>Proved on the live domain</h2>
<table>{''.join(f'<tr><td>{k}</td><td>{v}</td></tr>' for k, v in FACTS)}</table>

<h2>How robotsdk.dev is wired</h2>
<ul>
<li><b>gh-pages stays the one published copy.</b> <code>site/publish_dashboard.py</code> builds it (now <code>DEFAULT = "v10"</code>, <code>SWITCHER = False</code>);
the hourly refresh workflow and <code>site/publish_pages.py</code> push it.</li>
<li><b>A Cloudflare Worker named <code>robotsdk</code></b> (<code>site/cloudflare/worker.js</code>) forwards every GET to <code>zacharyyamaoka.github.io/robot_sdk/</code>,
keeps GitHub’s redirects on robotsdk.dev, and sends <code>www</code> to the apex. Wrangler attached both custom domains and their certificates.</li>
<li><b>Why a proxy and not an upload:</b> the hourly refresh republishes graph.json and health.json. A proxy shows each refresh within GitHub’s
10-minute cache, with no deploy step and no Cloudflare token stored in GitHub. A static upload would go stale an hour after every deploy.</li>
<li>Fallback URL if the domain ever breaks: <code>https://robotsdk.zach-yamaoka.workers.dev</code>.</li>
</ul>

<h2>Decided for you</h2>
<ul>
<li><b>Kept V10’s Overview as the landing page.</b> It already sat inside the docs shell with the sidebar; the logo already linked to it. Undo: none needed.</li>
<li><b>Dropped the switcher and the /v1–/v10 builds; old links redirect.</b> Undo: <code>SWITCHER = True</code> in <code>site/publish_dashboard.py</code>, or <code>git revert 2645d73</code>, then republish.</li>
<li><b>Proxy Worker in front of GitHub Pages</b> rather than GitHub’s custom-domain setting: wrangler’s login can create Worker domains but not plain
DNS records. Undo: <code>wrangler rollback</code> in <code>site/cloudflare</code>, or delete the <code>robotsdk</code> Worker.</li>
<li><b>PyPI Homepage/Documentation → robotsdk.dev</b> in <code>pyproject.toml</code> (shows from the next release). Undo: <code>git revert 8e5c8cd</code>.</li>
</ul>

<h2>Left / not done</h2>
<ul>
<li>The round-1/2 proposal sources and builds stay in <code>proposals/site-2026-11-24/</code> as donor material. I did not delete them.</li>
<li>github.io/robot_sdk still answers too; it is the Worker’s origin, so it cannot redirect to robotsdk.dev.</li>
<li>One <code>data/health.json</code> request returned 500 while GitHub Pages was mid-deploy; every retry returned 200. Not reproducible.</li>
</ul>
</main></body></html>
"""
OUT.write_text(html)
print(OUT, f"{OUT.stat().st_size / 1e6:.2f} MB")
