# Post-Pull Scrubber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DATALOG's seven sampled breakpoint cards with a scrubbable readout that reaches every one of the pull's ~61 sweep points.

**Architecture:** A new pure module (`scrubPoint.js`) owns the three decisions worth testing without a DOM: which point an RPM selects, where the scrubber opens, and each gauge's tone. `DataScreen` holds the scrub position in local React state seeded from `session.logFocusRpm`, so a drag dispatches nothing through the single-context store. The track is a native range input with 5b's event bands drawn behind it.

**Tech Stack:** React 18, CSS Modules, Vitest + @testing-library/react, jsdom.

**Spec:** `docs/superpowers/specs/2026-09-10-post-pull-scrubber-design.md`

## Global Constraints

- **Node 22 only** (`v22.23.2`). Tests run as `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork`. **Never `npx vitest`** — it resolves a different cached copy that rejects `--poolOptions`.
- **Full gate on every commit:** `npm test`, `npm run lint` (`--max-warnings 0`), `npm run typecheck`, `npm run build`.
- **`src/sim/` is off-limits.** This PR reads from it and never writes to it.
- **`tests/fixtures/fingerprint.sha256` must be byte-identical to `main`.** Never run `npm run test:fingerprint:update`.
- **`tests/ui/characterisation.test.jsx` must be byte-identical to `main`.**
- **No hard-coded colours under `src/ui/`** — no hex, no `rgb()`/`rgba()`, no `hsl()`. Use tokens: `var(--ink)` in CSS, `T.*` or a tone name in JS. `tests/no-hardcoded-colours.test.js` enforces this per file.
- **Never run any form of `git stash`.** A pre-existing stash entry belongs to another branch. Use a scratch copy of a file instead.
- **`git add` explicit paths ONLY.** Never `git add -A`, never `git add .`.
- **Never merge a PR.** Work ends at "PR is open and awaiting review."
- **Another person works in this repository.** STOP if `git branch --show-current` stops reading `feat/61-post-pull-scrubber`.
- A raw test total is not a stable baseline: `no-hardcoded-colours.test.js` generates 2–3 tests per `src/ui` source file, so adding a file changes the count.
- **Every mutation proof changes exactly one thing**, and must fail the specific test it was predicted to fail — not merely fail something.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/theme.js` (modify) | Gains `utilisationTone`; `utilisationColor` is redefined through it so the thresholds live in one place |
| `src/ui/components/scrubPoint.js` (create) | Pure: `pointAt`, `initialScrubRpm`, `pointGauges`. No DOM, no store |
| `src/ui/screens/dyno/DataScreen.jsx` (modify) | Holds scrub position in local state; renders the track and the readout |
| `src/ui/screens/dyno/DataScreen.module.css` (modify) | Track, gauge-grid and band styles |
| `tests/ui/scrub-point.test.js` (create) | Unit tests for the pure module |
| `tests/ui/dyno-screens.test.jsx` (modify) | The DataScreen describe block, rendered |
| `tests/theme.test.js` (modify) | Pins `utilisationTone`/`utilisationColor` agreement |

---

### Task 1: `utilisationTone` in the theme

`StatTile` takes a tone **name**. `utilisationColor` returns a **colour**, so a caller needing the name has no way to ask — `DataScreen` currently works around it by comparing the returned colour against `T.danger`. `theme.js` already has the right pattern one line away: `statusTone(v)` returns a name and `statusColor(v)` is `T[statusTone(v)]`.

**Files:**
- Modify: `src/ui/theme.js:93`
- Test: `tests/theme.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `utilisationTone(v: number) => 'ok'|'warn'|'danger'`, exported from `src/ui/theme.js`. Task 2 imports it.

- [ ] **Step 1: Write the failing tests**

`tests/theme.test.js` already has a `describe('utilisationColor')` block at line 56 pinning both boundaries against the raw tokens. **That block is the refactor's safety net — do not modify or move it.** If redefining `utilisationColor` through `utilisationTone` changes any of its answers, those existing tests are what will say so.

Append to `tests/theme.test.js`, inside the existing top-level scope:

```js
describe('utilisationTone', () => {
  it('names the band at both boundaries, in both directions', () => {
    // Boundaries, not midpoints: an implementation using >= instead of > moves
    // exactly these two values and nothing else, so midpoint-only assertions
    // would pass it. Both directions of each boundary are pinned.
    expect(utilisationTone(75)).toBe('ok');
    expect(utilisationTone(75.1)).toBe('warn');
    expect(utilisationTone(90)).toBe('warn');
    expect(utilisationTone(90.1)).toBe('danger');
  });

  it('is the single source of the thresholds utilisationColor reports', () => {
    // The point of the refactor: one definition, two shapes. If the colour
    // function ever grows its own copy of the numbers, these disagree.
    for (const v of [0, 50, 75, 75.1, 85, 90, 90.1, 100]) {
      expect(utilisationColor(v)).toBe(T[utilisationTone(v)]);
    }
  });
});
```

Add `utilisationTone` to that file's existing import from `../src/ui/theme.js`. It already imports `T` and `utilisationColor`; if it does not, add them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/theme.test.js`
Expected: FAIL — `utilisationTone is not a function`.

- [ ] **Step 3: Implement**

In `src/ui/theme.js`, replace line 93:

```js
export const utilisationColor = (v) => (v > 90 ? T.danger : v > 75 ? T.warn : T.ok);
```

with:

```js
/**
 * How much of a budget is spent, as a tone name. Injector duty is the caller that
 * matters: past ~90% there is no time left in the engine cycle and the mixture goes
 * lean regardless of what the fuel table asked for.
 *
 * Split from `utilisationColor` so a caller that needs the NAME can ask for it —
 * `StatTile` takes a tone, not a colour, and the alternative was comparing a returned
 * colour against `T.danger`. Same shape as `statusTone`/`statusColor` above.
 *
 * @param {number} v percent of the budget used
 * @returns {'ok'|'warn'|'danger'}
 */
export const utilisationTone = (v) => (v > 90 ? 'danger' : v > 75 ? 'warn' : 'ok');

/**
 * @param {number} v percent of the budget used
 * @returns {string} the token colour for `utilisationTone(v)`
 */
export const utilisationColor = (v) => T[utilisationTone(v)];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/theme.test.js`
Expected: PASS.

- [ ] **Step 5: Prove the boundary test is load-bearing**

Change **one thing** in `src/ui/theme.js`: `v > 90` to `v >= 90`.
Run the same command.
Expected: the `names the band at both boundaries` test FAILS on `utilisationTone(90)`.
**Revert the mutation.** Confirm `git status --short` is clean apart from your intended edits.

- [ ] **Step 6: Run the full gate**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/theme.js tests/theme.test.js
git commit -m "Give utilisation a tone name, not only a colour"
```

---

### Task 2: The pure scrub module

Three decisions, none of which needs a DOM. Splitting them out follows the `eventBands.js` precedent from 5b: a decision buried in JSX is a decision no test can reach.

**Files:**
- Create: `src/ui/components/scrubPoint.js`
- Test: `tests/ui/scrub-point.test.js`

**Interfaces:**
- Consumes: `utilisationTone` from Task 1.
- Produces, all imported by Tasks 3 and 4:
  - `pointAt(points: object[], rpm: number) => object|null`
  - `initialScrubRpm(points: object[], logFocusRpm: number|null) => number`
  - `pointGauges(point: object) => {key: string, label: string, value: string|number, unit: string, tone: string}[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/scrub-point.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { initialScrubRpm, pointAt, pointGauges } from '../../src/ui/components/scrubPoint.js';

/** Three points, 100 RPM apart, with peak power NOT at the last one. */
const POINTS = [
  { rpm: 1500, hp: 100, torque: 200 },
  { rpm: 1600, hp: 180, torque: 260 },
  { rpm: 1700, hp: 150, torque: 210 },
];

describe('pointAt', () => {
  it('returns the exact point when the RPM is one', () => {
    expect(pointAt(POINTS, 1600)).toBe(POINTS[1]);
  });

  it('falls back to the nearest point BELOW, not above', () => {
    // Which end matters. Returning POINTS[2] for 1650 would still "return a
    // neighbour" and would still be one array slot away from the answer.
    expect(pointAt(POINTS, 1650)).toBe(POINTS[1]);
  });

  it('returns null before the first point, rather than clamping up to it', () => {
    expect(pointAt(POINTS, 1400)).toBe(null);
  });

  it('returns the last point above the end, rather than null', () => {
    // The other direction of the case above, and the opposite answer. An
    // implementation that returned null outside the range in BOTH directions
    // would pass the previous test alone.
    expect(pointAt(POINTS, 9000)).toBe(POINTS[2]);
  });
});

describe('initialScrubRpm', () => {
  it('opens at the focus RPM when there is one', () => {
    expect(initialScrubRpm(POINTS, 1700)).toBe(1700);
  });

  it('opens at peak POWER\'s RPM when there is no focus', () => {
    // 1600 is peak hp. It is deliberately neither the first point, the last
    // point, nor equal to any hp VALUE — so returning `peakHp` itself (180),
    // the first point (1500) or the last (1700) each produce a different,
    // visibly wrong answer.
    expect(initialScrubRpm(POINTS, null)).toBe(1600);
  });

  it('does not confuse peak power with peak torque', () => {
    // Peak torque is at 1600 here too, so a torque-reading implementation
    // would pass the test above. This moves torque's peak to the last point
    // and holds power's where it was.
    const tq = [
      { rpm: 1500, hp: 100, torque: 200 },
      { rpm: 1600, hp: 180, torque: 260 },
      { rpm: 1700, hp: 150, torque: 900 },
    ];
    expect(initialScrubRpm(tq, null)).toBe(1600);
  });

  it('clamps a focus RPM from outside the pull into it, at the correct end', () => {
    expect(initialScrubRpm(POINTS, 9000)).toBe(1700);
    expect(initialScrubRpm(POINTS, 200)).toBe(1500);
  });
});

/** Every field the gauges read, with every risk flag clear. */
const CLEAN = {
  rpm: 5200, maf: 214, map: 99, iat: 41, lambda: 0.88,
  duty: 78, pw: 9.1, egt: 835, peakPressure: 62,
  leanRisk: false, richRisk: false, egtRisk: false,
  pressureRisk: false, fuelLimited: false,
};

describe('pointGauges', () => {
  /** @returns {object} the gauge with that key */
  const byKey = (point, key) => pointGauges(point).find((g) => g.key === key);

  it('returns the eight standalone readings, and nothing that belongs in a row', () => {
    // Both halves. The three pairs (VE, timing, mixture) are rows, so a gauge
    // for any of them is the duplication this design exists to avoid.
    expect(pointGauges(CLEAN).map((g) => g.key)).toEqual(
      ['maf', 'map', 'iat', 'lambda', 'duty', 'pw', 'egt', 'peakPressure'],
    );
  });

  it('carries the point\'s own values, not recomputed ones', () => {
    expect(byKey(CLEAN, 'maf').value).toBe(214);
    expect(byKey(CLEAN, 'peakPressure').value).toBe(62);
  });

  it('is neutral everywhere when no risk flag is set', () => {
    expect(pointGauges(CLEAN).every((g) => g.tone === 'neutral' || g.key === 'duty')).toBe(true);
  });

  it('tones lambda from the mixture flags, both of them', () => {
    expect(byKey({ ...CLEAN, leanRisk: true }, 'lambda').tone).toBe('danger');
    expect(byKey({ ...CLEAN, richRisk: true }, 'lambda').tone).toBe('danger');
  });

  it('tones heat and pressure from their own flags, and only their own', () => {
    // Pinning the exclusivity, not just each case: an implementation that
    // toned every gauge danger whenever ANY flag was set would pass a test
    // that only checked the flagged one.
    const hot = { ...CLEAN, egtRisk: true };
    expect(byKey(hot, 'egt').tone).toBe('danger');
    expect(byKey(hot, 'peakPressure').tone).toBe('neutral');

    const stressed = { ...CLEAN, pressureRisk: true };
    expect(byKey(stressed, 'peakPressure').tone).toBe('danger');
    expect(byKey(stressed, 'egt').tone).toBe('neutral');
  });

  it('tones duty through utilisationTone rather than its own copy of the numbers', () => {
    expect(byKey({ ...CLEAN, duty: 70 }, 'duty').tone).toBe('ok');
    expect(byKey({ ...CLEAN, duty: 80 }, 'duty').tone).toBe('warn');
    expect(byKey({ ...CLEAN, duty: 95 }, 'duty').tone).toBe('danger');
  });

  it('tones pulse width danger when the injectors ran out of time', () => {
    expect(byKey({ ...CLEAN, fuelLimited: true }, 'pw').tone).toBe('danger');
    expect(byKey(CLEAN, 'pw').tone).toBe('neutral');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/scrub-point.test.js`
Expected: FAIL — cannot resolve `../../src/ui/components/scrubPoint.js`.

- [ ] **Step 3: Implement**

Create `src/ui/components/scrubPoint.js`:

```js
/**
 * The pull, addressed by RPM.
 *
 * DATALOG used to render one card per entry in `RPM` from `src/sim/tables.js` — the VE
 * TABLE's axis, borrowed because the constant was in scope. A default pull produces 61
 * sweep points and that axis has eight entries, one of which sits below the sweep's
 * start, so 54 points were in memory and unreachable. These three functions are what
 * make them addressable.
 *
 * Pure and DOM-free, same as `eventBands.js`: a decision buried in JSX is a decision no
 * test can reach.
 */

import { utilisationTone } from '../theme.js';

/**
 * The sweep point at `rpm`, or the nearest one below it.
 *
 * Falls back below rather than requiring an exact hit. The track's own `step` guarantees
 * exact hits, but the seeded RPM does not come from the track — it comes from
 * `logFocusRpm`, written by a chart click. Tying correctness to two separate things
 * agreeing is how a screen goes blank in a case nobody rendered.
 *
 * @param {object[]} points the pull's sweep points, ascending by rpm
 * @param {number} rpm
 * @returns {object|null} null only when `rpm` is below the first point
 */
export function pointAt(points, rpm) {
  let found = null;
  for (const p of points) {
    if (p.rpm > rpm) break;
    found = p;
  }
  return found;
}

/**
 * Where the scrubber opens.
 *
 * With a focus RPM it opens there, so clicking a knock band on CURVES and switching to
 * DATALOG lands on that knock. Without one it opens at peak power, which is the point a
 * player is most likely to want first. `BANK_PULL` clears the focus, so a new pull opens
 * at its own peak rather than at the last pull's event.
 *
 * The focus is clamped into this pull's range: it is written by a different screen and
 * must not be able to park the scrubber past the data.
 *
 * @param {object[]} points the pull's sweep points, ascending by rpm
 * @param {number|null} logFocusRpm
 * @returns {number}
 */
export function initialScrubRpm(points, logFocusRpm) {
  const first = points[0].rpm;
  const last = points[points.length - 1].rpm;
  if (logFocusRpm != null) return Math.min(Math.max(logFocusRpm, first), last);
  // Peak POWER's rpm, not peak power. `result.peakHp` is the value; the rpm it
  // happened at is not stored anywhere and has to come from the points.
  return points.reduce((a, b) => (b.hp > a.hp ? b : a)).rpm;
}

/**
 * @typedef {object} Gauge
 * @property {string} key
 * @property {string} label
 * @property {string|number} value
 * @property {string} unit
 * @property {'neutral'|'ok'|'warn'|'danger'} tone
 */

/**
 * The eight readings a single number can carry.
 *
 * Volumetric efficiency, timing and mixture are deliberately absent. Each of those is an
 * asked-to-got PAIR — the VE table's claim against what the engine flowed, commanded
 * timing against what the ECU ran, commanded mixture against what came out — and a bare
 * number cannot say that the ECU overrode you. They stay as rows.
 *
 * Every tone comes from a flag the sim already set, or from `utilisationTone`. Nothing
 * here re-derives a threshold that lives somewhere else.
 *
 * @param {object} p one sweep point
 * @returns {Gauge[]}
 */
export function pointGauges(p) {
  const mixture = p.leanRisk || p.richRisk ? 'danger' : 'neutral';
  return [
    { key: 'maf', label: 'AIRFLOW', value: p.maf, unit: 'g/s', tone: 'neutral' },
    { key: 'map', label: 'MAP', value: p.map, unit: 'kPa', tone: 'neutral' },
    { key: 'iat', label: 'IAT', value: p.iat, unit: '°C', tone: 'neutral' },
    { key: 'lambda', label: 'LAMBDA', value: p.lambda, unit: 'λ', tone: mixture },
    { key: 'duty', label: 'DUTY', value: p.duty, unit: '%', tone: utilisationTone(p.duty) },
    { key: 'pw', label: 'INJ PW', value: p.pw, unit: 'ms', tone: p.fuelLimited ? 'danger' : 'neutral' },
    { key: 'egt', label: 'EGT', value: p.egt, unit: '°C', tone: p.egtRisk ? 'danger' : 'neutral' },
    { key: 'peakPressure', label: 'PEAK P', value: p.peakPressure, unit: 'bar', tone: p.pressureRisk ? 'danger' : 'neutral' },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/scrub-point.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 5: Prove three tests are load-bearing, one mutation at a time**

Each of these changes **one thing**. Run the same command after each, confirm the **named** test fails, then **revert before the next**.

| Mutation | Predicted failure |
|---|---|
| In `pointAt`, `if (p.rpm > rpm) break;` → `if (p.rpm >= rpm) break;` | `returns the exact point when the RPM is one` |
| In `initialScrubRpm`, `b.hp > a.hp` → `b.torque > a.torque` | `does not confuse peak power with peak torque` |
| In `pointGauges`, `p.egtRisk ? 'danger'` → `(p.egtRisk \|\| p.pressureRisk) ? 'danger'` | `tones heat and pressure from their own flags, and only their own` |

If a mutation fails a **different** test than predicted, stop and report it — the test is not pinning what its name claims.

- [ ] **Step 6: Run the full gate**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/scrubPoint.js tests/ui/scrub-point.test.js
git commit -m "Address the pull by RPM, not by the VE table's axis"
```

---

### Task 3: The readout replaces the card list

The screen still shows one RPM after this task — peak power's — and no way to move. That is deliberate: it keeps the readout and its removal of the card list in one reviewable change, and leaves the app working. Task 4 makes the RPM selectable.

**Files:**
- Modify: `src/ui/screens/dyno/DataScreen.jsx`
- Modify: `src/ui/screens/dyno/DataScreen.module.css`
- Test: `tests/ui/dyno-screens.test.jsx` (the `DataScreen` describe block)

**Interfaces:**
- Consumes: `pointAt`, `initialScrubRpm`, `pointGauges` from Task 2; `StatTile` from `src/ui/primitives/StatTile.jsx`.
- Produces: nothing for later tasks beyond the rendered structure Task 4 drives.

- [ ] **Step 1: Write the failing tests**

In `tests/ui/dyno-screens.test.jsx`, the existing `FAKE_RESULT` has a single point at 1500 RPM. Add a multi-point result **above** the `describe('DataScreen')` block:

```js
/** Three points, so "which point is shown" is a real question. Peak hp is at 5200. */
const SCRUB_POINTS = [
  { ...FAKE_POINT, rpm: 4000, hp: 200, torque: 240, maf: 150, duty: 60, egt: 700 },
  { ...FAKE_POINT, rpm: 5200, hp: 268, torque: 271, maf: 214, duty: 78, egt: 835, knock: true, knockPull: 2.5, commandedTiming: 24, timing: 21.5 },
  { ...FAKE_POINT, rpm: 6000, hp: 250, torque: 220, maf: 205, duty: 95, egt: 960, egtRisk: true },
];
const SCRUB_RESULT = { points: SCRUB_POINTS, events: [], peakHp: 268, peakTq: 271 };
```

Then add these tests inside `describe('DataScreen')`:

```js
it('opens on peak power and shows that point, not the first or the last', () => {
  // Which end. 5200 is neither end of the array, so a first-point or
  // last-point implementation lands somewhere visibly different.
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  expect(screen.getByText('5200 RPM')).toBeTruthy();
  expect(screen.queryByText('4000 RPM')).toBeNull();
  expect(screen.queryByText('6000 RPM')).toBeNull();
});

it('opens on the focus RPM a chart band set, rather than on peak power', () => {
  // The other branch of the seeding rule, asserted through the rendered screen
  // rather than only through the pure function.
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: 6000 });
  expect(screen.getByText('6000 RPM')).toBeTruthy();
  expect(screen.queryByText('5200 RPM')).toBeNull();
});

it('no longer renders one card per VE-table breakpoint', () => {
  // The regression this task exists to remove. The old screen rendered a card
  // for every entry in the table's RPM axis that had a point; 2500 and 3500
  // are on that axis and are NOT in this pull, and 4000 is in this pull and is
  // NOT on that axis.
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  expect(screen.queryByText('2500 RPM')).toBeNull();
  expect(screen.queryByText('3500 RPM')).toBeNull();
});

it('renders the eight gauges, and none of the three pairs as a gauge', () => {
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  for (const label of ['AIRFLOW', 'MAP', 'IAT', 'LAMBDA', 'DUTY', 'INJ PW', 'EGT', 'PEAK P']) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  // Both halves of the split. A gauge for timing or mixture is the duplication
  // the design exists to avoid.
  expect(screen.queryByText('TIMING')).toBeNull();
  expect(screen.queryByText('MIXTURE')).toBeNull();
  expect(screen.queryByText('VE')).toBeNull();
});

it('renders exactly the three pairs as rows, each showing asked AND got', () => {
  // Asserted as the RULE, not as a list of three names: a test that counted
  // three rows would pass an implementation that picked the wrong three.
  const { container } = mountWithResult(
    <DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null },
  );
  const asked = [...container.querySelectorAll('[data-pair-asked]')];
  expect(asked.map((el) => el.getAttribute('data-pair-asked')).sort())
    .toEqual(['mixture', 'timing', 've']);
  // Every pair row shows both sides. A row that dropped its `asked` half would
  // still be a row, and would still count.
  for (const el of asked) expect(el.textContent.trim()).not.toBe('');
});

it('keeps the cylinder-filling row\'s teaching note', () => {
  // FAKE_POINT deliberately differs: veTable 80, ve 84.
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  expect(screen.getByText(/table says 80% VE, engine actually flowed 84%/)).toBeTruthy();
});

it('tones a gauge from the shown point\'s own flag', () => {
  // 6000 is the point carrying egtRisk. 5200 is not. Seeding the focus there
  // proves the tone follows the SHOWN point rather than the pull as a whole.
  const { container } = mountWithResult(
    <DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: 6000 },
  );
  const egt = container.querySelector('[data-gauge="egt"]');
  expect(egt.getAttribute('data-tone')).toBe('danger');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx`
Expected: FAIL — `5200 RPM` not found; the old card list still renders `1500 RPM` only.

- [ ] **Step 3: Replace the card list in `DataScreen.jsx`**

Update the imports at the top of the file:

```js
import React from 'react';

import { Grid3x3, Info } from 'lucide-react';

import { clamp, LOAD, RPM } from '../../../sim/index.js';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { initialScrubRpm, pointAt, pointGauges } from '../../components/scrubPoint.js';
import { Button } from '../../primitives/Button.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { StatTile } from '../../primitives/StatTile.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useSession, useTune } from '../../state/StoreProvider.jsx';
import { deltaHeat, T } from '../../theme.js';

import styles from './DataScreen.module.css';
```

`RPM` and `LOAD` are still used by the histogram, so both stay. `utilisationColor` leaves this file entirely: its only two call sites were the Injectors row's "at the limit" suffix and that row's `ok` flag, and the Injectors row is now a gauge whose tone `pointGauges` derives.

Add this component **above** `export function DataScreen()`:

```js
/**
 * The three asked-to-got pairs for one sweep point.
 *
 * These are rows rather than gauges because each is a PAIR: the VE table's claim against
 * what the engine actually flowed, commanded timing against what the ECU ran, commanded
 * mixture against what came out. A bare number cannot say that the ECU overrode you,
 * which is the entire diagnostic idea of a datalog.
 *
 * `data-pair-asked` carries the pair's id on the element holding the asked half, so a
 * test can assert the SPLIT rather than a count — three rows existing proves nothing
 * about which three.
 *
 * @param {{point: object}} props
 * @returns {React.ReactElement}
 */
function PairRows({ point: p }) {
  const rows = [
    { id: 've', k: 'Cylinder filling', asked: `${p.veTable}% VE`, got: `${p.ve}% VE`,
      note: p.veTable !== p.ve
        ? `${p.map} kPa manifold · table says ${p.veTable}% VE, engine actually flowed ${p.ve}%`
        : `${p.map} kPa manifold · table and engine agree at ${p.ve}%`,
      ok: Math.abs(p.veTable - p.ve) / Math.max(1, p.ve) < 0.03 },
    { id: 'timing', k: 'Timing', asked: `${p.commandedTiming}°`, got: `${p.timing}°`,
      note: p.knock ? `ECU pulled ${p.knockPull.toFixed(1)}° — too advanced for this cylinder pressure` : 'ran your commanded value',
      ok: !p.knock },
    { id: 'mixture', k: 'Mixture', asked: `${p.afrCommanded}:1`, got: `${p.afr}:1`,
      note: p.fuelLimited ? 'injectors out of time — mixture leaned out on its own'
        : p.richRisk ? 'far richer than commanded — check injector scaling'
          : `lambda ${p.lambda} · best power here is ${p.bestAfr}:1`,
      ok: !p.fuelLimited && !p.richRisk && !p.leanRisk },
  ];
  return (
    <div className={styles.cardBody}>
      {rows.map((row) => (
        <div key={row.id} className={styles.row}>
          <div className={styles.rowTop}>
            <span className={styles.rowKey}>{row.k}</span>
            <span className={styles.rowValue} data-ok={row.ok ? 'true' : 'false'}>
              <span className={styles.rowAsked} data-pair-asked={row.id}>{row.asked} → </span>
              {row.got}
            </span>
          </div>
          <div className={styles.rowNote} data-ok={row.ok ? 'true' : 'false'}>{row.note}</div>
        </div>
      ))}
    </div>
  );
}
```

Inside `DataScreen`, read the focus and derive the shown point. Add after `const { ve } = tune;`:

```js
  const { logFocusRpm } = session;
  const scrubRpm = initialScrubRpm(result.points, logFocusRpm);
  const shown = pointAt(result.points, scrubRpm) ?? result.points[0];
  const gauges = pointGauges(shown);
  const bad = shown.knock || shown.fuelLimited || shown.leanRisk || shown.richRisk || shown.pressureRisk;
  // `> 85` is the card's own existing threshold, carried over verbatim. It is NOT
  // utilisationTone's 75 — that governs a single gauge's colour, this governs the whole
  // readout's border, and they have always been different numbers. Swapping one for the
  // other here would change when the panel goes amber, which is a behaviour change
  // nobody asked for hiding inside a refactor.
  const warn = !bad && (shown.duty > 85 || shown.egtRisk);
  const tone = bad ? 'danger' : warn ? 'warn' : 'ok';
```

`utilisationTone` is therefore **not** imported by `DataScreen.jsx` — `pointGauges` is its only caller here. Drop it from the import line shown above, leaving `import { deltaHeat, T } from '../../theme.js';`.

`scrubRpm` is a plain `const` in this task, not state. Nothing can move it yet, so state with an unused setter would be an unused binding that exists only because a later task needs it. Task 4 converts this one line to `useState` at the moment something can actually change it.

Now replace the whole `<div className={styles.cards}>…</div>` block — the `RPM.map` card list — with:

```jsx
      <div className={styles.card} data-tone={tone}>
        <div className={styles.cardHead}>
          <span className={styles.cardRpm}>{shown.rpm} RPM</span>
          <span className={styles.cardStat}>{shown.hp} whp · {shown.torque} lb-ft</span>
        </div>
        <div className={styles.gauges}>
          {gauges.map((g) => (
            <div key={g.key} data-gauge={g.key} data-tone={g.tone}>
              <StatTile label={g.label} value={g.value} unit={g.unit} tone={g.tone} />
            </div>
          ))}
        </div>
        <PairRows point={shown} />
      </div>
```

Update the intro copy just above it:

```jsx
      <div className={styles.intro}>
        Every point of the pull, one at a time. Each line pairs <b className={styles.em}>what you asked for</b> with <b className={styles.em}>what the engine actually did</b> — a mismatch is the ECU telling you something.
      </div>
```

- [ ] **Step 4: Add the gauge-grid styles**

In `src/ui/screens/dyno/DataScreen.module.css`, replace the `.cards` rule with:

```css
.card { margin-bottom: var(--sp-xl); }

.gauges {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: var(--sp-md) 12px 0;
}

@media (max-width: 400px) {
  .gauges { grid-template-columns: repeat(2, 1fr); }
}
```

Keep every other rule in the file, including the existing `.card`, `.cardHead`, `.cardRpm`, `.cardStat`, `.cardBody`, `.row*` rules. Merge the new `.card` margin into the existing `.card` block rather than declaring `.card` twice.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx`
Expected: PASS. The two pre-existing DataScreen tests must still pass unchanged — `1500 RPM` still renders for the single-point `FAKE_RESULT`, and the histogram test is untouched.

- [ ] **Step 6: Prove the seeding test is load-bearing**

Change **one thing** in `DataScreen.jsx`: `initialScrubRpm(result.points, logFocusRpm)` → `initialScrubRpm(result.points, null)`.
Run the same command.
Expected: `opens on the focus RPM a chart band set` FAILS, and `opens on peak power` still PASSES.
**Revert the mutation.**

- [ ] **Step 7: Run the full gate**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/dyno/DataScreen.jsx src/ui/screens/dyno/DataScreen.module.css tests/ui/dyno-screens.test.jsx
git commit -m "Show one sweep point properly instead of seven badly"
```

---

### Task 4: The scrub track

**Files:**
- Modify: `src/ui/screens/dyno/DataScreen.jsx`
- Modify: `src/ui/screens/dyno/DataScreen.module.css`
- Test: `tests/ui/dyno-screens.test.jsx`

**Interfaces:**
- Consumes: `scrubRpm`/`setScrubRpm` and `shown` from Task 3.
- Produces: an `<input type="range">` with `aria-label` `"Scrub the pull by RPM"`. Task 5 draws behind it.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('DataScreen')`:

```js
it('spans the pull\'s own range, not the sweep constants', () => {
  // SWEEP_START_RPM is 1500 and SWEEP_END_RPM is 7500. This pull is 4000-6000.
  // A track built from the constants would let the player scrub 54 positions
  // past the end of the data.
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  const track = screen.getByRole('slider', { name: 'Scrub the pull by RPM' });
  expect(track.getAttribute('min')).toBe('4000');
  expect(track.getAttribute('max')).toBe('6000');
});

it('steps by the sweep step, so every position is a real point', () => {
  // Asserted as a VALUE. "has a step attribute" would pass step="1", which
  // puts 99 of every 100 positions between two points.
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  const track = screen.getByRole('slider', { name: 'Scrub the pull by RPM' });
  expect(track.getAttribute('step')).toBe(String(SWEEP_STEP_RPM));
});

it('moves the readout when the track moves', () => {
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  expect(screen.getByText('5200 RPM')).toBeTruthy();
  fireEvent.change(screen.getByRole('slider', { name: 'Scrub the pull by RPM' }), {
    target: { value: '4000' },
  });
  expect(screen.getByText('4000 RPM')).toBeTruthy();
  expect(screen.queryByText('5200 RPM')).toBeNull();
});

it('moves the gauges too, not only the RPM label', () => {
  // The readout is the point of the feature. A track wired to the heading
  // alone would pass the test above.
  const { container } = mountWithResult(
    <DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null },
  );
  expect(container.querySelector('[data-gauge="egt"]').getAttribute('data-tone')).toBe('neutral');
  fireEvent.change(screen.getByRole('slider', { name: 'Scrub the pull by RPM' }), {
    target: { value: '6000' },
  });
  expect(container.querySelector('[data-gauge="egt"]').getAttribute('data-tone')).toBe('danger');
});

it('announces the RPM rather than a bare number', () => {
  mountWithResult(<DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null });
  const track = screen.getByRole('slider', { name: 'Scrub the pull by RPM' });
  expect(track.getAttribute('aria-valuetext')).toBe('5200 RPM');
});
```

Add `SWEEP_STEP_RPM` to the file's existing import from `../../src/sim/index.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx`
Expected: FAIL — no element with role `slider`.

- [ ] **Step 3: Implement**

Add `SWEEP_STEP_RPM` to `DataScreen.jsx`'s sim import:

```js
import { clamp, LOAD, RPM, SWEEP_STEP_RPM } from '../../../sim/index.js';
```

Inside `DataScreen`, convert Task 3's `const scrubRpm = …` line into state, now that something can move it:

```js
  // Local, not session state. The store is one useReducer behind one context, so every
  // dispatch re-renders every consumer — the reason LiveScreen is its own file. A drag
  // gesture must not go through that path.
  const [scrubRpm, setScrubRpm] = React.useState(
    () => initialScrubRpm(result.points, logFocusRpm),
  );
```

Then, after the `tone` line from Task 3:

```js
  // From the DATA, never from SWEEP_START_RPM/SWEEP_END_RPM: a low-redline build makes
  // a shorter pull, and a track built from the constants would scrub past its end.
  const firstRpm = result.points[0].rpm;
  const lastRpm = result.points[result.points.length - 1].rpm;
```

Render the track immediately **above** the readout card:

```jsx
      {/* Native range, not a hand-built drag surface: keyboard, touch, pointer and
          screen-reader support all come with it, and #81 already tracks this
          project's accessibility debt. `step` is the sweep step, so every position
          lands on a real point rather than between two. */}
      <input
        type="range"
        className={styles.track}
        min={firstRpm} max={lastRpm} step={SWEEP_STEP_RPM}
        value={scrubRpm}
        onChange={(e) => setScrubRpm(Number(e.target.value))}
        aria-label="Scrub the pull by RPM"
        aria-valuetext={`${shown.rpm} RPM`}
      />
```

- [ ] **Step 4: Style the track**

Append to `DataScreen.module.css`:

```css
.track {
  -webkit-appearance: none;
  appearance: none;
  display: block;
  width: 100%;
  height: 22px;
  margin: 0 0 var(--sp-md);
  background: transparent;
  cursor: pointer;
}

.track::-webkit-slider-runnable-track {
  height: 22px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel2);
}
.track::-moz-range-track {
  height: 22px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel2);
}

.track::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 26px;
  margin-top: -3px;
  border: none;
  border-radius: 3px;
  background: var(--acc);
}
.track::-moz-range-thumb {
  width: 10px;
  height: 26px;
  border: none;
  border-radius: 3px;
  background: var(--acc);
}

.track:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx`
Expected: PASS.

- [ ] **Step 6: Prove two tests are load-bearing, one mutation at a time**

Revert each before the next.

| Mutation | Predicted failure |
|---|---|
| `min={firstRpm} max={lastRpm}` → `min={1500} max={7500}` | `spans the pull's own range, not the sweep constants` |
| `step={SWEEP_STEP_RPM}` → `step={1}` | `steps by the sweep step, so every position is a real point` |

- [ ] **Step 7: Run the full gate**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/dyno/DataScreen.jsx src/ui/screens/dyno/DataScreen.module.css tests/ui/dyno-screens.test.jsx
git commit -m "Make every point of the pull reachable"
```

---

### Task 5: Event bands behind the track

Replacing the card list removed the at-a-glance overview: the old list let a player spot the red card without reading. This restores it, using the same `eventBands` the two charts call in 5b, so the tint on the track and the tint on the chart are the same function's output.

**Files:**
- Modify: `src/ui/screens/dyno/DataScreen.jsx`
- Modify: `src/ui/screens/dyno/DataScreen.module.css`
- Test: `tests/ui/dyno-screens.test.jsx`

**Interfaces:**
- Consumes: `eventBands` from `src/ui/components/eventBands.js` (5b, already on `main`), `firstRpm`/`lastRpm` from Task 4.
- Produces: nothing further.

- [ ] **Step 1: Write the failing tests**

Add a banded result above `describe('DataScreen')`:

```js
/** The same pull, with one knock band across 4500-5500 and one whole-pull finding. */
const BANDED_RESULT = {
  ...SCRUB_RESULT,
  events: [
    { type: 'knock', severity: 3, msg: 'Knock across 4500-5500', rpmStart: 4500, rpmEnd: 5500 },
    { type: 'injscale', severity: 2, msg: 'Injectors scaled wrong' },
  ],
};
```

Then, inside `describe('DataScreen')`:

```js
it('draws a band on the track for a locatable event, positioned by RPM', () => {
  const { container } = mountWithResult(
    <DataScreen />, { result: BANDED_RESULT, histogram: null, logFocusRpm: null },
  );
  const bands = [...container.querySelectorAll('[data-track-band]')];
  expect(bands).toHaveLength(1);
  // The track spans 4000-6000, so a 4500-5500 band starts a quarter of the way
  // along and covers half. Position, not merely presence: a band pinned to the
  // left edge at full width would still be "a band".
  expect(bands[0].style.left).toBe('25%');
  expect(bands[0].style.width).toBe('50%');
});

it('draws no band for a whole-pull finding', () => {
  // The other direction. BANDED_RESULT carries an injscale event with no RPM
  // at all, and stretching it across the track would claim a location it does
  // not have.
  //
  // Asserted by naming the band that SHOULD be there, not by querying for an id
  // the whole-pull event would never produce — a selector that cannot match
  // whatever the bug generates proves nothing. This is the vacuous-negative
  // shape 5b shipped and had to fix.
  const { container } = mountWithResult(
    <DataScreen />, { result: BANDED_RESULT, histogram: null, logFocusRpm: null },
  );
  const ids = [...container.querySelectorAll('[data-track-band]')]
    .map((el) => el.getAttribute('data-track-band'));
  expect(ids).toEqual(['knock-4500-5500']);
});

it('draws no bands at all for a clean pull', () => {
  const { container } = mountWithResult(
    <DataScreen />, { result: SCRUB_RESULT, histogram: null, logFocusRpm: null },
  );
  expect(container.querySelectorAll('[data-track-band]')).toHaveLength(0);
});

it('keeps the input above every band in the stacking order', () => {
  // If a band sat over the input, the whole feature would break in a browser
  // while every test above stayed green — 5b shipped exactly that failure with
  // a `pointer-events` rule that lived only in CSS, and Vitest applies no CSS.
  //
  // So the guarantee is asserted as STRUCTURE, which jsdom does model: every
  // band is a sibling that precedes the input inside the wrapper. Painting
  // order follows document order for positioned siblings without a z-index,
  // so the input is on top. A band moved after the input fails this.
  const { container } = mountWithResult(
    <DataScreen />, { result: BANDED_RESULT, histogram: null, logFocusRpm: null },
  );
  const wrap = container.querySelector('[data-track-band]').parentElement;
  const kids = [...wrap.children];
  const input = wrap.querySelector('input[type="range"]');
  const lastBand = kids.map((el, i) => (el.hasAttribute('data-track-band') ? i : -1))
    .reduce((a, b) => Math.max(a, b), -1);
  expect(lastBand).toBeGreaterThan(-1);
  expect(kids.indexOf(input)).toBeGreaterThan(lastBand);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx`
Expected: FAIL — no `[data-track-band]` elements.

- [ ] **Step 3: Implement**

Add the import to `DataScreen.jsx`:

```js
import { eventBands } from '../../components/eventBands.js';
```

Inside `DataScreen`, after `lastRpm`:

```js
  // The same function both charts call in 5b, so the tint on the track and the tint on
  // the chart are one rule's output rather than two that drift. Whole-pull findings are
  // dropped by `eventBands` itself — a band spanning the whole track would claim a
  // location the finding does not have.
  const span = Math.max(1, lastRpm - firstRpm);
  const bands = eventBands(result.events).map((b) => ({
    ...b,
    left: `${((b.rpmStart - firstRpm) / span) * 100}%`,
    width: `${((b.rpmEnd - b.rpmStart) / span) * 100}%`,
  }));
```

Wrap the `<input>` from Task 4 in a positioned container, with the bands as siblings underneath it:

```jsx
      <div className={styles.trackWrap}>
        {bands.map((b) => (
          <div
            key={b.id}
            className={styles.trackBand}
            data-track-band={b.id}
            data-tone={b.tone}
            style={{ left: b.left, width: b.width }}
          />
        ))}
        <input
          type="range"
          className={styles.track}
          min={firstRpm} max={lastRpm} step={SWEEP_STEP_RPM}
          value={scrubRpm}
          onChange={(e) => setScrubRpm(Number(e.target.value))}
          aria-label="Scrub the pull by RPM"
          aria-valuetext={`${shown.rpm} RPM`}
        />
      </div>
```

Note the `<input>` keeps its own `className={styles.track}`; only its wrapper is new. Move the `margin-bottom` from `.track` to `.trackWrap` so the spacing does not double.

- [ ] **Step 4: Style the bands**

In `DataScreen.module.css`, change `.track`'s margin to `margin: 0;` and append:

```css
.trackWrap {
  position: relative;
  margin: 0 0 var(--sp-md);
}

/* Under the input, never over it. The band is a sibling that PRECEDES the range
   input with no z-index on either, so painting order puts the input on top —
   that is the structural guarantee the test asserts, because Vitest applies no
   CSS and a rule living only here would be invisible to the suite.
   `pointer-events: none` is belt-and-braces on top of that. */
.trackBand {
  position: absolute;
  top: 1px;
  bottom: 1px;
  pointer-events: none;
  border-radius: 3px;
  opacity: 0.35;
}
.trackBand[data-tone='danger'] { background: var(--danger); }
.trackBand[data-tone='warn'] { background: var(--warn); }
.trackBand[data-tone='violet'] { background: var(--violet); }

/* The runnable track must not paint over the bands beneath it. */
.track::-webkit-slider-runnable-track { background: transparent; }
.track::-moz-range-track { background: transparent; }

.trackWrap::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel2);
  pointer-events: none;
  z-index: -1;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/dyno-screens.test.jsx`
Expected: PASS.

- [ ] **Step 6: Prove the positioning test is load-bearing**

Change **one thing**: `((b.rpmStart - firstRpm) / span) * 100` → `0`.
Run the same command.
Expected: `draws a band on the track for a locatable event, positioned by RPM` FAILS on `left`.
**Revert the mutation.**

- [ ] **Step 7: Verify the guarded files never moved**

```bash
git diff --stat origin/main -- src/sim tests/fixtures/fingerprint.sha256 tests/ui/characterisation.test.jsx
```
Expected: **empty output**. If anything is listed, stop and report — this PR must not touch any of the three.

- [ ] **Step 8: Run the full gate**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/ui/screens/dyno/DataScreen.jsx src/ui/screens/dyno/DataScreen.module.css tests/ui/dyno-screens.test.jsx
git commit -m "Put the pull's trouble on the track, from the same rule the charts use"
```

---

## Done when

- All five tasks are committed, each having passed the full gate.
- `git diff --stat origin/main -- src/sim tests/fixtures/fingerprint.sha256 tests/ui/characterisation.test.jsx` is empty.
- The PR is open against `main`, **says "Closes #61"** (5c is the last of the three), and is **not merged**.
