/**
 * THE THROTTLE: what a throttle opening does to manifold pressure.
 *
 * A throttle is an orifice. Air flows through the plate's open area at a rate set by the
 * pressure across it (compressible orifice flow, Heywood, Internal Combustion Engine
 * Fundamentals, App. C), and the engine draws air out of the manifold at a rate set by its
 * own breathing at that pressure. Manifold pressure is where the two meet. So the same
 * opening gives near-atmospheric pressure at low speed, where the engine draws little, and
 * deep vacuum at high speed, where it draws much more than the opening can pass: the
 * reason part throttle is not a fixed share of full load.
 *
 * Upstream of the plate the air has come through the intake duct and filter, which lose a
 * share of the dynamic pressure of the flow. That is where a cold air intake's gain is: a
 * freer duct leaves more pressure for the manifold at full throttle.
 */

import { BARO_KPA, R_AIR } from './constants.js';
import { COEFF } from './coefficients.js';
import { orificeFlow } from './breathing.js';
import { clamp } from './math.js';

const DEG = Math.PI / 180;

/**
 * Throttle bore for an engine, m: sized, as production throttle bodies are, so the plate
 * wide open costs only a few kPa at the engine's greatest airflow (its redline at 100% VE,
 * sea level). Sizing it for COEFF.THROTTLE_SIZING_DROP_KPA gives about 68 mm for a 3.5 L V6
 * revving to 7000 and 79 mm for a 5.7 L V8 to 6000, against 70-ish and 75-78 mm on the real
 * engines.
 * @param {{displacementL: number, redline?: number}} derived
 * @returns {number}
 */
export function throttleBoreM(derived) {
  const rho = (BARO_KPA * 1000) / (R_AIR * 298);
  const maxFlow = (derived.displacementL / 1000) * rho * ((derived.redline ?? 7000) / 120);
  const area = maxFlow / (COEFF.THROTTLE_CD * Math.sqrt(2 * rho * COEFF.THROTTLE_SIZING_DROP_KPA * 1000));
  return Math.sqrt((4 * area) / Math.PI);
}

/**
 * The plate's effective open area at an opening, m^2: the annulus a round plate leaves in a
 * round bore as it turns, A = (pi D^2 / 4)(1 - cos(psi) / cos(psi0)), psi the plate's angle
 * from across the bore, psi0 where it rests closed (Heywood, App. C), plus the leakage past a
 * closed plate; times the discharge coefficient.
 * @param {number} frac opening, 0 closed to 1 wide open
 * @param {number} boreM
 * @returns {number}
 */
export function throttleAreaM2(frac, boreM) {
  const psi0 = COEFF.THROTTLE_CLOSED_DEG * DEG;
  const psi = psi0 + clamp(frac, 0, 1) * (90 * DEG - psi0);
  const full = (Math.PI / 4) * boreM * boreM;
  return COEFF.THROTTLE_CD * full * (Math.max(0, 1 - Math.cos(psi) / Math.cos(psi0)) + COEFF.THROTTLE_LEAK_SHARE);
}

/**
 * Pressure lost in the intake duct and filter ahead of the throttle, kPa: a loss coefficient
 * on the duct's dynamic pressure, the duct taken at the throttle's bore. A cold air intake's
 * freer path has the smaller coefficient.
 * @param {number} flowKgS
 * @param {number} boreM
 * @param {boolean} coldAirIntake
 * @param {number} [inletK]
 * @param {number} [baroKpa]
 * @returns {number}
 */
export function inletDropKpa(flowKgS, boreM, coldAirIntake, inletK = 298, baroKpa = BARO_KPA) {
  const rho = (baroKpa * 1000) / (R_AIR * inletK);
  const u = flowKgS / (rho * (Math.PI / 4) * boreM * boreM);
  const k = coldAirIntake ? COEFF.INLET_K_COLD_AIR : COEFF.INLET_K_STOCK;
  return (k * rho * u * u) / 2 / 1000;
}

/**
 * The manifold pressure an opening holds at this speed, kPa absolute: where the air the
 * plate passes equals the air the engine draws. Bisection on the manifold pressure; both
 * sides are monotonic in it.
 *
 * @param {object} input
 * @param {number} input.throttleFrac opening, 0..1
 * @param {(mapKpa: number) => number} input.engineFlowAt air the engine draws at a manifold pressure, kg/s
 * @param {number} input.boreM throttle bore
 * @param {boolean} [input.coldAirIntake]
 * @param {number} [input.baroKpa]
 * @param {number} [input.inletK] air temperature at the inlet, K
 * @returns {number}
 */
export function throttledMapKpa({ throttleFrac, engineFlowAt, boreM, coldAirIntake = false, baroKpa = BARO_KPA, inletK = 298 }) {
  const area = throttleAreaM2(throttleFrac, boreM);
  // Upstream of the plate: atmosphere less the duct's loss at this flow.
  const upstreamAt = (flow) => baroKpa - inletDropKpa(flow, boreM, coldAirIntake, inletK, baroKpa);
  let lo = 3;
  let hi = baroKpa;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const demand = engineFlowAt(mid);
    const up = upstreamAt(demand);
    const supply = up > mid ? orificeFlow(area, up * 1000, inletK, mid * 1000) : 0;
    if (supply > demand) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
