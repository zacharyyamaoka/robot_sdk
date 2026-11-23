"""Record the landing page's hero video: hover through the domain diagram, then scroll to the pick-and-place.

    uv run --with playwright python /home/bam/robot_sdk/docs/record_landing.py [url]

Writes reports/media/landing-hover.webm and stills (desktop, hover, pipeline, phone) beside it.
"""
import sys
import pathlib
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://zacharyyamaoka.github.io/robot_sdk/"
OUT = pathlib.Path("/home/bam/robot_sdk/reports/media")
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")  # the installed Chrome; no browser download
    context = browser.new_context(viewport={"width": 1280, "height": 800}, record_video_dir=str(OUT / "_video"),
                                  record_video_size={"width": 1280, "height": 800})
    page = context.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(900)
    page.locator("#domain").scroll_into_view_if_needed()
    page.mouse.wheel(0, 250)
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / "landing-diagram.png"))
    for selector in ['.pkg[data-repo="robot_trajectories"]', '.pkg[data-repo="robot_controllers"]', '.type[data-type="JointTrajectory"]',
                     '.pkg[data-repo="robot_models"]', '.pkg[data-repo="robot_diagnostics"]', '.type[data-type="JointState"]']:
        page.hover(selector)
        page.wait_for_timeout(1300)
        if "controllers" in selector:
            page.screenshot(path=str(OUT / "landing-hover-controllers.png"))
    page.mouse.move(5, 5)
    page.wait_for_timeout(500)
    page.locator("#pick-and-place").scroll_into_view_if_needed()
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / "landing-pipeline.png"))
    for _ in range(6):
        page.mouse.wheel(0, 380)
        page.wait_for_timeout(450)
    page.wait_for_timeout(800)
    video = page.video
    context.close()
    pathlib.Path(video.path()).rename(OUT / "landing-hover.webm")
    phone = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    phone.goto(URL, wait_until="networkidle")
    phone.screenshot(path=str(OUT / "landing-phone.png"))
    browser.close()
print("ok")
