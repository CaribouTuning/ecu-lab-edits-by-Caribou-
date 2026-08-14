# Peak cylinder pressure as a wear term

**Status:** implemented
**Branch:** `claude/github-issue-31-h6iqey`
**Issue:** #31
**Date:** 2026-08-13

## Problem

Bearing wear was charged for boost and nothing else:

```js
const bearingWear = (turboOn ? avgBoost * COEFF.WEAR_BEARING_PER_PSI
  : (loadKpa >= 100 ? 0.15 : 0.05)) * derived.bearingWearMult;
```

`src/sim/sweep.js:115` (before this change)

Static compression appeared in no wear term at all — not bearing, not piston. The
`bearing` event's own cause text already claimed the mechanism ("Cylinder pressure
under boost stresses rod and main bearings even without knock") while the model behind
it looked only at manifold pressure.

That leaves one decision unpriced. Compression costs knock margin in the physics
(`compressionKnockAdj` in `src/sim/engine.js`), so on 91 octane raising it under boost
retards the tune and loses torque — the correct lesson, taught correctly. On a fuel
with enough octane to absorb that cost, the same change was a pure gain: on E85 with an
intercooler, 9.5:1 to 12.5:1 gave consistent power with an identical wear figure and an
unchanged pull log. In reality that is the combination that puts rods through blocks.

## Goal

Give the simulation a term for the mechanical load the metal actually carries, so that
the cost of stacking compression on boost lands somewhere real, on every fuel.

Explicitly **not** a scoring change. Issue #25 proposes charging compression headroom in
the Engineer Score; this issue was filed as the physics-based alternative to it, and
this design keeps the Tuning and Engineer Scores untouched. What moves is wear, the
datalog and the pull log.

## Non-goals

- **Rod-bolt/ring-land failure modelling as distinct modes.** One limit, one wear term.
- **Charge temperature in the pressure equation.** See below — it does not belong there.
- **Piston or rod material as a build option.** `PEAK_PRESSURE_LIMIT_BAR` is a fixed
  stock-parts limit. Making it a purchasable upgrade (forged internals) is the obvious
  follow-up and is what the event's `fix` text points at, but it needs a UI and a price
  and is out of scope here.

## The model

New module `src/sim/pressure.js`, one exported function:

```
peakPressureBar = trappedBar × compression^n × combustionRise × phasing
```

- **trapped** — `mapKpa × veActual/100`, converted to bar. The same trapped-charge idea
  the knock model uses: two engines at the same MAP but different VE do not see the
  same pressure.
- **compression^n** — polytropic compression, `n = 1.32`. This is the term that makes
  compression *multiply* boost rather than add to it, which is the whole interaction the
  model was missing.
- **combustionRise** — 2.2× the motored peak at MBT spark.
- **phasing** — spark relative to MBT. Retard moves the peak onto a descending piston in
  a growing volume and loses ~2.5%/degree, floored at 0.45; advance past MBT keeps
  raising it at 1.5%/degree, capped at 10 degrees.

The output is a real pressure in bar so it can be checked against published figures,
not a unitless index. A stock 10.3:1 naturally aspirated engine peaks near 50 bar at
wide-open throttle here; the Golf R preset on its factory calibration peaks at 95.

### Why charge temperature is not a term

Pressure at the start of compression is manifold pressure whatever the temperature —
hot air is simply fewer molecules at that pressure. So an intercooler does not lower
peak pressure directly. It *raises* it, twice over: denser charge means more trapped
mass, and the knock margin it buys gets spent on advance. Charge temperature earns its
keep in the knock model, and putting it here as well would be double-counting with the
sign flipped.

### Why retarded timing lowers it

This falls out of the phasing term and is worth stating because it produces a result
that reads as backwards at first: a knock-limited 24 psi build on 91 octane can carry
*less* mechanical stress than the same build tuned to MBT on E85. That is correct. The
retard the ECU pulled took the pressure peak with it — knock is the engine warning you
about a load that the ECU then partially removes. Remove the warning with octane and
the load stays.

## Where it lands

| Consumer | Change |
|---|---|
| `evaluatePoint` | Reports `peakPressure` (bar) and `pressureRisk` per point |
| Bearing wear | `(avgPeakPressure − 38) × 0.03 × bearingWearMult`, replacing the boost term |
| Piston wear | Adds `(peakPressure − 110) × 0.004` per point over the limit |
| `bearing` event | Re-keyed from `avgBoost > 6` to `avgPeakPressure > 60` |
| `pressure` event | New, severity 3, fires per run of points over the limit |
| `computeTuningScore` | `pressure` added to `HARDWARE_EVENT_TYPES` — advisory, no deduction |
| Datalog UI | New "Pressure" row per RPM card |

### Calibration

`BEARING_PRESSURE_FREE_BAR: 38` and `WEAR_BEARING_PER_BAR: 0.03` are fitted so the
builds that already existed keep roughly the wear they had — a stock naturally aspirated
pull at wide-open throttle still costs about 0.15, the N54 preset about 0.6 — so what
this change moves is the *relationship* to compression, not the overall rate. Part-load
pulls now cost zero rather than 0.05: below the free threshold nothing accumulates,
which is the honest answer for an engine at 40 kPa.

`PEAK_PRESSURE_LIMIT_BAR: 110` is anchored on the shipped presets. The most heavily
boosted production engine in the app (Golf R, 17 psi) peaks at ~95 bar on its factory
calibration, so the limit clears every real engine here with margin while still catching
the builds the issue is about. `tests/presets.test.js` asserts that directly, so the
anchor cannot silently drift.

### Why `pressure` is an advisory, not a Tuning deduction

Spark timing does move peak pressure, so part of this *is* tunable — this is the one
entry in `HARDWARE_EVENT_TYPES` that looks arguable. But a build stacking high
compression on high boost is over the limit at MBT and cannot table-edit its way back
under; only compression, boost or stronger parts get it there, and all three are BUILD
decisions. Deducting would mark down a flawless calibration for a choice the calibration
did not make. The cost is real and lands in wear instead.

## What the fingerprint moved

Re-derived against `main` at the burn-duration MBT model (#34), which landed while this
branch was open. That is not an unrelated change: peak pressure is phased on spark
*relative* to MBT, so moving MBT moves every number below. The counts shifted by a few
sweeps; the shape did not.

504 sweeps re-run; **zero** changes to `hp`, `torque`, `peakHp`, `peakTq`, or any score.
Nothing added or removed horsepower, which is the rule that matters.

- `wear.bearing` moved on all 504 sweeps (rescaled onto pressure); `wear.piston` gained
  a term on 71.
- 71 sweeps gained a `pressure` event — 67 on the 24 psi curve, 4 on the 8 psi one, and
  every one of them at wide-open throttle. Ordering by compression is the point of the
  change, and it holds:

  | config | static CR | sweeps tripping it (of 72) |
  |---|---|---|
  | `undersquare` | 12.5:1 | 14 |
  | `smallI4` | 11.5:1 | 13 |
  | `cammedV8` | 11.0:1 | 13 |
  | `stockV6` | 10.3:1 | 12 |
  | `turboI6` | 10.2:1 | 12 |
  | `floatTrap` | 10.3:1 | 6 |
  | `bigV8` | 9.5:1 | 1 |

  The 9.5:1 `bigV8` picks it up once. Everything at 10.2:1 or above trips it in all
  twelve of its wide-open-throttle cases on the 24 psi curve. `floatTrap` is the
  exception that confirms the mechanism rather than breaking it: same 10.3:1 as
  `stockV6`, but valve float collapses VE above the float speed, so it traps less charge
  and peaks lower — pressure follows what is actually in the cylinder, not what the
  manifold was asked for.

  The four 8 psi cases are precisely what #31 was about: `undersquare` twice, `smallI4`
  and `cammedV8` once each — the three highest-compression configs in the matrix, every
  one of them on E85 with an intercooler fitted. High compression, ordinary boost, and a
  fuel with enough octane that nothing in the knock model ever objected.
- 49 sweeps gained the `bearing` advisory, 2 lost it. 46 of the gains are mild-boost
  builds now clearing 60 bar average. The other 3 are `undersquare` with no turbo at all
  — a 12.5:1 naturally aspirated engine reaching bearing loads that the old
  `avgBoost > 6` rule could not see by construction, which is the clearest single
  demonstration that the advisory is now keyed to the right quantity. The 2 losses are
  `floatTrap` at heavy boost, where collapsing VE means the pressure it averages is
  lower than its boost suggested.

## Follow-ups

- **#25** — Engineer Score compression headroom. Worth revisiting now that the physics
  charges for the same decision; the two rules should not bill it twice.
- **Forged internals as a build option**, raising `PEAK_PRESSURE_LIMIT_BAR` for the
  build that buys them. The event text already tells the player this is the hardware
  answer, and right now they cannot act on it.
