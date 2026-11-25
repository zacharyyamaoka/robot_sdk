# Package layout

> **Default pick, pending Zach's choice.** This is proposal [P1](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/P1-lk-subpackage.md) of five; the other four are summarised at the end and compared in [the proposals README](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/README.md).

**Every robot-sdk package has three places: the core, one `lk` folder, and the C++ twin.** The core is plain, single-threaded Python on robot_msgs types and never imports like_keras. The `lk` folder turns the core into blocks you can wire and run with like_keras: components, systems, launch files and config. The C++ twin is the same core in C++, in the moteus layout.

Zach, daily note 2026-11-25: "robot-sdk will actually not know anything about like keras. robot-sdk is preuly functional." and "the components basically like wrap the core stuff".

## The rule

1. **Core:** everything in `src/<pkg>/` except `lk/`. Standard library, numpy, robot_msgs and packages in lower layers. One thread. Never imports like_keras.
2. **`src/<pkg>/lk/`:** the only Python that imports like_keras. Installed by the extra: `pip install '<pkg>[lk]'`.
3. **`cpp/`:** the C++ twin, beside the Python (mjbots [moteus lib/](https://github.com/mjbots/moteus/tree/main/lib)). `cpp/lk/` is the only C++ that includes `like_keras/lk.hpp`.

Libraries and applications follow the same rule. An application such as robot_pnp_pipeline has a small core and a large `lk/`, and lists like_keras as a plain dependency because it sits above the comms layer.

## The tree

```text
<repo>/
├── pyproject.toml          dependencies: the core's only (never like_keras)
│                           extras: lk = ["like_keras", "<other package>[lk]", …]
│                           entry points "like_keras.components": one line per block
├── .importlinter           <pkg> never imports like_keras, except <pkg>.lk
├── robot-sdk.toml
├── src/<pkg>/              THE CORE: pure functions and types
│   ├── …
│   └── lk/                 THE ONLY PYTHON THAT IMPORTS like_keras
│       ├── __init__.py     refuses without the extra, naming it
│       ├── components/     one block per thing the core does; each wraps a core function
│       ├── systems/        compositions that other packages import
│       ├── launch/         Deployments you run: python -m <pkg>.lk.launch.<name>
│       └── config/         their params as TOML, shipped with the package
├── cpp/                    THE C++ TWIN; CMake never runs Python
│   ├── CMakeLists.txt
│   ├── include/<pkg>/      the laws, header-only where possible
│   ├── src/
│   └── lk/                 THE ONLY C++ THAT INCLUDES like_keras/lk.hpp: one .so per block (lk_component)
├── rust/README.md          out of scope, planned
├── tests/                  includes the parity tests: C++ law = Python law, C++ block = Python block
└── docs/
```

## Where each kind of file goes

| You are writing | It goes in | It may import |
|---|---|---|
| A pure function, or a type only this package uses | `src/<pkg>/` | the standard library, numpy, robot_msgs, lower layers |
| A block (a like_keras component) | `src/<pkg>/lk/components/<name>.py` | like_keras, this package's core, other packages' blocks |
| A composition others will reuse | `src/<pkg>/lk/systems/<name>.py` | blocks |
| Something you run | `src/<pkg>/lk/launch/<name>.py` | systems, like_keras |
| Its parameters | `src/<pkg>/lk/config/<name>.toml` | nothing |
| The C++ law | `cpp/include/<pkg>/<name>.hpp` | the C++ standard library |
| The C++ block | `cpp/lk/<name>.cpp` | `like_keras/lk.hpp`, the C++ law |
| A test | the repo's tests folder | anything |
| A message type more than one package uses | robot_msgs, not here | nothing |

## A library and an application

```text
robot_controllers/                                robot_pnp_pipeline/
├── src/robot_controllers/                        ├── src/robot_pnp_pipeline/
│   ├── core.py  registry.py  controllers/  …     │   ├── pick_order.py          the little core
│   └── lk/                                       │   └── lk/
│       ├── components/                           │       ├── components/
│       │   ├── joint_trajectory_controller.py    │       │   └── target_file.py
│       │   ├── tape_feeder.py                    │       ├── systems/
│       │   ├── joint_impedance_controller.py     │       │   ├── trajectory_to_controller.py
│       │   └── servo_plant.py                    │       │   └── pick_and_place.py
│       ├── systems/controller_on_twin.py         │       ├── launch/  sim.py  sim_cpp.py  real.py
│       ├── launch/twin.py                        │       └── config/  sim.toml  real.toml  targets.jsonl
│       └── config/joint_trajectory_controller.toml
├── cpp/                                          ├── rust/README.md   (no cpp/ until a block needs it)
│   ├── include/robot_controllers/                └── tests/
│   │   └── joint_trajectory_controller.hpp
│   └── lk/joint_trajectory_controller.cpp
├── rust/README.md
└── tests/
```

The full trees, with every file explained, are in [P1](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/P1-lk-subpackage.md).

## A block wraps the core

`src/robot_controllers/lk/components/joint_trajectory_controller.py`. The ports are the outside; robot_controllers' existing law is the inside, unchanged.

```python
"""The joint trajectory controller as a like_keras component: ports outside, robot_controllers' pure core inside."""

import dataclasses

import like_keras as lk
from robot_msgs.control import ServoCommand, ServoState
from robot_msgs.trajectory import JointTrajectory

from robot_controllers import controller  # the pure core: numpy + robot_msgs, no like_keras


class JointTrajectoryController(lk.Component):
    trajectory = lk.In(JointTrajectory)        # latest: a new trajectory replaces the running one
    state = lk.In(ServoState, stale=0.1)       # None if older than 0.1 s
    command = lk.Out(ServoCommand)

    @dataclasses.dataclass(frozen=True)
    class Params:
        period_s: float = 0.01                 # the group's rate is set by Deployment.place(hz=...)

    def forward(self, trajectory, state):
        if trajectory is None or state is None:
            return None
        if getattr(self, "_running", None) is not trajectory:
            self._jtc = controller("joint_trajectory_controller").build(trajectory)
            self._running = trajectory
        command, _ = self._jtc.tick(state.joint_state(), self.params.period_s)
        return command
```

Run eagerly (a component called on plain values runs `forward` with no backend and no thread, like_keras [CONTRACT §4.1](https://github.com/zacharyyamaoka/like_keras/blob/main/docs/CONTRACT.md)) against today's robot_controllers and like_keras. The block was saved as a scratch module beside the script, hence the short import:

```python
from robot_msgs.control import ServoState
from robot_msgs.trajectory import JointTrajectory
from joint_trajectory_controller import JointTrajectoryController

traj = JointTrajectory(t=[0.0, 1.0], joint_names=("shoulder", "elbow"), positions=[[0.0, 0.0], [1.0, 0.5]])
arm = JointTrajectoryController(period_s=0.25)
state = ServoState(name=("shoulder", "elbow"), position=[0.0, 0.0])
for _ in range(3):
    cmd = arm(trajectory=traj, state=state)   # eager: forward on plain values, no backend, no thread
    print(cmd.name, cmd.position)
```

```text
('shoulder', 'elbow') [0. 0.]
('shoulder', 'elbow') [0.25  0.125]
('shoulder', 'elbow') [0.5  0.25]
```

## Python to C++ in one line

The C++ block `cpp/lk/joint_trajectory_controller.cpp` has the same ports, includes `robot_controllers/joint_trajectory_controller.hpp`, and is built into a `.so` with like_keras's `lk_component()`. A launch file picks one (the shape of CONTRACT §4.6; not run here):

```python
controller = JointTrajectoryController(period_s=0.01)
# controller = lk.native("libjoint_trajectory_controller.so", config="config/sim.toml")
```

A parity test holds the two blocks equal on the same inputs, as [test_cpp_parity.py](https://github.com/zacharyyamaoka/robot_controllers/blob/main/tests/test_cpp_parity.py) holds the two laws equal today.

## What keeps the core pure

Three locks, each already used in robot-sdk.

**The extra**, so installing the core never installs like_keras (robot_msgs does the same with `[ros]`). robot_sdk's layer check reads only `[project].dependencies`, so the extra passes it; a required like_keras dependency in a leaf fails it.

```toml
[project]
dependencies = ["numpy>=1.26", "robot-msgs>=0.3.0"]

[project.optional-dependencies]
lk = ["like_keras>=0.1.0"]

[project.entry-points."like_keras.components"]
joint_trajectory_controller = "robot_controllers.lk.components.joint_trajectory_controller:JointTrajectoryController"
```

**The import contract**, run in CI with `lint-imports` (like_keras holds its own dora boundary the same way, [.importlinter](https://github.com/zacharyyamaoka/like_keras/blob/main/.importlinter)):

```ini
[importlinter]
root_packages =
    robot_controllers
include_external_packages = True

[importlinter:contract:core-never-imports-like-keras]
name = the core never imports like_keras; only robot_controllers.lk does
type = forbidden
source_modules =
    robot_controllers
forbidden_modules =
    like_keras
ignore_imports =
    robot_controllers.lk -> like_keras
    robot_controllers.lk.** -> like_keras
allow_indirect_imports = True
```

Proven on a stand-in package with import-linter 2.16: kept as written; one `import like_keras` planted in the core broke it (exit 1, naming the file and line).

**The refusal**, in `src/<pkg>/lk/__init__.py`, as in robot_msgs' [ros/__init__.py](https://github.com/zacharyyamaoka/robot_msgs/blob/main/src/robot_msgs/ros/__init__.py):

```python
try:
    import like_keras  # noqa: F401
except ImportError as error:
    raise ImportError("robot_controllers.lk needs like_keras: pip install 'robot-controllers[lk]'") from error
```

In C++ the lock is the build: the core's CMake target has no like_keras include path, so a core header that includes `like_keras/lk.hpp` does not compile.

## New package checklist

1. The core first: `src/<pkg>/`, tests, no like_keras.
2. The package's own robot-sdk.toml (`python -m tools.sdk_graph draft <package>` prints one) and the robot_sdk entries, as today.
3. When the core should be a block: the `lk` extra, the `.importlinter` file (copied from robot_controllers, renamed), `lint-imports` in CI, and `src/<pkg>/lk/components/<name>.py` with its entry-point line.
4. Systems, launch and config when something composes or runs it.
5. For speed: `cpp/include/<pkg>/<name>.hpp` with a parity test (a `CPP_PARITY` list that covers every public symbol earns "full" in the directory), then `cpp/lk/<name>.cpp`.

## Other layouts considered

- [P3](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/P3-sibling-distribution.md), **two distributions in one repo** (`<pkg>` and `<pkg>_lk`, as ANYbotics' grid_map splits `grid_map_core` from `grid_map_ros`). The next best, and the move to make when a package's blocks need dependencies or a release schedule the core must not share.
- [P5](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/P5-folder-per-unit.md), **a folder per unit**: law, block, C++ twin and test in one folder (the vault deep dive's purity boundary at file level, date-fns).
- [P2](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/P2-kind-folders.md), **Zach's sketch as written**: `src/cpp`, `src/py/{core,components,systems}`, `launch/` and `config/` at the root (the ROS package shape). robot_sdk's tools do not see Python at `src/py/<pkg>` today.
- [P4](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/P4-catalog-and-bringup-repos.md), **blocks in one catalog repo** (dora-hub), applications as bringup repos (nav2_bringup). No robot-sdk repo mentions like_keras, and a controller's block lives in another repo.

Criteria, scores and prior art: [the proposals README](https://github.com/zacharyyamaoka/like_keras_agent/blob/main/proposals/folder-layout/README.md).
