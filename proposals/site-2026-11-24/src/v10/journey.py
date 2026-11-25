"""V10 Docs: the round-2 scenario walkthrough (tools/record.py runs it on the real built page at 1440 x 900).

Scenario (criteria.r2.json): land; "what can I do with a JointTrajectory?"; a consumer's package and its health;
switch to the latest release (what differs); the package tree with layer grouping off; the Health workspace.
Selectors are V10's own data-testids or the kit's; numbers in captions are read off today's site/data.
"""


def _click(sel):
    def act(page):
        el = page.locator(sel).first
        el.scroll_into_view_if_needed()
        el.click()
    return act


def _consumer_package(page):
    # robot_controllers takes a JointTrajectory in today's graph.json; its group head in "What can I do with it?" opens
    # its page. Fall back to the first consumer group.
    sel = ".d-ta [data-testid='type-actions-consumers'] .k-siggroup-head button.k-linkish"
    named = page.locator(sel + ":has(code:text-is('robot_controllers'))")
    (named if named.count() else page.locator(sel)).first.click()


def _back_then_release(page):
    page.go_back()  # browser Back: the JointTrajectory page again
    page.wait_for_selector("[data-testid='d-type-page']")
    page.wait_for_timeout(500)
    page.click("[data-testid='version-picker']")
    page.wait_for_timeout(450)
    page.click("[data-testid='vp-option-release']")


def _tree_layers_off(page):
    page.click("[data-testid='back-to-live']")
    page.wait_for_timeout(500)
    page.click("[data-ws='packages']")
    page.wait_for_selector("[data-testid='pm-canvas'][data-mode='tree']")
    page.wait_for_timeout(600)
    box = page.locator("[data-testid='pm-group-by-layer']")
    if box.is_checked():
        box.click()


STEPS = [
    {"label": "Land on the overview",
     "caption": "A docs site: the sidebar is the directory (14 packages by layer, 31 types by module, 2 agents), the announcement bar and the Health badge say 4 failing · 10 warnings · 2 passing on every page, and Live sits top-right beside the GitHub icon.",
     "act": None, "wait": 1200},
    {"label": "What can I do with a JointTrajectory?",
     "caption": "One click on the JointTrajectory card opens its page: 36 functions in 4 packages take it, 16 in 3 packages return one, each with file:line and its package's health dot; the switchboard and a health table follow.",
     "act": _click("[data-testid='d-start-JointTrajectory']"), "wait": 1400},
    {"label": "A consumer's package and its health",
     "caption": "robot_controllers' page: README-style shields (tests passing, declaration matches, 8 types verified, release not on PyPI, repo public), each opening its evidence, then its summary, install line and the health table.",
     "act": _consumer_package, "wait": 1400},
    {"label": "Switch to Latest release",
     "caption": "Back, then Latest release: the sidebar shrinks to that version (4 packages, 7 types), the banner reads 10 packages not in this version · 24 fewer types · 238 fewer type uses, and the page shows 7 uses (Live: 58), 4 functions in 1 package.",
     "act": _back_then_release, "wait": 1800},
    {"label": "Package tree, layers off",
     "caption": "Back to Live, then Packages with 'group by layer' unchecked: the plain tree of 14 packages from pyproject, robot_msgs at the bottom, each box's left edge coloured by its health.",
     "act": _tree_layers_off, "wait": 1800},
    {"label": "Health",
     "caption": "The Health workspace: failing first (robot_reach, robot_collision, traj_compare, sim2real), five checks per member; each cell opens its CI run, PyPI page or lint lines, each name its docs page.",
     "act": _click("[data-ws='health']"), "wait": 1400},
]
