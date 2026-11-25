"""V3 Canvas Map walkthrough: land on the map, isolate the most-used type, collapse a layer, fly to the run, fly to the agents."""

STEPS = [
    {"label": "Land", "caption": "The whole site is one map: what robot-sdk is and how to install it on the left, the 13 packages by layer to its right, the 29 robot_msgs types peeking in below.", "act": None},
    {"label": "Isolate JointTrajectory", "caption": "One click on 'Who uses JointTrajectory?': its 58 uses light up across the map (producers green, consumers blue, internal imports grey) and the inspector lists every use with kind, public, declared/verified and file:line.",
     "act": lambda page: page.click("[data-testid='cta-top-type']"), "wait": 1600},
    {"label": "Collapse the leaves", "caption": "Collapsing the leaves layer folds its 7 packages into one node; JointTrajectory's edges from robot_trajectories, robot_controllers and robot_metrics aggregate onto it with summed counts.",
     "act": lambda page: page.click("[data-testid='toggle-layer-leaf']"), "wait": 1500},
    {"label": "Fly to Pick and place", "caption": "The camera flies to the real run: six stages chained left to right, each line labelled with the type handed over, and the three plots from the simulated (MuJoCo) UR5e below.",
     "act": lambda page: (page.click("[data-testid='expand-all']"), page.keyboard.press("Escape"), page.click("[data-testid='fly-pick']")), "wait": 1700},
    {"label": "Fly to Agents", "caption": "The Trajectory Tracking Agent (KPI 0.031 mm) with its dotted purple builds-on lines crossing the map to robot_msgs and robot_controllers; packages never import it.",
     "act": lambda page: page.click("[data-testid='fly-agents']"), "wait": 1700},
]
