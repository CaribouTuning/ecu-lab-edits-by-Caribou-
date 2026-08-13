# ecu-lab-edits-by-Caribou-

A fork of **DNiev/ecu-lab**. Work lands here first; the finished change is meant for
the upstream repository.

## Opening a pull request

**Do not include this file in a branch destined for an upstream PR.** It is fork-local
housekeeping and has no business in the upstream diff. `git rm CLAUDE.md` on the PR
branch before handing over the compare link (it stays on `main` regardless).

Claude Code sessions in this repository are scoped to the fork only. Two things are
therefore already known to fail — do not spend calls rediscovering them, and do not
report the PR as impossible on their account:

- `create_pull_request` against `DNiev/ecu-lab` →
  `Access denied: repository "dniev/ecu-lab" is not configured for this session.`
- `add_repo` with `access: "push"` for `DNiev/ecu-lab` → requires an approval that the
  session cannot grant itself. Worth one attempt if the user wants to authorise it;
  if it is refused at the org level, a repo admin has to enable the repository in the
  Claude GitHub settings first.

Anonymous **git reads** of the upstream DO work (clone, fetch), so the branch state can
always be verified against it even when the API is closed.

The workflow that works:

1. Develop and commit on the designated branch, push to this fork
   (`git push -u origin <branch>`).
2. Verify the branch is a clean fast-forward on upstream before handing it over:
   ```bash
   git remote add upstream https://github.com/DNiev/ecu-lab
   git fetch upstream main
   git merge-base --is-ancestor upstream/main HEAD   # exit 0 = clean
   git log --oneline upstream/main..HEAD             # exactly your commits
   git remote remove upstream
   ```
3. Give the user a prefilled compare link — the fork is named differently from the
   upstream, so the `owner:repo:branch` form is required:
   ```
   https://github.com/DNiev/ecu-lab/compare/main...CaribouTuning:ecu-lab-edits-by-Caribou-:<branch>?expand=1
   ```
4. Supply the PR title and body as a pasteable file rather than only in chat.

A PR merged into this fork's `main` is **not** the same as landing upstream. Check
which one actually happened before saying the work is done.

## Before you push

`npm test` · `npm run lint` · `npm run typecheck` · `npm run build` — CI runs all four.

Read `CONTRIBUTING.md` first; it is short and it is binding. The two rules that catch
people out:

- **Nothing adds horsepower.** Every part must change airflow, pressure, temperature or
  fuel delivery and let power fall out of the physics.
- **The fingerprint test is not a formality.** If `tests/fingerprint.test.js` fails,
  work out what moved before refreshing the fixture. Generate a before/after report
  (`node scripts/update-fingerprint.js --report` on each revision, then diff the two
  JSON dumps) and state in the PR which numbers changed and why. Confirming that hp,
  torque and the scores did *not* move is usually the most useful line in the writeup.

Empirical numbers go in `src/sim/coefficients.js` with a comment explaining them —
nowhere else in `src/sim/`.
