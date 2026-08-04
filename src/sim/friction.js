/**
 * Parasitic losses, expressed as mean effective pressures.
 *
 * Engine braking has two separate sources, and modelling only one made coast-down far
 * too slow. RUBBING friction rises with speed. PUMPING loss is the work the engine
 * does dragging air past a closed throttle — proportional to the vacuum it is pulling
 * (barometric minus MAP). On a closed throttle at high RPM the pumping term dominates,
 * which is exactly why a real engine drops revs so briskly.
 */

import { BARO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';

/**
 * Rubbing (mechanical) friction as a mean effective pressure.
 *
 * Rises with engine speed, and with valve spring load if stiffer springs are fitted.
 *
 * @param {number} rpm engine speed
 * @param {number} [springPa] extra FMEP from valve springs, Pa
 * @returns {number} rubbing FMEP, Pa
 */
export function rubbingFmepPa(rpm, springPa = 0) {
  const rpmShare = (1 - COEFF.SPRING_RPM_BIAS) + COEFF.SPRING_RPM_BIAS * (rpm / 7500);
  return COEFF.RUBBING_BASE_PA + rpm * COEFF.RUBBING_PER_RPM + springPa * rpmShare;
}

/**
 * Pumping loss: the work spent dragging air past a partly closed throttle.
 *
 * This is the vacuum the engine is fighting, and it dominates engine braking on
 * overrun.
 *
 * @param {number} mapKpa manifold absolute pressure, kPa
 * @returns {number} pumping FMEP, Pa
 */
export function pumpingFmepPa(mapKpa) {
  return Math.max(0, (BARO_KPA - mapKpa) * 1000);
}

/**
 * Total parasitic torque, used for the live engine's cranking drag.
 *
 * T = MEP × Vd / (4π) for a four-stroke.
 *
 * @param {number} rpm engine speed
 * @param {number} displacementL displacement, litres
 * @param {number} [mapKpa] manifold absolute pressure, kPa
 * @param {number} [springPa] extra FMEP from valve springs, Pa
 * @returns {number} friction torque, Nm
 */
export function frictionTorqueNm(rpm, displacementL, mapKpa = BARO_KPA, springPa = 0) {
  const fmep = rubbingFmepPa(rpm, springPa) + pumpingFmepPa(mapKpa);
  return (fmep * (displacementL / 1000)) / (4 * Math.PI);
}
