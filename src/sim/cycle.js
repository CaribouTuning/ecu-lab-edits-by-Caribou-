/**
 * The closed part of the engine cycle, solved on a crank-angle grid.
 *
 * The physics core. Indicated work, peak pressure, MBT and the knock limit are all read
 * off one integrated pressure trace, from intake valve close to exhaust valve open.
 *
 * WHY A TRACE. Torque used to be fuel energy times three efficiency scalars, with spark
 * entering through a parabola on a correlated MBT. That cannot express burn PHASING —
 * spark does not scale the work done, it moves WHEN the heat arrives relative to a piston
 * that is somewhere different at every crank angle. Too early and rising pressure fights
 * the piston still coming up; too late and the burn happens into a cylinder already
 * expanding. MBT is where those two losses balance, and it falls out of the integration
 * instead of being asserted.
 *
 * THE MODEL. Single zone, two gamma, finite heat release:
 *   - Slider-crank volume, so rod length and stroke matter.
 *   - Wiebe heat release after a flame-development delay.
 *   - First law per step: dp = (γ-1)/V · dQ − γ · p/V · dV.
 *   - Trapezoidal p dV, giving gross indicated MEP directly.
 *   - Unburned end gas tracked isentropically, feeding an autoignition integral.
 *   - Woschni wall heat transfer, against an area that grows as the piston uncovers the
 *     liner.
 *
 * WHY ENGINE SPEED MATTERS TWICE. Knock is a pressure-AND-TIME problem: the Livengood-Wu
 * integral accumulates in MILLISECONDS, so a 1900 RPM cycle gives the end gas nearly
 * three times the dwell of a 5500 RPM one. It also gives it three times as long to shed
 * heat into a 450 K head. Model only the dwell side and the knock limit collapses at low
 * speed, exactly where a boosted engine makes its rated torque. Both halves are here.
 *
 * WHAT IT IS NOT. Not CFD, and not two-zone — burned-gas temperature is not tracked,
 * which is why end-gas flame heating is a fitted term rather than a computed one. No
 * flame-front geometry, no crevice volume, no blowby, no cycle-to-cycle variation.
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
 * Burn duration — the crank angle the Wiebe function spans, from the end of the flame
 * development delay to essentially complete combustion.
 *
 * This is the TOTAL duration, not the 10-90% figure usually quoted in the literature.
 * With `WIEBE_A = 5` and `WIEBE_M = 2` the 10-90% window is very close to half of it, so
 * a 42-degree total here is a ~21-degree 10-90%, which is where a production engine sits.
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
 * @property {number} boreM cylinder bore, metres — sets heat-transfer area
 * @property {number} strokeM stroke, metres — sets piston speed and liner area
 * @property {number} trappedMassKg total mass in the cylinder, for the gas-law temperature
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
  boreM, strokeM, trappedMassKg,
}) {
  const step = COEFF.CYCLE_STEP_DEG;
  const thetaStart = -180 + ivcAbdc;
  const spark = -sparkBtdc;
  // Spark does not light the charge instantly: there is a delay while a kernel forms
  // and grows to a self-sustaining flame. Combustion is therefore phased from the end
  // of that delay, not from the spark event.
  const burnStart = spark + COEFF.FLAME_DEVELOPMENT_DEG;
  const burnEnd = burnStart + burnDeg;
  // Geometry the wall heat-transfer model needs. What reaches the piston is the heat
  // release minus whatever the walls take, and the wall term is computed per step below
  // rather than assumed as a fixed fraction of the fuel.
  const boreAreaM2 = (Math.PI / 4) * boreM * boreM;
  const meanPistonSpeed = 2 * strokeM * (rpm / 60);
  // Motored reference state for the Woschni combustion term: what the pressure would
  // have been at this crank angle with no combustion at all.
  const vIvcRef = cylinderVolumeM3(thetaStart, clearanceM3, sweptM3, rodRatio);
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
  // Heat the unburned charge has given up to the chamber wall by this point in the
  // cycle, as a temperature the end gas is BELOW its adiabatic value. See the note at
  // the accumulation site: this is what makes the knock limit's speed dependence real
  // rather than pure dwell time.
  let endGasCoolK = 0;

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
    const dQ = (burned - prevBurned) * heatJ;

    // Gamma falls as the charge burns: hot products are polyatomic and store energy in
    // vibration. Blending is the cheap stand-in for two zones, and it matters — holding
    // gamma unburned overstates peak pressure badly.
    const gamma = COEFF.GAMMA_UNBURNED
      + (COEFF.GAMMA_BURNED - COEFF.GAMMA_UNBURNED) * burned;

    // --- WALL HEAT TRANSFER, per step, from Woschni. Heat loss scales with surface
    // area, gas temperature and charge motion, NOT with fuel — so a small cylinder, a
    // slow-turning engine and a boosted one each lose proportionally more, none of which
    // a flat fraction of fuel energy could express.
    const tGas = (p * v) / (trappedMassKg * R_AIR);
    // Exposed area: head, piston crown, and the liner the piston has uncovered.
    const strokeFrac = Math.max(0, (v - clearanceM3) / sweptM3);
    const areaM2 = 2 * boreAreaM2 + Math.PI * boreM * strokeM * strokeFrac;
    // Woschni's characteristic gas velocity. The second term is the extra motion
    // combustion itself creates, driven by how far pressure has risen above the motored
    // trace — so it only appears once something is burning.
    const pMotoredPa = trappedPa * Math.pow(vIvcRef / v, COEFF.GAMMA_UNBURNED);
    const wGas = COEFF.WOSCHNI_C1 * meanPistonSpeed
      + (burned > 0
        ? COEFF.WOSCHNI_C2 * (sweptM3 * trappedK / (trappedPa * vIvcRef))
          * Math.max(0, p - pMotoredPa)
        : 0);
    const hCoeff = COEFF.WOSCHNI_K * Math.pow(boreM, -0.2)
      * Math.pow(p / 1000, 0.8) * Math.pow(tGas, -0.55) * Math.pow(Math.max(wGas, 0.1), 0.8);
    // Seconds per integration step: a crank turns 6 x rpm degrees per second.
    const dtS = step / (6 * Math.max(rpm, 1));
    const dQwall = hCoeff * areaM2 * (tGas - COEFF.WALL_TEMP_K) * dtS;

    // First law for a single zone: pressure rises with heat added, falls as the volume
    // grows, and falls again with whatever the walls took.
    const dp = ((gamma - 1) / v) * (dQ - dQwall) - (gamma * p * (vNext - v)) / v;
    const pNext = Math.max(1, p + dp);

    // Work on the piston, trapezoidal.
    work += ((p + pNext) / 2) * (vNext - v);

    // --- END GAS AND AUTOIGNITION. See "THE END GAS" in the module docblock for why
    // this is compression MINUS wall loss rather than compression alone.
    if (burned < COEFF.KNOCK_ENDGAS_BURN_LIMIT) {
      const adiabaticK = trappedK * flameHeating
        * Math.pow(pNext / trappedPa, (COEFF.GAMMA_UNBURNED - 1) / COEFF.GAMMA_UNBURNED);
      // The unburned zone's share of the wall area and of the trapped mass are both
      // roughly (1 - burned), so they cancel: the same Woschni coefficient over the same
      // area, against the unburned charge's own heat capacity.
      endGasCoolK += (hCoeff * areaM2 * (adiabaticK - COEFF.WALL_TEMP_K) * dtS
        * COEFF.ENDGAS_WALL_AREA_FRAC) / (trappedMassKg * COEFF.CHARGE_CP);
      const endGasK = Math.max(trappedK, adiabaticK - endGasCoolK);
      if (endGasK > peakEndGasK) peakEndGasK = endGasK;
      // Douaud & Eyzat ignition delay: how long this mixture survives at this pressure
      // and temperature before lighting itself. Octane enters here as a fuel property.
      const tau = tauFuelTerm
        * Math.pow(pNext / COEFF.ATM_PA, -COEFF.KNOCK_DE_N)
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
 * Solved from `runCycle` rather than looked up, so every input that changes the pressure
 * history — compression, boost, charge temperature, mixture, engine speed, cam timing,
 * octane — moves the limit automatically, with no separate term for each.
 *
 * A mixture that cannot knock anywhere in range reports KNOCK_UNBOUNDED_BTDC, not the
 * ceiling: the ceiling is an artefact of the search, not a property of the engine.
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
 * Air actually trapped in one cylinder for one cycle, grams — the ideal gas law against
 * swept volume, scaled by VE. Exported so the per-point solve and the calibration
 * generator cannot end up with two ideas of how much air is in the cylinder.
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
 * Builds the cycle inputs for one operating point. Shared by the per-point solve and the
 * factory calibration generator: two copies would drift, and the generated calibration
 * would then be knock-limited against a different engine than the player drives.
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

  const residualFrac = residualFraction({
    mapKpa, empKpa, overlapDeg: derived.overlapDeg || 0, compression: derived.compression,
  });
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

  const totalMassKg = (airChargeG / 1000) / Math.max(0.05, 1 - residualFrac);

  return {
    rpm,
    sparkBtdc: 0,
    trappedPa,
    boreM: derived.bore / 1000,
    strokeM: derived.stroke / 1000,
    trappedMassKg: totalMassKg,
    trappedK,
    heatJ: (burnedFuelG / 1000) * fuel.lhv * COEFF.COMBUSTION_COMPLETENESS,
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
 * MBT for one table cell, from the cycle the rest of the model runs. The advisor and the
 * calibration generator both come through here so they cannot disagree about what good
 * timing looks like.
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
 * Best torque lands with 50% of the mass burned 8-10 degrees after TDC across engine
 * types. Given the Wiebe shape, 50% burn is a fixed fraction of the duration after
 * ignition, so the timing that puts it there is written down rather than fitted — which
 * makes MBT respond to mixture, dilution and speed, as the old correlation could not.
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
