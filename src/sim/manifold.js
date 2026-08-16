/**
 * Manifold pressure and best-power mixture.
 *
 * Manifold pressure is the real load signal. Throttle sets how much of atmospheric
 * pressure reaches the manifold; boost adds on top of that. Everything downstream
 * indexes off MAP, exactly as a speed-density ECU does.
 */

import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/**
 * WHAT USED TO BE HERE
 * `computeManifold` solved boost as `target x spool x throttle^2`, with spool a linear
 * ramp in engine speed. `solveInduction` in turbo.js replaced it: boost now comes from a
 * turbine/compressor power balance, so it responds to exhaust energy rather than to RPM,
 * and the player's target is a wastegate ceiling instead of a promise.
 *
 */

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
