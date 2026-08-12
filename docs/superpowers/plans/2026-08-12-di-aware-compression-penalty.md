# DI-Aware Compression Penalty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Engineer Score's flat 15-point penalty above 10.5:1 static compression under boost with a headroom that moves with fuel octane and intercooling, and a deduction that scales with how far over the build sits.

**Architecture:** Five new constants in `src/sim/coefficients.js`; one rewritten rule in `computeEngineerScore` (`src/sim/scoring.js`); `fuel` and `mods` added as required inputs to that function and passed at all four call sites. No physics formula is touched — `deriveEngine`, `computeHardwareVE`, `evaluatePoint` and `simulateSweep` are all unchanged.

**Tech Stack:** Vanilla ES modules, React 18, Vitest, ESLint 9 (with `eslint-plugin-react-hooks`), TypeScript 5 in `--checkJs` mode.

**Spec:** `docs/superpowers/specs/2026-08-12-turbo-compression-penalty-design.md`
**Issue:** #3. Follow-up issue for real DI modelling: #24.
**Branch:** `feat/3-di-aware-compression-penalty` (already created and checked out; the spec is already committed on it).

## Global Constraints

- **Nothing adds horsepower.** Every part must change airflow, pressure, temperature or fuel delivery. (CONTRIBUTING.md)
- **No bare magic numbers anywhere in `src/sim/` outside `coefficients.js`.** Every constant this plan introduces goes in `COEFF` with a comment explaining what it represents.
- **JSDoc on everything exported from `src/sim/`.** Types are checked with `tsc --noEmit` in `--checkJs` mode.
- **Intent tests assert direction and relationship, never magnitudes.** `expect(hp).toBe(235)` in an intent test is a plan failure. Magnitudes belong to the fingerprint.
- **Never update the fingerprint fixture just to make CI green.** Task 3 exists to prove exactly which numbers moved and that nothing else did.
- **Comments explain why, not what.** This is a teaching codebase; existing comments are unusually thorough and this change must match.
- **Never merge the pull request.** The work ends at "PR is open and awaiting review."
- Deduction strings in `computeEngineerScore` use **one** space after the number (`-8 Turbo sized large...`), unlike `computeTuningScore` which uses two. Match the surrounding function.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/sim/coefficients.js` | Modify — append a new section to `COEFF` | The five empirical constants |
| `src/sim/scoring.js` | Modify — `computeEngineerScore` at lines 65-72 | The rule itself, plus the widened signature and JSDoc |
| `src/ui/EcuLab.jsx` | Modify — lines 861-864 and 990-993, plus the memo dep array at 999 | Pass `fuel` and `mods`; fix the stale-memo bug |
| `tests/scoring.test.js` | Modify — append a `describe` block | Intent tests for the new rule |
| `tests/fingerprint.js` | Modify — line 158-162 | Keep the matrix call site compiling |
| `tests/regressions.test.js` | Modify — line 268-272 | Keep the exhaust-diameter test's call site compiling |
| `tests/fixtures/fingerprint.sha256` | Regenerate | The behavioural hash |

---

### Task 1: The coefficients

**Files:**
- Modify: `src/sim/coefficients.js` (append to the `COEFF` object, after `MANIFOLD_VACUUM_RPM_NORM`)

**Interfaces:**
- Consumes: nothing.
- Produces: `COEFF.COMPRESSION_BOOST_BASE` (number, 10.8), `COEFF.COMPRESSION_PER_OCTANE_DEG` (number, 0.1), `COEFF.COMPRESSION_INTERCOOLER_GAIN` (number, 0.4), `COEFF.COMPRESSION_PENALTY_PER_POINT` (number, 10), `COEFF.COMPRESSION_PENALTY_CAP` (number, 15). Task 2 consumes all five.

This task adds constants and nothing that reads them. That is deliberate — the values are the part of this change a reviewer is most likely to argue with, and they are easier to argue with in isolation. Behaviour does not change, so the full suite must still pass untouched at the end of this task, fingerprint included.

- [ ] **Step 1: Add the new section to `COEFF`**

In `src/sim/coefficients.js`, insert immediately before the closing `};` of the `COEFF` object (after the `MANIFOLD_VACUUM_RPM_NORM: 7500,` line):

```js

  // --- Engineer Score: static compression under boost ---
  // Static compression a boosted build carries on 91 octane with no charge cooling
  // before the Engineer Score calls the combination incoherent.
  //
  // Deliberately ABOVE the 10.2-11.0 band that factory direct-injection turbo engines
  // actually ship at (BMW N54 10.2, BMW B58 11.0, Toyota/BMW 2.0 T 11.0). Direct
  // injection sprays after the intake valve closes, so the fuel's latent heat cools the
  // TRAPPED charge during compression and buys real knock margin — which is precisely
  // why those engines can run compression that would have been reckless on a
  // port-injected engine. This model has no separate term for that, so the base carries
  // it implicitly. Issue #24 tracks modelling injection type properly; once it lands,
  // this should key off injection type instead of accommodating it blindly.
  COMPRESSION_BOOST_BASE: 10.8,
  // Extra static compression supported per degree of octane knock bonus. At 0.1, E85
  // (+14 deg) is worth 1.4 points of compression, about the real spread between a
  // pump-gas build and an E85 one.
  COMPRESSION_PER_OCTANE_DEG: 0.1,
  // Extra static compression supported by intercooler charge cooling, in points.
  COMPRESSION_INTERCOOLER_GAIN: 0.4,
  // Engineer Score points charged per point of compression past that headroom, and the
  // most this rule will ever deduct. The cap equals the flat penalty this rule replaced,
  // so the new rule is never harsher than its predecessor — it only stops charging that
  // maximum to builds that did not earn it.
  COMPRESSION_PENALTY_PER_POINT: 10,
  COMPRESSION_PENALTY_CAP: 15,
```

- [ ] **Step 2: Verify nothing changed behaviourally**

Run: `npm test`
Expected: PASS, all files. The fingerprint test in particular must still pass — these constants are not read by anything yet, so the hash cannot have moved. If the fingerprint fails here, something else in the working tree is dirty; stop and find out what.

- [ ] **Step 3: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/sim/coefficients.js
git commit -m "Add compression-under-boost coefficients for the Engineer Score

Five constants, no reader yet. Split out so the values can be reviewed on
their own terms before the rule that consumes them lands.

Refs #3"
```

---

### Task 2: The rule, the signature, and the four call sites

**Files:**
- Modify: `src/sim/scoring.js:15` (imports), `src/sim/scoring.js:58-72` (JSDoc, signature, rule)
- Modify: `src/ui/EcuLab.jsx:861-864` and `src/ui/EcuLab.jsx:990-993` and the dep array at `src/ui/EcuLab.jsx:999`
- Modify: `tests/fingerprint.js:158-162`
- Modify: `tests/regressions.test.js:268-272`
- Test: `tests/scoring.test.js` (append a new `describe` block after the existing `computeEngineerScore turbo sizing` block, which ends at line 106)

**Interfaces:**
- Consumes: all five `COEFF.COMPRESSION_*` constants from Task 1.
- Produces: `computeEngineerScore` with the widened input `{engineConfig, turboOn, turbine, compressor, exhaustDiaError, dutyPreview, displacementL, fuel, mods}`, where `fuel` is an entry of `OCTANE_OPTS` (`{label: string, bonus: number, stoich: number, density: number, lhv: number}`) and `mods` is a bolt-on set (`{intake, exhaust, headers, intercooler}` booleans). Return shape is unchanged: `{score: number, label: string, deductions: string[]}`.

This task is atomic on purpose. Widening the signature without updating the call sites leaves the tree red, so the signature change, all four call sites and the new tests land in one commit.

- [ ] **Step 1: Write the failing tests**

Append to `tests/scoring.test.js`:

```js
describe('computeEngineerScore static compression under boost', () => {
  const [P91, P93, , E85] = S.OCTANE_OPTS;
  const NO_COOLER = { ...S.DEFAULT_MODS, intercooler: false };
  const COOLED = { ...S.DEFAULT_MODS, intercooler: true };

  /**
   * A boosted build that is coherent in every respect EXCEPT the one under test, so the
   * only deduction that can appear is the compression one. Aluminium head throughout,
   * because a high-compression build on a cast iron head trips the separate heat-load
   * rule and would muddy every assertion below.
   */
  const build = (over = {}) => S.computeEngineerScore({
    engineConfig: { ...S.DEFAULT_ENGINE_CONFIG, compression: 9.5 },
    turboOn: true,
    turbine: S.TURBINE_OPTS[1],
    compressor: S.COMPRESSOR_OPTS[1],
    exhaustDiaError: 0,
    dutyPreview: 50,
    displacementL: 3.5,
    fuel: P91,
    mods: NO_COOLER,
    ...over,
  });

  const at = (compression, over = {}) => build({
    engineConfig: { ...S.DEFAULT_ENGINE_CONFIG, compression }, ...over,
  });
  const hit = (r) => r.deductions.find((d) => /static compression/.test(d));
  /** Safe because `build()` is otherwise clean — nothing else deducts. */
  const cost = (r) => 100 - r.score;

  // The regression this whole change exists for. A B58 or a Toyota/BMW 2.0 T is
  // 11.0:1 from the factory, and the old rule called that a 15-point mistake.
  it('leaves a factory-shaped DI turbo build unpenalised', () => {
    expect(hit(at(11.0, { fuel: P93, mods: COOLED }))).toBeUndefined();
  });

  // Guards the shipped presets specifically, from the preset data itself rather than
  // from hand-copied numbers, so a preset edit cannot quietly walk back into the rule.
  it('keeps the N54 preset clear of the compression deduction', () => {
    const n54 = S.presetById('n54');
    const r = build({
      engineConfig: n54.engine,
      fuel: S.OCTANE_OPTS[n54.parts.octaneIdx],
      mods: n54.mods,
    });
    expect(hit(r)).toBeUndefined();
  });

  it('lets fuel octane buy compression headroom', () => {
    expect(hit(at(11.5, { fuel: P91 }))).toBeDefined();
    expect(hit(at(11.5, { fuel: E85 }))).toBeUndefined();
  });

  it('lets charge cooling buy compression headroom', () => {
    expect(hit(at(11.3, { fuel: P93, mods: NO_COOLER }))).toBeDefined();
    expect(hit(at(11.3, { fuel: P93, mods: COOLED }))).toBeUndefined();
  });

  // The property the old cliff lacked entirely: 10.51:1 and 13.0:1 were charged the same.
  it('scales the deduction with how far over the build sits', () => {
    expect(cost(at(12.0))).toBeGreaterThan(cost(at(11.5)));
    expect(cost(at(11.5))).toBeGreaterThan(cost(at(11.0)));
  });

  it('never deducts more than the flat penalty it replaced, even at the slider maximum', () => {
    expect(cost(at(13.0))).toBeLessThanOrEqual(15);
  });

  it('says nothing about static compression on a naturally-aspirated build', () => {
    expect(hit(at(13.0, { turboOn: false }))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/scoring.test.js -t 'static compression under boost'`
Expected: FAIL. The old rule fires at anything over 10.5 regardless of fuel, so `lets fuel octane buy compression headroom` and `lets charge cooling buy compression headroom` fail on their second assertion, and `scales the deduction` fails because every over-threshold build costs exactly 15. `leaves a factory-shaped DI turbo build unpenalised` fails outright.

Note the failure messages mention `/static compression/` not matching — the old deduction text is `High static compression fights boost pressure`, which *does* contain "static compression". That is intentional: the regex matches both the old and new copy, so these tests fail for the right reason (the rule fired when it should not have) rather than for a text mismatch.

- [ ] **Step 3: Import `COEFF` in `scoring.js`**

Change `src/sim/scoring.js:15` from:

```js
import { clamp } from './math.js';
```

to:

```js
import { COEFF } from './coefficients.js';
import { clamp } from './math.js';
```

- [ ] **Step 4: Widen the JSDoc and the signature**

Replace `src/sim/scoring.js:58-67` (the JSDoc block and function signature) with:

```js
/**
 * Grades how coherent the hardware choices are with each other, independent of how
 * well the engine is tuned.
 *
 * `fuel` and `mods` are required rather than optional. Defaulting them would silently
 * assume 91 octane and no intercooler at any call site that forgot to pass them — the
 * harshest possible headroom, and a wrong answer that looks entirely plausible on
 * screen. The JSDoc below is what makes `tsc --checkJs` catch the omission instead.
 *
 * @param {object} input
 * @param {import('./engine.js').EngineConfig} input.engineConfig
 * @param {boolean} input.turboOn
 * @param {{size: string}} input.turbine
 * @param {{size: string, boostCeiling: number}} input.compressor
 * @param {number} input.exhaustDiaError inches the fitted pipe differs from ideal
 * @param {number} input.dutyPreview injector duty at current demand, percent
 * @param {number} input.displacementL
 * @param {{label: string, bonus: number}} input.fuel the octane option fitted
 * @param {{intercooler: boolean}} input.mods bolt-ons fitted
 * @returns {{score: number, label: string, deductions: string[]}}
 */
export function computeEngineerScore({
  engineConfig, turboOn, turbine, compressor, exhaustDiaError, dutyPreview, displacementL,
  fuel, mods,
}) {
```

- [ ] **Step 5: Replace the rule**

Replace `src/sim/scoring.js:70-72` — the whole old block:

```js
  if (turboOn && engineConfig.compression > 10.5) {
    score -= 15; deductions.push('-15 High static compression fights boost pressure');
  }
```

with:

```js
  if (turboOn) {
    // Static compression is not dangerous on its own. What decides whether it survives
    // boost is how much knock margin the rest of the build brings, and octane and charge
    // cooling are the two levers the player actually has — so the ceiling moves with
    // them instead of sitting at one number for every build.
    //
    // The physics already charges for compression separately: `compressionKnockAdj` in
    // engine.js costs knock margin, the tune goes knock-limited, and the Tuning Score
    // deducts for the events that follow. This rule is deliberately gentler than the
    // flat penalty it replaced so the same decision is not billed twice at full price.
    const headroom = COEFF.COMPRESSION_BOOST_BASE
      + fuel.bonus * COEFF.COMPRESSION_PER_OCTANE_DEG
      + (mods.intercooler ? COEFF.COMPRESSION_INTERCOOLER_GAIN : 0);
    const over = engineConfig.compression - headroom;
    if (over > 0) {
      const d = Math.round(Math.min(
        over * COEFF.COMPRESSION_PENALTY_PER_POINT, COEFF.COMPRESSION_PENALTY_CAP,
      ));
      // A build a few hundredths over rounds to zero, and `-0 ...` in the deduction list
      // would be nonsense on screen. It is also the right answer: barely over is not a
      // mistake worth naming.
      if (d > 0) {
        const cooling = mods.intercooler ? 'an intercooler' : 'no charge cooling';
        score -= d;
        deductions.push(`-${d} ${engineConfig.compression.toFixed(1)}:1 static compression `
          + `outruns what this build supports under boost on ${fuel.label} with ${cooling}`);
      }
    }
  }
```

Keep this block where the old one was — at the top of the function, before the naturally-aspirated compression rule. Moving it down into the existing `if (turboOn)` sizing block would reorder the deduction list for no benefit.

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npx vitest run tests/scoring.test.js -t 'static compression under boost'`
Expected: PASS, 7 tests.

- [ ] **Step 7: Update the `EcuLab.jsx` pull-handler call site**

At `src/ui/EcuLab.jsx:861-864`, change:

```js
    const es = computeEngineerScore({
      engineConfig, turboOn, turbine: TURBINE_OPTS[turbineIdx], compressor: COMPRESSOR_OPTS[compressorIdx],
      exhaustDiaError, dutyPreview, displacementL: engineDerived.displacementL,
    });
```

to:

```js
    const es = computeEngineerScore({
      engineConfig, turboOn, turbine: TURBINE_OPTS[turbineIdx], compressor: COMPRESSOR_OPTS[compressorIdx],
      exhaustDiaError, dutyPreview, displacementL: engineDerived.displacementL, fuel, mods,
    });
```

`fuel` is already in scope (`src/ui/EcuLab.jsx:629`, `const fuel = OCTANE_OPTS[octaneIdx];`) and `mods` is component state (`src/ui/EcuLab.jsx:529`). Both are already passed to `simulateSweep` twelve lines above.

- [ ] **Step 8: Update the `scores` memo — and its dependency array**

This is the one genuine bug risk in the change. At `src/ui/EcuLab.jsx:990-993`, change:

```js
    const engineer = computeEngineerScore({
      engineConfig, turboOn, turbine: TURBINE_OPTS[turbineIdx], compressor: COMPRESSOR_OPTS[compressorIdx],
      exhaustDiaError, dutyPreview, displacementL: engineDerived.displacementL,
    });
```

to:

```js
    const engineer = computeEngineerScore({
      engineConfig, turboOn, turbine: TURBINE_OPTS[turbineIdx], compressor: COMPRESSOR_OPTS[compressorIdx],
      exhaustDiaError, dutyPreview, displacementL: engineDerived.displacementL, fuel, mods,
    });
```

Then, at `src/ui/EcuLab.jsx:999`, change the dependency array:

```js
  }, [result, running, engineConfig, turboOn, turbineIdx, compressorIdx, exhaustDiaError, dutyPreview, engineDerived]);
```

to:

```js
  }, [result, running, engineConfig, turboOn, turbineIdx, compressorIdx, exhaustDiaError, dutyPreview, engineDerived, fuel, mods]);
```

Without this, the displayed Engineer Score does not recompute when the player switches octane or fits an intercooler — the memo watches neither — so the score silently lags the build. `eslint-plugin-react-hooks` should also flag the omission; `npm run lint` in Step 11 is the check.

- [ ] **Step 9: Update the fingerprint matrix call site**

At `tests/fingerprint.js:158-162`, change:

```js
              const engineer = S.computeEngineerScore({
                engineConfig: cfg, turboOn,
                turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
                exhaustDiaError: 0.1, dutyPreview: 80, displacementL: derived.displacementL,
              });
```

to:

```js
              const engineer = S.computeEngineerScore({
                engineConfig: cfg, turboOn,
                turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
                exhaustDiaError: 0.1, dutyPreview: 80, displacementL: derived.displacementL,
                fuel: S.OCTANE_OPTS[fi], mods,
              });
```

`fi` and `mods` are both loop variables already in scope at this point in the matrix. Passing the matrix's own fuel and mods rather than a fixed pair is what makes the fingerprint exercise the new rule across octane and intercooler combinations instead of pinning one.

- [ ] **Step 10: Update the regression-test call site**

At `tests/regressions.test.js:268-272`, change:

```js
    const score = S.computeEngineerScore({
      engineConfig: { ...STOCK, compression: 9.5 }, turboOn: true,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
      exhaustDiaError: nearest - ideal, dutyPreview: 80, displacementL: derived.displacementL,
    });
```

to:

```js
    const score = S.computeEngineerScore({
      engineConfig: { ...STOCK, compression: 9.5 }, turboOn: true,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
      exhaustDiaError: nearest - ideal, dutyPreview: 80, displacementL: derived.displacementL,
      fuel: S.OCTANE_OPTS[0], mods: S.DEFAULT_MODS,
    });
```

That test asserts only that no *exhaust diameter* deduction appears, and 9.5:1 sits well under the base headroom on any fuel, so the compression rule stays silent and cannot interfere.

- [ ] **Step 11: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0, no output. If `react-hooks/exhaustive-deps` fires here, Step 8's dependency array was missed.

- [ ] **Step 12: Run the whole suite**

Run: `npm test`
Expected: every file PASSES **except** `tests/fingerprint.test.js`, which must FAIL with a hash mismatch. That failure is the expected, designed consequence of this change and is resolved deliberately in Task 3 — not by rerunning anything here.

If any file other than `tests/fingerprint.test.js` fails, stop. That is a real defect in this change, not expected fallout.

- [ ] **Step 13: Commit**

```bash
git add src/sim/scoring.js src/ui/EcuLab.jsx tests/scoring.test.js tests/fingerprint.js tests/regressions.test.js
git commit -m "Judge compression under boost against octane and charge cooling

The flat -15 above 10.5:1 encoded port-injection practice. Factory DI turbo
engines ship at 11.0:1 (B58, Toyota/BMW 2.0 T) and read as 15-point mistakes
under it, while 10.51:1 and 13.0:1 were charged identically.

The ceiling now moves with the fuel's octane bonus and whether an intercooler
is fitted, and the deduction scales with how far over the build sits, capped
at the old flat value so the rule is never harsher than its predecessor.

Also fixes the scores memo, which watched neither fuel nor mods and would have
shown a stale Engineer Score after an octane change.

The fingerprint moves in this commit and is refreshed in the next.

Refs #3"
```

---

### Task 3: Refresh the fingerprint, and prove only the score moved

**Files:**
- Modify: `tests/fixtures/fingerprint.sha256` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: the completed Task 2 working tree.
- Produces: a passing `tests/fingerprint.test.js`, and a before/after summary for the PR body.

No physics formula was touched, so this is a much stronger check than "the hash changed, as predicted": every torque, power, wear and event figure in the fingerprint must come back **byte-identical**, and only `engineer.score`, `engineer.label` and the derived `pull` may move. Anything else moving means Task 2 broke something.

- [ ] **Step 1: Capture the baseline report from the pre-change tree**

```bash
mkdir -p /tmp/fp
git stash push --include-untracked
node scripts/update-fingerprint.js --report
mv fingerprint.report.json /tmp/fp/before.json
git stash pop
```

Expected: `wrote .../fingerprint.report.json` then `fingerprint updated: <hash>`, where `<hash>` matches the committed contents of `tests/fixtures/fingerprint.sha256` — the stashed tree is the pre-change tree, so the hash cannot have moved and the fixture is rewritten with the value it already had. Confirm with `git status --short`, which must not list `tests/fixtures/fingerprint.sha256` as modified at this point.

- [ ] **Step 2: Capture the post-change report**

```bash
node scripts/update-fingerprint.js --report
mv fingerprint.report.json /tmp/fp/after.json
```

Expected: `fingerprint updated: <hash>` with a **different** hash than Step 1, and `tests/fixtures/fingerprint.sha256` now shows as modified.

- [ ] **Step 3: Write the diff checker**

Create `/tmp/fp/diff.mjs` (a scratch file — do not commit it):

```js
import { readFileSync } from 'node:fs';

const [, , beforePath, afterPath] = process.argv;
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unexpected = [];
const moved = [];

for (const section of Object.keys(before)) {
  for (const key of Object.keys(before[section])) {
    const b = before[section][key];
    const a = after[section][key];
    if (same(a, b)) continue;
    if (section !== 'simulateSweep') { unexpected.push(`${section}|${key}`); continue; }
    for (const field of Object.keys(b)) {
      if (same(b[field], a[field])) continue;
      if (field === 'engineer' || field === 'pull') {
        moved.push(`${key}  engineer ${b.engineer.score} -> ${a.engineer.score}`);
      } else {
        unexpected.push(`${section}|${key}|${field}`);
      }
    }
  }
}

const configs = new Set(moved.map((m) => m.split('|')[0]));
console.log(`engineer/pull entries moved: ${moved.length}`);
console.log(`configs affected: ${[...configs].join(', ') || '(none)'}`);
console.log(`UNEXPECTED changes: ${unexpected.length}`);
for (const u of unexpected.slice(0, 20)) console.log(`  ${u}`);
console.log('\nsample:');
for (const m of moved.slice(0, 8)) console.log(`  ${m}`);
process.exit(unexpected.length === 0 ? 0 : 1);
```

- [ ] **Step 4: Run it and read the result**

Run: `node /tmp/fp/diff.mjs /tmp/fp/before.json /tmp/fp/after.json`

Expected: `UNEXPECTED changes: 0`, and `configs affected` listing **only** `smallI4`, `cammedV8` and `undersquare`. Per the spec, `turboI6` (10.2:1), `stockV6` (10.3:1), `floatTrap` (10.3:1) and `bigV8` (9.5:1) all sit under the base headroom on every fuel and must not appear.

**If `UNEXPECTED changes` is anything but 0, stop.** A moved torque, wear or event figure means Task 2 changed physics it had no business touching. Do not commit the fixture; find the cause first.

**If a config outside those three appears, stop.** Either the headroom is not what the spec calculated or a config was misread.

Save this command's output — it goes in the PR body in Task 4.

- [ ] **Step 5: Verify the fingerprint test now passes**

Run: `npm test`
Expected: PASS, all files including `tests/fingerprint.test.js`.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/fingerprint.sha256
git commit -m "Refresh the fingerprint for the new compression rule

Only engineer.score, engineer.label and the derived pull score move, and only
for the three matrix configs that sit above the new headroom under boost:
smallI4 (11.5:1), cammedV8 (11.0:1) and undersquare (12.5:1). Every torque,
power, wear and event figure is byte-identical — no physics formula was
touched. Verified by diffing the full before/after reports field by field.

Refs #3"
```

---

### Task 4: Verify, re-sync, and open the pull request

**Files:** none modified unless the rebase requires it.

**Interfaces:**
- Consumes: Tasks 1-3, committed.
- Produces: an open PR awaiting human review.

- [ ] **Step 1: Run the full check suite**

Run all four, exactly as CI does:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all four exit 0. Paste the real output into the transcript — a claim that they pass without output is not a result.

- [ ] **Step 2: Re-sync with `main`**

```bash
git fetch origin
git rebase origin/main
```

If `tests/fixtures/fingerprint.sha256` conflicts, **do not pick a side.** It is a generated hash; regenerate it against the rebased tree with `node scripts/update-fingerprint.js`, then `git add` it and continue.

- [ ] **Step 3: Re-run the full suite after the rebase**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all four exit 0.

A rebase produces a new tree, so the pre-rebase green says nothing about it. If the base moved at all, this run is the only evidence that counts.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/3-di-aware-compression-penalty
```

Then open the PR with a body covering: what changed and why the 10.5 cliff was wrong; the headroom table from the spec showing the N54, B58 and 2.0 T all landing clean; the severity table; the stale-memo fix as a secondary defect found in passing; the fingerprint report diff output saved in Task 3, Step 4; and `Closes #3` plus a pointer to #24 as the real DI fix.

- [ ] **Step 5: Check for a queued auto-merge**

```bash
gh pr view <N> --json autoMergeRequest
```

Expected: `{"autoMergeRequest":null}`. If it is non-null, cancel it with `gh pr merge <N> --disable-auto` — a queued auto-merge fires without a human and is exactly what the no-merge rule exists to prevent.

- [ ] **Step 6: Stop**

Hand over the PR URL. **Do not merge it.** Not when CI is green, not because the change is small, not because the plan is complete. The merge is a human decision.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the rule and the `d > 0` guard (Task 2, Step 5); coefficient placement and the five values (Task 1); required-not-defaulted `fuel`/`mods` and the tightened JSDoc (Task 2, Step 4); all four call sites including the memo dep array (Task 2, Steps 7-10); the deduction text (Task 2, Step 5); all seven tests (Task 2, Step 1); the fingerprint refresh and the byte-identical assertion (Task 3); the four-command verification (Task 4, Steps 1 and 3). The spec's non-goals are carried into the Global Constraints and the commit messages.

**Placeholder scan.** No TBDs. Every code step shows complete code; every command shows expected output.

**Type consistency.** `computeEngineerScore`'s input shape is declared once in Task 2's Interfaces block and used identically at all four call sites. `fuel` is always an `OCTANE_OPTS` entry, `mods` always a bolt-on set. The five `COEFF.COMPRESSION_*` names are spelled identically in Task 1 (definition) and Task 2, Step 5 (use).

**One deviation from the spec, deliberately.** The spec's deduction-text example used two spaces after the number; the surrounding `computeEngineerScore` deductions use one. The plan uses one, to match the file, and this is recorded in the Global Constraints.
