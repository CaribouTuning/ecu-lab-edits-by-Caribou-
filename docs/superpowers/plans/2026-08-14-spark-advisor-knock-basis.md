# Spark Advisor Knock Basis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `calibrationAdvice` judge knock at the pressure the table row is indexed by, so the app stops telling the player that a factory calibration it generated itself is beyond the knock limit.

**Architecture:** The spark table is indexed by manifold pressure, so the 100 kPa row *is* the calibration for 100 kPa. `factoryCalibration` already writes every cell at the row's own pressure (`presets.js:426-434`). `calibrationAdvice` instead re-derives a manifold pressure from the RPM axis and the boost curve (`advisors.js:107-108`), so on a boosted engine it grades the vacuum rows as though they were being run at full boost. The fix deletes that re-derivation and evaluates at `mapRow`, which is the same basis the MBT half already uses (`advisors.js:131-136`, aligned by issue #4). Because the advisor is currently outside the behavioural fingerprint, the fingerprint gains a `calibrationAdvice` section **first**, so the fix lands as a visible, diffable hash change rather than an invisible one.

**Tech Stack:** Plain ES modules, Vitest, ESLint 9, `tsc --checkJs` for JSDoc types. Node 20+.

## Global Constraints

- **Nothing adds horsepower.** Every change must express itself as airflow, pressure, temperature or fuel delivery (`CONTRIBUTING.md`). This plan changes only *which pressure an existing physics call is evaluated at* — it adds no term and no multiplier.
- **The app never silently rewrites the player's tables.** The advisors report the gap; they never close it. No task here may make an advisor mutate anything.
- Physics lives in `src/sim/`. No engineering maths in `src/ui/`.
- Empirical numbers live in `src/sim/coefficients.js` with a comment. No bare magic numbers elsewhere in `src/sim/`. **This plan introduces no new coefficient.**
- Intent tests (`tests/physics.test.js`) assert direction and relationship, never exact magnitudes. Magnitudes belong to the fingerprint.
- JSDoc on anything exported from `src/sim/`.
- Comments explain **why**, not what. This is a teaching codebase; keep the existing comment density.
- Never update the fingerprint fixture just to make CI green. Each update here must be accompanied by a stated reason in the commit message.
- Full check suite before the PR: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Branch: `fix/33-spark-advisor-knock-basis`. Never commit to `main`.

## Measured Baseline (verified on `main` @ c69f664)

`calibrationAdvice` run against each preset's own `applyPreset` output, wired exactly as `src/ui/EcuLab.jsx:708-713` wires it (`mafScalar: 1`, `mafErrorBase` from `mafErrorFactor`):

| preset | peak boost | `overAdvanced` | of which `knocking` |
|---|---|---|---|
| vq35de-revup | NA | 0 | 0 |
| vq35hr | NA | 0 | 0 |
| n54 | 8.5 psi | 0 | 0 |
| b58-m0 | 13 psi | 4 | 3 |
| b58-m1 | 17 psi | 10 | 8 |
| ea888-gti | 14 psi | 5 | 4 |
| ea888-r | 17 psi | 9 | 8 |

Issue #33's own figures (b58-m1: 3, ea888-r: 5) were measured with `mafErrorBase: 1`, which the running app never uses for a turbo build. **The issue understates the defect; these are the numbers to quote.**

Patching `advisors.js:108` to `useMap = mapRow` takes all seven presets to `overAdvanced: 0` and `pastMbt: 0`. Naturally aspirated builds are provably unaffected: with `boostPsi === 0`, `computeManifold` returns `Math.min(loadKpa, BARO_KPA)`, already identical to `mapRow` for every sub-atmospheric row.

## What issue #33 got right and wrong

- **Right:** the diagnosis (two sides disagree about what pressure a row means), the location (`advisors.js:105-108` vs `presets.js:273-284`, now `presets.js:426-434` after the B58 merge), and the chosen direction (the row means its own MAP).
- **Wrong — the line numbers.** The B58 merge (c415724) moved `factoryCalibration`; the generator's comment now sits at `presets.js:426-434`.
- **Wrong — "only `ea888-r` is affected".** Four of seven presets are affected. See the baseline table.
- **Wrong — "it wants a fingerprint diff".** `tests/fingerprint.js` never calls `calibrationAdvice`, so as things stand the fix produces a byte-identical hash. Task 1 exists to make that expectation true before the fix lands.

## File Structure

- `tests/fingerprint.js` — **modify.** Add an `out.calibrationAdvice` section after the existing `out.factoryCalibration` block (currently ends line 214). Same shape as its neighbour: iterate `S.ENGINE_PRESETS`, record a rounded, deterministic summary.
- `tests/fixtures/fingerprint.sha256` — **regenerate**, twice: once in Task 1 (new section = new hash, purely additive coverage) and once in Task 2 (the behavioural change itself).
- `src/sim/advisors.js` — **modify** lines 105-109 and the comment block at 117-136. Delete the `computeManifold`/`useMap` re-derivation. Remove the now-unused `computeManifold` and `interp1` imports if nothing else in the file uses them.
- `tests/physics.test.js` — **modify** two tests:
  - `does not call a factory spark table wasteful on the engine it was written for` (line 774) — rename, strengthen to assert `overAdvanced` as well as `pastMbt`, and use realistic MAF error. Its comment currently *documents this gap as known*; that paragraph must go.
  - `never calls a detonating cell safe` (line 766) — re-fixture from 5 psi to 8 psi. Measured, not anticipated: at 5 psi the test's premise stops holding once the fix lands, because it was relying on the bug. Full reasoning in Task 2 Steps 5-6.

---

### Task 1: Put the advisor inside the fingerprint

**Files:**
- Modify: `tests/fingerprint.js:198-214` (insert after the `factoryCalibration` block)
- Modify: `tests/fixtures/fingerprint.sha256` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `S.ENGINE_PRESETS`, `S.applyPreset`, `S.calibrationAdvice`, `S.deriveEngine`, `S.mafErrorFactor`, `S.OCTANE_OPTS`, `S.COMPRESSOR_OPTS`, `S.TURBINE_OPTS`, `S.INJECTOR_OPTS` — all already re-exported from `src/sim/index.js`.
- Produces: `out.calibrationAdvice[presetId] = { overAdvanced: number, pastMbt: number, underAdvanced: number, wrongMix: number, knocking: number, spark: Array<{ri, ci, current, suggested, mbt, knockCeiling, knockLimited, knocking}> }`. Task 2 relies on this section existing so its hash change is visible.

- [ ] **Step 1: Confirm the advisor is currently ungated**

Run:
```bash
grep -c "calibrationAdvice" tests/fingerprint.js
```
Expected: `0`. If it is not 0, stop — someone has already done this task and the plan needs re-reading.

- [ ] **Step 2: Record the pre-change hash**

```bash
cat tests/fixtures/fingerprint.sha256
```
Write the value down. Task 1 must change it (a new section is new content); Task 2 must change it again.

- [ ] **Step 3: Add the section**

In `tests/fingerprint.js`, immediately after the closing `}` of the `factoryCalibration` loop (currently line 214) and before the `// ---- helpers ----` comment, insert:

```js
  // ---- calibrationAdvice: what the spark and fuel advisors SAY about every shipped
  // preset's own factory calibration. The advisors are what the player actually reads
  // in TUNE, and until now nothing in this matrix called them at all — so the whole
  // advisory layer could change what it tells people with no hash movement and no
  // review. Gating the advice itself, rather than the constants behind it, means a
  // future ceiling or tolerance added to advisors.js is covered without a matching
  // addition here.
  //
  // Wired exactly as src/ui/EcuLab.jsx wires it, MAF error included. That matters:
  // passing mafErrorBase 1 makes a turbo build's delivered mixture richer than the
  // factory table intends, which lifts the knock threshold and hides real cells. The
  // app never does that, so neither does this.
  out.calibrationAdvice = {};
  for (const preset of S.ENGINE_PRESETS) {
    const p = S.applyPreset(preset);
    const fuel = S.OCTANE_OPTS[p.octaneIdx];
    const advice = S.calibrationAdvice({
      ve: p.ve, veTruth: p.ve, timing: p.timing, afr: p.afr,
      derived: S.deriveEngine(p.engineConfig), octaneBonus: fuel.bonus, fuel,
      mods: p.mods, turboOn: p.turboOn, boostCurve: p.boostCurve,
      compressor: S.COMPRESSOR_OPTS[p.compressorIdx],
      turbine: S.TURBINE_OPTS[p.turbineIdx],
      injectorCc: S.INJECTOR_OPTS[p.injIdx].cc, ecuInjectorCc: p.ecuInjectorCc,
      mafScalar: 1.0, mafErrorBase: S.mafErrorFactor(p.mods, p.turboOn),
    });
    out.calibrationAdvice[preset.id] = {
      overAdvanced: advice.overAdvanced.length,
      pastMbt: advice.pastMbt.length,
      underAdvanced: advice.underAdvanced.length,
      wrongMix: advice.wrongMix.length,
      knocking: advice.spark.filter((c) => c.knocking).length,
      spark: advice.spark.map((c) => ({
        ri: c.ri, ci: c.ci,
        current: r6(c.current), suggested: r6(c.suggested),
        mbt: r6(c.mbt), knockCeiling: r6(c.knockCeiling),
        knockLimited: c.knockLimited, knocking: c.knocking,
      })),
    };
  }
```

`veTruth: p.ve` is correct rather than a shortcut: `factoryCalibration` sets `ve = computeHardwareVE(preset.engine, preset.mods, hardwareFor(preset))` (`presets.js:424`), and `hardwareFor` (`presets.js:399-408`) builds the identical hardware object the UI's `hwForVe` memo builds. The two are the same array by construction.

- [ ] **Step 4: Run the fingerprint test and watch it fail**

Run: `npx vitest run tests/fingerprint.test.js`
Expected: **FAIL** — the committed hash no longer matches, because the serialised blob now carries a section it did not before. This failure is the proof the new section is actually being hashed. If it PASSES, the section was inserted outside the returned object; fix the placement before continuing.

- [ ] **Step 5: Regenerate the fixture and confirm the suite is green**

```bash
npm run test:fingerprint:update
npm test
```
Expected: the update prints a new hash different from the one recorded in Step 2; `npm test` then passes in full.

This is a legitimate fixture update under `CONTRIBUTING.md`'s rule — the physics has not moved, the *matrix* has grown. Say exactly that in the commit message.

- [ ] **Step 6: Save the pre-fix report for the Task 2 diff**

```bash
node scripts/update-fingerprint.js --report
cp fingerprint.report.json "$SCRATCH/fingerprint.before.json"
```

where `$SCRATCH` is this session's scratchpad directory. Note that `update-fingerprint.js` **always rewrites `tests/fixtures/fingerprint.sha256`**, `--report` or not — `--report` only adds the JSON dump. Here that is harmless, because Step 5 already wrote the same hash. In Task 2 it matters; see that task's Step 6.

`fingerprint.report.json` is gitignored (`.gitignore:6`). The copy is what Task 2 diffs against to state what moved.

- [ ] **Step 7: Commit**

```bash
git add tests/fingerprint.js tests/fixtures/fingerprint.sha256
git commit -m "Bring the advisors inside the behavioural fingerprint

calibrationAdvice was never called by tests/fingerprint.js, so the whole
advisory layer — the part of the app the player actually reads in TUNE —
could change what it says with no hash movement and no review.

Hash moves because the matrix gained a section, not because any physics
changed. Wired with the real MAF error the UI passes; mafErrorBase 1
would enrich a turbo build past what its factory table intends and hide
cells that genuinely knock."
```

---

### Task 2: Judge knock at the row's own pressure

**Files:**
- Modify: `src/sim/advisors.js:105-136`
- Modify: `tests/physics.test.js:774-799`
- Modify: `tests/fixtures/fingerprint.sha256` (regenerated)

**Interfaces:**
- Consumes: the `out.calibrationAdvice` fingerprint section from Task 1.
- Produces: no signature change. `calibrationAdvice`'s parameters and return shape are untouched; only the pressure at which each cell is evaluated changes.

- [ ] **Step 1: Write the failing test**

In `tests/physics.test.js`, replace the entire `it('does not call a factory spark table wasteful on the engine it was written for', ...)` block (starts line 774) with:

```js
  it('does not condemn a factory calibration on the engine it was written for', () => {
    // `factoryCalibration` writes spark from the same min(MBT, knock ceiling) rule the
    // advisor advises against, and both now take BOTH ceilings at the table row's own
    // pressure. They must not disagree: the red panel means "your hardware will not
    // tolerate this", and an untouched factory tune must never trip it.
    //
    // The MBT half was aligned by issue #4. The knock half is issue #33: the advisor
    // used to re-derive a manifold pressure from the RPM axis and the boost curve, so
    // on a boosted engine it graded the VACUUM rows as though they were being run at
    // full boost — 28 cells across four presets.
    //
    // MAF error is passed as the app passes it. `mafErrorBase: 1` would make a turbo
    // build's delivered mixture richer than its factory table intends, lifting the
    // knock threshold and masking most of those cells; an earlier version of this test
    // did exactly that and saw only 8.
    for (const preset of S.ENGINE_PRESETS) {
      const p = S.applyPreset(preset);
      const fuel = S.OCTANE_OPTS[p.octaneIdx];
      const a = S.calibrationAdvice({
        ve: p.ve, veTruth: p.ve, timing: p.timing, afr: p.afr,
        derived: S.deriveEngine(p.engineConfig), octaneBonus: fuel.bonus, fuel,
        mods: p.mods, turboOn: p.turboOn, boostCurve: p.boostCurve,
        compressor: S.COMPRESSOR_OPTS[p.compressorIdx],
        turbine: S.TURBINE_OPTS[p.turbineIdx],
        injectorCc: S.INJECTOR_OPTS[p.injIdx].cc, ecuInjectorCc: p.ecuInjectorCc,
        mafScalar: 1, mafErrorBase: S.mafErrorFactor(p.mods, p.turboOn),
      });
      expect(a.overAdvanced, `${preset.id} called its own factory spark table dangerous`).toHaveLength(0);
      expect(a.pastMbt, `${preset.id} called its own factory spark table wasteful`).toHaveLength(0);
      // The advisor must not have gone quiet by declaring the cells safe instead: no
      // cell of a factory calibration should be detonating on its own factory hardware.
      expect(a.spark.filter((c) => c.knocking), `${preset.id} detonates on its own factory tune`).toHaveLength(0);
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/physics.test.js -t "does not condemn a factory calibration"`
Expected: **FAIL**, first on `b58-m0 called its own factory spark table dangerous: expected length 4 to be 0`.

- [ ] **Step 3: Make the change**

In `src/sim/advisors.js`, replace lines 105-109:

```js
    RPM.forEach((rpm, ci) => {
      const boostTarget = turboOn ? interp1(RPM, boostCurve, rpm) : 0;
      const man = computeManifold(rpm, Math.min(mapRow, BARO_KPA), turboOn, boostTarget, turbine, compressor);
      const useMap = mapRow > BARO_KPA ? mapRow : man.mapKpa;
      const boostPsi = Math.max(0, (useMap - BARO_KPA) / PSI_TO_KPA);
```

with:

```js
    RPM.forEach((rpm, ci) => {
      // A row is judged at ITS OWN pressure, both here and in `factoryCalibration`.
      //
      // The tables are indexed by manifold pressure, so the 100 kPa row is not "what
      // happens at 3500 RPM" — it is the calibration the ECU applies whenever MAP is
      // 100 kPa, whatever the RPM. This used to re-derive a manifold pressure from the
      // RPM axis and the boost curve instead, which on a boosted engine graded the
      // vacuum rows against a boosted ceiling: at 3500 RPM a 17 psi engine sits near
      // 218 kPa, so the 70 and 100 kPa rows were condemned for timing that is perfectly
      // safe at the pressure they actually apply at. Four of seven shipped presets
      // failed their own factory calibration that way.
      //
      // MBT was aligned to the row pressure by issue #4; this is the knock half of the
      // same disagreement (issue #33). Both ceilings now share one basis, and that
      // basis is the one `factoryCalibration` generates against — see presets.js.
      const boostPsi = Math.max(0, (mapRow - BARO_KPA) / PSI_TO_KPA);
```

Then update the two references that follow. At line 111, `mapKpa: useMap` becomes `mapKpa: mapRow`. At lines 131-136, the MBT comment block now describes shared behaviour rather than a lone exception — replace it with:

```js
      // Both ceilings are taken at the row's own pressure; see the note above.
      const mbt = mbtTiming(rpm, mapRow);
```

- [ ] **Step 4: Remove the imports that are now dead**

Check whether `computeManifold` and `interp1` are still used anywhere in `advisors.js`:

```bash
grep -n "computeManifold\|interp1" src/sim/advisors.js
```
Expected after Step 3: only the two import lines. Delete `import { computeManifold } from './manifold.js';` (line 14) and drop `interp1` from the `./math.js` import on line 13, leaving `import { clamp } from './math.js';`.

`BARO_KPA` and `PSI_TO_KPA` are both still used (`maxReachable` on line 102, `boostPsi` above), so leave line 10 alone.

Then run lint on this file specifically and **read the output** — `npm run lint` is bare `eslint .` with no `--max-warnings 0` (issue #26), so a new unused-variable warning will not fail anything:

```bash
npx eslint src/sim/advisors.js
```
Expected: no output at all. Any warning here is a leftover from Step 3 and must be resolved before committing, not deferred to Task 3.

`compressor` is still passed to `evaluatePoint` and stays. For `turbine` — which this change makes dead — follow the pre-flight decision recorded in the progress ledger.

- [ ] **Step 5: Run the test to verify it passes, and expect exactly one neighbour to fail**

Run: `npx vitest run tests/physics.test.js`
Expected: 89 pass, **1 fails** — `the spark advisor > never calls a detonating cell safe`, with `AssertionError: expected 0 to be greater than 0` at line 768. This has been measured, not guessed. Do not treat it as a regression, and do not weaken the assertion.

Why it fails: that test builds its case at 5 psi. `maxReachable` (`advisors.js:102`) is then `101.325 + 5×6.895 + 2 ≈ 137.8`, so of the six `LOAD` rows `[200, 150, 100, 70, 40, 20]` only the four at or below 100 kPa are advised at all. Under the old basis those vacuum rows were graded at a boosted pressure and duly "detonated". Under the correct basis none of them do — a stock engine running 5 psi genuinely does not detonate at 70 kPa.

**That is the bug, showing up in a test that depended on it.** The test's intent — a cell that is actually detonating must never be filed as merely wasteful — is still exactly right and must be kept. It needs a fixture in which a detonating cell genuinely exists. At 8 psi the 150 kPa row becomes reachable (`101.325 + 8×6.895 ≈ 156.5`) and produces 6 knocking cells on the stock timing table; verified 90/90 green with that single change.

- [ ] **Step 6: Re-fixture the neighbouring test at 8 psi**

In `tests/physics.test.js` (line 766), change the boost and document why it is not 5:

```js
    // 8 psi, not 5, because `maxReachable` must bring the 150 kPa row into range for a
    // genuinely detonating cell to exist at all. At 5 psi only the rows at and below
    // 100 kPa are advised, and a stock engine at 5 psi does not really detonate in
    // vacuum — it only appeared to before #33, when the advisor graded those rows at a
    // boosted pressure they never actually run at. The assertion below is unchanged;
    // it just needs a case where the danger is real.
    const boosted = advice({ turboOn: true, boostCurve: S.RPM.map(() => 8) });
```

Run: `npx vitest run tests/physics.test.js`
Expected: **90 passed**. `still respects the knock limit where knock is what binds` (12 psi) and `is self-consistent` need no change — verified.

- [ ] **Step 7: Confirm the fingerprint moved, and state what moved**

Run: `npm test`
Expected: `tests/fingerprint.test.js` **FAILS**. That failure is the point of Task 1 — the advisor change is now visible to the audit gate. Under `CONTRIBUTING.md` this is case 2, "you did mean to change the physics", so produce the diff before accepting it.

**Be aware: `update-fingerprint.js` rewrites the fixture every time it runs.** There is no report-only mode. So this command both regenerates the hash and dumps the report, and the review below happens *after* the write — if the review fails, `git checkout tests/fixtures/fingerprint.sha256` puts it back.

```bash
node scripts/update-fingerprint.js --report
```

Now diff the two reports. Python, to match `scripts/analyze_presets.py` and because `node -e` module resolution is ambiguous under this package's `"type": "module"`:

```bash
python3 - <<'EOF'
import json, os
scratch = os.environ["SCRATCH"]
a = json.load(open(f"{scratch}/fingerprint.before.json"))
b = json.load(open("fingerprint.report.json"))
for pid, y in b["calibrationAdvice"].items():
    x = a["calibrationAdvice"][pid]
    moved = sum(1 for i, c in enumerate(y["spark"]) if c["suggested"] != x["spark"][i]["suggested"])
    print(f'{pid:<14} overAdvanced {x["overAdvanced"]:>2} -> {y["overAdvanced"]:<2}'
          f' | pastMbt {x["pastMbt"]:>2} -> {y["pastMbt"]:<2}'
          f' | knocking {x["knocking"]:>2} -> {y["knocking"]:<2}'
          f' | suggestions moved: {moved}')
changed = [k for k in b if json.dumps(a.get(k), sort_keys=True) != json.dumps(b[k], sort_keys=True)]
print("sections changed:", ", ".join(changed))
EOF
```

Expected: `overAdvanced` falls to 0 for all seven presets, and **`sections changed: calibrationAdvice`** and nothing else. If any other section moved — `simulateSweep`, `factoryCalibration`, `constants` — this change has leaked out of the advisor and into the physics. Restore the fixture with `git checkout tests/fixtures/fingerprint.sha256`, then stop and use superpowers:systematic-debugging. The advisor must not be able to move a dyno number.

Paste that output into the PR body. Then confirm the suite:

```bash
npm test
```
Expected: full suite green, fixture already written by the `--report` run above.

- [ ] **Step 8: Commit**

```bash
git add src/sim/advisors.js tests/physics.test.js tests/fixtures/fingerprint.sha256
git commit -m "Judge a spark cell's knock at the pressure its row is indexed by

The spark table is indexed by manifold pressure, so the 100 kPa row is the
calibration for 100 kPa. The advisor instead re-derived a manifold pressure
from the RPM axis and the boost curve, then graded the vacuum rows against
it — so on a 17 psi engine the 70 and 100 kPa rows were condemned for timing
that is safe at the pressure they actually apply at.

Four of seven shipped presets failed their own factory calibration this way:
b58-m0 4 cells, b58-m1 10, ea888-gti 5, ea888-r 9. All now clean, with no
cell reclassified as merely wasteful and none detonating.

MBT was moved to this basis by #33's sibling, issue #4. This is the knock
half, so both ceilings and the generator in presets.js now agree.

'never calls a detonating cell safe' is re-fixtured from 5 psi to 8. Its
assertion is unchanged; at 5 psi only the rows at and below 100 kPa are
reachable, and those stop detonating once judged at their own pressure —
the test had been leaning on the very defect this commit removes. 8 psi
brings the 150 kPa row into range, where the danger is real.

Fingerprint moves in the calibrationAdvice section only. No dyno figure,
no generated table and no coefficient changed.

Closes #33"
```

---

### Task 3: Full verification and PR

**Files:** none modified — this task is the gate.

- [ ] **Step 1: Run the complete check suite**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
All four must pass. Note that `npm run lint` is bare `eslint .` with no `--max-warnings 0` (issue #26), so **read its output** rather than trusting its exit code — a new unused-import warning from Task 2 Step 4 would pass CI silently.

- [ ] **Step 2: Invoke superpowers:verification-before-completion**

Paste the real output of all four commands into the transcript. A claim of "tests pass" with no output is not a result.

- [ ] **Step 3: Re-sync with main**

```bash
git fetch origin
git rebase origin/main
```
`main` moves often here — it took two merges on the day this plan was written. If `tests/fixtures/fingerprint.sha256` conflicts, **do not pick a side**: take the incoming `main` version, re-run `npm test` to see it fail, then regenerate with `npm run test:fingerprint:update` and re-derive the Task 2 Step 6 diff against the new base. Then re-run Step 1 in full — a pre-rebase green says nothing about the post-rebase tree.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin fix/33-spark-advisor-knock-basis
```

The PR body must carry: the baseline table, the corrected cell counts and why they differ from the issue's, the Step 6 fingerprint diff showing `calibrationAdvice` as the only section that moved, and `Closes #33`. Flag for CaribouTuning explicitly — `CONTRIBUTING.md` makes him the authority on anything touching the physics or the teaching material, and issue #33 asks for his read by name.

- [ ] **Step 5: Stop**

Do not merge. Check no auto-merge is queued:

```bash
gh pr view <N> --json autoMergeRequest
```
If it is non-null, `gh pr merge <N> --disable-auto`. Hand the user the PR URL.
