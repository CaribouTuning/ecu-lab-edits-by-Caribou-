# Stable Hardware Size Ids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `computeEngineerScore`'s turbo-sizing deductions branch on a stable `size` id instead of on the human-readable `label` of `TURBINE_OPTS` / `COMPRESSOR_OPTS`, so reworded display copy can no longer silently change scoring.

**Architecture:** Add a `size: 'small' | 'medium' | 'large'` field to every entry in `TURBINE_OPTS` and `COMPRESSOR_OPTS` in `src/sim/hardware.js`. Change the two label comparisons in `src/sim/scoring.js` to read `.size`. Add tests that (a) assert every option carries a valid `size`, so a newly added option cannot silently miss one, and (b) assert the sizing deductions survive a label rewording. Because `tests/fingerprint.js` hashes both option arrays as constants, the fingerprint fixture must be regenerated — a constants-shape change, not a physics change.

**Tech Stack:** JavaScript ES modules, Vitest, ESLint, `tsc --checkJs` for JSDoc types.

## Global Constraints

- Physics lives in `src/sim/`; no engineering maths in `src/ui/` (CONTRIBUTING.md).
- No bare magic numbers in `src/sim/` outside `src/sim/coefficients.js`. `size` is a categorical id, not an empirical number, so it belongs on the option objects.
- Intent tests assert direction and relationship, not exact magnitudes — except scoring deductions, which are fixed integers by design and are asserted exactly in `tests/scoring.test.js`.
- The fingerprint fixture is never updated just to make CI green. The PR must state what moved and why.
- Node 20+.

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/sim/hardware.js` | Hardware option catalogues | Add `size` to 3 `TURBINE_OPTS` + 3 `COMPRESSOR_OPTS` entries; document the field |
| `src/sim/scoring.js` | Engineer Score | Branch on `.size` at lines 81 and 84 |
| `tests/scoring.test.js` | Scoring intent tests | New `computeEngineerScore` describe block |
| `tests/physics.test.js` | Hardware catalogue invariants | New test: every option has a valid `size` |
| `tests/fixtures/fingerprint.sha256` | Behavioural baseline | Regenerated |

---

### Task 1: Give hardware options a stable size id

**Files:**
- Modify: `src/sim/hardware.js:96-110`
- Test: `tests/physics.test.js`

**Interfaces:**
- Produces: every entry of `TURBINE_OPTS` and `COMPRESSOR_OPTS` gains `size` typed `'small' | 'medium' | 'large'`. Task 2 consumes `turbine.size` and `compressor.size`.

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.js`:

```js
describe('hardware option catalogues', () => {
  const SIZES = ['small', 'medium', 'large'];

  // Scoring branches on `size`, never on `label` — labels are display copy and must
  // stay free to reword. A new option that forgets `size` would silently drop out of
  // the Engineer Score's sizing checks, so assert the field is always present.
  it.each([['TURBINE_OPTS'], ['COMPRESSOR_OPTS']])('gives every %s entry a valid size', (name) => {
    for (const opt of S[name]) {
      expect(SIZES, `${name} entry ${opt.label} has size ${String(opt.size)}`).toContain(opt.size);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/physics.test.js -t 'valid size'`
Expected: FAIL — `expected [ 'small', 'medium', 'large' ] to contain undefined`

- [ ] **Step 3: Write minimal implementation**

In `src/sim/hardware.js`, replace the two catalogues (lines 92-110). Keep the existing doc comments and extend them:

```js
/**
 * Turbine sizing trades spool speed against top-end flow — small spins up fast but
 * chokes the exhaust side at high RPM; large is laggy but flows more up top.
 *
 * `size` is the stable id the Engineer Score matches on. `label` is display copy and
 * may be reworded freely; scoring must never read it.
 */
export const TURBINE_OPTS = [
  { label: 'Small — quick spool', size: 'small', spoolRange: 1200, topEndMult: -0.05 },
  { label: 'Medium — balanced', size: 'medium', spoolRange: 1800, topEndMult: 0 },
  { label: 'Large — top-end', size: 'large', spoolRange: 2600, topEndMult: 0.05 },
];

/**
 * Compressor sizing sets a practical boost ceiling before it is pushed outside its
 * efficient range (surge/choke) — running past it makes hot, knock-prone air.
 *
 * `size` is the stable id the Engineer Score matches on; see {@link TURBINE_OPTS}.
 */
export const COMPRESSOR_OPTS = [
  { label: 'Small', size: 'small', boostCeiling: 12, lagAdd: -150 },
  { label: 'Medium', size: 'medium', boostCeiling: 20, lagAdd: 0 },
  { label: 'Large', size: 'large', boostCeiling: 30, lagAdd: 250 },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/physics.test.js -t 'valid size'`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/hardware.js tests/physics.test.js
git commit -m "Give turbine and compressor options a stable size id"
```

---

### Task 2: Branch the Engineer Score on size, not label

**Files:**
- Modify: `src/sim/scoring.js:80-87`
- Test: `tests/scoring.test.js`

**Interfaces:**
- Consumes: `turbine.size`, `compressor.size` from Task 1.
- Produces: no signature change. `computeEngineerScore` keeps its existing input object and `{score, label, deductions}` return.

- [ ] **Step 1: Write the failing test**

Append to `tests/scoring.test.js`:

```js
describe('computeEngineerScore', () => {
  const LARGE_TURBINE = S.TURBINE_OPTS[2];
  const LARGE_COMPRESSOR = S.COMPRESSOR_OPTS[2];
  const SMALL_TURBINE = S.TURBINE_OPTS[0];
  const SMALL_COMPRESSOR = S.COMPRESSOR_OPTS[0];

  const base = (over = {}) => ({
    engineConfig: { compression: 9.5, headMaterial: 'Aluminum' },
    turboOn: true,
    turbine: S.TURBINE_OPTS[1],
    compressor: S.COMPRESSOR_OPTS[1],
    exhaustDiaError: 0,
    dutyPreview: 50,
    displacementL: 3.5,
    ...over,
  });

  it('scores a coherent build at 100', () => {
    expect(S.computeEngineerScore(base()).score).toBe(100);
  });

  it('deducts for a turbo sized large for a small displacement', () => {
    const r = S.computeEngineerScore(base({ displacementL: 2.0, turbine: LARGE_TURBINE }));
    expect(r.score).toBe(92);
    expect(r.deductions).toHaveLength(1);
  });

  it('deducts for a turbo sized small for a big displacement', () => {
    const r = S.computeEngineerScore(base({ displacementL: 5.0, compressor: SMALL_COMPRESSOR }));
    expect(r.score).toBe(92);
    expect(r.deductions).toHaveLength(1);
  });

  it('does not deduct for turbo sizing on a naturally aspirated build', () => {
    const na = base({ turboOn: false, displacementL: 2.0, turbine: LARGE_TURBINE, engineConfig: { compression: 11.0, headMaterial: 'Aluminum' } });
    expect(S.computeEngineerScore(na).deductions).toHaveLength(0);
  });

  // The regression this whole change exists to prevent: labels are display copy, and
  // rewording one must not move the score. Before the `size` field, renaming the
  // compressor 'Large' to 'Large — high flow' silently switched this deduction off.
  it('keeps sizing deductions when the display labels are reworded', () => {
    const reworded = base({
      displacementL: 2.0,
      turbine: { ...LARGE_TURBINE, label: 'XL — screamer' },
      compressor: { ...LARGE_COMPRESSOR, label: 'Large — high flow' },
    });
    expect(S.computeEngineerScore(reworded).score).toBe(92);

    const smallReworded = base({
      displacementL: 5.0,
      turbine: { ...SMALL_TURBINE, label: 'Tiny — instant' },
      compressor: { ...SMALL_COMPRESSOR, label: 'Small — fast spool' },
    });
    expect(S.computeEngineerScore(smallReworded).score).toBe(92);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scoring.test.js -t 'reworded'`
Expected: FAIL — `expected 100 to be 92`, because `compressor.label === 'Large'` is false and `turbine.label.includes('Large')` is false for `'XL — screamer'`.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/scoring.js`, replace lines 80-87:

```js
  if (turboOn) {
    // Matched on `size`, never on `label` — labels are display copy and reworking the
    // UI copy must not move the score. See TURBINE_OPTS in hardware.js.
    if (displacementL < 3.0 && (turbine.size === 'large' || compressor.size === 'large')) {
      score -= 8; deductions.push('-8 Turbo sized large for this displacement — expect heavy lag');
    }
    if (displacementL > 4.2 && (turbine.size === 'small' || compressor.size === 'small')) {
      score -= 8; deductions.push('-8 Turbo sized small for this displacement — will choke the top end');
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scoring.test.js`
Expected: PASS (all tests in file)

- [ ] **Step 5: Commit**

```bash
git add src/sim/scoring.js tests/scoring.test.js
git commit -m "Match Engineer Score turbo sizing on size ids, not display labels"
```

---

### Task 3: Regenerate the fingerprint fixture

**Files:**
- Modify: `tests/fixtures/fingerprint.sha256`

**Interfaces:**
- Consumes: the `size` field added in Task 1, which `tests/fingerprint.js:220` serialises as part of `constants.TURBINE_OPTS` / `constants.COMPRESSOR_OPTS`.

**Why the fixture moves:** the fingerprint hashes the option catalogues verbatim, so adding a field changes the hash even though no simulated number changes. The `--report` diff must confirm that the ONLY movement is inside `constants`, and that every `sweep`, `point`, `live`, `factoryCalibration` and `helpers` value is byte-identical. If anything outside `constants` moved, that is a bug in Task 1 or 2, not a fixture update.

- [ ] **Step 1: Capture the baseline report from main**

```bash
git stash list  # expect empty; the working tree must be clean
git worktree add /tmp/ecu-baseline main
cd /tmp/ecu-baseline && npm ci && node scripts/update-fingerprint.js --report
```

- [ ] **Step 2: Capture the report from the branch**

```bash
cd /Users/danny/Desktop/Projects/cariboutuning
node scripts/update-fingerprint.js --report
```

- [ ] **Step 3: Diff the two reports**

```bash
diff <(python3 -m json.tool /tmp/ecu-baseline/tests/fixtures/fingerprint.report.json) \
     <(python3 -m json.tool tests/fixtures/fingerprint.report.json)
```

Expected: only lines under `constants.TURBINE_OPTS` and `constants.COMPRESSOR_OPTS` differ, each an added `"size"` key. Nothing else.

- [ ] **Step 4: Update the fixture**

```bash
npm run test:fingerprint:update
npx vitest run tests/fingerprint.test.js
```

Expected: PASS

- [ ] **Step 5: Clean up the baseline worktree and commit**

```bash
git worktree remove /tmp/ecu-baseline
git add tests/fixtures/fingerprint.sha256
git commit -m "Update fingerprint for the hardware size field"
```

---

### Task 4: Full verification and PR

**Files:** none modified.

- [ ] **Step 1: Run the full check suite**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all four pass.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin fix/2-engineer-score-stable-ids
gh pr create --title "Match Engineer Score on stable size ids, not display labels" --body "..."
```

The body must state what changed, why the fingerprint moved, and `Closes #2`.

- [ ] **Step 3: Stop.** Hand the PR URL to the user. Do not merge.

## Self-Review

**Spec coverage:** Issue #2 asks for (a) a stable `size` field on both catalogues — Task 1; (b) branching on it — Task 2; (c) a test asserting every option has a valid `size` — Task 1 Step 1. All covered. The fingerprint consequence (Task 3) is not in the issue but is forced by `tests/fingerprint.js:220`.

**Placeholder scan:** the PR body in Task 4 is the only `"..."`; it is written at the time from the real diff, and its required contents are specified.

**Type consistency:** `size` is `'small' | 'medium' | 'large'` in Task 1 and read as those exact literals in Task 2. `SIZES` in the Task 1 test matches.
