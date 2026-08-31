# Run History and the Ghost Curve — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the last 20 dyno pulls as a persisted, browsable log; let any of them be pinned as the chart's comparison curve; and make that comparison curve legible.

**Architecture:** A pure module (`src/ui/state/runLog.js`) owns the run record and the operations over a list of them. The SESSION slice gains `runs` and `pinnedRunId` and loses `prevResult`. `pullSignature.js` widens from "has any measured input moved?" to also answer "which one", so the run diff cannot drift from the signature. A new DYNO section renders the timeline.

**Tech Stack:** React 18 + `useReducer` (single store, three context hooks), CSS Modules, recharts, vitest + @testing-library/react, JSDoc-typed JS checked by `tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-08-31-run-history-ghost-curve-design.md`

## Global Constraints

- **Node 22 only** — `v22.23.2`. Node 26 shifts float results and invalidates the fingerprint hash on its own.
- **Run the suite as** `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork`. Do **not** use `npx vitest` — it resolves a different cached copy that rejects `--poolOptions`.
- **No `src/sim/` changes in this PR at all.** `tests/fixtures/fingerprint.sha256` and `tests/ui/characterisation.test.jsx` must be byte-identical to `main` at merge. Verify with `git diff --stat origin/main -- src/sim tests/fixtures/fingerprint.sha256 tests/ui/characterisation.test.jsx` — expect empty output.
- **Never run `npm run test:fingerprint:update`.**
- **No hard-coded colours anywhere under `src/ui/`** — no hex, no `rgb()`/`rgba()`, no `hsl()`. `tests/no-hardcoded-colours.test.js` enforces this per file. Use `var(--token)` in CSS Modules and `T.*` from `src/ui/theme.js` in JSX.
- **Full gate before every commit:** `npm test`, `npm run lint` (`--max-warnings 0`), `npm run typecheck`, `npm run build`. All four must pass.
- **A raw test total is not a stable baseline.** `no-hardcoded-colours.test.js` generates 2–3 tests per source file under `src/ui/`, so the two files created in Task 7 add ~5 tests on their own. Compare per-file counts, not the grand total.
- **`RUN_LIMIT` is 20.**
- **Ghost curve treatment:** ghost WHP is `T.acc` and ghost torque is `T.cyan`, both `strokeWidth={1.5}`, `strokeDasharray="5 4"`, `opacity={0.5}`. Live lines stay `strokeWidth={2}`, solid, full opacity.
- **`git add` explicit paths only.** Never `git add -A`, never `git add .`.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/ui/state/runLog.js` | The run record and every pure operation over a list of runs. Imports nothing from `reducer.js`. |
| `src/ui/screens/dyno/HistoryScreen.jsx` | DYNO > HISTORY. Renders the timeline, owns the pin control. |
| `src/ui/screens/dyno/HistoryScreen.module.css` | Its styles. Tokens only. |
| `tests/ui/state/runLog.test.js` | Unit tests for `runLog.js`. No DOM. |

**Modify:**

| File | Change |
|---|---|
| `src/ui/state/pullSignature.js` | Add `measuredInputs` and `diffMeasuredInputs`; rewrite the header for the widened charter. Key arrays stay private. |
| `src/ui/state/initialState.js` | SESSION typedef and initial value: add `runs`, `pinnedRunId`; remove `prevResult`. |
| `src/ui/state/reducer.js` | `PIN_RUN`/`UNPIN_RUN` actions and typedefs; `BANK_PULL` records the run; `APPLY_PRESET` drops its `prevResult` line. |
| `src/storage.js` | Persist and restore `runs` and `pinnedRunId`. |
| `src/ui/EcuLab.jsx` | Build the run record in `doRun`; ghost via `ghostRun`; RPM-keyed chart join; persistence effect; render the new section. |
| `src/ui/screens/dyno/ResultScreen.jsx` | Ghost line treatment; takes `ghostLabel` as a prop instead of reading `prevResult`. |
| `src/ui/routing.js` | `ROUTES.dyno` gains `'history'`. |
| `tests/ui/state/pullSignature.test.js` | Cover the two new functions. |
| `tests/ui/state/reducer.test.js` | Cover the new actions and the lifecycle guarantees. |
| `tests/storage.test.js` | Cover the legacy blob and the new fields. |
| `tests/ui/session-store.test.jsx` | Cover the persistence effect's mount guard. |
| `tests/ui/dyno-screens.test.jsx` | Cover the new screen and the ghost. |

---

## Task 1: `runLog.js` — the pure run-log module

**Files:**
- Create: `src/ui/state/runLog.js`
- Test: `tests/ui/state/runLog.test.js`

**Interfaces:**
- Consumes: nothing. This task adds no imports to existing modules.
- Produces:
  - `RUN_LIMIT: number` (20)
  - `makeRunRecord({id, n, at, label, result, scores, pullScore, inputs}) => RunRecord`
  - `pushRun(runs: RunRecord[], record: RunRecord) => RunRecord[]`
  - `ghostRun(runs: RunRecord[], pinnedRunId: string|null) => RunRecord|null`
  - `ghostLabel(run: RunRecord|null, pinnedRunId: string|null) => string|null`
  - `sparklinePath(points: {rpm,hp,torque}[], width: number, height: number) => string`
  - `RunRecord` typedef with fields `id, n, at, label, peakHp, peakTq, knocks, scores:{tuning,engineer,pull}, points:[{rpm,hp,torque}], inputs`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/state/runLog.test.js`:

```js
/**
 * The run log — pure, no DOM.
 *
 * Every test here names the mutation it exists to catch. PR 4a shipped seven suites
 * that each passed against a broken implementation, always in one of five shapes; the
 * two that bite hardest here are "asserts a count but not which end" (a FIFO undo
 * stack passed 871 tests) and "pins one side of a pair". Both are held below by
 * asserting the surviving IDS, not the surviving length.
 */

import { describe, expect, it } from 'vitest';

import { RUN_LIMIT, ghostLabel, ghostRun, makeRunRecord, pushRun, sparklinePath } from '../../../src/ui/state/runLog.js';

/** A minimal sweep result, shaped like `simulateSweep`'s output. */
function fakeResult({ peakHp = 300, peakTq = 280, knocks = 0 } = {}) {
  return {
    peakHp,
    peakTq,
    points: [
      { rpm: 1500, hp: 100, torque: 200, afr: 12.5, timing: 20 },
      { rpm: 1600, hp: 120, torque: 210, afr: 12.4, timing: 21 },
      { rpm: 1700, hp: 140, torque: 220, afr: 12.3, timing: 22 },
    ],
    events: [
      ...Array.from({ length: knocks }, () => ({ type: 'knock', severity: 3 })),
      { type: 'lean', severity: 2 },
    ],
  };
}

/** A run record with a caller-chosen id, so ordering assertions can name it. */
function run(id, over = {}) {
  return makeRunRecord({
    id, n: Number(id), at: 1000 + Number(id), label: 'VQ35DE',
    result: fakeResult(over.result ?? {}),
    scores: { tuning: { score: 80 }, engineer: { score: 70 } },
    pullScore: 640,
    inputs: { build: {}, tune: {}, loadKpa: 100 },
  });
}

describe('makeRunRecord', () => {
  it('keeps only rpm, hp and torque from each point', () => {
    // Mutation caught: storing `result.points` whole. That is 50 fields per point
    // against 3 — a 20x storage cost, which is the reason the record is slim at all.
    const r = run('1');
    expect(r.points).toEqual([
      { rpm: 1500, hp: 100, torque: 200 },
      { rpm: 1600, hp: 120, torque: 210 },
      { rpm: 1700, hp: 140, torque: 220 },
    ]);
  });

  it('counts knock events only, not every event', () => {
    // Mutation caught: `result.events.length`. The fixture always carries one 'lean'
    // event, so a total-count implementation reads 3 where the answer is 2.
    expect(run('1', { result: { knocks: 2 } }).knocks).toBe(2);
  });

  it('reduces each score object to its number', () => {
    // Mutation caught: storing the score OBJECTS, which carry `deductions` arrays and
    // would roughly double the record.
    expect(run('1').scores).toEqual({ tuning: 80, engineer: 70, pull: 640 });
  });
});

describe('pushRun', () => {
  it('puts the newest run at index 0', () => {
    const runs = pushRun(pushRun([], run('1')), run('2'));
    expect(runs.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('evicts the OLDEST run, not the newest, at the cap', () => {
    // Mutation caught: `.slice(-RUN_LIMIT)` or appending instead of prepending —
    // either keeps the wrong end. Asserting `runs.length === RUN_LIMIT` alone would
    // pass under both, which is exactly how a FIFO undo stack survived 871 tests.
    let runs = [];
    for (let i = 1; i <= RUN_LIMIT + 1; i += 1) runs = pushRun(runs, run(String(i)));
    expect(runs).toHaveLength(RUN_LIMIT);
    expect(runs[0].id).toBe(String(RUN_LIMIT + 1));
    expect(runs[runs.length - 1].id).toBe('2');
    expect(runs.some((r) => r.id === '1')).toBe(false);
  });

  it('does not mutate the array it is given', () => {
    const before = [run('1')];
    pushRun(before, run('2'));
    expect(before.map((r) => r.id)).toEqual(['1']);
  });
});

describe('ghostRun', () => {
  const runs = [run('3'), run('2'), run('1')];

  it('returns the pinned run when one is pinned', () => {
    // Half one of the pair.
    expect(ghostRun(runs, '1')?.id).toBe('1');
  });

  it('falls back to the previous run when nothing is pinned', () => {
    // Half two. Index 1, not 0: index 0 is the pull just banked, which IS the current
    // result — a ghost of it would draw the live curve twice.
    expect(ghostRun(runs, null)?.id).toBe('2');
  });

  it('falls back to the previous run when the pinned run has been evicted', () => {
    // Mutation caught: `runs.find(...)` returned straight through, which is
    // `undefined` for an evicted pin and crashes at the first `.points` read.
    expect(ghostRun(runs, 'gone')?.id).toBe('2');
  });

  it('returns null when there is no previous run', () => {
    expect(ghostRun([run('1')], null)).toBe(null);
    expect(ghostRun([], null)).toBe(null);
  });
});

describe('ghostLabel', () => {
  const runs = [run('3'), run('2'), run('1')];

  it('names the run when it is the pinned one', () => {
    expect(ghostLabel(ghostRun(runs, '1'), '1')).toBe('Run 1');
  });

  it('says "Prev" when nothing is pinned', () => {
    // The other half. A label expression that always produced `Run ${n}` would pass a
    // test that only checked the pinned case, and the chart would then claim every
    // default comparison was a deliberate pin.
    expect(ghostLabel(ghostRun(runs, null), null)).toBe('Prev');
  });

  it('says "Prev" when the pin points at an evicted run', () => {
    // The pin is gone, so the ghost is the previous run and must be labelled as one.
    expect(ghostLabel(ghostRun(runs, 'gone'), 'gone')).toBe('Prev');
  });

  it('returns null when there is no ghost to label', () => {
    expect(ghostLabel(null, null)).toBe(null);
  });
});

describe('sparklinePath', () => {
  it('spans the full width and height of the box', () => {
    const path = sparklinePath(
      [{ rpm: 1500, hp: 0, torque: 0 }, { rpm: 1600, hp: 50, torque: 0 }, { rpm: 1700, hp: 100, torque: 0 }],
      100, 20,
    );
    // Lowest hp sits on the bottom edge, highest on the top edge, first x at 0 and
    // last x at the full width.
    expect(path).toBe('M0.00,20.00 L50.00,10.00 L100.00,0.00');
  });

  it('draws a flat line rather than dividing by zero when every point is equal', () => {
    // Mutation caught: `(hp - min) / (max - min)` with no guard is 0/0 = NaN, which
    // renders nothing and logs no error.
    const path = sparklinePath(
      [{ rpm: 1500, hp: 42, torque: 0 }, { rpm: 1600, hp: 42, torque: 0 }],
      100, 20,
    );
    expect(path).not.toMatch(/NaN/);
    expect(path).toBe('M0.00,20.00 L100.00,20.00');
  });

  it('returns an empty string for no points', () => {
    expect(sparklinePath([], 100, 20)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/runLog.test.js
```

Expected: FAIL — `Failed to resolve import "../../../src/ui/state/runLog.js"`.

- [ ] **Step 3: Write the module**

Create `src/ui/state/runLog.js`:

```js
/**
 * The dyno run log: what one banked pull keeps, and the operations over a list of them.
 *
 * WHY A SLIM RECORD
 * A full `simulateSweep` result is 46,459 bytes of JSON — 61 points of 50 fields each.
 * The three things a timeline row and a ghost curve actually need are 2,258 bytes. At
 * twenty runs that is the difference between ~1 MB of localStorage and ~80 KB, so the
 * record stores the projection and not the result.
 *
 * WHY `knocks` IS A STORED COUNT AND NOT A DERIVED ONE
 * The delta panel on DYNO compares knock counts between the current pull and the one
 * before it. A slim record has no `events` array to count, so the count is taken once,
 * at bank time, from the result that still has one.
 *
 * NAMING: this is `runs`, never "history". `state.history` is the undo stack.
 *
 * This module imports nothing from `reducer.js`, the same discipline `history.js`
 * keeps and for the same reason: the reducer imports this.
 */

/**
 * How many runs the log keeps. Twenty at ~4 KB each is ~80 KB, comfortably inside a
 * ~5 MB localStorage budget while leaving room for a career's other state.
 */
export const RUN_LIMIT = 20;

/**
 * @typedef {object} RunPoint
 * @property {number} rpm
 * @property {number} hp
 * @property {number} torque
 */

/**
 * @typedef {object} RunRecord
 * @property {string} id unique and stable for the life of the record. A pin holds an
 *   id rather than an index precisely so that evicting OTHER runs cannot silently
 *   repoint it at a run the player never chose.
 * @property {number} n the career pull ordinal, for display ("Run 12").
 * @property {number} at epoch ms, for the row's relative timestamp.
 * @property {string} label the engine's name at the time of the pull.
 * @property {number} peakHp
 * @property {number} peakTq
 * @property {number} knocks how many `type: 'knock'` events the pull logged.
 * @property {{tuning: number, engineer: number, pull: number}} scores
 * @property {RunPoint[]} points
 * @property {{build: object, tune: object, loadKpa: number}} inputs the measured
 *   configuration, as `measuredInputs` in pullSignature.js projects it.
 */

/**
 * Builds a record from a completed pull.
 *
 * `id`, `n` and `at` are the CALLER's to supply. The reducer that consumes this is
 * documented as calling no `Date.now()` — it must stay a pure function of
 * `(state, action)` — so the clock is read at the dispatch site and travels on the
 * action, the same "caller computes, reducer applies" split `RESET_TO_STOCK`'s `ve`
 * and `BANK_PULL`'s `pullScore` already use.
 *
 * @param {object} args
 * @param {string} args.id
 * @param {number} args.n
 * @param {number} args.at
 * @param {string} args.label
 * @param {{peakHp: number, peakTq: number, points: object[], events: {type?: string}[]}} args.result
 * @param {{tuning: {score: number}, engineer: {score: number}}} args.scores
 * @param {number} args.pullScore
 * @param {{build: object, tune: object, loadKpa: number}} args.inputs
 * @returns {RunRecord}
 */
export function makeRunRecord({ id, n, at, label, result, scores, pullScore, inputs }) {
  return {
    id,
    n,
    at,
    label,
    peakHp: result.peakHp,
    peakTq: result.peakTq,
    knocks: result.events.filter((e) => e.type === 'knock').length,
    scores: { tuning: scores.tuning.score, engineer: scores.engineer.score, pull: pullScore },
    points: result.points.map((p) => ({ rpm: p.rpm, hp: p.hp, torque: p.torque })),
    inputs,
  };
}

/**
 * Adds a run to the front of the log, capped at {@link RUN_LIMIT}.
 *
 * Newest-first, so the run just banked is index 0 and eviction drops the TAIL — the
 * oldest run. Returns a new array; the input is never mutated.
 *
 * @param {RunRecord[]} runs
 * @param {RunRecord} record
 * @returns {RunRecord[]}
 */
export function pushRun(runs, record) {
  return [record, ...runs].slice(0, RUN_LIMIT);
}

/**
 * The run the ghost curve should draw.
 *
 * A pin wins when the run it names is still in the log. When it is not — the pinned
 * run has aged out past {@link RUN_LIMIT} — this falls back to the previous run rather
 * than returning nothing, because a pin quietly expiring should not also take the
 * default comparison with it.
 *
 * `runs[1]`, not `runs[0]`: index 0 is the pull just banked, which is the same pull
 * the chart is drawing live.
 *
 * Pinning `runs[0]` is legitimate and deliberately not special-cased — "make this my
 * benchmark, now go tune" is the main reason to pin at all, and from the next pull
 * onward that run is no longer index 0.
 *
 * @param {RunRecord[]} runs
 * @param {string|null} pinnedRunId
 * @returns {RunRecord|null}
 */
export function ghostRun(runs, pinnedRunId) {
  if (pinnedRunId != null) {
    const pinned = runs.find((r) => r.id === pinnedRunId);
    if (pinned) return pinned;
  }
  return runs[1] ?? null;
}

/**
 * What the chart legend calls the ghost series.
 *
 * This lives here rather than as an expression at the JSX call site so that both of
 * its branches can be watched failing. It has two: a pinned run is named, and anything
 * else is "Prev". The distinction is load-bearing — a chart that labelled the default
 * comparison as a pin would tell the player they had chosen a benchmark they had not.
 *
 * Takes the already-resolved run rather than the list, so it cannot disagree with
 * {@link ghostRun} about which run is being drawn: when the pin names an evicted run,
 * `ghostRun` falls back to the previous run and this labels it "Prev", because that is
 * what it now is.
 *
 * @param {RunRecord|null} run the run {@link ghostRun} resolved
 * @param {string|null} pinnedRunId
 * @returns {string|null} null when there is no ghost to draw
 */
export function ghostLabel(run, pinnedRunId) {
  if (!run) return null;
  return pinnedRunId != null && run.id === pinnedRunId ? `Run ${run.n}` : 'Prev';
}

/**
 * SVG path data for a timeline row's power sparkline, scaled to fill the box.
 *
 * Pure and DOM-free so the geometry is unit-testable. A flat curve has no range to
 * scale against, so the span floors at 1 and the line renders along the bottom edge
 * rather than as `NaN`, which would draw nothing and report nothing.
 *
 * @param {RunPoint[]} points
 * @param {number} width
 * @param {number} height
 * @returns {string} path data, or '' when there is nothing to draw
 */
export function sparklinePath(points, width, height) {
  if (!points || points.length === 0) return '';
  const hps = points.map((p) => p.hp);
  const min = Math.min(...hps);
  const span = Math.max(...hps) - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.hp - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/runLog.test.js
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Prove the eviction and label tests actually hold**

Run each mutation, confirm the named test fails, then revert it before the next:

1. `pushRun` returns `[record, ...runs].slice(-RUN_LIMIT)` → "evicts the OLDEST run" FAILS.
2. `ghostLabel` returns `` `Run ${run.n}` `` unconditionally → "says \"Prev\" when nothing is pinned" FAILS.
3. `ghostRun` returns `runs[0] ?? null` instead of `runs[1] ?? null` → "falls back to the previous run when nothing is pinned" FAILS.

This is not optional. Seven of PR 4a's task suites passed against a broken implementation; a test that cannot be watched failing is not evidence.

- [ ] **Step 6: Run the full gate**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/ui/state/runLog.js tests/ui/state/runLog.test.js
git commit -m "Add the run log's record shape and its pure operations"
```

---

## Task 2: `diffMeasuredInputs` — widen `pullSignature.js`'s charter

**Files:**
- Modify: `src/ui/state/pullSignature.js`
- Test: `tests/ui/state/pullSignature.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `measuredInputs(build, tune, loadKpa) => {build: object, tune: object, loadKpa: number}`
  - `diffMeasuredInputs(a, b) => string[]` — display labels for every differing input, `[]` when identical.
  - `pullSignature` is unchanged in behaviour and signature.

**Context the brief cannot know:** this file's header currently states, at length, that it answers "has any measured input moved?" and **never** "which one", and gives a reason — a hand-written field-by-field comparison drifts out of sync with the signature. This task deliberately widens that charter. The header must be rewritten to say so. Do not bolt the new function on under a header that still claims the old contract. The key arrays stay **private**: exporting them would let a test derive its expectations from the thing under test, which is the trap `history.js` documents avoiding.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/state/pullSignature.test.js`:

```js
describe('measuredInputs', () => {
  it('keeps the measured build fields and drops the label-only ones', () => {
    const s = makeInitialState();
    const projected = measuredInputs(
      { ...s.build, presetId: 'n54', presetPrompt: { open: true }, boostSel: 2 },
      s.tune,
      100,
    );
    expect(projected.build).toHaveProperty('engineConfig');
    expect(projected.build).toHaveProperty('boostCurve');
    // Mutation caught: projecting the whole slice. presetId/presetPrompt/boostSel
    // reach no simulation, and storing them would make two runs on the same car
    // diff as different because a dialog was open during one of them.
    expect(projected.build).not.toHaveProperty('presetId');
    expect(projected.build).not.toHaveProperty('presetPrompt');
    expect(projected.build).not.toHaveProperty('boostSel');
  });

  it('keeps the three tables and drops the tune slice cursors', () => {
    const s = makeInitialState();
    const projected = measuredInputs(s.build, { ...s.tune, selection: { r: 1, c: 1 }, tablesDirty: true }, 100);
    expect(Object.keys(projected.tune).sort()).toEqual(['afr', 'timing', 've']);
  });

  it('carries loadKpa', () => {
    const s = makeInitialState();
    expect(measuredInputs(s.build, s.tune, 140).loadKpa).toBe(140);
  });
});

describe('diffMeasuredInputs', () => {
  /** @returns {ReturnType<typeof measuredInputs>} */
  const project = (patch = {}) => {
    const s = makeInitialState();
    return measuredInputs(
      { ...s.build, ...(patch.build ?? {}) },
      { ...s.tune, ...(patch.tune ?? {}) },
      patch.loadKpa ?? 100,
    );
  };

  it('reports nothing for two identical configurations', () => {
    // Mutation caught: returning every label unconditionally.
    expect(diffMeasuredInputs(project(), project())).toEqual([]);
  });

  it('names the one field that moved and nothing else', () => {
    // Both halves in one assertion: 'boost curve' present AND every other label
    // absent. Asserting only `toContain('boost curve')` would pass against an
    // implementation that returns all sixteen labels every time.
    expect(diffMeasuredInputs(project(), project({ build: { boostCurve: [1, 2, 3, 4, 5, 6, 7, 8] } })))
      .toEqual(['boost curve']);
  });

  it('sees a change inside a calibration table', () => {
    // Mutation caught: comparing tables by reference (`a !== b`) reports a change on
    // every call because clone2D makes a fresh array; comparing with `===` on the
    // outer array misses a changed CELL entirely. Only a value compare gets both.
    const s = makeInitialState();
    const edited = clone2D(s.tune.ve);
    edited[0][0] += 5;
    expect(diffMeasuredInputs(project(), project({ tune: { ve: edited } }))).toEqual(['VE table']);
  });

  it('reports a table as unchanged when an equal copy is passed', () => {
    // The other half of the reference-compare pair.
    const s = makeInitialState();
    expect(diffMeasuredInputs(project(), project({ tune: { ve: clone2D(s.tune.ve) } }))).toEqual([]);
  });

  it('names several fields when several moved', () => {
    expect(diffMeasuredInputs(project(), project({ build: { turboOn: true, octaneIdx: 3 }, loadKpa: 140 })))
      .toEqual(['turbo', 'fuel', 'dyno load']);
  });

  it('reports the same fields the signature reports as a change', () => {
    // The two functions must never disagree about WHETHER anything moved. This is the
    // property that justifies them living in one file over one private key list.
    const s = makeInitialState();
    const other = { ...s.build, mafScalar: 1.15 };
    expect(pullSignature(s.build, s.tune, 100)).not.toBe(pullSignature(other, s.tune, 100));
    expect(diffMeasuredInputs(measuredInputs(s.build, s.tune, 100), measuredInputs(other, s.tune, 100)))
      .not.toEqual([]);
  });
});
```

Update the import at the top of the file:

```js
import { diffMeasuredInputs, measuredInputs, pullSignature } from '../../../src/ui/state/pullSignature.js';
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/pullSignature.test.js
```

Expected: FAIL — `measuredInputs is not a function`.

- [ ] **Step 3: Rewrite the file header**

Replace the first paragraph of `src/ui/state/pullSignature.js`'s header (the block starting `The identity of the configuration a dyno pull was measured on.`) with:

```js
/**
 * The identity of a dyno pull's configuration, and the difference between two of them.
 *
 * A score is a MEASUREMENT. It is taken once, on one specific car, and it stays what
 * it was — so the app banks the scores a pull produced (see BANK_PULL) instead of
 * recomputing them from whatever is selected later. That leaves one question the
 * banked numbers cannot answer by themselves: is the car on screen still the car they
 * were measured on? {@link pullSignature} answers exactly that.
 *
 * WHY THIS FILE NOW ANSWERS "WHICH ONE" TOO
 * This header used to state that the module answers "has any measured input moved?"
 * and never "which one", on the grounds that a hand-written field-by-field comparison
 * would drift out of sync with the signature as fields were added. That reasoning was
 * right about the hazard and wrong about the conclusion. The run-history timeline needs
 * "which one" — it reports what changed between one pull and the one before it — and
 * the drift is avoided by keeping BOTH answers here, over ONE private key list, rather
 * than by refusing to answer. Add a field to MEASURED_BUILD_KEYS and it is signed and
 * diffed in the same edit. The alternative that was rejected — exporting the key arrays
 * so another module could diff — would have let a test derive its expectations from the
 * thing under test, which is the trap `history.js` keeps its own key lists private to
 * avoid.
 */
```

Keep the rest of the existing header (WHAT COUNTS AS "THE SAME CAR", WHAT DOES NOT COUNT, WHY A SIGNATURE AND NOT A DEEP COMPARE, THE ERROR IT IS ALLOWED TO MAKE, and the `history.js` cross-reference) exactly as it is. Those paragraphs are all still true.

- [ ] **Step 4: Add the label table and the two functions**

Add below `MEASURED_TUNE_KEYS`:

```js
/**
 * Display names for every measured input, for the run-history timeline's "what
 * changed" line. A key with no label throws rather than rendering a blank row — the
 * same call `labelFor` makes in reducer.js, and for the same reason: a silently
 * missing label is a field the player is never told about.
 */
const INPUT_LABELS = {
  engineConfig: 'engine',
  mods: 'bolt-ons',
  turboOn: 'turbo',
  boostCurve: 'boost curve',
  octaneIdx: 'fuel',
  injIdx: 'injectors',
  mafScalar: 'MAF scaling',
  turbineIdx: 'turbine',
  turbineCount: 'turbine count',
  compressorIdx: 'compressor',
  exhaustDiaIdx: 'exhaust',
  ecuInjectorCc: 'ECU injector size',
  ve: 'VE table',
  timing: 'timing table',
  afr: 'AFR table',
  loadKpa: 'dyno load',
};
```

Add at the end of the file:

```js
/**
 * Projects a configuration down to exactly the inputs a pull is a function of.
 *
 * This is the form a {@link import('./runLog.js').RunRecord} stores, so that two runs
 * can be compared later without keeping the whole build and tune slices — and without
 * a second list of "what matters" that could disagree with this one.
 *
 * @param {import('./initialState.js').BuildState} build
 * @param {import('./initialState.js').TuneState} tune
 * @param {number} loadKpa
 * @returns {{build: object, tune: object, loadKpa: number}}
 */
export function measuredInputs(build, tune, loadKpa) {
  /** @type {Record<string, *>} */
  const b = {};
  for (const k of MEASURED_BUILD_KEYS) b[k] = /** @type {any} */ (build)[k];
  /** @type {Record<string, *>} */
  const t = {};
  for (const k of MEASURED_TUNE_KEYS) t[k] = /** @type {any} */ (tune)[k];
  return { build: b, tune: t, loadKpa };
}

/**
 * Names every measured input that differs between two projections.
 *
 * Values are compared by their JSON, not by reference: the calibration tables are
 * cloned on almost every write, so a reference compare would report all three as
 * changed on every pull, and an `===` on the outer array would miss a changed cell
 * entirely. This inherits {@link pullSignature}'s documented and acceptable error in
 * the same direction — two equal objects whose keys were inserted in different orders
 * compare as different — and, like the signature, it can never report a real change as
 * no change.
 *
 * @param {ReturnType<typeof measuredInputs>} a
 * @param {ReturnType<typeof measuredInputs>} b
 * @returns {string[]} display labels, empty when every measured input is equal
 */
export function diffMeasuredInputs(a, b) {
  const changed = [];
  for (const k of MEASURED_BUILD_KEYS) {
    if (JSON.stringify(a.build?.[k]) !== JSON.stringify(b.build?.[k])) changed.push(k);
  }
  for (const k of MEASURED_TUNE_KEYS) {
    if (JSON.stringify(a.tune?.[k]) !== JSON.stringify(b.tune?.[k])) changed.push(k);
  }
  if (a.loadKpa !== b.loadKpa) changed.push('loadKpa');
  return changed.map((k) => {
    const label = INPUT_LABELS[k];
    if (!label) throw new Error(`diffMeasuredInputs: no label defined for measured input "${k}"`);
    return label;
  });
}
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/pullSignature.test.js
```

Expected: PASS.

- [ ] **Step 6: Prove the both-sides test holds**

Temporarily make `diffMeasuredInputs` return every label unconditionally:

```js
return Object.values(INPUT_LABELS);
```

Re-run. Expected: "reports nothing for two identical configurations" and "names the one field that moved and nothing else" both FAIL. Revert.

Then temporarily change the tune comparison to a reference compare (`a.tune?.[k] !== b.tune?.[k]`) and re-run. Expected: "reports a table as unchanged when an equal copy is passed" FAILS. Revert.

- [ ] **Step 7: Full gate and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run build
git add src/ui/state/pullSignature.js tests/ui/state/pullSignature.test.js
git commit -m "Teach pullSignature which input moved, not just that one did"
```

---

## Task 3: Store the runs — SESSION slice, `BANK_PULL`, pinning

**Files:**
- Modify: `src/ui/state/initialState.js`, `src/ui/state/reducer.js`
- Test: `tests/ui/state/reducer.test.js`

**Interfaces:**
- Consumes: `pushRun`, `RunRecord` from `src/ui/state/runLog.js` (Task 1).
- Produces:
  - `session.runs: RunRecord[]`, `session.pinnedRunId: string|null`
  - `BANK_PULL` gains a required `run: RunRecord` field
  - `ACTIONS.PIN_RUN` (`{type, id}`) and `ACTIONS.UNPIN_RUN` (`{type}`)

**This task is additive.** `prevResult` stays exactly as it is; Task 4 removes it. Keeping the two apart is deliberate: "does the store record runs correctly" and "do the readers correctly switch over" are separately rejectable, and splitting them keeps Task 4's diff purely the migration.

**A trap this codebase has already fallen into once:** `KnownStoreAction` is a union with no catch-all member, and its doc comment says "the seventeen specific typedefs above". In PR 4a the union was missed when two actions were added, and `tsc` only surfaced it much later, at the first typed dispatch site. Add both typedefs, add both to the union, **and** update that sentence to "nineteen".

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/state/reducer.test.js`:

```js
describe('run log', () => {
  /** @returns {import('../../../src/ui/state/runLog.js').RunRecord} */
  const rec = (id) => ({
    id, n: Number(id), at: 1000 + Number(id), label: 'VQ35DE',
    peakHp: 300, peakTq: 280, knocks: 0,
    scores: { tuning: 80, engineer: 70, pull: 640 },
    points: [{ rpm: 1500, hp: 100, torque: 200 }],
    inputs: { build: {}, tune: {}, loadKpa: 100 },
  });

  /** BANK_PULL's minimum viable payload. */
  const bank = (id) => ({
    type: ACTIONS.BANK_PULL,
    run: rec(id),
    result: { peakHp: 300, peakTq: 280, points: [], events: [], wear: { piston: 1, bearing: 1, valve: 1 } },
    pullScore: 640,
    scores: { tuning: { score: 80 }, engineer: { score: 70 }, signature: 'sig' },
  });

  it('records the banked run at the front of the log', () => {
    const s = reducer(reducer(makeInitialState(), bank('1')), bank('2'));
    expect(s.session.runs.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('starts with an empty log and no pin', () => {
    const s = makeInitialState();
    expect(s.session.runs).toEqual([]);
    expect(s.session.pinnedRunId).toBe(null);
  });

  it('pins and unpins a run', () => {
    const pinned = reducer(makeInitialState(), { type: ACTIONS.PIN_RUN, id: '7' });
    expect(pinned.session.pinnedRunId).toBe('7');
    expect(reducer(pinned, { type: ACTIONS.UNPIN_RUN }).session.pinnedRunId).toBe(null);
  });

  it('leaves the run log and the pin standing when a preset is loaded', () => {
    // BOTH halves of the pair. Asserting only that the scorecard clears would pass
    // against an APPLY_PRESET that also wipes twenty runs of persisted history —
    // which undo does not cover and the player cannot get back.
    const withRun = reducer(reducer(makeInitialState(), bank('1')), { type: ACTIONS.PIN_RUN, id: '1' });
    const after = reducer(withRun, { type: ACTIONS.APPLY_PRESET, preset: PRESET_PATCH });
    expect(after.session.result).toBe(null);
    expect(after.session.pullScores).toBe(null);
    expect(after.session.runs.map((r) => r.id)).toEqual(['1']);
    expect(after.session.pinnedRunId).toBe('1');
  });

  it('leaves the whole session slice alone on RESET_TO_STOCK', () => {
    // Pins today's behaviour so the natural-but-wrong pairing with APPLY_PRESET
    // cannot be introduced by someone "making them consistent". RESET_TO_STOCK has
    // never touched session, including result and pullScores.
    const withRun = reducer(makeInitialState(), bank('1'));
    const after = reducer(withRun, { type: ACTIONS.RESET_TO_STOCK, ve: withRun.tune.ve });
    expect(after.session).toBe(withRun.session);
  });
});
```

`PRESET_PATCH` already exists in this file if a preset test is present; if not, add it above the `describe`:

```js
/** A minimal APPLY_PRESET payload — every field the case reads. */
const PRESET_PATCH = {
  presetId: 'test', engineConfig: makeInitialState().build.engineConfig,
  mods: makeInitialState().build.mods, turboOn: false, boostCurve: [0, 0, 0, 0, 0, 0, 0, 0],
  turbineIdx: 1, turbineCount: 1, compressorIdx: 1, injIdx: 0, ecuInjectorCc: 315,
  octaneIdx: 0, exhaustDiaIdx: 0,
  ve: makeInitialState().tune.ve, timing: makeInitialState().tune.timing, afr: makeInitialState().tune.afr,
};
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/reducer.test.js
```

Expected: FAIL — `runs` is `undefined`, and `PIN_RUN` is not a known action.

- [ ] **Step 3: Add the state**

In `src/ui/state/initialState.js`, add to the `SessionState` typedef, immediately after the `prevResult` line:

```js
 * @property {import('./runLog.js').RunRecord[]} runs the last RUN_LIMIT dyno pulls,
 *   newest first. Named `runs` and not "history" because `state.history` is the undo
 *   stack — see HistoryState below.
 * @property {string|null} pinnedRunId the run the ghost curve compares against, or
 *   null to compare against the previous run
```

And in `makeInitialState`'s `session` object, immediately after `prevResult: null,`:

```js
      runs: [],
      pinnedRunId: null,
```

- [ ] **Step 4: Add the actions**

In `src/ui/state/reducer.js`, add to `ACTIONS` after `BANK_PULL`:

```js
  PIN_RUN: 'PIN_RUN',
  UNPIN_RUN: 'UNPIN_RUN',
```

Add the import at the top, beside the existing `history.js` import:

```js
import { pushRun } from './runLog.js';
```

Add these two typedefs immediately before `LiveStepAction`'s:

```js
/**
 * Pins one banked run as the ghost curve's comparison. Holds the run's `id` rather
 * than its index: eviction shifts every index, so an index-based pin would silently
 * repoint at a run the player never chose.
 * @typedef {{type: 'PIN_RUN', id: string}} PinRunAction
 */

/**
 * Drops the pin, returning the ghost to the previous run. No payload — there is only
 * ever one pin.
 * @typedef {{type: 'UNPIN_RUN'}} UnpinRunAction
 */
```

Add both to the `KnownStoreAction` union, and change `the seventeen specific typedefs above` to `the nineteen specific typedefs above`:

```js
 * @typedef {SetBuildFieldAction | ClearPresetIdAction | SetTurbineAction | SetTableAction |
 *   SetSessionFieldAction | SetTuneFieldAction | SetBoostSelAction |
 *   SetPresetPromptAction | SetEngineConfigPatchAction | ApplyPresetAction |
 *   ResetToStockAction | RepairEngineAction | BankPullAction | PinRunAction |
 *   UnpinRunAction | LiveStepAction | LivePatchAction | UndoAction | RedoAction
 * } KnownStoreAction
 */
```

Extend `BankPullAction`'s typedef payload:

```js
 * @typedef {{type: 'BANK_PULL', result: object, pullScore: number, run: import('./runLog.js').RunRecord,
 *   scores: {tuning: object, engineer: object, signature: string}}} BankPullAction
```

- [ ] **Step 5: Write the cases**

In `BANK_PULL`'s returned `session` object, add immediately after the `prevResult` line:

```js
          // The record is built by the caller, not here: it needs `Date.now()` for its
          // id and timestamp, and this reducer is documented as calling no clock.
          runs: pushRun(state.session.runs, action.run),
```

Add the two new cases immediately after `BANK_PULL`:

```js
    case ACTIONS.PIN_RUN:
      return { ...state, session: { ...state.session, pinnedRunId: action.id } };

    case ACTIONS.UNPIN_RUN:
      return { ...state, session: { ...state.session, pinnedRunId: null } };
```

`APPLY_PRESET` needs no change to keep `runs` and `pinnedRunId` — its `...state.session` spread already carries them. The test in Step 1 is what pins that, so a future edit cannot quietly add them to the clear list.

- [ ] **Step 6: Run the tests and watch them pass**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/reducer.test.js
```

Expected: PASS.

- [ ] **Step 7: Prove the APPLY_PRESET test holds**

Temporarily add `runs: [], pinnedRunId: null,` to `APPLY_PRESET`'s session clear and re-run. Expected: "leaves the run log and the pin standing when a preset is loaded" FAILS. Revert.

- [ ] **Step 8: Full gate and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run build
git add src/ui/state/initialState.js src/ui/state/reducer.js tests/ui/state/reducer.test.js
git commit -m "Record every banked pull in the session's run log, and let one be pinned"
```

---

## Task 4: Migrate the ghost's readers and delete `prevResult`

**Files:**
- Modify: `src/ui/EcuLab.jsx`, `src/ui/screens/dyno/ResultScreen.jsx`, `src/ui/state/initialState.js`, `src/ui/state/reducer.js`
- Test: `tests/ui/dyno-screens.test.jsx`

**Interfaces:**
- Consumes: `ghostRun`, `ghostLabel`, `makeRunRecord` from `runLog.js`; `measuredInputs` from `pullSignature.js`; `session.runs`/`session.pinnedRunId` from Task 3.
- Produces: `ResultScreen` takes a new prop `ghostLabel: string|null` and no longer reads the store. `session.prevResult` no longer exists.

**Every reader of `prevResult`, so none is missed:**

| Site | Change |
|---|---|
| `EcuLab.jsx:220` | destructuring — swap `prevResult` for `runs, pinnedRunId` |
| `EcuLab.jsx:700` | `chartData`'s ghost columns — join by RPM through a Map |
| `EcuLab.jsx:994-998` | the delta panel — read `runs[1]`, use its stored `knocks` |
| `ResultScreen.jsx:37, 55-56` | takes `ghostLabel`; drops `useSession` |
| `initialState.js:96, 181` | typedef line and initial value |
| `reducer.js` `APPLY_PRESET` | drop the `prevResult: null` line |
| `reducer.js` `BANK_PULL` | drop the `prevResult: state.session.result` line and its comment |

`tsc --noEmit` is the backstop: `EcuLab.jsx` no longer carries `@ts-nocheck` (see its header, line 18), so a missed reader of a removed typedef field is a typecheck failure, not a runtime surprise.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/dyno-screens.test.jsx`:

This file already has the harness: `mount(node)` renders a screen inside a real
`StoreProvider`, and `mountWithResult(node, sessionFields)` seeds session state first.
Use them. Do **not** add a second harness, and do **not** write one whose "before"
value is read after the action — two of this project's ten unfailable assertions were
introduced exactly that way, in briefs written for PR 4a.

The ghost's *source* (pinned vs previous) and its *label* are both pure and already
unit-tested in Task 1 via `ghostRun` and `ghostLabel`. What is untested until now is
whether `ResultScreen` actually draws the ghost series, so that is what these tests
hold — both halves of the present/absent pair:

```js
describe('ResultScreen ghost curve', () => {
  const CHART = [{ rpm: 1500, hp: 111, torque: 222, prevHp: 100, prevTorque: 200 }];

  it('draws both ghost series, named for the comparison, when there is one', () => {
    mount(<ResultScreen chartData={CHART} engineDerived={{ redline: 7000 }} ghostLabel="Run 4" />);
    expect(screen.getByText('Run 4 WHP')).toBeTruthy();
    expect(screen.getByText('Run 4 TQ')).toBeTruthy();
  });

  it('draws no ghost series at all when there is no comparison', () => {
    // The other half. Rendering the lines unconditionally would still look right on
    // the first pull — recharts just draws nothing for an all-undefined dataKey — so
    // the legend is what makes the difference observable.
    mount(<ResultScreen chartData={[{ rpm: 1500, hp: 111, torque: 222 }]} engineDerived={{ redline: 7000 }} ghostLabel={null} />);
    expect(screen.queryByText(/WHP$/)).toBeTruthy();
    expect(screen.queryByText(/ WHP$/)).toBe(null);
    expect(screen.queryByText(/ TQ$/)).toBe(null);
  });
});
```

Note the two existing `ResultScreen` tests in this file call `mount(<ResultScreen
chartData={[]} engineDerived={...} />)` with no `ghostLabel`. Leave them as they are —
an omitted prop is `undefined`, which is falsy, so they keep passing and incidentally
pin that a missing ghost is the safe default.

- [ ] **Step 2: Run it and watch it fail**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx
```

Expected: FAIL — `ResultScreen` does not accept a `ghostLabel` prop yet, so the legend
never names a comparison.

- [ ] **Step 3: Build the run record at the dispatch site**

In `src/ui/EcuLab.jsx`, add the imports:

```js
import { ghostLabel, ghostRun, makeRunRecord } from './state/runLog.js';
import { measuredInputs, pullSignature } from './state/pullSignature.js';
```

(`pullSignature` is already imported — extend that line rather than adding a second import from the same module.)

In `doRun`, replace the `dispatch({ type: ACTIONS.BANK_PULL, ... })` call with:

```js
    const nextPulls = pullCount + 1;
    const at = Date.now();
    dispatch({
      type: ACTIONS.BANK_PULL, result: r, pullScore: pull,
      scores: { tuning: ts, engineer: es, signature: buildSignature },
      // `id` pairs the clock with the career ordinal so two records can never collide,
      // and `at`/`id` are read HERE because the reducer must call no clock of its own.
      run: makeRunRecord({
        id: `${at}-${nextPulls}`, n: nextPulls, at,
        // `engineDerived` carries no name — it is displacement, cylinder count and
        // redline. The build's name is the loaded preset's, and a build with no preset
        // is exactly what "Custom build" means everywhere else in this app.
        label: presetById(presetId)?.name ?? 'Custom build',
        result: r, scores: { tuning: ts, engineer: es }, pullScore: pull,
        inputs: measuredInputs(build, tune, loadKpa),
      }),
    });
```

`presetById` is already imported in this file (`EcuLab.jsx:36`) and `presetId` is
already destructured from the build slice — neither needs adding. `presetById` is
`ENGINE_PRESETS.find((p) => p.id === id)` (`src/sim/presets.js:552`), so a `null` id
returns `undefined` rather than throwing; no guard is needed and the `?.` above is
belt-and-braces, not a requirement.

- [ ] **Step 4: Join the ghost by RPM**

Replace `chartData` (`EcuLab.jsx:699-702`) with:

```js
  const ghost = ghostRun(runs, pinnedRunId);

  const chartData = useMemo(() => {
    if (!result) return [];
    // Keyed by RPM, not by array position. Today the two are the same thing —
    // SWEEP_START_RPM and SWEEP_STEP_RPM are constants, so points[i].rpm is always
    // 1500 + 100i — but a PINNED run may be any length, and the join should state
    // what it means rather than lean on an invariant two modules away.
    const ghostByRpm = new Map((ghost?.points ?? []).map((p) => [p.rpm, p]));
    return result.points.slice(0, running ? revealCount : result.points.length).map((p) => {
      const g = ghostByRpm.get(p.rpm);
      return {
        rpm: p.rpm, hp: p.hp, torque: p.torque, afr: p.afr, afrCommanded: p.afrCommanded,
        timing: p.timing, commandedTiming: p.commandedTiming, duty: p.duty, trimPct: p.trimPct,
        prevHp: g?.hp, prevTorque: g?.torque,
      };
    });
  }, [result, ghost, running, revealCount]);
```

Update the destructure at `EcuLab.jsx:220`: remove `prevResult`, add `runs, pinnedRunId`.

- [ ] **Step 5: Migrate the delta panel**

Replace the `{prevResult && !running && (() => {` block's opening lines so it reads from the log:

```js
                {runs[1] && !running && (() => {
                  const prev = runs[1];
                  const dHp = result.peakHp - prev.peakHp;
                  const dTq = result.peakTq - prev.peakTq;
                  const knockNow = result.events.filter((e) => e.type === 'knock').length;
                  const dKnock = knockNow - prev.knocks;
```

Delete the now-unused `knockPrev` line. The rest of the block is unchanged.

- [ ] **Step 6: Pass the ghost label to `ResultScreen`**

In `EcuLab.jsx`, at the `ResultScreen` call site:

```js
                  <ResultScreen
                    chartData={chartData}
                    engineDerived={engineDerived}
                    ghostLabel={ghostLabel(ghost, pinnedRunId)}
                  />
```

The label is `ghostLabel` from `runLog.js`, not an expression written inline here. Both
of its branches are watched failing in Task 1; an inline ternary would be the one piece
of this feature's logic that no test could reach.

In `src/ui/screens/dyno/ResultScreen.jsx`: delete the `useSession` import and the two lines that read `prevResult`, add `ghostLabel` to the props and its JSDoc, and replace the two ghost `<Line>` elements:

```jsx
            {ghostLabel && <Line dataKey="prevHp" name={`${ghostLabel} WHP`} stroke={T.acc} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.5} dot={false} isAnimationActive={false} />}
            {ghostLabel && <Line dataKey="prevTorque" name={`${ghostLabel} TQ`} stroke={T.cyan} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.5} dot={false} isAnimationActive={false} />}
```

Add to the file header, replacing nothing:

```
 * The ghost lines take each live series' own colour at half opacity rather than a
 * neutral grey. `T.ink3` — what they used to use — is also the axis, tick-label and
 * `afrCommanded` colour, so the previous pull was not too dim to see so much as
 * indistinguishable from the chart's furniture. Hue now carries series identity and
 * opacity carries time.
```

- [ ] **Step 7: Delete `prevResult`**

- `initialState.js`: delete the `@property {object|null} prevResult` line and the `prevResult: null,` line.
- `reducer.js` `APPLY_PRESET`: delete `prevResult: null,`.
- `reducer.js` `BANK_PULL`: delete `prevResult: state.session.result,` and the two-line comment above it that explains the rotation ordering. Replace that comment with one on the `runs:` line:

```js
          // The banked run goes in front, so runs[0] is always the pull `result` now
          // holds and runs[1] is the one before it — the ordering the old
          // prevResult-before-result rotation existed to get right.
```

- [ ] **Step 8: Run the tests and the gate**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all green. If `tsc` names a `prevResult` reader not in the table above, that is a genuine find — fix it and add the site to the table.

- [ ] **Step 9: Prove the ghost test holds**

Temporarily render the two ghost `<Line>` elements unconditionally (drop the
`ghostLabel &&` guard, hardcoding the names to `Prev WHP`/`Prev TQ`). Re-run
`dyno-screens.test.jsx`. Expected: "draws no ghost series at all when there is no
comparison" FAILS. Revert.

- [ ] **Step 10: Commit**

```bash
git add src/ui/EcuLab.jsx src/ui/screens/dyno/ResultScreen.jsx src/ui/state/initialState.js src/ui/state/reducer.js tests/ui/dyno-screens.test.jsx
git commit -m "Draw the ghost from the run log, and retire prevResult"
```

---

## Task 5: Persist the run log

**Files:**
- Modify: `src/storage.js`, `src/ui/EcuLab.jsx`
- Test: `tests/storage.test.js`, `tests/ui/session-store.test.jsx`

**Interfaces:**
- Consumes: `RUN_LIMIT` from `runLog.js`; `session.runs`/`session.pinnedRunId`.
- Produces: `loadCareer()` resolves `{best, total, pulls, runs, pinnedRunId}`; `saveCareer` accepts the same shape.

**Two things this task must get right:**

1. **A legacy save has no `runs` key** and must load as `[]` / `null`, not `undefined` and not a throw. The existing per-field coercion (`Number(parsed.best) || 0`) is the pattern.
2. **The persistence effect must not fire before the load completes.** `loadCareer` is async and dispatches its three values; an effect that saves on mount would write zeroes and an empty log over a real save before those dispatches land. A ref guard set after the load is what prevents it.

`storage.js` stays UI-agnostic — it validates the shape (`Array.isArray`) but does not import `RUN_LIMIT`. The cap is applied by `pushRun` on write and by the load effect in `EcuLab.jsx` on read, where `RUN_LIMIT` is already in scope.

- [ ] **Step 1: Write the failing storage tests**

Append to `tests/storage.test.js`:

```js
describe('run log persistence', () => {
  it('returns an empty log when nothing has been saved', async () => {
    expect(await loadCareer()).toEqual({ best: 0, total: 0, pulls: 0, runs: [], pinnedRunId: null });
  });

  it('round-trips runs and the pin', async () => {
    const runs = [{ id: '2', n: 2, at: 2, label: 'VQ', peakHp: 300, peakTq: 280, knocks: 0, scores: { tuning: 1, engineer: 2, pull: 3 }, points: [], inputs: {} }];
    await saveCareer({ best: 1, total: 2, pulls: 3, runs, pinnedRunId: '2' });
    const loaded = await loadCareer();
    expect(loaded.runs).toEqual(runs);
    expect(loaded.pinnedRunId).toBe('2');
  });

  it('loads a save written before run history existed', async () => {
    // The blob every existing player has. It must open, not throw and not yield
    // `undefined` for a field the UI will immediately call .find() on.
    await saveCareer({ best: 812, total: 4310, pulls: 27 });
    const loaded = await loadCareer();
    expect(loaded.best).toBe(812);
    expect(loaded.runs).toEqual([]);
    expect(loaded.pinnedRunId).toBe(null);
  });

  it('rejects a non-array runs value rather than trusting it', async () => {
    await saveCareer({ best: 1, total: 1, pulls: 1, runs: /** @type {any} */ ('not an array') });
    expect((await loadCareer()).runs).toEqual([]);
  });

  it('rejects a non-string pin rather than trusting it', async () => {
    await saveCareer({ best: 1, total: 1, pulls: 1, pinnedRunId: /** @type {any} */ (17) });
    expect((await loadCareer()).pinnedRunId).toBe(null);
  });
});
```

The four existing `toEqual({ best, total, pulls })` assertions in this file will now fail, because the returned object has two more keys. Update each to include `runs: []` and `pinnedRunId: null` — do **not** loosen them to `toMatchObject`, which would stop them holding the shape at all.

- [ ] **Step 2: Run and watch them fail**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/storage.test.js
```

Expected: FAIL — `runs` is `undefined`.

- [ ] **Step 3: Extend `storage.js`**

Update the `Career` typedef:

```js
/**
 * @typedef {object} Career
 * @property {number} best highest single Pull Score
 * @property {number} total sum of every Pull Score
 * @property {number} pulls how many pulls have been logged
 * @property {import('./ui/state/runLog.js').RunRecord[]} runs the banked run log,
 *   newest first. Validated as an array here and capped by its writer — this adapter
 *   deliberately knows nothing about RUN_LIMIT, which is a UI-layer policy.
 * @property {string|null} pinnedRunId the run pinned as the ghost comparison
 */

/** @type {Career} */
const EMPTY_CAREER = { best: 0, total: 0, pulls: 0, runs: [], pinnedRunId: null };
```

In `loadCareer`, replace the returned object:

```js
    return {
      best: Number(parsed.best) || 0,
      total: Number(parsed.total) || 0,
      pulls: Number(parsed.pulls) || 0,
      // A save written before run history existed has neither key. Both coerce to the
      // empty case rather than to `undefined`, which the UI would call .find() on.
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      pinnedRunId: typeof parsed.pinnedRunId === 'string' ? parsed.pinnedRunId : null,
    };
```

In `saveCareer`, replace the serialised object:

```js
  const raw = JSON.stringify({
    best: career.best ?? 0,
    total: career.total ?? 0,
    pulls: career.pulls ?? 0,
    runs: Array.isArray(career.runs) ? career.runs : [],
    pinnedRunId: typeof career.pinnedRunId === 'string' ? career.pinnedRunId : null,
  });
```

- [ ] **Step 4: Write the failing mount-guard test**

Append to `tests/ui/session-store.test.jsx`:

```js
it('does not overwrite a saved career before the load completes', async () => {
  // The hazard: loadCareer is async, so there is a window between first paint and
  // its dispatches landing. A persistence effect with no guard runs during that
  // window and writes zeroes over a real save — silently, and on every cold start.
  await saveCareer({ best: 900, total: 5000, pulls: 30, runs: [], pinnedRunId: null });
  const spy = vi.spyOn(storage, 'saveCareer');
  renderApp();
  // Whatever it writes, it must never be the empty career.
  for (const call of spy.mock.calls) {
    expect(call[0]).not.toMatchObject({ best: 0, total: 0, pulls: 0 });
  }
});
```

Use whatever mount helper this file already defines; do not add a second one.

- [ ] **Step 5: Replace the imperative save with a guarded effect**

In `src/ui/EcuLab.jsx`:

Delete the `persistCareer` helper and its call in `doRun`, along with the three locals that existed only to feed it (`nextBest`, `nextTotal`, `nextPulls`) — **except** `nextPulls`, which Task 4's run record still uses. Keep that one, and delete the comment above them that explains why they were computed twice; it no longer applies.

Add a ref beside the other refs:

```js
  // Guards the persistence effect below: nothing may be written until the saved career
  // has actually been read back, or a cold start overwrites it with zeroes.
  const careerLoaded = useRef(false);
```

In the existing load effect, set the flag after the three dispatches:

```js
      dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'pullCount', value: c.pulls });
      dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'runs', value: c.runs.slice(0, RUN_LIMIT) });
      dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'pinnedRunId', value: c.pinnedRunId });
      careerLoaded.current = true;
```

Add `RUN_LIMIT` to the `runLog.js` import.

Add the persistence effect directly below the load effect:

```js
  // Career state is written back whenever it moves. This replaces a save call inside
  // `doRun`, which could not cover the pin: pinning is a dispatch like any other and
  // has no natural "and now save" call site. An effect over the persisted fields does.
  useEffect(() => {
    if (!careerLoaded.current) return;
    saveCareer({ best: bestScore, total: totalScore, pulls: pullCount, runs, pinnedRunId });
  }, [bestScore, totalScore, pullCount, runs, pinnedRunId]);
```

- [ ] **Step 6: Run the tests and the gate**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/storage.test.js tests/ui/session-store.test.jsx
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all green.

- [ ] **Step 7: Prove the guard test holds**

Temporarily delete the `if (!careerLoaded.current) return;` line and re-run `session-store.test.jsx`. Expected: "does not overwrite a saved career before the load completes" FAILS. Restore it.

- [ ] **Step 8: Commit**

```bash
git add src/storage.js src/ui/EcuLab.jsx tests/storage.test.js tests/ui/session-store.test.jsx
git commit -m "Persist the run log and the pin, and stop a cold start clobbering the save"
```

---

## Task 6: The HISTORY screen

**Files:**
- Create: `src/ui/screens/dyno/HistoryScreen.jsx`, `src/ui/screens/dyno/HistoryScreen.module.css`
- Modify: `src/ui/routing.js`, `src/ui/EcuLab.jsx`
- Test: `tests/ui/dyno-screens.test.jsx`

**Interfaces:**
- Consumes: `sparklinePath`, `RunRecord` from `runLog.js`; `diffMeasuredInputs` from `pullSignature.js`; `session.runs`/`session.pinnedRunId`; `ACTIONS.PIN_RUN`/`UNPIN_RUN`.
- Produces: nothing later tasks depend on. This is the last task.

**Note on `routing.js`:** its `ROUTES` comment says *"Do not rename tabs or sections here; #83 re-sections these."* Adding a section is not renaming one — append `'history'` to `ROUTES.dyno` and leave the existing four untouched and in order.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/dyno-screens.test.jsx`:

Seed with this file's existing `mountWithResult(node, sessionFields)` — it dispatches
`SET_SESSION_FIELD` for each key before the screen mounts, which is exactly what `runs`
and `pinnedRunId` need. There is no store-state getter in this suite and this task must
not add one: the pin's effect is observable in the DOM, through the button's accessible
name, and asserting it there tests the thing the player actually gets.

```js
/** Three records, oldest id last, matching the store's newest-first order. */
const RUN_1 = makeRunRecord({
  id: 'a', n: 1, at: 1_000, label: 'VQ35DE',
  result: { peakHp: 300, peakTq: 280, points: [{ rpm: 1500, hp: 100, torque: 200 }], events: [] },
  scores: { tuning: { score: 80 }, engineer: { score: 70 } }, pullScore: 640,
  inputs: measuredInputs(makeInitialState().build, makeInitialState().tune, 100),
});
const RUN_2 = { ...RUN_1, id: 'b', n: 2, peakHp: 320 };
const RUN_3 = { ...RUN_1, id: 'c', n: 3, peakHp: 340 };
/** Identical to RUN_1 except for one measured input, so the diff has exactly one answer. */
const RUN_BOOSTED = {
  ...RUN_1, id: 'd', n: 2, peakHp: 400,
  inputs: measuredInputs(
    { ...makeInitialState().build, boostCurve: [1, 2, 3, 4, 5, 6, 7, 8] },
    makeInitialState().tune, 100,
  ),
};

describe('DYNO > HISTORY', () => {
  it('shows an empty state before any pull', () => {
    mountWithResult(<HistoryScreen />, { runs: [], pinnedRunId: null });
    expect(screen.getByText(/no pulls yet/i)).toBeTruthy();
  });

  it('lists runs newest first', () => {
    mountWithResult(<HistoryScreen />, { runs: [RUN_3, RUN_2, RUN_1], pinnedRunId: null });
    const rows = screen.getAllByRole('listitem');
    // Position, not presence: a screen that rendered the log reversed would pass a
    // test that only asserted all three runs appear somewhere.
    expect(rows[0].textContent).toContain('Run 3');
    expect(rows[2].textContent).toContain('Run 1');
  });

  it('names what changed between a run and the one before it', () => {
    mountWithResult(<HistoryScreen />, { runs: [RUN_BOOSTED, RUN_1], pinnedRunId: null });
    expect(screen.getByText(/boost curve/)).toBeTruthy();
  });

  it('says nothing changed when nothing did', () => {
    // The other half of the diff pair. A screen that always rendered the "changed"
    // line would pass the test above while telling the player a clean re-run had
    // altered their build.
    mountWithResult(<HistoryScreen />, { runs: [{ ...RUN_1, id: 'e', n: 2 }, RUN_1], pinnedRunId: null });
    expect(screen.queryByText(/Changed since/)).toBe(null);
  });

  it('pins a run and unpins the same run', () => {
    // Both directions through one control, so a handler that only ever dispatched
    // PIN_RUN would fail the second half.
    mountWithResult(<HistoryScreen />, { runs: [RUN_2, RUN_1], pinnedRunId: null });
    // Full literals, not substrings: "Unpin run 1" CONTAINS "Pin run 1", so a loose
    // matcher would happily find the wrong button and still pass.
    fireEvent.click(screen.getByRole('button', { name: 'Pin run 1 as the comparison' }));
    expect(screen.getByRole('button', { name: 'Unpin run 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin run 1' }));
    expect(screen.getByRole('button', { name: 'Pin run 1 as the comparison' })).toBeTruthy();
  });

  it('marks only the pinned row as pinned', () => {
    mountWithResult(<HistoryScreen />, { runs: [RUN_2, RUN_1], pinnedRunId: RUN_1.id });
    // Anchored for the same reason: /pin run/i matches "Unpin run 1" as well, and
    // would count two where the answer is one.
    expect(screen.getAllByRole('button', { name: /^Unpin run/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Pin run/ })).toHaveLength(1);
  });
});
```

Add `HistoryScreen`, `makeRunRecord`, `measuredInputs` and `makeInitialState` to this
file's imports. `mountWithResult` is already defined; do not add a parallel helper.

- [ ] **Step 2: Run and watch them fail**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx
```

Expected: FAIL — `HistoryScreen` does not exist.

- [ ] **Step 3: Write the styles**

Create `src/ui/screens/dyno/HistoryScreen.module.css`:

```css
/* DYNO > HISTORY — the run log timeline. Tokens only; no literal colours. */

.empty {
  font-size: 12.5px;
  color: var(--ink2);
  background: var(--panel2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--panel2);
  border: 1px solid var(--line);
}
.row[data-pinned='true'] {
  border-color: var(--acc);
  background: var(--acc-bg);
}

.ordinal {
  font-size: 11px;
  font-weight: 800;
  color: var(--ink-soft);
}

.when {
  font-size: 10px;
  color: var(--ink3);
}

.spark {
  width: 84px;
  height: 22px;
}
.sparkLine {
  fill: none;
  stroke: var(--acc);
  stroke-width: 1.5;
}

.peaks {
  font-size: 12px;
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
}

.delta {
  font-size: 11px;
  white-space: nowrap;
}
.delta[data-tone='up'] { color: var(--ok); }
.delta[data-tone='down'] { color: var(--danger-ink); }
.delta[data-tone='flat'] { color: var(--ink2); }

.changed {
  grid-column: 1 / -1;
  font-size: 10.5px;
  color: var(--ink2);
}

.knocks {
  font-size: 10.5px;
  color: var(--danger-ink);
}

.pin {
  padding: 6px 9px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 800;
  border: 1px solid var(--line);
  background: var(--panel3);
  color: var(--ink2);
}
.pin[data-on='true'] {
  border-color: var(--acc);
  background: var(--acc-bg);
  color: var(--acc-ink);
}
```

Check every token name against `src/ui/tokens.css` before committing — `--danger-ink`, `--acc-ink`, `--acc-bg`, `--panel3` and `--ink-soft` must all exist there. If one does not, use the nearest that does rather than adding a token in this PR.

- [ ] **Step 4: Write the screen**

Create `src/ui/screens/dyno/HistoryScreen.jsx`:

```jsx
/**
 * DYNO > HISTORY (the run log).
 *
 * Every pull the career has banked, newest first, with what changed since the one
 * before it and a control to pin any of them as the chart's comparison.
 *
 * `runs` is plain session state and this screen is its only list reader, so it comes
 * off the store rather than down as a prop — the same call LogScreen makes for
 * `result`.
 *
 * The "what changed" line compares the two runs' stored `inputs` through
 * `diffMeasuredInputs`, which derives its field list from the same private array the
 * pull signature is built from. That is the whole reason the diff lives in
 * pullSignature.js: a new simulation input is signed and reported in one edit.
 */

import React from 'react';

import { History, Pin } from 'lucide-react';

import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { diffMeasuredInputs } from '../../state/pullSignature.js';
import { ACTIONS } from '../../state/reducer.js';
import { sparklinePath } from '../../state/runLog.js';
import { useSession } from '../../state/StoreProvider.jsx';

import styles from './HistoryScreen.module.css';

/** Sparkline box, in the same user units the CSS sizes it in. */
const SPARK_W = 84;
const SPARK_H = 22;

/**
 * "4m ago", "2h ago", "just now" — coarse on purpose. A run log is read for order and
 * recency, not for timestamps.
 * @param {number} at epoch ms
 * @param {number} now epoch ms
 * @returns {string}
 */
function relativeTime(at, now) {
  const mins = Math.floor((now - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * @returns {React.ReactElement}
 */
export function HistoryScreen() {
  const [session, dispatch] = useSession();
  const { runs, pinnedRunId } = session;
  const now = Date.now();

  if (runs.length === 0) {
    return (
      <>
        <Eyebrow icon={History}>Run History</Eyebrow>
        <div className={styles.empty}>
          No pulls yet. Run a dyno pull and it lands here, with every pull after it.
        </div>
      </>
    );
  }

  return (
    <>
      <Eyebrow icon={History}>Run History</Eyebrow>
      <ul className={styles.list}>
        {runs.map((run, i) => {
          const prev = runs[i + 1];
          const dHp = prev ? run.peakHp - prev.peakHp : 0;
          const tone = !prev || dHp === 0 ? 'flat' : dHp > 0 ? 'up' : 'down';
          const changed = prev ? diffMeasuredInputs(prev.inputs, run.inputs) : [];
          const pinned = run.id === pinnedRunId;
          return (
            <li key={run.id} className={styles.row} data-pinned={pinned}>
              <div>
                <div className={styles.ordinal}>Run {run.n}</div>
                <div className={styles.when}>{relativeTime(run.at, now)}</div>
              </div>
              <svg className={styles.spark} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} aria-hidden="true">
                <path className={styles.sparkLine} d={sparklinePath(run.points, SPARK_W, SPARK_H)} />
              </svg>
              <div>
                <div className={styles.peaks}>{Math.round(run.peakHp)} whp · {Math.round(run.peakTq)} lb-ft</div>
                <div className={styles.delta} data-tone={tone}>
                  {prev ? `${dHp > 0 ? '+' : ''}${Math.round(dHp)} whp vs Run ${prev.n}` : 'first pull'}
                  {run.knocks > 0 && <span className={styles.knocks}> · {run.knocks} knock{run.knocks === 1 ? '' : 's'}</span>}
                </div>
              </div>
              <button
                type="button"
                className={styles.pin}
                data-on={pinned}
                aria-label={pinned ? `Unpin run ${run.n}` : `Pin run ${run.n} as the comparison`}
                onClick={() => dispatch(pinned ? { type: ACTIONS.UNPIN_RUN } : { type: ACTIONS.PIN_RUN, id: run.id })}
              >
                <Pin size={12} />
              </button>
              {changed.length > 0 && (
                <div className={styles.changed}>Changed since Run {prev.n}: {changed.join(', ')}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
```

Confirm `History` and `Pin` exist in the installed `lucide-react` before committing; if either does not, pick another icon already used in this codebase rather than adding a dependency.

- [ ] **Step 5: Register the route and render the screen**

In `src/ui/routing.js`:

```js
  dyno: ['result', 'data', 'log', 'score', 'history'],
```

In `src/ui/EcuLab.jsx`, add the import beside the other DYNO screens:

```js
import { HistoryScreen } from './screens/dyno/HistoryScreen.jsx';
```

Add `['history', 'HISTORY']` to the section switcher's array, after `['score', 'SCORE']`.

Add the render, after the `ScoreScreen` block, following the same `!running &&` shape the other three use:

```jsx
                {!running && dynoView === 'history' && (
                  <HistoryScreen />
                )}
```

Do not alter any of the four existing gates — the file's comment above them is explicit that DYNO's irregular gating is deliberate and must be preserved exactly.

- [ ] **Step 6: Run the tests and the gate**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all green. The total test count rises by ~5 beyond the tests written here, because `no-hardcoded-colours.test.js` generates 2–3 tests for each of the two new files.

- [ ] **Step 7: Prove the ordering test holds**

Temporarily render `[...runs].reverse()` in `HistoryScreen` and re-run. Expected: "lists runs newest first" FAILS. Revert.

- [ ] **Step 8: Confirm the sim is untouched**

```bash
git diff --stat origin/main -- src/sim tests/fixtures/fingerprint.sha256 tests/ui/characterisation.test.jsx
```

Expected: no output at all.

- [ ] **Step 9: Commit**

```bash
git add src/ui/screens/dyno/HistoryScreen.jsx src/ui/screens/dyno/HistoryScreen.module.css src/ui/routing.js src/ui/EcuLab.jsx tests/ui/dyno-screens.test.jsx
git commit -m "Add the DYNO run-history timeline, with pinning"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the run record and its operations to Task 1; the diff's placement in `pullSignature.js` to Task 2; the SESSION slice, `BANK_PULL`, pinning and the `APPLY_PRESET`/`RESET_TO_STOCK` lifecycle to Task 3; the `prevResult` removal and the RPM join to Task 4; storage and its backward compatibility to Task 5; the ghost treatment to Task 4 (`ResultScreen`) and the screen to Task 6. Each of the spec's eight required tests appears in the task that owns the code it holds.

**Type consistency.** `RunRecord` is defined once, in Task 1, and every later task refers to it by import. `makeRunRecord` takes `inputs` already projected, and `measuredInputs` (Task 2) is what projects it — the two are used together for the first time in Task 4, which is where a mismatch would surface, so both signatures are restated there.

**Defects found and fixed during this review, recorded because the same mistakes are the ones to watch for while executing:**

- The plan originally had `makeRunRecord` take its label from `engineDerived.name`. **That field does not exist** — `engineDerived` is displacement, cylinder count, redline and overlap. It now reads `presetById(presetId)?.name ?? 'Custom build'`.
- Tasks 4 and 6 originally invented test helpers (`renderDyno`, `renderHistory`, `store.getState()`) that `tests/ui/dyno-screens.test.jsx` does not have. They now use its real `mount` and `mountWithResult`, and assert the pin through the DOM rather than through a store getter that would have had to be built.
- The pin-count assertion originally used `/pin run/i`, which **also matches "Unpin run 1"** and would have counted two where the answer is one. Both queries are now anchored or full literals.
- The ghost label was originally an inline ternary in `EcuLab.jsx`'s JSX — the one piece of this feature's logic no test could reach. It is now `ghostLabel` in `runLog.js`, with both branches watched failing in Task 1.

**Environment note for whoever executes this:** `node_modules` was missing `lucide-react` when this plan was written, so the UI suite could not run at all. `npm ci` fixed it. The verified baseline on this branch is **988 tests across 33 files, all passing**, with lint, typecheck and build clean. Compare against that, and remember that the two files created in Task 6 add ~5 tests on their own via `no-hardcoded-colours.test.js`.
