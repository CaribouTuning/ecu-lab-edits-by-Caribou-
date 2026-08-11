# Engine Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four selectable factory engines (Nissan VQ35HR, BMW N54, VW EA888.3 in GTI and Golf R tune), each arriving with correct hardware and a generated factory calibration that dyno-validates against its real published power figures.

**Architecture:** A new pure-data module `src/sim/presets.js` holds published specs and derives each factory calibration from the physics itself rather than hand-authored tables. Reaching that point requires five preparatory changes to the simulation layer: a hygiene pass, a Tuning Score correction, extraction of the knock threshold into a shared function, configuration-dependent friction (which is what makes the new I6 physically distinct), and a per-engine redline.

**Tech Stack:** JavaScript (ES modules), React 18, Vite 5, Vitest 2. Python 3 with matplotlib for the offline calibration-fitting harness only.

**Spec:** `docs/superpowers/specs/2026-08-11-engine-presets-design.md`

## Global Constraints

- **No bonus multipliers on power.** `src/sim/airflow.js:5-7` forbids them. A preset that cannot reach its factory figure is fixed by an auditable coefficient change with written justification, or by widening the documented test tolerance — never by a per-engine fudge factor.
- **No bare magic numbers in `src/sim/`.** Every empirical constant goes in `src/sim/coefficients.js` with a comment explaining its value and source. This rule is stated in that file's own header.
- **Boost curves are always built with `RPM.map(...)`**, never array literals. A wrong-length literal previously put `NaN` through the whole simulation (`src/ui/EcuLab.jsx:1496`).
- **`src/sim/` must not import React.** The physics layer stays testable in plain Node.
- **Never update the fingerprint fixture just to make CI green** (`tests/fingerprint.js:20-22`). Every refresh in this plan comes with an explicit diff review step naming what is allowed to move.
- **The simulation stays JavaScript.** It runs client-side in the browser. Python is used only for the offline analysis harness in Task 7.
- Run `npm run lint` and `npm run typecheck` before every commit. Both are currently clean and must stay clean. **Every commit leaves `npm test` green.**
- **The physics baseline is a Nissan VQ35DE Rev-Up.** `DEFAULT_ENGINE_CONFIG` (95.5 x 81.4 mm, 10.3:1) and `BASE_KNOCK_LIMIT_91` were calibrated against that engine, even though `tables.js` says it names no production engine. This matters when fitting presets: **expected model error scales with distance from that baseline.** A VQ35HR is nearly on top of it and should land within a couple of percent; a 2.0 L turbo four is far from it and is where error will concentrate. If a preset misses its target, check whether the miss scales with that distance before suspecting the preset data.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/sim/knock.js` | The knock threshold and MBT timing formulas, shared by `evaluatePoint` and the calibration generator |
| `src/sim/presets.js` | Preset data, `factoryCalibration()`, `applyPreset()` |
| `tests/presets.test.js` | Factory-figure validation and preset data integrity |
| `tests/scoring.test.js` | Tuning Score event classification |
| `scripts/analyze_presets.py` | Offline curve-fitting harness (not shipped, not in CI) |

**Modified:**

| Path | Change |
|---|---|
| `src/sim/tables.js` | Freeze default objects; add `redline` to `DEFAULT_ENGINE_CONFIG` |
| `src/sim/hardware.js` | Add `I6`; add `MAIN_BEARINGS`, `hasBalanceShafts()` |
| `src/sim/coefficients.js` | Add two sourced friction coefficients |
| `src/sim/engine.js` | `deriveEngine` returns `bearingFmepPa`, `balanceShaftFrac`, `redline` |
| `src/sim/friction.js` | `rubbingFmepPa` accepts architecture friction |
| `src/sim/point.js` | Call extracted `knockThreshold`/`mbtTiming`; pass architecture friction |
| `src/sim/sweep.js` | Validate boost curve; sweep to the engine's redline |
| `src/sim/live.js` | Per-engine rev limiter |
| `src/sim/scoring.js` | Deduct only calibration faults in the Tuning Score |
| `src/sim/index.js` | Export the two new modules |
| `src/ui/EcuLab.jsx` | Preset picker, preset-aware naming, factory-spec panel |
| `tests/fingerprint.js` | Add an I6 configuration to the matrix |

---

### Task 1: Hygiene pass — frozen defaults, dead argument, boost validation

Three small independent corrections that must land before preset data exists, because preset code is exactly what would trip over them. **No physics changes: the fingerprint hash must not move.**

**Files:**
- Modify: `src/sim/tables.js:63-75`
- Modify: `src/sim/sweep.js:29-40`
- Modify: `src/sim/live.js:69-75`
- Modify: `src/ui/EcuLab.jsx:745-749`
- Test: `tests/regressions.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `DEFAULT_ENGINE_CONFIG` and `DEFAULT_MODS` are frozen. `simulateSweep` and `liveStep` throw `Error` on a boost curve whose length differs from `RPM.length`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/regressions.test.js`:

```js
describe('preset-readiness hardening', () => {
  it('freezes the shared default engine config so callers cannot corrupt it', () => {
    expect(Object.isFrozen(S.DEFAULT_ENGINE_CONFIG)).toBe(true);
    expect(Object.isFrozen(S.DEFAULT_MODS)).toBe(true);
  });

  it('rejects a boost curve that does not match the RPM axis', () => {
    const cfg = S.DEFAULT_ENGINE_CONFIG;
    const derived = S.deriveEngine(cfg);
    const run = (boostCurve) => S.simulateSweep({
      loadKpa: 100,
      ve: S.computeHardwareVE(cfg, S.DEFAULT_MODS, {}),
      timing: S.clone2D(S.DEFAULT_TIMING),
      afr: S.clone2D(S.DEFAULT_AFR),
      turboOn: true, boostCurve,
      octaneBonus: 0, octaneLabel: '91', fuel: S.OCTANE_OPTS[0],
      injectorCc: 550, ecuInjectorCc: 550, injectorLabel: '550cc',
      mods: S.DEFAULT_MODS, mafScalar: 1, derived,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
    });
    // Seven entries for an eight-point axis is the exact bug that once shipped.
    expect(() => run([0, 0, 3, 6, 8, 8, 8])).toThrow(/boost curve/i);
    expect(() => run(S.RPM.map(() => 8))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/regressions.test.js -t "preset-readiness"`
Expected: FAIL — `Object.isFrozen` returns false, and the short boost curve does not throw.

- [ ] **Step 3: Freeze the shared defaults**

In `src/sim/tables.js`, replace the `DEFAULT_ENGINE_CONFIG` and `DEFAULT_MODS` declarations:

```js
/**
 * Stock short-block design. Nothing here names a real production engine.
 *
 * Frozen: this object is handed straight to React state, and a caller doing
 * `Object.assign(cfg, patch)` — exactly what preset code reaches for — would
 * otherwise corrupt the module-level default for the whole session.
 * @type {Readonly<import('./engine.js').EngineConfig>}
 */
export const DEFAULT_ENGINE_CONFIG = Object.freeze({
  configuration: 'V6',
  bore: 95.5,
  stroke: 81.4,
  compression: 10.3,
  blockMaterial: 'Aluminum',
  headMaterial: 'Aluminum',
  camDuration: 210,
  springRate: 50,
});

/** No bolt-ons fitted. Frozen for the same reason as the engine config above. */
export const DEFAULT_MODS = Object.freeze({ intake: false, exhaust: false, headers: false, intercooler: false });
```

- [ ] **Step 4: Validate boost curve length in the simulation layer**

In `src/sim/sweep.js`, add this exported helper directly above `simulateSweep`:

```js
/**
 * Guards the one input that has already broken this simulation once.
 *
 * The UI builds every boost curve with `RPM.map(...)`, but preset data is a second
 * source of curves. A short array silently interpolates to `undefined` and puts NaN
 * through every downstream formula, so fail loudly at the boundary instead.
 *
 * @param {number[]} boostCurve
 * @throws {Error} if the curve does not match the RPM axis
 */
export function assertBoostCurve(boostCurve) {
  if (!Array.isArray(boostCurve) || boostCurve.length !== RPM.length) {
    throw new Error(
      `boost curve must have ${RPM.length} entries, one per RPM breakpoint — got ${
        Array.isArray(boostCurve) ? boostCurve.length : typeof boostCurve
      }. Build it with RPM.map(...).`,
    );
  }
  const bad = boostCurve.findIndex((v) => !Number.isFinite(v));
  if (bad !== -1) {
    throw new Error(`boost curve entry ${bad} is not a finite number: ${boostCurve[bad]}`);
  }
}
```

Then as the first statement inside `simulateSweep`'s body:

```js
  if (turboOn) assertBoostCurve(boostCurve);
```

In `src/sim/live.js`, import it and add the same guard inside `liveStep`, immediately after the `cfg` destructure:

```js
import { assertBoostCurve } from './sweep.js';
```

```js
  if (turboOn) assertBoostCurve(boostCurve);
```

- [ ] **Step 5: Remove the dead argument**

In `src/ui/EcuLab.jsx`, in `doRun`, delete `exhaustDiaError` from the `simulateSweep` call. `simulateSweep` never destructured it; `computeEngineerScore` below still receives it and must keep it.

The call becomes:

```js
    const r = simulateSweep({
      loadKpa, ve, veTruth, timing, afr, turboOn, boostCurve, octaneBonus, octaneLabel: OCTANE_OPTS[octaneIdx].label,
      fuel, injectorCc, ecuInjectorCc, injectorLabel: INJECTOR_OPTS[injIdx].label, mods, mafScalar, derived: engineDerived,
      turbine: TURBINE_OPTS[turbineIdx], compressor: COMPRESSOR_OPTS[compressorIdx],
    });
```

- [ ] **Step 6: Export the new helper**

`src/sim/index.js` already does `export * from './sweep.js'`, so `assertBoostCurve` is exported automatically. Confirm no change is needed.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, 78 tests. **The fingerprint test must still pass without refreshing the fixture** — this task changes no physics. If the fingerprint fails, something in this task changed behaviour and must be found before proceeding.

- [ ] **Step 8: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/sim/tables.js src/sim/sweep.js src/sim/live.js src/ui/EcuLab.jsx tests/regressions.test.js
git commit -m "Harden shared defaults and boost curve input before adding presets

Freeze DEFAULT_ENGINE_CONFIG and DEFAULT_MODS, which are handed straight to
React state and would be corrupted session-wide by a caller doing Object.assign
— exactly what preset code reaches for.

Move the boost curve length guarantee out of the UI and into the simulation
layer, since preset data is about to become a second source of curves.

Drop the exhaustDiaError argument doRun passed to simulateSweep, which never
destructured it. computeEngineerScore still receives it.

No physics change: the fingerprint is untouched."
```

---

### Task 2: Tuning Score counts only calibration faults

The score labelled "how clean the calibration is" currently deducts for hardware trade-offs the player cannot tune away. Measured: a perfectly calibrated VQ35HR scores 96, not 100, purely for its cam.

**Files:**
- Modify: `src/sim/scoring.js:17-37`
- Modify: `src/sim/sweep.js` (no logic change — confirm every event carries `type`)
- Test: `tests/scoring.test.js` (create)

**Interfaces:**
- Consumes: events produced by `simulateSweep`, each carrying `type`, `impact`, `severity`, `msg`, `cause`, `fix`
- Produces: `CALIBRATION_EVENT_TYPES` (a `Set`), and `computeTuningScore` returning an additional `advisories: string[]` field alongside the existing `score`, `label`, `deductions`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring.test.js`:

```js
/**
 * Scoring intent tests.
 *
 * The Tuning Score grades the CALIBRATION. Hardware trade-offs belong to the
 * Engineer Score and to the advisory list — never to this number, because the
 * player cannot edit a camshaft from the TUNE tab.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

const ev = (type, impact, msg = `${type} event`) => ({ type, impact, severity: 2, msg });

describe('computeTuningScore', () => {
  it('scores a clean pull at 100', () => {
    expect(S.computeTuningScore({ events: [] }).score).toBe(100);
  });

  it('deducts for calibration faults', () => {
    const r = S.computeTuningScore({ events: [ev('knock', 20)] });
    expect(r.score).toBe(80);
    expect(r.deductions).toHaveLength(1);
  });

  it('does NOT deduct for hardware trade-offs the player cannot tune away', () => {
    // A big cam, valve float and bottom-end stress are all hardware consequences.
    // The cam event's own `fix` text says "you cannot calibrate it away".
    const events = [ev('cam', 14), ev('float', 34), ev('bearing', 9)];
    const r = S.computeTuningScore({ events });
    expect(r.score).toBe(100);
    expect(r.deductions).toHaveLength(0);
  });

  it('still surfaces hardware trade-offs as advisories rather than hiding them', () => {
    const r = S.computeTuningScore({ events: [ev('cam', 14, 'Large camshaft')] });
    expect(r.advisories).toEqual(['Large camshaft']);
  });

  it('separates the two classes within one pull', () => {
    const r = S.computeTuningScore({ events: [ev('knock', 20), ev('float', 34)] });
    expect(r.score).toBe(80);
    expect(r.deductions).toHaveLength(1);
    expect(r.advisories).toHaveLength(1);
  });

  it('treats an unknown event type as a calibration fault, so new faults are never silently free', () => {
    expect(S.computeTuningScore({ events: [ev('brand_new_fault', 10)] }).score).toBe(90);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/scoring.test.js -v`
Expected: FAIL — the hardware-trade-off test reports 43 instead of 100, and `advisories` is undefined.

- [ ] **Step 3: Implement the split**

In `src/sim/scoring.js`, replace `computeTuningScore` and add the classification above it:

```js
/**
 * Event types that represent a CALIBRATION fault — something the player can fix by
 * editing a table. These, and only these, move the Tuning Score.
 *
 * The complement (`cam`, `float`, `bearing`) are hardware consequences. The cam
 * event's own advice text reads "This is a hardware trade-off, not a tuning fault —
 * you cannot calibrate it away", and deducting for it made a perfectly calibrated
 * engine unable to score 100 for reasons no table edit could address. Hardware
 * coherence is what the Engineer Score is for.
 *
 * Unlisted types count as calibration faults, so a newly added fault is never
 * silently worth zero.
 */
export const CALIBRATION_EVENT_TYPES = new Set([
  'knock', 'fuel', 'lean', 'valve', 'rich', 'maf', 'injscale', 'compressor',
]);

/**
 * Grades how clean a calibration is, from the pull's event log.
 *
 * @param {{events: {type?: string, impact?: number, msg: string}[]}} result a completed sweep
 * @returns {{score: number, label: string, deductions: string[], advisories: string[]}}
 */
export function computeTuningScore(result) {
  let score = 100;
  const deductions = [];
  const advisories = [];
  result.events.forEach((e) => {
    if (e.type && !CALIBRATION_EVENT_TYPES.has(e.type)) {
      advisories.push(e.msg);
      return;
    }
    const d = e.impact ?? 5;
    score -= d;
    deductions.push(`-${d}  ${e.msg}`);
  });
  score = clamp(Math.round(score), 0, 100);
  const label = score >= 90 ? 'Dialed In'
    : score >= 75 ? 'Solid'
    : score >= 55 ? 'Rough Edges'
    : score >= 30 ? 'Risky' : 'Dangerous';
  return { score, label, deductions, advisories };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/scoring.test.js -v`
Expected: PASS, 6 tests.

- [ ] **Step 5: Surface advisories in the UI**

In `src/ui/EcuLab.jsx`, find the SCORE view block that renders `scores.tuning` deductions (near line 2068, the `[['TUNING SCORE', scores.tuning], ['ENGINEER SCORE', scores.engineer]]` map). After the deductions list for the tuning score, render advisories so hardware trade-offs stay visible without costing points:

```jsx
{scores.tuning.advisories?.length > 0 && (
  <div style={{ marginTop: 8 }}>
    <div style={{ fontSize: 10, letterSpacing: 1, color: T.ink3, fontWeight: 800, marginBottom: 4 }}>
      HARDWARE TRADE-OFFS · NOT SCORED
    </div>
    {scores.tuning.advisories.map((a, i) => (
      <div key={i} style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.5 }}>{a}</div>
    ))}
  </div>
)}
```

- [ ] **Step 6: Review the fingerprint diff**

This task legitimately changes scores. Dump before and after, and confirm only scores moved — not physics.

```bash
node -e "
import('./tests/fingerprint.js').then(async (F) => {
  const S = await import('./src/sim/index.js');
  console.log(F.serialiseFingerprint(F.buildFingerprint(S)));
});
" > /tmp/fp-after.json
git stash && node -e "
import('./tests/fingerprint.js').then(async (F) => {
  const S = await import('./src/sim/index.js');
  console.log(F.serialiseFingerprint(F.buildFingerprint(S)));
});
" > /tmp/fp-before.json && git stash pop
diff <(grep -o '"peakHp": [0-9]*' /tmp/fp-before.json) <(grep -o '"peakHp": [0-9]*' /tmp/fp-after.json) && echo "PEAK POWER UNCHANGED — correct"
diff /tmp/fp-before.json /tmp/fp-after.json | head -40
```

Expected: `PEAK POWER UNCHANGED — correct` prints. The remaining diff touches only `tuning.score`, `tuning.label` and `pull` values, and every moved score moves **up or stays equal** — never down.

- [ ] **Step 7: Refresh the fixture and run everything**

```bash
npm run test:fingerprint:update
npm test
```
Expected: PASS, 84 tests.

- [ ] **Step 8: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/sim/scoring.js src/ui/EcuLab.jsx tests/scoring.test.js tests/fixtures/fingerprint.sha256
git commit -m "Score only calibration faults in the Tuning Score

computeTuningScore deducted for every event, including cam, float and bearing —
all hardware consequences. The cam event's own fix text says 'This is a hardware
trade-off, not a tuning fault — you cannot calibrate it away', and it then cost
up to 14 points on the score labelled 'how clean the calibration is'. A
perfectly calibrated engine with a 232-degree cam could score at most 96.

Hardware trade-offs are now surfaced as unscored advisories, so nothing is
hidden — it just stops being charged to the calibration.

Fingerprint refreshed: peak power is unchanged everywhere; only tuning and pull
scores moved, all upward."
```

---

### Task 3: Extract the knock threshold and MBT timing

The calibration generator needs the same knock threshold `evaluatePoint` uses. Two copies of this formula would be exactly the divergence `idealExhaustDiameter` was created to prevent (`src/sim/hardware.js:104-110`).

**This is a pure refactor. The fingerprint hash must not move.**

**Files:**
- Create: `src/sim/knock.js`
- Modify: `src/sim/point.js:114-154`
- Modify: `src/sim/index.js`
- Test: `tests/physics.test.js`

**Interfaces:**
- Consumes: `COEFF`, `BASE_KNOCK_LIMIT_91`, `RPM`, `clamp`, `interp1`, `BARO_KPA`
- Produces:
  - `knockThreshold({ rpm, mapKpa, veActual, chargeC, actualAfr, bestAfr, boostPsi, octaneBonus, mods, derived, compressor }) -> number` (degrees BTDC)
  - `mbtTiming(rpm, mapKpa) -> number` (degrees BTDC)

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.js`:

```js
describe('knock threshold, as a shared function', () => {
  const base = {
    rpm: 5500, mapKpa: S.BARO_KPA, veActual: 95, chargeC: 25,
    actualAfr: 12.85, bestAfr: 12.85, boostPsi: 0, octaneBonus: 0,
    mods: NO_MODS, derived: S.deriveEngine(STOCK), compressor: S.COMPRESSOR_OPTS[1],
  };

  it('agrees exactly with the threshold evaluatePoint reports', () => {
    const p = point({ rpm: 5500, veVal: 95, afrCommanded: 12.85, timingVal: 20 });
    expect(S.knockThreshold({ ...base, actualAfr: p.afr, bestAfr: p.bestAfr, veActual: p.ve }))
      .toBeCloseTo(p.threshold, 1);
  });

  it('gives more margin at lower charge', () => {
    const light = S.knockThreshold({ ...base, mapKpa: 40, veActual: 55 });
    const heavy = S.knockThreshold({ ...base, mapKpa: 150, veActual: 105, boostPsi: 7 });
    expect(light).toBeGreaterThan(heavy);
  });

  it('gives more margin on higher octane', () => {
    expect(S.knockThreshold({ ...base, octaneBonus: 14 }))
      .toBeGreaterThan(S.knockThreshold({ ...base, octaneBonus: 0 }));
  });

  it('penalises a lean mixture only when there is cylinder pressure behind it', () => {
    const leanAtLoad = S.knockThreshold({ ...base, actualAfr: 15.5 });
    const richAtLoad = S.knockThreshold({ ...base, actualAfr: 12.0 });
    expect(leanAtLoad).toBeLessThan(richAtLoad);
    // At deep vacuum the same leanness barely matters.
    const leanCruise = S.knockThreshold({ ...base, mapKpa: 30, veActual: 45, actualAfr: 15.5 });
    const richCruise = S.knockThreshold({ ...base, mapKpa: 30, veActual: 45, actualAfr: 12.0 });
    expect(Math.abs(leanCruise - richCruise)).toBeLessThan(Math.abs(leanAtLoad - richAtLoad));
  });
});

describe('MBT timing', () => {
  it('needs more advance at higher RPM', () => {
    expect(S.mbtTiming(7000, S.BARO_KPA)).toBeGreaterThan(S.mbtTiming(2000, S.BARO_KPA));
  });

  it('needs less advance at higher load, because a denser charge burns faster', () => {
    expect(S.mbtTiming(5000, 200)).toBeLessThan(S.mbtTiming(5000, 40));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/physics.test.js -t "knock threshold, as a shared function"`
Expected: FAIL — `S.knockThreshold is not a function`.

- [ ] **Step 3: Create `src/sim/knock.js`**

```js
/**
 * The knock envelope and MBT timing.
 *
 * Extracted from `evaluatePoint` so the factory calibration generator in
 * `presets.js` can ask the physics the same question the ECU asks: "how much
 * timing can this engine take here?" A second copy of these formulas would drift
 * from the first, which is the precise failure `idealExhaustDiameter` was created
 * to prevent — see the warning in `hardware.js`.
 */

import { BARO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp, interp1 } from './math.js';
import { BASE_KNOCK_LIMIT_91, RPM } from './tables.js';

/**
 * Minimum spark for best torque, degrees BTDC.
 *
 * Higher RPM needs more advance because there is less time for the burn; higher
 * load needs less because a denser charge burns faster.
 *
 * @param {number} rpm engine speed
 * @param {number} mapKpa manifold absolute pressure, kPa
 * @returns {number} degrees BTDC
 */
export function mbtTiming(rpm, mapKpa) {
  return 24 + ((rpm - 1500) / 6000) * 12 - (mapKpa / BARO_KPA) * 6;
}

/**
 * The most spark advance this operating point tolerates before it knocks.
 *
 * @param {object} input
 * @param {number} input.rpm engine speed
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.veActual TRUE cylinder filling, percent
 * @param {number} input.chargeC charge temperature, degrees C
 * @param {number} input.actualAfr delivered air:fuel ratio, gasoline-equivalent
 * @param {number} input.bestAfr best-power AFR at this boost
 * @param {number} input.boostPsi gauge boost, psi
 * @param {number} input.octaneBonus knock margin from fuel octane, degrees
 * @param {object} input.mods bolt-ons fitted
 * @param {import('./engine.js').DerivedEngine} input.derived
 * @param {{boostCeiling: number}} input.compressor
 * @returns {number} knock-limited spark advance, degrees BTDC
 */
export function knockThreshold({
  rpm, mapKpa, veActual, chargeC, actualAfr, bestAfr, boostPsi,
  octaneBonus, mods, derived, compressor,
}) {
  const afrDelta = actualAfr - bestAfr;
  // Knock is driven by how much charge is actually TRAPPED in the cylinder, not by
  // manifold pressure alone. Two engines at the same MAP but different volumetric
  // efficiency see different peak pressures — which is exactly why a big-cam engine
  // that breathes better also needs a few degrees less timing than a stock one.
  const chargeIndex = (veActual / 100) * (mapKpa / BARO_KPA);
  // Knock margin is not linear in charge. Doubling the trapped mass roughly doubles
  // peak pressure, so margin scales with the RATIO of charge to the reference, not
  // the difference. At deep vacuum an engine effectively cannot knock at all — which
  // is why factory cruise maps carry 40-50 deg of advance and never complain.
  const loadBonus = chargeIndex >= COEFF.KNOCK_CHARGE_REF
    ? (COEFF.KNOCK_CHARGE_REF - chargeIndex) * COEFF.KNOCK_CHARGE_GAIN
    : (COEFF.KNOCK_CHARGE_REF / Math.max(chargeIndex, 0.04) - 1) * COEFF.KNOCK_CHARGE_RATIO_GAIN;
  const overBoost = Math.max(0, boostPsi - compressor.boostCeiling);
  const iatPenalty = Math.max(0, chargeC - 25) * COEFF.KNOCK_IAT_PER_C;
  const modsThresholdBonus = (mods.headers ? 1.5 : 0) + (mods.exhaust ? 0.5 : 0);
  let threshold = interp1(RPM, BASE_KNOCK_LIMIT_91, rpm) + octaneBonus + loadBonus + modsThresholdBonus
    + derived.configKnockBonus + derived.materialKnockBonus + derived.compressionKnockAdj
    - iatPenalty - overBoost * COEFF.KNOCK_OVERBOOST_PENALTY;
  // A lean mixture only threatens knock when there is real cylinder pressure behind
  // it. At light cruise (low MAP) an engine happily runs 14.7:1 with 40 deg of advance
  // and never knocks — which is exactly why factory cruise maps look like that. Under
  // boost the same leanness is dangerous. So scale the mixture terms by charge
  // pressure rather than applying them flat.
  const pressureFactor = clamp(Math.pow(mapKpa / BARO_KPA, 1.5), 0.05, 2.6);
  threshold -= Math.max(0, afrDelta) * COEFF.KNOCK_LEAN_PENALTY * pressureFactor;
  threshold += Math.min(COEFF.KNOCK_RICH_CAP, Math.max(0, -afrDelta) * COEFF.KNOCK_RICH_BONUS)
    * clamp(pressureFactor, 0.3, 1.5);
  return threshold;
}

/** The charge index used by the knock model, exposed for the datalog. */
export function chargeIndexOf(veActual, mapKpa) {
  return (veActual / 100) * (mapKpa / BARO_KPA);
}
```

- [ ] **Step 4: Call it from `evaluatePoint`**

In `src/sim/point.js`, add the import:

```js
import { chargeIndexOf, knockThreshold, mbtTiming } from './knock.js';
```

Replace the whole block from `// --- KNOCK ENVELOPE.` through the line computing `threshold +=` (currently lines 114-146) with:

```js
  // --- KNOCK ENVELOPE. Shared with the factory calibration generator so the ECU and
  // the calibration cannot disagree about what this engine tolerates.
  const bestAfr = bestPowerAfr(boostPsi);
  const chargeIndex = chargeIndexOf(veActual, mapKpa);
  const threshold = knockThreshold({
    rpm, mapKpa, veActual, chargeC, actualAfr, bestAfr, boostPsi,
    octaneBonus, mods, derived, compressor,
  });
```

Then replace the inline MBT line:

```js
  const mbtIdeal = 24 + ((rpm - 1500) / 6000) * 12 - (mapKpa / BARO_KPA) * 6;
```

with:

```js
  const mbtIdeal = mbtTiming(rpm, mapKpa);
```

Remove the now-unused `afrDelta` local if nothing else references it — check first, as the AFR efficiency term below uses `actualAfr - bestAfr` directly.

- [ ] **Step 5: Export the module**

In `src/sim/index.js`, add after the `engine.js` line:

```js
export * from './knock.js';
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS. **The fingerprint must pass without a fixture refresh.** This is a pure refactor — if the hash moved, the extraction changed behaviour and the diff must be found before proceeding. That is the entire proof this task is safe.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/sim/knock.js src/sim/point.js src/sim/index.js tests/physics.test.js
git commit -m "Extract the knock threshold and MBT timing into src/sim/knock.js

The factory calibration generator needs to ask the physics the same question the
ECU asks — how much timing does this engine tolerate here. A second copy of the
formula would drift from the first, which is exactly what the warning on
idealExhaustDiameter exists to prevent.

Pure refactor: the fingerprint hash is unchanged, which is the proof."
```

---

### Task 4: Configuration-dependent friction, and the I6

Adding `I6` without more would make it numerically identical to a V6. Research found no sourceable breathing advantage, so the difference runs through friction, where published data exists.

**Files:**
- Modify: `src/sim/hardware.js:8-15`
- Modify: `src/sim/coefficients.js:18-22`
- Modify: `src/sim/engine.js:123-153`
- Modify: `src/sim/friction.js:23-26, 52-55`
- Modify: `src/sim/point.js:167`
- Modify: `tests/fingerprint.js:33-40`
- Test: `tests/physics.test.js`

**Interfaces:**
- Consumes: `deriveEngine` from Task 3's untouched signature
- Produces:
  - `CYL_COUNT.I6 === 6`, `CONFIG_OPTS` includes `'I6'`
  - `MAIN_BEARINGS: { I4: 5, I6: 7, V6: 4, V8: 5 }`
  - `hasBalanceShafts(configuration, displacementL) -> boolean`
  - `deriveEngine(cfg)` additionally returns `bearingFmepPa: number` and `balanceShaftFrac: number`
  - `rubbingFmepPa(rpm, springPa, arch)` where `arch` is `{ bearingFmepPa, balanceShaftFrac }`, defaulting to zeroes

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.js`:

```js
describe('engine configuration and friction', () => {
  const at = (configuration, over = {}) => S.deriveEngine({ ...STOCK, configuration, ...over });

  it('knows an inline six has six cylinders', () => {
    expect(S.CYL_COUNT.I6).toBe(6);
    expect(S.CONFIG_OPTS).toContain('I6');
  });

  it('charges an inline six for its seven main bearings against a V6 four', () => {
    // Architectural fact, not a preference: I6 = 7 mains, V6 = 4.
    expect(S.MAIN_BEARINGS.I6).toBe(7);
    expect(S.MAIN_BEARINGS.V6).toBe(4);
    expect(at('I6').bearingFmepPa).toBeGreaterThan(at('V6').bearingFmepPa);
  });

  it('leaves the V6 baseline at zero so existing builds do not move', () => {
    expect(at('V6').bearingFmepPa).toBe(0);
    expect(at('V6').balanceShaftFrac).toBe(0);
  });

  it('charges a large four for its balance shafts, and a six for none', () => {
    // A 2.0 L I4 carries balance shafts; the EA888.3 has two. An I6 is inherently
    // balanced and needs none.
    expect(S.hasBalanceShafts('I4', 2.0)).toBe(true);
    expect(S.hasBalanceShafts('I6', 3.0)).toBe(false);
    expect(S.hasBalanceShafts('V6', 3.5)).toBe(false);
    // A small four does not need them either.
    expect(S.hasBalanceShafts('I4', 1.2)).toBe(false);
  });

  it('makes an inline six cost slightly more friction than a V6 of equal size', () => {
    const i6 = at('I6');
    const v6 = at('V6');
    const arch = (d) => ({ bearingFmepPa: d.bearingFmepPa, balanceShaftFrac: d.balanceShaftFrac });
    expect(S.rubbingFmepPa(6000, 0, arch(i6))).toBeGreaterThan(S.rubbingFmepPa(6000, 0, arch(v6)));
  });

  it('keeps the friction penalty small enough to be a trade-off, not a verdict', () => {
    const i6 = at('I6');
    const arch = { bearingFmepPa: i6.bearingFmepPa, balanceShaftFrac: i6.balanceShaftFrac };
    const penalty = S.rubbingFmepPa(6000, 0, arch) / S.rubbingFmepPa(6000, 0) - 1;
    expect(penalty).toBeGreaterThan(0.02);
    expect(penalty).toBeLessThan(0.20);
  });

  it('defaults to no architecture penalty when none is supplied', () => {
    expect(S.rubbingFmepPa(6000, 0)).toBe(S.rubbingFmepPa(6000, 0, { bearingFmepPa: 0, balanceShaftFrac: 0 }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/physics.test.js -t "engine configuration and friction"`
Expected: FAIL — `S.CYL_COUNT.I6` is undefined.

- [ ] **Step 3: Add the architecture data to `hardware.js`**

Replace the top of `src/sim/hardware.js`:

```js
/** Cylinder count per configuration. */
export const CYL_COUNT = { I4: 4, I6: 6, V6: 6, V8: 8 };

/** Selectable engine configurations. */
export const CONFIG_OPTS = ['I4', 'I6', 'V6', 'V8'];

/**
 * Crankshaft main bearing count per configuration.
 *
 * An architectural fact, not a tuning knob: an inline engine carries a main between
 * every pair of cylinders plus one at each end, while a V shares a journal between
 * opposing cylinders. So an inline six runs seven mains where a V6 runs four.
 *
 * Crankshaft bearings are a real share of engine friction — published breakdowns put
 * the crankshaft group anywhere from ~9% of friction power to ~25%, rising with
 * speed. That is why the inline six's superior balance is not a free lunch: it pays
 * for its extra bearings every revolution.
 */
export const MAIN_BEARINGS = { I4: 5, I6: 7, V6: 4, V8: 5 };

/** Main bearing count treated as the calibration baseline (the stock V6). */
export const BASELINE_MAIN_BEARINGS = MAIN_BEARINGS.V6;

/**
 * Whether this architecture needs balance shafts.
 *
 * An inline six is inherently balanced in both primary and secondary order and needs
 * none — that is its genuine mechanical advantage. A cross-plane V8 and a 60-degree
 * V6 likewise run without them. A four-cylinder above roughly 1.8 L has a secondary
 * imbalance large enough that manufacturers fit a pair of counter-rotating shafts;
 * the EA888.3 has exactly that, two chain-driven shafts in the crankcase.
 *
 * Those shafts cost real friction. The National Academies' fuel-economy technology
 * report records that Ford's removal of the balance shaft from its 1.0 L three
 * cylinder "reduced friction by 6 percent", which is what sizes
 * {@link COEFF.FMEP_BALANCE_SHAFT_FRAC}.
 *
 * @param {string} configuration engine layout
 * @param {number} displacementL total displacement, litres
 * @returns {boolean}
 */
export function hasBalanceShafts(configuration, displacementL) {
  return configuration === 'I4' && displacementL >= 1.8;
}
```

- [ ] **Step 4: Add the two coefficients**

In `src/sim/coefficients.js`, inside the friction block after `SPRING_RPM_BIAS`:

```js
  // Extra rubbing FMEP per main bearing beyond the V6 baseline of four.
  // Anchored arithmetically rather than guessed: total rubbing FMEP at 6000 RPM is
  // about 84 kPa, published breakdowns put the crankshaft group near 15% of friction
  // (~12.6 kPa), and the baseline carries four mains — so roughly 3 kPa each.
  FMEP_PER_MAIN_BEARING_PA: 3000,
  // Fraction of rubbing friction added by a balance shaft pair. The National
  // Academies' fuel-economy report records a measured 6% friction reduction when
  // Ford deleted the balance shaft from its 1.0 L three-cylinder.
  FMEP_BALANCE_SHAFT_FRAC: 0.06,
```

- [ ] **Step 5: Return the architecture terms from `deriveEngine`**

In `src/sim/engine.js`, add the import:

```js
import { BASELINE_MAIN_BEARINGS, CYL_COUNT, MAIN_BEARINGS, hasBalanceShafts } from './hardware.js';
```

Inside `deriveEngine`, after `bearingWearMult` is computed:

```js
  // Architecture friction. Zeroed at the V6 baseline so existing builds do not move:
  // an inline six pays for its seven mains, a large four pays for its balance shafts,
  // and the inline six's real advantage is over the four, not over the V6.
  const bearingFmepPa = (MAIN_BEARINGS[cfg.configuration] - BASELINE_MAIN_BEARINGS)
    * COEFF.FMEP_PER_MAIN_BEARING_PA;
  const balanceShaftFrac = hasBalanceShafts(cfg.configuration, displacementL)
    ? COEFF.FMEP_BALANCE_SHAFT_FRAC : 0;
```

Add both to the returned object, and add these two lines to the `DerivedEngine` typedef:

```js
 * @property {number} bearingFmepPa extra rubbing FMEP from main bearing count, Pa
 * @property {number} balanceShaftFrac fraction of rubbing friction added by balance shafts
```

Also extend the `EngineConfig` typedef's `configuration` union to `'I4'|'I6'|'V6'|'V8'`.

- [ ] **Step 6: Apply it in `friction.js`**

Replace `rubbingFmepPa`:

```js
/**
 * Rubbing (mechanical) friction as a mean effective pressure.
 *
 * Rises with engine speed, with valve spring load if stiffer springs are fitted, and
 * with the engine's architecture — main bearing count and any balance shafts.
 *
 * @param {number} rpm engine speed
 * @param {number} [springPa] extra FMEP from valve springs, Pa
 * @param {{bearingFmepPa?: number, balanceShaftFrac?: number}} [arch] architecture friction
 * @returns {number} rubbing FMEP, Pa
 */
export function rubbingFmepPa(rpm, springPa = 0, arch = {}) {
  const { bearingFmepPa = 0, balanceShaftFrac = 0 } = arch;
  const rpmShare = (1 - COEFF.SPRING_RPM_BIAS) + COEFF.SPRING_RPM_BIAS * (rpm / 7500);
  const base = COEFF.RUBBING_BASE_PA + rpm * COEFF.RUBBING_PER_RPM + springPa * rpmShare
    + bearingFmepPa;
  return base * (1 + balanceShaftFrac);
}
```

And thread it through `frictionTorqueNm`, which the live engine uses for cranking drag:

```js
export function frictionTorqueNm(rpm, displacementL, mapKpa = BARO_KPA, springPa = 0, arch = {}) {
  const fmep = rubbingFmepPa(rpm, springPa, arch) + pumpingFmepPa(mapKpa);
  return (fmep * (displacementL / 1000)) / (4 * Math.PI);
}
```

- [ ] **Step 7: Pass it from `point.js` and `live.js`**

In `src/sim/point.js`, replace the FMEP line:

```js
  const fmepPa = rubbingFmepPa(rpm, derived.springPa || 0, {
    bearingFmepPa: derived.bearingFmepPa, balanceShaftFrac: derived.balanceShaftFrac,
  }) + pumpingFmepPa(mapKpa);
```

In `src/sim/live.js`, update the cranking drag call:

```js
  const crankingDrag = s.cranking
    ? frictionTorqueNm(Math.max(s.rpm, 0), derived.displacementL, pt ? pt.map : BARO_KPA, 0, {
        bearingFmepPa: derived.bearingFmepPa, balanceShaftFrac: derived.balanceShaftFrac,
      })
    : 0;
```

- [ ] **Step 8: Add an I6 to the fingerprint matrix**

In `tests/fingerprint.js`, add to `FINGERPRINT_CONFIGS` after `smallI4`:

```js
  turboI6:     { configuration: 'I6', bore: 84.0, stroke: 89.6, compression: 10.2, blockMaterial: 'Aluminum', headMaterial: 'Aluminum', camDuration: 216, springRate: 55 },
```

- [ ] **Step 9: Review the fingerprint diff**

Dump before and after as in Task 2, Step 6. Then verify the anchoring worked:

```bash
# V6 physics must be byte-identical. These two configs are V6.
diff <(grep -A3 '"stockV6|' /tmp/fp-before.json | grep -o '"peakHp": [0-9]*') \
     <(grep -A3 '"stockV6|' /tmp/fp-after.json | grep -o '"peakHp": [0-9]*') \
  && echo "V6 UNCHANGED — anchoring correct"
diff <(grep -A3 '"floatTrap|' /tmp/fp-before.json | grep -o '"peakHp": [0-9]*') \
     <(grep -A3 '"floatTrap|' /tmp/fp-after.json | grep -o '"peakHp": [0-9]*') \
  && echo "floatTrap V6 UNCHANGED"
```

Expected: both `UNCHANGED` lines print. `smallI4`, `undersquare`, `bigV8` and `cammedV8` peak power all drop by a small amount (roughly 1-3 hp); `turboI6` is new. `constants.COEFF` gains two entries and every `deriveEngine` block gains two fields — both expected.

If a V6 number moved, the baseline anchoring is wrong. Stop and fix it before refreshing.

- [ ] **Step 10: Refresh the fixture, run everything**

```bash
npm run test:fingerprint:update
npm test
```
Expected: PASS.

- [ ] **Step 11: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/sim/hardware.js src/sim/coefficients.js src/sim/engine.js src/sim/friction.js src/sim/point.js src/sim/live.js tests/physics.test.js tests/fingerprint.js tests/fixtures/fingerprint.sha256
git commit -m "Add I6 configuration, with friction that makes it physically distinct

An I6 that was numerically identical to a V6 would not be worth adding. Research
found no sourceable VE or airflow advantage for an inline six — every such claim
located was forum-grade with no data — so inventing a breathing bonus was
rejected as exactly the fudge factor coefficients.js forbids.

The difference instead runs through friction, where published data exists: main
bearing count (I6 runs seven against a V6's four) and balance shafts (a large I4
needs a pair; a six does not). The balance shaft coefficient is sized from the
National Academies' recorded 6% friction reduction when Ford deleted the shaft
from its 1.0 L three-cylinder.

So the inline six's real advantage is over the FOUR, through the correct
mechanism, and it is not a free upgrade over the V6.

Baseline anchored at the V6's four mains: V6 peak power is byte-identical in the
fingerprint. I4 and V8 builds lose 1-3 hp, which is the intended correction."
```

---

### Task 5: Per-engine redline

**Files:**
- Modify: `src/sim/tables.js` (`DEFAULT_ENGINE_CONFIG`)
- Modify: `src/sim/engine.js`
- Modify: `src/sim/sweep.js:29-57, 186-197`
- Modify: `src/sim/live.js:29-30, 112-121`
- Test: `tests/physics.test.js`

**Interfaces:**
- Consumes: `deriveEngine` from Task 4
- Produces: `EngineConfig.redline` (optional, defaults to 7500); `deriveEngine` returns `redline`; `simulateSweep` sweeps to it; `liveStep` limits at `redline + 100`

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.js`:

```js
describe('per-engine redline', () => {
  const sweepTo = (redline) => {
    const cfg = { ...STOCK, redline };
    const derived = S.deriveEngine(cfg);
    return S.simulateSweep({
      loadKpa: 100,
      ve: S.computeHardwareVE(cfg, S.DEFAULT_MODS, {}),
      timing: S.clone2D(S.DEFAULT_TIMING), afr: S.clone2D(S.DEFAULT_AFR),
      turboOn: false, boostCurve: S.RPM.map(() => 0),
      octaneBonus: 0, octaneLabel: '91', fuel: S.OCTANE_OPTS[0],
      injectorCc: 550, ecuInjectorCc: 550, injectorLabel: '550cc',
      mods: S.DEFAULT_MODS, mafScalar: 1, derived,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
    });
  };

  it('defaults to 7500 so existing builds are unaffected', () => {
    expect(S.deriveEngine(STOCK).redline).toBe(7500);
    expect(sweepTo(undefined).points.at(-1).rpm).toBe(7500);
  });

  it('ends the pull at the engine redline', () => {
    const r = sweepTo(6500);
    expect(r.points.at(-1).rpm).toBe(6500);
    expect(r.points.every((p) => p.rpm <= 6500)).toBe(true);
  });

  it('reports valve float against the engine own redline, not a fixed 7500', () => {
    const cfg = { ...STOCK, redline: 6500, camDuration: 290, springRate: 25 };
    const derived = S.deriveEngine(cfg);
    // Float sits near 7000 here — above a 6500 redline, so it must NOT be reported.
    expect(derived.floatRpm).toBeGreaterThan(6500);
    const r = S.simulateSweep({
      loadKpa: 100, ve: S.computeHardwareVE(cfg, S.DEFAULT_MODS, {}),
      timing: S.clone2D(S.DEFAULT_TIMING), afr: S.clone2D(S.DEFAULT_AFR),
      turboOn: false, boostCurve: S.RPM.map(() => 0),
      octaneBonus: 0, octaneLabel: '91', fuel: S.OCTANE_OPTS[0],
      injectorCc: 550, ecuInjectorCc: 550, injectorLabel: '550cc',
      mods: S.DEFAULT_MODS, mafScalar: 1, derived,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
    });
    expect(r.events.some((e) => e.type === 'float')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/physics.test.js -t "per-engine redline"`
Expected: FAIL — `redline` is undefined on the derived engine.

- [ ] **Step 3: Add `redline` to the config and derived engine**

In `src/sim/engine.js`, add to the `EngineConfig` typedef:

```js
 * @property {number} [redline] rev limit, RPM
```

and to `DerivedEngine`:

```js
 * @property {number} redline rev limit, RPM
```

Add near the top of `engine.js`:

```js
/** Rev limit assumed when an engine does not state one. */
export const DEFAULT_REDLINE_RPM = 7500;
```

Inside `deriveEngine`:

```js
  const redline = cfg.redline ?? DEFAULT_REDLINE_RPM;
```

and include `redline` in the returned object.

In `src/sim/tables.js`, add `redline: 7500,` to `DEFAULT_ENGINE_CONFIG` (inside the `Object.freeze`).

- [ ] **Step 4: Sweep to the engine's redline**

In `src/sim/sweep.js`, change the loop bound:

```js
  const endRpm = derived.redline ?? SWEEP_END_RPM;
  for (let rpm = SWEEP_START_RPM; rpm <= endRpm; rpm += SWEEP_STEP_RPM) {
```

And in the valve float event, replace both uses of `SWEEP_END_RPM`:

```js
  const floatRpm = derived.floatRpm || 99999;
  if (floatRpm < endRpm) {
    const lost = points.filter((p) => p.rpm > floatRpm);
    events.push({
      type: 'float', severity: 3, impact: Math.round(clamp((endRpm - floatRpm) / 45, 8, 34)),
      msg: `Valve float above ${Math.round(floatRpm)} RPM — cylinder filling collapsing over the last ${lost.length * SWEEP_STEP_RPM} RPM of the pull`,
      cause: `The camshaft opens the valves but only the springs close them. Above ${Math.round(floatRpm)} RPM the valves stop following the lobe, so the cylinder cannot fill and power falls off a cliff instead of tapering. A ${derived.camDuration}° cam opens further and faster, which is exactly why it demands stiffer springs than stock.`,
      fix: `Raise the valve spring rate on BUILD until float sits above your ${endRpm} RPM redline, or fit a milder cam. No amount of table tuning can fix this — the valvetrain is simply not keeping up.`,
    });
  }
```

- [ ] **Step 5: Make the live rev limiter follow the engine**

In `src/sim/live.js`, replace the fixed constant's use. Keep `REDLINE_CUT` exported for compatibility but derive the working value:

```js
/** Default rev limiter fuel cut, RPM, when an engine states no redline. */
export const REDLINE_CUT = 7600;
/** How far past the redline the limiter cuts fuel. */
export const LIMITER_OVERSHOOT_RPM = 100;
```

Inside `liveStep`, after the `cfg` destructure:

```js
  const redline = derived.redline ?? (REDLINE_CUT - LIMITER_OVERSHOOT_RPM);
  const limiterCutRpm = redline + LIMITER_OVERSHOOT_RPM;
```

Replace the limiter block:

```js
  if (s.running) {
    if (s.rpm >= limiterCutRpm) s.limiterCut = true;
    else if (s.rpm < limiterCutRpm - 320) s.limiterCut = false;
  } else s.limiterCut = false;
```

And the physics clamp, so the engine is never evaluated past its own redline:

```js
    const rpmClamped = clamp(s.rpm, 700, redline);
```

- [ ] **Step 6: Run tests and review the fingerprint**

Run: `npm test`

The fingerprint changes because `deriveEngine` now returns a `redline` field and `DEFAULT_ENGINE_CONFIG` gained a key. **Peak power for every fingerprint config must be unchanged** — they all default to 7500. Verify with the `peakHp` diff from Task 2, Step 6, then refresh:

```bash
npm run test:fingerprint:update && npm test
```

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/sim/engine.js src/sim/tables.js src/sim/sweep.js src/sim/live.js tests/physics.test.js tests/fixtures/fingerprint.sha256
git commit -m "Give each engine its own redline

The sweep ran to a fixed 7500 RPM and the live limiter cut at a fixed 7600,
which would show a Golf R making power 900 RPM past where it can rev. The valve
float advice was worse: it hardcoded 7500 in its own fix text, so it would tell
a 6500 RPM engine's owner to raise spring rate until float cleared 7500.

Defaults to 7500, so no existing build changes: fingerprint peak power is
unchanged everywhere, and only the new derived field moved the hash."
```

---

### Task 6: The presets module, fitted to factory figures

This task ends with every preset validating against its real published rating and the whole suite green. It is deliberately the largest task in the plan: the calibration generator and the data it generates from cannot be judged apart, because a generator that produces wrong numbers is not a working generator.

**Files:**
- Create: `src/sim/presets.js`
- Create: `tests/presets.test.js`
- Create: `scripts/analyze_presets.py`
- Modify: `src/sim/index.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `computeHardwareVE`, `knockThreshold`, `mbtTiming`, `bestPowerAfr`, `deriveEngine`, `RPM`, `LOAD`, `chargeTempK`, `OCTANE_OPTS`, `TURBINE_OPTS`, `COMPRESSOR_OPTS`, `INJECTOR_OPTS`, `EXHAUST_DIA_OPTS`, `clamp`
- Produces:
  - `ENGINE_PRESETS: Preset[]`
  - `FACTORY_KNOCK_MARGIN_DEG: number`
  - `factoryCalibration(preset) -> { ve: number[][], timing: number[][], afr: number[][] }`
  - `applyPreset(preset) -> { presetId, engineConfig, mods, turboOn, boostCurve, turbineIdx, compressorIdx, injIdx, ecuInjectorCc, octaneIdx, exhaustDiaIdx, ve, timing, afr }`

- [ ] **Step 1: Write the failing test**

Create `tests/presets.test.js`:

```js
/**
 * Preset validation.
 *
 * The point of these tests is that "factory calibration" is a falsifiable claim.
 * Each preset must produce a dyno pull close to the engine's real published rating,
 * with no knock — using only the shared physics, never a per-engine multiplier.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

/** Crank rating converted to the wheel figure the sim reports. */
const toWheel = (crankHp) => crankHp * S.DRIVETRAIN_EFF;

/** Runs a preset exactly as the app would, with its own factory calibration. */
function pullFor(preset) {
  const patch = S.applyPreset(preset);
  const derived = S.deriveEngine(patch.engineConfig);
  return S.simulateSweep({
    loadKpa: 100,
    ve: patch.ve, veTruth: patch.ve,
    timing: patch.timing, afr: patch.afr,
    turboOn: patch.turboOn, boostCurve: patch.boostCurve,
    octaneBonus: S.OCTANE_OPTS[patch.octaneIdx].bonus,
    octaneLabel: S.OCTANE_OPTS[patch.octaneIdx].label,
    fuel: S.OCTANE_OPTS[patch.octaneIdx],
    injectorCc: S.INJECTOR_OPTS[patch.injIdx].cc,
    ecuInjectorCc: patch.ecuInjectorCc,
    injectorLabel: S.INJECTOR_OPTS[patch.injIdx].label,
    mods: patch.mods, mafScalar: 1, derived,
    turbine: S.TURBINE_OPTS[patch.turbineIdx],
    compressor: S.COMPRESSOR_OPTS[patch.compressorIdx],
  });
}

describe('preset data integrity', () => {
  it('ships the four engines', () => {
    expect(S.ENGINE_PRESETS).toHaveLength(4);
    expect(S.ENGINE_PRESETS.map((p) => p.id)).toEqual([
      'vq35hr', 'n54', 'ea888-gti', 'ea888-r',
    ]);
  });

  it('gives every preset a unique id', () => {
    const ids = S.ENGINE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  S.ENGINE_PRESETS.forEach((preset) => {
    describe(preset.name, () => {
      it('has a boost curve matching the RPM axis', () => {
        expect(preset.induction.boost).toHaveLength(S.RPM.length);
        expect(preset.induction.boost.every(Number.isFinite)).toBe(true);
      });

      it('stays inside the ranges the BUILD sliders allow', () => {
        const e = preset.engine;
        expect(e.bore).toBeGreaterThanOrEqual(75);
        expect(e.bore).toBeLessThanOrEqual(105);
        expect(e.stroke).toBeGreaterThanOrEqual(65);
        expect(e.stroke).toBeLessThanOrEqual(100);
        expect(e.compression).toBeGreaterThanOrEqual(8.5);
        expect(e.compression).toBeLessThanOrEqual(13.0);
        expect(e.camDuration).toBeGreaterThanOrEqual(180);
        expect(e.camDuration).toBeLessThanOrEqual(300);
        expect(e.camDuration % 2).toBe(0);
        expect(e.springRate).toBeGreaterThanOrEqual(20);
        expect(e.springRate).toBeLessThanOrEqual(100);
      });

      it('indexes real parts', () => {
        expect(S.INJECTOR_OPTS[preset.parts.injectorIdx]).toBeDefined();
        expect(S.EXHAUST_DIA_OPTS[preset.parts.exhaustDiaIdx]).toBeDefined();
        expect(S.OCTANE_OPTS[preset.parts.octaneIdx]).toBeDefined();
        expect(S.TURBINE_OPTS[preset.induction.turbineIdx]).toBeDefined();
        expect(S.COMPRESSOR_OPTS[preset.induction.compressorIdx]).toBeDefined();
      });

      it('redlines at or below the RPM axis maximum', () => {
        expect(preset.engine.redline).toBeLessThanOrEqual(S.RPM[S.RPM.length - 1]);
      });

      it('states its real displacement', () => {
        expect(S.deriveEngine(preset.engine).displacementL)
          .toBeCloseTo(preset.factory.displacementL, 2);
      });
    });
  });
});

describe('factory calibration validates against real published figures', () => {
  S.ENGINE_PRESETS.forEach((preset) => {
    describe(preset.name, () => {
      const r = pullFor(preset);

      it(`makes about ${preset.factory.crankHp} crank hp`, () => {
        const target = toWheel(preset.factory.crankHp);
        expect(r.peakHp).toBeGreaterThan(target * 0.95);
        expect(r.peakHp).toBeLessThan(target * 1.05);
      });

      it(`makes about ${preset.factory.crankTq} lb-ft`, () => {
        const target = toWheel(preset.factory.crankTq);
        expect(r.peakTq).toBeGreaterThan(target * 0.90);
        expect(r.peakTq).toBeLessThan(target * 1.10);
      });

      it('peaks where the manufacturer says it does', () => {
        const peakRpm = r.points.reduce((a, b) => (b.hp > a.hp ? b : a)).rpm;
        const rated = preset.factory.crankHpRpm;
        if (Array.isArray(rated)) {
          // Plateau-rated: anywhere inside the published band is correct.
          expect(peakRpm).toBeGreaterThanOrEqual(rated[0]);
          expect(peakRpm).toBeLessThanOrEqual(rated[1]);
        } else {
          expect(Math.abs(peakRpm - rated)).toBeLessThanOrEqual(500);
        }
      });

      it('does not knock — a factory calibration is knock-free', () => {
        expect(r.events.filter((e) => e.type === 'knock')).toHaveLength(0);
      });

      it('keeps injectors under the duty wall', () => {
        expect(Math.max(...r.points.map((p) => p.duty))).toBeLessThan(90);
      });
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/presets.test.js`
Expected: FAIL — `S.ENGINE_PRESETS` is undefined.

- [ ] **Step 3: Write `src/sim/presets.js`**

```js
/**
 * Pre-configured factory engines.
 *
 * Each preset is a real production engine with its published specifications, so a
 * player can start from something they recognise instead of guessing at slider
 * values. Every figure below is sourced in the comment beside it.
 *
 * WHAT "FACTORY CALIBRATION" MEANS HERE
 * Real OEM binaries (BMW MSD80, Siemens Simos 18.1) are not publicly available in a
 * form this project can source or ship. These calibrations are RECONSTRUCTIONS built
 * from what is public — factory boost, compression, published power and torque peaks
 * and typical OEM wide-open-throttle lambda — and then validated against the real
 * power figures by `tests/presets.test.js`. The test is what keeps the claim honest.
 *
 * The tables are generated from the physics rather than hand-authored, so a
 * coefficient change can never leave a stale calibration behind.
 */

import { COMPRESSOR_OPTS, EXHAUST_DIA_OPTS, INJECTOR_OPTS, OCTANE_OPTS, TURBINE_OPTS } from './hardware.js';
import { BARO_KPA, PSI_TO_KPA } from './constants.js';
import { computeHardwareVE } from './airflow.js';
import { knockThreshold, mbtTiming } from './knock.js';
import { bestPowerAfr } from './manifold.js';
import { chargeTempK } from './thermo.js';
import { deriveEngine } from './engine.js';
import { clamp, interp1 } from './math.js';
import { LOAD, RPM } from './tables.js';

/**
 * How far below the knock limit a factory calibration sits, in degrees.
 *
 * Manufacturers leave margin for fuel quality, altitude, heat soak and engine
 * wear — they do not calibrate to the edge the way a dyno tune can. This margin is
 * why the factory tune is beatable, which is the whole exercise.
 */
export const FACTORY_KNOCK_MARGIN_DEG = 2;

/** MAP above which an OEM calibration leaves closed loop and enriches for power. */
const OPEN_LOOP_KPA = 85;

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {string} name
 * @property {string} manufacturer
 * @property {string} years
 * @property {string} blurb
 * @property {object} factory published ratings
 * @property {import('./engine.js').EngineConfig} engine
 * @property {object} induction
 * @property {object} parts
 * @property {object} mods
 */

/** @type {Preset[]} */
export const ENGINE_PRESETS = [
  {
    id: 'vq35hr',
    name: 'Nissan VQ35HR',
    manufacturer: 'Nissan',
    years: '2007-2016',
    blurb: 'A high-revving naturally aspirated V6 — the reference point for what an engine makes without boost. Rewards cam and exhaust work, punishes anyone hoping for torque down low.',
    factory: {
      crankHp: 306, crankHpRpm: 6800,   // 306 hp @ 6800 rpm
      crankTq: 268, crankTqRpm: 4800,   // 268 lb-ft @ 4800 rpm
      displacementL: 3.50,
    },
    engine: {
      configuration: 'V6',
      bore: 95.5, stroke: 81.4,          // 95.5 x 81.4 mm
      compression: 10.6,                 // 10.6:1
      blockMaterial: 'Aluminum', headMaterial: 'Aluminum',
      camDuration: 232, springRate: 62,
      redline: 7500,
    },
    induction: { turboOn: false, turbineIdx: 1, compressorIdx: 1, boost: RPM.map(() => 0) },
    parts: { injectorIdx: 2, exhaustDiaIdx: 1, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: false },
  },
  {
    id: 'n54',
    name: 'BMW N54',
    manufacturer: 'BMW',
    years: '2006-2013',
    blurb: 'A twin-turbo straight six running unusually high compression for a boosted engine. Famous for leaving power on the table from the factory — which makes it the best argument in the app for why tuning exists.',
    factory: {
      crankHp: 302, crankHpRpm: 5800,   // 302 hp @ 5800 rpm
      crankTq: 295, crankTqRpm: 3000,   // 295 lb-ft, flat 1400-5000
      displacementL: 2.98,
    },
    engine: {
      configuration: 'I6',
      bore: 84.0, stroke: 89.6,          // 84 x 89.6 mm
      compression: 10.2,                 // 10.2:1 — high for a turbo engine, thanks to DI
      blockMaterial: 'Aluminum', headMaterial: 'Aluminum',
      camDuration: 216, springRate: 58,
      redline: 7000,
    },
    induction: {
      turboOn: true, turbineIdx: 0, compressorIdx: 1,
      // 0.6 bar / 8.7 psi peak, spooling early — twin small turbos.
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 2500 ? 7 : 8.7)),
    },
    parts: { injectorIdx: 3, exhaustDiaIdx: 2, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  },
  {
    id: 'ea888-gti',
    name: 'VW EA888.3 (GTI)',
    manufacturer: 'Volkswagen',
    years: '2013-2021',
    blurb: 'A small, heavily boosted four with a long stroke and a broad torque plateau. Same short block as the Golf R below — the difference is entirely turbo and calibration, which is the point.',
    factory: {
      crankHp: 220, crankHpRpm: [4700, 6200],  // plateau-rated
      crankTq: 258, crankTqRpm: 1500,
      displacementL: 1.98,
    },
    engine: {
      configuration: 'I4',
      bore: 82.5, stroke: 92.8,          // 82.5 x 92.8 mm
      compression: 9.6,                  // 9.6:1
      blockMaterial: 'Cast Iron', headMaterial: 'Aluminum',
      camDuration: 210, springRate: 54,
      redline: 6500,
    },
    induction: {
      turboOn: true, turbineIdx: 0, compressorIdx: 0,
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 2500 ? 12 : 14)),
    },
    parts: { injectorIdx: 2, exhaustDiaIdx: 1, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  },
  {
    id: 'ea888-r',
    name: 'VW EA888.3 (Golf R)',
    manufacturer: 'Volkswagen',
    years: '2015-2021',
    blurb: 'The same 2.0 litre block with the larger IS38 turbo and a far more aggressive calibration. Compare it against the GTI preset to see how much of an engine is decided after the metal is cast.',
    factory: {
      crankHp: 292, crankHpRpm: [5400, 6500],  // plateau-rated
      crankTq: 280, crankTqRpm: 1800,
      displacementL: 1.98,
    },
    engine: {
      configuration: 'I4',
      bore: 82.5, stroke: 92.8,
      compression: 9.6,
      blockMaterial: 'Cast Iron', headMaterial: 'Aluminum',
      camDuration: 210, springRate: 54,
      redline: 6800,
    },
    induction: {
      turboOn: true, turbineIdx: 1, compressorIdx: 1,
      // IS38 at 1.2 bar / 17.4 psi.
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 2500 ? 14 : 17)),
    },
    parts: { injectorIdx: 4, exhaustDiaIdx: 1, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  },
];

/** The induction hardware bundle `computeHardwareVE` expects. */
function hardwareFor(preset) {
  const { turboOn, turbineIdx, boost } = preset.induction;
  return {
    turboOn,
    turbine: turboOn ? TURBINE_OPTS[turbineIdx] : null,
    exhaustDia: EXHAUST_DIA_OPTS[preset.parts.exhaustDiaIdx].dia,
    fuel: OCTANE_OPTS[preset.parts.octaneIdx],
    peakBoostPsi: turboOn ? Math.max(...boost) : 0,
  };
}

/**
 * Generates the factory calibration for a preset.
 *
 * Order matters: VE first (it is the physical truth), then FUEL (the knock model
 * needs the mixture), then SPARK (which is knock-limited given that mixture).
 *
 * @param {Preset} preset
 * @returns {{ve: number[][], timing: number[][], afr: number[][]}}
 */
export function factoryCalibration(preset) {
  const derived = deriveEngine(preset.engine);
  const fuel = OCTANE_OPTS[preset.parts.octaneIdx];
  const compressor = COMPRESSOR_OPTS[preset.induction.compressorIdx];
  const hw = hardwareFor(preset);
  const ve = computeHardwareVE(preset.engine, preset.mods, hw);

  /** Boost actually present at this cell, from the preset's own curve. */
  const boostAt = (rpm, mapKpa) => (preset.induction.turboOn && mapKpa > BARO_KPA
    ? Math.max(0, (mapKpa - BARO_KPA) / PSI_TO_KPA)
    : 0);

  // FUEL: stoichiometric where a real ECU runs closed loop, best-power enrichment
  // above that. This is exactly the shape of a factory fuel table.
  const afr = LOAD.map((loadKpa) => RPM.map((rpm) => {
    if (loadKpa < OPEN_LOOP_KPA) return 14.7;
    return Number(bestPowerAfr(boostAt(rpm, loadKpa)).toFixed(2));
  }));

  // SPARK: MBT where there is margin for it, knock-limited minus the factory safety
  // margin where there is not. That is what a production calibration is.
  const timing = LOAD.map((loadKpa, ri) => RPM.map((rpm, ci) => {
    const boostPsi = boostAt(rpm, loadKpa);
    const threshold = knockThreshold({
      rpm, mapKpa: loadKpa, veActual: ve[ri][ci],
      chargeC: chargeTempK(boostPsi, preset.mods.intercooler) - 273.15,
      actualAfr: afr[ri][ci], bestAfr: bestPowerAfr(boostPsi), boostPsi,
      octaneBonus: fuel.bonus, mods: preset.mods, derived, compressor,
    });
    const safe = threshold - FACTORY_KNOCK_MARGIN_DEG;
    return Number(clamp(Math.min(mbtTiming(rpm, loadKpa), safe), 5, 50).toFixed(1));
  }));

  return { ve, timing, afr };
}

/**
 * Everything the app needs to switch to this engine, as one patch.
 *
 * Returned rather than applied, so preset behaviour is testable without React.
 *
 * @param {Preset} preset
 * @returns {object} a complete state patch
 */
export function applyPreset(preset) {
  const { ve, timing, afr } = factoryCalibration(preset);
  return {
    presetId: preset.id,
    engineConfig: { ...preset.engine },
    mods: { ...preset.mods },
    turboOn: preset.induction.turboOn,
    boostCurve: [...preset.induction.boost],
    turbineIdx: preset.induction.turbineIdx,
    compressorIdx: preset.induction.compressorIdx,
    injIdx: preset.parts.injectorIdx,
    ecuInjectorCc: INJECTOR_OPTS[preset.parts.injectorIdx].cc,
    octaneIdx: preset.parts.octaneIdx,
    exhaustDiaIdx: preset.parts.exhaustDiaIdx,
    ve, timing, afr,
  };
}

/**
 * Finds a preset by id.
 * @param {string} id
 * @returns {Preset|undefined}
 */
export const presetById = (id) => ENGINE_PRESETS.find((p) => p.id === id);
```

Note: `interp1` is imported but only needed if boost interpolation is added later — remove the import if unused, since lint will flag it.

- [ ] **Step 4: Export the module**

In `src/sim/index.js`, add after the `sweep.js` line:

```js
export * from './presets.js';
```

- [ ] **Step 5: Run the tests to see where the presets stand**

Run: `npx vitest run tests/presets.test.js`
Expected: The data integrity tests PASS. The factory-figure tests **will likely fail** at this point — the remaining steps of this task exist to resolve that. Record the actual numbers before continuing. **Do not commit yet**; this task commits once, green, at the end.

- [ ] **Step 6: Write the analysis harness**

Create `scripts/analyze_presets.py`:

```python
#!/usr/bin/env python3
"""Compare each engine preset's simulated dyno curve against its factory rating.

The Vitest suite asserts pass/fail. This shows you WHERE a preset is wrong — an
engine can hit peak power and still have the wrong curve shape, which a single
assertion cannot tell you.

Offline developer tooling: not shipped, not part of the build, not in CI.

Usage:
    python3 scripts/analyze_presets.py            # table only
    python3 scripts/analyze_presets.py --plot     # also write preset-curves.png
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DRIVETRAIN_EFF = 0.85

# A tiny ESM shim: run each preset through the real simulation and emit JSON.
COLLECT_JS = """
import * as S from './src/sim/index.js';

const out = S.ENGINE_PRESETS.map((preset) => {
  const patch = S.applyPreset(preset);
  const derived = S.deriveEngine(patch.engineConfig);
  const r = S.simulateSweep({
    loadKpa: 100,
    ve: patch.ve, veTruth: patch.ve,
    timing: patch.timing, afr: patch.afr,
    turboOn: patch.turboOn, boostCurve: patch.boostCurve,
    octaneBonus: S.OCTANE_OPTS[patch.octaneIdx].bonus,
    octaneLabel: S.OCTANE_OPTS[patch.octaneIdx].label,
    fuel: S.OCTANE_OPTS[patch.octaneIdx],
    injectorCc: S.INJECTOR_OPTS[patch.injIdx].cc,
    ecuInjectorCc: patch.ecuInjectorCc,
    injectorLabel: S.INJECTOR_OPTS[patch.injIdx].label,
    mods: patch.mods, mafScalar: 1, derived,
    turbine: S.TURBINE_OPTS[patch.turbineIdx],
    compressor: S.COMPRESSOR_OPTS[patch.compressorIdx],
  });
  return {
    id: preset.id,
    name: preset.name,
    factory: preset.factory,
    peakHp: r.peakHp,
    peakTq: r.peakTq,
    peakHpRpm: r.points.reduce((a, b) => (b.hp > a.hp ? b : a)).rpm,
    peakTqRpm: r.points.reduce((a, b) => (b.torque > a.torque ? b : a)).rpm,
    maxDuty: Math.max(...r.points.map((p) => p.duty)),
    knockEvents: r.events.filter((e) => e.type === 'knock').length,
    curve: r.points.map((p) => ({ rpm: p.rpm, hp: p.hp, tq: p.torque })),
  };
});
process.stdout.write(JSON.stringify(out));
"""


def collect():
    """Run the JavaScript simulation and return its results as Python objects."""
    shim = REPO / ".preset-collect.mjs"
    shim.write_text(COLLECT_JS)
    try:
        proc = subprocess.run(
            ["node", str(shim)], cwd=REPO, capture_output=True, text=True, check=False
        )
        if proc.returncode != 0:
            sys.exit(f"simulation failed:\n{proc.stderr}")
        return json.loads(proc.stdout)
    finally:
        shim.unlink(missing_ok=True)


def rated_rpm(value):
    """Format a rating that may be a point or a plateau band."""
    return f"{value[0]}-{value[1]}" if isinstance(value, list) else str(value)


def in_band(peak, rated):
    if isinstance(rated, list):
        return rated[0] <= peak <= rated[1]
    return abs(peak - rated) <= 500


def report(results):
    print(f"{'engine':<26} {'sim whp':>8} {'target':>8} {'err':>7} "
          f"{'sim rpm':>8} {'rated':>11} {'knock':>6} {'duty':>6}")
    print("-" * 88)
    ok = True
    for r in results:
        target = r["factory"]["crankHp"] * DRIVETRAIN_EFF
        err = (r["peakHp"] - target) / target * 100
        rpm_ok = in_band(r["peakHpRpm"], r["factory"]["crankHpRpm"])
        row_ok = abs(err) <= 5 and rpm_ok and r["knockEvents"] == 0 and r["maxDuty"] < 90
        ok = ok and row_ok
        print(f"{r['name']:<26} {r['peakHp']:>8} {target:>8.0f} {err:>6.1f}% "
              f"{r['peakHpRpm']:>8} {rated_rpm(r['factory']['crankHpRpm']):>11} "
              f"{r['knockEvents']:>6} {r['maxDuty']:>5}% {'' if row_ok else '  <-- FIX'}")
    print()
    print("all presets within tolerance" if ok else "one or more presets need work")
    return ok


def plot(results):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        sys.exit("matplotlib not installed: pip install matplotlib")

    fig, axes = plt.subplots(1, len(results), figsize=(5 * len(results), 4), squeeze=False)
    for ax, r in zip(axes[0], results):
        rpm = [p["rpm"] for p in r["curve"]]
        ax.plot(rpm, [p["hp"] for p in r["curve"]], label="whp")
        ax.plot(rpm, [p["tq"] for p in r["curve"]], label="wlb-ft")
        target = r["factory"]["crankHp"] * DRIVETRAIN_EFF
        ax.axhline(target, linestyle="--", linewidth=1, label=f"factory {target:.0f} whp")
        ax.set_title(r["name"], fontsize=10)
        ax.set_xlabel("RPM")
        ax.legend(fontsize=8)
        ax.grid(alpha=0.3)
    fig.tight_layout()
    out = REPO / "preset-curves.png"
    fig.savefig(out, dpi=120)
    print(f"wrote {out}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plot", action="store_true", help="also write preset-curves.png")
    args = parser.parse_args()
    results = collect()
    ok = report(results)
    if args.plot:
        plot(results)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 7: Run it to see where each preset stands**

```bash
python3 scripts/analyze_presets.py
```
Expected: a table with a signed error percentage per preset, and `<-- FIX` beside any that miss.

**Expected error pattern.** The physics baseline is a Nissan VQ35DE Rev-Up (95.5 x 81.4 mm, 10.3:1), so accuracy degrades with distance from it. Predicted difficulty, easiest first: VQ35HR (same short block, should already be within a few percent) → N54 (same displacement class, different induction) → the two EA888.3 variants (half the displacement, heavily boosted, furthest from baseline). If the error does **not** follow that ordering, something is wrong with the preset data rather than with model reach.

- [ ] **Step 8: Ignore the generated plot output**

Add to `.gitignore`:

```
preset-curves.png
```

- [ ] **Step 9: Adjust preset DATA only, and re-measure**

For each preset outside tolerance, adjust **only the preset's own data** in `src/sim/presets.js` — these are genuine per-engine unknowns, not fudge factors:

- `induction.boost` — the published peak boost is known, but its shape across RPM is not
- `engine.camDuration` and `springRate` — real durations are not published in crank degrees comparable to this model
- `parts.exhaustDiaIdx` and `injectorIdx` — sizing choices
- `parts.octaneIdx` — the fuel the engine was rated on

Re-run `python3 scripts/analyze_presets.py` after each change. Work one preset at a time.

**Do not** change `coefficients.js` to make a single preset fit — a coefficient is global and would move every other engine and the fingerprint. If no data adjustment brings a preset inside tolerance, that is a real finding: stop, and take one of the two documented routes below.

- [ ] **Step 10: If a preset still cannot reach its figure**

Only these two resolutions are permitted:

1. **Adjust a coefficient** in `src/sim/coefficients.js`, if the miss reveals a genuine modelling error affecting all engines. This requires a written justification in the commit message and a reviewed fingerprint diff.
2. **Widen the tolerance** in `tests/presets.test.js`, with a comment in the test naming the preset, the achieved error, and why the model cannot do better.

A per-engine multiplier is not an option. `src/sim/airflow.js:5-7` forbids it, and the spec commits against it.

- [ ] **Step 11: Run the full suite**

```bash
npm test
```
Expected: PASS, all suites including every factory-figure assertion. The fingerprint should be untouched — this task adds a new module and no fingerprint configuration references presets.

- [ ] **Step 12: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/sim/presets.js src/sim/index.js tests/presets.test.js scripts/analyze_presets.py .gitignore
git commit -m "Add engine presets with generated, validated factory calibrations

Four real engines with published specifications, each sourced inline. The
calibration is generated from the physics rather than hand-authored: VE from the
hardware, fuel from best-power lambda above the open-loop threshold, and spark
at MBT or the knock limit minus a 2-degree factory margin — which is what a
production calibration actually is.

Every preset validates against its real published rating, so 'factory
calibration' is a falsifiable claim rather than a label. A Python harness
compares whole curves, not just peaks, since an engine can hit peak power with
entirely the wrong curve shape.

Only per-engine unknowns were adjusted to reach those figures: boost curve
shape, cam duration, spring rate and part sizing. No coefficient was bent to fit
a single engine and no per-engine multiplier was added."
```

---

### Task 7: Preset picker in the UI

**Files:**
- Modify: `src/ui/EcuLab.jsx` (imports, state, `setCfg`, `engineName`, Engine Architecture section)

**Interfaces:**
- Consumes: `ENGINE_PRESETS`, `applyPreset`, `presetById` from Task 6
- Produces: no exported interface — this is the top of the application

- [ ] **Step 1: Import the presets**

In `src/ui/EcuLab.jsx`, add to the existing `src/sim` import block:

```js
  ENGINE_PRESETS, applyPreset, presetById,
```

- [ ] **Step 2: Add preset state**

Beside the other `useState` declarations near line 524:

```js
  const [presetId, setPresetId] = useState(null);
  const [presetPrompt, setPresetPrompt] = useState(null);
```

- [ ] **Step 3: Clear the preset badge on any manual engine edit**

`setCfg` is what every Engine Architecture control calls. Find it and make it clear `presetId`, so the UI never claims to be a stock N54 after the player has moved a slider:

```js
  const setCfg = (patch) => {
    setEngineConfig((c) => ({ ...c, ...patch }));
    // Any hand edit means this is no longer a factory engine. Say so rather than
    // continuing to display a name the build no longer matches.
    setPresetId(null);
  };
```

- [ ] **Step 4: Add the apply handler**

Near `resetToStock`:

```js
  /** Whether the player has calibration work a preset would overwrite. */
  const hasTuningWork = () => pullCount > 0;

  const applyEnginePreset = (preset) => {
    const p = applyPreset(preset);
    setEngineConfig(p.engineConfig);
    setMods(p.mods);
    setTurboOn(p.turboOn);
    setBoostCurve(p.boostCurve);
    setTurbineIdx(p.turbineIdx);
    setCompressorIdx(p.compressorIdx);
    setInjIdx(p.injIdx);
    setEcuInjectorCc(p.ecuInjectorCc);
    setOctaneIdx(p.octaneIdx);
    setExhaustDiaIdx(p.exhaustDiaIdx);
    setVe(p.ve);
    setTiming(p.timing);
    setAfr(p.afr);
    setMafScalar(1.0);
    setPresetId(p.presetId);
    setSelection(null);
    setPresetPrompt(null);
  };

  const choosePreset = (preset) => {
    if (hasTuningWork()) setPresetPrompt(preset);
    else applyEnginePreset(preset);
  };
```

- [ ] **Step 5: Show the preset name in the header**

Replace `engineName` (line 978):

```js
  const activePreset = presetId ? presetById(presetId) : null;
  const engineName = activePreset
    ? activePreset.name
    : `${engineDerived.displacementL.toFixed(1)}L ${engineConfig.configuration}`;
```

- [ ] **Step 6: Render the picker at the top of Engine Architecture**

Immediately inside the Engine Architecture `<BuildSection>`, before the existing displacement `<Panel>`:

```jsx
              <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Start From a Real Engine</div>
              <PickList
                options={[
                  ...ENGINE_PRESETS.map((p) => ({ label: `${p.name} · ${p.factory.crankHp} hp`, value: p.id })),
                  { label: 'Custom build', value: '__custom__' },
                ]}
                value={presetId ?? '__custom__'}
                onChange={(v) => {
                  if (v === '__custom__') { setPresetId(null); return; }
                  const p = ENGINE_PRESETS.find((e) => e.id === v);
                  if (p) choosePreset(p);
                }}
              />
              {activePreset && (
                <Panel tight style={{ marginBottom: 13 }}>
                  <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.55, marginBottom: 8 }}>{activePreset.blurb}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ink2, marginBottom: 4, fontWeight: 600 }}>
                    <span>FACTORY RATING</span>
                    <span style={{ color: T.ink, fontWeight: 800, fontFamily: T.mono }}>
                      {activePreset.factory.crankHp} hp · {activePreset.factory.crankTq} lb-ft
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ink2, fontWeight: 600 }}>
                    <span>YOUR LAST PULL</span>
                    <span style={{ color: result ? T.amberInk : T.ink3, fontWeight: 800, fontFamily: T.mono }}>
                      {result ? `${result.peakHp} whp · ${result.peakTq} lb-ft` : 'no pull logged'}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 7, lineHeight: 1.5 }}>
                    Factory figures are at the crank; the dyno here reads at the wheels, so expect roughly 15% less. The factory calibration is deliberately conservative — beating it is the exercise.
                  </div>
                </Panel>
              )}
              {!presetId && engineConfig.redline !== undefined && (
                <Note>Custom build — every value below is yours to set. Pick a real engine above to start from a known-good factory configuration instead.</Note>
              )}
              {presetPrompt && (
                <div style={{ background: T.panel2, border: `1px solid ${T.amber}`, borderRadius: 10, padding: '11px 13px', margin: '4px 0 10px' }}>
                  <div style={{ fontSize: 12, color: '#a5aebb', lineHeight: 1.5, marginBottom: 9 }}>
                    <b style={{ color: T.amberInk }}>This replaces your current tune.</b> Loading {presetPrompt.name} overwrites your VE, spark and fuel tables with its factory calibration. Your career stats are kept.
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => applyEnginePreset(presetPrompt)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: T.amber, color: '#2a1206', fontWeight: 800, fontSize: 12 }}>
                      LOAD {presetPrompt.name.toUpperCase()}
                    </button>
                    <button onClick={() => setPresetPrompt(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel, color: T.ink2, fontWeight: 700, fontSize: 12 }}>
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
```

- [ ] **Step 7: Verify in the running app**

```bash
npm run dev
```

Check by hand:
1. BUILD → Engine Architecture shows four engines plus "Custom build".
2. Selecting **BMW N54** sets 2.98 L I6, turbo on, boost peaking at 8.7 psi, and the header reads "BMW N54".
3. Running a pull on DYNO produces roughly 255 whp with no knock events.
4. Moving the bore slider flips the header back to "3.0L I6" and the picker to "Custom build".
5. With a pull logged, selecting a different preset shows the overwrite warning; CANCEL leaves everything untouched.
6. The GTI preset's tach and pull both stop at 6500.

- [ ] **Step 8: Run the full suite, lint, typecheck, commit**

```bash
npm test && npm run lint && npm run typecheck
git add src/ui/EcuLab.jsx
git commit -m "Add the engine preset picker to BUILD

Four real engines selectable at the top of Engine Architecture, each loading its
hardware and factory calibration in one action. The header shows the engine's
name while it is stock and reverts to a generic description the moment any
slider moves, so the app never claims to be a stock N54 that isn't one.

A factory-rating panel shows the published figure against the player's last
pull, which is the whole point of the feature: the factory number is the target
to beat."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Four presets with published specs | 6 |
| `presets.js` module, `applyPreset` | 6 |
| Boost curves via `RPM.map` | 6 (data), 1 (enforcement) |
| Calibration authenticity / reconstruction | 6 (docs), 7 (validation) |
| Derived calibration, VE → FUEL → SPARK | 6 |
| `knockThreshold` extraction | 3 |
| I6 + main bearings + balance shafts | 4 |
| Baseline anchored at V6 | 4, Step 9 |
| Per-engine redline | 5 |
| UI picker, preset-aware naming, factory panel, overwrite warning | 7 |
| Bug 1: Tuning Score | 2 |
| Bug 2: dead argument | 1 |
| Bug 3: boost validation | 1 |
| Bug 4: frozen defaults | 1 |
| `tests/presets.test.js` | 6 |
| Point vs band ratings | 6 (data), 6 (test) |
| Fingerprint refresh with reviewed diff | 2, 4, 5 |
| Python harness | 6 |

No gaps.

**Placeholder scan:** No TBD, TODO, "similar to Task N", or "add error handling" steps. Every code step contains complete code.

**Type consistency:** `applyPreset` returns the same field names consumed in Task 6's harness and Task 7's handler (`presetId`, `engineConfig`, `boostCurve`, `injIdx`, `ecuInjectorCc`, `octaneIdx`, `exhaustDiaIdx`, `turbineIdx`, `compressorIdx`, `ve`, `timing`, `afr`). `knockThreshold`'s parameter object is identical in Task 3's definition, Task 3's test, and Task 6's caller. `rubbingFmepPa(rpm, springPa, arch)` matches between Task 4's definition and both call sites. `bearingFmepPa` and `balanceShaftFrac` are spelled consistently across `engine.js`, `friction.js`, `point.js` and `live.js`.

**Task sizing note:** Task 6 is deliberately the largest task here, covering both the calibration generator and the fitting of preset data to real figures. These were originally separate tasks, merged because splitting them would have left one intentionally-red commit mid-branch. A generator that produces wrong numbers is not a working generator, so the two are not independently reviewable in any case.

**Every commit on this branch leaves `npm test` green.**
