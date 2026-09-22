# 100 Octane Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `OCTANE_OPTS[2]` (100 octane) real coverage in both test layers — intent
tests that pin its compression headroom, and fingerprint cells that hash its behaviour —
and remove the positional destructuring that let a fuel insertion go unnoticed.

**Architecture:** Two independent changes, deliberately committed separately because only
one of them moves the committed hash. Task 1 is test-only and leaves the fingerprint
untouched. Task 2 adds `2` to the three fuel loops in the fingerprint matrix and
regenerates the baseline, with a before/after report diff proving the addition is purely
additive.

**Tech Stack:** Vanilla ES modules, Vitest, Node 22 (nvm; `.nvmrc` pins it).

## Global Constraints

- **Node 20 or 22 only.** `scripts/update-fingerprint.js` refuses to write the hash on any
  other major. Verify with `node -v` before regenerating.
- **Intent tests assert direction and relationship, not magnitudes.** Exact dyno numbers
  belong to the fingerprint (CONTRIBUTING.md, "Writing tests"). Boundary compressions are
  the established idiom in `tests/scoring.test.js` and are acceptable; `expect(hp).toBe(235)`
  is not.
- **Never update the fixture just to make CI green.** The documented ritual is
  before-report → change → after-report → diff → regenerate (CONTRIBUTING.md,
  "The fingerprint test").
- **No bare magic numbers in `src/sim/`.** This plan touches no `src/sim/` file.
- **Comments explain why, not what.** This is a teaching codebase; match the surrounding
  density.
- Full check suite before the PR: `npm test`, `npm run lint`, `npm run typecheck`,
  `npm run build`. Lint runs `--max-warnings 0`.

## File Structure

- `tests/scoring.test.js` — Task 1. Replaces the positional destructure at line 115 with
  label lookups, adds three 100-octane tests to the existing
  `computeEngineerScore static compression under boost` block.
- `tests/fingerprint.js` — Task 2. Three `for (const fi of [0, 3])` loops become
  `[0, 2, 3]` (lines 161, 183, 210).
- `tests/fixtures/fingerprint.sha256` — Task 2. Regenerated, not hand-edited.

## Verified Baseline

Measured on `268951a` before any change, with `scripts/` untouched. The plan's assertions
come from these numbers, not from the issue text:

| fuel | bonus | onset (no cooler) | onset (intercooler) | cost @13.0 cooled |
|------|-------|-------------------|---------------------|-------------------|
| 91   | 0     | 10.9              | 11.3                | 15 (cap)          |
| 93   | 3     | 11.2              | 11.6                | 15 (cap)          |
| 100  | 8     | **11.7**          | **12.1**            | **10 (under cap)**|
| E85  | 14    | 12.3              | 12.7                | 4                 |

"Onset" is the first 0.1 step at which the static-compression deduction appears, so 100
octane's headroom is 11.6 dry and 12.0 cooled — clean at the headroom, deducted one step
past it. Committed hash on main reproduces exactly:
`692a7a95ebf2b202ef495038f9dddf967ab03a79838a06e71f5e44cfa3b74b52`.

---

### Task 1: Pin 100 octane in the intent tests, by label not position

**Files:**
- Modify: `tests/scoring.test.js:115` (the destructure) and the enclosing
  `computeEngineerScore static compression under boost` describe block
- Test: `tests/scoring.test.js` (this file is the test)

**Interfaces:**
- Consumes: `S.OCTANE_OPTS` (array of `{ label, bonus, octane, stoich, density, lhv }`),
  `S.computeEngineerScore`, `S.DEFAULT_MODS`, `S.DEFAULT_ENGINE_CONFIG`.
- Produces: `fuelByLabel(label)` local helper and the bindings `P91`, `P93`, `P100`, `E85`
  used by every test in this describe block. No exports change.

- [ ] **Step 1: Replace the positional destructure with label lookups**

In `tests/scoring.test.js`, replace this line (currently line 115):

```js
  const [P91, P93, , E85] = S.OCTANE_OPTS;
```

with:

```js
  /**
   * Looked up by label, never by position. The old positional destructure
   * (`const [P91, P93, , E85] = ...`) stepped over index 2 with a hole, so inserting a
   * fuel into OCTANE_OPTS silently rebound `E85` to its neighbour and every test here
   * kept passing while grading the wrong fuel. This is the same hazard the exhaust
   * diameter note in tests/fingerprint.js warns about — pin the physical quantity, not
   * its index — and it throws rather than yielding `undefined` so a renamed fuel fails
   * loudly at collection time instead of as a confusing property access later.
   */
  const fuelByLabel = (label) => {
    const fuel = S.OCTANE_OPTS.find((o) => o.label === label);
    if (!fuel) throw new Error(`no fuel labelled "${label}" in OCTANE_OPTS`);
    return fuel;
  };
  const P91 = fuelByLabel('91');
  const P93 = fuelByLabel('93');
  const P100 = fuelByLabel('100');
  const E85 = fuelByLabel('E85');
```

- [ ] **Step 2: Run the block to confirm the refactor changed nothing**

Run: `npx vitest run tests/scoring.test.js -t 'static compression under boost'`
Expected: PASS, same test count as before the edit (9 tests in this block).

- [ ] **Step 3: Add the three 100-octane tests**

Append these inside the same describe block, after the
`keeps a build exactly at the 93-plus-intercooler boundary clear of the deduction` test
and before the block's closing `});`:

```js
  // Issue #28: 100 octane sat between 93 and E85 in OCTANE_OPTS and was exercised by
  // neither layer — the destructure above skipped it and the fingerprint matrix ran
  // only [0, 3]. Its bonus of 8 is not a scaled copy of any other entry, so nothing
  // else in this file constrains the two headroom values it produces.
  it('gives 100 octane its own headroom, clean at it and deducted one step past it', () => {
    expect(hit(at(11.6, { fuel: P100, mods: NO_COOLER }))).toBeUndefined();
    expect(hit(at(11.7, { fuel: P100, mods: NO_COOLER }))).toBeDefined();
    expect(hit(at(12.0, { fuel: P100, mods: COOLED }))).toBeUndefined();
    expect(hit(at(12.1, { fuel: P100, mods: COOLED }))).toBeDefined();
  });

  // Written as a sweep over OCTANE_OPTS rather than four hand-named fuels, so that a
  // fuel added to the catalogue is graded by this test the day it lands instead of
  // slipping through the gap that #28 documents.
  it('orders every fuel on the headroom ladder by its octane bonus', () => {
    const onset = (fuel) => {
      for (let tenths = 85; tenths <= 130; tenths += 1) {
        if (hit(at(tenths / 10, { fuel, mods: NO_COOLER }))) return tenths / 10;
      }
      return Infinity;
    };
    const ladder = [...S.OCTANE_OPTS].sort((a, b) => a.bonus - b.bonus);
    const onsets = ladder.map(onset);
    expect(onsets.every(Number.isFinite), `a fuel never trips the rule: ${onsets}`).toBe(true);
    for (let i = 1; i < onsets.length; i += 1) {
      expect(
        onsets[i],
        `${ladder[i].label} (bonus ${ladder[i].bonus}) must buy at least as much `
        + `headroom as ${ladder[i - 1].label} (bonus ${ladder[i - 1].bonus})`,
      ).toBeGreaterThan(onsets[i - 1]);
    }
  });

  // The cap is reachable on 91 and 93 and not on 100 with charge cooling: it would take
  // 13.5:1 and the slider stops at 13.0. Worth pinning in both directions, because a
  // rule that silently saturated for every fuel would lose the gradient this block's
  // `scales the deduction` test exists to protect.
  it('leaves the penalty cap out of reach on 100 octane with an intercooler', () => {
    expect(hit(at(13.0, { fuel: P100, mods: COOLED }))).toBeDefined();
    expect(cost(at(13.0, { fuel: P100, mods: COOLED }))).toBeLessThan(15);
    expect(cost(at(13.0, { fuel: P91, mods: COOLED }))).toBe(15);
  });
```

- [ ] **Step 4: Run the new tests and confirm they pass**

Run: `npx vitest run tests/scoring.test.js -t 'static compression under boost'`
Expected: PASS, 12 tests (9 existing + 3 new).

- [ ] **Step 5: Prove the new tests can actually fail**

These pin behaviour that already works, so a green run is not evidence the tests bite.
Temporarily break the rule and confirm each new test goes red:

```bash
cp src/sim/coefficients.js /tmp/coeff.bak
sed -i '' 's/COMPRESSION_PER_OCTANE_DEG: 0.1,/COMPRESSION_PER_OCTANE_DEG: 0.0,/' src/sim/coefficients.js
npx vitest run tests/scoring.test.js -t 'static compression under boost'
```

Expected: FAIL. `gives 100 octane its own headroom` and
`orders every fuel on the headroom ladder` both fail — with the octane term zeroed, every
fuel shares one onset so the ladder is flat and 100's boundary moves to 91's.

Restore immediately and re-confirm green:

```bash
cp /tmp/coeff.bak src/sim/coefficients.js && rm /tmp/coeff.bak
git diff --quiet src/sim/coefficients.js && echo "restored clean"
npx vitest run tests/scoring.test.js -t 'static compression under boost'
```

Expected: `restored clean`, then PASS (12 tests).

- [ ] **Step 6: Confirm the fingerprint did NOT move**

This task is test-only. The hash must be untouched:

Run: `npx vitest run tests/fingerprint.test.js`
Expected: PASS (4 tests). If this fails, you edited something under `src/sim/` — revert
and find it before continuing.

- [ ] **Step 7: Commit**

```bash
git add tests/scoring.test.js
git commit -m "Look fuels up by label, and give 100 octane its own headroom tests

The positional destructure stepped over index 2 with a hole, so 100 octane
was graded by nothing and inserting a fuel would have silently rebound E85
to its neighbour with every test still green.

Refs #28"
```

---

### Task 2: Add 100 octane to the fingerprint matrix

**Files:**
- Modify: `tests/fingerprint.js:161`, `tests/fingerprint.js:183`, `tests/fingerprint.js:210`
- Modify: `tests/fixtures/fingerprint.sha256` (regenerated by script, never hand-edited)

**Interfaces:**
- Consumes: `buildFingerprint(S)` and `serialiseFingerprint` from `tests/fingerprint.js`;
  the before-report saved in Task 0 of this plan's execution.
- Produces: a new committed hash, plus a purely-additive proof to paste into the PR body.

- [ ] **Step 1: Capture the before-report (skip if already saved)**

```bash
node -v   # must print v20.x or v22.x
node scripts/update-fingerprint.js --report
git diff --quiet tests/fixtures/fingerprint.sha256 && echo "REPRODUCED main's hash"
mv fingerprint.report.json /tmp/before.report.json
```

Expected: `REPRODUCED main's hash`. If the fixture came back modified, your toolchain does
not reproduce the committed baseline — stop, and do not regenerate anything.

- [ ] **Step 2: Add index 2 to all three fuel loops**

There are three, not one. Change each `for (const fi of [0, 3]) {` to
`for (const fi of [0, 2, 3]) {`:

```bash
sed -i '' 's/for (const fi of \[0, 3\]) {/for (const fi of [0, 2, 3]) {/' tests/fingerprint.js
grep -n "const fi of" tests/fingerprint.js
```

Expected: three lines, each reading `for (const fi of [0, 2, 3]) {`.

- [ ] **Step 3: Update the matrix-size note if one states a fuel count**

```bash
grep -n "fuel" tests/fingerprint.js | grep -i "two\|2 fuel\|matrix"
```

If a comment states how many fuels the matrix runs, correct it to three. If nothing
matches, there is nothing to update — move on.

- [ ] **Step 4: Watch the fingerprint test fail, which is the point**

Run: `npx vitest run tests/fingerprint.test.js`
Expected: FAIL on the committed-hash comparison. This is the gate doing its job: the
matrix now covers cells the baseline never hashed.

- [ ] **Step 5: Generate the after-report and prove the change is purely additive**

```bash
node scripts/update-fingerprint.js --report
mv fingerprint.report.json /tmp/after.report.json
```

Then run this comparison — it is the evidence the issue asks for, that cells were only
added and none moved:

```bash
node --input-type=module -e '
const { readFileSync } = await import("node:fs");
const before = JSON.parse(readFileSync("/tmp/before.report.json", "utf8"));
const after  = JSON.parse(readFileSync("/tmp/after.report.json", "utf8"));
let moved = 0, added = 0, removed = 0, kept = 0;
for (const section of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const b = before[section] ?? {}, a = after[section] ?? {};
  if (typeof b !== "object" || typeof a !== "object") continue;
  for (const k of Object.keys(b)) {
    if (!(k in a)) { removed += 1; console.log("REMOVED", section, k); continue; }
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      moved += 1;
      if (moved <= 5) console.log("MOVED", section, k);
    } else kept += 1;
  }
  for (const k of Object.keys(a)) if (!(k in b)) added += 1;
}
console.log({ kept, added, moved, removed });
console.log(moved === 0 && removed === 0 ? "PURELY ADDITIVE" : "NOT ADDITIVE - STOP");
'
```

Expected: `PURELY ADDITIVE`, with `moved: 0, removed: 0` and `added` equal to the count of
new `fuel=100` cells. The matrix keys embed `fuel=${label}`, not the index, so existing
91 and E85 cells keep their keys — if `moved` is non-zero, something in `src/sim/` changed
and that must be explained before the hash is committed.

Record the printed `{ kept, added, moved, removed }` line and the new hash; both go in the
PR body.

- [ ] **Step 6: Confirm the regenerated hash now passes**

Run: `npx vitest run tests/fingerprint.test.js`
Expected: PASS (4 tests). Note the wall time — the matrix grew by half, so expect roughly
100–110s where it was ~70s.

- [ ] **Step 7: Commit**

```bash
git add tests/fingerprint.js tests/fixtures/fingerprint.sha256
git commit -m "Hash 100 octane too, instead of only the ends of the shelf

The matrix ran fuel indices [0, 3], so the one fuel whose bonus is not a
scaled copy of another went unhashed. Keys embed the fuel label rather than
its index, so the added cells move nothing: 0 cells changed, 0 removed.

Refs #28"
```

---

### Task 3: Full suite, re-sync, and PR

**Files:** none modified; this task is verification and delivery.

- [ ] **Step 1: Run the whole check suite**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all four clean. `lint` runs `--max-warnings 0`, so a warning is a failure.
Paste the real output; a claim without output is not a result.

- [ ] **Step 2: Re-sync on the base branch**

```bash
git fetch origin
git rebase origin/main
```

If `tests/fixtures/fingerprint.sha256` conflicts, do **not** pick a side — the fixture is
generated. Take the rebased tree, rerun `node scripts/update-fingerprint.js --report`, and
redo the additive comparison in Task 2 Step 5 against a before-report taken from the new
base.

- [ ] **Step 3: Re-run the suite after the rebase**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all clean. A pre-rebase green says nothing about the post-rebase tree.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin fix/28-100-octane-coverage
gh pr create --title "Cover 100 octane in both test layers" --body "..."
```

The body states what moved, the additive proof from Task 2 Step 5, the old and new
hashes, and `Closes #28`.

- [ ] **Step 5: STOP**

Hand the PR URL to the user. Do not merge, and check no auto-merge is queued:

```bash
gh pr view <N> --json autoMergeRequest
```
