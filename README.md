# robot-sdk

A generic, unbranded robotics backend in plain Python: messages, models, controllers, reach, thermal limits, trajectories and sim-to-real calibration.
`robot-sdk` is one install for all of the `robot-*` packages, with versions pinned to a set known to work together.
It's a distribution, like a ROS release (Jazzy) or LAAS's robotpkg, which ships Pinocchio.
This package holds no code of its own. Each package keeps its own repo, its own PyPI name and its own release schedule.

```bash
pip install robot-sdk
```

## For AI agents

[`skill/SKILL.md`](skill/SKILL.md) is an agent skill (Claude Code / Codex format): an index of every package and what it's for, so a coding agent assembles new robotics work from these packages instead of rewriting it. Link the `skill/` folder into your agent's skills directory as `robot-sdk`.

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
| checks | `robot-diagnostics` | `../robot_diagnostics` | Robot Diagnostics (RobotDx): a diagnostic = a metric + a threshold. Stdlib core; numpy, robot-metrics and sim2real via the `stock` extra |

**Dependency rule:** a package imports only from layers below it. Leaves never import each other: when one needs another's behaviour it declares a Protocol or takes a function as an argument. `tools/check_layers.py` enforces this.

**Not in here:** GUIs and workbenches. They *use* the SDK, the way RViz uses ROS.

## The agents (what builds the packages)

Packages are what agents build; agents are what build them, so both are tracked here. An agent is a self-contained black box: an outside view (objectives and gates, a frozen scorer, datasets), a population of solutions with their scorecards, a progress log kept in its own files, and a viewer that reads only the metrics. Point any coding agent at it and it carries on the search: compute + agent + black box = results.

| Agent | Repo | Objective | Builds on | Status |
|---|---|---|---|---|
| Trajectory Tracking Agent | `../trajectory_tracking_agent` | Lowest tool tracking error on a given trajectory, inside its gates (UR5e first) | `robot-msgs`, `robot-controllers` | its `status.json` (`ai-team-status/1`) |

**Dependency rule for agents:** an agent imports packages; a package never imports an agent. A building block that wins in an agent's search moves into its package by a PR there, and the agent then imports it. Each agent keeps its own repo, in the standard format: `README.md`, `OBJECTIVES.md`, `AGENTS.md`, `PROGRESS.md`, `ideas.md`, `REFERENCES.md`, `solutions/`, `ledger.jsonl`, `status.json`, `site/`.

## Develop across all of them

Clone each package's repo next to this one (`../robot_msgs`, `../robot_models`, …), then `uv sync` here installs every package editable from those checkouts (see `[tool.uv.sources]`): one environment, one lockfile. The same idea as ROS's vcstool + colcon workspace. `uv sync --no-sources` installs the released versions from PyPI instead.

## Releasing a new stack version

Bump the pins in `pyproject.toml` (core: `~=` patch range; leaves: move fast on 0.x), run the tests, then tag.
