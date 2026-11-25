"""V5 Commit Dashboard walkthrough (tools/record.py runs it)."""

MAP = "document.getElementById('map').scrollIntoView({block: 'start'})"


def _types(page):
    page.evaluate(MAP)
    page.wait_for_timeout(300)
    page.get_by_test_id("toggle-types").click()
    page.wait_for_timeout(900)
    page.get_by_test_id("type-JointTrajectory").click()


def _gaps(page):
    page.get_by_test_id("drawer-close").click()
    page.wait_for_timeout(500)
    page.get_by_test_id("toggle-gaps").click()


def _collapse(page):
    page.get_by_test_id("toggle-gaps").click()
    page.wait_for_timeout(500)
    page.get_by_test_id("band-toggle-leaf").click()


def _cards(page):
    page.evaluate("document.getElementById('agents').scrollIntoView({block: 'start'})")


STEPS = [
    {"label": "Land", "caption": "One computed verdict (13 packages, all lint-pass; 63 of 253 type uses declared and verified), KPI tiles and the commit stamp, then the health map with a coverage bar on every package.", "act": None},
    {"label": "JointTrajectory", "caption": "Type edges on, JointTrajectory clicked: the map narrows to the packages that produce, consume or import it, each node shows its own declared share, and the drawer lists all 58 uses with file:line.", "act": _types, "wait": 1600},
    {"label": "Only gaps", "caption": "Only gaps dims everything already declared and verified, so the 190 uses found in code but not declared yet stand out (neutral grey, not red: red is reserved for lint failures).", "act": _gaps, "wait": 1600},
    {"label": "Collapse leaves", "caption": "The leaves layer folds into one aggregate node with its combined coverage bar; edges reroute to it, and expand restores it.", "act": _collapse, "wait": 1600},
    {"label": "Agents and last run", "caption": "Below the map: the Trajectory Tracking Agent's KPI and to-dos from its status.json, and the last pick-and-place run on the simulated MuJoCo UR5e with its stages and plots.", "act": _cards, "wait": 1200},
]
