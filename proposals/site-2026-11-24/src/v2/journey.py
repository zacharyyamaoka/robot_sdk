"""V2 Type Switchboard: the scenario walkthrough (tools/record.py runs it on the real built page)."""


def _click(sel):
    def act(page):
        el = page.locator(sel).first
        el.scroll_into_view_if_needed()
        el.click()
    return act


def _consumer(page):
    # robot_controllers is a consumer of JointTrajectory in today's graph.json; fall back to the first consumer node.
    node = page.locator("[data-testid='sw-node-cons-robot_controllers']")
    (node if node.count() else page.locator("[data-testid^='sw-node-cons-']")).first.click()


STEPS = [
    {"label": "Land on the most-used type",
     "caption": "JointTrajectory (58 rows) is picked from the data: producers on the left in green, consumers on the right in blue, import-only packages below, each edge numbered with its rows.",
     "act": None, "wait": 1200},
    {"label": "Hide imports",
     "caption": "Turning 'imports' off leaves only the public API: 3 producers and 4 consumers; sim2real and robot_diagnostics only import it internally.",
     "act": _click("[data-testid='chip-imports']"), "wait": 1300},
    {"label": "Inspect robot_controllers",
     "caption": "Clicking the robot_controllers consumer lists its 11 rows on the right, each with symbol, public, declared/verified and a file:line link to GitHub.",
     "act": _consumer, "wait": 1300},
    {"label": "Group by layer",
     "caption": "'group by layer' folds the columns into one node per layer (e.g. leaves); click a layer node or its chip to expand it again.",
     "act": _click("[data-testid='chip-group']"), "wait": 1300},
    {"label": "Directory: one click out",
     "caption": "The Packages tab's side list is the directory: every package (traj_compare as a viewer) and the agent, name first to drill in here, then GitHub, PyPI and README on every one, and Site where the package declares one.",
     "act": _click("[data-testid='tab-packages']"), "wait": 1400},
    {"label": "Example as a type path",
     "caption": "The real (simulated MuJoCo) UR5e pick-and-place run: six package stages, each showing the robot_msgs types it takes and returns; each type links back to its switchboard.",
     "act": _click("[data-testid='tab-example']"), "wait": 1300},
]
