# Brief: make a robot-* package public and PyPI-ready (2026-11-23)

Zach's ask: "make sure all of these packages are being bundled and are public and ready to go on pypi".
They are bundled by the `robot-sdk` metapackage in /home/bam/robot_sdk (do NOT edit that repo; the dispatcher owns it).
GitHub owner: zacharyyamaoka. PyPI publishing is trusted publishing (no tokens anywhere); copy
/home/bam/robot_msgs/.github/workflows/publish.yml as the template.

## For each repo you own, in order

1. **Peer safety.** Other agents work in these repos. Run `git status --porcelain` first. Never touch,
   stage, stash, reset or restore a file that is already dirty/untracked or whose mtime moved in the
   last 15 min. Never `git add -A` / `git add .`; stage named files only and read
   `git diff --cached --name-only` before every commit. Commits end with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
2. **Secrets and private-data scan of the FULL git history** (not just the tree):
   `uvx detect-secrets scan --all-files` on the tree, plus `git log -p --all | grep -nEi`
   for api[_-]?key, secret, token, passwd|password, BEGIN .*PRIVATE KEY, wandb_api, sk-, ghp_, AKIA,
   .env, pypi-. Also look for customer/hospital names, phone numbers or emails other than Zach's own,
   and large binaries in history (`git count-objects -vH`; anything >50 MB packed is a finding).
   Judge each hit (test fixtures and placeholder strings are fine). **A real secret or private data =
   STOP for that repo: do not make it public, do not push; report it with file + commit.**
3. **pyproject.toml metadata:** `license = "MIT"` with a LICENSE file (MIT, "Copyright (c) 2026 Zach
   Yamaoka") if missing; `readme`; `requires-python`; `authors = [{name = "Zach Yamaoka"}]` (no email);
   `[project.urls]` Homepage + Repository = https://github.com/zacharyyamaoka/<repo>; a one-line
   generic description (unbranded: no "BAM" in the PyPI description); a few classifiers.
4. **Real runtime dependencies.** `[project].dependencies` must list every third-party package the
   installed code imports (find them by grepping imports in src/); heavy/optional ones go in extras
   and their imports must be lazy, or listed as required. No path/git deps in [project] (uv sources
   for local dev are fine). Internal deps: `robot-msgs>=0.3.0`, `robot-models-lib`,
   `robot-trajectories` etc. by PyPI name.
5. **Prove the wheel works isolated from the local checkouts:**
   `uv build --no-sources` → `uvx twine check dist/*` → a fresh venv in your scratchpad,
   `uv pip install <wheel> ` with internal robot-* deps installed from their local wheels or PyPI (NOT
   editable checkouts), then import every module of the package and run the test suite against the
   installed wheel. Paste the real output into your report.
6. **Version:** keep the current version unless PyPI already has that version with older code
   (then bump minor). Do not push any `v*` tag; the dispatcher tags after PyPI publishers exist.
7. **CI:** add `.github/workflows/publish.yml` (from robot_msgs, project name adapted in the header
   comment) and a `test.yml` if missing.
8. **GitHub:** only if step 2 is clean: create the repo if there is none
   (`gh repo create zacharyyamaoka/<repo> --public --source <dir> --remote origin`) or flip it with
   `gh repo edit zacharyyamaoka/<repo> --visibility public --accept-visibility-change-consequences`,
   then push main (verified work only; never force).

## Limits
Memory is tight (~5 GB free): one build/test at a time, no parallel test runs, no `find /`.
Don't edit /home/bam/robot_sdk or any repo you weren't given.

## Report (concise)
Per repo: scan verdict (with any hits judged), deps added, wheel-test output (pass counts), version,
public yes/no, pushed sha, anything you could not do and why.
