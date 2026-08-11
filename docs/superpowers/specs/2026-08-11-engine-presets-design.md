# Pre-configured engine presets

**Status:** approved, ready for implementation plan
**Branch:** `feat/engine-presets`
**Date:** 2026-08-11

## Problem

Every session starts on the same generic 3.5 L V6, and the only way to get a
different engine is to move six sliders and guess at plausible values. A player who
knows cars cannot sit down and drive something they recognise, and a player who does
not know cars has no reference point for what a real engine's numbers look like.

## Goal

Ship four recognisable factory engines the player can select and immediately run,
each arriving with correct hardware, a plausible factory calibration, and a dyno
result that lands near its real published rating.

Selecting a preset must teach something the sliders cannot: that these numbers
belong together, and that a factory calibration is a deliberate, conservative
starting point rather than an optimum.

## Non-goals

- Reproducing real OEM binary calibrations. Those are not publicly available in a
  form this project can source or ship. See "Calibration authenticity" below.
- Modelling engine balance, NVH, packaging or manifold geometry.
- A car/chassis layer. Presets are engines, not vehicles.
- Per-preset unlock, progression or economy.

---

## The four presets

| | VQ35HR | N54 | EA888.3 GTI | EA888.3 Golf R |
|---|---|---|---|---|
| Manufacturer | Nissan | BMW | Volkswagen | Volkswagen |
| Layout | V6 | **I6** | I4 | I4 |
| Bore x stroke, mm | 95.5 x 81.4 | 84.0 x 89.6 | 82.5 x 92.8 | 82.5 x 92.8 |
| Displacement | 3.50 L | 2.98 L | 1.98 L | 1.98 L |
| Compression | 10.6:1 | 10.2:1 | 9.6:1 | 9.6:1 |
| Induction | naturally aspirated | twin-turbo, 8.7 psi | IS20 turbo | IS38 turbo, 17.4 psi |
| Block / head | aluminium / aluminium | aluminium / aluminium | cast iron / aluminium | cast iron / aluminium |
| Factory power | 306 hp @ 6800 | 302 hp @ 5800 | 220 hp | 292 hp |
| Factory torque | 268 lb-ft @ 4800 | 295 lb-ft, 1400-5000 | 258 lb-ft from 1500 | 280 lb-ft |
| Redline | 7500 | 7000 | 6500 | 6800 |

Sources are recorded inline in `presets.js` beside each figure.

Two EA888.3 variants ship deliberately: same short block, different turbo and
calibration, two very different cars. That contrast is the clearest demonstration in
the app that induction and calibration — not displacement — decide what an engine is.

### Displacement check

Computed through the existing `deriveEngine` formula, all four land on their real
published displacement:

- VQ35HR: 3.50 L (real 3498 cc)
- N54: 2.98 L (real 2979 cc)
- EA888.3: 1.98 L (real 1984 cc)

---

## Architecture

### New module: `src/sim/presets.js`

Pure data and pure functions. No React import, consistent with the rest of
`src/sim/`. Exported from `src/sim/index.js`.

```
ENGINE_PRESETS: Preset[]
applyPreset(preset) -> StatePatch
factoryCalibration(preset) -> { ve, timing, afr }
```

A `Preset` carries:

- identity: `id`, `name`, `manufacturer`, `years`, `blurb`
- `factory`: `crankHp`, `crankHpRpm`, `crankTq`, `crankTqRpm`, `redline` — the
  published figures, used by the validation tests and displayed in the UI
- `engine`: a full `EngineConfig` including the new `redline` field
- `induction`: `turboOn`, `turbineIdx`, `compressorIdx`, `boost`
- `parts`: `injectorIdx`, `exhaustDiaIdx`, `octaneIdx`, `mods`

`applyPreset` returns a complete state patch. The UI applies it in one update rather
than assembling engine state itself, so preset behaviour is testable without
rendering anything.

**Boost curves must be built with `RPM.map(...)`, never array literals.** A
hand-written literal with the wrong number of entries previously put `NaN` through
the entire simulation (see the comment at `EcuLab.jsx:1496`). This rule is
non-negotiable in preset data.

### Calibration authenticity

Real OEM calibration binaries (Siemens Simos 18.1, BMW MSD80) are not publicly
available in a form this project can source or legally ship. "Factory calibration"
here means a **reconstruction** built from what is publicly documented — factory
boost, compression, published power and torque peaks and their RPM, and typical OEM
wide-open-throttle lambda — and then **validated against the real power figures by
test**.

The reconstruction is honest about what it is, and the tests make the claim
falsifiable rather than decorative. The UI wording must say "factory calibration"
without implying a dumped OEM binary.

### Deriving the calibration, rather than hand-authoring it

Twelve hand-typed tables would be unmaintainable and would drift from the physics
the moment a coefficient changed. Instead each factory calibration is generated:

- **VE** — `computeHardwareVE(preset.engine, preset.mods, hw)`. Already exists.
- **SPARK** — walk the RPM x MAP grid, compute that engine's own knock threshold,
  and write `threshold - FACTORY_KNOCK_MARGIN` (2 degrees). This is what a factory
  calibration actually is: knock-limited with a safety margin. It is automatically
  correct for each engine's compression, octane and boost, and it cannot drift from
  the physics.
- **FUEL** — `bestPowerAfr(boost at that cell)` in the high-load rows, 14.7 at
  cruise, matching real OEM open/closed-loop behaviour.

The result is a **safe but beatable** starting tune, which makes "beat the factory
calibration" the exercise — what tuners actually do.

#### Required refactor

The knock threshold is currently computed inline inside `evaluatePoint`
(`point.js:114-146`). It must be extracted as a pure exported `knockThreshold()`
so the calibration generator and `evaluatePoint` share one definition. Two copies of
this formula would be exactly the divergence `idealExhaustDiameter` was created to
prevent (`hardware.js:104-110`).

This refactor must not change any existing dyno number. `evaluatePoint` calls the
extracted function and behaviour is identical; the fingerprint test is the proof.

### Configuration physics: adding I6

`configuration` currently means only "cylinder count". Adding I6 without more would
make an I6 and a V6 numerically identical, which is not defensible in a car app.

Research found **no measured VE or airflow advantage** for an I6 over a V6 — every
such claim located was forum-grade with no data. Inventing a `VE_INLINE_BONUS` would
be precisely the fudge factor `coefficients.js` instructs contributors not to add.

What the data does support is **friction**, through two mechanisms:

1. **Main bearing count** — an architectural fact:
   `MAIN_BEARINGS = { I4: 5, I6: 7, V6: 4, V8: 5 }`. Crankshaft bearings are a
   sourced share of engine friction (~9% of friction power in one published
   breakdown, ~25% in another, rising with speed). The I6 **pays** for its seven
   mains against the V6's four.
2. **Balance shafts** — an I4 at or above ~1.8 L carries them (confirmed: the
   EA888.3 has two chain-driven counter-rotating shafts); I6, V6 and V8 do not. The
   National Academies' fuel-economy technology report records that Ford's removal of
   the balance shaft from its 1.0 L three-cylinder "reduced friction by 6 percent",
   which sizes the coefficient.

Consequences, all of them intended:

- The I6's genuine advantage is over the **I4**, arriving through the correct
  physical mechanism rather than an invented breathing bonus.
- The I6 is **not** a free upgrade over the V6, matching both the data and the app's
  trade-off ethos.
- The baseline is anchored at the V6's four mains, so **the existing default
  engine's output does not move at all**. Only I4, I6 and V8 builds shift.

Implementation: `MAIN_BEARINGS` and a balance-shaft predicate in `hardware.js`; two
new sourced entries in `coefficients.js`; `deriveEngine` returns `configFmepPa`;
`rubbingFmepPa` accepts it.

### Per-engine redline

`EngineConfig` gains `redline`, defaulting to 7500 so nothing existing changes.

- `simulateSweep` ends at the engine's redline instead of the module constant.
- The live rev limiter and the `rpmClamped` ceiling in `liveStep` follow it.
- The valve-float event compares against the engine's own redline. It currently
  hardcodes `SWEEP_END_RPM` in its own advice text, which would tell a GTI owner to
  raise spring rate until float clears 7500 RPM — 1000 RPM past where that engine
  ever runs.

Without this, an EA888.3 shows power at 7400 RPM, and peak-power RPM cannot be
validated against the factory figure.

### UI

A preset picker at the top of the **Engine Architecture** section on BUILD, built
from the existing `PickList` component: the four presets plus "Custom".

- Selecting a preset applies the full patch and replaces all three tables.
- A `presetId` state field tracks the active preset. Any manual edit to engine
  configuration clears it, and the label becomes "Custom (based on N54)" — the
  player is never lied to about what they are running.
- The header's `engineName` (`EcuLab.jsx:978`) shows the preset name when one is
  active, instead of "3.0L I6".
- A factory-spec panel shows the published rating alongside what the player's last
  pull actually made, which is the whole point of the feature.
- Because a preset replaces the player's calibration, the picker warns before
  applying when tables have been edited.

---

## Bugs fixed as part of this work

These four are touched directly by the preset work and are in scope. Three further
findings were filed as issues #2, #3 and #4 and are explicitly **not** in scope.

### 1. Tuning Score penalises hardware that cannot be tuned away

`computeTuningScore` (`scoring.js:26-30`) deducts `impact` for every event, including
`cam`, `float` and `bearing` — all three of which are hardware trade-offs. The cam
event's own `fix` text reads "This is a hardware trade-off, not a tuning fault — you
cannot calibrate it away", and it then costs up to 14 points on the score labelled
"how clean the calibration is". Valve float costs up to 34.

Measured: a VQ35HR preset with a perfect calibration and zero knock scores **96, not
100**, purely for having a 232-degree cam. The N54 will lose points for the
`bearing` event simply for running its factory boost.

This blocks the feature — presets are meant to be exemplary, and three of the four
would be docked for being accurate.

Fix: events already carry `type`. Deduct only calibration faults (`knock`, `fuel`,
`lean`, `valve`, `rich`, `maf`, `injscale`, `compressor`) in the Tuning Score, and
surface hardware advisories (`cam`, `float`, `bearing`) separately in the pull log
without a score deduction.

### 2. Dead argument to `simulateSweep`

`doRun` passes `exhaustDiaError` (`EcuLab.jsx:748`); `simulateSweep` never
destructures it. Harmless today — `computeEngineerScore` receives it correctly — but
misleading in a function the preset work extends. Remove it.

### 3. Unvalidated boost-curve length in the sim layer

The UI guarantees length via `setBoostAt`, but `simulateSweep` and `liveStep` accept
any array. Preset data is a second source of boost curves, so the guarantee must move
into the sim layer: validate length against `RPM` and fail loudly rather than
silently producing `NaN`.

### 4. Mutable shared default objects

`DEFAULT_ENGINE_CONFIG` and `DEFAULT_MODS` (`tables.js:63-75`) are exported objects
used directly as initial state. Nothing mutates them today, but a preset system is
exactly the kind of code that would reach for `Object.assign(cfg, preset)` and
corrupt the module-level default for the whole session. Freeze them.

---

## Testing

### `tests/presets.test.js` (new)

Per preset, run a full sweep with its generated factory calibration and assert:

- peak wheel horsepower within **+/-5%** of `factory.crankHp * DRIVETRAIN_EFF`
- peak wheel torque within **+/-10%** of `factory.crankTq * DRIVETRAIN_EFF`
- peak-power RPM within **+/-500 RPM** of `factory.crankHpRpm`
- **zero knock events** — a factory calibration does not knock
- injector duty below 90% everywhere

Data integrity, per preset:

- boost curve length equals `RPM.length`
- bore, stroke, compression, cam duration and spring rate all inside the ranges the
  BUILD sliders allow, and on their step grid
- `injectorIdx`, `exhaustDiaIdx`, `octaneIdx`, `turbineIdx`, `compressorIdx` all in
  bounds for their option arrays
- `redline` at or below the RPM axis maximum
- `id` unique

### Existing suites

- `tests/physics.test.js` — add coverage for `knockThreshold` as a now-public
  function, and for the configuration friction term.
- `tests/fingerprint.test.js` — the friction change moves I4 and V8 numbers, so the
  fixture needs refreshing via `npm run test:fingerprint:update`. **The diff must be
  reviewed, not rubber-stamped**: V6 rows must be byte-identical, and only I4/V8 rows
  should move. That is the check that the baseline anchoring worked.

### Known risk

The +/-5% power assertion may not pass first time for all four presets. If a preset
cannot reach its factory figure honestly, the acceptable resolutions are:

1. adjust an auditable coefficient in `coefficients.js` with written justification, or
2. widen the documented tolerance and state why in the test.

It will **not** be resolved with a per-engine multiplier. `airflow.js:5-7` forbids
bonus multipliers on power, and a preset that lies about the physics would undermine
everything else the app teaches.

Evidence this is achievable: probing the current physics against real specs before
any changes, a VQ35HR-spec engine with a correct VE table produced **264 whp against
a ~260 whp target, +2%**, with no cheating. The two turbo engines overshot only
because they were running the naive naturally-aspirated calibration and knocking
heavily, which the generated factory calibration addresses directly.

---

## Tooling: Python for the calibration fit

Step 7 below — iterating preset data until each engine validates against its factory
figures — is a curve-fitting and comparison problem, not a web problem. It is the one
part of this work that is genuinely better in Python.

`scripts/analyze_presets.py` will:

- invoke the JavaScript simulation through `node` and collect the full sweep for each
  preset as JSON
- compare simulated power and torque curves against the published factory curves,
  reporting error at each RPM rather than only at the peak
- plot the two curves together so a mismatch in *shape* — not just peak value — is
  visible

This is offline developer tooling. It is not part of the build, not shipped, and not
in CI. `tests/presets.test.js` remains Vitest so the guarantees run in CI with
everything else; the Python script is the instrument used to reach a passing state,
and afterwards to re-check a preset when a coefficient changes.

The simulation itself stays JavaScript — it runs client-side in the browser, so there
is no version of this where the physics is Python.

## Order of work

1. Freeze default objects; remove the dead `exhaustDiaError` argument; validate boost
   curve length. Small, independent, no behaviour change.
2. Split the Tuning Score by event class. Behaviour change, own tests.
3. Extract `knockThreshold` from `evaluatePoint`. Pure refactor, fingerprint proves
   it changed nothing.
4. Add I6, main bearing counts and the balance-shaft term. Fingerprint refresh with a
   reviewed diff.
5. Add `redline` to `EngineConfig` and thread it through sweep, live and the float
   event.
6. Build `presets.js`: data, `factoryCalibration`, `applyPreset`.
7. Add `tests/presets.test.js`, build `scripts/analyze_presets.py`, and iterate the
   preset data until the factory figures validate.
8. Wire up the UI: picker, preset-aware naming, factory-spec panel, overwrite warning.

Steps 1 through 5 each leave the app working and tested, so the risky part — matching
real power figures — starts from a clean, verified base.
