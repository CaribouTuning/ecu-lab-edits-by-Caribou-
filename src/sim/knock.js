/**
 * The knock envelope and MBT timing.
 *
 * Extracted from `evaluatePoint` so the factory calibration generator in
 * `presets.js` can ask the physics the same question the ECU asks: "how much
 * timing can this engine take here?" A second copy of these formulas would drift
 * from the first, which is the precise failure `idealExhaustDiameter` was created
 * to prevent — see the warning in `hardware.js`.
 */

import { BARO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp, interp1 } from './math.js';
import { BASE_KNOCK_LIMIT_91, RPM } from './tables.js';

/**
 * Minimum spark for best torque, degrees BTDC.
 *
 * Derived from burn duration rather than fitted directly. Combustion takes a roughly
 * fixed number of crank degrees for a given charge, so the timing that extracts the
 * most work is the one that lands 50% mass-fraction-burned just after TDC — early
 * enough that peak pressure arrives while the piston can still be pushed on, late
 * enough that it is not fighting the crank on the way up.
 *
 * Two things stretch the burn out. Revs: the flame does not speed up in proportion to
 * engine speed, so it occupies more DEGREES the faster you spin. And dilution: a
 * part-throttle charge is thin and slow-burning, which is why a factory cruise map
 * carries 40-50 degrees of advance and never knocks, while the same engine at wide-open
 * throttle wants barely half that.
 *
 * @param {number} rpm engine speed
 * @param {number} mapKpa manifold absolute pressure, kPa
 * @returns {number} degrees BTDC, within [COEFF.MBT_MIN_DEG, COEFF.MBT_MAX_DEG]
 */
export function mbtTiming(rpm, mapKpa) {
  const pressureRatio = Math.max(mapKpa / BARO_KPA, COEFF.BURN_RATIO_FLOOR);
  // Crank degrees from spark to 50% mass fraction burned.
  const theta50 = (COEFF.BURN_REF_DEG + ((rpm - 1500) / 6000) * COEFF.BURN_RPM_GAIN)
    * Math.pow(1 / pressureRatio, COEFF.BURN_DILUTION_EXP);
  return clamp(theta50 - COEFF.MFB50_ATDC_DEG, COEFF.MBT_MIN_DEG, COEFF.MBT_MAX_DEG);
}

/**
 * The most spark advance this operating point tolerates before it knocks.
 *
 * @param {object} input
 * @param {number} input.rpm engine speed
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.veActual TRUE cylinder filling, percent
 * @param {number} input.chargeC charge temperature, degrees C
 * @param {number} input.actualAfr delivered air:fuel ratio, gasoline-equivalent
 * @param {number} input.bestAfr best-power AFR at this boost
 * @param {number} input.boostPsi gauge boost, psi
 * @param {number} input.octaneBonus knock margin from fuel octane, degrees
 * @param {object} input.mods bolt-ons fitted
 * @param {import('./engine.js').DerivedEngine} input.derived
 * @param {{boostCeiling: number}} input.compressor
 * @returns {number} knock-limited spark advance, degrees BTDC
 */
export function knockThreshold({
  rpm, mapKpa, veActual, chargeC, actualAfr, bestAfr, boostPsi,
  octaneBonus, mods, derived, compressor,
}) {
  const afrDelta = actualAfr - bestAfr;
  // Knock is driven by how much charge is actually TRAPPED in the cylinder, not by
  // manifold pressure alone. Two engines at the same MAP but different volumetric
  // efficiency see different peak pressures — which is exactly why a big-cam engine
  // that breathes better also needs a few degrees less timing than a stock one.
  const chargeIndex = (veActual / 100) * (mapKpa / BARO_KPA);
  // Knock margin is not linear in charge. Doubling the trapped mass roughly doubles
  // peak pressure, so margin scales with the RATIO of charge to the reference, not
  // the difference. At deep vacuum an engine effectively cannot knock at all — which
  // is why factory cruise maps carry 40-50 deg of advance and never complain.
  const loadBonus = chargeIndex >= COEFF.KNOCK_CHARGE_REF
    ? (COEFF.KNOCK_CHARGE_REF - chargeIndex) * COEFF.KNOCK_CHARGE_GAIN
    : (COEFF.KNOCK_CHARGE_REF / Math.max(chargeIndex, 0.04) - 1) * COEFF.KNOCK_CHARGE_RATIO_GAIN;
  const overBoost = Math.max(0, boostPsi - compressor.boostCeiling);
  const iatPenalty = Math.max(0, chargeC - 25) * COEFF.KNOCK_IAT_PER_C;
  const modsThresholdBonus = (mods.headers ? 1.5 : 0) + (mods.exhaust ? 0.5 : 0);
  let threshold = interp1(RPM, BASE_KNOCK_LIMIT_91, rpm) + octaneBonus + loadBonus + modsThresholdBonus
    + derived.configKnockBonus + derived.materialKnockBonus + derived.compressionKnockAdj
    - iatPenalty - overBoost * COEFF.KNOCK_OVERBOOST_PENALTY;
  // A lean mixture only threatens knock when there is real cylinder pressure behind
  // it. At light cruise (low MAP) an engine happily runs 14.7:1 with 40 deg of advance
  // and never knocks — which is exactly why factory cruise maps look like that. Under
  // boost the same leanness is dangerous. So scale the mixture terms by charge
  // pressure rather than applying them flat.
  const pressureFactor = clamp(Math.pow(mapKpa / BARO_KPA, 1.5), 0.05, 2.6);
  threshold -= Math.max(0, afrDelta) * COEFF.KNOCK_LEAN_PENALTY * pressureFactor;
  threshold += Math.min(COEFF.KNOCK_RICH_CAP, Math.max(0, -afrDelta) * COEFF.KNOCK_RICH_BONUS)
    * clamp(pressureFactor, 0.3, 1.5);
  return threshold;
}

/** The charge index used by the knock model, exposed for the datalog. */
export function chargeIndexOf(veActual, mapKpa) {
  return (veActual / 100) * (mapKpa / BARO_KPA);
}
