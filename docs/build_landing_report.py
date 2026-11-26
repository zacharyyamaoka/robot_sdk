"""Record the live robotsdk.dev landing page and build its review report (one self-contained HTML page, media inlined).

    uv run --with playwright python /home/bam/robot_sdk/docs/build_landing_report.py [url]

Records a hero video of the live page (land, scroll the packages, hover a card's clip, the layer diagram, the run, then
Docs and the docs' logo back), takes stills at 1440 x 900 and 390 px, measures what the report claims (sidebar count,
horizontal overflow, console errors, old links), and writes reports/media/robotsdk-landing-<date>.html (gitignored
media folder). Sibling of build_v10_ship_report.py.
"""
import base64
import datetime
import html
import json
import pathlib
import shutil
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else "https://robotsdk.dev/").rstrip("/") + "/"
DATE = datetime.date.today().isoformat()
MEDIA = pathlib.Path("/home/bam/robot_sdk/reports/media")
SHOTS = MEDIA / f"landing-{DATE}"
OUT = MEDIA / f"robotsdk-landing-{DATE}.html"
SHOTS.mkdir(parents=True, exist_ok=True)
facts: dict = {}


FRAMES = SHOTS / "_frames"
frame_count = [0]
recording = [None]


def hold(page, ms: int) -> None:
    """Wait ms, capturing a frame every ~110 ms while the recording page is the one waiting.

    WHY frames, not Playwright's record_video (2026-11-25): with record_video on, the renderer crashed on load every
    time while the workstation was under memory pressure; screenshots of the same page do not."""
    if page is not recording[0]:
        page.wait_for_timeout(ms)
        return
    end = time.monotonic() + ms / 1000
    while time.monotonic() < end:
        page.screenshot(path=str(FRAMES / f"{frame_count[0]:05d}.jpg"), type="jpeg", quality=70)
        frame_count[0] += 1
        page.wait_for_timeout(60)


def scroll_to(page, selector: str, pause: int = 1400) -> None:
    page.evaluate(f"document.querySelector({json.dumps(selector)}).scrollIntoView({{behavior:'smooth',block:'start'}})")
    hold(page, pause)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--disable-gpu", "--disable-dev-shm-usage", "--renderer-process-limit=2"])
    # the hero recording
    shutil.rmtree(FRAMES, ignore_errors=True)
    FRAMES.mkdir()
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    recording[0] = page
    started = time.monotonic()
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    hold(page, 3500)
    page.screenshot(path=str(SHOTS / "desk-hero.png"))
    facts["sidebar_elements"] = page.locator(".d-sidebar, aside").count()
    facts["cards"] = page.locator(".pk").count()
    facts["hero_playing"] = page.evaluate("(()=>{var v=document.getElementById('hero-video');return !!v && !v.paused})()")
    facts["health_line"] = page.locator("#health").inner_text()
    scroll_to(page, "#assemble")
    page.screenshot(path=str(SHOTS / "desk-assemble.png"))
    scroll_to(page, "#packages")
    page.mouse.move(860, 520)
    page.hover("#pkg-robot_controllers")
    hold(page, 2200)
    facts["hover_clip_plays"] = page.evaluate("document.querySelector('#pkg-robot_controllers .pk-media').classList.contains('playing')")
    page.screenshot(path=str(SHOTS / "desk-packages.png"))
    page.mouse.wheel(0, 700)
    hold(page, 1200)
    scroll_to(page, "#layers")
    page.hover(".pkg[data-repo='robot_controllers']")
    hold(page, 1400)
    page.screenshot(path=str(SHOTS / "desk-layers.png"))
    scroll_to(page, "#example")
    page.screenshot(path=str(SHOTS / "desk-example.png"))
    page.mouse.wheel(0, 800)
    hold(page, 1400)
    page.screenshot(path=str(SHOTS / "desk-run.png"))
    page.evaluate("window.scrollTo({top:0,behavior:'smooth'})")
    hold(page, 1200)
    page.click(".nav-links a.docs")
    page.wait_for_selector("[data-page='overview/']")
    hold(page, 2000)
    facts["docs_url"] = page.url
    page.screenshot(path=str(SHOTS / "desk-docs.png"))
    page.click("[data-testid='d-brand']")
    page.wait_for_load_state("networkidle")
    hold(page, 1500)
    facts["docs_logo_returns_to"] = page.url
    facts["scroll_width_1440"] = page.evaluate("document.documentElement.scrollWidth")
    for link in ("#/packages/robot_collision", "v10/#/types/JointTrajectory"):
        fresh = context.new_page()  # a shared link is a fresh load, not a hash change on an open page
        fresh.goto(URL + link, wait_until="networkidle")
        fresh.wait_for_selector("[data-page]")
        fresh.wait_for_timeout(600)
        facts[f"old link /{link}"] = fresh.url
        fresh.close()
    facts["console_errors_1440"] = list(errors)
    fps = frame_count[0] / (time.monotonic() - started)  # real time: the frames play back at the speed they were taken
    context.close()

    # phone
    context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = context.new_page()
    phone_errors: list[str] = []
    page.on("console", lambda m: phone_errors.append(m.text) if m.type == "error" else None)
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(2500)
    page.screenshot(path=str(SHOTS / "phone-hero.png"))
    scroll_to(page, "#pkg-robot_reach", 1200)
    page.screenshot(path=str(SHOTS / "phone-card.png"))
    facts["scroll_width_390"] = page.evaluate("document.documentElement.scrollWidth")
    facts["console_errors_390"] = phone_errors
    context.close()
    # dark
    context = browser.new_context(viewport={"width": 1440, "height": 900}, color_scheme="dark")
    page = context.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(2500)
    page.screenshot(path=str(SHOTS / "desk-dark.png"))
    context.close()
    browser.close()

hero = SHOTS / "hero.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", f"{fps:.2f}", "-i", str(FRAMES / "%05d.jpg"), "-vf", "scale=1200:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-crf", "30", "-preset", "veryfast", "-threads", "2", "-movflags", "+faststart", "-an", str(hero)], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(hero), "-vf", "fps=6,scale=640:-2:flags=lanczos", str(SHOTS / "hero.gif")], check=True)
shutil.rmtree(FRAMES, ignore_errors=True)
for png in SHOTS.glob("*.png"):  # jpg copies keep the page small
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(png), "-q:v", "5", str(png.with_suffix(".jpg"))], check=True)
(SHOTS / "facts.json").write_text(json.dumps(facts, indent=1))


def uri(name: str, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64," + base64.b64encode((SHOTS / name).read_bytes()).decode()


def still(name: str, caption: str) -> str:
    return f'<figure><img src="{uri(name)}" alt="{html.escape(caption)}" loading="lazy"><figcaption>{caption}</figcaption></figure>'


ok = (facts["sidebar_elements"] == 0 and facts["scroll_width_1440"] == 1440 and facts["scroll_width_390"] == 390
      and not facts["console_errors_1440"] and not facts["console_errors_390"])
rows = "".join(f"<tr><th>{html.escape(k)}</th><td><code>{html.escape(json.dumps(v) if not isinstance(v, str) else v)}</code></td></tr>"
               for k, v in facts.items())
page_html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>robotsdk.dev landing</title>
<style>
:root{{--bg:#fff;--fg:#0b1b2b;--mut:#3d5166;--line:#d9e2ec;--ok:#2e8555;--bad:#d6402b;--card:#f2f6fa}}
@media (prefers-color-scheme:dark){{:root{{--bg:#07131f;--fg:#e6edf5;--mut:#a9b8c8;--line:#1b3046;--ok:#7cc39b;--bad:#ff6b57;--card:#0c1d2e}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:1120px;margin:0 auto;padding:28px 16px 60px}} h1{{font-size:26px;margin:0 0 6px}}
h2{{font-size:19px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}}
.verdict{{font-size:17px}} .verdict b{{color:{'var(--ok)' if ok else 'var(--bad)'}}}
video,img{{max-width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:10px}}
figure{{margin:0}} figcaption{{color:var(--mut);font-size:13.5px;margin:6px 0 0}}
.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}} .phones{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}}
table{{border-collapse:collapse;width:100%;font-size:13.5px}} th,td{{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:6px 8px}}
th{{width:220px;color:var(--mut);font-weight:600}} code{{overflow-wrap:anywhere}} ul{{padding-left:20px}}
@media (max-width:700px){{.grid,.phones{{grid-template-columns:1fr}}}}
</style></head><body><main>
<h1>robotsdk.dev: a landing page without the sidebar</h1>
<p class="verdict"><b>{'Live and verified' if ok else 'Live, but a check failed'}</b>: <code>{html.escape(URL)}</code> is now a pidtuna.com-style page
(hero reel, assembly steps, a card per package with its own recording, the layer diagram, the pick-and-place with real code);
the V10 Docs moved to <code>/docs/</code>, one click from the top bar, and every old link forwards there.</p>

<h2>The live page, recorded</h2>
<video autoplay muted loop playsinline controls poster="{uri('desk-hero.jpg')}"><source src="{uri('hero.mp4', 'video/mp4')}" type="video/mp4"></video>
<p style="font-size:13px;color:var(--mut)">Recorded from {html.escape(URL)} in headless Chrome, {DATE}: land, assembly steps, packages (hovering
robot_controllers plays its clip), the layer diagram traced, the run, then Docs and the docs' logo back. <a href="{uri('hero.gif', 'image/gif')}" download="hero.gif">GIF</a></p>

<h2>Stills</h2>
<div class="grid">
{still('desk-hero.jpg', 'Hero, 1440 × 900: no sidebar; the reel cuts real package recordings with a caption band naming each')}
{still('desk-assemble.jpg', 'A robot task is an assembly: five steps, each naming the packages it uses')}
{still('desk-packages.jpg', 'The packages: one card each, layer, languages, pip line, Landing page / Docs / GitHub / PyPI')}
{still('desk-layers.jpg', 'The layer diagram (site/build.py domain_svg), robot_controllers traced')}
{still('desk-example.jpg', 'The pick-and-place flow, as run')}
{still('desk-run.jpg', 'The real code excerpt beside the recorded stage results, plots below')}
{still('desk-docs.jpg', 'Docs in the top bar opens the V10 Docs at /docs/, sidebar intact')}
{still('desk-dark.jpg', 'Dark mode (system preference; the toggle remembers a choice)')}
</div>
<h2>Phone, 390 px</h2>
<div class="phones">{still('phone-hero.jpg', 'Top of the page')}{still('phone-card.jpg', 'A package card')}</div>

<h2>Measured on the live site</h2>
<table>{rows}</table>

<h2>Decided for you</h2>
<ul>
<li>Docs moved from <code>/</code> to <code>/docs/</code>; the landing forwards <code>/#/…</code> and <code>/v1…/v10/</code> forward to <code>/docs/#/…</code>. Undo: <code>git revert 455bd81</code> on main and re-publish.</li>
<li>The docs' logo now returns to the landing page (Docusaurus convention); the sidebar's Overview stays the docs home.</li>
<li>Package media are stills + 3 s clips cut from each package's own recordings (<code>site/landing_media.py</code>, sources in <code>site/media/landing/manifest.json</code>); robot_thermal has no recording, so its card says so; robot_diagnostics uses robot-sdk's own pick-and-place plot it scored.</li>
<li>One card grid ordered bottom to top with the layer on each card, rather than a block per layer (most layers hold one package).</li>
</ul>
<h2>Not done</h2>
<ul><li>The V10 Docs themselves are unchanged apart from the logo link; they stay light-only.</li>
<li>Card clips play on hover/focus only; on phones the cards show stills.</li></ul>
</main></body></html>
"""
OUT.write_text(page_html)
print(OUT, f"{OUT.stat().st_size / 1e6:.2f} MB", "OK" if ok else "CHECK FAILED", json.dumps(facts))
