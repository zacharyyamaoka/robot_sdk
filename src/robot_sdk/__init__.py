"""robot-sdk: the pinned set of robot-* packages. Holds no code of its own."""

# Layer of each package, bottom to top. tools/check_layers.py enforces the rule
# that a package imports only from layers below it (leaves never import each other).
LAYERS = {
    "robot_msgs": "vocabulary",
    "robot_models": "models",
    "robot_controllers": "leaf",
    "robot_reach": "leaf",
    "robot_thermal": "leaf",
    "robot_trajectories": "leaf",
    "robot_autonomy": "leaf",
    "robot_metrics": "leaf",
    "robot_activity": "leaf",
    "like_keras": "comms",
    "sim2real": "outer",
    "robot_diagnostics": "checks",
}
