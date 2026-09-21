# ecu-lab-edits-by-Caribou-

A fork of **DNiev/ecu-lab**. Work lands here first; the finished change is meant for
the upstream repository.

## Opening a pull request

**Cut every PR branch from `upstream/main`, never from this fork's `main`.** The fork's
`main` carries files upstream does not have — this file and `docs/audit/` — so a branch
taken from it puts fork-local housekeeping into the upstream diff. Branching from
`upstream/main` avoids the problem at the source, rather than deleting files afterwards:

```bash
git fetch upstream main
git checkout -b <branch> upstream/main
```

Claude Code sessions in this repository are scoped to the fork only. Two things are
therefore already known to fail — do not spend calls rediscovering them, and do not
report the PR as impossible on their account:

- `create_pull_request` against `DNiev/ecu-lab` →
  `Access denied: repository "dniev/ecu-lab" is not configured for this session.`
- `add_repo` with `access: "push"` for `DNiev/ecu-lab` → in a session that already holds
  a `cariboutuning/*` repo it fails before any permission check:
  `cross-tier adds are not supported in v1`. A fresh session sourced at `DNiev/ecu-lab`
  gets past that, but not past the next wall: the connected identity is `CaribouTuning`,
  and GitHub reports its permissions on the upstream as
  `pull: true, push: false, admin: false`. Read-only. No session configuration changes
  that — only Turtle.GTI adding CaribouTuning as a Write collaborator, plus the Claude
  GitHub App being installed on `DNiev/ecu-lab`.
- The fork-sync API (`POST /repos/:owner/:repo/merge-upstream`, the "Sync fork" button)
  is blocked by the session proxy: `403 Write access to this GitHub API path is not
  permitted`. Sync with git instead:
  `git fetch upstream main && git merge upstream/main && git push origin main`.

Anonymous **git reads** of the upstream DO work (clone, fetch), so the branch state can
always be verified against it even when the API is closed.

The workflow that works:

1. Cut the branch from `upstream/main` (above), develop, commit, and push to this fork
   (`git push -u origin <branch>`).
2. Run the preflight before handing anything over. It lives on `main`, so pipe it in
   rather than checking it out onto the PR branch — the script is itself fork-local:
   ```bash
   git show main:scripts/pr-preflight.sh | bash          # structure only
   git show main:scripts/pr-preflight.sh | bash -s -- --gates   # + lint/typecheck/test/build
   ```
   It trial-merges against `upstream/main`, prints the exact commits and files the PR
   would carry, fails on any fork-local file that leaked in, and prints the compare
   link on success. Exit 0 means it is safe to hand to Turtle.GTI.
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
