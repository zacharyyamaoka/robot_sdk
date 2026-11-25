# robot-sdk follow-ups

Open items handed to robot_sdk by other sessions. Close one by deleting its line in the commit that resolves it.

- **robot_collision (added 2026-11-24, robot_sdk 13403ba):** not public yet. Zach runs `/home/bam/robot_collision/tools/publish.sh` himself (it creates the public repo and Pages site); then push robot_collision's local `robot-sdk.toml` commit (19aa8d0, part of main), check its CI, and add `publish.yml` per docs/release-brief.md if the script didn't. Its `[viz]` extra needs viser-3d-viewer on PyPI. PyPI pending-publisher row is on reports/pypi-publishers-2026-11-23.html.
- **viser-3d-viewer:** not on PyPI and has no remote; it blocks traj_compare's `[viser]` and robot_collision's `[viz]` extras.
- **robot_msgs "Used by packages" (robot_msgs 23c1b0a):** committed, not deployed; robotmsgs.com deploy runs site tests that are red on main from another session's in-flight website work.
