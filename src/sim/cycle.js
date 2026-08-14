/**
 * The closed part of the engine cycle, solved on a crank-angle grid.
 *
 * This is the physics core. Everything the old model approximated with a fitted
 * multiplier — indicated work, peak pressure, MBT timing, the knock limit — is
 * produced here by integrating one cylinder from intake valve close to exhaust valve
 * open, and reading the answers off the resulting pressure trace.
 *
 * WHY A PRESSURE TRACE
 * The previous model computed torque as fuel energy times three efficiency scalars,
 * with spark timing entering through a parabola centred on a correlated MBT. That
 * cannot express the thing every tuner is actually trading: burn PHASING. Spark does
 * not scale the work done, it moves WHEN the heat arrives relative to the piston, and
 * the piston is in a different place at every crank angle. Too early and the rising
 * pressure fights the piston still coming up — real negative work, and the highest
 * peak pressures. Too late and the burn happens into a cylinder that is already
 * expanding, so the pressure has less leverage and more of the heat goes out of the
 * exhaust valve. MBT is not a formula: it is the timing where those two losses balance,
 * and here it falls out of the integration instead of being asserted.
 *
 * WHAT THIS MODEL IS
 * A single-zone, two-gamma, finite-heat-release cycle — the standard first engineering
 * model above an air-standard cycle, and the same one used to teach the subject:
 *
 *   - Volume from the slider-crank equation, so rod length and stroke matter.
 *   - Heat release from a Wiebe function, the empirical S-curve that real mass-fraction-
 *     burned traces follow closely.
 *   - First law per crank degree: dp = (γ-1)/V · dQ − γ · p/V · dV.
 *   - Work by trapezoidal integration of p dV, giving gross indicated MEP directly.
 *   - The unburned end gas tracked isentropically, feeding an autoignition integral.
 *
 * WHAT IT IS NOT
 * Not a CFD or multi-zone model. There is no flame-front geometry, no crevice volume,
 * no blowby, no cycle-to-cycle variation, and heat transfer is a lumped fraction rather
 * than a Woschni correlation. Those are the honest next steps, not hidden assumptions.
 */

import { COEFF } from './coefficients.js';
import { KPA_PER_BAR, R_AIR } from './constants.js';
import { clamp } from './math.js';
import { evaporativeCoolingK, residualFraction, trappedChargeK } from './thermo.js';

/** Crank angle at which the exhaust valve opens, degrees after TDC firing. */
const EVO_ATDC = 180 - 50;

/**
 * Cylinder volume at a crank angle, from the slider-crank geometry.
 *
 * Rod ratio matters and is not cosmetic: a short rod moves the piston away from TDC
 * faster just after the burn starts, which changes how much of the heat release lands
 * where it can do work.
 *
 * @param {number} thetaDeg crank angle, degrees after TDC firing (negative = before)
 * @param {number} clearanceM3 volume above the piston at TDC
 * @param {number} sweptM3 displacement of one cylinder
 * @param {number} rodRatio connecting rod length ÷ crank radius
 * @returns {number} cylinder volume, m³
 */
export function cylinderVolumeM3(thetaDeg, clearanceM3, sweptM3, rodRatio) {
  const th = (thetaDeg * Math.PI) / 180;
  const s = Math.sin(th);
  // Piston displacement from TDC, in crank radii.
  const x = rodRatio + 1 - Math.cos(th) - Math.sqrt(Math.max(0, rodRatio * rodRatio - s * s));
  return clearanceM3 + (sweptM3 / 2) * x;
}

/**
 * Crank angle at which the intake valve closes, degrees after BDC.
 *
 * A longer-duration camshaft holds the intake valve open later, which is why a big cam
 * loses low-RPM cylinder pressure: some of the charge is pushed back out before the
 * valve shuts. It is also why EFFECTIVE compression is always lower than the static
 * ratio stamped on the piston, and why a cammed engine tolerates more static
 * compression than its number suggests.
 *
 * @param {number} camDuration crank degrees
 * @returns {number} IVC, degrees after BDC
 */
export function ivcAfterBdcDeg(camDuration) {
  return COEFF.IVC_BASE_ABDC + (camDuration - COEFF.IVC_CAM_REF_DURATION) * COEFF.IVC_PER_CAM_DEG;
}

/**
 * Burn duration — how many crank degrees the charge takes to go from 10% to 90% burned.
 *
 * Burn duration in CRANK degrees is roughly constant with engine speed, because
 * turbulence intensity scales with piston speed and the flame speeds up in proportion.
 * It is not exactly constant, and the residual dilution and mixture terms below are the
 * two things a tuner can actually move it with.
 *
 * @param {object} input
 * @param {number} input.rpm engine speed
 * @param {number} input.lambda delivered lambda
 * @param {number} input.residualFrac burned gas left over from the previous cycle, 0..1
 * @param {number} [input.boreFlameFactor] flame travel scaling from bore, 1 at reference
 * @returns {number} burn duration, crank degrees
 */
export function burnDurationDeg({ rpm, lambda, residualFrac, boreFlameFactor = 1 }) {
  // Mixture: fastest a little rich of stoichiometric, slower in both directions. This
  // is why a lean cruise mixture needs so much more advance than a WOT power mixture.
  const lambdaOff = Math.abs(lambda - COEFF.BURN_FASTEST_LAMBDA);
  const mixtureFactor = 1 + lambdaOff * lambdaOff * COEFF.BURN_LAMBDA_PENALTY;
  // Dilution: residual burned gas has no oxygen and absorbs heat, so the flame crawls.
  const dilutionFactor = 1 + residualFrac * COEFF.BURN_RESIDUAL_PENALTY;
  const speedFactor = 1 + (rpm - COEFF.BURN_RPM_REF) * COEFF.BURN_PER_RPM;
  return COEFF.BURN_DURATION_BASE_DEG * boreFlameFactor
    * mixtureFactor * dilutionFactor * clamp(speedFactor, 0.7, 1.6);
}

/**
 * @typedef {object} CycleInput
 * @property {number} rpm engine speed
 * @property {number} sparkBtdc commanded spark advance, degrees before TDC
 * @property {number} trappedPa cylinder pressure at intake valve close
 * @property {number} trappedK charge temperature at intake valve close
 * @property {number} heatJ chemical energy released by the burn, joules
 * @property {number} clearanceM3 volume above the piston at TDC
 * @property {number} sweptM3 one cylinder's displacement
 * @property {number} rodRatio connecting rod length ÷ crank radius
 * @property {number} ivcAbdc intake valve close, degrees after BDC
 * @property {number} burnDeg burn duration, crank degrees
 * @property {number} octaneNumber fuel antiknock index
 * @property {number} [lambda] delivered lambda; sets how hot the flame behind the
 *   front runs, which heats the end gas on top of compression
 */

/**
 * @typedef {object} CycleResult
 * @property {number} imepGrossPa gross indicated MEP over the closed period
 * @property {number} peakPressurePa highest cylinder pressure reached
 * @property {number} peakPressureDeg crank angle of that peak, degrees ATDC
 * @property {number} peakEndGasK hottest the unburned end gas got
 * @property {number} knockIntegral Livengood-Wu autoignition integral; ≥ 1 means knock
 * @property {number} mfb50Deg crank angle of 50% mass burned, degrees ATDC
 */

/**
 * Integrates one closed cycle and reports what the pressure trace says.
 *
 * @param {CycleInput} input
 * @returns {CycleResult}
 */
export function runCycle({
  rpm, sparkBtdc, trappedPa, trappedK, heatJ,
  clearanceM3, sweptM3, rodRatio, ivcAbdc, burnDeg, octaneNumber, lambda = 0.9,
}) {
  const step = COEFF.CYCLE_STEP_DEG;
  const thetaStart = -180 + ivcAbdc;
  const spark = -sparkBtdc;
  // Spark does not light the charge instantly: there is a delay while a kernel forms
  // and grows to a self-sustaining flame. Combustion is therefore phased from the end
  // of that delay, not from the spark event.
  const burnStart = spark + COEFF.FLAME_DEVELOPMENT_DEG;
  const burnEnd = burnStart + burnDeg;
  // Heat actually available to raise pressure: the rest goes into the chamber walls.
  const netHeatJ = heatJ * (1 - COEFF.CYCLE_HEAT_LOSS_FRAC);
  // Time per crank degree, milliseconds — the clock the autoignition integral runs on.
  const msPerDeg = 1000 / (6 * Math.max(rpm, 1));

  // Constant for the whole cycle, so it is computed once rather than at every step:
  // the octane and scale part of the ignition-delay correlation.
  const tauFuelTerm = COEFF.KNOCK_TAU_SCALE * COEFF.KNOCK_DE_A
    * Math.pow(octaneNumber / 100, COEFF.KNOCK_DE_B);
  // How hot the burned gas behind the flame front is running, relative to its hottest.
  // Peaks just lean of stoichiometric and heats the end gas on top of compression.
  const lambdaOffPeak = (lambda - COEFF.FLAME_TEMP_PEAK_LAMBDA) / COEFF.FLAME_TEMP_WIDTH;
  const flameHeating = 1 + COEFF.ENDGAS_FLAME_TEMP_GAIN * Math.exp(-lambdaOffPeak * lambdaOffPeak);

  let p = trappedPa;
  let v = cylinderVolumeM3(thetaStart, clearanceM3, sweptM3, rodRatio);
  let work = 0;
  let peakPressurePa = p;
  let peakPressureDeg = thetaStart;
  let peakEndGasK = trappedK;
  let knockIntegral = 0;
  let mfb50Deg = burnStart + burnDeg / 2;
  let prevBurned = 0;
  let crossed50 = false;

  /** Wiebe mass fraction burned at a crank angle. */
  const burnedFraction = (theta) => {
    if (theta <= burnStart) return 0;
    if (theta >= burnEnd) return 1;
    const x = (theta - burnStart) / burnDeg;
    return 1 - Math.exp(-COEFF.WIEBE_A * Math.pow(x, COEFF.WIEBE_M + 1));
  };

  for (let theta = thetaStart; theta < EVO_ATDC; theta += step) {
    const thetaNext = theta + step;
    const vNext = cylinderVolumeM3(thetaNext, clearanceM3, sweptM3, rodRatio);
    const burned = burnedFraction(thetaNext);
    const dQ = (burned - prevBurned) * netHeatJ;

    // Ratio of specific heats falls as the charge burns — hot combustion products are
    // polyatomic and store energy in vibration. Blending between the two is the cheap
    // stand-in for a real two-zone model, and it matters: holding gamma at its
    // unburned value overstates peak pressure badly.
    const gamma = COEFF.GAMMA_UNBURNED
      + (COEFF.GAMMA_BURNED - COEFF.GAMMA_UNBURNED) * burned;

    // First law for a single zone: pressure rises with heat added and falls as the
    // volume grows.
    const dp = ((gamma - 1) / v) * dQ - (gamma * p * (vNext - v)) / v;
    const pNext = Math.max(1, p + dp);

    // Work on the piston, trapezoidal.
    work += ((p + pNext) / 2) * (vNext - v);

    // --- END GAS AND AUTOIGNITION
    // The unburned charge ahead of the flame is compressed isentropically by the
    // pressure the burned gas is generating, so it gets hotter than compression alone
    // would make it. That is the gas that autoignites, and this is why knock is a
    // pressure-and-time problem rather than a timing threshold.
    if (burned < COEFF.KNOCK_ENDGAS_BURN_LIMIT) {
      const endGasK = trappedK * flameHeating
        * Math.pow(pNext / trappedPa, (COEFF.GAMMA_UNBURNED - 1) / COEFF.GAMMA_UNBURNED);
      if (endGasK > peakEndGasK) peakEndGasK = endGasK;
      // Douaud & Eyzat ignition delay: the time this mixture can survive at this
      // pressure and temperature before it lights itself. Octane enters here, as a
      // fuel property, rather than as a bonus in degrees.
      const pAtm = pNext / COEFF.ATM_PA;
      const tau = tauFuelTerm
        * Math.pow(pAtm, -COEFF.KNOCK_DE_N)
        * Math.exp(COEFF.KNOCK_DE_E / endGasK);
      // Livengood-Wu: autoignition when the accumulated fraction of the delay reaches 1.
      knockIntegral += (step * msPerDeg) / tau;
    }

    if (pNext > peakPressurePa) { peakPressurePa = pNext; peakPressureDeg = thetaNext; }
    if (!crossed50 && burned >= 0.5) { mfb50Deg = thetaNext; crossed50 = true; }

    p = pNext;
    v = vNext;
    prevBurned = burned;
  }

  return {
    imepGrossPa: work / sweptM3,
    peakPressurePa,
    peakPressureDeg,
    peakEndGasK,
    knockIntegral,
    mfb50Deg,
  };
}

/**
 * The most spark advance this cycle tolerates before the end gas lights itself.
 *
 * Found by solving `runCycle` for the timing at which the autoignition integral
 * reaches 1, rather than by looking the answer up in a table of corrections. Every
 * input that changes the pressure history — compression, boost, charge temperature,
 * mixture, engine speed, cam timing, fuel octane — therefore moves the knock limit
 * automatically and in the right proportion, with no separate term for each.
 *
 * A mixture that cannot be made to knock anywhere in the searchable range — anything at
 * cruise — reports KNOCK_UNBOUNDED_BTDC rather than the ceiling, because the ceiling is
 * an artefact of the search and not a property of the engine.
 *
 * @param {CycleInput} base cycle inputs; `sparkBtdc` is ignored
 * @returns {number} knock-limited spark advance, degrees BTDC
 */
export function knockLimitedSpark(base) {
  const integralAt = (sparkBtdc) => runCycle({ ...base, sparkBtdc }).knockIntegral;
  const lo = COEFF.KNOCK_SEARCH_MIN_BTDC;
  const hi = COEFF.KNOCK_SEARCH_MAX_BTDC;

  // Most logged points cannot be made to knock at all — anything at cruise, and any
  // low-compression engine off boost. Testing the advanced end first answers those in
  // one cycle evaluation instead of a full search, which matters because this runs for
  // every point of every pull.
  if (integralAt(hi) < 1) return COEFF.KNOCK_UNBOUNDED_BTDC;
  if (integralAt(lo) >= 1) return lo;

  // Bisection. The search ceiling is deliberately below the advance at which the
  // autoignition integral stops being monotonic: advance far enough and the charge is
  // almost entirely burned before TDC, so there is little end gas left to accumulate
  // delay and the integral turns back DOWN. Bisecting across that hump would report a
  // "knock limit" well past where the engine actually started detonating. Keeping the
  // ceiling below it means the function is monotonic everywhere it is searched.
  let a = lo;
  let b = hi;
  while (b - a > COEFF.KNOCK_SEARCH_TOL_DEG) {
    const mid = (a + b) / 2;
    if (integralAt(mid) >= 1) b = mid; else a = mid;
  }
  return a;
}

/**
 * Peak cylinder pressure in bar, for display and for the wear model.
 *
 * @param {number} peakPressurePa
 * @returns {number} bar
 */
export const paToBar = (peakPressurePa) => peakPressurePa / (KPA_PER_BAR * 1000);

/**
 * Air actually trapped in one cylinder for one cycle, grams.
 *
 * The ideal gas law against the swept volume, scaled by volumetric efficiency. Exported
 * so the ECU's per-point solve and the factory calibration generator cannot end up with
 * two slightly different ideas of how much air is in the cylinder.
 *
 * @param {object} input
 * @param {number} input.veActual true cylinder filling, percent
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.chargeK incoming charge temperature, K
 * @param {number} input.sweptM3 one cylinder's displacement
 * @returns {number} grams of air
 */
export function trappedAirGrams({ veActual, mapKpa, chargeK, sweptM3 }) {
  const densityKgM3 = (mapKpa * 1000) / (R_AIR * chargeK);
  return (veActual / 100) * sweptM3 * densityKgM3 * 1000;
}

/**
 * Builds the cycle inputs for one operating point.
 *
 * Shared by the ECU's per-point solve and by the factory calibration generator, for the
 * reason every shared formula in this codebase is shared: two copies of this setup would
 * drift, and then the generated calibration would be knock-limited against a slightly
 * different engine than the one the player drives.
 *
 * @param {object} input
 * @param {number} input.rpm engine speed
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.empKpa exhaust manifold pressure, kPa
 * @param {number} input.intakeK incoming charge temperature, K
 * @param {number} input.airChargeG air actually trapped per cylinder per cycle, grams
 * @param {number} input.burnedFuelG fuel that finds oxygen to burn, grams
 * @param {number} [input.fuelMassG] fuel delivered, grams — all of it evaporates and
 *   cools the charge, including the part too rich to find oxygen. Defaults to the
 *   burned mass when a caller has no separate figure
 * @param {number} input.lambda delivered lambda
 * @param {{lhv: number, octane: number, stoich: number}} input.fuel
 * @param {import('./engine.js').DerivedEngine} input.derived
 * @returns {CycleInput & {residualFrac: number, trappedK: number, effectiveCr: number}}
 */
export function cycleInputsFor({
  rpm, mapKpa, empKpa, intakeK, airChargeG, burnedFuelG, fuelMassG, lambda, fuel, derived,
}) {
  const fuelIn = fuelMassG ?? burnedFuelG;
  const sweptM3 = (derived.displacementL / derived.cyl) / 1000;
  const clearanceM3 = sweptM3 / (derived.compression - 1);
  const ivcAbdc = ivcAfterBdcDeg(derived.camDuration);
  const vIvc = cylinderVolumeM3(-180 + ivcAbdc, clearanceM3, sweptM3, COEFF.ROD_RATIO);

  const residualFrac = residualFraction({ mapKpa, empKpa, overlapDeg: derived.overlapDeg || 0 });
  // Fuel evaporating into the charge cools it before anything else happens to it, so a
  // richer mixture starts compression colder and a leaner one starts hotter.
  const cooledK = intakeK - evaporativeCoolingK(fuelIn, airChargeG, fuel);
  const trappedK = trappedChargeK(cooledK, residualFrac) + (derived.chamberOffsetK || 0);

  // Pressure at intake valve close, from the ideal gas law on the fresh charge at the
  // temperature it arrived at. Deriving it rather than assuming it equals manifold
  // pressure is what lets volumetric efficiency above 100% — ram and scavenging — show
  // up as genuinely higher cylinder pressure.
  //
  // Deliberately NOT re-derived at the residual-mixed temperature. The manifold sets the
  // pressure at IVC; hot residual raises the charge TEMPERATURE at that pressure, it
  // does not pressurise the cylinder further. Computing p from the mixed temperature at
  // fixed mass inflated trapped pressure by about a tenth under boost, and since
  // ignition delay goes as pressure to the -1.7 power, that alone made boosted engines
  // far more knock-prone than they are. Pressure comes from the fresh charge; the mixed
  // temperature below is what the thermal history and the end gas run on.
  const trappedPa = ((airChargeG / 1000) * R_AIR * cooledK) / vIvc;

  return {
    rpm,
    sparkBtdc: 0,
    trappedPa,
    trappedK,
    heatJ: (burnedFuelG / 1000) * fuel.lhv,
    clearanceM3,
    sweptM3,
    rodRatio: COEFF.ROD_RATIO,
    ivcAbdc,
    burnDeg: burnDurationDeg({
      rpm, lambda, residualFrac, boreFlameFactor: derived.boreFlameFactor,
    }),
    octaneNumber: fuel.octane,
    lambda,
    residualFrac,
    effectiveCr: vIvc / clearanceM3,
  };
}

/**
 * MBT for one table cell, from the cycle the rest of the model runs.
 *
 * The spark advisor and the factory calibration generator must not disagree about what
 * good timing looks like — the advisor's own comment says so — so both come through
 * here rather than each estimating MBT their own way.
 *
 * @param {Parameters<typeof cycleInputsFor>[0]} input
 * @returns {number} MBT spark advance, degrees BTDC
 */
export function mbtForCell(input) {
  return mbtFromBurn(cycleInputsFor(input).burnDeg);
}

/**
 * Minimum spark for best torque, derived rather than correlated.
 *
 * MBT is the timing that centres the heat release where the piston can use it: across
 * engine types, best torque lands with 50% of the mass burned at roughly 8-10 degrees
 * after TDC. Given the Wiebe shape, the crank angle of 50% burn is a fixed fraction of
 * the burn duration after ignition, so the timing that puts it there can be written
 * down directly instead of fitted.
 *
 * That makes MBT respond to everything burn duration responds to — mixture, dilution,
 * engine speed — which the previous RPM-and-load correlation could not do.
 *
 * @param {number} burnDeg burn duration, crank degrees
 * @returns {number} MBT spark advance, degrees BTDC
 */
export function mbtFromBurn(burnDeg) {
  // Crank angle of 50% burn, as a fraction of the burn duration: solve the Wiebe
  // function for x where the burned fraction is one half.
  const half = Math.pow(Math.log(2) / COEFF.WIEBE_A, 1 / (COEFF.WIEBE_M + 1));
  // Clamped to the band a spark table can actually hold, which is the guard the
  // light-load MBT work added: a very slow, heavily diluted burn would otherwise ask
  // for advance no calibration would ever write.
  return clamp(
    COEFF.FLAME_DEVELOPMENT_DEG + half * burnDeg - COEFF.MFB50_ATDC_DEG,
    COEFF.MBT_MIN_DEG, COEFF.MBT_MAX_DEG,
  );
}
