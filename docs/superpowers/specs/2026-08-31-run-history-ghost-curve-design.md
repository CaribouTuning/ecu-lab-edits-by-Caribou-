# Run History and the Ghost Curve — Design

**Issue:** #61 (UI overhaul PR 5), sub-issue of #6.

**Goal:** Keep every dyno pull as a record the player can see, compare against, and pin as
the chart's comparison curve — and make that comparison curve legible for the first time.

## Scope

Issue #61 bundles four features. It ships as three PRs:

| PR | Contents |
|---|---|
| **5a** | Run-history timeline, the ghost-curve fix, pinning. **This spec.** |
| 5b | Knock and lean events plotted at the RPM they occurred, clickable through to the log. |
| 5c | Post-pull scrubber — drag the RPM axis, every gauge replays at that point. |

5b and 5c get their own specs. They are named here only so the boundaries are explicit.

**Out of scope for 5a, deliberately:**

- **Event markers on the curve.** Events carry no structured RPM (see "What the issue got
  wrong" below); adding it is a `src/sim/sweep.js` change and belongs to 5b.
- **The scrubber.** It replays the *current* pull, which is already in memory at full
  fidelity; it needs nothing from this PR.
- **A shaded band showing the gain between two pulls.** Considered and rejected for 5a: it
  needs a designed rule for where the tune got *worse* (the band inverts and wants a
  different colour), and that is a design question, not an implementation detail.
- **A user-facing "clear history" control.** The 20-run cap evicts on its own. Nothing has
  asked for manual clearing; YAGNI.

## What the issue got wrong

The issue's citations were written against the pre-PR-3 tree. Verified against `94e8e1c`:

- **The ghost curve is not at `EcuLab.jsx:2105`.** That file is 1083 lines now. The ghost
  is `ResultScreen.jsx:55-56`, fed by `chartData` at `EcuLab.jsx:700`.
- **It is not drawn in `#3a4149`.** That literal is gone. It is `T.ink3` (`#5c6880`).
- **"A grey dark enough to be nearly invisible" is the right conclusion for the wrong
  reason.** `#5c6880` on the panel (`#131824`) is **3.17:1** — passing the 3:1 floor for
  non-text graphics. The actual defect is that `T.ink3` is *also* the colour of the X and
  Y axes, the tick labels, and the `afrCommanded` trace on the chart below. The ghost is
  not too dim to see; it is indistinguishable from chart furniture.
- **There is no index-vs-RPM misalignment bug.** `SWEEP_START_RPM` (1500) and
  `SWEEP_STEP_RPM` (100) are constants and only `endRpm` moves with redline
  (`sweep.js:86-87`), so `points[i].rpm === 1500 + 100i` always, and the index join at
  `EcuLab.jsx:700` *is* an RPM join. A higher-redline previous pull truncates; it never
  misaligns.

These claims hold and are the work:

- `prevResult` remembers exactly one pull back (`reducer.js:476`).
- Chart and log are separate things the player correlates by hand.
- A session is a series of disconnected numbers rather than a story.

## Measurements

Taken by running `simulateSweep` on the first `ENGINE_PRESETS` entry, not estimated:

| Quantity | Value |
|---|---|
| Points per sweep | 61 (1500 RPM → redline, 100 RPM steps) |
| Fields per point | 50 |
| Full result as JSON | **46,459 bytes** |
| `{rpm, hp, torque}` only | **2,258 bytes** |
| All three calibration tables (6×8) | **584 bytes** |

A full-fidelity history would cost ~1 MB for 20 runs against a ~5 MB `localStorage`
budget, and serialise 46 KB on every pull. A slim record costs ~4 KB. The slim record is
what this design stores.

## Architecture

### Naming

The store already has a top-level `history` slice — `{past, future}`, the undo stack from
PR 4a. This feature is therefore **`session.runs`**, and its module is
**`src/ui/state/runLog.js`**. Nothing in this feature is called "history".

### The run record

```js
/**
 * @typedef {object} RunRecord
 * @property {string} id       monotonic, assigned at bank time — NOT an array index,
 *                             because a pin must survive eviction of other runs
 * @property {number} at       epoch ms, for the row's relative timestamp
 * @property {string} label    engine name at the time of the pull
 * @property {number} peakHp
 * @property {number} peakTq
 * @property {number} knocks   count of events with type === 'knock'
 * @property {{tuning: number, engineer: number, pull: number}} scores
 * @property {{rpm: number, hp: number, torque: number}[]} points
 * @property {{build: object, tune: object, loadKpa: number}} inputs
 */
```

`knocks` exists because the delta panel at `EcuLab.jsx:994-998` reads
`prevResult.events` to count them. A slim record has no `events`, so the count is stored
at bank time instead. It is the only thing that panel needs from the event log.

`inputs` holds exactly the values `pullSignature` signs. That is what makes the run diff
possible without a second, drifting list of "what matters".

**Size:** ~2.3 KB of points + ~1.5 KB of inputs + scalars ≈ **4 KB per run**, ~80 KB at
the 20-run cap.

### `src/ui/state/runLog.js`

Pure module. Imports nothing from `reducer.js` — the same cycle `history.js` was written
to avoid.

```js
export const RUN_LIMIT = 20;

/** Builds a RunRecord from a completed pull. */
export function makeRunRecord({ result, scores, build, tune, loadKpa, label, id, at });

/** Newest-first, capped at RUN_LIMIT, evicting the OLDEST. */
export function pushRun(runs, record);

/** The run the ghost should draw: the pin if it still exists, else the previous run. */
export function ghostRun(runs, pinnedRunId);

/** SVG path data for a timeline row's sparkline. Pure — no DOM. */
export function sparklinePath(points, width, height);
```

`ghostRun` returns `runs.find(r => r.id === pinnedRunId) ?? runs[1] ?? null`. Index 1,
not 0: `runs[0]` is the pull just banked, which is the *current* result.

### The run diff lives in `pullSignature.js`

`pullSignature.js`'s header states that it answers "has any measured input moved?" and
**never** "which one", and gives the reason: a hand-written field-by-field comparison
drifts out of sync with the signature as fields are added.

The timeline needs "which one". Two ways to get it were considered:

1. **Export `MEASURED_BUILD_KEYS`/`MEASURED_TUNE_KEYS`, diff in `runLog.js`.** Rejected.
   `history.js` deliberately keeps its own key arrays private so that tests cannot derive
   their expectations from the thing under test. Exporting these reintroduces exactly that
   hazard one module over, and puts the diff's field list somewhere it can fall out of step
   with the signature's.
2. **Add `diffMeasuredInputs(a, b)` to `pullSignature.js`; keys stay private.** ✅ Chosen.
   The module already owns the lists and documents its own membership rule, so the diff
   cannot drift from the signature. A new simulation input added to `MEASURED_BUILD_KEYS`
   is signed *and* diffed in one edit.

This widens the module's charter, so **its header must be rewritten to say so** — from
"the identity of the configuration a pull was measured on" to identity *and* difference.
It is a deliberate change to a module with a narrow, well-argued contract, and it should
read as one rather than as an extension nobody noticed.

```js
/**
 * @returns {string[]} human labels for every measured input that differs, e.g.
 *   ['boost curve', 'VE table']. Empty when the two configurations are identical —
 *   which is exactly when their signatures are equal.
 */
export function diffMeasuredInputs(a, b);
```

The labels are display strings (`'boost curve'`, not `'boostCurve'`), so the mapping from
key to label lives beside the key arrays, in the same file, and a key with no label is a
loud failure rather than a blank row — the same discipline `labelFor` took in `reducer.js`
after PR 4a.

### State, actions and storage

**SESSION slice.** Adds `runs: RunRecord[]` (newest first) and `pinnedRunId: string|null`.
**Removes `prevResult`.**

`prevResult` is deleted rather than kept alongside `runs`, because `runs[1]` is the same
fact and two representations of one fact drift. Its readers migrate:

| Reader | Becomes |
|---|---|
| `EcuLab.jsx:700` (`chartData` ghost columns) | reads `ghostRun(runs, pinnedRunId)` |
| `EcuLab.jsx:994-998` (delta panel) | reads `runs[1]`, using stored `knocks` |
| `ResultScreen.jsx:37, 55-56` | takes the ghost run as a prop |
| `initialState.js:96, 181` | typedef and initial value removed |
| `reducer.js:434` (`APPLY_PRESET` clear) | drops the `prevResult: null` line |
| `reducer.js:476` (`BANK_PULL` rotation) | replaced by the `pushRun` unshift |

The `BANK_PULL` rotation carries a documented ordering hazard at `reducer.js:474` — the
old result must be banked *before* the new one overwrites `result`, or the comparison
becomes a comparison with itself. `pushRun` inherits that hazard and the test that covers
it.

**New actions:** `PIN_RUN` (`{id}`) and `UNPIN_RUN`.

**Lifecycle.** `APPLY_PRESET` continues to clear `result` and `pullScores` and now
explicitly leaves `runs` and `pinnedRunId` standing. A scorecard is cleared because it
would otherwise sit over no curve; a log of pulls the player actually took stays true
whatever is loaded now, and each record carries its own `inputs`, so it is self-describing.
Comparing an LS pull against a VQ pull is a legitimate thing to want.

`RESET_TO_STOCK` does **not** touch the `session` slice at all today — it never cleared
`result` or `prevResult`, and this PR does not change that. (The pairing of the two actions
is a natural assumption and a wrong one; whether `RESET_TO_STOCK` *should* clear the
scorecard is a separate question this PR does not answer.)

**Storage.** `storage.js` persists `{best, total, pulls}` under key `career`. It grows to
`{best, total, pulls, runs, pinnedRunId}`.

Backward compatibility is a hard requirement: an existing save has no `runs` key and must
load as `[]` with `pinnedRunId: null`, not as `undefined` and not as a thrown error. The
existing per-field coercion in `loadCareer` (`Number(parsed.best) || 0`) is the pattern to
extend. Its `try/catch` returning `EMPTY_CAREER` on a corrupt save stays as it is.

A `runs` array longer than `RUN_LIMIT` on load — a save written by a future build, or a
hand-edited one — is truncated to the cap rather than trusted.

## The ghost curve

Treatment: **dimmed series colour, dashed** — each ghost line keeps its live line's hue.

| Line | Colour | Width | Dash | Opacity |
|---|---|---|---|---|
| WHP | `T.acc` `#4c9eff` | 2 | — | 1 |
| Torque | `T.cyan` `#38d9f0` | 2 | — | 1 |
| Ghost WHP | `T.acc` | 1.5 | `5 4` | 0.5 |
| Ghost TQ | `T.cyan` | 1.5 | `5 4` | 0.5 |

Hue carries series identity; opacity carries time. This fixes the actual defect — the
ghost is no longer the same colour as the axes and the `afrCommanded` trace — without
introducing a token. It was chosen over lifting the ghost to `T.ink2` (`5.67:1`, legible
but one colour for both ghost series, so power and torque are indistinguishable where they
cross) and over a thin solid variant (leans entirely on colour, closer in character to the
gridlines).

**The join becomes explicit.** `chartData` builds a `Map` from the ghost run's `rpm` to its
point and looks each row up by RPM, instead of indexing by position. This produces
identical output today — see "What the issue got wrong" — but a *pinned* run may be any
length, and the join should state what it means rather than rely on an invariant two
modules away.

**The legend names the comparison.** Unpinned it reads `Prev WHP` / `Prev TQ`, as now.
Pinned it names the run, so the chart never silently compares against something other than
the previous pull.

## The screen

`src/ui/screens/dyno/HistoryScreen.jsx` and `HistoryScreen.module.css`, routed at
`#/dyno/history` as a fourth DYNO section beside CURVES, DATALOG and SCORE, registered in
`routing.js` alongside them.

Each row carries: run ordinal and relative time, sparkline, peak WHP and torque, delta
versus the run before it, knock count, and a pin toggle. The pinned row is visibly marked.

Before the first pull the screen shows an empty state rather than an empty table.

The sparkline is `sparklinePath` from `runLog.js` rendered into an inline `<svg>` — no new
dependency, and the path maths is unit-tested without a DOM.

## Verification

Full gate on every commit, per `CONTRIBUTING.md`, on Node 22 (`v22.23.2`):
`npm test`, `npm run lint` (`--max-warnings 0`), `npm run typecheck`, `npm run build`.
Tests run as `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork`.

**No `src/sim/` change in 5a.** `tests/fixtures/fingerprint.sha256` and
`tests/ui/characterisation.test.jsx` must be byte-identical to `main` at merge.

### Tests, and the failure mode they are written against

PR 4a shipped seven task suites and every one of them failed to hold its implementation, in
one of five shapes: pinning one side of a pair; pinning each case but not the exclusivity
between them; moving two variables at once so neither is held; asserting a count or a shape
but not which end; and a harness that reads post-state for its "before", so the assertion
cannot fail. The implementation plan carries the discriminating test *into each brief*
rather than leaving it to the implementer.

Required, each stated as the mutation it must fail under:

- **Eviction asserts which end.** A 21st run drops the *oldest* and the newest is at index
  0. Reversing `pushRun`'s order must fail the test. (In 4a, a FIFO undo stack passed 871
  tests.)
- **Pin fallback holds both halves.** A pinned run wins over the previous run, *and* an
  absent pin falls back to the previous run. Each half must fail independently.
- **A pinned run that has been evicted** falls back to the previous run rather than
  throwing. `ghostRun` returning `undefined` must fail.
- **`diffMeasuredInputs` holds both sides.** A changed field appears in the result *and* an
  unchanged one does not. Returning all keys unconditionally, and returning `[]`
  unconditionally, must each fail.
- **`APPLY_PRESET` holds both halves.** It clears `result` and `pullScores`, *and* leaves
  `runs` and `pinnedRunId` untouched. Each half must fail independently.
- **`RESET_TO_STOCK` leaves the session slice alone**, pinning today's behaviour so the
  natural-but-wrong pairing with `APPLY_PRESET` cannot be introduced silently.
- **Storage round-trips a legacy blob.** `{best, total, pulls}` with no `runs` key loads as
  `runs: []`, `pinnedRunId: null`. An over-length `runs` array loads truncated to
  `RUN_LIMIT`.
- **`BANK_PULL` order.** The banked run is the one just completed and `runs[1]` is the one
  before it — the hazard documented at `reducer.js:474`, carried over to `pushRun`.

Test files: `tests/ui/state/runLog.test.js`, `tests/ui/state/pullSignature.test.js`
(extended), `tests/ui/state/reducer.test.js` (extended), `tests/storage.test.js`
(extended), `tests/ui/dyno-screens.test.jsx` (extended for the new screen and the ghost).

## Risks

| Risk | Mitigation |
|---|---|
| Removing `prevResult` breaks a reader nobody listed | The six sites are enumerated above; `typecheck` fails on any missed one once the typedef is removed |
| A legacy save breaks on load | Explicit test for the pre-`runs` blob shape; per-field coercion, not a whole-object trust |
| The diff drifts from the signature | Both derive from one private key list in one file — the reason for choosing option 2 in §"The run diff" |
| Storage grows unbounded | Hard cap at `RUN_LIMIT`, enforced on write *and* on load |
| Four lines on one chart is busy | Ghost lines are 1.5px at 0.5 opacity against 2px solid; hue keeps the pairs readable |
