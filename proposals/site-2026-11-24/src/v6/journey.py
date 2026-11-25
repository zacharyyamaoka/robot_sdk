"""V6 "Repo" (robot-sdk as a GitHub repository page): the shared round-2 scenario (tools/record.py runs it on the built page).

Land -> what can I do with a JointTrajectory -> a consumer's package and its health -> switch to Latest release ->
the package tree with layer grouping off -> the Health tab. Selectors are data-testids V6 or the kit define.
"""


def _goto_type(page):
    # GitHub's "t" (Go to file) opens Go to type; the arrow query lists what takes the type.
    page.keyboard.press("t")
    page.wait_for_timeout(400)
    page.get_by_test_id("type-search-input").fill("JointTrajectory ->")


def _consumer(page):
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    head = page.locator("[data-testid='type-actions-consumers'] .k-siggroup-head button", has_text="traj_compare").first
    head.scroll_into_view_if_needed()
    head.click()


def _release(page):
    page.get_by_test_id("version-picker").first.click()
    page.wait_for_timeout(500)
    page.get_by_test_id("vp-option-release").click()
    page.wait_for_selector("[data-testid='version-diff-toggle']", timeout=8000)
    page.wait_for_timeout(500)
    page.get_by_test_id("version-diff-toggle").click()


def _tree_ungrouped(page):
    page.get_by_test_id("back-to-live").click()
    page.wait_for_timeout(900)
    page.get_by_test_id("v6-pkg-close").click()
    page.wait_for_timeout(900)
    box = page.get_by_test_id("pm-group-by-layer")
    if box.is_checked():
        box.click()


def _health(page):
    page.locator("[data-ws='health']").first.click()
    page.wait_for_timeout(700)
    page.get_by_test_id("v6-check-expand-traj_compare").click()


STEPS = [
    {"label": "Land on Types",
     "caption": "Home is the Types tab of a GitHub-style repo page: JointTrajectory (the most-used type, 58 rows) with "
                "'What can I do with it?' on the right (36 functions in 4 packages take one, 16 in 3 return one), and GitHub's "
                "right column: About, Releases (13 versions, Live default), Health. The Health tab counter is red: 4 failing.",
     "act": None, "wait": 1200},
    {"label": "What can I do with a JointTrajectory?",
     "caption": "GitHub's t (Go to file) is Go to type: 'JointTrajectory ->' lists the 36 functions that take one, by package "
                "with its health dot (robot_controllers 11, robot_metrics 4, robot_trajectories 17, traj_compare 4), each with "
                "its other inputs/outputs and a file:line link.",
     "act": _goto_type, "wait": 1300},
    {"label": "A consumer and its health",
     "caption": "traj_compare, one of the four consumers, opens on the package tree with GitHub's right column for it: Tests "
                "failed on main 1105f65 (Details goes to the CI run), Release warns (not on PyPI yet), and it takes "
                "JointTrajectory x4 and returns it x2.",
     "act": _consumer, "wait": 1700},
    {"label": "Switch to Latest release",
     "caption": "The branch/tag picker top right moves the whole site to Latest release: only 4 of 14 packages have a v* tag, so "
                "traj_compare is not in it; the banner lists what differs from Live (10 packages, 24 types and 238 type uses "
                "fewer) and every tab counter changes (Types 7, Packages 4, Health 4 warnings).",
     "act": _release, "wait": 1700},
    {"label": "Tree, layer grouping off",
     "caption": "Back to Live and the whole map: with 'group by layer' unticked the 14 packages form a plain tree from their "
                "pyproject deps, robot_msgs at the bottom, edges routed by ELK; failing packages carry a red stripe on the left.",
     "act": _tree_ungrouped, "wait": 1700},
    {"label": "Health as PR checks",
     "caption": "The Health tab reads like a pull request's checks box: 'Some checks were not successful', 4 failing, 10 with "
                "warnings, 2 successful members (80 checks). traj_compare expanded lists its 5 checks with ✓/✗/● and Details; "
                "the full member x check matrix follows below.",
     "act": _health, "wait": 1300},
]
