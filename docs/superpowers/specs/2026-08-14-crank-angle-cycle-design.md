# A crank-angle cycle as the physics core

**Status:** implemented
**Branch:** `feat/crank-angle-cycle`
**Issue:** #37
**Merged with:** #34 (light-load MBT), #35 (peak cylinder pressure), #36 (knock constants), #38 (VQ35DE preset), #40 (B58 pair and grouped picker)
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

`src/sim/cycle.js`, TWO ZONE, finite heat release. Integrated from intake
valve close to exhaust valve open at `CYCLE_STEP_DEG` (2°):

| Step | Method |
|---|---|
| Volume | Slider-crank, so rod ratio and stroke are real inputs |
| Heat release | Wiebe, `a = 5`, `m = 2`, after a flame-development delay |
| Pressure | First law per step: `dp = (γ−1)/V·dQ − γ·p/V·dV`, γ blended unburned → burned by mass fraction |
| Work | Trapezoidal `∮ p dV`, giving gross IMEP directly |
| Heat loss | Woschni per crank degree, against a chamber area that grows as the piston uncovers the liner |
| Unburned zone | Isentropic from the trapped state, less what the wall takes |
| Burned zone | Open-system enthalpy balance, with cp rising toward dissociation |
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
   a real one does. It lands at 36.0° at 5500 RPM, and falls to 23.5° at 3000 — the end
   gas gets more milliseconds under pressure at low speed. That speed dependence is
   emergent; the additive envelope needed a term for it.

The second anchor is not decoration. Values that satisfy only the first push the
naturally aspirated knock limit past anything the app can command, which silently deletes
the most basic lesson in the tutorial — that you can over-advance an engine on pump gas.

`COEFF` went from 124 entries to 130 — the additive knock envelope and the empirical
peak-pressure block out, Woschni, the turbocharger and the saturating exhaust-temperature
model in — with zero unreferenced.

## Validation and known limits

All seven presets — the VQ35DE Rev-Up from #38 and both B58s from #40 included — reproduce
their published power and torque from shared physics with no per-engine fudge.

Every preset is held to the tolerances this repo already used — ±5% on power, ±10% on
torque. An interim version of this work needed a −15% floor on the GTI's torque; the
turbine energy balance described below removed the need for it, and it is gone.

### The second pass

The three items this design first listed as "remaining" were then done, and two
validation relaxations came back out as a result:

- **Wall heat transfer is now Woschni**, per crank degree, against a chamber area that
  grows as the piston uncovers the liner. It replaced a flat fraction of fuel energy,
  which could express none of the things that actually drive heat loss — surface-to-volume
  ratio, residence time, gas density. A 1500 RPM pull now loses measurably more heat per
  unit of air than the same engine at 5500, which is why small and slow-turning engines
  are less efficient.
- **The turbo is a power balance.** Exhaust manifold pressure comes from the turbine
  treated as a nozzle of fixed effective area, and boost from matching turbine work to
  compressor work. The player's target became a wastegate ceiling rather than a promise.
  The RPM spool ramp is gone, along with `spoolRange` and `lagAdd`.
- **Dissociation and incomplete combustion.** Burned-gas gamma dropped to the dissociated
  end of the published band, and 3% of the fuel is left unburned in crevices and quench
  layers. Without both, the cycle read about 8% high on every engine once Woschni had
  replaced the old catch-all heat-loss fraction.

The turbo work paid for itself immediately: the GTI's 258 lb-ft is rated from 1500 RPM,
and the old ramp had it making no boost at all there. It now makes 12.7 psi at 2000 RPM,
so the **−15% torque floor this design previously needed is gone and the preset is held
to the normal ±10% again**. The N54 gained a `turbineCount` — it is twin-turbo, and once
backpressure depends on total flow area, modelling two small housings as one took 27% off
its power.

### The audit pass

Three more defects came out of reading the finished model back, all of the same kind — a
quantity the code claimed to model and did not:

- **One exhaust temperature, not two.** The turbine ran on a correlation in `thermo.js`;
  the datalog's EGT gauge ran on `720 + retard·22 + lean·45 + boost·6`, three bare magic
  numbers in `point.js` in a codebase whose stated rule is that no such number lives
  outside `coefficients.js`. They disagreed about the temperature of the same gas. There
  is now one call, and the gauge additionally folds in the knock retard the ECU actually
  pulled — the term the turbine estimate cannot include, because backpressure has to be
  solved before the knock limit is known.

  The correlation itself was also wrong in shape: linear in load and therefore unbounded,
  it put a stock Golf R at 1030 °C. Exhaust temperature saturates, because past a full
  charge the extra air brings extra expansion work and a richer commanded mixture. The
  load term is now `SPAN·(1 − e^(−chargeIndex/SCALE))`, anchored on three real readings —
  ~600 °C at cruise, 860 at wide-open throttle naturally aspirated, 930 boosted at
  best-power mixture. All seven presets land between 881 and 951 °C on their factory
  calibrations; the flag threshold moved to 980 °C, so a stock engine is always clear and
  it takes retard or a lean mixture to trip it.

- **Residual gas ignored the clearance volume it was documented as resting on.** The
  docblock said the clearance volume sets the floor; the code read a flat constant, so a
  12:1 build and an 8:1 build re-breathed identically. Residual mass now scales with
  `Vd/(CR−1)` against a reference ratio, which is why raising compression here shortens
  the burn and brings MBT in — through the mechanism, not through a second term.

- **BSFC counted fuel burned, not fuel delivered.** Brake-specific consumption prices
  what leaves the tank. At the rich mixture a tuner commands at wide-open throttle a fifth
  of the fuel finds no oxygen and goes out unburnt, and the driver still bought it —
  counting only the burned mass made over-fuelling free on the one gauge meant to price
  it. A stock naturally aspirated pull reads 0.409 lb/hp·hr rather than 0.375.

None of the three moved a preset outside tolerance.

Two more turned up in the spark advisor, both cases of it contradicting a calibration the
app itself generated — the same class of false alarm #34 was written to remove:

- **Boosted rows were judged at the wrong pressure.** The advisor ran the induction solve
  first and evaluated the knock threshold at the manifold pressure it produced, so on the
  Golf R the 100 kPa row was judged at 200 kPa. `factoryCalibration` writes that cell for
  100 kPa. The advisor's own MBT half already used the row pressure; the knock half now
  does too, and `solveInduction` is gone from the advisor entirely. A spark table is
  indexed by manifold pressure — the row *is* the operating point.
- **Impossible cells were judged at all.** The reachability gate was per-row against the
  *peak* of the boost curve, so the 200 kPa row was evaluated at 800 RPM, where the knock
  ceiling is near zero because the end gas spends an age under pressure. It is now
  per-cell against the boost curve at that engine speed.
- **Mixture was judged on what was commanded, not what was delivered.** A factory fuel
  table is written pre-corrected for its own MAF error, so the Golf R commands 11.22 at
  5000 RPM and full boost and *delivers* 12.20 — its best-power target to the hundredth.
  The advisor called it a point off. It now compares delivered against target and suggests
  the commanded number that would land there, which is the number the player has to type.

All three spark and fuel categories are now empty on all seven presets' own factory
calibrations, and a test asserts it. `underAdvanced` is deliberately *not* empty: a factory
tune is conservative, and showing that headroom is the point of the app.

### Merging #40, and the two defects it exposed

The B58 pair arrived fitted against the old model, and integrating them found two more:

- **The end gas was adiabatic.** The autoignition integral accumulates in *milliseconds*,
  so a 1900 RPM cycle gives the end gas nearly three times the dwell of a 5500 RPM one.
  Only that half was modelled. It also gives the end gas three times as long to shed heat
  into a 450 K head, and without that term the knock limit collapsed at low speed — the
  B58B30M1 at 11:1 and 16.6 psi came out unable to take *any* advance at 1900 RPM, where
  the real engine makes its rated torque on pump gas. One new coefficient,
  `ENDGAS_WALL_AREA_FRAC`, standing for the share of chamber wall the unburned zone
  touches, which a single-zone model cannot know.
- **The spark table had three different ranges.** The editable grid allowed −5° to 50°;
  `factoryCalibration` floored what it generated at 5°, and the advisor refused to suggest
  below 5°. That is not cosmetic: a production boosted calibration genuinely commands
  retarded, even after-TDC, timing in the low-speed high-load corner, and flooring the
  generator above it made it write spark the engine could not take. `SPARK_MIN_DEG` /
  `SPARK_MAX_DEG` now live in `tables.js` next to the table, and all three read them.

With both fixed, all seven presets validate with zero knocking points on their own
calibrations. The B58B30M1's torque moved from +1.7% to −1.2% — it is now knock-limited
down low the way the real engine is — and it is still comfortably inside ±10%.

### The five remaining limitations, closed

The design previously ended on a list of five. All are now modelled:

- **Two-zone combustion.** Burned and unburned gas share a pressure and carry their own
  temperatures; the burned zone is an open-system enthalpy balance with a
  temperature-dependent heat capacity for dissociation. This retires the three-coefficient
  Gaussian that asserted where flame temperature peaks — the balance produces it.
- **Exhaust temperature from the cycle**, at exhaust valve open and blown down to the
  manifold. `exhaustTempK` survives only for the turbine balance, which must run first.
- **A compressor map** with surge and choke as real limit lines, choke enforced as a mass
  flow cap. Turbo matching is emergent: a small compressor holds boost from 1500 RPM and
  chokes by 4000; a large one surges at 2500 and is happy from 4000 up.
- **Shaft inertia** in the live engine: 0 to 9.4 psi in ~0.3 s, decaying in 0.4 s, with
  spool-up slower than spool-down because it is energy-limited. The dyno sweep is
  unaffected by design.
- **Crevice volume and blowby** as real geometry and real lost mass.

Cycle-to-cycle variation stays out deliberately: the fingerprint requires determinism, and
what CCV causes — unstable combustion under dilution — already arrives through the
residual-driven burn duration.

**One pre-existing test changed its claim.** `knock > loses margin when the mixture is
lean under load` asserted a monotonic relationship the single-zone model produced only
because its Gaussian asserted it. The two-zone balance derives burned-gas temperature and
disagrees, as does published knock-limited-advance data: the curve is U-shaped in lambda
with its minimum near best-torque mixture, where cylinder pressure peaks. The lesson is
kept as three tests — worst near best torque, cruise still unpunished, and lean-under-load
still dangerous through `leanRisk`, `valveRisk` and lost power.

`PEAK_PRESSURE_LIMIT_BAR` moved 100 to 105, re-anchored on an E85 build ladder so knock
does not confound it: presets 63-75 bar, a mild 8 psi build 99, stock rods at 14 psi 108,
12.5:1 at 18 psi 118. The two-zone scale now sits just under the published 110-130 band.

Remaining simplifications, stated rather than hidden:

- The compressor map is parametric, not digitised from a real compressor.
- Both zones are well stirred: no boundary layer, no profile within either.
- Composition is frozen apart from the two gammas.
- No cycle-to-cycle variation, by design.
- The induction solve prices the turbine expansion at a full-charge stoichiometric
  reference, because it runs before it knows how much air the engine will draw.

The one relaxation left in `tests/presets.test.js` is the ±500 RPM grace on plateau-rated
peak location, which is the same grace the point-rated branch always had. The GTI misses
its band by 100 RPM and the Golf R by 300.

The peak-pressure overload limit is anchored on this model's own scale, not on published
failure thresholds: a single-zone trace reads lower than a real indicator diagram, so
borrowing 110–130 bar directly would put the overload out of reach.

## Cost

The test suite goes from 3s to ~60s, almost entirely the fingerprint matrix running a
knock-limit bisection and an induction solve per point across roughly 34,000 cycles.
User-facing paths are unaffected: one dyno sweep is 62 ms, the calibration advisor 16 ms,
and a live-engine frame 0.17 ms against a 50 ms budget at 20 Hz. The advisor got cheaper
rather than dearer despite the heavier physics, because dropping the induction solve took
one solve per table cell out of it.
