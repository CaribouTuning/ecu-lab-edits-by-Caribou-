/**
 * Manifold pressure and best-power mixture.
 *
 * Manifold pressure is the real load signal. Throttle sets how much of atmospheric
 * pressure reaches the manifold; boost adds on top of that. Everything downstream
 * indexes off MAP, exactly as a speed-density ECU does.
 */

import { BARO_KPA, PSI_TO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/**
 * @typedef {object} ManifoldState
 * @property {number} mapKpa manifold absolute pressure, kPa
 * @property {number} boostPsi gauge boost, psi
 * @property {number} throttleFrac throttle opening, 0..1
 * @property {number} spool turbo spool fraction, 0..1
 */

/**
 * Solves manifold conditions for one operating point.
 *
 * @param {number} rpm engine speed
 * @param {number} loadKpa commanded load (throttle), kPa
 * @param {boolean} turboOn whether a turbo is fitted
 * @param {number} boostTarget target boost at this RPM, psi
 * @param {{spoolRange: number}} turbine
 * @param {{lagAdd: number}} compressor
 * @returns {ManifoldState}
 */
export function computeManifold(rpm, loadKpa, turboOn, boostTarget, turbine, compressor) {
  const throttleFrac = clamp(loadKpa / BARO_KPA, 0, 1);
  const effectiveSpoolRange = Math.max(400, turbine.spoolRange + compressor.lagAdd);
  const spool = clamp((rpm - 1500) / effectiveSpoolRange, 0, 1);
  const boostPsi = turboOn ? boostTarget * spool * Math.pow(throttleFrac, 2) : 0;
  const mapKpa = Math.min(loadKpa, BARO_KPA) + boostPsi * PSI_TO_KPA;
  return { mapKpa, boostPsi, throttleFrac, spool };
}

/**
 * Gasoline-equivalent AFR that makes best power at a given boost level.
 *
 * Best-power mixture is NOT a single number. Research and tuner practice put
 * naturally aspirated best torque near lambda 0.85–0.92 (~12.5–13.5:1 on gasoline)
 * and forced induction meaningfully richer, near lambda 0.82–0.85 (~12.0–12.5:1) —
 * the extra fuel under boost is charge cooling, bought deliberately to hold off knock.
 *
 * @param {number} boostPsi gauge boost, psi
 * @returns {number} best-power AFR, gasoline-equivalent
 */
export function bestPowerAfr(boostPsi) {
  return COEFF.BEST_AFR_NA - clamp(boostPsi * COEFF.BEST_AFR_BOOST_SHIFT, 0, COEFF.BEST_AFR_BOOST_CAP);
}
