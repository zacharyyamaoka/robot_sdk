# robot-sdk

A generic, unbranded robotics backend in plain Python: messages, models, controllers, reach, thermal limits, trajectories and sim-to-real calibration.
`robot-sdk` is one install for all of the `robot-*` packages, with versions pinned to a set known to work together.
It's a distribution, like a ROS release (Jazzy) or LAAS's robotpkg, which ships Pinocchio.
This package holds no code of its own. Each package keeps its own repo, its own PyPI name and its own release schedule.

```bash
pip install robot-sdk
```

## The layers (bottom to top)

| Layer | Package (PyPI) | Repo | Rule |
|---|---|---|---|
| vocabulary | `robot-msgs` | `../robot_msgs` | Standard vocabulary (Pose, Trajectory, …). Strict semver, additive changes only |
| models | `robot-models-lib` | `../robot_models` | Generic models and parameters by type. Imports robot_msgs + numpy only |
| *(planned)* | robot_parts → robot_descriptions | n/a | One SKU per part, then the composition (CAN ids, fitted values) |
| leaf | `robot-controllers` | `../robot_controllers` | FF/FB pure functions + Layout |
| leaf | `robot-reach` | `../robot_reach` | Workspace, IK branches |
| leaf | `robot-thermal` | `../robot_thermal` | Motor/board heat, burst limits |
| leaf | `robot-trajectories` | `../robot_trajectories` | Trajectory generation |
| leaf | `robot-autonomy` | `../robot_autonomy` | |
| leaf | `robot-metrics` | `../robot_metrics` | |
| leaf | `robot-activity` | `../robot_activity` | |
| comms | `like_keras` | `../like_keras` | Components and ports over dora |
| outer | `sim2real` | `../sim2real` | The one-click API (`RobotTwin`, `.calibrate()`). May import everything below |

**Dependency rule:** a package imports only from layers below it. Leaves never import each other: when one needs another's behaviour it declares a Protocol or takes a function as an argument. `tools/check_layers.py` enforces this.

**Not in here:** GUIs and workbenches. They *use* the SDK, the way RViz uses ROS.

## Develop across all of them

Clone each package's repo next to this one (`../robot_msgs`, `../robot_models`, …), then `uv sync` here installs every package editable from those checkouts (see `[tool.uv.sources]`): one environment, one lockfile. The same idea as ROS's vcstool + colcon workspace. `uv sync --no-sources` installs the released versions from PyPI instead.

## Releasing a new stack version

Bump the pins in `pyproject.toml` (core: `~=` patch range; leaves: move fast on 0.x), run the tests, then tag.
