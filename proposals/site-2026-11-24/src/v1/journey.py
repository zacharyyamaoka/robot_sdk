"""V1 Layer Atlas journey: land, open the type lens, inspect JointTrajectory, fold the leaves band, scroll to the run."""

JT = '[data-id="type:robot_msgs.trajectory.JointTrajectory"]'


def _lens(page):
    page.click("[data-testid=lens-types]")


def _jt(page):
    page.click(JT)


def _fold(page):
    page.click("[data-testid=band-toggle-leaf]")


def _directory(page):
    page.evaluate("document.querySelector('[data-testid=card-robot_controllers]').scrollIntoView({block: 'center'})")
    page.wait_for_timeout(700)
    page.hover("[data-testid=links-robot_controllers] .pl-github")


def _example(page):
    page.click("[data-testid=nav-example]")


STEPS = [
    {"label": "Land", "caption": "The layer stack is the hero: 13 packages in 7 bands, vocabulary at the bottom, the traj_compare viewer as its own band on top, 15 pyproject deps (dashed = optional extra).", "act": None},
    {"label": "Packages + types", "caption": "The type lens inserts a band of the 8 most-used robot_msgs types just above vocabulary (the other 21 merge into '+21 more'): green arrows produce a type, blue arrows consume it; package deps switch off so the type edges read alone.", "act": _lens, "wait": 1300},
    {"label": "Inspect JointTrajectory", "caption": "Clicking JointTrajectory dims everything else and the inspector lists its 58 uses in 6 packages: robot_trajectories produces 11 and consumes 17, each row with public, declared/verified and its file:line.", "act": _jt, "wait": 1300},
    {"label": "Fold the leaves", "caption": "Collapsing the leaves band folds its 7 packages into one strip; the JointTrajectory edges re-route to it with counts (produces: 2 pkgs, 14 uses; consumes: 3 pkgs, 32 uses) and the inspector keeps the answer.", "act": _fold, "wait": 1400},
    {"label": "Directory: one click out", "caption": "Below the hero, every package card (the traj_compare viewer and the agent too) puts its in-site drill-down first, 'types & uses', then GitHub, PyPI and README from graph.json, plus Site wherever the package declares one.", "act": _directory, "wait": 1300},
    {"label": "Pick and place", "caption": "Further down the same page: the real (MuJoCo-simulated) UR5e pick-and-place run, one call per package, with its tool-path, joint and tracking-error plots.", "act": _example, "wait": 1600},
]
