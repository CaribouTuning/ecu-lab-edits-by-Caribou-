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
2. Keep the branch a **fast-forward** on `upstream/main` for its whole life. When
   upstream moves, `git rebase upstream/main` — never `git merge upstream/main` into
   the branch. See "Why past PRs needed rebuilding" below; this is the single biggest
   cause of Turtle having to take a branch over.
3. Run the preflight before handing anything over. It lives on `main`, so pipe it in
   rather than checking it out onto the PR branch — the script is itself fork-local:
   ```bash
   git show main:scripts/pr-preflight.sh | bash                # full gate
   git show main:scripts/pr-preflight.sh | bash -s -- --quick  # structure only, no CI
   ```
   Exit 0 with no warnings means: fast-forward, linear, no stray files, and green on
   every Node version CI uses. That is the bar for "Turtle presses Merge and that is
   it". Anything less and he does work you were supposed to do.
4. Give the user a prefilled compare link — the fork is named differently from the
   upstream, so the `owner:repo:branch` form is required:
   ```
   https://github.com/DNiev/ecu-lab/compare/main...CaribouTuning:ecu-lab-edits-by-Caribou-:<branch>?expand=1
   ```
5. Supply the PR title and body as a pasteable file rather than only in chat.

A PR merged into this fork's `main` is **not** the same as landing upstream. Check
which one actually happened before saying the work is done.

## Why past PRs needed rebuilding

Turtle has had to open his own PR to land work from this fork. The causes are on the
record, and all of them are preventable here:

**#41 → his #45 `integrate/crank-angle-cycle`**, titled "Integrate #41's crank-angle
cycle with main, and fix its blocking defects". Three separate problems:

- The branch had gone stale and conflicted with main. His merge commit had to settle
  which advisor survived and treat `tests/fingerprint.js` as a *union* rather than an
  overwrite — a judgement call the PR forced onto him.
- Three blocking review findings in the physics (fuel-mass energy released from
  delivered rather than burnable mass; an uncapped blowdown expansion; unwired
  `turbineCount`).
- **The fingerprint was generated on the wrong Node.** His note: the untouched PR head
  `f4fdaff` "passes on 20.18.1 and fails on 26.0.0, same commit, same machine". The
  hash is float-sensitive, so a green run proves nothing unless it is green on the
  versions CI actually uses.

**#90 `claude/restore-missing-content`** never landed at all. The branch carried two
`Merge upstream main: ...` commits and conflicts in seven files. Re-run the preflight
against it today and it still reports both — it was unmergeable when it was handed over.

The lesson in one line: **rebase, never merge, and prove the fingerprint on every Node
in the CI matrix.**

### The fingerprint and Node versions

`.github/workflows/ci.yml` runs the suite on a matrix of Node **20 and 22**, on purpose
— the comment in it says running the float-sensitive hash on more than one version
"proves the physics is reproducible across V8 releases". `package.json` declares
`engines: node >=20 <23` and `.nvmrc` pins 22.

So a fingerprint regenerated on a single version is not evidence. Before regenerating
one, make both versions available and confirm the hash holds on each:

```bash
nvm install 20 && nvm install 22
git show main:scripts/pr-preflight.sh | bash    # runs every gate on both
```

Work outside that range at all — Node 23+ — and the hash it produces is one CI cannot
reproduce. That is precisely what cost #41.

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
