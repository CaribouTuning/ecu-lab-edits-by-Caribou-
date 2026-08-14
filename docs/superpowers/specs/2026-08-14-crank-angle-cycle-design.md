# A crank-angle cycle as the physics core

**Status:** implemented
**Branch:** `feat/crank-angle-cycle`
**Issue:** #37
**Merged with:** #34 (light-load MBT), #35 (peak cylinder pressure), #36 (knock constants), #38 (VQ35DE preset)
**Date:** 2026-08-14

## Problem

Indicated work was one multiplication:

```js
const indicatedJ = energyJ * derived.thermalEff * timingEff * afrEff;
```

`timingEff` was a parabola centred on a correlated MBT. That form cannot express burn
phasing, which is the thing spark timing actually changes: not how much work is done but
*when* the heat arrives, relative to a piston that is somewhere different at every crank
angle. Everything that follows from a pressure history — burn duration, real MBT, peak
pressure and where it occurs, end-gas temperature, exhaust temperature — was therefore
either absent or a separately fitted proxy. Around twenty coefficients existed to stand
in for the missing dimension.

## The model

`src/sim/cycle.js`, single zone, two gamma, finite heat release. Integrated from intake
valve close to exhaust valve open at `CYCLE_STEP_DEG` (2°):

| Step | Method |
|---|---|
| Volume | Slider-crank, so rod ratio and stroke are real inputs |
| Heat release | Wiebe, `a = 5`, `m = 2`, after a flame-development delay |
| Pressure | First law per step: `dp = (γ−1)/V·dQ − γ·p/V·dV`, γ blended unburned → burned by mass fraction |
| Work | Trapezoidal `∮ p dV`, giving gross IMEP directly |
| End gas | Isentropic from the trapped state, plus flame heating |
| Knock | Livengood–Wu integral of Douaud–Eyzat ignition delay; ≥ 1 is knock |

MBT is not fitted: it is the advance that lands 50% mass burned at `MFB50_ATDC_DEG`,
solved from the Wiebe shape. The knock limit is found by bisection on the same cycle the
ECU runs, so both the running engine and `factoryCalibration` ask one question of one
model.

### Non-monotonicity, and why the search is shaped the way it is

The autoignition integral is not monotonic in spark advance across the full range. Burn
early enough and the charge is nearly consumed before TDC, leaving little end gas to
accumulate delay, so the integral turns back *down*. A naive bisection can converge on
the far side of that hump and report a limit well past where the engine actually
detonated. The search ceiling therefore sits below the hump, and a test asserts that
every timing at or below the reported limit is genuinely knock-free.

A mixture that cannot be made to knock anywhere in range reports
`KNOCK_UNBOUNDED_BTDC`, not the ceiling. Reporting the ceiling was a real defect while it
lasted: the spark advisor read it as a hard limit and called stock cruise cells carrying
47° dangerous, which is exactly the false alarm #34 was written to remove.

## Physics added along the way

Four terms the previous model had no representation of at all:

- **Pumping work with its real sign.** `PMEP = EMP − MAP`. It was clamped at zero above
  atmospheric, so a boosted engine paid nothing for its own exhaust backpressure and a
  turbine was only a VE multiplier. Housing size is now a genuine trade.
- **Residual gas.** Dilutes the charge, slows the burn, and arrives at exhaust
  temperature so it raises where compression starts.
- **Fuel evaporative cooling.** Most of why E85 resists knock. Without it, lean mixtures
  came out knock-*safe* — less fuel, less heat, lower pressure — which is backwards and
  the opposite of what this app should teach.
- **Flame heating of the end gas**, peaking just lean of stoichiometric, which is what
  makes lean-under-load the failure mode it is. A single-zone trace cannot see burned-gas
  temperature; this is a one-coefficient stand-in for the two-zone model that would.

Effective compression became a computed quantity — the piston does not compress until
IVC, which moves with cam duration — so a long-duration cam genuinely tolerates more
static compression. Head material and cylinder size stopped being additive knock bonuses
and became chamber temperature and flame travel distance, both of which now also move
burn duration and the shape of the trace.

## Relationship to #34

The light-load MBT work reached the same conclusion from the other direction: MBT is
wherever 50% burned lands just after TDC. It got there with a correlation in RPM and
pressure ratio; this gets there by integrating the burn. **Its conclusion and its
constants are what survived** — `MFB50_ATDC_DEG`, `MBT_MIN_DEG`, `MBT_MAX_DEG` are what
the cycle reads and clamps to. The correlation is retired.

Its light-load result had to be earned rather than inherited. The integrated burn first
put cruise MBT at 28.9° where #34 established it must be 40–50, because the dilution
physics was too weak — 17% residual at 20 kPa against a real quarter or more. Corrected,
20 kPa cruise sits at 26% residual, an 83° burn and 42° MBT: the same answer, through the
mechanism.

## Coefficients

Twenty-one fitted constants retired, replaced by one. `KNOCK_TAU_SCALE` multiplies a
published ignition-delay correlation, and is fitted against two anchors simultaneously:

1. Every boosted preset reaches its published output with its factory calibration
   knock-free.
2. A stock 10.3:1 on 91 octane still runs out of knock margin in the mid thirties, where
   a real one does.

The second anchor is not decoration. Values that satisfy only the first push the
naturally aspirated knock limit past anything the app can command, which silently deletes
the most basic lesson in the tutorial — that you can over-advance an engine on pump gas.

`COEFF` went from 124 entries to 102, with zero unreferenced.

## Validation and known limits

All five presets — including the VQ35DE Rev-Up from #38 — reproduce their published power
and torque from shared physics with no per-engine fudge.

Two assertions were relaxed with the mechanism named rather than the tolerance widened,
both recorded in typed tables that fail if the model ever gains the missing term:

- **GTI peak torque** carries a −15% floor. Its 258 lb-ft is rated from 1500 RPM, and
  `computeManifold` ramps boost from zero over the turbine's spool range, so the model has
  it making no boost at all at the rated RPM.
- **Plateau-rated peak location** gets the same ±500 RPM the point-rated branch always
  had.

Remaining simplifications, stated rather than hidden:

- Heat transfer is a lumped fraction, not a Woschni correlation. Largest one left.
- Single zone — burned-gas temperature is not tracked, hence the flame-heating stand-in.
- No crevice volume, blowby or cycle-to-cycle variation.
- The turbo is still a boost target with an RPM ramp, not a compressor map with a turbine
  energy balance. **This is now the biggest accuracy item in the model**, and it is what
  caps the GTI fit above.

The peak-pressure overload limit is anchored on this model's own scale, not on published
failure thresholds: a single-zone trace reads lower than a real indicator diagram, so
borrowing 110–130 bar directly would put the overload out of reach.

## Cost

The test suite goes from 3s to ~29s, almost entirely the fingerprint matrix running a
knock-limit bisection per point across roughly 34,000 cycles. User-facing paths are
unaffected: one dyno sweep is 17 ms, the calibration advisor 5 ms, and a live-engine frame
0.14 ms against a 50 ms budget at 20 Hz.
