"""V8 Type Search: the shared round-2 scenario, run by tools/record.py on the real built page (1440 x 900, real data).

Land -> "What can I do with a JointTrajectory?" (one click on the example chip) -> a consumer's package and its health
-> switch to Latest release (rows annotated "not in this version") -> the package tree with layer grouping off -> Health.
Selectors are V8's own data-testids plus the kit's (version-picker, vp-option-release, pm-mode-tree, pm-group-by-layer).
"""


def _click(sel):
    def act(page):
        el = page.locator(sel).first
        el.scroll_into_view_if_needed()
        el.click()
    return act


def _ask_joint_trajectory(page):
    page.locator("[data-testid='example-0']").click()  # "JointTrajectory ->"
    page.wait_for_selector("[data-testid='sec-takes']")


def _consumer_package(page):
    # traj_compare consumes JointTrajectory in today's graph.json and its tests fail on main: the health story.
    chip = page.locator("[data-testid='sec-takes'] [data-testid='res-pkg-traj_compare']")
    if not chip.count():
        page.locator("[data-testid='more-takes']").click()
    page.locator("[data-testid='sec-takes'] [data-testid='res-pkg-traj_compare']").first.click()
    page.wait_for_selector("[data-testid='package-panel']")
    page.wait_for_timeout(900)  # ELK layout


def _latest_release(page):
    page.locator("[data-ws='search']").click()  # back to the last query, version kept
    page.wait_for_selector("[data-testid='sec-takes']")
    page.locator("[data-testid='version-picker']").click()
    page.wait_for_timeout(350)
    page.locator("[data-testid='vp-option-release']").click()
    page.wait_for_selector("[data-testid='version-banner']")
    page.wait_for_selector("[data-testid='version-note']", timeout=8000)


def _tree_ungrouped(page):
    page.locator("[data-testid='back-to-live']").click()
    page.wait_for_timeout(500)
    page.locator("[data-ws='packages']").click()
    page.wait_for_selector("[data-testid='pm-mode-tree']")
    page.locator("[data-testid='pm-mode-tree']").click()
    page.wait_for_timeout(700)
    box = page.locator("[data-testid='pm-group-by-layer']")
    if box.is_checked():
        box.click()
    page.wait_for_timeout(900)


STEPS = [
    {"label": "Land on the type search",
     "caption": "Hoogle's front page for robot-sdk: one search box over 31 types and the 143 symbols that take or return them, four example queries, and the health summary (4 failing · 10 warnings · 2 passing) beside the version picker.",
     "act": None, "wait": 1200},
    {"label": "What can I do with a JointTrajectory?",
     "caption": "One click on 'JointTrajectory ->': 36 functions take it, in robot_trajectories, robot_controllers, robot_metrics and traj_compare, each with its signature, package health, public / declared badges and file:line; 'where to get one' (16) is one click more.",
     "act": _ask_joint_trajectory, "wait": 1200},
    {"label": "A consumer's package and its health",
     "caption": "Clicking traj_compare opens its package page beside the pipeline: tests fail on main (evidence link to the CI run), release warns, and it gets JointLimits, JointTrajectory and PoseTrajectory from robot_trajectories.",
     "act": _consumer_package, "wait": 1300},
    {"label": "Switch to Latest release",
     "caption": "Back on the same query at Latest release: only robot_metrics' 4 functions take a JointTrajectory there; the 32 that Live has are listed as 'not in Latest release — new on Live', and the banner sums up 10 packages not in this version.",
     "act": _latest_release, "wait": 1300},
    {"label": "Package tree, layers off",
     "caption": "Back to Live, Packages opens on the pipeline (robot_msgs hidden) with traj_compare still selected; Tree is one click, and 'group by layer' unticked leaves a plain layered tree of the 14 packages from their pyproject deps.",
     "act": _tree_ungrouped, "wait": 1300},
    {"label": "Health",
     "caption": "Health workspace: 16 members × 5 checks, failing first — robot_reach, robot_collision, traj_compare and sim2real; each cell opens its CI run, PyPI page or lint lines.",
     "act": _click("[data-ws='health']"), "wait": 1200},
]
