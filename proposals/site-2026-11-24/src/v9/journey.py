"""V9 Buildfarm: the shared round-2 scenario walkthrough (tools/record.py runs it on the real built page).

Selectors are data-testid / data-ws attributes V9 and the kit define; numbers in the captions are today's
site/data (graph.json, health.json, versions.json + versions/release/*) as rendered on the page.
"""


def _click(sel):
    def act(page):
        el = page.locator(sel).first
        el.scroll_into_view_if_needed()
        el.click()
    return act


def _jump_to_type(page):
    # Two actions from the home: type into the sidebar's "Jump to a type" box, press Enter.
    box = page.locator("[data-testid='type-jump-input']").first
    box.click()
    box.type("JointTrajectory", delay=35)
    page.wait_for_timeout(350)
    box.press("Enter")


def _open_consumer(page):
    # robot_controllers takes a JointTrajectory in today's graph.json; its package name in "What can I do with it?".
    btn = page.locator("[data-testid='type-actions-consumers'] .k-siggroup-head button", has_text="robot_controllers").first
    btn.scroll_into_view_if_needed()
    btn.click()


def _latest_release(page):
    page.locator("[data-ws='health']").first.click()
    page.wait_for_timeout(500)
    page.locator("[data-testid='version-picker']").first.click()
    page.wait_for_timeout(500)
    page.locator("[data-testid='vp-option-release']").first.click()
    page.wait_for_timeout(1200)
    page.mouse.move(700, 10)


def _tree_ungrouped(page):
    page.locator("[data-testid='back-to-live']").first.click()
    page.wait_for_timeout(500)
    page.locator("[data-ws='packages']").first.click()
    page.wait_for_timeout(700)
    # Packages reopens the last package (robot_controllers, step 3): back to the whole tree.
    close = page.locator("[data-testid='pkg-close']")
    if close.count():
        close.first.click()
        page.wait_for_timeout(900)
    box = page.locator("[data-testid='pm-group-by-layer']").first
    if box.is_checked():
        box.click()


def _failing_with_evidence(page):
    page.locator("[data-ws='health']").first.click()
    page.wait_for_timeout(500)
    page.locator("[data-testid='hm-filter-fail']").first.click()
    page.wait_for_timeout(400)
    page.locator("[data-testid='hm-cell-robot_collision-tests']").first.click()
    page.wait_for_timeout(300)
    page.locator("[data-testid='hm-cell-traj_compare-tests']").first.hover()


STEPS = [
    {"label": "Land on the health matrix",
     "caption": "Home is the build-farm grid: 14 packages and 2 agents × 5 checks at Live, failing first in each layer (✗ 4 · ⚠ 10 · ✓ 2), beside each package's version and type uses at Live, Latest release and the newest snapshot; purple = differs from Live.",
     "act": None, "wait": 1300},
    {"label": "What can I do with a JointTrajectory?",
     "caption": "Two actions from home (type in the sidebar's jump box, Enter): 36 public functions take one, in 4 packages, each with its file:line and its package's health dot; 16 return one (3 packages). The sidebar folds to icons so the switchboard gets the width.",
     "act": _jump_to_type, "wait": 1600},
    {"label": "A consumer's package and its health",
     "caption": "robot_controllers' job page: tests passing on main 3159fe9, declaration matches, 8 types verified, release a warning (pins ~=0.1.0, not on PyPI yet), repo public; 0.1.0 · 34 uses on Live, not tagged in Latest release.",
     "act": _open_consumer, "wait": 1400},
    {"label": "Switch to Latest release",
     "caption": "Latest release focused: its column is outlined and the checks switch to the tagged trees (0 failing, 4 warnings: no robot-sdk.toml at those tags); 10 of 14 packages are not tagged, and robot_msgs 0.3.0 and robot_models 0.2.0 differ from Live in purple.",
     "act": _latest_release, "wait": 1400},
    {"label": "Package tree, group by layer off",
     "caption": "Back on Live, the package tree with 'group by layer' off: the 14 packages' pyproject deps as a plain layered tree, each node edged in its worst check (red: sim2real, traj_compare, robot_reach, robot_collision).",
     "act": _tree_ungrouped, "wait": 1800},
    {"label": "Failing only, with the evidence",
     "caption": "Failing filter: 4 rows. robot_reach, sim2real and traj_compare fail test.yml on main (hover shows the run: traj_compare at 1105f65; a click opens GitHub Actions); robot_collision has no public repo (404), so its CI reads unknown (detail row open).",
     "act": _failing_with_evidence, "wait": 1200},
]
