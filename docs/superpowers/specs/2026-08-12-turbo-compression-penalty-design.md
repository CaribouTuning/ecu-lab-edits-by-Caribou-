# A DI-aware compression rule for the Engineer Score

**Status:** approved, ready for implementation plan
**Branch:** `feat/3-di-aware-compression-penalty`
**Issue:** #3
**Date:** 2026-08-12

## Problem

`computeEngineerScore` charges a flat 15 points to any boosted build over 10.5:1
static compression:

```js
if (turboOn && engineConfig.compression > 10.5) {
  score -= 15; deductions.push('-15 High static compression fights boost pressure');
}
```

`src/sim/scoring.js:70-72`

That threshold encodes port-injection-era practice. Direct injection sprays fuel into
the cylinder after the intake valve closes, and the charge cooling from in-cylinder
evaporation buys real knock margin — which is exactly why modern DI turbo engines run
static compression that would have been reckless on a port-injected engine. The BMW
B58 and the Toyota/BMW 2.0 T both ship at 11.0:1. Under the current rule each of them
reads as a 15-point engineering mistake.

Two further problems compound it:

**It is a cliff, not a curve.** 10.51:1 and 13.0:1 are charged identically. The N54
preset escapes at 10.2:1 by three-tenths of a point — by luck rather than by the rule
being right about it.

**It double-charges.** `deriveEngine` already costs compression knock margin —
`compressionKnockAdj = (10.3 - cfg.compression) * 2.0` (`src/sim/engine.js:138`) —
which feeds `knockThreshold` (`src/sim/knock.js:68`), retards the tune, logs knock
events and deducts from the Tuning Score. An 11.0:1 turbo build pays 1.4 degrees in the
physics *and* a flat 15 in the Engineer Score for the same decision.

This becomes user-visible now that the engine presets have shipped, since those presets
are real factory DI turbo engines and players will build variants around them.

## Goal

Replace the cliff with a rule that judges compression against the two things in the
build that actually decide whether it survives — fuel octane and charge cooling — and
that scales with how far over the line the build sits.

The Engineer Score measures whether the hardware choices are coherent *with each
other*. Octane and intercooler are hardware choices. A rule that ignores them is not
measuring coherence; it is measuring one number in a vacuum.

## Non-goals

- **Modelling direct injection as such.** `EngineConfig` has no injection-type field
  (`src/sim/engine.js:87-97`), and adding one would touch the presets, the UI and the
  knock model. This design gets the DI-era engines out of trouble through levers
  already present in the build rather than by inventing new state.

  Tracked as **#24**, which is the real fix. This design uses octane and intercooling
  as stand-ins for a mechanism the model cannot currently see, and
  `COMPRESSION_BOOST_BASE` is a compromise value chosen to accommodate DI engines it
  has no way to identify. Once #24 lands, that constant should key off injection type
  directly and this rule should be revisited.
- **The naturally-aspirated low-compression rule** at `scoring.js:73-75`. Untouched.
- **The other bare literals in `scoring.js`.** Only the constants this change
  introduces move to `coefficients.js`. The wider pattern is issues #10 and #11.
- **Rebalancing the Pull Score** to compensate for engineer scores that now come out
  higher on high-compression boosted builds. The multiplier stays as it is.

---

## The rule

Inside the existing `if (turboOn)` block in `computeEngineerScore`:

```js
const headroom = COEFF.COMPRESSION_BOOST_BASE
  + fuel.bonus * COEFF.COMPRESSION_PER_OCTANE_DEG
  + (mods.intercooler ? COEFF.COMPRESSION_INTERCOOLER_GAIN : 0);
const over = engineConfig.compression - headroom;
if (over > 0) {
  const d = Math.round(Math.min(over * COEFF.COMPRESSION_PENALTY_PER_POINT,
                                COEFF.COMPRESSION_PENALTY_CAP));
  if (d > 0) { score -= d; deductions.push(`-${d}  ...`); }
}
```

The `d > 0` guard is not decoration. A build a few hundredths over rounds to zero, and
a `-0` entry in the deduction list would be nonsense on screen.

### What the headroom comes out at

| Build | Headroom | Result |
|---|---|---|
| N54 preset — 10.2:1, 93, intercooled | 11.5 | clean |
| B58 / Toyota-BMW 2.0 T — 11.0:1, 93, intercooled | 11.5 | clean |
| M139 — 9.0:1 | — | clean; low compression is its own deliberate choice |
| EA888.3 GTI and Golf R — 9.6:1, 93, intercooled | 11.5 | clean |
| 11.5:1, 91, no intercooler | 10.8 | 0.7 over, -7 |
| 12.5:1, 91, no intercooler | 10.8 | 1.7 over, -15 (capped) |
| 12.5:1, E85, intercooled | 12.6 | clean |

Every engine named in the issue comes out clean, and it happens through the levers the
player actually chose rather than through a special case.

### Severity

10 points per point of compression over headroom, capped at 15.

| Compression (91, no intercooler) | Over | Deduction |
|---|---|---|
| 11.0:1 | 0.2 | -2 |
| 11.5:1 | 0.7 | -7 |
| 12.0:1 | 1.2 | -12 |
| 12.5:1 | 1.7 | -15 (capped) |
| 13.0:1 (slider maximum) | 2.2 | -15 (capped) |

The cap equals the old flat penalty, so the new rule is never harsher than the one it
replaces — it only stops charging that maximum to builds that do not deserve it.

## Where the numbers live

CONTRIBUTING is explicit: no file in `src/sim/` outside `coefficients.js` carries a
bare magic number. Five constants go into `COEFF` under a new heading,
`--- Engineer Score: static compression under boost ---`, each annotated in the style
of the file:

| Constant | Value | Represents |
|---|---|---|
| `COMPRESSION_BOOST_BASE` | 10.8 | compression a boosted build carries on 91 with no charge cooling |
| `COMPRESSION_PER_OCTANE_DEG` | 0.1 | extra compression supported per degree of octane knock bonus |
| `COMPRESSION_INTERCOOLER_GAIN` | 0.4 | extra compression supported by intercooler charge cooling |
| `COMPRESSION_PENALTY_PER_POINT` | 10 | Engineer Score points per point of compression over headroom |
| `COMPRESSION_PENALTY_CAP` | 15 | most this rule ever deducts |

`COMPRESSION_BOOST_BASE` gets the longest comment, because "why 10.8 and not 10.5" is
the whole issue: it sits deliberately above the 10.2–11.0 band factory DI turbo engines
ship at, since in-cylinder injection buys knock margin this model has no separate term
for.

`COMPRESSION_PER_OCTANE_DEG` at 0.1 makes E85 (+14 degrees of bonus) worth 1.4 points
of compression, which is about the real spread between a pump-gas build and an E85 one.

`scoring.js` does not currently import `COEFF`; it will.

## Threading `fuel` and `mods` through

`computeEngineerScore` gains `fuel` and `mods` as **required** inputs.

Not optional, and not defaulted. A default would silently assume 91-octane-and-no-
intercooler at any call site that forgot to pass them — the harshest headroom, and a
wrong answer that looks entirely plausible. Required parameters make an omission a
visible failure instead.

The function's JSDoc is currently a bare `@param {object} input`, so `tsc --checkJs`
cannot catch a missing field. It gets tightened to name the fields it destructures,
which is what makes "required" mean something.

Four call sites, all of which already have both values in scope:

| Call site | Note |
|---|---|
| `src/ui/EcuLab.jsx:861` | inside the pull handler; `fuel` and `mods` are already passed to `simulateSweep` immediately above |
| `src/ui/EcuLab.jsx:990` | the `scores` memo — **`fuel` and `mods` must be added to the dependency array**, or the Engineer Score goes stale when the player switches fuel or fits an intercooler |
| `tests/fingerprint.js:158` | the matrix already has `mods` and `S.OCTANE_OPTS[fi]` in hand |
| `tests/regressions.test.js:268` | exhaust-diameter test; pass a coherent fuel and mod set so the compression rule stays silent |

The stale-memo hazard at `:990` is the one genuine bug risk in this change. The memo
recomputes on `engineConfig`, `turboOn`, `turbineIdx`, `compressorIdx`,
`exhaustDiaError`, `dutyPreview` and `engineDerived` — none of which move when the
player changes octane.

## The deduction text

The issue asked that the text explain the nuance rather than state a flat rule:

```
-12  12.0:1 static compression outruns what this build supports under boost on 91 with no charge cooling
```

Built as:

```js
const cooling = mods.intercooler ? 'an intercooler' : 'no charge cooling';
`-${d}  ${engineConfig.compression.toFixed(1)}:1 static compression outruns what this `
  + `build supports under boost on ${fuel.label} with ${cooling}`
```

It names the number, the mechanism and both levers that would fix it, and it reads
correctly for every fuel in `OCTANE_OPTS` — including E85, where "on E85 with an
intercooler" avoids the awkwardness of calling E85 an octane rating.

## Testing

A new `describe` block in `tests/scoring.test.js`, following the existing
`computeEngineerScore turbo sizing` block's `build(over = {})` helper pattern. Per
CONTRIBUTING these are intent tests — direction and relationship, never magnitudes.
Magnitudes belong to the fingerprint.

1. **A factory-shaped DI turbo takes no deduction.** 11.0:1 on 93 with an intercooler.
   This is the regression the issue is actually about.
2. **The N54 preset stays clean**, pulled from `presetById('n54')` with its own
   `parts.octaneIdx` and `mods` rather than hand-copied numbers, so the presets cannot
   drift back into the penalty without a test failing.
3. **Octane raises the headroom.** A compression that is penalised on 91 is clean on
   E85, all else equal.
4. **An intercooler raises the headroom.** Same comparison on charge cooling.
5. **The deduction scales rather than cliffs.** 12.0:1 costs strictly more than
   11.5:1 — the property the old rule lacked.
6. **The cap holds.** 13.0:1, the slider maximum, deducts no more than 15.
7. **A naturally-aspirated build never sees this deduction**, whatever its compression.

## The fingerprint will move

`tests/fixtures/fingerprint.sha256` records `engineer.score` for every sweep in the
matrix, and three configurations run over the new headroom under boost:

| Config | Compression | Today | After |
|---|---|---|---|
| `smallI4` | 11.5:1 | flat -15 on every boosted permutation | -7 on 91/no cooler; clean on E85 + full mods |
| `cammedV8` | 11.0:1 | flat -15 | -2 on 91/no cooler; clean on E85 + full mods |
| `undersquare` | 12.5:1 | flat -15 | -15 on 91/no cooler; clean on E85 + full mods |

`turboI6` (10.2), `stockV6` (10.3), `floatTrap` (10.3) and `bigV8` (9.5) sit under the
base headroom on every fuel and do not move.

Note that only `computeEngineerScore` changes — no physics formula is touched — so
`deriveEngine`, `computeHardwareVE`, `evaluatePoint` and every torque, power, wear and
event figure in the fingerprint must be **byte-identical**. Only `engineer.score`,
`engineer.label` and the `pull` score derived from it may move. Any other movement in
the report is a bug in the change, not an expected consequence of it.

Per CONTRIBUTING the refresh is:

```bash
git stash && node scripts/update-fingerprint.js --report   # baseline
git stash pop && node scripts/update-fingerprint.js --report
npm run test:fingerprint:update
```

The before/after report diff goes in the pull request body.

## Verification

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build` — all four, as CI runs
them on every PR.
