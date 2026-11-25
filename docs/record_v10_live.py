"""Record the shipped V10 Docs site on its live domain: land, open a package from the sidebar, the package map, then the
robot-sdk logo back to the landing page; plus an old /v10/ link and the phone drawer.

    uv run --with playwright python /home/bam/robot_sdk/docs/record_v10_live.py [url]

Writes reports/media/v10-live-*.png and v10-live-hero.webm (+ .gif fallback when ffmpeg is installed).
"""
import pathlib
import shutil
import subprocess
import sys

from playwright.sync_api import sync_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else "https://robotsdk.dev/").rstrip("/") + "/"
OUT = pathlib.Path("/home/bam/robot_sdk/reports/media")
OUT.mkdir(parents=True, exist_ok=True)
facts = {}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")  # the installed Chrome; no browser download
    context = browser.new_context(viewport={"width": 1440, "height": 900}, record_video_dir=str(OUT / "_video"),
                                  record_video_size={"width": 1440, "height": 900})
    page = context.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL, wait_until="networkidle")
    page.wait_for_selector("[data-page='overview/']")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / "v10-live-landing.png"))
    box = page.locator(".d-sidebar").bounding_box()
    facts["sidebar_px"] = round(box["width"]) if box else None
    facts["switcher"] = page.locator("#rsdk-switch").count()
    page.locator(".d-sidebar a", has_text="robot_controllers").first.click()
    page.wait_for_selector("[data-page='packages/robot_controllers']")
    page.wait_for_timeout(1800)
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(1000)
    page.click("[data-ws='packages']")
    page.wait_for_selector("[data-page='packages/']")
    page.wait_for_timeout(2200)
    page.screenshot(path=str(OUT / "v10-live-packages.png"))
    page.click("[data-testid='d-brand']")  # the robot-sdk logo
    page.wait_for_selector("[data-page='overview/']")
    page.wait_for_timeout(1600)
    facts["logo_hash"] = page.evaluate("location.hash")
    page.screenshot(path=str(OUT / "v10-live-logo.png"))
    page.goto(URL + "v10/#/types/JointTrajectory", wait_until="networkidle")  # an old switcher-era link
    page.wait_for_selector("[data-page]")
    page.wait_for_timeout(1500)
    facts["old_link_lands_on"] = page.url
    facts["console_errors"] = errors
    video = page.video
    context.close()
    hero = OUT / "v10-live-hero.webm"
    pathlib.Path(video.path()).rename(hero)
    shutil.rmtree(OUT / "_video", ignore_errors=True)

    phone = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    phone.goto(URL, wait_until="networkidle")
    phone.wait_for_selector("[data-page='overview/']")
    phone.wait_for_timeout(800)
    phone.screenshot(path=str(OUT / "v10-live-phone.png"))
    facts["phone_overflow_px"] = phone.evaluate("document.documentElement.scrollWidth - innerWidth")
    phone.click("[data-testid='d-burger']")
    phone.wait_for_timeout(700)
    phone.screenshot(path=str(OUT / "v10-live-phone-drawer.png"))
    browser.close()

if shutil.which("ffmpeg"):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(hero), "-vf",
                    "fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse",
                    str(OUT / "v10-live-hero.gif")], check=True)
print(facts)
