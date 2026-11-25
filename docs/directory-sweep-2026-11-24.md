# robot-sdk directory sweep (2026-11-24)

Zach's ask (Daily Note Nov 24, under "# Robot SDK feedback"): "go through my chats and kinda detect if there are any other things you should be adding to the robot sdk directory".

Method: 7 finders in parallel (repos on disk; vault notes; Claude Code chat exports Nov 15–25 in five date slices), 143 raw candidates, then one verifier that deduped them and re-checked each against the repo (pyproject, robot-sdk.toml, remote + `gh repo view` visibility, PyPI) and graph.json. Workflow run wf_ebda4ad4-492 (Robot SDK Agent session 75a89d4d, jidoka account).

Each package joins by declaring itself in its own `robot-sdk.toml` and being pinned here; nothing below is hand-kept in robot_sdk (feedback_decentralized_self_description). Making a private or remote-less repo public is the first public push: Zach's call unless he asked for it.

## Add as a viewer (2)

- **robot_msg_viz** — layer `viewers` · private · declares itself
  - What: robot-msg-viz 0.1.0: one curated Rerun view per robot_msgs type (viz.show/save/stream, blueprint, sample data), built on robot_msgs' own logger (robot_msgs.viz.rerun). Its landing page has Types and Use cases tabs. Deps: numpy, robot-msgs[rerun]>=0.3.1, rerun-sdk==0.40.0. First commit 2026-11-24, last 2971a5e.
  - Why: Zach asked for exactly this, and it is a viewer on robot_msgs types, which the README's scope rule allows in. robot-sdk.toml (role=viewer, layer=viewers) is now TRACKED in git. The directory still can't see it: sdk_packages() only reads robot_sdk's pyproject pins, and the refresh only sees public repos. The robot_msgs/robot_msg_viz boundary is already stated in its toml ('on top of robot_msgs' own logger'), so no separate row change is needed for robot_msgs' stock JointTrajectory viewer.
  - Blocker: GitHub PRIVATE although Zach asked for it public. Not pinned in robot_sdk/pyproject.toml, no [tool.uv.sources] entry, no entry in robot_sdk LAYERS. Not on PyPI (robot-msg-viz 404, name free).
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "For each kinda like standard robot_msg type I want to support a standard rerun viewer (L2483)"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "Please make this a public github repo. (L2525)"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "these are like visuzliation packages that are design to work with robot_msgs so they should 100% be linked there.... (L2428)"
- **robot_dashboards** — layer `viewers` · private · declares itself
  - What: robot-dashboards 0.1.0: a fixed Rerun layout per use case (object detection, 3D detection, RGB-D, grasping, pick and place, trajectory generation, robot state), fed robot_msgs messages through dash.show/save/stream. It plugs into robot_msg_viz's Use cases tab through an entry point. Deps: numpy, robot-msg-viz>=0.1.0, rerun-sdk==0.40.0. Single commit 04de5c3 (2026-11-24).
  - Why: Zach split this out deliberately as its own lightweight repo of stock dashboards on robot_msgs. It is a viewer, so it belongs in the viewers layer.
  - Blocker: robot-sdk.toml exists but is UNTRACKED (a peer's in-flight work). GitHub is PRIVATE. Not pinned and not on PyPI. Its REQUIRED dependency on robot-msg-viz, also a viewer, breaks tools/check_layers.py SINKS={'viewers'} once both are in LAYERS. Fix one of two ways: allow viewer-to-viewer dependencies, or make robot-msg-viz optional / entry-point only.
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "robot_dashboards is almost like the seperate thing super light weight repo that just has a bunch of stock dashboards for different use cases... (L2556)"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "I also want to make rerun viewers for common use cases like object detection, Grasping, etc... (L2485)"
  - Evidence (2026-11-24): `/home/bam/robot_sdk/tools/check_layers.py` — "SINKS = {"viewers"}  # layers no package may depend on, whatever its rank"

## Add as a package (3)

- **pidtuna** — layer `leaf` · no-remote
  - What: pidtuna 0.1.0: a robot description in, tuned joint (PD) gains out. Analytic start from the model, then measured tuning on the robot. Numpy-only core, MuJoCo [arm] extra. Commits 2026-10-26 to 2026-11-21 (00e8c8c). Site pidtuna.com (/home/bam/pidtuna-website, also no remote).
  - Why: Zach wants it standalone and as the backend of a sim2real routine. sim2real already loads it lazily ('Not on PyPI and so not declared: pidtuna ...'). SKILL.md uses it in the 'Tune and verify a joint' assembly but lists it only as a close neighbour. It is generic robotics and numpy-only, so it fits the leaf layer.
  - Blocker: No git remote, and GitHub zacharyyamaoka/pidtuna is not found, although its README installs from that URL. Not on PyPI (name free). No robot-sdk.toml. It does not import robot_msgs, so its public API declares no shared types. 'pidtuna' is a product name rather than a domain name; that is a naming call for Zach, not a hard block.
  - Evidence (2026-11-11): `vault:Sources/Daily Notes/Daily Note - Nov 11 2026.md` — "So like PID tuna I am happy for that to be its own standalone thing... (L2006)"
  - Evidence (2026-11-17): `vault:Sources/Daily Notes/Daily Note - Nov 17 2026.md` — "PID Tuna is the backend for one of the routines certaintily.... (L1634)"
  - Evidence (2026-11-24): `/home/bam/sim2real/pyproject.toml` — "Not on PyPI and so not declared: pidtuna, sysid ... and data_recorder are loaded lazily (L27)"
- **data_recorder (data-recorder)** — layer `comms` · no-remote
  - What: data-recorder 0.1.0: a passive drop-in flight recorder for robot streams into Rerun. Live view, a 300 s full-density ring dumped on a fault, an always-on low-rate log, one schema (data-recorder/1) for real/sim/MuJoCo runs, and runlink to W&B. Deps: robot-msgs[rerun], numpy. Commits 2026-11-13 (47d4f54).
  - Why: This is the SDK's rosbag, which Zach asked for in his own words. It is built on robot_msgs, and sim2real (outer) loads it lazily. The comms layer (RANK 2) keeps it below sim2real and avoids the viewers-are-sinks rule that would break if it were filed as a viewer.
  - Blocker: No git remote, and GitHub reports not found. The PyPI name 'data-recorder' is TAKEN by an unrelated project (Julian Kimmig), so it needs a new distribution name. No robot-sdk.toml. BAM rig config (rigs/bam_arm.toml) lives in the repo and should move out.
  - Evidence (2026-11-13): `vault:Sources/Chats/Claude Code/2026-11-13 — e9215181 (CHAT).md` — "something super simple that we can drop in that can basically record essentially what is almost like a ROS bag of the live stream data"
  - Evidence (2026-11-13): `/home/bam/data_recorder/pyproject.toml` — "dependencies = ['robot-msgs[rerun]', 'numpy>=1.26']"
  - Evidence (2026-11-24): `https://pypi.org/pypi/data-recorder/json` — "data-recorder 0.1.1602852884, author Julian Kimmig"
- **gripper-collision-tuner** — layer `leaf` · public
  - What: gripper-collision-tuner 0.1.0 (CLI gct): a robot description in, a robot description out. It tunes a MuJoCo gripper's collision geometry and contact parameters, measured on paired grasp-and-shake trials. Deps: mujoco, scipy, robot-msgs (git pin 3ae389c), rerun-sdk==0.43.1. Single commit date 2026-11-11 (e75047f).
  - Why: A generic, unbranded, public package on robot_msgs. robot_sdk_agent's scorer counts it in unlisted_repos, so the listed_all gate fails because of it. I found no explicit Zach ruling to list it; it qualifies on the scope rule alone.
  - Blocker: No robot-sdk.toml. robot-msgs is pinned to a stale git sha instead of ~=0.3.1. rerun-sdk==0.43.1 conflicts with the 0.40.0 pin used by robot_msg_viz and robot_dashboards. Not on PyPI.
  - **Status:** robot-sdk.toml written and pushed (gripper-collision-tuner 8883076; lint passes through a scratch view). Not pinned yet: sdk_graph scan reads only src/<folder name>/ and this repo is a flat layout whose folder (gripper-collision-tuner) differs from its import name (gripper_collision_tuner); its deps pin robot-msgs to a stale git sha (3ae389c) and rerun-sdk==0.43.1.
  - Evidence (2026-11-11): `/home/bam/gripper-collision-tuner/pyproject.toml` — "Robot description in, robot description out: tune a MuJoCo gripper's collision geometry and contact parameters"
  - Evidence (2026-11-24): `/home/bam/robot_sdk_agent/solutions/s0/scorecard.json` — ""unlisted_repos": ["dataclass_coverage", "gripper-collision-tuner"]"
  - Evidence (2026-11-11): `vault:Sources/Chats/Claude Code/2026-11-11 — bd5fcce8 (CHAT).md` — "Alot of the problems here seem to be with the blocks slippign around when grabbed by the gripper in mujoco"

## Add as an agent (2)

- **robot_viz_agent (Robot Viz Agent)** · no-remote
  - What: A black-box agent in the blackbox_agent format (OBJECTIVES ruler v1 frozen 2026-11-24, AGENTS, PROGRESS, ideas, ledger.jsonl, status.json, site/). Objective verified_types: the robot_msgs types whose stock Rerun view passes every gate. Counter-KPI verified_use_cases. Deps: robot-msgs[rerun], robot-msg-viz, robot-dashboards.
  - Why: Zach asked for this agent, and it builds the two viewer packages above. The agents table tracks exactly this kind of agent. It would need builds_on = [robot_msgs, robot_msg_viz, robot_dashboards].
  - Blocker: No robot-sdk.toml (role="agent"), so agent_repos() can't find it. No git remote, and gh reports zacharyyamaoka/robot_viz_agent not found. Its README already links a github.io landing page that cannot exist yet.
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "Also make a blackbox agent for this. (L2527)"
  - Evidence (2026-11-24): `/home/bam/robot_viz_agent/OBJECTIVES.md` — "Objectives & Gates (ruler v1, frozen 2026-11-24)"
- **Robot Parts Agent (robot_parts_agent)** · private
  - What: A black-box agent for the parts catalogue. Objective bom_cells_pct: every part on an active BOM carries every layer and parameter its models need, each value sourced. Its files are in agent/ (README, OBJECTIVES, AGENTS, ideas, REFERENCES, score.py, status.json) on branch claude/agent-1124e @ b2ef20c, worktree /home/bam/robotparts-worktrees/agent-1124e. Verified with merge-base: NOT merged into main.
  - Why: Zach asked for it in the agent format, and it builds the data behind the planned robot_parts layer. The AI's hub note decided to keep it inside robotparts. That contradicts both the README ('Each agent keeps its own repo') and Zach's own Nov 24 words. Recommend splitting it into /home/bam/robot_parts_agent with a root robot-sdk.toml.
  - Blocker: Branch unmerged. agent_repos() only reads a ROOT robot-sdk.toml with role=agent, and the robotparts root would be the planned robot_parts package, so a subfolder agent stays invisible. robotparts is PRIVATE.
  - Evidence (2026-11-24): `vault:Sources/Chats/Claude Code/2026-11-23 — 38f92996 (CHAT)/38f92996 — 2026-11-24.md` — "Please also dispatch an agent to make a robot_parts_agent blackbox_agent page (L1463)"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "Ok so each blackbox I basically give its own repo (L761)"
  - Evidence (2026-11-24): `vault:AGENT - Robot Parts.md` — "The box lives inside robotparts, not in its own `robot_parts_agent` repo. (AI)"

## Planned rows (no extractable repo yet) (6)

- **robotparts (the planned robot_parts row)** — layer `models` · private
  - What: The parts catalogue (robotparts.dev): one folder per SKU, schemas robotparts/1 and /2 (pre-stable), saved builds and a KPI ledger. It ships a stdlib-only Python distribution named 'robotparts' at python/pyproject.toml. Active through 2026-11-24 (06beb63). The Nov 23 UR arm and Robotiq hand are in it.
  - Why: README's hand-written line '*Planned:* robot_parts → robot_descriptions' has a real repo behind its first half. The line should name /home/bam/robotparts, its import name and its status. Zach set the layer order (parts above models), and on Nov 24 he made robot-sdk packages the consumers checked on every schema change. The driver format (separate entry) also lives here.
  - Blocker: PRIVATE. No robot-sdk.toml. Not on PyPI ('robotparts' and 'robot-parts' both free). The name is unsettled: the repo and dist are 'robotparts' while the plan and robot_models PEP say 'robot_parts'.
  - Evidence (2026-11-16): `vault:Sources/Daily Notes/Daily Note - Nov 16 2026.md` — "robot_msgs -> robot_models -> robot_parts -> robot_descriptions (L53)"
  - Evidence (2026-11-23): `vault:Sources/Chats/Claude Code/2026-11-23 — 23b9fc45 (CHAT)/23b9fc45 — 2026-11-23.md` — "so in robot parts. can we please have a robot arm for the UR, and a gripper for the robot IQ."
  - Evidence (2026-11-24): `/home/bam/robotparts/docs/decisions/2026-11-24-pre-stable-versioning.md` — "dispatch agents to see if anything in robot-sdk is affected and change it"
- **robot_descriptions (planned; donor bam_robot_descriptions)** — layer `models` · private
  - What: Composable RobotDescription on robot_msgs types: builders, URDF/MJCF writers, limits, kinematics, studio and a viewer. Today it exists only as the BAM-branded bam-robot-descriptions inside the private bam_ws. The format page is robotdescription.com (/home/bam/robotdescription-website, no remote).
  - Why: This is the second half of the planned line, and the line should name its donor. Two issues need settling. (1) Layer: the README parks it 'between models and the leaves', but Zach on Nov 16 called RobotDescription a high-level, top-of-stack type, and leaves such as robot_reach, robot_collision and pidtuna take one. Needs a ruling: below the leaves, or the leaves take it through a Protocol. (2) Name: the PyPI distribution name is taken.
  - Blocker: BAM-branded, inside private bam_ws, not extracted. PyPI 'robot-descriptions' is TAKEN (Stéphane Caron, v3.3.0). Layer placement unresolved.
  - Evidence (2026-11-16): `vault:Sources/Daily Notes/Daily Note - Nov 16 2026.md` — "RobotDescription i think utlaitmely then is quite a high level type... right up at the top.. (L79)"
  - Evidence (2026-11-12): `vault:Sources/Chats/Claude Code/2026-11-12 — 93adbffe (CHAT).md` — "most packages I think will only ever need like robot_msgs and robot_descriptions and depencies.."
  - Evidence (2026-11-24): `https://pypi.org/pypi/robot-descriptions/json` — "robot-descriptions 3.3.0, Stéphane Caron: Import open source robot description as Python modules."
- **RobotDescription viewer (rd.show / rd-view)** — layer `viewers` · private
  - What: An RViz-style bring-up of a RobotDescription in viser (joint sliders, inspector, transform and scene tree). Code is bam_robot_descriptions/viewer.py, confirmed on bam_ws origin/main (not in the local checkout). Launcher: /home/bam/.local/bin/rd-view.
  - Why: The stock viewer for the description type, so it belongs in the viewers layer. Zach also wants the CadDescription viewer to be an adapter onto it. It moves with robot_descriptions when that package is extracted.
  - Blocker: Lives in the [viz] extra of the private, BAM-branded bam_ws package; waits on the robot_descriptions extraction.
  - Evidence (2026-11-18): `vault:Sources/Chats/Claude Code/2026-11-18 — 159f3460 (CHAT).md` — "RobotDescription.show()/display() or something like that... (L87)"
  - Evidence (2026-11-18): `vault:Sources/Chats/Claude Code/2026-11-18 — 159f3460 (CHAT).md` — "RoboDescription Viewer - just as static data, but then we also want to support like streaming the real data to it (L49)"
- **five_bar_linkage (today bam_fivebar)** — layer `leaf` · private
  - What: A pure-functional five-bar linkage library (FK/IK, virtual-work dynamics). Today it exists only as bam-fivebar in bam_ws/src/dev. The domain-named src/core/five_bar_linkage that Zach asked for was never created (ls: not found).
  - Why: Zach asked for a standalone, domain-named, pure-functional package. That makes it a generic kinematics leaf next to robot_reach.
  - Blocker: Not extracted; BAM-branded inside private bam_ws.
  - Evidence (2026-11-10): `vault:Sources/Daily Notes/Daily Note - Nov 10 2026.md` — "So I want a standalone five bar package (L51)"
  - Evidence (2026-11-10): `vault:Sources/Daily Notes/Daily Note - Nov 10 2026.md` — "To name it by domain its five_bar_linkage (L55)"
  - Evidence (2026-11-10): `vault:Sources/Daily Notes/Daily Note - Nov 10 2026.md` — "Pure Functional Library for working with five bars. (L157)"
- **Driver format (base driver real+twin + dora-rs wrapper)** — layer `comms` · private
  - What: A spec (robotparts/docs/drivers.md, last touched at 04a4105) and a skeleton (robotparts/templates/dora_driver/). Each sensor or actuator gets a base driver with real and twin implementations behind one API, an always-on dora-rs node, a CLI status --json and a RobotDx check. Worked examples: the OBSBOT camera and the conveyor belt.
  - Why: Zach asked for this to be first-class as part of robotparts and robotdx. It is the hardware-to-network seam under like_keras, and no directory row covers it. Low confidence on a separate row: it could equally be noted under the robot_parts planned row until the shared package exists.
  - Blocker: Only a spec plus template inside private robotparts. The doc itself defers the shared package ('once a third driver lands').
  - Evidence (2026-11-14): `vault:Sources/Chats/Claude Code/2026-11-15 — 0800ada5 (CHAT)/0800ada5 — 2026-11-14.md` — "My feeling is we need to basically make this first class now. so that all sensors and actuators are valiable on the network... (L4598)"
  - Evidence (2026-11-14): `vault:Sources/Chats/Claude Code/2026-11-15 — 0800ada5 (CHAT)/0800ada5 — 2026-11-14.md` — "We have the base driver... and now we are basically make a dora rs wrapper around that base driver (L4602)"
  - Evidence (2026-11-15): `/home/bam/robotparts/docs/drivers.md` — "Extract the gateway and the supervisor into one shared package once a third driver lands. (L96)"
- **bb-run-robot-msgs (blackbox_agent adapters/robot_msgs)** — layer `viewers` · private
  - What: An optional adapter that converts robot_msgs messages and logs into bb-run/1 run records and back, so robot data shows up in the black-box viewer's bb-evidence. Core needs numpy only; robot-msgs is an extra.
  - Why: Zach asked for this bridge, and it is how every robotics agent's site would show runs. It consumes robot_msgs and feeds a viewer, while the generic blackbox core stays robot-free, as Zach ruled. List it once blackbox packaging is decided and the repo is public.
  - Blocker: A sub-folder of the private blackbox_agent_lab repo. No robot-sdk.toml, not on PyPI. Depends on the open 'one blackbox package' decision.
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "I imagine making adapters for robot_msg that make it super easy to basically like have the data from robot_msgs show up throughout the blackbox agent stuff... (L1434)"
  - Evidence (2026-11-24): `/home/bam/blackbox_agent/adapters/robot_msgs/pyproject.toml` — "name = "bb-run-robot-msgs""

## Changes to existing rows (6)

- **trajectory_tracking_agent (builds_on + stale hub note)** · public · declares itself
  - What: An existing agent row with builds_on = [robot_msgs, robot_controllers], matching its pyproject (robot-msgs, robot-controllers[bench]). Its ruler dataset is a byte-for-byte copy of arm_motion_bench's datasets/ur5e_alone/workspace/v2.
  - Why: The row is consistent with its pyproject. Two things are off. (1) It never names arm_motion_bench as its dataset source and donor; add a 'datasets' or 'bench' link, not a builds_on entry, since Zach ruled the datasets go with the agent. (2) The vault hub note 'AGENT - Trajectory Tracking.md' still says repo /home/bam/arm_motion_bench and the old objective 'Make the 6-DOF arm move faster', while the directory row says 'Lowest tool tracking error'.
  - Evidence (2026-11-24): `/home/bam/trajectory_tracking_agent/src/trajectory_tracking_agent/ruler/dataset.py` — "The folder is a byte-for-byte copy of arm_motion_bench `datasets/ur5e_alone/workspace/v2/`"
  - Evidence (2026-11-24): `vault:AGENT - Trajectory Tracking.md` — "repo: /home/bam/arm_motion_bench"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "Should this information go with the agent? ... 100% this is actually how you are calculating the objectives. (L1896-1898)"
- **robot_activity / robot_autonomy ('Agent' wording on library rows)** — layer `leaf` · public · declares itself
  - What: Two existing leaf rows (role=library). Their robot-sdk.toml summaries open with 'The Robot Activity Agent:' and 'The Robot Autonomy Agent:'. Neither repo has the agent-format files.
  - Why: The README says an agent is not a package, and sdk_graph fails role=agent on a pinned package, so the 'Agent' wording in a library row misleads the agents table. Zach wants robot activity measured programmatically ('so we don't depend on the AI'), which keeps the code a package; the 'agent' is the standing role around it. Recommend dropping 'Agent' from both summaries. A separate agent row only appears if one gets its own black-box repo. Zach has not ruled on this.
  - **Status:** fixed: robot_activity 2ebea6e + robot_autonomy e61abfe (pushed) — summaries describe the library, no "Agent" opener
  - Evidence (2026-11-24): `/home/bam/robot_activity/robot-sdk.toml` — "summary = "The Robot Activity Agent: measures whether each robot is doing useful work"
  - Evidence (2026-11-14): `vault:Sources/Chats/Claude Code/2026-11-15 — 1ded6efa (CHAT)/1ded6efa — 2026-11-14.md` — "I like the idea of doing it programmically so we don't depend on the AI..."
  - Evidence (2026-11-18): `vault:Sources/Chats/Claude Code/2026-11-18 — 41790696 (CHAT).md` — "I like the idea of having this agent as like a stable sub assembly its like a person in the organization (L96)"
- **like_keras (C++ components missing from summary)** — layer `comms` · public · declares itself
  - What: An existing comms row. Its summary says only 'dora-rs is the first transport. (Design in progress...)', but like_keras/cpp (include/, hosts/, src/abi.cpp, box.hpp, rt.cpp) exists with C++ components and in-process chaining.
  - Why: A small summary update: name the C++ component host and in-process chaining. No layer change.
  - **Status:** fixed: like_keras f2995b0 (pushed) — one_line/summary name the C++ components (lk.hpp, lk_component(), like_keras.native)
  - Evidence (2026-11-15): `vault:Sources/Chats/Claude Code/2026-11-15 — 086ce40d (CHAT)/086ce40d — 2026-11-15.md` — "I would like to migrate or have the option to basically like have the robot controllers on c++ (L28)"
  - Evidence (2026-11-24): `/home/bam/like_keras/robot-sdk.toml` — "dora-rs is the first transport. (Design in progress: check `docs/CONTRACT.md`.)"
- **traj_compare (grasp viewer link; scope of one_line)** — layer `viewers` · public · declares itself
  - What: An existing viewers row. It now also holds traj_compare.grasp_coverage, which Zach had deployed as its own grasp dataset viewer (https://grasp-viewer.zach-yamaoka.workers.dev, per the AI handoff in 008d0ce6). Its [links] has only github and pypi.
  - Why: Add a grasp_viewer link to its robot-sdk.toml [links]. The one_line ('A/B trajectory comparison and coverage viewers') undersells grasp coverage. Zach sees comparison and coverage as separate viewers, and both must be listed; both already are, inside this row. A split is not decided.
  - **Status:** fixed: traj_compare 19c1d6c (pushed) — names comparison, trajectory coverage and grasp coverage; [links] grasp_viewer (answered 200)
  - Evidence (2026-11-24): `vault:Sources/Chats/Claude Code/2026-11-25 — 008d0ce6 (CHAT).md` — "Looks good please deploy this as its own grasp dataset viewer (L1407)"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "so like trajectory comparison viewer and the trajectory coverage viewer.. thoose should be there 100%.. (L2430-2432)"
  - Evidence (2026-11-24): `vault:Sources/Chats/Claude Code/2026-11-23 — 596df6f3 (CHAT)/596df6f3 — 2026-11-24.md` — "so really you are almost making like two seperate viewers (L365)"
- **robot_reach (pose-goal solver + ReachableWorkspace not in its row)** — layer `leaf` · public · declares itself
  - What: robot_reach has goals.py and rest.py (best ready/rest pose for a use case, to_named_pose) and workspace.py (ReachableWorkspace). Its summary and use_when mention only reach maps and IK branches. [[produces]] declares only NamedPose, and the toml has zero mentions of ReachableWorkspace.
  - Why: Agents read the generated row, so they won't find the pose solver. Zach wants ReachableWorkspace as a shared type in robot_msgs: until it moves there, declare it in produces so the Types view shows it. The camera-FOV overlay he asked for on Nov 17 is a feature request, not a row change.
  - **Status:** fixed: robot_reach 940ada4 (pushed) — summary/use_when name ReachableWorkspace, rest/ready poses, goals.solve, to_named_pose; no new type (PoseSamples.poses is annotated -> list, lint would fail)
  - Evidence (2026-11-23): `vault:Sources/Chats/Claude Code/2026-11-23 — 625ebc10 (CHAT).md` — "Yes I like the idea of having a ReachableWorkspace or similar type of value in robot messages. (L1210)"
  - Evidence (2026-11-20): `vault:Sources/Chats/Claude Code/2026-11-20 — 272cad21 (CHAT)/272cad21 — 2026-11-20.md` — "there is just a few things you can set here that can help us solve for any use case on any actuated rigid body (L2953)"
  - Evidence (2026-11-24): `/home/bam/robot_reach/robot-sdk.toml` — "use_when = "Workspace, \"can the arm reach X\", IK branch choice, placing a robot or a bin, arm sizing.""
- **blackbox_agent template (link it from the README agents section)** · private
  - What: The generic template and viewer every black-box agent repo follows (format, bb-* viewer components, template/). Its origin is github.com/zacharyyamaoka/blackbox_agent_lab (PRIVATE); robot_viz_agent links it as github.com/zacharyyamaoka/blackbox_agent.
  - Why: Not a member: Zach says it is more general than robotics. robot_sdk's README agents section lists 'the standard format' but never links the template, and Zach asked agent repos to link the template they follow. Change: add the link to the README agents section.
  - Blocker: The repo is private (blackbox_agent_lab), so the link 404s for others until it goes public. Going public is a first public push, which is Zach's call.
  - Evidence (2026-11-24): `vault:Sources/Chats/Claude Code/2026-11-24 — 7cf66f6e (CHAT).md` — "You should also reference and link to that generic template repo you are following (L7398)"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "the blackbox agent shouldn't depend on robot_msgs of course this is more general than just this project (L1432)"

## Out of scope (checked, stays out) (14)

- **dataclass_values** · public
  - What: dataclass-values 0.1.0 (stdlib only, on PyPI): Value(1.2, 'm', low=, high=, source=) and Space. Public. A REQUIRED runtime dependency of robot_msgs, so pip install robot-sdk already installs it.
  - Why: A close neighbour: generic dataclass tooling, not robotics-specific, and Zach never said to list it. SKILL.md already names it. It is load-bearing below the vocabulary layer, so a one-line footnote under vocabulary ('robot_msgs builds on dataclass_values') would be accurate without making it a row.
  - Evidence (2026-11-24): `/home/bam/robot_msgs/pyproject.toml` — "dependencies = ["numpy>=1.26", "dataclass-values>=0.1.0"]"
  - Evidence (2026-11-24): `/home/bam/robot_sdk/skill/SKILL.md` — "dataclass_values: `Value` / `Space`, the units-carrying values robot_msgs uses."
- **dataclass_coverage** · public
  - What: dataclass-coverage 0.1.0: any list of dataclass records in, coverage of their declared Value ranges out. One payload for data-ui, Matplotlib, Viser and W&B. Split out of traj_compare.record_coverage on 2026-11-24 (713c26a). Runtime deps: numpy and dataclass-values; robot-msgs appears only in its test extra. Public, not on PyPI.
  - Why: A close neighbour, not a member: it is domain-free and SKILL.md already places it beside dataclass_values. Zach asked only for 'a standalone viewer with its own public github repo', not for a directory row. Note a side effect: robot_sdk_agent's scorer flags it in unlisted_repos, apparently because its test extra mentions robot-msgs (uses_robot_msgs). Either the scorer should ignore test extras, or the directory needs an explicit close-neighbours list. Otherwise the listed_all gate stays red.
  - Evidence (2026-11-24): `vault:Sources/Chats/Claude Code/2026-11-25 — 6b51a597 (CHAT).md` — "make this a standalone viewer with its own public github repo (L1175)"
  - Evidence (2026-11-24): `/home/bam/robot_sdk/skill/SKILL.md` — "Domain-free (numpy + dataclass_values, never imports robot_msgs), so it sits beside dataclass_values, not in the viewers layer."
  - Evidence (2026-11-24): `/home/bam/robot_sdk_agent/solutions/s0/scorecard.json` — ""unlisted_repos": ["dataclass_coverage", "gripper-collision-tuner"]"
- **arm_motion_bench** · no-remote
  - What: The Trajectory Tracking Agent's original bench and workshop: frozen trajectory curricula (dev/holdout), the KPI catalog, baselines on UR5e, BAM FB and the pendulum, rig scripts. Commits 2026-11-19 to 2026-11-24. No remote, no toml.
  - Why: Zach ruled that datasets go with the agent that scores on them, and the TTA now vendors a frozen copy of this repo's data. So it is that agent's donor, not a package row. Record it as a link on the TTA row (see that entry).
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "Should this information go with the agent? ... 100% this is actually how you are calculating the objectives. (L1896-1898)"
  - Evidence (2026-11-24): `/home/bam/arm_motion_bench/pyproject.toml` — "A frozen curriculum of target trajectories for a 6-DOF arm (whole workspace + conveyor pick-and-place, dev + holdout)"
- **viser-3d-viewer** · no-remote
  - What: The house 3D viewer library on viser==1.1.1 (ViewCube, playback, scene switching). It does not import robot_msgs. No remote, not on PyPI, last commit 2026-10-04 (bff256e).
  - Why: A generic 3D viewer library, not a viewer on robot_msgs types, so it is not a row. It still blocks members' extras (traj_compare[viser], robot_collision[viz]), which robot_sdk docs/FOLLOWUPS.md already tracks.
  - Blocker: No remote and not on PyPI; this blocks those extras.
  - Evidence (2026-11-24): `/home/bam/robot_sdk/docs/FOLLOWUPS.md` — "viser-3d-viewer: not on PyPI and has no remote; it blocks traj_compare's `[viser]` and robot_collision's `[viz]` extras."
- **bam_ruckig** · private
  - What: bam-ruckig 0.1.0: jerk-limited, time-optimal trajectories behind Ruckig Pro 0.19.4's API, built on MIT Ruckig Community kernels plus its own waypoint optimiser. No runtime deps. Private, last commit 2026-11-13.
  - Why: BAM-branded, private, and it reimplements a commercial API, so check the licence before any public listing. It reaches the SDK as a WaypointTrajectoryGenerator plugin of robot_trajectories, not as its own row.
  - Evidence (2026-11-23): `vault:Sources/Chats/Claude Code/2026-11-23 — 18928da6 (CHAT).md` — "(we use bam ruckig) (L65)"
  - Evidence (2026-11-13): `/home/bam/bam_ruckig/pyproject.toml` — "Jerk-limited time-optimal trajectory generation with the Ruckig Pro 0.19.4 API (Ruckig Community kernels"
- **robot_trajectories (TrajectoryGenerator rename; ruckig/ruckig_pro/toppra plugins)** — layer `leaf` · public · declares itself
  - What: Zach's Nov 23 rename: TimeLaw becomes TrajectoryGenerator / WaypointTrajectoryGenerator. Plugin distributions live in robot_trajectories/plugins/ (ruckig, ruckig_pro, toppra).
  - Why: No change needed. The row's summary and [[consumes]] symbols already use TrajectoryGenerator and WaypointTrajectoryGenerator (no 'TimeLaw' left), and the summary already names 'ruckig, ruckig_pro, toppra as plugins'. ruckig_pro wraps a licensed build and can't be published.
  - Evidence (2026-11-23): `vault:Sources/Chats/Claude Code/2026-11-21 — 8a605bbe (CHAT)/8a605bbe — 2026-11-23.md` — "lets give it the name TrajectoryGenerator ... these ones are specially WaypointTrajectoryGenerators (L8234)"
  - Evidence (2026-11-24): `/home/bam/robot_trajectories/robot-sdk.toml` — "timed by a `WaypointTrajectoryGenerator` (... minimum_jerk, trapezoid, ruckig, ruckig_pro, toppra as plugins)"
- **robot_msgs backlog (trajectory dataset/run type; ServoCommand vs JointCommand)** — layer `vocabulary` · public · declares itself
  - What: Two decisions on the vocabulary package. (1) Zach wants a standard trajectory-dataset message in robot_msgs; no Run, Episode or dataset class exists in robot_msgs/src yet. (2) ServoCommand/ServoState stay the controller I/O, and JointCommand remains a homing-step type.
  - Why: Neither changes the directory row (layer, name and links are the same). These are package backlog items. For the Types view being built now: label JointCommand as a homing step, and show ServoCommand as what robot_controllers produces.
  - Evidence (2026-11-20): `vault:Sources/Daily Notes/Daily Note - Nov 20 2026.md` — "I think in robot msgs we want like a standard message for a dataset of trajectories etc etc... (L37)"
  - Evidence (2026-11-23): `vault:Sources/Chats/Claude Code/2026-11-21 — 8a605bbe (CHAT)/8a605bbe — 2026-11-23.md` — "ok we can keep servocommand and servostate than for now (L8241)"
- **robot_models (datasheet boundary)** — layer `models` · public · declares itself
  - What: Zach ruled on Nov 17 that robot_models knows only ModelFamily, Model and Parameter, and the datasheet belongs to RobotPart. src/robot_models/datasheet/ still exists.
  - Why: The directory row is unaffected: its one_line and summary don't claim datasheets. This is package refactor backlog that lands with robot_parts.
  - Evidence (2026-11-17): `vault:Sources/Chats/Claude Code/2026-11-17 — 54b39e41 (CHAT)/54b39e41 — 2026-11-17.md` — "so within robot Models.. actually I think it should only know about model Family. (L2737)"
- **Agents without a box (Sim to Real, Robot Model, PID Tuna, Controller, Robot Reach sessions; 1-DOF rack campaign)** · no-repo
  - What: Long-running Claude sessions named after member packages, plus AI Team cards (Projects/AI Team/Sim to Real Agent.md) and the Nov 15 1-DOF rack campaign (W&B 'Sim2Real · 1-DOF rack', 180-gate evaluate()). None has a repo with OBJECTIVES, ledger, status.json and a role=agent toml.
  - Why: Not agents by the README's definition until boxed, and Zach's rule is one repo per black box. The 1-DOF pendulum is explicitly deferred to the TTA's ruler v2, so it is not a separate agent. These are the likeliest next agent rows.
  - Blocker: No black-box repo.
  - Evidence (2026-11-24): `/home/bam/trajectory_tracking_agent/OBJECTIVES.md` — "## 5. Deferred to ruler v2 (named so nobody thinks they were forgotten)"
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "Ok so each blackbox I basically give its own repo (L761)"
- **BAM application agents (Pick-Goal Coordinator / Real SPPM, Difficulty Agent, W2/W3 goal agents)** · no-repo
  - What: BAM pick-cell and weekly-goal coordinator sessions, with AI Team cards (for example Projects/AI Team/Pick-Goal Coordinator.md, KPI real picks per day).
  - Why: They operate BAM's application rather than building generic packages, and none has a black-box repo.
  - Evidence (2026-11-21): `vault:Sources/Chats/Claude Code/2026-11-21 — 6e5a8628 (CHAT).md` — "When I said do SPPM, it wasn't really making great progress. when I broke that down, it start making far better progress."
- **Non-robotics agents (claude_party_agent, vibetracks_agent)** · private
  - What: Black-box agents on the same template: claude_party_agent (remote set; 2f6540f) and /home/bam/vibetracks_agent (no remote; 4bf9268), both created 2026-11-24.
  - Why: They are in agent format but build Zach's own tooling, not robotics packages. The building session left claude_party_agent out of robot_sdk on purpose.
  - Evidence (2026-11-24): `vault:Sources/Daily Notes/Daily Note - Nov 24 2026.md` — "Please make a blackbox agent for vibe tracks it self. (L2628)"
- **GUIs, workbenches and apps (io-diagnostics, Clank, cad-exporter/cad2robot + CadDescription viewer + Datasheet editor/viewer, Robotics IDE, splice, Five-Bar Studio, robotparts site views, Obsidian STEP viewer)** · public
  - What: Apps that use the SDK. io-diagnostics (public; depends on robot-diagnostics), /home/bam/clank-workbench, /home/bam/cad-exporter and /home/bam/cad2robot (Fusion add-ins, last commits Sep 2026), bam_ws bam_robot_ide, /home/bam/splice (no remote), the five-bar design studio, robotparts' MuJoCo tab and its VS Code/Obsidian viewers, and the Obsidian STEP plugin.
  - Why: The README's scope rule: GUIs and workbenches use the SDK the way RViz uses ROS. The datasheet 'view' over a RobotDescription has no package yet; only a mock and the Fusion palette exist.
  - Evidence (2026-11-23): `vault:Sources/Chats/Claude Code/2026-11-23 — 34000252 (CHAT).md` — "Agreed that clank can be a workbench that uses robot sdk"
  - Evidence (2026-11-24): `/home/bam/robot_sdk/README.md` — "Not in here: GUIs and workbenches. They use the SDK, the way RViz uses ROS."
- **Generic data/document tooling (data-ui, datasheet-extractor, markdownify, source-highlighter, actuator/psu/camera/compute atlases)** · no-remote
  - What: A shared web view kit (data-ui, no remote). The datasheet ingestion pipeline repos are public on GitHub. The part atlases (psu-atlas, compute-atlas: no remote) feed robotparts.
  - Why: Domain-free, and none uses robot_msgs types. Viewers vendor data-ui the way rqt uses Qt, and the atlases reach the SDK only through robotparts. Zach called markdownify an internal tool.
  - Evidence (2026-11-16): `vault:Sources/Chats/Claude Code/2026-11-16 — d40e2c37 (CHAT)/d40e2c37 — 2026-11-16.md` — "if it overlaps this can just be an internal tool for me"
- **BAM rig and study code (hyper_rgb, bam_rack_twin, bam_calibration, moteus_servo/intel_rgbd drivers, rackq router, belt-sim, screw-spec calculators, HSI-oracle plan, wandb_trackers, AI Team directory)** · public
  - What: Rig-specific or BAM-branded code: hyper_rgb (public), bam_ws src/dev/bam_rack_twin, src/core/mdp/setup/bam_calibration (9-method kinematic calibration benchmark), vendor-branded drivers, the rackq router in bam_robot_activity, and belt-sim (public, numpy-only, no robot_msgs). Also bolt-sizing scripts and agent-infrastructure boards.
  - Why: Each is either BAM-branded, rig-specific, vendor-branded or outside robot_msgs. Reusable parts already live in members (sim2real.fit camera types, robot_diagnostics checks, robot_activity), or would arrive as a sim2real routine (kinematic calibration) or through robotparts drivers. belt-sim is generic but joins on no SDK type and Zach never asked to list it.
  - Evidence (2026-11-14): `vault:Sources/Chats/Claude Code/2026-11-15 — 1083b088 (CHAT)/1083b088 — 2026-11-14.md` — "I feel the UR 2 armed calirbation is a great cheap way to get really really accurate kinematic calibration"
  - Evidence (2026-11-11): `/home/bam/belt-sim/pyproject.toml` — "name = "belt-sim" ... dependencies = ["numpy>=1.26"]"

## Calls left for Zach

(a) whether a viewer may depend on another viewer, for robot_dashboards; (b) where RobotDescription sits in the layer stack; (c) whether close neighbours (dataclass_values, dataclass_coverage, viser-3d-viewer) get a listed section, which would also make the robot_sdk_agent listed_all gate pass; (d) the names for data_recorder (PyPI taken) and robot_descriptions (PyPI taken).

## Since the sweep (2026-11-25 00:30)

- robot_msg_viz is now PUBLIC and being pinned as a viewer by the personal-account Robot SDK Agent session (pyproject + LAYERS edit in flight at 00:16).
