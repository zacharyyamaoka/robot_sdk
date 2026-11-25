---
name: robot-sdk
description: Index of the robot-sdk packages (robot_msgs, robot_models, robot_trajectories, robot_reach, robot_controllers, robot_thermal, robot_metrics, robot_activity, robot_autonomy, like_keras, traj_compare, sim2real, robot_diagnostics) — what each one is for and where to read more. Use BEFORE writing any robotics code (trajectories, kinematics/reach, control, PID/tuning, motor heat, metrics, sim-to-real, twins, calibration, robot messages, poses, fleet uptime, robot comms, diagnostics and health checks, trajectory comparison and dataset coverage viewers), so a new task is assembled from these stable sub-assemblies instead of rewritten. Not for GUI/workbench work.
---

# robot-sdk: assemble, don't rewrite

The goal of robot-sdk is that **building something new is mostly assembling sub-assemblies that already exist and already work.**
Each package is a stable, tested black box with a typed API.
An agent's first move on a robotics task is to find the packages that already solve it, not to write a script.

*Zach, 2026-11-23: "Our goal is to build up these tools as stable sub assemblies so doing anything new you are basically just assembling the things you have already done in the past!"*

## How to use this index

1. **Match the task to packages** with the table below. Most tasks touch two to four of them.
2. **Read the README of each matching package before writing code.** The README has the API, the quick start and the rules of that package. Then read its `docs/` (a `CONTRACT.md` or `docs/peps/` where one exists) and its `tests/`, which show real calls.
3. **Assemble.** Import the packages and pass the objects between them. They all join on `robot_msgs` types (`JointTrajectory`, `JointState`, `Pose`, `JointLimits`, …), so one package's output is usually another's input.
4. **When a piece is missing, add it to the package where it belongs**, following that package's README and the layer rule below. Don't write a one-off copy in your task folder. A gap you fill becomes the next sub-assembly.
5. **Say what you reused.** In your handoff, list which packages and functions you assembled and what you had to add.

**Where the code is.** Each package is its own git repo, named as in the table, at `github.com/zacharyyamaoka/<repo>`.
On a development machine the repos are checked out next to this one: if this skill is at `<root>/robot_sdk/skill/`, a package is at `<root>/<repo>/`. On Zach's machine `<root>` is `/home/bam`.
`pip install robot-sdk` installs the whole set at versions pinned to work together.

## The packages

| Package (repo) | What it is | Reach for it when |
|---|---|---|
| **robot_msgs** | The standard robot data types (ROS's geometry, sensor, trajectory and vision messages) as frozen Python dataclasses, *with* the functions between them: pose offsets, trajectory interpolation and resampling, point projection, depth to point cloud. `.show()` (Rerun) and `.plot()` (matplotlib) on every type. ROS 2 / bag export as an extra. | Any pose, transform, joint state, trajectory, limit, image or point cloud. **Never define your own Pose or Trajectory.** |
| **robot_models** (PyPI `robot-models-lib`) | Generic physical models of part *types* (servos, arms, conveyors, end effectors, sensors), each a ladder of models from ideal to learned (M0 ideal → M1 datasheet → M2 Coulomb + viscous → M3 friction …). Every rung states its parameters, equation and references. No maker, no SKU. | What parameters a model of an actuator or arm needs, which friction or dynamics model to use, how parameter names map. |
| **robot_trajectories** | A signal library for robot motion. Every trajectory kind is a `TrajectoryGenerator`: a plain function `f(JointSpace, numbers/points/poses) → JointTrajectory`, inside the limits and at rest at both ends. ~80 kinds: moves, waypoints (joint and Cartesian), random waypoints, pick and place, chirps, multisines, PRBS, step trains, PID tuning, friction ID, ISO 9283 tests, workspace sweeps, moving targets. `chain` / `split` to compose. The legs inside a kind are timed by a `WaypointTrajectoryGenerator` (points + joint limits in, a JointTrajectory out: minimum_jerk, trapezoid, ruckig, ruckig_pro, toppra as plugins), passed as `waypoint_generator=`. The robot (limits, FK/IK, dynamics, collision) is injected via `JointSpace`. | Generating any motion: test trajectories, excitation for system ID, pick-and-place paths, tuning signals, benchmarks. |
| **robot_reach** | Reachability of any arm in Cartesian and joint space, from FK and IK passed in as pure functions. Reach maps, joint maps, IK branches, orientations; save results, view them in viser. Example arms built in: pendulum, RR, five-bar, 3-DOF shoulder, UR5e. Loads URDFs. | Workspace, "can the arm reach X", IK branch choice, placing a robot or a bin, arm sizing. |
| **robot_controllers** | Controllers as black boxes: a robot_msgs message in, a `ServoCommand` out, `controller.tick(state, dt)`. Joint trajectory controller (Python and C++), joint impedance. Each benchmarked on a ladder of rungs (free motion, fast motion, impacts, pushes, replanning, host stalls) for performance and cost. | Tracking a trajectory, impedance or compliance, choosing a controller, host vs board control. |
| **robot_thermal** | Running servo motors above their continuous rating in short bursts, safely. v1: an I²t burst budget per drive plus a hard cut on board temperature. v2: a lumped thermal network per drive, fed by logged current, with a Kalman observer. Standard library at runtime. | Motor or board heat, burst limits, duty cycles, how hard a joint may be pushed. |
| **robot_metrics** | Performance metrics for robot parts: tracking error, stop error, lag, repeatability, with units. Works on a whole recording or a live feed, with identical numbers. Runs group into rungs, stations and deployments; pass/fail targets (objectives) are kept apart from the maths. Shaped like torchmetrics. | Scoring any run: target vs real, sim vs real, before vs after, pass/fail gates. |
| **robot_activity** | The Robot Activity Agent: measures whether each robot is doing useful work (claimed, active, moving), keeps a work queue moving, flags stalemates and gives every idle second a reason. | Fleet or robot utilisation, uptime dashboards, work queues. |
| **robot_autonomy** | The Robot Autonomy Agent: working hours between human interventions, from every source (chat asks, logs, faults, tickets), with the causes ranked as a to-do list. | Measuring and driving down human interventions; autonomy KPIs. |
| **like_keras** | The communication API: components with ports, systems that wire them from outside, deployments in one process or across the network. dora-rs is the first transport. (Design in progress: check `docs/CONTRACT.md`.) | Connecting robot components, sensors and processes; dataflows. |
| **robot_diagnostics** (RobotDx) | Diagnostics as checks: a diagnostic = a metric + a threshold, with a registry, records (ROS `DiagnosticStatus` shape), roll-ups and ~33 stock checks: tracking and stop error, ISO 9283, frequency response, fidelity, coverage, feedback, health, camera, events. Stdlib-only core; the stock maths (numpy, robot_metrics, sim2real) is the `stock` extra, imported lazily. The io-diagnostics app (dashboard, device tree) uses it. | Is this robot, joint or sensor healthy? Pass/fail checks on runs, health dashboards, turning a metric into an alarm. |
| **traj_compare** (PyPI `traj-compare`) | The viewers, on robot_msgs types: a turn-key A/B trajectory comparison viewer that writes one static `report.html` (target vs sim vs real), and the dataset coverage viewers, one payload feeding a data-ui page, Matplotlib, Viser and W&B: `traj_compare.coverage` (trajectories), `traj_compare.grasp_coverage` (grasps) and `traj_compare.record_coverage` (any list of dataclass records: each field against its declared `Value` range, class balance, missing values, "is more data still adding coverage?"). | Comparing runs (target vs sim vs real, before vs after), benchmark reports, "how much of the space does this dataset cover?". **Never write a bespoke trajectory plot or coverage page.** |
| **sim2real** | The outer API on top of everything: digital twins (`RobotTwin`), one-click `.calibrate()` (configure → fit → tune → measure routines), MuJoCo simulation, and dashboards of how close each twin is to its real hardware. May import every package above. | Twins, calibration, system identification, sim-vs-real comparison, the one-call API over a whole robot. |

### Close neighbours (not in the pinned SDK yet)

Look for these as sibling checkouts too. They are part of the same toolkit but are not on PyPI.
- **robotparts**: the parts catalogue (datasheets, SKUs, real arms such as the UR series). Its parts point at robot_models types.
- **bam_robot_descriptions** (inside `bam_ws/src/core/`): composable robot descriptions (parts composed into a robot, CAD-simplified and full-fidelity tiers).
- **pidtuna**: turns a robot description into tuned PD gains, analytic first, then measured on the robot.
- **dataclass_values**: `Value` / `Space`, the units-carrying values robot_msgs uses.

## The layer rule

```
robot_msgs → robot_models → (robot_parts → robot_descriptions)
   → robot_trajectories · robot_reach · robot_controllers · robot_thermal · robot_metrics
     · robot_activity · robot_autonomy · like_keras
   → traj_compare (viewers: end points, nothing imports them)
   → sim2real
   → robot_diagnostics (checks over metrics and twins)
```

- A package imports only from layers below it. **Leaves never import each other.** When one leaf needs another's behaviour, it takes a function or a Protocol as an argument, and the caller passes it in. Example: `robot_trajectories` never imports a kinematics library; you inject FK/IK into its `JointSpace`.
- **Viewers are end points.** traj_compare may import robot_msgs and leaves; no package imports a viewer.
- **The type is the API.** Packages agree on robot_msgs types, not on each other.
- `robot_sdk/tools/check_layers.py` enforces the rule. Run `uv run pytest` in `robot_sdk` after you add a dependency anywhere.

## Example assemblies

These show the shape; check each package's README for exact names.
- **Trajectories for a new arm (e.g. a UR5e):** the arm's description → robot_trajectories `JointSpace.from_description(...)` (or `.from_limits(JointLimits)` plus injected FK/IK) → kinds such as `random_waypoints` / `joint_waypoints` with `waypoint_generator=` a Ruckig `WaypointTrajectoryGenerator` → robot_reach to confirm the targets are reachable → robot_metrics to score tracking.
- **Tune and verify a joint:** robot_trajectories `pid_tuning` / `step_train` → pidtuna for the gains → robot_controllers to run them → robot_metrics for tracking and stop error → robot_thermal to keep the bursts safe.
- **A twin of a rig:** robot_models for the rung and its parameters → sim2real `RobotTwin` and `.calibrate()` → robot_metrics and traj_compare to show sim vs real.

## Keeping this index true

When a package gains a capability worth knowing about, or a new package joins the SDK, update its row here in the same change. A row that no longer matches its README is a bug.
New package checklist (in `robot_sdk`): a pin in `pyproject.toml`, a `[tool.uv.sources]` line, a `LAYERS` entry in `src/robot_sdk/__init__.py`, a row in this table and in `README.md`.
