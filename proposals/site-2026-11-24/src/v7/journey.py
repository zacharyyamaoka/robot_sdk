"""V7 Workbench: the shared round-2 scenario, walked through the real built page (tools/record.py runs it).

Selectors are V7's own data-testids (stable) plus the kit's (pm-group-by-layer, back-to-live). Captions quote the
numbers the page shows on today's site/data (graph.json generated Nov 24 21:29, health.json Nov 24 22:14).
"""


def _click(sel, wait=0):
    def act(page):
        el = page.locator(sel).first
        el.scroll_into_view_if_needed()
        el.click()
        if wait:
            page.wait_for_timeout(wait)
    return act


def _seq(*acts):
    def act(page):
        for a in acts:
            a(page)
            page.wait_for_timeout(450)
    return act


def _quick_open(text):
    def act(page):
        page.keyboard.press("Control+p")
        page.wait_for_selector("[data-testid='quick-open-input']")
        page.keyboard.type(text, delay=35)
    return act


def _release(page):
    page.locator("[data-testid='sb-version']").click()
    page.wait_for_selector("[data-testid='qp-version-release']")
    page.wait_for_timeout(500)
    page.locator("[data-testid='qp-version-release']").click()
    page.wait_for_selector("[data-testid='sb-compare']", timeout=10000)
    page.wait_for_timeout(700)
    page.locator("[data-testid='sb-compare']").click()


STEPS = [
    {"label": "Land: JointTrajectory, Explorer open",
     "caption": "The window opens on the most-used type, JointTrajectory (58 rows): the switchboard beside 'What can I do with it?' (36 functions take one, 16 return one). The status bar carries health on every screen: 4 failing checks, 17 warnings.",
     "act": None, "wait": 1200},
    {"label": "What can I do with a JointTrajectory?",
     "caption": "Ctrl+P 'JointTrajectory ->' lists the 36 public functions that take one, each with its other types, its package's health dot and file:line, starting with robot_controllers' collision_stop (targets.py:225).",
     "act": _quick_open("JointTrajectory ->"), "wait": 1100},
    {"label": "A consumer's package and its health",
     "caption": "Picking traj_compare's Run.measured opens its package page: tests fail on main (test.yml at 1105f65, the CI run one click away) and its release is not on PyPI yet; the 6 of its 14 functions that touch JointTrajectory come first.",
     "act": _click("[data-testid^='qp-fn-traj_compare-']"), "wait": 1300},
    {"label": "Switch to Latest release",
     "caption": "The status-bar branch picker switches to Latest release: the bar turns amber, the Explorer marks what differs (D, M) and 'vs Live' opens the diff: 4 of 14 packages tagged, 31 → 7 types, 256 → 18 type uses; traj_compare has no v* tag yet.",
     "act": _release, "wait": 1500},
    {"label": "Split: types beside the ungrouped tree",
     "caption": "Back on Live, Split Editor puts the package tree beside JointTrajectory, linked: the 7 packages that touch it are ringed and tagged (returns · takes, imports, defines); 'group by layer' is off, so it is a plain dependency tree.",
     "act": _seq(_click("[data-testid='back-to-live']", 900), _click("[data-testid='tab-types/JointTrajectory']", 600),
                 _click("[data-testid='split-editor']", 1500), _click("[data-testid='editor-group-1'] [data-testid='pm-group-by-layer']")), "wait": 1800},
    {"label": "Health board + Problems (Ctrl+J)",
     "caption": "The Health workspace puts the 4 failing packages first (robot_reach, robot_collision, traj_compare, sim2real), each cell one click from its CI run or PyPI page; Ctrl+J opens Problems: 22 rows with evidence links, JointTrajectory's packages still highlighted.",
     "act": _seq(_click("[data-testid='split-editor']", 500), _click("[data-ws='health']", 700),
                 lambda page: page.keyboard.press("Control+j")), "wait": 1300},
]
