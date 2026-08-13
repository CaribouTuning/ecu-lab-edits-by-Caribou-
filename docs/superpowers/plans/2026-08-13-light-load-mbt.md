# Light-Load MBT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `mbtTiming`'s 6-degree linear load term with a burn-duration model so light-load MBT reaches the 40-50° real calibrations use, then bound the spark advisor by it so it stops recommending 165° of advance.

**Architecture:** `mbtTiming` in `src/sim/knock.js` becomes a burn-duration calculation — spark-to-50%-mass-fraction-burned in crank degrees, growing as the charge thins — with its five constants in `src/sim/coefficients.js`. `calibrationAdvice` in `src/sim/advisors.js` then adopts the `min(knockLimit, MBT)` pattern the factory calibration generator already uses at `presets.js:283`, and splits its "too much advance" classification into a dangerous case and a merely-wasteful one. `EcuLab.jsx` grows one panel for the new case.

**Tech Stack:** Plain ES modules, no framework in `src/sim/`. Vitest. React 18 for the one UI change. Node 20+.

## Global Constraints

Copied from `CONTRIBUTING.md` and the spec. Every task's requirements implicitly include these:

- **Nothing adds horsepower.** Every change must alter airflow, pressure, temperature or fuel delivery and let power fall out of the physics.
- **No bare magic numbers anywhere in `src/sim/` outside `coefficients.js`**, and every coefficient carries a comment explaining what it represents.
- **JSDoc on anything exported from `src/sim/`.**
- **Intent tests assert direction and relationship, never exact magnitudes.** Magnitudes belong to the fingerprint. Never write `expect(hp).toBe(235)` in `tests/physics.test.js`.
- **The app never silently rewrites the player's spark or fuel tables.** The advisors report the gap; they do not close it.
- **Comments explain why, not what.** This is a teaching codebase; keep the existing thoroughness.
- **Never update the fingerprint fixture just to make CI green.**
- Match surrounding code style — deliberately plain, no clever abstractions.
- Baseline before any change: `npm test` = **158 tests passing across 6 files**.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/sim/coefficients.js` | All empirical numbers | Add 6 burn-duration coefficients |
| `src/sim/knock.js` | Knock envelope + MBT | Rewrite `mbtTiming` body; JSDoc |
| `src/sim/advisors.js` | Report calibration gaps | Bound `suggested`; add `pastMbt` |
| `src/sim/point.js` | One operating point | `bsfc` returns `null` at non-positive power |
| `src/ui/EcuLab.jsx` | The whole UI | One panel for `pastMbt` cells |
| `tests/physics.test.js` | Intent tests | Extend `MBT timing` describe; advisor tests |
| `tests/live.test.js` | **New** — first `liveStep` coverage | Idle-holds test |
| `tests/fixtures/fingerprint.sha256` | Behavioural baseline | Regenerated last |

---

### Task 1: Capture the pre-change fingerprint report

This must run on the **unmodified** base. `CONTRIBUTING.md` requires diffing a before/after report to explain what moved. Once you have edited anything, the "before" is unrecoverable without stashing.

**Files:**
- Create: `/tmp/fingerprint.before.json` (outside the repo; the in-repo report is gitignored)

- [ ] **Step 1: Confirm you are on a clean base**

```bash
git status --short
```

Expected: no output. If anything is listed, stop and resolve it first.

- [ ] **Step 2: Confirm the baseline suite is green**

```bash
npm test 2>&1 | tail -6
```

Expected: `Test Files  6 passed (6)` and `Tests  158 passed (158)`.

- [ ] **Step 3: Generate and stash the "before" report**

```bash
node scripts/update-fingerprint.js --report
cp fingerprint.report.json /tmp/fingerprint.before.json
git checkout tests/fixtures/fingerprint.sha256 2>/dev/null || true
git status --short
```

Expected: `git status --short` prints nothing — the script may rewrite the fixture, and Step 3 puts it back. You are only keeping the report.

No commit for this task; it produces a scratch artifact only.

---

### Task 2: The burn-duration MBT model

**Files:**
- Modify: `src/sim/coefficients.js:36-42` (insert a new block after the combustion roll-off block)
- Modify: `src/sim/knock.js:16-28` (`mbtTiming`)
- Test: `tests/physics.test.js:437-445` (the existing `MBT timing` describe)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `mbtTiming(rpm: number, mapKpa: number) => number` — unchanged signature, new behaviour. Returns degrees BTDC, always within `[COEFF.MBT_MIN_DEG, COEFF.MBT_MAX_DEG]`. Tasks 3 and 5 depend on this.

- [ ] **Step 1: Write the failing tests**

Replace the entire `describe('MBT timing', ...)` block at the end of `tests/physics.test.js` (currently lines 437-445) with:

```js
describe('MBT timing', () => {
  it('needs more advance at higher RPM', () => {
    expect(S.mbtTiming(7000, S.BARO_KPA)).toBeGreaterThan(S.mbtTiming(2000, S.BARO_KPA));
  });

  it('needs less advance at higher load, because a denser charge burns faster', () => {
    expect(S.mbtTiming(5000, 200)).toBeLessThan(S.mbtTiming(5000, 40));
  });

  // The defect this model was written to fix: the old linear term spanned only 6
  // degrees across the whole load range, so it put cruise MBT around 25 deg. Real
  // factory cruise maps carry 40-50, because a thin charge burns slowly and must be
  // lit much earlier. See knock.js's own comment on the light-load knock margin.
  it('puts cruise MBT in the 40-50 deg band real calibrations use', () => {
    const cruise = S.mbtTiming(2500, 20);
    expect(cruise).toBeGreaterThan(40);
    expect(cruise).toBeLessThan(50);
  });

  it('spans far more than the old six degrees between cruise and wide-open throttle', () => {
    const span = S.mbtTiming(2500, 20) - S.mbtTiming(2500, S.BARO_KPA);
    expect(span).toBeGreaterThan(15);
  });

  it('leaves wide-open-throttle MBT where it was, so NA dyno power does not move', () => {
    // The burn model is calibrated to reproduce the old curve exactly at atmospheric
    // pressure. This is what keeps the change off the headline number.
    expect(S.mbtTiming(5500, S.BARO_KPA)).toBeCloseTo(26.0, 1);
    expect(S.mbtTiming(1500, S.BARO_KPA)).toBeCloseTo(18.0, 1);
  });

  it('never leaves the range a production calibration could use', () => {
    for (const rpm of [500, 800, 2500, 5500, 9000]) {
      for (const map of [5, 20, 40, 101.325, 150, 300]) {
        const mbt = S.mbtTiming(rpm, map);
        expect(mbt).toBeGreaterThanOrEqual(S.COEFF.MBT_MIN_DEG);
        expect(mbt).toBeLessThanOrEqual(S.COEFF.MBT_MAX_DEG);
      }
    }
  });

  it('stays finite at zero manifold pressure', () => {
    expect(Number.isFinite(S.mbtTiming(2500, 0))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/physics.test.js -t "MBT timing"`

Expected: FAIL. `puts cruise MBT in the 40-50 deg band` fails with received `24.8`; `spans far more than the old six degrees` fails with received ~`6.8`; `never leaves the range` fails with `Cannot read properties of undefined` because `COEFF.MBT_MIN_DEG` does not exist yet. The first two tests and the WOT test pass already — that is expected and correct, they are the behaviour being preserved.

- [ ] **Step 3: Add the coefficients**

In `src/sim/coefficients.js`, insert this block immediately after the `EFFICIENCY_FLOOR: 0.55,` line (currently line 42), before the `// --- Knock envelope` comment:

```js

  // --- Burn duration, which is what MBT actually tracks ---
  // MBT is not a curve fitted to a dyno; it is the advance that puts 50% of the mass
  // fraction burned just after TDC, where the expansion stroke can still use the
  // pressure. So model the burn and derive the timing from it.
  //
  // The interval from spark to 50% MFB, in crank degrees, at 1500 rpm and atmospheric
  // pressure. Combined with MFB50_ATDC_DEG below this reproduces the old model's
  // wide-open-throttle numbers exactly, which is deliberate: the light-load end was
  // wrong, the WOT end was not, and NA dyno power must not move.
  BURN_REF_DEG: 26.5,
  // Extra crank degrees of burn per 6000 rpm. Turbulence speeds the burn up in real
  // time as the engine spins faster, but not fast enough to keep pace with the crank,
  // so the burn occupies more DEGREES the higher you rev.
  BURN_RPM_GAIN: 12,
  // How sharply a thinning charge slows the burn, as an exponent on the inverse
  // pressure ratio. A part-throttle charge is dilute and low in turbulence, so its
  // flame travels slowly and must be lit much earlier — which is exactly why factory
  // cruise maps carry 40-50 deg of advance and never complain. 0.36 puts 20 kPa cruise
  // at ~43 deg while leaving atmospheric untouched.
  BURN_DILUTION_EXP: 0.36,
  // Lowest pressure ratio the burn model will extrapolate to. Below this the inverse
  // law runs away, and no engine operates there under power anyway.
  BURN_RATIO_FLOOR: 0.05,
  // Where 50% of the charge should have burned, in degrees AFTER top dead center.
  // Textbook optimum is 8-10 deg ATDC across a wide range of engines.
  MFB50_ATDC_DEG: 8.5,
  // The range a production spark table could actually command. The burn model is an
  // extrapolation at its extremes; these stop it producing timing no calibration would
  // ever contain.
  MBT_MIN_DEG: 10,
  MBT_MAX_DEG: 50,
```

- [ ] **Step 4: Rewrite `mbtTiming`**

In `src/sim/knock.js`, replace the whole `mbtTiming` function and its JSDoc (currently lines 16-28) with:

```js
/**
 * Minimum spark for best torque, degrees BTDC.
 *
 * Derived from burn duration rather than fitted directly. Combustion takes a roughly
 * fixed number of crank degrees for a given charge, so the timing that extracts the
 * most work is the one that lands 50% mass-fraction-burned just after TDC — early
 * enough that peak pressure arrives while the piston can still be pushed on, late
 * enough that it is not fighting the crank on the way up.
 *
 * Two things stretch the burn out. Revs: the flame does not speed up in proportion to
 * engine speed, so it occupies more DEGREES the faster you spin. And dilution: a
 * part-throttle charge is thin and slow-burning, which is why a factory cruise map
 * carries 40-50 degrees of advance and never knocks, while the same engine at wide-open
 * throttle wants barely half that.
 *
 * @param {number} rpm engine speed
 * @param {number} mapKpa manifold absolute pressure, kPa
 * @returns {number} degrees BTDC, within [COEFF.MBT_MIN_DEG, COEFF.MBT_MAX_DEG]
 */
export function mbtTiming(rpm, mapKpa) {
  const pressureRatio = Math.max(mapKpa / BARO_KPA, COEFF.BURN_RATIO_FLOOR);
  // Crank degrees from spark to 50% mass fraction burned.
  const theta50 = (COEFF.BURN_REF_DEG + ((rpm - 1500) / 6000) * COEFF.BURN_RPM_GAIN)
    * Math.pow(1 / pressureRatio, COEFF.BURN_DILUTION_EXP);
  return clamp(theta50 - COEFF.MFB50_ATDC_DEG, COEFF.MBT_MIN_DEG, COEFF.MBT_MAX_DEG);
}
```

`clamp`, `COEFF` and `BARO_KPA` are already imported at the top of `knock.js` — no import changes needed.

- [ ] **Step 5: Run the MBT tests to verify they pass**

Run: `npx vitest run tests/physics.test.js -t "MBT timing"`

Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full physics suite to see what else moved**

Run: `npx vitest run tests/physics.test.js`

Expected: PASS. If a test outside `MBT timing` fails, do **not** adjust it to fit. Stop and use `superpowers:systematic-debugging` — a broken intent test means a real modelling assumption changed and you need to know which.

- [ ] **Step 7: Commit**

```bash
git add src/sim/coefficients.js src/sim/knock.js tests/physics.test.js
git commit -m "Derive MBT from burn duration instead of a six-degree load term

The old load term spanned only 6 degrees across the whole 0-101 kPa
range, which put cruise MBT near 25 degrees. Real factory maps carry
40-50 there, because a thin part-throttle charge burns slowly and has to
be lit far earlier. knock.js already said so in its own comment about
light-load knock margin, while mbtTiming contradicted it.

Modelling the burn and placing 50% MFB just after TDC gets that end
right. The coefficients are calibrated to reproduce the old curve exactly
at atmospheric pressure, so naturally aspirated dyno power does not move."
```

---

### Task 3: Bound the spark advisor and split its classification

**Files:**
- Modify: `src/sim/advisors.js:9-15` (imports), `:101-116` (the suggestion and the filters), `:76-78` (JSDoc)
- Test: `tests/physics.test.js` (new describe block, append at end of file)

**Interfaces:**
- Consumes: `mbtTiming(rpm, mapKpa)` from Task 2.
- Produces: `calibrationAdvice(...)` now returns `{spark, fuelAdv, overAdvanced, underAdvanced, pastMbt, wrongMix}`. Each `spark` entry gains `mbt: number` and `knockLimited: boolean`. Task 4 renders `pastMbt`.

- [ ] **Step 1: Write the failing tests**

Append to the end of `tests/physics.test.js`:

```js
describe('the spark advisor', () => {
  /** Advice for a stock, naturally aspirated build on its own factory tables. */
  function advice(overrides = {}) {
    return S.calibrationAdvice({
      ve: S.DEFAULT_VE, veTruth: S.DEFAULT_VE, timing: S.DEFAULT_TIMING, afr: S.DEFAULT_AFR,
      derived: S.deriveEngine(STOCK), octaneBonus: S.OCTANE_OPTS[0].bonus,
      fuel: S.OCTANE_OPTS[0], mods: NO_MODS, turboOn: false, boostCurve: S.DEFAULT_BOOST,
      compressor: S.COMPRESSOR_OPTS[1], turbine: S.TURBINE_OPTS[1],
      injectorCc: 315, ecuInjectorCc: 315, mafScalar: 1, mafErrorBase: 1,
      ...overrides,
    });
  }

  // The defect from issue #4: at 20 kPa the knock limit runs past 160 deg, and the
  // advisor was handing that straight to the player as a spark recommendation.
  it('never recommends more advance than the charge can actually use', () => {
    for (const c of advice().spark) {
      expect(c.suggested).toBeLessThanOrEqual(c.mbt + 0.5);
    }
  });

  it('never recommends more advance than a production table could hold', () => {
    for (const c of advice().spark) {
      expect(c.suggested).toBeLessThanOrEqual(50);
      expect(c.suggested).toBeGreaterThanOrEqual(5);
    }
  });

  it('still respects the knock limit where knock is what binds', () => {
    // Under boost the knock limit falls below MBT, and it must be the one that wins.
    const boosted = advice({ turboOn: true, boostCurve: S.RPM.map(() => 12) });
    const knockBound = boosted.spark.filter((c) => c.knockLimited);
    expect(knockBound.length).toBeGreaterThan(0);
    for (const c of knockBound) expect(c.suggested).toBeLessThan(c.mbt);
  });

  it('does not call a stock calibration dangerous', () => {
    // The red panel means "your hardware will not tolerate this". A factory tune on
    // factory hardware must never trip it.
    expect(advice().overAdvanced).toHaveLength(0);
  });

  it('separates advance that is dangerous from advance that is merely wasted', () => {
    const a = advice();
    // A cell past the knock limit is reported as dangerous only, never as both.
    const ids = (arr) => new Set(arr.map((c) => `${c.ri}:${c.ci}`));
    const over = ids(a.overAdvanced), past = ids(a.pastMbt);
    for (const id of over) expect(past.has(id)).toBe(false);
  });

  it('reports the stock light-load cells as past peak torque, not as knock risk', () => {
    // The stock table runs 40-47 deg at 20 kPa where MBT is in the low 40s, so a few
    // of those cells genuinely are past MBT — but the knock limit there is over 100,
    // so none of them are dangerous.
    const a = advice();
    expect(a.pastMbt.length).toBeGreaterThan(0);
    for (const c of a.pastMbt) expect(c.knockLimited).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/physics.test.js -t "the spark advisor"`

Expected: FAIL. `never recommends more advance than the charge can actually use` fails because `c.mbt` is `undefined`; `separates advance` and `reports the stock light-load cells` fail because `a.pastMbt` is `undefined`.

- [ ] **Step 3: Import `mbtTiming` in the advisor**

In `src/sim/advisors.js`, change the knock import line (currently there is none — the file imports `evaluatePoint` but not the knock module). Add after the `import { interp1 } from './math.js';` line:

```js
import { mbtTiming } from './knock.js';
```

Keep the import block alphabetically ordered as the file already has it: `airflow`, `knock`, `math`, `manifold`, `point`, `tables`. So the final order is:

```js
import { BARO_KPA, PSI_TO_KPA } from './constants.js';
import { computeHardwareVE } from './airflow.js';
import { mbtTiming } from './knock.js';
import { interp1 } from './math.js';
import { computeManifold } from './manifold.js';
import { evaluatePoint } from './point.js';
import { LOAD, RPM } from './tables.js';
```

- [ ] **Step 4: Bound the suggestion**

In `src/sim/advisors.js`, replace these three lines (currently 101-105):

```js
      // Leave ~1.5 deg of safety under the calculated knock limit, as a tuner would.
      const safeTiming = Math.round((pt.threshold - 1.5) * 2) / 2;
      spark.push({
        ri, ci, rpm, map: mapRow, current: timing[ri][ci], suggested: safeTiming,
        delta: Number((safeTiming - timing[ri][ci]).toFixed(1)), knocking: pt.knock,
      });
```

with:

```js
      // Two different ceilings bind here, and only one of them is dangerous.
      //
      // Knock is the hard one: past it the engine is damaging itself, so leave ~1.5
      // deg of safety under the calculated limit, as a tuner would.
      //
      // MBT is the soft one: past it the burn is already landing where it should, so
      // more advance buys nothing and only moves you toward the hard ceiling. At light
      // load the knock limit is enormous — a cylinder in deep vacuum effectively cannot
      // knock — and recommending against it alone produced advice like "run 165 deg at
      // 20 kPa". Whichever ceiling is lower is the real one.
      //
      // This is the same rule `factoryCalibration` writes its spark table with; see
      // presets.js. The two must not disagree about what good timing looks like.
      const knockCeiling = pt.threshold - KNOCK_SAFETY_DEG;
      const mbt = mbtTiming(rpm, useMap);
      const knockLimited = knockCeiling < mbt;
      const safeTiming = clamp(
        Math.round(Math.min(knockCeiling, mbt) * 2) / 2,
        SPARK_TABLE_MIN_DEG, SPARK_TABLE_MAX_DEG,
      );
      spark.push({
        ri, ci, rpm, map: mapRow, current: timing[ri][ci], suggested: safeTiming,
        delta: Number((safeTiming - timing[ri][ci]).toFixed(1)), knocking: pt.knock,
        mbt: Number(mbt.toFixed(1)), knockLimited,
      });
```

- [ ] **Step 5: Add the three module constants**

`advisors.js` is in `src/ui`'s sibling `src/sim/`, so bare literals are not allowed. But these are UI-reporting thresholds rather than physics, and the file already holds `WOT_ROW` and `VE_NOTABLE_PCT` locally for the same reason. Follow that established local pattern. Add after the `VE_NOTABLE_PCT` declaration (currently line 20):

```js

/** Safety left under the calculated knock limit when advising, degrees. */
const KNOCK_SAFETY_DEG = 1.5;

/**
 * The spark table's own editable range, degrees BTDC. A suggestion outside it could
 * not be applied, so there is no point offering one. Matches the bounds
 * `factoryCalibration` clamps to in presets.js.
 */
const SPARK_TABLE_MIN_DEG = 5;
const SPARK_TABLE_MAX_DEG = 50;

/** A cell must sit more than this far past a ceiling before it is worth reporting. */
const ADVANCE_TOLERANCE_DEG = 1.0;
```

Add `clamp` to the math import so it reads:

```js
import { clamp, interp1 } from './math.js';
```

- [ ] **Step 6: Split the classification**

Replace the filter lines and the return (currently 113-116):

```js
  const overAdvanced = spark.filter((c) => c.delta < -1.0);
  const underAdvanced = spark.filter((c) => c.delta > 3.0);
  const wrongMix = fuelAdv.filter((c) => c.map >= 85 && Math.abs(c.delta) > 0.45);
  return { spark, fuelAdv, overAdvanced, underAdvanced, wrongMix };
```

with:

```js
  // Past the knock limit is a damage risk. Past MBT is only wasted effort — the burn
  // is already landing where it should, so the extra advance buys no torque. Reporting
  // them as one category would either cry wolf about a safe cruise cell or say nothing
  // about a genuinely dangerous one.
  const tooMuch = spark.filter((c) => c.delta < -ADVANCE_TOLERANCE_DEG);
  const overAdvanced = tooMuch.filter((c) => c.knockLimited);
  const pastMbt = tooMuch.filter((c) => !c.knockLimited);
  const underAdvanced = spark.filter((c) => c.delta > 3.0);
  const wrongMix = fuelAdv.filter((c) => c.map >= 85 && Math.abs(c.delta) > 0.45);
  return { spark, fuelAdv, overAdvanced, underAdvanced, pastMbt, wrongMix };
```

- [ ] **Step 7: Update the JSDoc return type**

Replace the `@returns` line in `calibrationAdvice`'s JSDoc (currently line 78):

```js
 * @returns {{spark: object[], fuelAdv: object[], overAdvanced: object[], underAdvanced: object[], pastMbt: object[], wrongMix: object[]}}
```

- [ ] **Step 8: Run the advisor tests to verify they pass**

Run: `npx vitest run tests/physics.test.js -t "the spark advisor"`

Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add src/sim/advisors.js tests/physics.test.js
git commit -m "Bound the spark advisor by MBT, and stop calling safe cells dangerous

The advisor recommended timing straight off the knock limit. In deep
vacuum a cylinder effectively cannot knock, so that limit runs past 160
degrees and the advisor was telling players to run 165 at 20 kPa, while
flagging 24 of 32 cells on a correct stock tune as leaving torque on the
table.

Past MBT the burn already lands where it should, so whichever ceiling is
lower is the real one. That is the rule factoryCalibration already writes
its spark table with; the advisor simply never adopted it.

Splitting the report follows from the same distinction: past the knock
limit is a damage risk, past MBT is only wasted effort, and the red
warning should mean the first one."
```

---

### Task 4: Report past-MBT cells in the UI

**Files:**
- Modify: `src/ui/EcuLab.jsx:1776-1800` (the spark advice panel chain)

**Interfaces:**
- Consumes: `calAdvice.pastMbt` from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the panel**

In `src/ui/EcuLab.jsx`, the advice block is a three-way chain: `overAdvanced` (red) → `underAdvanced > 4` (amber) → all-clear (green). Insert a fourth branch for `pastMbt` between the `underAdvanced` branch and the green one.

Replace the `underAdvanced` branch and the green fallback (currently lines 1792-1800):

```jsx
              ) : calAdvice.underAdvanced.length > 4 ? (
                <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12, color: '#a5aebb', lineHeight: 1.5 }}>
                  <b style={{ color: T.amberInk }}>Timing left on the table.</b> {calAdvice.underAdvanced.length} cells are more than 3° below what this build would tolerate. Safe, but you are giving away torque — advance them a little at a time and pull between each change.
                </div>
              ) : calAdvice.pastMbt.length > 0 ? (
                <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12, color: '#a5aebb', lineHeight: 1.5 }}>
                  <b style={{ color: T.amberInk }}>Past peak torque.</b> {calAdvice.pastMbt.length} cells command more advance than the burn can use — the charge is already finishing where it should, so the extra degrees buy nothing. Not dangerous here: the knock limit at this load is a long way above. Pulling them back costs no power and buys margin.
                </div>
              ) : (
                <div style={{ background: T.greenBg, border: '1px solid #1f4a30', borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12.5, color: T.green }}>
                  Spark table sits within the knock limit for this hardware.
                </div>
              )}
```

Note the ordering rationale: `underAdvanced` stays ahead of `pastMbt` because giving away torque is the more actionable message, and the two can co-occur across different rows of the same table.

- [ ] **Step 2: Verify it builds and lints**

Run: `npm run lint && npm run build`

Expected: both succeed. `npm run lint` currently emits hook-dependency warnings that do not fail the command (issue #26); a warning count identical to the baseline is fine, a new **error** is not.

- [ ] **Step 3: Commit**

```bash
git add src/ui/EcuLab.jsx
git commit -m "Report cells that are past MBT rather than past the knock limit

The red panel means the hardware will not tolerate the advance. A cruise
cell sitting a few degrees past MBT with a 100-degree knock limit is not
that, and saying so taught the wrong lesson. It gets its own message,
next to the MBT explainer that already covers the concept."
```

---

### Task 5: Stop BSFC reporting zero as if it were a reading

**Files:**
- Modify: `src/sim/point.js:150`, `:180`
- Test: `tests/physics.test.js` (new describe block, append at end)

**Interfaces:**
- Consumes: nothing.
- Produces: the point record's `bsfc` field becomes `number | null`.

**Note on scope:** the spec inherited "render as —" from the issue, but `bsfc` is not displayed anywhere in the UI and never has been (`git log -S"bsfc" -- src/ui/EcuLab.jsx` is empty). There is therefore no render site to change. The fix is the record itself: a consumer that reads `bsfc` must not be handed a fabricated `0`.

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.js`:

```js
describe('BSFC reporting', () => {
  it('reports a real figure whenever the engine is making power', () => {
    const p = point({ rpm: 5500, mapKpa: S.BARO_KPA });
    expect(p.hp).toBeGreaterThan(0);
    expect(p.bsfc).toBeGreaterThan(0);
  });

  // A BSFC of 0.000 lb/hr/hp would be an engine making power from no fuel. On overrun
  // and at deep vacuum the engine is being motored, and there is no such thing as a
  // brake-specific figure there — the honest answer is "no reading", not zero.
  it('reports no reading at all when the engine is not making power', () => {
    const motoring = point({ rpm: 2500, mapKpa: 20, veVal: 42, timingVal: 40, afrCommanded: 14.7 });
    expect(motoring.hp).toBeLessThanOrEqual(0);
    expect(motoring.bsfc).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/physics.test.js -t "BSFC reporting"`

Expected: FAIL on the second test — `expected 0 to be null`.

- [ ] **Step 3: Return null instead of zero**

In `src/sim/point.js`, replace line 150:

```js
  const bsfc = powerW > 0 ? (burnedFuelG * derived.cyl * (rpm / 2) * 60 / 453.6) / (powerW / 745.7) : 0;
```

with:

```js
  // Brake-specific fuel consumption is fuel per unit of work OUT. On overrun and in
  // deep vacuum there is no work out — the engine is being motored — so the quantity is
  // undefined, not zero. Zero would read as an engine making power from no fuel.
  const bsfc = powerW > 0 ? (burnedFuelG * derived.cyl * (rpm / 2) * 60 / 453.6) / (powerW / 745.7) : null;
```

- [ ] **Step 4: Guard the rounding in the returned record**

Line 180 currently reads `bsfc: Number(bsfc.toFixed(3)),` inside the return object, which will throw on `null`. Change that one field to:

```js
    fmep: Number((fmepPa / 100000).toFixed(2)), bsfc: bsfc === null ? null : Number(bsfc.toFixed(3)),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/physics.test.js -t "BSFC reporting"`

Expected: PASS, 2 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: success. `evaluatePoint`'s JSDoc declares `@returns {object}`, so the nullable field needs no signature change. If `tsc` reports an error on a `bsfc` consumer, fix the consumer rather than reverting to `0`.

- [ ] **Step 7: Commit**

```bash
git add src/sim/point.js tests/physics.test.js
git commit -m "Report no BSFC reading instead of zero when the engine makes no power

The guard against dividing by non-positive power is right; the sentinel
was not. 0.000 lb/hr/hp describes an engine making power from no fuel,
and at idle and on overrun that value sat in the record looking like a
measurement."
```

---

### Task 6: Prove the live engine still idles

The change moves light-load timing efficiency, and the live engine idles at light load. `liveStep` has **zero** test coverage today (issue #8), so this is the first test of it.

**Files:**
- Create: `tests/live.test.js`

**Interfaces:**
- Consumes: `mbtTiming` behaviour from Task 2, via `liveStep`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test**

Create `tests/live.test.js`:

```js
/**
 * Live-engine tests.
 *
 * `liveStep` integrates crank dynamics in time rather than solving a steady-state
 * point, so it can fail in ways the dyno sweep never will — most obviously by stalling.
 * These tests exist because the light-load MBT model moved idle timing efficiency, and
 * the idle controller has to be able to catch that.
 *
 * `liveStep` calls `sensorRead`, which uses `Math.random()`. Everything asserted here is
 * about the mechanical state (rpm, running), not the sensed values, so the noise does
 * not need stubbing — but do not add assertions on `sensed*` fields without stubbing it.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

const STOCK = S.DEFAULT_ENGINE_CONFIG;

/** The config the live loop is driven with, matching EcuLab's `liveCfgRef`. */
function liveCfg() {
  return {
    ve: S.DEFAULT_VE, veTruth: S.DEFAULT_VE, timing: S.DEFAULT_TIMING, afr: S.DEFAULT_AFR,
    derived: S.deriveEngine(STOCK), fuel: S.OCTANE_OPTS[0],
    injectorCc: 315, ecuInjectorCc: 315,
    mods: { ...S.DEFAULT_MODS, turboFitted: false },
    mafScalar: 1, mafErrorBase: 1, turboOn: false, boostCurve: S.DEFAULT_BOOST,
    octaneBonus: S.OCTANE_OPTS[0].bonus,
    turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
  };
}

/** Runs the engine forward with the throttle closed. 20 Hz, as the app does. */
function run(state, seconds, throttle = 0) {
  const cfg = liveCfg();
  let s = state;
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    s = S.liveStep(s, 0.05, { throttle, load: 0 }, cfg);
  }
  return s;
}

describe('the live engine', () => {
  it('starts from the starter and catches', () => {
    const started = run({ ...S.makeLiveState(), cranking: true }, 3);
    expect(started.running).toBe(true);
    expect(started.rpm).toBeGreaterThan(S.STALL_RPM);
  });

  // The point of this test: idle sits at light load, which is exactly where the burn
  // model changed MBT. If idle timing efficiency drops far enough, the engine cannot
  // hold itself against its own friction and dies.
  it('holds idle for a full minute without stalling', () => {
    let s = run({ ...S.makeLiveState(), cranking: true }, 3);
    expect(s.running).toBe(true);
    s = run(s, 60);
    expect(s.running).toBe(true);
    expect(s.rpm).toBeGreaterThan(S.STALL_RPM);
  });

  it('settles near the idle target rather than drifting away from it', () => {
    let s = run({ ...S.makeLiveState(), cranking: true }, 3);
    s = run(s, 30);
    // Wide band deliberately: this asserts the controller converges, not what it
    // converges to. The exact idle speed is a magnitude and belongs to the fingerprint.
    expect(s.rpm).toBeGreaterThan(S.IDLE_TARGET_RPM - 250);
    expect(s.rpm).toBeLessThan(S.IDLE_TARGET_RPM + 400);
  });

  it('returns to idle after the throttle is blipped and released', () => {
    let s = run({ ...S.makeLiveState(), cranking: true }, 3);
    s = run(s, 2, 60);
    expect(s.rpm).toBeGreaterThan(2000);
    s = run(s, 20, 0);
    expect(s.running).toBe(true);
    expect(s.rpm).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/live.test.js`

Expected: PASS, 4 tests. If `holds idle` fails with `running: false`, the idle controller cannot absorb the timing-efficiency change — that is the risk this task exists to detect. Do **not** widen the test. Stop, use `superpowers:systematic-debugging`, and report back: the calibration anchors may need revisiting, which is a design decision, not an implementation one.

- [ ] **Step 3: Commit**

```bash
git add tests/live.test.js
git commit -m "Cover the live engine's idle, which the burn model moves

liveStep had no tests at all. Idle runs at light load, which is exactly
where MBT changed, so the idle controller's ability to absorb that needs
to be asserted rather than assumed."
```

---

### Task 7: Regenerate the fingerprint and explain what moved

**Files:**
- Modify: `tests/fixtures/fingerprint.sha256`

- [ ] **Step 1: Confirm the fingerprint is the only thing failing**

Run: `npm test 2>&1 | tail -20`

Expected: `tests/fingerprint.test.js` fails on `matches the committed baseline`. Everything else passes. If any other test fails, stop and fix that first — the fingerprint is updated last, once the behaviour is settled.

- [ ] **Step 2: Generate the "after" report and diff it**

```bash
node scripts/update-fingerprint.js --report
node -e "
const a = require('/tmp/fingerprint.before.json');
const b = require('./fingerprint.report.json');
const sa = JSON.stringify(a), sb = JSON.stringify(b);
console.log('before bytes', sa.length, 'after bytes', sb.length);
" 2>/dev/null || echo "Reports are ESM/JSON — inspect them with jq or a diff tool instead"
diff <(jq -S . /tmp/fingerprint.before.json) <(jq -S . fingerprint.report.json) | head -60
```

Read the diff. You are looking to confirm three things the spec predicts:

1. Naturally aspirated wide-open-throttle points (~101 kPa) are **unchanged**.
2. Boosted points shift slightly — less timing efficiency, because a dense charge burns fast and wants less advance.
3. Light-load points improve markedly — cruise is no longer modelled as running at the efficiency floor.

If the NA WOT numbers moved, something is wrong. Stop and investigate before updating the fixture.

- [ ] **Step 3: Write down what moved, for the PR**

Save a short summary to `/tmp/fingerprint-notes.md` — peak NA hp before/after (expected identical), peak boosted hp before/after, and one light-load cell. Task 8 quotes these in the PR body.

- [ ] **Step 4: Update the fixture**

Run: `npm run test:fingerprint:update`

- [ ] **Step 5: Run the full suite**

Run: `npm test 2>&1 | tail -10`

Expected: all files pass. Test count should be `158 + 7 (MBT, replacing 2) + 6 (advisor) + 2 (BSFC) + 4 (live)` — confirm the reported total rather than assuming it.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/fingerprint.sha256
git commit -m "Update the fingerprint for the burn-duration MBT model

Naturally aspirated wide-open-throttle points are unchanged, by
construction — the burn model reproduces the old curve exactly at
atmospheric pressure. Boosted points give up a little timing efficiency
because a dense charge burns fast and wants less advance than the old
model gave it. Light-load points improve substantially: cruise was
running against the efficiency floor because MBT there was modelled
around 25 degrees when the tables, correctly, carry 40-47."
```

---

### Task 8: Full verification and the pull request

- [ ] **Step 1: Run every check CI runs**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

All four must pass. Paste the real output into the PR — a claim without output is not a result. Use `superpowers:verification-before-completion`.

- [ ] **Step 2: Re-sync with the base**

```bash
git fetch origin
git rebase origin/main
```

If `tests/fixtures/fingerprint.sha256` conflicts, do **not** pick a side — regenerate it against the new base per Task 7 and re-run the full suite. A pre-rebase green says nothing about the post-rebase tree.

- [ ] **Step 3: Re-run the full suite after rebasing**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin fix/4-light-load-mbt
gh pr create --title "Derive MBT from burn duration, and bound the spark advisor by it" --body "..."
```

The body must state what changed, why, how it was verified, the fingerprint movement from Task 7, and `Closes #4`. It must also record that the issue was filed as two cosmetic datalog defects and that neither value is displayed — the real defect was the advisor.

- [ ] **Step 5: Stop**

Do **not** merge. Hand over the PR URL. The physics needs CaribouTuning's read before it goes anywhere, and the merge is not yours to make regardless.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. MBT as burn duration | Task 2 |
| 2. Bound the advisor + classification split | Task 3 |
| 3. Report the distinction in the UI | Task 4 |
| 4. BSFC sentinel | Task 5 |
| Consequence: fingerprint moves | Tasks 1, 7 |
| Consequence: idle must not stall | Task 6 |
| Tests 1-4 (MBT direction, cruise band, WOT unchanged, clamped) | Task 2 Step 1 |
| Tests 5-7 (advisor bounded, no false danger) | Task 3 Step 1 |
| Test 8 (BSFC null) | Task 5 Step 1 |
| Test 9 (liveStep idle) | Task 6 Step 1 |
| Out of scope: knock threshold's own inverse law | untouched, by design |

**Deviation from the spec, recorded deliberately:** the spec's item 4 said to render absent BSFC as "—". There is no render site — `bsfc` has never appeared in the UI — so Task 5 changes the record only and says so.

**Test expectations were verified against the real modules before this plan was written**, by replicating Tasks 2 and 3 outside the tree. They are measurements, not predictions:

| Assertion | Measured |
|---|---|
| NA stock: `overAdvanced` is empty | 0 of 32 |
| NA stock: `pastMbt` is non-empty | 16 of 32 |
| NA stock: every `suggested <= mbt` | true; max suggestion 50.0° (was 165.5°) |
| NA stock: every `suggested` within [5, 50] | true |
| Boosted 12 psi: `knockLimited` cells exist | 13 of 40, all with `suggested < mbt` |
| The two categories never overlap | disjoint |
| Task 5's motoring point makes no power | −6 hp, `bsfc` currently `0` |

A boosted stock tune still trips the red panel at 12 cells, which is correct and is the app's central lesson — see the warning at `EcuLab.jsx:1669` about adding boost without retarding spark.

**Type consistency:** `mbtTiming(rpm, mapKpa) => number` is used identically in Tasks 2 and 3. `spark[].mbt` and `spark[].knockLimited` are produced in Task 3 Step 4 and consumed in Task 3 Step 6 and the Task 3 tests. `pastMbt` is produced in Task 3 Step 6 and consumed in Task 4 Step 1. `bsfc: number | null` is produced in Task 5 and consumed nowhere else.
